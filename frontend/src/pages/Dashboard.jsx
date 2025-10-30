import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { 
  MapIcon, 
  ChatBubbleLeftIcon,
  ExclamationTriangleIcon,
  TrophyIcon,
  BoltIcon,
  CloudIcon,
  UserGroupIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import axios from 'axios'

const Dashboard = () => {
  const [stats, setStats] = useState(null)
  const [weather, setWeather] = useState(null)
  const [nearbyAlerts, setNearbyAlerts] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [batteryLevel, setBatteryLevel] = useState(85)
  const [isCharging, setIsCharging] = useState(false)
  const [isRiding, setIsRiding] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  
  const { user } = useAuth()
  const { socket, connected, onlineUsers } = useSocket()

  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

  useEffect(() => {
    fetchUserStats()
    fetchWeather()
    fetchNearbyAlerts()
    fetchLeaderboard()
    getCurrentLocation()
    // Integrate with the Battery Status API if available
    let batteryMgr = null
    if (navigator.getBattery) {
      navigator.getBattery().then(battery => {
        batteryMgr = battery
        const updateBattery = () => {
          setBatteryLevel(Math.round(battery.level * 100))
          setIsCharging(Boolean(battery.charging))
        }

        updateBattery()

        battery.addEventListener('levelchange', updateBattery)
        battery.addEventListener('chargingchange', updateBattery)
      }).catch(err => {
        console.warn('Battery API not available:', err)
      })
    }

    return () => {
      try {
        if (batteryMgr) {
          batteryMgr.removeEventListener('levelchange', () => {})
          batteryMgr.removeEventListener('chargingchange', () => {})
        }
      } catch (e) {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('emergency-alert', (alertData) => {
      setNearbyAlerts(prev => [alertData, ...prev.slice(0, 4)])
    })

    socket.on('battery-alert', (data) => {
      if (data.batteryLevel < 20) {
        // Show low battery notification
        console.log('Low battery alert received:', data)
      }
    })

    return () => {
      socket.off('emergency-alert')
      socket.off('battery-alert')
    }
  }, [socket])

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
        },
        (error) => console.error('Location error:', error),
        { enableHighAccuracy: true, maximumAge: 10000 }
      )
    }
  }

  const fetchUserStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/profile`)
      // Defensive: API may return different shapes (demo mode or partial data)
      const statsData = response.data?.user?.stats ?? response.data?.stats ?? null
      setStats(statsData)
    } catch (error) {
      // If unauthorized, surface a clearer message for debugging
      if (error.response?.status === 401) {
        console.warn('Stats fetch unauthorized (401) - user may not be authenticated')
      }
      console.error('Stats fetch error:', error)
    }
  }

  const fetchWeather = async () => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await axios.get(`${API_URL}/api/weather/current`, {
            params: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            }
          })
          setWeather(response.data.weather)
        } catch (error) {
          console.error('Weather fetch error:', error)
        }
      },
      (error) => console.error('Location error:', error)
    )
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
          const alerts = response.data?.alerts ?? []
          setNearbyAlerts(Array.isArray(alerts) ? alerts.slice(0, 5) : [])
        } catch (error) {
          console.error('Alerts fetch error:', error)
        }
      },
      (error) => console.error('Location error:', error)
    )
  }

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/rewards/leaderboard`, {
        params: { period: 'weekly', limit: 5 }
      })
      setLeaderboard(response.data?.leaderboard ?? [])
    } catch (error) {
      console.error('Leaderboard fetch error:', error)
    }
  }

  const startRide = async () => {
    if (!currentLocation) {
      alert('Location not available')
      return
    }

    try {
      const response = await axios.post(`${API_URL}/api/gps/start-ride`, {
        startLocation: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        },
        rideType: 'solo'
      })
      
      setIsRiding(true)
      alert('Ride started! Stay safe!')
    } catch (error) {
      console.error('Start ride error:', error)
      alert('Failed to start ride')
    }
  }

  const sendBatteryAlert = () => {
    if (socket && batteryLevel <= 20) {
      socket.emit('battery-alert', {
        batteryLevel,
        location: currentLocation
      })
      alert('Low battery alert sent to nearby riders!')
    }
  }

  const quickFeatures = [
    {
      title: 'Start Navigation',
      description: 'Begin GPS tracking and navigation',
      icon: MapIcon,
      color: 'neon-cyan',
      action: () => setIsRiding(!isRiding),
      link: '/map'
    },
    {
      title: 'Emergency Alert',
      description: 'Send emergency signal to nearby riders',
      icon: ExclamationTriangleIcon,
      color: 'red-500',
      action: () => alert('Emergency alert sent!'),
      link: '/emergency'
    },
    {
      title: 'Group Chat',
      description: 'Chat with nearby riders',
      icon: ChatBubbleLeftIcon,
      color: 'neon-purple',
      action: () => {},
      link: '/chat'
    },
    {
      title: 'View Rewards',
      description: 'Check your points and achievements',
      icon: TrophyIcon,
      color: 'yellow-500',
      action: () => {},
      link: '/profile'
    }
  ]

  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-orbitron font-bold text-white mb-2">
            Welcome back, {user?.name || 'Rider'}!
          </h1>
          <p className="text-gray-300">
            Ready for your next adventure? Here's your riding dashboard.
          </p>
        </motion.div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Connection Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card-glow"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Connection</h3>
              <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            <p className="text-2xl font-bold text-neon-cyan">
              {connected ? 'Online' : 'Offline'}
            </p>
            <p className="text-sm text-gray-400">
              {onlineUsers.length} riders nearby
            </p>
          </motion.div>

          {/* Battery Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card-glow"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Battery</h3>
                <div className="flex items-center gap-2">
                  {isCharging ? (
                    <BoltIcon className="w-6 h-6 text-green-400 animate-pulse" />
                  ) : (
                    <BoltIcon className="w-6 h-6 text-yellow-500" />
                  )}
                </div>
            </div>
              <p className="text-2xl font-bold text-neon-cyan">{batteryLevel}% {isCharging && <span className="text-sm text-green-400">(Charging)</span>}</p>
            <div className="w-full bg-dark-600 rounded-full h-2 mt-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  batteryLevel > 50 ? 'bg-green-500' : batteryLevel > 20 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${batteryLevel}%` }}
              />
            </div>
            {batteryLevel <= 20 && (
              <button
                onClick={sendBatteryAlert}
                className="text-xs text-red-400 hover:text-red-300 mt-2"
              >
                Send Low Battery Alert
              </button>
            )}
          </motion.div>

          {/* Weather */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card-glow"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Weather</h3>
              <CloudIcon className="w-6 h-6 text-blue-400" />
            </div>
            {weather ? (
              <>
                <p className="text-2xl font-bold text-neon-cyan">
                  {weather.current.temperature}°C
                </p>
                <p className="text-sm text-gray-400 capitalize">
                  {weather.current.description}
                </p>
                <div className={`text-xs mt-2 ${
                  weather.rideConditions.isGoodForRiding ? 'text-green-400' : 'text-red-400'
                }`}>
                  {weather.rideConditions.isGoodForRiding ? '✓ Good for riding' : '⚠ Poor conditions'}
                </div>
              </>
            ) : (
              <p className="text-gray-400">Loading...</p>
            )}
          </motion.div>

          {/* Ride Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="card-glow"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Ride Status</h3>
              <div className={`w-3 h-3 rounded-full ${isRiding ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
            </div>
            <p className="text-2xl font-bold text-neon-cyan">
              {isRiding ? 'Riding' : 'Parked'}
            </p>
            <button
              onClick={startRide}
              className={`text-xs mt-2 px-3 py-1 rounded transition-colors ${
                isRiding 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isRiding ? 'End Ride' : 'Start Ride'}
            </button>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-orbitron font-bold text-white mb-6">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickFeatures.map((feature, index) => {
              const Icon = feature.icon
              return (
                <Link
                  key={feature.title}
                  to={feature.link}
                  className="group"
                >
                  <motion.div
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    className="card-glow h-full cursor-pointer"
                  >
                    <div className={`text-${feature.color} mb-4`}>
                      <Icon className="w-12 h-12 mx-auto" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2 text-center">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-400 text-center">
                      {feature.description}
                    </p>
                  </motion.div>
                </Link>
              )
            })}
          </div>
        </motion.div>

        {/* Stats and Activity */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* User Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="lg:col-span-2"
          >
            <h2 className="text-2xl font-orbitron font-bold text-white mb-6">Your Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card-glow text-center">
                <ChartBarIcon className="w-8 h-8 text-neon-cyan mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{stats?.totalRides || 0}</p>
                <p className="text-sm text-gray-400">Total Rides</p>
              </div>
              <div className="card-glow text-center">
                <MapIcon className="w-8 h-8 text-neon-purple mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">
                  {stats?.totalDistance ? `${(stats.totalDistance / 1000).toFixed(0)}` : '0'}
                </p>
                <p className="text-sm text-gray-400">Total KM</p>
              </div>
              <div className="card-glow text-center">
                <UserGroupIcon className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{stats?.helpCount || 0}</p>
                <p className="text-sm text-gray-400">People Helped</p>
              </div>
              <div className="card-glow text-center">
                <TrophyIcon className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{stats?.rewardPoints || 0}</p>
                <p className="text-sm text-gray-400">Reward Points</p>
              </div>
            </div>
          </motion.div>

          {/* Leaderboard */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <h2 className="text-2xl font-orbitron font-bold text-white mb-6">Top Riders</h2>
            <div className="card-glow">
              {leaderboard.length > 0 ? (
                <div className="space-y-3">
                  {leaderboard.map((rider, index) => (
                    <div key={rider.user._id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? 'bg-yellow-500 text-black' :
                          index === 1 ? 'bg-gray-400 text-black' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-dark-600 text-gray-300'
                        }`}>
                          {index + 1}
                        </div>
                        <span className="text-white text-sm">{rider.user.name}</span>
                      </div>
                      <span className="text-neon-cyan text-sm font-semibold">
                        {rider.score} pts
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center">No leaderboard data</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Recent Alerts */}
        {nearbyAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <h2 className="text-2xl font-orbitron font-bold text-white mb-6">Nearby Alerts</h2>
            <div className="space-y-4">
              {nearbyAlerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className="card-glow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="text-2xl">
                        {alert.type === 'accident' ? '🚨' :
                         alert.type === 'breakdown' ? '🛠️' :
                         alert.type === 'medical' ? '🏥' : '⚠️'}
                      </div>
                      <div>
                        <h3 className="text-white font-semibold capitalize">
                          {alert.type} Alert
                        </h3>
                        <p className="text-sm text-gray-400">
                          {Math.round(alert.distance)}m away • {alert.respondersCount || 0} responses
                        </p>
                        {alert.description && (
                          <p className="text-sm text-gray-300 mt-1">
                            {alert.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Link
                      to={`/emergency`}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      Respond
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default Dashboard