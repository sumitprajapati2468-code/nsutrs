import { socketAuth } from '../middleware/auth.js'
import User from '../models/User.js'
import EmergencyAlert from '../models/EmergencyAlert.js'
import { ChatMessage, ChatRoom } from '../models/Chat.js'
import { Reward } from '../models/Reward.js'

// Store connected users
const connectedUsers = new Map()
const userRooms = new Map()

export const handleSocketConnection = (io) => {
  // Authentication middleware
  io.use(socketAuth)

  io.on('connection', async (socket) => {
    console.log(`User ${socket.userId} connected`)

    try {
      // Update user online status
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastSeen: new Date()
      })

      // Store connected user
      connectedUsers.set(socket.userId, {
        socketId: socket.id,
        userId: socket.userId,
        email: socket.userEmail,
        connectedAt: new Date()
      })

      // Broadcast online status to relevant users
      socket.broadcast.emit('user-online', socket.userId)

      // Emit full online users list to all connected clients
      const onlineList = Array.from(connectedUsers.values()).map(u => ({ userId: u.userId, email: u.email }))
      io.emit('online-users', onlineList)

    } catch (error) {
      console.error('Socket connection error:', error)
    }

    // Join user to their personal room
    socket.on('join-user-room', (userId) => {
      if (userId === socket.userId) {
        socket.join(`user_${userId}`)
        console.log(`User ${userId} joined personal room`)
      }
    })

    // Location tracking
    socket.on('location-update', async (data) => {
      try {
        const { location, timestamp } = data

        if (!location || !location.latitude || !location.longitude) {
          return socket.emit('error', { message: 'Invalid location data' })
        }

        // Update user location in database
        await User.findByIdAndUpdate(socket.userId, {
          currentLocation: {
            type: 'Point',
            coordinates: [location.longitude, location.latitude],
            address: location.address,
            lastUpdated: new Date(timestamp)
          }
        })

        // Broadcast location to ride group if user is in one
        const userRooms = Array.from(socket.rooms)
        userRooms.forEach(room => {
          if (room.startsWith('ride_')) {
            socket.to(room).emit('location-update', {
              userId: socket.userId,
              location,
              timestamp
            })
          }
        })

        socket.emit('location-update-success', { timestamp })
      } catch (error) {
        console.error('Location update error:', error)
        socket.emit('error', { message: 'Failed to update location' })
      }
    })

    // Ride group management
    socket.on('join-ride-group', (groupId) => {
      socket.join(`ride_${groupId}`)
      socket.to(`ride_${groupId}`).emit('user-joined-ride', {
        userId: socket.userId,
        timestamp: new Date()
      })
      console.log(`User ${socket.userId} joined ride group ${groupId}`)
    })

    socket.on('leave-ride-group', (groupId) => {
      socket.leave(`ride_${groupId}`)
      socket.to(`ride_${groupId}`).emit('user-left-ride', {
        userId: socket.userId,
        timestamp: new Date()
      })
      console.log(`User ${socket.userId} left ride group ${groupId}`)
    })

    // Emergency alerts
    socket.on('emergency-alert', async (alertData) => {
      try {
        const { type, severity, location, description } = alertData

        // Create emergency alert
        const emergency = new EmergencyAlert({
          user: socket.userId,
          type,
          severity,
          location: {
            type: 'Point',
            coordinates: [location.longitude, location.latitude],
            address: location.address
          },
          description
        })

        await emergency.save()

        // Find nearby users (within 10km)
        const nearbyUsers = await User.findNearby(
          location.longitude,
          location.latitude,
          10000
        )

        // Notify nearby users
        nearbyUsers.forEach(user => {
          const userConnection = connectedUsers.get(user._id.toString())
          if (userConnection && user._id.toString() !== socket.userId) {
            io.to(userConnection.socketId).emit('emergency-alert', {
              alertId: emergency._id,
              type,
              severity,
              location,
              description,
              userId: socket.userId,
              distance: calculateDistance(
                location.latitude, location.longitude,
                user.currentLocation.coordinates[1],
                user.currentLocation.coordinates[0]
              )
            })
          }
        })

        // Schedule auto-resolve
        emergency.scheduleAutoResolve()

        socket.emit('emergency-alert-sent', {
          alertId: emergency._id,
          notifiedUsers: nearbyUsers.length
        })

        console.log(`Emergency alert sent by ${socket.userId}`)
      } catch (error) {
        console.error('Emergency alert error:', error)
        socket.emit('error', { message: 'Failed to send emergency alert' })
      }
    })

    // Emergency response
    socket.on('emergency-response', async (data) => {
      try {
        const { alertId, message, estimatedArrival } = data

        const alert = await EmergencyAlert.findById(alertId)
        if (!alert || alert.status !== 'active') {
          return socket.emit('error', { message: 'Emergency alert not found or not active' })
        }

        // Add responder
        alert.responders.push({
          user: socket.userId,
          message,
          estimatedArrival
        })

        if (alert.status === 'active') {
          alert.status = 'responded'
        }

        await alert.save()

        // Notify alert creator
        const alertCreatorConnection = connectedUsers.get(alert.user.toString())
        if (alertCreatorConnection) {
          io.to(alertCreatorConnection.socketId).emit('emergency-response', {
            alertId,
            responderId: socket.userId,
            message,
            estimatedArrival
          })
        }

        // Award points to responder
        const reward = new Reward({
          user: socket.userId,
          activityType: 'emergency_response',
          points: 50,
          description: 'Responded to emergency alert',
          relatedActivity: alertId,
          relatedModel: 'EmergencyAlert'
        })
        await reward.save()

        // Update user stats
        await User.findByIdAndUpdate(socket.userId, {
          $inc: { 
            'stats.helpCount': 1,
            'stats.rewardPoints': 50
          }
        })

        socket.emit('emergency-response-sent', { alertId, pointsEarned: 50 })
      } catch (error) {
        console.error('Emergency response error:', error)
        socket.emit('error', { message: 'Failed to send emergency response' })
      }
    })

    // Chat functionality
    socket.on('join-chat-room', async (roomId) => {
      try {
        const room = await ChatRoom.findById(roomId)
        if (!room) {
          return socket.emit('error', { message: 'Chat room not found' })
        }

        // Check if user is participant
        const isParticipant = room.participants.some(
          p => p.user.toString() === socket.userId
        )

        if (!isParticipant && !room.settings.allowNewMembers) {
          return socket.emit('error', { message: 'Not authorized to join this room' })
        }

        socket.join(`chat_${roomId}`)
        
        // Add user as participant if not already
        if (!isParticipant) {
          room.participants.push({ user: socket.userId })
          await room.save()
        }

        socket.emit('joined-chat-room', { roomId })
        socket.to(`chat_${roomId}`).emit('user-joined-chat', {
          userId: socket.userId,
          timestamp: new Date()
        })
      } catch (error) {
        console.error('Join chat room error:', error)
        socket.emit('error', { message: 'Failed to join chat room' })
      }
    })

    socket.on('send-message', async (data) => {
      try {
        const { roomId, message, messageType = 'text', media, location } = data

        // Validate room membership
        const room = await ChatRoom.findById(roomId)
        if (!room) {
          return socket.emit('error', { message: 'Chat room not found' })
        }

        const isParticipant = room.participants.some(
          p => p.user.toString() === socket.userId
        )

        if (!isParticipant) {
          return socket.emit('error', { message: 'Not authorized to send messages' })
        }

        // Create message
        const chatMessage = new ChatMessage({
          sender: socket.userId,
          room: roomId,
          message,
          messageType,
          media,
          location
        })

        await chatMessage.save()
        await chatMessage.populate('sender', 'name avatar')

        // Update room last activity and message
        room.lastMessage = chatMessage._id
        room.lastActivity = new Date()
        await room.save()

        // Broadcast message to room with a consistent payload shape
        io.to(`chat_${roomId}`).emit('new-message', {
          chatId: roomId,
          message: {
            _id: chatMessage._id,
            sender: chatMessage.sender,
            content: chatMessage.message,
            type: chatMessage.messageType,
            media: chatMessage.media,
            location: chatMessage.location,
            timestamp: chatMessage.createdAt
          }
        })

      } catch (error) {
        console.error('Send message error:', error)
        socket.emit('error', { message: 'Failed to send message' })
      }
    })

    // Battery alerts
    socket.on('battery-alert', async (data) => {
      try {
        const { batteryLevel, location } = data

        if (batteryLevel <= 20) {
          // Find nearby users
          const nearbyUsers = await User.findNearby(
            location.longitude,
            location.latitude,
            5000 // 5km radius
          )

          // Notify nearby users about low battery
          nearbyUsers.forEach(user => {
            const userConnection = connectedUsers.get(user._id.toString())
            if (userConnection && user._id.toString() !== socket.userId) {
              io.to(userConnection.socketId).emit('nearby-battery-alert', {
                userId: socket.userId,
                batteryLevel,
                location,
                timestamp: new Date()
              })
            }
          })

          socket.emit('battery-alert-sent', { notifiedUsers: nearbyUsers.length })
        }
      } catch (error) {
        console.error('Battery alert error:', error)
        socket.emit('error', { message: 'Failed to send battery alert' })
      }
    })

    // Voice call signaling
    socket.on('call-user', (data) => {
      const { targetUserId, offer, callType } = data
      const targetConnection = connectedUsers.get(targetUserId)
      
      if (targetConnection) {
        io.to(targetConnection.socketId).emit('incoming-call', {
          callerId: socket.userId,
          offer,
          callType
        })
      } else {
        socket.emit('call-failed', { reason: 'User not online' })
      }
    })

    socket.on('answer-call', (data) => {
      const { callerId, answer } = data
      const callerConnection = connectedUsers.get(callerId)
      
      if (callerConnection) {
        io.to(callerConnection.socketId).emit('call-answered', {
          answer,
          answererId: socket.userId
        })
      }
    })

    socket.on('ice-candidate', (data) => {
      const { targetUserId, candidate } = data
      const targetConnection = connectedUsers.get(targetUserId)
      
      if (targetConnection) {
        io.to(targetConnection.socketId).emit('ice-candidate', {
          candidate,
          senderId: socket.userId
        })
      }
    })

    socket.on('end-call', (data) => {
      const { targetUserId } = data
      const targetConnection = connectedUsers.get(targetUserId)
      
      if (targetConnection) {
        io.to(targetConnection.socketId).emit('call-ended', {
          endedBy: socket.userId
        })
      }
    })

    // Disconnect handling
    socket.on('disconnect', async () => {
      console.log(`User ${socket.userId} disconnected`)

      try {
        // Update user offline status
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date()
        })

        // Remove from connected users
        connectedUsers.delete(socket.userId)

        // Broadcast offline status
  socket.broadcast.emit('user-offline', socket.userId)
  const onlineList = Array.from(connectedUsers.values()).map(u => ({ userId: u.userId, email: u.email }))
  io.emit('online-users', onlineList)

        // Leave all rooms
        const rooms = Array.from(socket.rooms)
        rooms.forEach(room => {
          if (room.startsWith('ride_')) {
            socket.to(room).emit('user-left-ride', {
              userId: socket.userId,
              timestamp: new Date()
            })
          }
        })

      } catch (error) {
        console.error('Disconnect handling error:', error)
      }
    })
  })
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