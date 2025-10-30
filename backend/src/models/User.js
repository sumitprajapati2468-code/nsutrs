import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  phone: {
    type: String,
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  avatar: {
    type: String,
    default: null
  },
  
  // Rider specific fields
  bikeDetails: {
    make: String,
    model: String,
    year: Number,
    color: String,
    licensePlate: String
  },
  
  // Emergency contacts
  emergencyContacts: [{
    name: String,
    phone: String,
    relationship: String
  }],
  
  // Location preferences
  preferences: {
    shareLocation: {
      type: Boolean,
      default: true
    },
    emergencyAlerts: {
      type: Boolean,
      default: true
    },
    voiceAssistant: {
      type: Boolean,
      default: true
    },
    notifications: {
      type: Boolean,
      default: true
    }
    ,
    // Additional frontend-driven preferences
    groupInvites: {
      type: Boolean,
      default: true
    },
    rideRequests: {
      type: Boolean,
      default: true
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    }
  },
  
  // Current location
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    address: String,
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  
  // Stats
  stats: {
    totalRides: {
      type: Number,
      default: 0
    },
    totalDistance: {
      type: Number,
      default: 0
    },
    helpCount: {
      type: Number,
      default: 0
    },
    rewardPoints: {
      type: Number,
      default: 0
    }
  },
  
  // Status
  isOnline: {
    type: Boolean,
    default: false
  },
  isRiding: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
})

// Index for geospatial queries
userSchema.index({ currentLocation: '2dsphere' })

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next()
  }
  
  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

// Method to get public profile
userSchema.methods.getPublicProfile = function() {
  const user = this.toObject()
  delete user.password
  delete user.emergencyContacts
  return user
}

// Update last seen
userSchema.methods.updateLastSeen = function() {
  this.lastSeen = new Date()
  return this.save({ validateBeforeSave: false })
}

// Update location
userSchema.methods.updateLocation = function(longitude, latitude, address) {
  this.currentLocation = {
    type: 'Point',
    coordinates: [longitude, latitude],
    address: address || this.currentLocation.address,
    lastUpdated: new Date()
  }
  return this.save({ validateBeforeSave: false })
}

// Static method to find nearby users
userSchema.statics.findNearby = function(longitude, latitude, maxDistance = 10000, options = {}) {
  // options.includeOffline: if true, include users regardless of isOnline
  const includeOffline = options.includeOffline === true

  const query = {
    currentLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    }
  }

  if (!includeOffline) {
    query.isOnline = true
  }

  return this.find(query).select('-password -emergencyContacts')
}

const User = mongoose.model('User', userSchema)

export default User