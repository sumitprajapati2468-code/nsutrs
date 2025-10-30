import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret'

export const auth = async (req, res, next) => {
  try {
    let token

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1]
    }

    // Make sure token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token, authorization denied'
      })
    }

    try {
      // If DB is disconnected (demo mode), accept any bearer token and proceed
      if (mongoose.connection.readyState !== 1) {
        req.user = { id: 'demo-user-id', email: 'demo@ridersathi.com' }
        return next()
      }

      // Verify token in DB-backed mode
  const decoded = jwt.verify(token, JWT_SECRET)

      // Normal DB-backed auth
      const user = await User.findById(decoded.userId)
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Token is not valid - user not found'
        })
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        })
      }

      req.user = { id: user._id, email: user.email }
      next()
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid'
      })
    }
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error in authentication',
      error: error.message
    })
  }
}

// Socket authentication middleware
export const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token

    // Log handshake info for debugging (avoid printing full token)
    try {
      const authKeys = Object.keys(socket.handshake.auth || {})
      console.log('Socket handshake auth keys:', authKeys)
      console.log('Socket handshake origin:', socket.handshake.headers?.origin)
      if (token) {
        console.log('Socket handshake: token present (length):', token.length)
      } else {
        console.error('Socket auth: no token provided in handshake')
        return next(new Error('No token provided'))
      }
    } catch (e) {
      console.warn('Socket auth: error while logging handshake info', e.message)
    }

    // Demo mode: allow socket auth without DB
    if (mongoose.connection.readyState !== 1) {
      socket.userId = 'demo-user-id'
      socket.userEmail = 'demo@ridersathi.com'
      return next()
    }

    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (err) {
      console.error('Socket auth: JWT verification failed -', err.message)
      return next(new Error('Authentication failed'))
    }

    const user = await User.findById(decoded.userId)

    if (!user || !user.isActive) {
      console.error('Socket auth: user not found or inactive', { userId: decoded?.userId })
      return next(new Error('Authentication failed'))
    }

    socket.userId = user._id.toString()
    socket.userEmail = user.email
    next()
  } catch (error) {
    console.error('Socket auth unexpected error:', error)
    next(new Error('Authentication failed'))
  }
}

// Admin role check
export const adminAuth = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      })
    }

    next()
  } catch (error) {
    console.error('Admin auth error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error in authorization',
      error: error.message
    })
  }
}