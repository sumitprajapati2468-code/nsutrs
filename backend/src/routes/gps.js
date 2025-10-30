import express from 'express'
import axios from 'axios'
import { auth } from '../middleware/auth.js'
import User from '../models/User.js'
import Ride from '../models/Ride.js'

const router = express.Router()

// @route   POST /api/gps/location
// @desc    Update user's current location
// @access  Private
router.post('/location', auth, async (req, res) => {
  try {
    const { latitude, longitude, address, accuracy } = req.body

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      })
    }

    // Update user location
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    await user.updateLocation(longitude, latitude, address)

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: {
        latitude,
        longitude,
        address,
        accuracy,
        timestamp: new Date()
      }
    })
  } catch (error) {
    console.error('Location update error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    })
  }
})

// @route   GET /api/gps/route
// @desc    Get route between two points using OSRM
// @access  Private
router.get('/route', auth, async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, profile = 'driving' } = req.query

    if (!startLat || !startLng || !endLat || !endLng) {
      return res.status(400).json({
        success: false,
        message: 'Start and end coordinates are required'
      })
    }

    // Use OSRM for routing
    const osrmUrl = process.env.OSRM_URL || 'http://router.project-osrm.org'
    const routeUrl = `${osrmUrl}/route/v1/${profile}/${startLng},${startLat};${endLng},${endLat}?steps=true&geometries=geojson&overview=full&annotations=true`

    const response = await axios.get(routeUrl)
    
    if (response.data.code !== 'Ok') {
      return res.status(400).json({
        success: false,
        message: 'Route not found'
      })
    }

    const route = response.data.routes[0]
    
    res.json({
      success: true,
      route: {
        distance: route.distance, // meters
        duration: route.duration, // seconds
        geometry: route.geometry,
        steps: route.legs[0].steps.map(step => ({
          instruction: step.maneuver.instruction,
          distance: step.distance,
          duration: step.duration,
          geometry: step.geometry
        }))
      }
    })
  } catch (error) {
    console.error('Route calculation error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to calculate route',
      error: error.message
    })
  }
})

// @route   POST /api/gps/start-ride
// @desc    Start a new ride
// @access  Private
router.post('/start-ride', auth, async (req, res) => {
  try {
    const { startLocation, endLocation, rideType = 'solo', groupId } = req.body

    if (!startLocation || !startLocation.latitude || !startLocation.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Start location is required'
      })
    }

    // Check if user already has an active ride
    const activeRide = await Ride.findOne({
      rider: req.user.id,
      status: { $in: ['planning', 'active', 'paused'] }
    })

    if (activeRide) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active ride'
      })
    }

    // Create new ride
    const ride = new Ride({
      rider: req.user.id,
      startLocation: {
        type: 'Point',
        coordinates: [startLocation.longitude, startLocation.latitude],
        address: startLocation.address
      },
      currentLocation: {
        type: 'Point',
        coordinates: [startLocation.longitude, startLocation.latitude],
        address: startLocation.address,
        lastUpdated: new Date()
      },
      rideType,
      groupId,
      status: 'active',
      startTime: new Date()
    })

    // Add end location if provided
    if (endLocation && endLocation.latitude && endLocation.longitude) {
      ride.endLocation = {
        type: 'Point',
        coordinates: [endLocation.longitude, endLocation.latitude],
        address: endLocation.address
      }

      // Calculate route
      try {
        const osrmUrl = process.env.OSRM_URL || 'http://router.project-osrm.org'
        const routeUrl = `${osrmUrl}/route/v1/driving/${startLocation.longitude},${startLocation.latitude};${endLocation.longitude},${endLocation.latitude}?overview=false`
        
        const routeResponse = await axios.get(routeUrl)
        if (routeResponse.data.code === 'Ok') {
          const routeData = routeResponse.data.routes[0]
          ride.route.totalDistance = routeData.distance
          ride.route.estimatedDuration = routeData.duration
        }
      } catch (routeError) {
        console.error('Route calculation error:', routeError)
        // Continue without route data
      }
    }

    await ride.save()

    // Update user status
    await User.findByIdAndUpdate(req.user.id, {
      isRiding: true,
      $inc: { 'stats.totalRides': 1 }
    })

    res.json({
      success: true,
      message: 'Ride started successfully',
      ride: ride
    })
  } catch (error) {
    console.error('Start ride error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to start ride',
      error: error.message
    })
  }
})

// @route   PUT /api/gps/update-ride/:rideId
// @desc    Update ride location and status
// @access  Private
router.put('/update-ride/:rideId', auth, async (req, res) => {
  try {
    const { rideId } = req.params
    const { location, speed, heading, status } = req.body

    const ride = await Ride.findOne({
      _id: rideId,
      rider: req.user.id,
      status: { $in: ['active', 'paused'] }
    })

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Active ride not found'
      })
    }

    // Update current location
    if (location && location.latitude && location.longitude) {
      ride.currentLocation = {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
        address: location.address,
        lastUpdated: new Date()
      }

      // Add waypoint
      ride.route.waypoints.push({
        coordinates: [location.longitude, location.latitude],
        timestamp: new Date(),
        speed: speed || 0,
        heading: heading || 0
      })
    }

    // Update status if provided
    if (status) {
      ride.status = status
      
      if (status === 'completed') {
        ride.endTime = new Date()
        ride.calculateStats()
        
        // Update user stats
        await User.findByIdAndUpdate(req.user.id, {
          isRiding: false,
          $inc: { 'stats.totalDistance': ride.route.totalDistance || 0 }
        })
      }
    }

    await ride.save()

    res.json({
      success: true,
      message: 'Ride updated successfully',
      ride: ride
    })
  } catch (error) {
    console.error('Update ride error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update ride',
      error: error.message
    })
  }
})

// @route   GET /api/gps/nearby-pois
// @desc    Get nearby points of interest using Overpass API
// @access  Private
router.get('/nearby-pois', auth, async (req, res) => {
  try {
    const { latitude, longitude, type = 'fuel', radius = 5000 } = req.query

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      })
    }

    // Define Overpass query based on type
    const queries = {
      fuel: '[amenity=fuel]',
      repair: '[shop=motorcycle_repair]|[shop=car_repair]',
      medical: '[amenity=hospital]|[amenity=pharmacy]|[amenity=clinic]',
      food: '[amenity=restaurant]|[amenity=fast_food]|[amenity=cafe]',
      parking: '[amenity=parking]',
      atm: '[amenity=atm]|[amenity=bank]'
    }

    const query = queries[type] || queries.fuel
    const radiusMeters = Math.min(parseInt(radius), 10000) // Max 10km

    const overpassQuery = `
      [out:json][timeout:25];
      (
        node${query}(around:${radiusMeters},${latitude},${longitude});
        way${query}(around:${radiusMeters},${latitude},${longitude});
        relation${query}(around:${radiusMeters},${latitude},${longitude});
      );
      out geom;
    `

    const overpassUrl = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter'
    
    const response = await axios.post(overpassUrl, overpassQuery, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 30000
    })

    const pois = response.data.elements.map(element => {
      const tags = element.tags || {}
      let coordinates = []
      
      if (element.lat && element.lon) {
        coordinates = [element.lon, element.lat]
      } else if (element.center) {
        coordinates = [element.center.lon, element.center.lat]
      }

      return {
        id: element.id,
        type: element.type,
        name: tags.name || tags.brand || 'Unknown',
        address: tags['addr:full'] || `${tags['addr:housenumber'] || ''} ${tags['addr:street'] || ''}`.trim(),
        phone: tags.phone,
        website: tags.website,
        openingHours: tags.opening_hours,
        coordinates: coordinates,
        distance: calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          coordinates[1],
          coordinates[0]
        )
      }
    }).filter(poi => poi.coordinates.length === 2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 20) // Limit to 20 results

    res.json({
      success: true,
      pois: pois,
      count: pois.length
    })
  } catch (error) {
    console.error('POI search error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nearby POIs',
      error: error.message
    })
  }
})

// @route   GET /api/gps/ride-history
// @desc    Get user's ride history
// @access  Private
router.get('/ride-history', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query

    const query = { rider: req.user.id }
    if (status) {
      query.status = status
    }

    const rides = await Ride.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-route.waypoints') // Exclude detailed waypoints for list view

    const total = await Ride.countDocuments(query)

    res.json({
      success: true,
      rides: rides,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Ride history error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ride history',
      error: error.message
    })
  }
})

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