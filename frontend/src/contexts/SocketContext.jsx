import React, { createContext, useContext, useEffect, useState } from 'react'
import io from 'socket.io-client'
import { useAuth } from './AuthContext'

const SocketContext = createContext()

export const useSocket = () => {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState([])
  const { user, token } = useAuth()

  const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

  useEffect(() => {
    if (token && user) {
      // Debug: ensure token presence and length before creating socket
      try {
        console.log('Initializing socket. token present:', !!token, 'token length:', token?.length)
      } catch (e) {
        // ignore
      }

      const newSocket = io(SOCKET_URL, {
        auth: {
          token
        }
      })

      newSocket.on('connect', () => {
        console.log('✅ Connected to server, socket id =', newSocket.id)
        setConnected(true)
        
        // Join user to their personal room
        newSocket.emit('join-user-room', user._id)
      })

      newSocket.on('disconnect', () => {
        console.log('Disconnected from server')
        setConnected(false)
      })

      // Server emits a list of online users when someone connects/disconnects
      newSocket.on('online-users', (users) => {
        // users is an array of { userId, email }
        setOnlineUsers(users || [])
      })

      // Also listen to single user online/offline events and mutate list
      newSocket.on('user-online', (userId) => {
        setOnlineUsers(prev => {
          if (prev.some(u => u.userId === userId)) return prev
          return [...prev, { userId }]
        })
      })

      newSocket.on('user-offline', (userId) => {
        setOnlineUsers(prev => prev.filter(u => u.userId !== userId))
      })

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error)
        setConnected(false)
      })

      setSocket(newSocket)

      return () => {
        newSocket.close()
      }
    } else {
      if (socket) {
        socket.close()
        setSocket(null)
        setConnected(false)
      }
    }
  }, [token, user, SOCKET_URL])

  // Location tracking functions
  const updateLocation = (location) => {
    if (socket && connected) {
      socket.emit('location-update', {
        userId: user._id,
        location,
        timestamp: Date.now()
      })
    }
  }

  const joinRideGroup = (groupId) => {
    if (socket && connected) {
      socket.emit('join-ride-group', groupId)
    }
  }

  const leaveRideGroup = (groupId) => {
    if (socket && connected) {
      socket.emit('leave-ride-group', groupId)
    }
  }

  // Emergency functions
  const sendEmergencyAlert = (alertData) => {
    if (socket && connected) {
      socket.emit('emergency-alert', {
        ...alertData,
        userId: user._id,
        timestamp: Date.now()
      })
    }
  }

  // Chat functions
  const sendMessage = (roomId, message) => {
    if (socket && connected) {
      socket.emit('send-message', {
        roomId,
        message,
        userId: user._id,
        timestamp: Date.now()
      })
    }
  }

  const joinChatRoom = (roomId) => {
    if (socket && connected) {
      socket.emit('join-chat-room', roomId)
    }
  }

  const leaveChatRoom = (roomId) => {
    if (socket && connected) {
      socket.emit('leave-chat-room', roomId)
    }
  }

  // Battery alert
  const sendBatteryAlert = (batteryLevel) => {
    if (socket && connected) {
      socket.emit('battery-alert', {
        userId: user._id,
        batteryLevel,
        timestamp: Date.now()
      })
    }
  }

  // Helper alert
  const sendHelperAlert = (helpData) => {
    if (socket && connected) {
      socket.emit('helper-alert', {
        ...helpData,
        helperId: user._id,
        timestamp: Date.now()
      })
    }
  }

  const value = {
    socket,
    connected,
    onlineUsers,
    updateLocation,
    joinRideGroup,
    leaveRideGroup,
    sendEmergencyAlert,
    sendMessage,
    joinChatRoom,
    leaveChatRoom,
    sendBatteryAlert,
    sendHelperAlert
  }

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}