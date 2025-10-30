import mongoose from 'mongoose'

const emergencyAlertSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  type: {
    type: String,
    enum: ['accident', 'breakdown', 'medical', 'battery', 'theft', 'other'],
    required: true
  },
  
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  location: {
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
  
  description: {
    type: String,
    maxlength: 500
  },
  
  status: {
    type: String,
    enum: ['active', 'responded', 'resolved', 'cancelled'],
    default: 'active'
  },
  
  responders: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: {
      type: Date,
      default: Date.now
    },
    message: String,
    estimatedArrival: Number // in minutes
  }],
  
  nearbyHospitals: [{
    name: String,
    address: String,
    phone: String,
    distance: Number, // in meters
    coordinates: [Number]
  }],
  
  autoResolved: {
    type: Boolean,
    default: false
  },
  
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
})

// Index for geospatial queries
emergencyAlertSchema.index({ location: '2dsphere' })
emergencyAlertSchema.index({ user: 1, createdAt: -1 })
emergencyAlertSchema.index({ status: 1, createdAt: -1 })

// Auto-resolve after 30 minutes if no response
emergencyAlertSchema.methods.scheduleAutoResolve = function() {
  setTimeout(async () => {
    if (this.status === 'active') {
      this.status = 'resolved'
      this.autoResolved = true
      this.resolvedAt = new Date()
      await this.save()
    }
  }, 30 * 60 * 1000) // 30 minutes
}

const EmergencyAlert = mongoose.model('EmergencyAlert', emergencyAlertSchema)

export default EmergencyAlert