import express from 'express'
import axios from 'axios'
import Groq from 'groq-sdk'
import { auth } from '../middleware/auth.js'

const router = express.Router()

// Note: Don't initialize Groq at module load (env may not be ready); create per-request

// Health check for AI routes
router.get('/ping', (req, res) => {
  const provider = process.env.GENERATIVE_PROVIDER || 'groq'
  res.json({ success: true, message: 'AI route loaded', provider })
})

// @route   POST /api/ai/gpt
// @desc    Proxy to OpenAI Chat Completions (server-side key)
// @access  Private
router.post('/gpt', auth, async (req, res) => {
  try {
    const provider = process.env.GENERATIVE_PROVIDER || 'groq'
    if (provider !== 'groq') {
      return res.status(400).json({ success: false, message: 'Only GROQ provider is supported in this deployment. Set GENERATIVE_PROVIDER=groq in .env' })
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ success: false, message: 'GROQ API key not configured on server' })
    }

  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    const temperature = req.body?.temperature ?? 0.7
    const max_tokens = req.body?.max_tokens ?? 500

    // Support both shapes: {message} or {messages: [...]} from the client
    const inputMessage = (req.body?.message ?? '').toString().trim()
    const messages = Array.isArray(req.body?.messages) && req.body.messages.length > 0
      ? req.body.messages
      : (inputMessage ? [{ role: 'user', content: inputMessage }] : [])

    if (!messages || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing message(s)' })
    }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const completion = await groq.chat.completions.create({ model, messages, temperature, max_tokens })

    // Return OpenAI-compatible response so existing frontend parsing works
    return res.json(completion)
  } catch (error) {
    console.error('GROQ Chatbot Error (/gpt):', error?.response?.data || error.message)
    const status = error?.response?.status || 500
    const data = error?.response?.data || { message: error.message }
    return res.status(status).json({ success: false, error: data })
  }
})

// ---------- Temporary public proxy for quick testing only ----------
// WARNING: This endpoint does NOT require authentication and will expose
// your backend's ability to call OpenAI. Use only for local testing and
// remove or protect it before deploying to production.
router.post('/gpt-public', async (req, res) => {
  try {
    const provider = process.env.GENERATIVE_PROVIDER || 'groq'
    if (provider !== 'groq') {
      return res.status(400).json({ success: false, message: 'Only GROQ provider is supported in this deployment. Set GENERATIVE_PROVIDER=groq in .env' })
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ success: false, message: 'GROQ API key not configured on server' })
    }

  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    const temperature = req.body?.temperature ?? 0.7
    const max_tokens = req.body?.max_tokens ?? 500

    const inputMessage = (req.body?.message ?? '').toString().trim()
    const messages = Array.isArray(req.body?.messages) && req.body.messages.length > 0
      ? req.body.messages
      : (inputMessage ? [{ role: 'user', content: inputMessage }] : [])

    if (!messages || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing message(s)' })
    }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const completion = await groq.chat.completions.create({ model, messages, temperature, max_tokens })
    return res.json(completion)
  } catch (error) {
    console.error('GROQ Chatbot Error (/gpt-public):', error?.response?.data || error.message)
    const status = error?.response?.status || 500
    const data = error?.response?.data || { message: error.message }
    return res.status(status).json({ success: false, error: data })
  }
})

// @route   POST /api/ai/chat
// @desc    Send message to Rasa AI assistant
// @access  Private
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, sender } = req.body

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      })
    }

    const rasaUrl = process.env.RASA_URL || 'http://localhost:5005'
    const senderId = sender || req.user.id

    // Send message to Rasa
    const response = await axios.post(`${rasaUrl}/webhooks/rest/webhook`, {
      sender: senderId,
      message: message
    }, {
      timeout: 10000
    })

    const botResponses = response.data || []

    // Process responses
    const processedResponses = botResponses.map(resp => ({
      text: resp.text,
      buttons: resp.buttons || [],
      elements: resp.elements || [],
      quick_replies: resp.quick_replies || [],
      image: resp.image,
      attachment: resp.attachment,
      custom: resp.custom
    }))

    res.json({
      success: true,
      responses: processedResponses,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('AI chat error:', error)
    
    // Fallback response if Rasa is unavailable
    const fallbackResponse = {
      text: "I'm sorry, I'm having trouble connecting to my AI brain right now. Please try again later or use the app's manual features.",
      buttons: [
        {
          title: "Get Emergency Help",
          payload: "/emergency_help"
        },
        {
          title: "Find Nearby Services",
          payload: "/find_services"
        }
      ]
    }

    res.json({
      success: true,
      responses: [fallbackResponse],
      fallback: true,
      timestamp: new Date().toISOString()
    })
  }
})

// @route   POST /api/ai/voice
// @desc    Process voice command
// @access  Private
router.post('/voice', auth, async (req, res) => {
  try {
    const { transcript, confidence } = req.body

    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: 'Voice transcript is required'
      })
    }

    // Process voice command locally first
    const voiceCommand = processVoiceCommand(transcript.toLowerCase())
    
    if (voiceCommand.action) {
      return res.json({
        success: true,
        action: voiceCommand.action,
        params: voiceCommand.params,
        response: voiceCommand.response,
        confidence: confidence || 0.8
      })
    }

    // If no local command matched, send to Rasa
    const rasaUrl = process.env.RASA_URL || 'http://localhost:5005'
    
    const response = await axios.post(`${rasaUrl}/webhooks/rest/webhook`, {
      sender: req.user.id,
      message: transcript
    }, {
      timeout: 10000
    })

    const botResponses = response.data || []
    const mainResponse = botResponses[0]?.text || "I didn't understand that command."

    res.json({
      success: true,
      response: mainResponse,
      action: extractActionFromResponse(botResponses),
      confidence: confidence || 0.8,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Voice processing error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to process voice command',
      error: error.message
    })
  }
})

// @route   GET /api/ai/suggestions
// @desc    Get AI suggestions based on context
// @access  Private
router.get('/suggestions', auth, async (req, res) => {
  try {
    const { context, location, weather, time } = req.query

    const suggestions = generateContextualSuggestions({
      context,
      location: location ? JSON.parse(location) : null,
      weather: weather ? JSON.parse(weather) : null,
      time: time || new Date().toISOString(),
      userId: req.user.id
    })

    res.json({
      success: true,
      suggestions: suggestions,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('AI suggestions error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to generate suggestions',
      error: error.message
    })
  }
})

// @route   POST /api/ai/analyze-route
// @desc    Analyze route for safety and recommendations
// @access  Private
router.post('/analyze-route', auth, async (req, res) => {
  try {
    const { startLocation, endLocation, waypoints, preferences } = req.body

    if (!startLocation || !endLocation) {
      return res.status(400).json({
        success: false,
        message: 'Start and end locations are required'
      })
    }

    const analysis = await analyzeRoute({
      startLocation,
      endLocation,
      waypoints: waypoints || [],
      preferences: preferences || {},
      userId: req.user.id
    })

    res.json({
      success: true,
      analysis: analysis,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Route analysis error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to analyze route',
      error: error.message
    })
  }
})

// @route   POST /api/ai/emergency-assess
// @desc    AI assessment of emergency situation
// @access  Private
router.post('/emergency-assess', auth, async (req, res) => {
  try {
    const { description, location, symptoms, severity } = req.body

    const assessment = assessEmergencySituation({
      description: description || '',
      location,
      symptoms: symptoms || [],
      severity: severity || 'unknown',
      userId: req.user.id
    })

    res.json({
      success: true,
      assessment: assessment,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Emergency assessment error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to assess emergency',
      error: error.message
    })
  }
})

// Helper functions

function processVoiceCommand(transcript) {
  const commands = {
    // Navigation commands
    'start navigation': { action: 'start_navigation', response: 'Starting navigation.' },
    'stop navigation': { action: 'stop_navigation', response: 'Navigation stopped.' },
    'find gas station': { action: 'find_poi', params: { type: 'fuel' }, response: 'Finding nearby gas stations.' },
    'find hospital': { action: 'find_poi', params: { type: 'medical' }, response: 'Finding nearby hospitals.' },
    'find parking': { action: 'find_poi', params: { type: 'parking' }, response: 'Finding nearby parking.' },
    
    // Emergency commands
    'emergency help': { action: 'emergency_alert', params: { type: 'emergency' }, response: 'Sending emergency alert.' },
    'accident alert': { action: 'emergency_alert', params: { type: 'accident' }, response: 'Sending accident alert.' },
    'medical emergency': { action: 'emergency_alert', params: { type: 'medical' }, response: 'Sending medical emergency alert.' },
    'breakdown help': { action: 'emergency_alert', params: { type: 'breakdown' }, response: 'Sending breakdown assistance request.' },
    
    // Weather commands
    'check weather': { action: 'get_weather', response: 'Checking current weather conditions.' },
    'weather forecast': { action: 'get_weather_forecast', response: 'Getting weather forecast.' },
    
    // Communication commands
    'call help': { action: 'start_voice_call', response: 'Initiating help call.' },
    'send message': { action: 'open_chat', response: 'Opening chat interface.' },
    
    // App control
    'go home': { action: 'navigate_to', params: { page: 'home' }, response: 'Going to home screen.' },
    'open map': { action: 'navigate_to', params: { page: 'map' }, response: 'Opening map.' },
    'show dashboard': { action: 'navigate_to', params: { page: 'dashboard' }, response: 'Opening dashboard.' }
  }

  // Try exact match first
  if (commands[transcript]) {
    return commands[transcript]
  }

  // Try partial matches
  for (const [command, response] of Object.entries(commands)) {
    if (transcript.includes(command) || command.includes(transcript)) {
      return response
    }
  }

  return { action: null }
}

function extractActionFromResponse(botResponses) {
  if (!botResponses || botResponses.length === 0) return null

  const response = botResponses[0]
  
  // Check for custom actions in response
  if (response.custom && response.custom.action) {
    return response.custom.action
  }

  // Extract action from buttons
  if (response.buttons && response.buttons.length > 0) {
    const button = response.buttons[0]
    if (button.payload) {
      return {
        type: 'button_action',
        payload: button.payload
      }
    }
  }

  return null
}

function generateContextualSuggestions({ context, location, weather, time, userId }) {
  const suggestions = []
  const currentHour = new Date(time).getHours()

  // Time-based suggestions
  if (currentHour >= 6 && currentHour <= 9) {
    suggestions.push({
      type: 'route',
      title: 'Morning Commute Optimization',
      description: 'Check traffic conditions for your usual route',
      action: 'optimize_route',
      priority: 'high'
    })
  }

  if (currentHour >= 17 && currentHour <= 19) {
    suggestions.push({
      type: 'safety',
      title: 'Evening Ride Safety',
      description: 'Remember to turn on your lights and wear reflective gear',
      action: 'safety_reminder',
      priority: 'medium'
    })
  }

  // Weather-based suggestions
  if (weather) {
    if (weather.main === 'Rain') {
      suggestions.push({
        type: 'safety',
        title: 'Rainy Weather Alert',
        description: 'Reduce speed and increase following distance. Consider alternative transportation.',
        action: 'weather_alert',
        priority: 'high'
      })
    }

    if (weather.windSpeed > 15) {
      suggestions.push({
        type: 'safety',
        title: 'Strong Wind Warning',
        description: 'Be cautious of crosswinds, especially on highways and bridges.',
        action: 'wind_alert',
        priority: 'high'
      })
    }

    if (weather.temperature < 5) {
      suggestions.push({
        type: 'preparation',
        title: 'Cold Weather Prep',
        description: 'Wear appropriate gear and allow extra time for warming up.',
        action: 'cold_weather_prep',
        priority: 'medium'
      })
    }
  }

  // Location-based suggestions
  if (location) {
    suggestions.push({
      type: 'service',
      title: 'Nearby Services',
      description: 'Find fuel stations, repair shops, and restaurants near you',
      action: 'find_nearby_services',
      priority: 'low'
    })
  }

  // Context-based suggestions
  if (context === 'pre_ride') {
    suggestions.push(
      {
        type: 'checklist',
        title: 'Pre-Ride Safety Check',
        description: 'Check tires, brakes, lights, and fuel before starting',
        action: 'safety_checklist',
        priority: 'high'
      },
      {
        type: 'route',
        title: 'Plan Your Route',
        description: 'Get optimized route with real-time traffic updates',
        action: 'plan_route',
        priority: 'medium'
      }
    )
  }

  if (context === 'during_ride') {
    suggestions.push(
      {
        type: 'navigation',
        title: 'Voice Navigation',
        description: 'Use hands-free voice commands for safe navigation',
        action: 'enable_voice_nav',
        priority: 'medium'
      },
      {
        type: 'emergency',
        title: 'Emergency Contacts',
        description: 'Quick access to emergency assistance',
        action: 'emergency_contacts',
        priority: 'low'
      }
    )
  }

  return suggestions.slice(0, 5) // Return top 5 suggestions
}

async function analyzeRoute({ startLocation, endLocation, waypoints, preferences, userId }) {
  try {
    const analysis = {
      safetyScore: 85, // Mock score
      recommendations: [],
      warnings: [],
      alternativeRoutes: [],
      estimatedRisk: 'low'
    }

    // Mock analysis based on route characteristics
    const distance = calculateDistance(
      startLocation.latitude, startLocation.longitude,
      endLocation.latitude, endLocation.longitude
    )

    if (distance > 100) {
      analysis.recommendations.push({
        type: 'break',
        message: 'Consider taking a rest break every 2 hours on long rides',
        priority: 'medium'
      })
    }

    if (preferences.avoidHighways) {
      analysis.recommendations.push({
        type: 'route',
        message: 'Scenic route selected - may take longer but offers better views',
        priority: 'low'
      })
    }

    // Time-based warnings
    const currentHour = new Date().getHours()
    if (currentHour >= 18 || currentHour <= 6) {
      analysis.warnings.push({
        type: 'visibility',
        message: 'Riding during low-light hours - ensure lights are working',
        severity: 'medium'
      })
      analysis.safetyScore -= 10
    }

    return analysis
  } catch (error) {
    console.error('Route analysis error:', error)
    return {
      safetyScore: 70,
      recommendations: [{
        type: 'general',
        message: 'Unable to complete full analysis. Please ride safely.',
        priority: 'medium'
      }],
      warnings: [],
      alternativeRoutes: [],
      estimatedRisk: 'unknown'
    }
  }
}

function assessEmergencySituation({ description, location, symptoms, severity, userId }) {
  const assessment = {
    urgencyLevel: 'medium',
    recommendedActions: [],
    nearbyResources: [],
    estimated_response_time: '10-15 minutes'
  }

  // Assess urgency based on keywords and severity
  const highUrgencyKeywords = ['unconscious', 'bleeding', 'chest pain', 'difficulty breathing', 'severe injury']
  const mediumUrgencyKeywords = ['injured', 'pain', 'stuck', 'broken down']

  const hasHighUrgency = highUrgencyKeywords.some(keyword => 
    description.toLowerCase().includes(keyword)
  )
  
  const hasMediumUrgency = mediumUrgencyKeywords.some(keyword => 
    description.toLowerCase().includes(keyword)
  )

  if (hasHighUrgency || severity === 'critical') {
    assessment.urgencyLevel = 'critical'
    assessment.recommendedActions.push({
      action: 'call_911',
      message: 'Call emergency services immediately (911)',
      priority: 1
    })
    assessment.estimated_response_time = '5-10 minutes'
  } else if (hasMediumUrgency || severity === 'high') {
    assessment.urgencyLevel = 'high'
    assessment.recommendedActions.push({
      action: 'alert_nearby_riders',
      message: 'Alert nearby riders for assistance',
      priority: 1
    })
  }

  // General recommendations
  assessment.recommendedActions.push(
    {
      action: 'share_location',
      message: 'Share precise location with emergency contacts',
      priority: 2
    },
    {
      action: 'stay_visible',
      message: 'Move to a safe, visible location if possible',
      priority: 3
    },
    {
      action: 'update_status',
      message: 'Keep emergency contacts updated on your status',
      priority: 4
    }
  )

  return assessment
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

export default router