import express from 'express'
import { auth } from '../middleware/auth.js'
import mongoose from 'mongoose'
import { Reward, Leaderboard, Achievement } from '../models/Reward.js'
import User from '../models/User.js'

const router = express.Router()

// @route   GET /api/rewards/my-rewards
// @desc    Get user's rewards
// @access  Private
router.get('/my-rewards', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, activityType } = req.query

    const query = { user: req.user.id, isActive: true }
    if (activityType) {
      query.activityType = activityType
    }

    const rewards = await Reward.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('relatedActivity')

    const totalRewards = await Reward.countDocuments(query)
    const totalPoints = await Reward.aggregate([
      { $match: { user: req.user.id, isActive: true } },
      { $group: { _id: null, total: { $sum: '$points' } } }
    ])

    res.json({
      success: true,
      rewards: rewards,
      totalPoints: totalPoints[0]?.total || 0,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRewards,
        pages: Math.ceil(totalRewards / limit)
      }
    })
  } catch (error) {
    console.error('My rewards error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rewards',
      error: error.message
    })
  }
})

// @route   GET /api/rewards/leaderboard
// @desc    Get leaderboard
// @access  Private
router.get('/leaderboard', auth, async (req, res) => {
  try {
    const { period = 'alltime', category = 'total_points', limit = 50 } = req.query

    // Demo mode fallback
    if (mongoose.connection.readyState !== 1) {
      const demo = [
        { user: { _id: 'demo-user-id', name: 'Demo Rider' }, score: 180 },
        { user: { _id: 'demo-2', name: 'Alex' }, score: 120 },
        { user: { _id: 'demo-3', name: 'Jordan' }, score: 95 },
        { user: { _id: 'demo-4', name: 'Sam' }, score: 60 },
        { user: { _id: 'demo-5', name: 'Taylor' }, score: 45 }
      ].slice(0, parseInt(limit))

      const userRank = demo.findIndex(e => e.user._id === (req.user?.id || 'demo-user-id')) + 1

      return res.json({
        success: true,
        leaderboard: demo,
        userRank: userRank || null,
        period,
        category
      })
    }

    // Get or create current period leaderboard
    const leaderboard = await getLeaderboard(period, category, parseInt(limit))

    // Find current user's rank
    const userRank = leaderboard.findIndex(entry => 
      entry.user._id.toString() === req.user.id
    ) + 1

    res.json({
      success: true,
      leaderboard: leaderboard,
      userRank: userRank || null,
      period: period,
      category: category
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leaderboard',
      error: error.message
    })
  }
})

// @route   POST /api/rewards/claim
// @desc    Claim reward points for activity
// @access  Private
router.post('/claim', auth, async (req, res) => {
  try {
    const { activityType, points, description, relatedActivity, relatedModel } = req.body

    if (!activityType || !points || !description) {
      return res.status(400).json({
        success: false,
        message: 'Activity type, points, and description are required'
      })
    }

    // Validate points based on activity type
    const maxPoints = getMaxPointsForActivity(activityType)
    if (points > maxPoints) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${maxPoints} points allowed for ${activityType}`
      })
    }

    // Check for duplicate claims (if relatedActivity provided)
    if (relatedActivity) {
      const existingReward = await Reward.findOne({
        user: req.user.id,
        activityType,
        relatedActivity
      })

      if (existingReward) {
        return res.status(400).json({
          success: false,
          message: 'Reward already claimed for this activity'
        })
      }
    }

    // Create reward
    const reward = new Reward({
      user: req.user.id,
      activityType,
      points,
      description,
      relatedActivity,
      relatedModel
    })

    await reward.save()

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { 'stats.rewardPoints': points }
    })

    // Update leaderboards
    await updateUserLeaderboards(req.user.id, points, activityType)

    // Check for achievements
    await checkAndUpdateAchievements(req.user.id, activityType, points)

    res.json({
      success: true,
      message: 'Reward claimed successfully',
      reward: reward,
      pointsEarned: points
    })
  } catch (error) {
    console.error('Claim reward error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to claim reward',
      error: error.message
    })
  }
})

// @route   GET /api/rewards/achievements
// @desc    Get user's achievements
// @access  Private
router.get('/achievements', auth, async (req, res) => {
  try {
    const { category, completed } = req.query

    const query = { user: req.user.id }
    if (category) {
      query.category = category
    }
    if (completed !== undefined) {
      query.isCompleted = completed === 'true'
    }

    const achievements = await Achievement.find(query)
      .sort({ isCompleted: -1, completedAt: -1, createdAt: -1 })

    const stats = await Achievement.aggregate([
      { $match: { user: req.user.id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: ['$isCompleted', 1, 0] } },
          totalPoints: { $sum: '$rewardPoints' }
        }
      }
    ])

    res.json({
      success: true,
      achievements: achievements,
      stats: stats[0] || { total: 0, completed: 0, totalPoints: 0 }
    })
  } catch (error) {
    console.error('Achievements error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch achievements',
      error: error.message
    })
  }
})

// @route   GET /api/rewards/activity-points
// @desc    Get points structure for different activities
// @access  Private
router.get('/activity-points', auth, async (req, res) => {
  try {
    const activityPoints = {
      emergency_response: { base: 50, max: 100, description: 'Responding to emergency alerts' },
      breakdown_help: { base: 30, max: 50, description: 'Helping with vehicle breakdowns' },
      route_sharing: { base: 10, max: 20, description: 'Sharing useful routes' },
      safety_report: { base: 15, max: 30, description: 'Reporting safety hazards' },
      community_help: { base: 20, max: 40, description: 'General community assistance' },
      ride_completion: { base: 5, max: 10, description: 'Completing rides safely' },
      daily_login: { base: 2, max: 5, description: 'Daily app usage' },
      profile_completion: { base: 25, max: 25, description: 'Completing profile setup' },
      referral: { base: 100, max: 100, description: 'Referring new users' },
      eco_riding: { base: 15, max: 30, description: 'Eco-friendly riding practices' },
      group_ride_leader: { base: 40, max: 60, description: 'Leading group rides' },
      first_aid_certified: { base: 200, max: 200, description: 'First aid certification' }
    }

    res.json({
      success: true,
      activityPoints: activityPoints
    })
  } catch (error) {
    console.error('Activity points error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity points',
      error: error.message
    })
  }
})

// @route   POST /api/rewards/redeem
// @desc    Redeem points for rewards
// @access  Private
router.post('/redeem', auth, async (req, res) => {
  try {
    const { itemId, pointsCost } = req.body

    // Get user's current points
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    if (user.stats.rewardPoints < pointsCost) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient points for redemption'
      })
    }

    // Deduct points
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { 'stats.rewardPoints': -pointsCost }
    })

    // Create redemption record
    const redemption = new Reward({
      user: req.user.id,
      activityType: 'redemption',
      points: -pointsCost,
      description: `Redeemed ${itemId}`,
      relatedActivity: itemId
    })

    await redemption.save()

    res.json({
      success: true,
      message: 'Points redeemed successfully',
      pointsDeducted: pointsCost,
      remainingPoints: user.stats.rewardPoints - pointsCost
    })
  } catch (error) {
    console.error('Redeem error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to redeem points',
      error: error.message
    })
  }
})

// Helper functions
async function getLeaderboard(period, category, limit) {
  const { startDate, endDate } = getPeriodDates(period)
  
  let pipeline = []
  
  if (category === 'total_points') {
    pipeline = [
      {
        $match: {
          isActive: true,
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$user',
          totalPoints: { $sum: '$points' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          user: {
            _id: '$user._id',
            name: '$user.name',
            avatar: '$user.avatar'
          },
          score: '$totalPoints'
        }
      },
      {
        $sort: { score: -1 }
      },
      {
        $limit: limit
      }
    ]
  } else if (category === 'emergency_responses') {
    pipeline = [
      {
        $match: {
          activityType: 'emergency_response',
          isActive: true,
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$user',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          user: {
            _id: '$user._id',
            name: '$user.name',
            avatar: '$user.avatar'
          },
          score: '$count'
        }
      },
      {
        $sort: { score: -1 }
      },
      {
        $limit: limit
      }
    ]
  }
  
  return await Reward.aggregate(pipeline)
}

function getPeriodDates(period) {
  const now = new Date()
  let startDate, endDate = now
  
  switch (period) {
    case 'daily':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      break
    case 'weekly':
      const startOfWeek = new Date(now)
      startOfWeek.setDate(now.getDate() - now.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      startDate = startOfWeek
      break
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1)
      break
    default: // alltime
      startDate = new Date(0)
  }
  
  return { startDate, endDate }
}

function getMaxPointsForActivity(activityType) {
  const maxPoints = {
    emergency_response: 100,
    breakdown_help: 50,
    route_sharing: 20,
    safety_report: 30,
    community_help: 40,
    ride_completion: 10,
    daily_login: 5,
    profile_completion: 25,
    referral: 100,
    eco_riding: 30,
    group_ride_leader: 60,
    first_aid_certified: 200
  }
  
  return maxPoints[activityType] || 50
}

async function updateUserLeaderboards(userId, points, activityType) {
  const periods = ['daily', 'weekly', 'monthly', 'yearly', 'alltime']
  
  for (const period of periods) {
    const { startDate, endDate } = getPeriodDates(period)
    
    await Leaderboard.findOneAndUpdate(
      {
        user: userId,
        period: period,
        category: 'total_points',
        periodStart: { $lte: startDate },
        periodEnd: { $gte: endDate }
      },
      {
        $inc: { score: points },
        $set: { lastUpdated: new Date() }
      },
      {
        upsert: true,
        new: true
      }
    )
  }
}

async function checkAndUpdateAchievements(userId, activityType, points) {
  // Define achievements
  const achievements = [
    {
      id: 'first_responder',
      name: 'First Responder',
      description: 'Respond to your first emergency alert',
      category: 'safety',
      condition: activityType === 'emergency_response',
      target: 1,
      points: 25
    },
    {
      id: 'hero_responder',
      name: 'Hero Responder',
      description: 'Respond to 10 emergency alerts',
      category: 'safety',
      condition: activityType === 'emergency_response',
      target: 10,
      points: 100
    },
    {
      id: 'community_helper',
      name: 'Community Helper',
      description: 'Help 5 fellow riders',
      category: 'community',
      condition: ['emergency_response', 'breakdown_help', 'community_help'].includes(activityType),
      target: 5,
      points: 50
    }
  ]
  
  for (const achievementDef of achievements) {
    if (achievementDef.condition) {
      let achievement = await Achievement.findOne({
        user: userId,
        achievementId: achievementDef.id
      })
      
      if (!achievement) {
        achievement = new Achievement({
          user: userId,
          achievementId: achievementDef.id,
          name: achievementDef.name,
          description: achievementDef.description,
          category: achievementDef.category,
          progress: { current: 0, target: achievementDef.target },
          rewardPoints: achievementDef.points
        })
      }
      
      if (!achievement.isCompleted) {
        achievement.progress.current += 1
        
        if (achievement.progress.current >= achievement.progress.target) {
          achievement.isCompleted = true
          achievement.completedAt = new Date()
          
          // Award achievement points
          const reward = new Reward({
            user: userId,
            activityType: 'achievement',
            points: achievement.rewardPoints,
            description: `Achievement unlocked: ${achievement.name}`,
            relatedActivity: achievement._id,
            relatedModel: 'Achievement'
          })
          await reward.save()
          
          // Update user points
          await User.findByIdAndUpdate(userId, {
            $inc: { 'stats.rewardPoints': achievement.rewardPoints }
          })
        }
        
        await achievement.save()
      }
    }
  }
}

export default router