import express from 'express'
import mongoose from 'mongoose'
import { auth } from '../middleware/auth.js'
import { ChatMessage, ChatRoom } from '../models/Chat.js'
import User from '../models/User.js'

const router = express.Router()

// @route   POST /api/chat/rooms
// @desc    Create a new chat room
// @access  Private
router.post('/rooms', auth, async (req, res) => {
  try {
    const { name, type = 'group', participants, rideId, emergencyId } = req.body

    console.log('Create chat room payload:', { name, type, participants, rideId, emergencyId, userId: req.user && req.user.id })

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Room name is required'
      })
    }

    // Prepare participants array - ensure ObjectId casting, uniqueness and valid ids
    const creatorId = (() => {
      try {
        return mongoose.Types.ObjectId(req.user.id)
      } catch (e) {
        return req.user.id
      }
    })()

    let roomParticipants = [{ user: creatorId, role: 'admin' }]

    if (participants && Array.isArray(participants)) {
      const cleaned = participants
        .map(p => {
          try { return mongoose.Types.ObjectId(p) } catch (e) { return null }
        })
        .filter(Boolean)
        // remove the creator if present in array
        .filter(pId => pId.toString() !== creatorId.toString())
      
      // remove duplicates
      const unique = [...new Map(cleaned.map(id => [id.toString(), id])).values()]

      const additionalParticipants = unique.map(pId => ({ user: pId, role: 'member' }))
      console.log('Additional participants prepared:', additionalParticipants)

      roomParticipants = [...roomParticipants, ...additionalParticipants]
    }

    // Create chat room
    const chatRoom = new ChatRoom({
      name,
      type,
      participants: roomParticipants,
      rideId,
      emergencyId
    })

    await chatRoom.save()
    await chatRoom.populate('participants.user', 'name avatar')

    res.status(201).json({
      success: true,
      message: 'Chat room created successfully',
      room: chatRoom
    })
  } catch (error) {
    console.error('Create chat room error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create chat room',
      error: error.message
    })
  }
})

// @route   GET /api/chat/rooms
// @desc    Get user's chat rooms
// @access  Private
router.get('/rooms', auth, async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query

    // ensure user id is an ObjectId for the query to avoid type mismatches
    let userIdForQuery = req.user.id
    try {
      userIdForQuery = mongoose.Types.ObjectId(req.user.id)
    } catch (e) {
      // keep as-is
    }

    const query = {
      'participants.user': userIdForQuery,
      isActive: true
    }

    if (type) {
      query.type = type
    }

    const rooms = await ChatRoom.find(query)
      .sort({ lastActivity: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('participants.user', 'name avatar isOnline')
      .populate('lastMessage')

    const total = await ChatRoom.countDocuments(query)

    // Get unread message counts for each room
    const roomsWithUnreadCount = await Promise.all(
      rooms.map(async (room) => {
        const participant = room.participants.find(
          p => p.user._id.toString() === req.user.id
        )
        
        const unreadCount = await ChatMessage.countDocuments({
          room: room._id,
          createdAt: { $gt: participant.lastSeen || new Date(0) },
          sender: { $ne: req.user.id }
        })

        return {
          ...room.toObject(),
          unreadCount
        }
      })
    )

    res.json({
      success: true,
      rooms: roomsWithUnreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get chat rooms error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat rooms',
      error: error.message
    })
  }
})

// @route   GET /api/chat/rooms/:roomId/messages
// @desc    Get messages from a chat room
// @access  Private
router.get('/rooms/:roomId/messages', auth, async (req, res) => {
  try {
    const { roomId } = req.params
    const { page = 1, limit = 50, before } = req.query

    // Check if user is participant
    const room = await ChatRoom.findById(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      })
    }

    const isParticipant = room.participants.some(
      p => p.user.toString() === req.user.id
    )

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat room'
      })
    }

    // Build query
    const query = { room: roomId, isDeleted: false }
    if (before) {
      query.createdAt = { $lt: new Date(before) }
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('sender', 'name avatar')
      .populate('replyTo', 'message sender')

    // Update user's last seen timestamp
    await ChatRoom.findOneAndUpdate(
      { _id: roomId, 'participants.user': req.user.id },
      { 'participants.$.lastSeen': new Date() }
    )

    res.json({
      success: true,
      messages: messages.reverse(), // Return in chronological order
      room: {
        id: room._id,
        name: room.name,
        type: room.type,
        participantsCount: room.participants.length
      }
    })
  } catch (error) {
    console.error('Get messages error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    })
  }
})

// @route   POST /api/chat/rooms/:roomId/messages
// @desc    Send a message to a chat room
// @access  Private
router.post('/rooms/:roomId/messages', auth, async (req, res) => {
  try {
    const { roomId } = req.params
    const { message, messageType = 'text', media, location, replyTo } = req.body

    console.log('HTTP send-message:', { roomId, messageType, hasMessage: !!message, userId: req.user && req.user.id })

    if (!message && !media && !location) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      })
    }

    // Check if user is participant
    const room = await ChatRoom.findById(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      })
    }

    const isParticipant = room.participants.some(
      p => p.user.toString() === req.user.id
    )

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages to this room'
      })
    }

    // Create message
    const chatMessage = new ChatMessage({
      sender: req.user.id,
      room: roomId,
      message,
      messageType,
      media,
      location,
      replyTo
    })

    await chatMessage.save()
    await chatMessage.populate('sender', 'name avatar')

    // Update room's last message and activity
    room.lastMessage = chatMessage._id
    room.lastActivity = new Date()
    await room.save()

    res.status(201).json({
      success: true,
      message: chatMessage
    })
  } catch (error) {
    console.error('Send message error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    })
  }
})

// @route   PUT /api/chat/messages/:messageId
// @desc    Edit a message
// @access  Private
router.put('/messages/:messageId', auth, async (req, res) => {
  try {
    const { messageId } = req.params
    const { message } = req.body

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      })
    }

    const chatMessage = await ChatMessage.findById(messageId)
    if (!chatMessage) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      })
    }

    // Check if user is the sender
    if (chatMessage.sender.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to edit this message'
      })
    }

    // Check if message is not too old (24 hours)
    const hoursSinceCreated = (Date.now() - chatMessage.createdAt) / (1000 * 60 * 60)
    if (hoursSinceCreated > 24) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit messages older than 24 hours'
      })
    }

    chatMessage.message = message
    chatMessage.isEdited = true
    await chatMessage.save()

    res.json({
      success: true,
      message: chatMessage
    })
  } catch (error) {
    console.error('Edit message error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to edit message',
      error: error.message
    })
  }
})

// @route   DELETE /api/chat/messages/:messageId
// @desc    Delete a message
// @access  Private
router.delete('/messages/:messageId', auth, async (req, res) => {
  try {
    const { messageId } = req.params

    const chatMessage = await ChatMessage.findById(messageId)
    if (!chatMessage) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      })
    }

    // Check if user is the sender
    if (chatMessage.sender.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this message'
      })
    }

    chatMessage.isDeleted = true
    chatMessage.deletedAt = new Date()
    await chatMessage.save()

    res.json({
      success: true,
      message: 'Message deleted successfully'
    })
  } catch (error) {
    console.error('Delete message error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    })
  }
})

// @route   POST /api/chat/messages/:messageId/react
// @desc    Add reaction to a message
// @access  Private
router.post('/messages/:messageId/react', auth, async (req, res) => {
  try {
    const { messageId } = req.params
    const { emoji } = req.body

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji is required'
      })
    }

    const chatMessage = await ChatMessage.findById(messageId)
    if (!chatMessage) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      })
    }

    // Check if user already reacted with this emoji
    const existingReaction = chatMessage.reactions.find(
      r => r.user.toString() === req.user.id && r.emoji === emoji
    )

    if (existingReaction) {
      // Remove reaction
      chatMessage.reactions = chatMessage.reactions.filter(
        r => !(r.user.toString() === req.user.id && r.emoji === emoji)
      )
    } else {
      // Add reaction
      chatMessage.reactions.push({
        user: req.user.id,
        emoji,
        timestamp: new Date()
      })
    }

    await chatMessage.save()

    res.json({
      success: true,
      message: 'Reaction updated successfully',
      reactions: chatMessage.reactions
    })
  } catch (error) {
    console.error('React to message error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update reaction',
      error: error.message
    })
  }
})

// @route   POST /api/chat/rooms/:roomId/join
// @desc    Join a chat room
// @access  Private
router.post('/rooms/:roomId/join', auth, async (req, res) => {
  try {
    const { roomId } = req.params

    const room = await ChatRoom.findById(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      })
    }

    // Check if room allows new members
    if (!room.settings.allowNewMembers) {
      return res.status(403).json({
        success: false,
        message: 'This room does not allow new members'
      })
    }

    // Check if already a participant
    const isParticipant = room.participants.some(
      p => p.user.toString() === req.user.id
    )

    if (isParticipant) {
      return res.status(400).json({
        success: false,
        message: 'Already a member of this room'
      })
    }

    // Check participant limit
    if (room.participants.length >= room.settings.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Room has reached maximum participant limit'
      })
    }

    // Add user as participant
    room.participants.push({
      user: req.user.id,
      role: 'member',
      joinedAt: new Date()
    })

    await room.save()

    res.json({
      success: true,
      message: 'Joined room successfully'
    })
  } catch (error) {
    console.error('Join room error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to join room',
      error: error.message
    })
  }
})

// @route   POST /api/chat/rooms/:roomId/add
// @desc    Add participants to a chat room (admin only)
// @access  Private
router.post('/rooms/:roomId/add', auth, async (req, res) => {
  try {
    const { roomId } = req.params
    const { participants } = req.body // array of user ids

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, message: 'Participants array is required' })
    }

    const room = await ChatRoom.findById(roomId)
    if (!room) return res.status(404).json({ success: false, message: 'Chat room not found' })

    // only admins (or moderators) may add participants
    const requesterPart = room.participants.find(p => p.user.toString() === req.user.id)
    if (!requesterPart || (requesterPart.role !== 'admin' && requesterPart.role !== 'moderator')) {
      return res.status(403).json({ success: false, message: 'Only admins or moderators can add participants' })
    }

    // prepare ids, cast to ObjectId where possible and dedupe
    const cleaned = participants
      .map(p => {
        try { return mongoose.Types.ObjectId(p) } catch (e) { return null }
      })
      .filter(Boolean)
      .map(id => id.toString())

    const existingIds = room.participants.map(p => p.user.toString())
    const toAdd = cleaned.filter(id => !existingIds.includes(id))

    toAdd.forEach(id => {
      room.participants.push({ user: id, role: 'member', joinedAt: new Date() })
    })

    await room.save()
    await room.populate('participants.user', 'name avatar')

    res.json({ success: true, message: 'Participants added', participants: room.participants })
  } catch (error) {
    console.error('Add participants error:', error)
    res.status(500).json({ success: false, message: 'Failed to add participants', error: error.message })
  }
})

// @route   POST /api/chat/rooms/:roomId/leave
// @desc    Leave a chat room
// @access  Private
router.post('/rooms/:roomId/leave', auth, async (req, res) => {
  try {
    const { roomId } = req.params

    const room = await ChatRoom.findById(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      })
    }

    // Remove user from participants
    room.participants = room.participants.filter(
      p => p.user.toString() !== req.user.id
    )

    // If no participants left, deactivate room
    if (room.participants.length === 0) {
      room.isActive = false
    }

    await room.save()

    res.json({
      success: true,
      message: 'Left room successfully'
    })
  } catch (error) {
    console.error('Leave room error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to leave room',
      error: error.message
    })
  }
})

// @route   GET /api/chat/search
// @desc    Search messages
// @access  Private
router.get('/search', auth, async (req, res) => {
  try {
    const { query, roomId, messageType, limit = 20 } = req.query

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      })
    }

    // Get user's accessible rooms
    const userRooms = await ChatRoom.find({
      'participants.user': req.user.id,
      isActive: true
    }).select('_id')

    const roomIds = userRooms.map(room => room._id)

    // Build search query
    const searchQuery = {
      room: roomId ? roomId : { $in: roomIds },
      message: { $regex: query, $options: 'i' },
      isDeleted: false
    }

    if (messageType) {
      searchQuery.messageType = messageType
    }

    const messages = await ChatMessage.find(searchQuery)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('sender', 'name avatar')
      .populate('room', 'name type')

    res.json({
      success: true,
      messages: messages,
      count: messages.length
    })
  } catch (error) {
    console.error('Search messages error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to search messages',
      error: error.message
    })
  }
})

export default router