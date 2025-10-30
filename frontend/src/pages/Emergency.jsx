import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  ExclamationTriangleIcon,
  PhoneIcon,
  MapPinIcon,
  ClockIcon,
  UserGroupIcon,
  TruckIcon,
  HeartIcon,
  FireIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import axios from 'axios'

const Emergency = () => {
  const [activeAlert, setActiveAlert] = useState(null)
  const [nearbyAlerts, setNearbyAlerts] = useState([])
  const [emergencyContacts, setEmergencyContacts] = useState([])
  const [userLocation, setUserLocation] = useState(null)
  const [isResponding, setIsResponding] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', phone: '', relationship: '' })
  const [toast, setToast] = useState(null)
  
  const { user } = useAuth()
  const { socket, connected } = useSocket()

  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

  const emergencyTypes = [
    {
      type: 'accident',
      title: 'Accident',
      description: 'Vehicle accident or collision',
      icon: ExclamationTriangleIcon,
      color: 'red-500',
      emoji: '🚨'
    },
    {
      type: 'breakdown',
      title: 'Breakdown',
      description: 'Vehicle breakdown or malfunction',
      icon: TruckIcon,
      color: 'orange-500',
      emoji: '🛠️'
    },
    {
      type: 'medical',
      title: 'Medical Emergency',
      description: 'Medical assistance needed',
      icon: HeartIcon,
      color: 'pink-500',
      emoji: '🏥'
    },
    {
      type: 'fire',
      title: 'Fire Emergency',
      description: 'Fire or smoke detected',
      icon: FireIcon,
      color: 'red-600',
      emoji: '🔥'
    }
  ]

  useEffect(() => {
    getCurrentLocation()
    fetchNearbyAlerts()
    fetchEmergencyContacts()
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('emergency-alert', (alertData) => {
      setNearbyAlerts(prev => [alertData, ...prev])
    })

    socket.on('alert-resolved', (alertId) => {
      setNearbyAlerts(prev => prev.filter(alert => alert.id !== alertId))
      if (activeAlert?.id === alertId) {
        setActiveAlert(null)
      }
    })

    socket.on('responder-joined', (data) => {
      setNearbyAlerts(prev => 
        prev.map(alert => 
          alert.id === data.alertId 
            ? { ...alert, respondersCount: (alert.respondersCount || 0) + 1 }
            : alert
        )
      )
    })

    return () => {
      socket.off('emergency-alert')
      socket.off('alert-resolved')
      socket.off('responder-joined')
    }
  }, [socket, activeAlert])

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
        },
        (error) => console.error('Location error:', error),
        { enableHighAccuracy: true, maximumAge: 10000 }
      )
    }
  }

  // Promise-based location getter so click handlers can await location acquisition
  const getCurrentLocationAsync = (timeout = 10000) => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'))

      let resolved = false
      const success = (position) => {
        resolved = true
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }
        setUserLocation(loc)
        resolve(loc)
      }

      const failure = (err) => {
        if (resolved) return
        resolved = true
        reject(err)
      }

      navigator.geolocation.getCurrentPosition(success, failure, { enableHighAccuracy: true })

      // fallback timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error('Location request timed out'))
        }
      }, timeout)
    })
  }

  const fetchNearbyAlerts = async () => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await axios.get(`${API_URL}/api/emergency/nearby`, {
            params: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              radius: 10000
            }
          })
          setNearbyAlerts(response.data?.alerts ?? [])
        } catch (error) {
          console.error('Alerts fetch error:', error)
        }
      },
      (error) => console.error('Location error:', error)
    )
  }

  const fetchEmergencyContacts = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/emergency-contacts`)
      setEmergencyContacts(response.data?.contacts || [])
    } catch (error) {
      console.error('Emergency contacts fetch error:', error)
    }
  }

  const sendEmergencyAlert = async (type) => {
    try {
      // Ensure we have a location; try to request one if missing
      let loc = userLocation
      if (!loc) {
        try {
          // For fire alerts we try a little longer and require a location if we can't obtain one
          loc = await getCurrentLocationAsync(type === 'fire' ? 12000 : 8000)
        } catch (err) {
          if (type === 'fire') {
            // Fire alerts must include a location for responders and services
            alert('Location is required for fire alerts. Please enable your device location and try again.')
            return
          }

          // ask user whether to continue without precise location for non-fire types
          const proceed = window.confirm('Location not available. Send emergency alert without precise location? (recommended: enable location)')
          if (!proceed) return
        }
      }

      // If still no loc, send a placeholder (backend prefers location but may accept nulls)
      const payload = {
        type,
        location: loc ? { latitude: loc.latitude, longitude: loc.longitude } : null,
        description: `${type} emergency alert`,
        severity: type === 'medical' || type === 'fire' ? 'high' : 'medium'
      }

      const response = await axios.post(`${API_URL}/api/emergency/alert`, payload)

      setActiveAlert(response.data.alert)

      // Emit via socket for real-time updates
      if (socket) {
        socket.emit('emergency-alert', response.data.alert)
      }

      // Play a subtle alert sound
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = 'sine'
        o.frequency.value = 880
        g.gain.value = 0.02
        o.connect(g)
        g.connect(ctx.destination)
        o.start()
        setTimeout(() => { o.stop(); ctx.close() }, 250)
      } catch (e) {
        // ignore sound errors
      }

      // Show toast notification
      setToast({ message: '🚨 Emergency alert sent! Help is on the way.', type: 'danger' })
      setTimeout(() => setToast(null), 3500)
    } catch (error) {
      console.error('Alert send error:', error)
      // If backend returned validation error about location, suggest enabling location
      const backendMessage = error.response?.data?.message
      if (backendMessage) {
        setToast({ message: backendMessage, type: 'warning' })
        setTimeout(() => setToast(null), 5000)
      } else {
        alert('Failed to send emergency alert. Please try again.')
      }
    }
  }

  const respondToAlert = async (alertId) => {
    if (!userLocation) {
      alert('Location not available')
      return
    }

    setIsResponding(true)
    try {
      await axios.post(`${API_URL}/api/emergency/respond/${alertId}`, {
        responderLocation: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude
        }
      })

      // Update local state
      setNearbyAlerts(prev => 
        prev.map(alert => 
          alert.id === alertId 
            ? { ...alert, respondersCount: (alert.respondersCount || 0) + 1, responded: true }
            : alert
        )
      )

      // Emit via socket
      if (socket) {
        socket.emit('responder-joined', { alertId, responder: user })
      }

  setToast({ message: '✅ Response sent! You are now heading to help.', type: 'success' })
  setTimeout(() => setToast(null), 3000)
    } catch (error) {
      console.error('Response error:', error)
  setToast({ message: 'Failed to respond to alert', type: 'warning' })
  setTimeout(() => setToast(null), 3000)
    } finally {
      setIsResponding(false)
    }
  }

  const resolveAlert = async (alertId) => {
    try {
      // backend expects PUT /api/emergency/resolve/:alertId
      await axios.put(`${API_URL}/api/emergency/resolve/${alertId}`)
      
      setNearbyAlerts(prev => prev.filter(alert => alert.id !== alertId))
      if (activeAlert?.id === alertId) {
        setActiveAlert(null)
      }

      // Emit via socket
      if (socket) {
        socket.emit('alert-resolved', alertId)
      }

  setToast({ message: '✅ Emergency resolved successfully!', type: 'success' })
  setTimeout(() => setToast(null), 3000)
    } catch (error) {
      console.error('Resolve error:', error)
      const message = error.response?.data?.message || 'Failed to resolve alert'
      setToast({ message, type: 'warning' })
      setTimeout(() => setToast(null), 4000)
    }
  }

  const addEmergencyContact = async () => {
    if (!newContact.name || !newContact.phone) {
      alert('Please fill in all required fields')
      return
    }

    try {
      const response = await axios.post('/api/auth/emergency-contacts', newContact)
      setEmergencyContacts(response.data.contacts)
      setNewContact({ name: '', phone: '', relationship: '' })
      setShowContactForm(false)
      alert('Emergency contact added successfully!')
    } catch (error) {
      console.error('Add contact error:', error)
      alert('Failed to add emergency contact')
    }
  }

  const callEmergencyContact = (phone) => {
    window.open(`tel:${phone}`, '_self')
  }

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180
    const φ2 = lat2 * Math.PI/180
    const Δφ = (lat2-lat1) * Math.PI/180
    const Δλ = (lon2-lon1) * Math.PI/180

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

    return R * c
  }

  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="text-3xl md:text-4xl font-orbitron font-bold text-white mb-2">
            Emergency Center
          </h1>
          <p className="text-gray-300">
            Get help quickly or assist others in need
          </p>
          <div className={`inline-flex items-center mt-4 px-4 py-2 rounded-full ${
            connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              connected ? 'bg-green-400' : 'bg-red-400'
            }`} />
            {connected ? 'Emergency services online' : 'Connection lost - some features unavailable'}
          </div>
        </motion.div>

        {/* Active Alert */}
        {activeAlert && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 mb-8"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="text-4xl animate-pulse">🚨</div>
                <div>
                  <h3 className="text-xl font-bold text-red-400">
                    Your Emergency Alert is Active
                  </h3>
                  <p className="text-gray-300">
                    Alert ID: {activeAlert.id} • {activeAlert.respondersCount || 0} responders
                  </p>
                </div>
              </div>
              <button
                onClick={() => resolveAlert(activeAlert.id)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                Mark Resolved
              </button>
            </div>
          </motion.div>
        )}

        {/* Emergency Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-orbitron font-bold text-white mb-6">Send Emergency Alert</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {emergencyTypes.map((emergency) => {
              const Icon = emergency.icon
              return (
                <motion.button
                  key={emergency.type}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => sendEmergencyAlert(emergency.type)}
                  // allow sending even if realtime socket is disconnected; backend will still receive the alert
                  disabled={!!activeAlert}
                  className={`card-glow p-6 text-center transition-all duration-300 ${
                    !!activeAlert ? 'opacity-50 cursor-not-allowed' : 'hover:border-red-500/50'
                  }`}
                >
                  <div className="text-4xl mb-4">{emergency.emoji}</div>
                  <Icon className={`w-12 h-12 text-${emergency.color} mx-auto mb-4`} />
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {emergency.title}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {emergency.description}
                  </p>
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* Toast / alert popup */}
        {toast && (
          <div className="alert-popup" style={{ zIndex: 9999 }}>
            {toast.message}
          </div>
        )}

        {/* Emergency Contacts & Nearby Alerts */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Emergency Contacts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-1"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-orbitron font-bold text-white">Emergency Contacts</h2>
              <button
                onClick={() => setShowContactForm(!showContactForm)}
                className="text-neon-cyan hover:text-neon-purple transition-colors"
              >
                + Add
              </button>
            </div>

            {showContactForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="card-glow mb-6"
              >
                <h3 className="text-lg font-semibold text-white mb-4">Add Emergency Contact</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newContact.name}
                    onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                    className="w-full px-4 py-2 bg-dark-600 border border-gray-600 rounded text-white"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
                    className="w-full px-4 py-2 bg-dark-600 border border-gray-600 rounded text-white"
                  />
                  <input
                    type="text"
                    placeholder="Relationship (optional)"
                    value={newContact.relationship}
                    onChange={(e) => setNewContact({...newContact, relationship: e.target.value})}
                    className="w-full px-4 py-2 bg-dark-600 border border-gray-600 rounded text-white"
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={addEmergencyContact}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    >
                      Add Contact
                    </button>
                    <button
                      onClick={() => setShowContactForm(false)}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="space-y-3">
              {emergencyContacts.length > 0 ? (
                emergencyContacts.map((contact, index) => (
                  <div key={index} className="card-glow">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-semibold">{contact.name}</h3>
                        <p className="text-sm text-gray-400">{contact.relationship}</p>
                        <p className="text-sm text-neon-cyan">{contact.phone}</p>
                      </div>
                      <button
                        onClick={() => callEmergencyContact(contact.phone)}
                        className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-full transition-colors"
                      >
                        <PhoneIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card-glow text-center py-8">
                  <PhoneIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-400">No emergency contacts added</p>
                  <button
                    onClick={() => setShowContactForm(true)}
                    className="text-neon-cyan hover:text-neon-purple mt-2"
                  >
                    Add your first contact
                  </button>
                </div>
              )}
            </div>
          </motion.div>

          {/* Nearby Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2"
          >
            <h2 className="text-2xl font-orbitron font-bold text-white mb-6">Nearby Emergencies</h2>
            
            {nearbyAlerts.length > 0 ? (
              <div className="space-y-4">
                {nearbyAlerts.map((alert) => {
                  // Prefer server-provided distance (meters). If missing, derive from coordinates.
                  let distance = typeof alert.distance === 'number' ? alert.distance : null

                  if (distance === null) {
                    if (alert.location && Array.isArray(alert.location.coordinates) && alert.location.coordinates.length === 2 && userLocation) {
                      // server stores [longitude, latitude]
                      distance = calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        alert.location.coordinates[1],
                        alert.location.coordinates[0]
                      )
                    } else {
                      distance = 0
                    }
                  }

                  // normalize createdAt / timestamp
                  const timestamp = alert.createdAt || alert.timestamp || Date.now()

                  // determine ownership (backend returns populated `user` object)
                  const alertOwnerId = alert.user?.id || alert.user?._id || alert.user

                  return (
                    <div key={alert.id} className="card-glow">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="text-3xl">
                            {alert.type === 'accident' ? '🚨' :
                             alert.type === 'breakdown' ? '🛠️' :
                             alert.type === 'medical' ? '🏥' :
                             alert.type === 'fire' ? '🔥' : '⚠️'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h3 className="text-lg font-semibold text-white capitalize">
                                {alert.type} Emergency
                              </h3>
                              <span className={`px-2 py-1 text-xs rounded ${
                                alert.severity === 'high' ? 'bg-red-600' :
                                alert.severity === 'medium' ? 'bg-orange-600' :
                                'bg-yellow-600'
                              }`}>
                                {alert.severity}
                              </span>

                              {/* Show who reported the alert (rider name + optional avatar) */}
                              <div className="flex items-center ml-3 text-sm text-gray-300">
                                {alert.user?.avatar ? (
                                  <img src={alert.user.avatar} alt={alert.user?.name || 'reporter'} className="w-6 h-6 rounded-full mr-2 object-cover" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gray-700 mr-2" />
                                )}
                                <span className="truncate">{alert.user?.name || 'Anonymous'}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-gray-400">
                              <div className="flex items-center space-x-1">
                                <MapPinIcon className="w-4 h-4" />
                                <span>{Math.round(distance)}m away</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <ClockIcon className="w-4 h-4" />
                                  <span>{new Date(timestamp).toLocaleTimeString()}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <UserGroupIcon className="w-4 h-4" />
                                <span>{alert.respondersCount || 0} responding</span>
                              </div>
                            </div>
                            {alert.description && (
                              <p className="text-sm text-gray-300 mt-2">
                                {alert.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {alert.responded ? (
                            <div className="flex items-center px-3 py-2 bg-green-600 text-white rounded">
                              <CheckCircleIcon className="w-4 h-4 mr-1" />
                              Responding
                            </div>
                          ) : (
                            <button
                              onClick={() => respondToAlert(alert.id)}
                              disabled={isResponding}
                              className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors ${
                                isResponding ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              {isResponding ? 'Responding...' : 'Respond'}
                            </button>
                          )}
                          {alertOwnerId && alertOwnerId.toString() === user?.id?.toString() && (
                            <button
                              onClick={() => resolveAlert(alert.id)}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="card-glow text-center py-12">
                <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">All Clear!</h3>
                <p className="text-gray-400">No emergency alerts in your area</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default Emergency

/* Inline styles for the toast popup (kept local to this file) */
const style = document.createElement('style')
style.innerHTML = `
.alert-popup {
  background: linear-gradient(90deg, #ff3b3b, #b10000);
  color: white;
  padding: 15px 25px;
  border-radius: 10px;
  box-shadow: 0 0 15px rgba(255, 0, 0, 0.4);
  font-weight: bold;
  text-align: center;
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  animation: fadeInOut 3s ease-in-out;
}
@keyframes fadeInOut {
  0% { opacity: 0; transform: translateY(20px) translateX(-50%); }
  10% { opacity: 1; transform: translateY(0) translateX(-50%); }
  90% { opacity: 1; }
  100% { opacity: 0; transform: translateY(20px) translateX(-50%); }
}
`
document.head.appendChild(style)