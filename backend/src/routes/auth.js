import express from 'express'
import multer from 'multer'
import path from 'path'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import { auth } from '../middleware/auth.js'

const router = express.Router()

// Multer setup for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads', 'avatars'))
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    cb(null, `${base}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'))
    }
    cb(null, true)
  }
})

// Use a safe default secret in development if none is provided
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret'

// In-memory store for demo emergency contacts when DB is disconnected
const demoEmergencyContacts = new Map()

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  })
}

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, bikeDetails } = req.body

    // Ensure database is connected for real registrations
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is not connected. Registration is unavailable.'
      })
    }

    // Regular database mode
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      })
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      phone,
      bikeDetails
    })

    await user.save()

    // Generate token
    const token = generateToken(user._id)

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: user.getPublicProfile()
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    })
  }
})

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Require DB for real logins
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is not connected. Login is unavailable.'
      })
    }

    // Regular database mode
    const user = await User.findOne({ email }).select('+password')
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      })
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      })
    }

    // Validate password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      })
    }

    // Update user status
    user.isOnline = true
    await user.updateLastSeen()

    // Generate token
    const token = generateToken(user._id)

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: user.getPublicProfile()
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    })
  }
})

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      // Demo profile when DB disconnected
      return res.json({
        success: true,
        user: {
          _id: req.user.id || 'demo-user-id',
          id: req.user.id || 'demo-user-id',
          name: 'Demo Rider',
          email: 'demo@ridersathi.com',
          phone: '+1234567890',
          isActive: true,
          createdAt: new Date(),
          stats: { totalRides: 12, totalDistance: 24500, helpCount: 3, rewardPoints: 180 }
        }
      })
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    res.json({
      success: true,
      user: user.getPublicProfile()
    })
  } catch (error) {
    console.error('Profile fetch error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile',
      error: error.message
    })
  }
})

// @route   GET /api/auth/emergency-contacts
// @desc    Get user's emergency contacts
// @access  Private
router.get('/emergency-contacts', auth, async (req, res) => {
  try {
    // Demo mode: serve from in-memory map
    if (mongoose.connection.readyState !== 1) {
      const existing = demoEmergencyContacts.get(req.user.id) || [
        { name: 'Alice', phone: '+1234567890', relationship: 'Friend' },
        { name: 'Bob', phone: '+1987654321', relationship: 'Family' }
      ]
      demoEmergencyContacts.set(req.user.id, existing)
      return res.json({ success: true, contacts: existing })
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    return res.json({ success: true, contacts: user.emergencyContacts || [] })
  } catch (error) {
    console.error('Emergency contacts fetch error:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch contacts', error: error.message })
  }
})

// @route   POST /api/auth/emergency-contacts
// @desc    Add a new emergency contact
// @access  Private
router.post('/emergency-contacts', auth, async (req, res) => {
  try {
    const { name, phone, relationship } = req.body
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' })
    }

    // Demo mode: update in-memory list
    if (mongoose.connection.readyState !== 1) {
      const list = demoEmergencyContacts.get(req.user.id) || []
      list.push({ name, phone, relationship: relationship || 'Contact' })
      demoEmergencyContacts.set(req.user.id, list)
      return res.status(201).json({ success: true, contacts: list })
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    user.emergencyContacts = user.emergencyContacts || []
    user.emergencyContacts.push({ name, phone, relationship })
    await user.save()

    return res.status(201).json({ success: true, contacts: user.emergencyContacts })
  } catch (error) {
    console.error('Emergency contact add error:', error)
    res.status(500).json({ success: false, message: 'Failed to add contact', error: error.message })
  }
})

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
  try {
    const allowedUpdates = ['name', 'phone', 'bikeDetails', 'emergencyContacts', 'preferences']
    const updates = Object.keys(req.body)
    const isValidOperation = updates.every(update => allowedUpdates.includes(update))

    if (!isValidOperation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid updates'
      })
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    updates.forEach(update => {
      user[update] = req.body[update]
    })

    await user.save()

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.getPublicProfile()
    })
  } catch (error) {
    console.error('Profile update error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error updating profile',
      error: error.message
    })
  }
})

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (user) {
      user.isOnline = false
      user.isRiding = false
      await user.updateLastSeen()
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: error.message
    })
  }
})

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      })
    }

    const user = await User.findById(req.user.id).select('+password')
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword)
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      })
    }

    // Update password
    user.password = newPassword
    await user.save()

    res.json({
      success: true,
      message: 'Password changed successfully'
    })
  } catch (error) {
    console.error('Password change error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error changing password',
      error: error.message
    })
  }
})

// @route   PUT /api/auth/settings
// @desc    Update user settings/preferences
// @access  Private
router.put('/settings', auth, async (req, res) => {
  try {
    const { settings } = req.body

    if (!settings) {
      return res.status(400).json({ success: false, message: 'Settings are required' })
    }

    // Demo mode: store in in-memory map or return success when DB disconnected
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, message: 'Settings updated (demo mode)' })
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    // Map known frontend keys to stored preference fields
    const prefs = user.preferences || {}
    if (typeof settings.notifications !== 'undefined') prefs.notifications = !!settings.notifications
    if (typeof settings.locationSharing !== 'undefined') prefs.shareLocation = !!settings.locationSharing
    if (typeof settings.emergencyAlerts !== 'undefined') prefs.emergencyAlerts = !!settings.emergencyAlerts
    if (typeof settings.groupInvites !== 'undefined') prefs.groupInvites = !!settings.groupInvites
    if (typeof settings.rideRequests !== 'undefined') prefs.rideRequests = !!settings.rideRequests
    if (typeof settings.twoFactorEnabled !== 'undefined') prefs.twoFactorEnabled = !!settings.twoFactorEnabled

    user.preferences = prefs
    await user.save()

    res.json({ success: true, message: 'Settings updated successfully', preferences: user.preferences })
  } catch (error) {
    console.error('Settings update error:', error)
    res.status(500).json({ success: false, message: 'Failed to update settings', error: error.message })
  }
})

// @route   DELETE /api/auth/account
// @desc    Delete user account
// @access  Private
router.delete('/account', auth, async (req, res) => {
  try {
    // In demo mode, return success
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, message: 'Account deleted (demo mode)' })
    }

    // Remove user and any related data (minimal implementation)
    await User.findByIdAndDelete(req.user.id)

    res.json({ success: true, message: 'Account deleted successfully' })
  } catch (error) {
    console.error('Account deletion error:', error)
    res.status(500).json({ success: false, message: 'Failed to delete account', error: error.message })
  }
})

// @route   POST /api/auth/forgot-password
// @desc    Trigger forgot password flow (sends reset email in production)
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    // Always respond with a success message to avoid revealing account existence
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' })
    }

    // In demo mode or if DB not connected, return generic success
    if (mongoose.connection.readyState !== 1) {
      console.log(`Forgot password requested for (demo): ${email}`)
      return res.json({ success: true, message: 'If an account exists, a reset link has been sent to the provided email.' })
    }

    // Lookup user and (in a real app) issue a reset token + send email (omitted here)
    const user = await User.findOne({ email: email.toLowerCase() })
    if (user) {
      // TODO: generate reset token, persist it, and email the user.
      console.log(`Password reset requested for user id: ${user._id} (no email sent in this demo)`)
    }

    return res.json({ success: true, message: 'If an account exists, a reset link has been sent to the provided email.' })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ success: false, message: 'Failed to process forgot password request', error: error.message })
  }
})

// @route   POST /api/auth/avatar
// @desc    Upload or update user avatar
// @access  Private
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' })
    }

    // Build accessible URL for frontend
    const avatarPath = `/uploads/avatars/${req.file.filename}`

    // Demo mode: if DB not connected, return the path
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, message: 'Avatar uploaded (demo)', avatar: avatarPath })
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    user.avatar = avatarPath
    await user.save()

    res.json({ success: true, message: 'Avatar updated', avatar: avatarPath })
  } catch (error) {
    console.error('Avatar upload error:', error)
    res.status(500).json({ success: false, message: 'Failed to upload avatar', error: error.message })
  }
})

// @route   GET /api/auth/nearby-users
// @desc    Get nearby online users
// @access  Private
router.get('/nearby-users', auth, async (req, res) => {
  try {
    const { longitude, latitude, radius = 10000 } = req.query

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      })
    }

    const includeOffline = req.query.includeOffline === 'true' || req.query.includeOffline === '1'
    const nearbyUsers = await User.findNearby(
      parseFloat(longitude),
      parseFloat(latitude),
      parseInt(radius),
      { includeOffline }
    )

    // Filter out current user
    const filteredUsers = nearbyUsers.filter(user => 
      user._id.toString() !== req.user.id
    )

    res.json({
      success: true,
      users: filteredUsers,
      count: filteredUsers.length
    })
  } catch (error) {
    console.error('Nearby users error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error fetching nearby users',
      error: error.message
    })
  }
})

export default router