import mongoose from 'mongoose'

const rideSchema = new mongoose.Schema({
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  startLocation: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: String
  },
  
  endLocation: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: [Number],
    address: String
  },
  
  currentLocation: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: [Number],
    address: String,
    lastUpdated: Date
  },
  
  route: {
    waypoints: [{
      coordinates: [Number],
      timestamp: Date,
      speed: Number, // km/h
      heading: Number // degrees
    }],
    totalDistance: Number, // in meters
    estimatedDuration: Number, // in seconds
    actualDuration: Number
  },
  
  status: {
    type: String,
    enum: ['planning', 'active', 'paused', 'completed', 'cancelled'],
    default: 'planning'
  },
  
  rideType: {
    type: String,
    enum: ['solo', 'group'],
    default: 'solo'
  },
  
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideGroup'
  },
  
  // Ride metrics
  metrics: {
    averageSpeed: Number,
    maxSpeed: Number,
    fuelConsumed: Number,
    co2Saved: Number,
    calories: Number
  },
  
  // Weather conditions during ride
  weatherConditions: [{
    timestamp: Date,
    temperature: Number,
    humidity: Number,
    windSpeed: Number,
    conditions: String,
    visibility: Number
  }],
  
  startTime: Date,
  endTime: Date,
  
  // Safety features
  emergencyAlerts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmergencyAlert'
  }],
  
  batteryAlerts: [{
    level: Number,
    timestamp: Date,
    location: {
      type: [Number]
    }
  }],
  
  notes: String
}, {
  timestamps: true
})

// Indexes
rideSchema.index({ rider: 1, createdAt: -1 })
rideSchema.index({ status: 1 })
rideSchema.index({ startLocation: '2dsphere' })
rideSchema.index({ endLocation: '2dsphere' })

// Methods
rideSchema.methods.calculateStats = function() {
  if (this.route.waypoints.length < 2) return
  
  let totalDistance = 0
  let speeds = []
  
  for (let i = 1; i < this.route.waypoints.length; i++) {
    const prev = this.route.waypoints[i - 1]
    const curr = this.route.waypoints[i]
    
    // Calculate distance using Haversine formula
    const distance = this.calculateDistance(
      prev.coordinates[1], prev.coordinates[0],
      curr.coordinates[1], curr.coordinates[0]
    )
    
    totalDistance += distance
    
    if (curr.speed) {
      speeds.push(curr.speed)
    }
  }
  
  this.route.totalDistance = totalDistance
  this.metrics.averageSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b) / speeds.length : 0
  this.metrics.maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0
}

rideSchema.methods.calculateDistance = function(lat1, lon1, lat2, lon2) {
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

const Ride = mongoose.model('Ride', rideSchema)

export default Ride