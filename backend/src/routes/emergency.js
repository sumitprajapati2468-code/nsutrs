import express from 'express'
import axios from 'axios'
import { auth } from '../middleware/auth.js'
import mongoose from 'mongoose'
import EmergencyAlert from '../models/EmergencyAlert.js'
import User from '../models/User.js'
import { Reward } from '../models/Reward.js'

// Notification helper: tries Twilio if configured, otherwise logs/simulates
async function notifyContacts(alert) {
  try {
    const userDoc = await User.findById(alert.user).select('name phone emergencyContacts emergencyContact')
    const contacts = []
    if (userDoc) {
      if (Array.isArray(userDoc.emergencyContacts) && userDoc.emergencyContacts.length) {
        userDoc.emergencyContacts.forEach(c => { if (c.phone) contacts.push(c.phone) })
      }
      if (userDoc.emergencyContact && typeof userDoc.emergencyContact === 'string') {
        contacts.push(userDoc.emergencyContact)
      }
    }

    const message = `EMERGENCY ALERT:\nType: ${alert.type}\nLocation: ${alert.location?.coordinates ? `${alert.location.coordinates[1]},${alert.location.coordinates[0]}` : 'unknown'}\nMessage: Immediate help needed.`

    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioToken = process.env.TWILIO_AUTH_TOKEN
    const twilioFrom = process.env.TWILIO_FROM
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM

    // Choose service number based on type
    const serviceMap = {
      accident: process.env.ACCIDENT_SERVICE_NUMBER || '1033',
      breakdown: process.env.BREAKDOWN_SERVICE_NUMBER || process.env.TOWING_NUMBER || '',
      medical: process.env.MEDICAL_SERVICE_NUMBER || '108',
      fire: process.env.FIRE_SERVICE_NUMBER || '101'
    }

    const serviceNumber = serviceMap[alert.type] || ''

    if (twilioSid && twilioToken && twilioFrom) {
      // try dynamic import of twilio (may not be installed in dev)
      try {
        const twilioModule = await import('twilio')
        const client = twilioModule.default(twilioSid, twilioToken)

        // send SMS to contacts
        for (const to of contacts) {
          try {
            await client.messages.create({ body: message, from: twilioFrom, to })
          } catch (err) {
            console.error('Twilio SMS error for', to, err)
          }
          // send WhatsApp if configured and number looks valid
          if (whatsappFrom) {
            try {
              await client.messages.create({ body: message, from: whatsappFrom, to: `whatsapp:${to}` })
            } catch (err) {
              // not fatal
            }
          }
        }

        // place a call to the service number if available
        if (serviceNumber) {
          try {
            await client.calls.create({
              to: serviceNumber,
              from: twilioFrom,
              twiml: `<Response><Say voice="alice">Automated emergency alert. ${alert.type} reported. Please respond to the caller's location.</Say></Response>`
            })
          } catch (err) {
            console.error('Twilio call error to service number', serviceNumber, err)
          }
        }

        return
      } catch (err) {
        console.warn('Twilio module not available or failed to init, falling back to simulation', err)
      }
    }

    // Fallback: log the notification and simulate call attempt
    console.log('Simulated notification to contacts:', contacts, 'message:', message)
    if (serviceNumber) {
      console.log('Simulated call to service number:', serviceNumber)
    }
  } catch (error) {
    console.error('notifyContacts error:', error)
  }
}

const router = express.Router()

// @route   POST /api/emergency/alert
// @desc    Create emergency alert
// @access  Private
router.post('/alert', auth, async (req, res) => {
  try {
    const { type, severity, location, description } = req.body

    if (!type || !location || !location.latitude || !location.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Alert type and location are required'
      })
    }

    // Check if user has an active alert within last 5 minutes
    const recentAlert = await EmergencyAlert.findOne({
      user: req.user.id,
      status: 'active',
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
    })

    if (recentAlert) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active emergency alert'
      })
    }

    // Create emergency alert
    const alert = new EmergencyAlert({
      user: req.user.id,
      type,
      severity: severity || 'medium',
      location: {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
        address: location.address
      },
      description
    })

    // Find nearby hospitals if medical emergency
    if (type === 'medical' || type === 'accident') {
      try {
        const nearbyHospitals = await findNearbyHospitals(
          location.latitude,
          location.longitude
        )
        alert.nearbyHospitals = nearbyHospitals
      } catch (error) {
        console.error('Error finding hospitals:', error)
      }
    }

    await alert.save()

    // Schedule auto-resolve
    alert.scheduleAutoResolve()

    // Fire-and-forget: notify user's emergency contacts and nearby services (Twilio if configured)
    ;(async () => {
      try {
        await notifyContacts(alert)
      } catch (err) {
        console.error('Failed to notify contacts:', err)
      }
    })()

    res.status(201).json({
      success: true,
      message: 'Emergency alert created successfully',
      alert: {
        id: alert._id,
        type: alert.type,
        severity: alert.severity,
        location: alert.location,
        description: alert.description,
        nearbyHospitals: alert.nearbyHospitals,
        createdAt: alert.createdAt
      }
    })
  } catch (error) {
    console.error('Emergency alert error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create emergency alert',
      error: error.message
    })
  }
})

// @route   POST /api/emergency/respond/:alertId
// @desc    Respond to emergency alert
// @access  Private
router.post('/respond/:alertId', auth, async (req, res) => {
  try {
    const { alertId } = req.params
    const { message, estimatedArrival } = req.body

    const alert = await EmergencyAlert.findById(alertId).populate('user', 'name phone')
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Emergency alert not found'
      })
    }

    if (alert.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Emergency alert is no longer active'
      })
    }

    if (alert.user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot respond to your own emergency alert'
      })
    }

    // Check if user already responded
    const existingResponse = alert.responders.find(
      r => r.user.toString() === req.user.id
    )

    if (existingResponse) {
      return res.status(400).json({
        success: false,
        message: 'You have already responded to this alert'
      })
    }

    // Add responder
    alert.responders.push({
      user: req.user.id,
      message: message || 'On my way to help',
      estimatedArrival: estimatedArrival || 10
    })

    // Update status
    if (alert.status === 'active') {
      alert.status = 'responded'
    }

    await alert.save()

    // Award points to responder
    const reward = new Reward({
      user: req.user.id,
      activityType: 'emergency_response',
      points: 50,
      description: `Responded to ${alert.type} emergency`,
      relatedActivity: alert._id,
      relatedModel: 'EmergencyAlert'
    })
    await reward.save()

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { 
        'stats.helpCount': 1,
        'stats.rewardPoints': 50
      }
    })

    res.json({
      success: true,
      message: 'Response sent successfully',
      pointsEarned: 50,
      alert: {
        id: alert._id,
        status: alert.status,
        respondersCount: alert.responders.length
      }
    })
  } catch (error) {
    console.error('Emergency response error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to send response',
      error: error.message
    })
  }
})

// @route   PUT /api/emergency/resolve/:alertId
// @desc    Resolve emergency alert
// @access  Private
router.put('/resolve/:alertId', auth, async (req, res) => {
  try {
    const { alertId } = req.params
    const { resolvedBy } = req.body

    const alert = await EmergencyAlert.findById(alertId)
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Emergency alert not found'
      })
    }

    // Only alert creator or responders can resolve
    const canResolve = alert.user.toString() === req.user.id ||
                      alert.responders.some(r => r.user.toString() === req.user.id)

    if (!canResolve) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to resolve this alert'
      })
    }

    if (alert.status === 'resolved') {
      return res.status(400).json({
        success: false,
        message: 'Alert is already resolved'
      })
    }

    // Resolve alert
    alert.status = 'resolved'
    alert.resolvedAt = new Date()
    alert.resolvedBy = req.user.id

    await alert.save()

    res.json({
      success: true,
      message: 'Emergency alert resolved successfully',
      alert: {
        id: alert._id,
        status: alert.status,
        resolvedAt: alert.resolvedAt
      }
    })
  } catch (error) {
    console.error('Emergency resolve error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to resolve emergency alert',
      error: error.message
    })
  }
})

// @route   GET /api/emergency/nearby
// @desc    Get nearby emergency alerts
// @access  Private
router.get('/nearby', auth, async (req, res) => {
  try {
    const { latitude, longitude, radius = 10000 } = req.query

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location coordinates are required'
      })
    }

    // Demo mode: return empty list (or sample alerts) without DB
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, alerts: [], count: 0 })
    }

    const alerts = await EmergencyAlert.find({
      status: 'active',
      user: { $ne: req.user.id }, // Exclude own alerts
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(20)

    const alertsWithDistance = alerts.map(alert => {
      const distance = calculateDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        alert.location.coordinates[1],
        alert.location.coordinates[0]
      )

      return {
        id: alert._id,
        type: alert.type,
        severity: alert.severity,
        location: alert.location,
        description: alert.description,
        user: alert.user,
        respondersCount: alert.responders.length,
        distance: Math.round(distance),
        createdAt: alert.createdAt
      }
    })

    res.json({
      success: true,
      alerts: alertsWithDistance,
      count: alertsWithDistance.length
    })
  } catch (error) {
    console.error('Nearby alerts error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nearby alerts',
      error: error.message
    })
  }
})

// @route   GET /api/emergency/nearby-medical
// @desc    Find nearby hospitals and medical facilities
// @access  Private
router.get('/nearby-medical', auth, async (req, res) => {
  try {
    const { latitude, longitude, radius = 20000 } = req.query

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location coordinates are required'
      })
    }

    const medicalFacilities = await findNearbyHospitals(
      parseFloat(latitude),
      parseFloat(longitude),
      parseInt(radius)
    )

    res.json({
      success: true,
      facilities: medicalFacilities,
      count: medicalFacilities.length
    })
  } catch (error) {
    console.error('Medical facilities error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medical facilities',
      error: error.message
    })
  }
})

// @route   GET /api/emergency/my-alerts
// @desc    Get user's emergency alerts
// @access  Private
router.get('/my-alerts', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query

    const query = { user: req.user.id }
    if (status) {
      query.status = status
    }

    const alerts = await EmergencyAlert.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('responders.user', 'name avatar phone')
      .populate('resolvedBy', 'name')

    const total = await EmergencyAlert.countDocuments(query)

    res.json({
      success: true,
      alerts: alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('My alerts error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your alerts',
      error: error.message
    })
  }
})

// @route   GET /api/emergency/statistics
// @desc    Get emergency statistics
// @access  Private
router.get('/statistics', auth, async (req, res) => {
  try {
    const userId = req.user.id

    // User's alert statistics
    const myAlerts = await EmergencyAlert.countDocuments({ user: userId })
    const myActiveAlerts = await EmergencyAlert.countDocuments({ 
      user: userId, 
      status: 'active' 
    })
    const myResolvedAlerts = await EmergencyAlert.countDocuments({ 
      user: userId, 
      status: 'resolved' 
    })

    // Response statistics
    const myResponses = await EmergencyAlert.countDocuments({
      'responders.user': userId
    })

    // Recent activity
    const recentAlerts = await EmergencyAlert.find({
      $or: [
        { user: userId },
        { 'responders.user': userId }
      ]
    }).sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name')
      .select('type severity status createdAt user')

    // System-wide statistics (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const systemStats = await EmergencyAlert.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          averageResponseTime: { 
            $avg: { 
              $subtract: [
                { $arrayElemAt: ['$responders.respondedAt', 0] },
                '$createdAt'
              ]
            }
          }
        }
      }
    ])

    res.json({
      success: true,
      statistics: {
        personal: {
          totalAlerts: myAlerts,
          activeAlerts: myActiveAlerts,
          resolvedAlerts: myResolvedAlerts,
          responsesGiven: myResponses
        },
        recent: recentAlerts,
        system: systemStats
      }
    })
  } catch (error) {
    console.error('Emergency statistics error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    })
  }
})

// Helper function to find nearby hospitals using Overpass API
async function findNearbyHospitals(latitude, longitude, radius = 20000) {
  try {
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node[amenity=hospital](around:${radius},${latitude},${longitude});
        way[amenity=hospital](around:${radius},${latitude},${longitude});
        node[amenity=clinic](around:${radius},${latitude},${longitude});
        node[amenity=pharmacy](around:${radius},${latitude},${longitude});
        node[healthcare=hospital](around:${radius},${latitude},${longitude});
      );
      out geom;
    `

    const overpassUrl = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter'
    
    const response = await axios.post(overpassUrl, overpassQuery, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 30000
    })

    const facilities = response.data.elements.map(element => {
      const tags = element.tags || {}
      let coordinates = []
      
      if (element.lat && element.lon) {
        coordinates = [element.lon, element.lat]
      } else if (element.center) {
        coordinates = [element.center.lon, element.center.lat]
      }

      const distance = calculateDistance(
        latitude,
        longitude,
        coordinates[1],
        coordinates[0]
      )

      return {
        id: element.id,
        name: tags.name || tags.brand || 'Medical Facility',
        type: tags.amenity || tags.healthcare || 'hospital',
        address: tags['addr:full'] || `${tags['addr:housenumber'] || ''} ${tags['addr:street'] || ''}`.trim(),
        phone: tags.phone,
        emergency: tags.emergency,
        website: tags.website,
        coordinates: coordinates,
        distance: Math.round(distance)
      }
    }).filter(facility => facility.coordinates.length === 2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10) // Limit to 10 closest facilities

    return facilities
  } catch (error) {
    console.error('Error finding hospitals:', error)
    return []
  }
}

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}

export default router