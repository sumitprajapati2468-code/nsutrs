import mongoose from 'mongoose'

const rewardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  activityType: {
    type: String,
    enum: [
      'emergency_response',
      'breakdown_help',
      'route_sharing',
      'safety_report',
      'community_help',
      'ride_completion',
      'daily_login',
      'profile_completion',
      'referral',
      'eco_riding',
      'group_ride_leader',
      'first_aid_certified'
    ],
    required: true
  },
  
  points: {
    type: Number,
    required: true,
    min: 0
  },
  
  description: {
    type: String,
    required: true,
    maxlength: 200
  },
  
  // Reference to the activity that earned the reward
  relatedActivity: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  
  relatedModel: {
    type: String,
    enum: ['EmergencyAlert', 'Ride', 'User', 'ChatMessage']
  },
  
  // Badge information
  badge: {
    name: String,
    icon: String,
    color: String,
    tier: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
      default: 'bronze'
    }
  },
  
  // Multiplier for special events
  multiplier: {
    type: Number,
    default: 1
  },
  
  // Expiry for temporary rewards
  expiresAt: Date,
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
})

// Indexes
rewardSchema.index({ user: 1, createdAt: -1 })
rewardSchema.index({ activityType: 1 })
rewardSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Leaderboard Schema
const leaderboardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'alltime'],
    required: true
  },
  
  category: {
    type: String,
    enum: ['total_points', 'emergency_responses', 'rides_completed', 'distance_covered', 'eco_points'],
    default: 'total_points'
  },
  
  score: {
    type: Number,
    required: true,
    default: 0
  },
  
  rank: {
    type: Number,
    required: true
  },
  
  periodStart: {
    type: Date,
    required: true
  },
  
  periodEnd: {
    type: Date,
    required: true
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// Indexes
leaderboardSchema.index({ period: 1, category: 1, rank: 1 })
leaderboardSchema.index({ user: 1, period: 1, category: 1 })
leaderboardSchema.index({ periodEnd: 1 })

// Achievement Schema
const achievementSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  achievementId: {
    type: String,
    required: true
  },
  
  name: {
    type: String,
    required: true
  },
  
  description: {
    type: String,
    required: true
  },
  
  icon: String,
  
  category: {
    type: String,
    enum: ['safety', 'community', 'riding', 'environmental', 'social'],
    required: true
  },
  
  tier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    default: 'bronze'
  },
  
  progress: {
    current: {
      type: Number,
      default: 0
    },
    target: {
      type: Number,
      required: true
    },
    unit: String // 'rides', 'km', 'responses', etc.
  },
  
  isCompleted: {
    type: Boolean,
    default: false
  },
  
  completedAt: Date,
  
  rewardPoints: {
    type: Number,
    default: 0
  },
  
  isPublic: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
})

// Indexes
achievementSchema.index({ user: 1, achievementId: 1 }, { unique: true })
achievementSchema.index({ user: 1, isCompleted: 1 })
achievementSchema.index({ category: 1, tier: 1 })

const Reward = mongoose.model('Reward', rewardSchema)
const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema)
const Achievement = mongoose.model('Achievement', achievementSchema)

export { Reward, Leaderboard, Achievement }