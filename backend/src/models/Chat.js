import mongoose from 'mongoose'

const chatMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  room: {
    type: String,
    required: true
  },
  
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  
  messageType: {
    type: String,
    enum: ['text', 'image', 'location', 'voice', 'emergency'],
    default: 'text'
  },
  
  // For location messages
  location: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: [Number],
    address: String
  },
  
  // For media messages
  media: {
    url: String,
    type: String, // image/jpeg, audio/wav, etc.
    size: Number
  },
  
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  
  // Replies/threads
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage'
  },
  
  // Reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Read receipts
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Auto-delete for temporary messages
  expiresAt: Date,
  
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  deletedAt: Date
}, {
  timestamps: true
})

// Indexes
chatMessageSchema.index({ room: 1, createdAt: -1 })
chatMessageSchema.index({ sender: 1, createdAt: -1 })
chatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// TTL index for auto-deletion
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }) // 7 days

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema)

// Chat Room Schema
const chatRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  
  type: {
    type: String,
    enum: ['group', 'emergency', 'ride'],
    default: 'group'
  },
  
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastSeen: Date
  }],
  
  // For ride-specific chats
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride'
  },
  
  // For emergency chats
  emergencyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmergencyAlert'
  },
  
  settings: {
    isPrivate: {
      type: Boolean,
      default: false
    },
    allowNewMembers: {
      type: Boolean,
      default: true
    },
    maxParticipants: {
      type: Number,
      default: 50
    }
  },
  
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage'
  },
  
  lastActivity: {
    type: Date,
    default: Date.now
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
})

// Indexes
chatRoomSchema.index({ 'participants.user': 1 })
chatRoomSchema.index({ type: 1, isActive: 1 })
chatRoomSchema.index({ rideId: 1 })

const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema)

export { ChatMessage, ChatRoom }