import React, { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle } from 'react-leaflet'
import { motion } from 'framer-motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'

// Fix for default markers in React Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom icons
const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

const emergencyIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

const fuelIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

// Map event handler component
const MapEventHandler = ({ onLocationUpdate, onMapClick }) => {
  const map = useMapEvents({
    click: (e) => {
      if (onMapClick) {
        onMapClick(e.latlng)
      }
    },
    locationfound: (e) => {
      if (onLocationUpdate) {
        onLocationUpdate(e.latlng)
      }
    }
  })

  return null
}

const Map = () => {
  const [userLocation, setUserLocation] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [nearbyPOIs, setNearbyPOIs] = useState([])
  const [emergencyAlerts, setEmergencyAlerts] = useState([])
  const [selectedPOIType, setSelectedPOIType] = useState('fuel')
  const [isLoading, setIsLoading] = useState(false)
  const [weather, setWeather] = useState(null)
  const [routeData, setRouteData] = useState(null)
  const [destination, setDestination] = useState(null)
  
  const { socket, updateLocation } = useSocket()
  const { user } = useAuth()
  const mapRef = useRef()
  const watchIdRef = useRef(null)
  const lastSentRef = useRef(0)
  const lastPosRef = useRef(null)

  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

  // Get user's current location and watch for changes (higher accuracy + smoothing)
  useEffect(() => {
    // Helper: haversine distance in meters
    const haversineDistance = (a, b) => {
      if (!a || !b) return Infinity
      const toRad = (v) => (v * Math.PI) / 180
      const R = 6371000 // meters
      const dLat = toRad(b.lat - a.lat)
      const dLon = toRad(b.lng - a.lng)
      const lat1 = toRad(a.lat)
      const lat2 = toRad(b.lat)

      const sinDLat = Math.sin(dLat / 2)
      const sinDLon = Math.sin(dLon / 2)
      const aHarv = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
      const c = 2 * Math.atan2(Math.sqrt(aHarv), Math.sqrt(1 - aHarv))
      return R * c
    }

    if (!navigator.geolocation) return

    let initialFix = false

    const success = (position) => {
      const raw = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      }

      // Simple exponential moving average smoothing (keeps location stable)
      setUserLocation((prev) => {
        if (!prev) return { lat: raw.lat, lng: raw.lng }
        const alpha = 0.45 // smoothing factor: 0-1, higher = more reactive
        return {
          lat: prev.lat * (1 - alpha) + raw.lat * alpha,
          lng: prev.lng * (1 - alpha) + raw.lng * alpha
        }
      })

      setAccuracy(raw.accuracy)

      // Throttle updates to backend: send if moved > 10m or every 5s
      const now = Date.now()
      const lastPos = lastPosRef.current
      const moved = lastPos ? haversineDistance(lastPos, raw) : Infinity
      if (moved > 10 || now - lastSentRef.current > 5000 || !lastPos) {
        updateLocation({ latitude: raw.lat, longitude: raw.lng, accuracy: raw.accuracy })
        lastPosRef.current = raw
        lastSentRef.current = now
      }

      // On first good fix, fetch nearby data
      if (!initialFix) {
        initialFix = true
        fetchWeather(raw.lat, raw.lng)
        fetchNearbyPOIs(raw.lat, raw.lng, selectedPOIType)
        fetchNearbyEmergencies(raw.lat, raw.lng)
      }
    }

    const error = (err) => {
      console.error('Geolocation watch error:', err)
      if (!userLocation) setUserLocation({ lat: 28.6139, lng: 77.2090 })
    }

    const id = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    })

    watchIdRef.current = id

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    socket.on('emergency-alert', (alertData) => {
      setEmergencyAlerts(prev => [...prev, alertData])
    })

    socket.on('location-update', (locationData) => {
      // Update other users' locations if needed
      console.log('User location update:', locationData)
    })

    return () => {
      socket.off('emergency-alert')
      socket.off('location-update')
    }
  }, [socket])

  const fetchWeather = async (lat, lng) => {
    try {
      const response = await axios.get(`${API_URL}/api/weather/current`, {
        params: { latitude: lat, longitude: lng }
      })
      setWeather(response.data.weather)
    } catch (error) {
      console.error('Weather fetch error:', error)
    }
  }

  const fetchNearbyPOIs = async (lat, lng, type) => {
    setIsLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/gps/nearby-pois`, {
        params: { latitude: lat, longitude: lng, type, radius: 5000 }
      })
      const pois = response.data?.pois
      setNearbyPOIs(Array.isArray(pois) ? pois : [])
    } catch (error) {
      console.error('POI fetch error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchNearbyEmergencies = async (lat, lng) => {
    try {
      const response = await axios.get(`${API_URL}/api/emergency/nearby`, {
        params: { latitude: lat, longitude: lng, radius: 10000 }
      })
      setEmergencyAlerts(response.data?.alerts ?? [])
    } catch (error) {
      console.error('Emergency fetch error:', error)
    }
  }

  const calculateRoute = async (start, end) => {
    try {
      const response = await axios.get(`${API_URL}/api/gps/route`, {
        params: {
          startLat: start.lat,
          startLng: start.lng,
          endLat: end.lat,
          endLng: end.lng
        }
      })
      setRouteData(response.data?.route ?? null)
    } catch (error) {
      console.error('Route calculation error:', error)
    }
  }

  const handleMapClick = (latlng) => {
    setDestination(latlng)
    if (userLocation) {
      calculateRoute(userLocation, latlng)
    }
  }

  const handlePOITypeChange = (type) => {
    setSelectedPOIType(type)
    if (userLocation) {
      fetchNearbyPOIs(userLocation.lat, userLocation.lng, type)
    }
  }

  const sendEmergencyAlert = async (type) => {
    if (!userLocation) {
      alert('Location not available')
      return
    }

    try {
      await axios.post(`${API_URL}/api/emergency/alert`, {
        type,
        severity: 'high',
        location: {
          latitude: userLocation.lat,
          longitude: userLocation.lng
        },
        description: `Emergency alert sent from map`
      })
      
      alert('Emergency alert sent successfully!')
    } catch (error) {
      console.error('Emergency alert error:', error)
      alert('Failed to send emergency alert')
    }
  }

  if (!userLocation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="loading-dots mb-4">
            <div></div>
            <div></div>
            <div></div>
          </div>
          <p className="text-gray-300">Getting your location...</p>
        </div>
      </div>
    )
  }

  return (
    // Reserve space for the fixed navbar (h-16) so the map doesn't sit under it
    <div className="relative" style={{ height: 'calc(100vh - 4rem)', marginTop: '4rem' }}>
      {/* Map Container */}
      <MapContainer
        center={[userLocation.lat, userLocation.lng]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        whenCreated={(mapInstance) => { mapRef.current = mapInstance }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        <MapEventHandler onMapClick={handleMapClick} />

        {/* User location marker */}
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
          <Popup>
            <div className="text-center">
              <h3 className="font-bold text-neon-cyan">Your Location</h3>
              <p className="text-sm text-gray-600">
                {user?.name || 'Unknown User'}
              </p>
              {weather && (
                <div className="mt-2 p-2 bg-gray-100 rounded">
                  <p className="text-xs">
                    {weather.current.temperature}°C - {weather.current.description}
                  </p>
                  <p className="text-xs text-gray-500">
                    Wind: {weather.current.windSpeed} m/s
                  </p>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
        {/* Accuracy circle showing GPS uncertainty */}
        {accuracy != null && (
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={Math.max(5, accuracy)}
            pathOptions={{ color: '#007bff', weight: 1, opacity: 0.4, fillOpacity: 0.08 }}
          />
        )}

        {/* Destination marker */}
        {destination && (
          <Marker position={[destination.lat, destination.lng]}>
            <Popup>
              <div className="text-center">
                <h3 className="font-bold text-neon-purple">Destination</h3>
                <p className="text-sm text-gray-600">
                  {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
                </p>
                {routeData && (
                  <div className="mt-2 p-2 bg-gray-100 rounded">
                    <p className="text-xs">
                      Distance: {(routeData.distance / 1000).toFixed(1)} km
                    </p>
                    <p className="text-xs">
                      Duration: {Math.round(routeData.duration / 60)} min
                    </p>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* POI markers */}
        {nearbyPOIs.map((poi) => (
          <Marker
            key={poi.id}
            position={[poi.coordinates[1], poi.coordinates[0]]}
            icon={fuelIcon}
          >
            <Popup>
              <div className="text-center max-w-xs">
                <h3 className="font-bold text-green-600">{poi.name}</h3>
                <p className="text-sm text-gray-600">{poi.address}</p>
                <p className="text-xs text-gray-500">
                  Distance: {Math.round(poi.distance)} m
                </p>
                {poi.phone && (
                  <p className="text-xs text-blue-600">📞 {poi.phone}</p>
                )}
                {poi.openingHours && (
                  <p className="text-xs text-gray-500">🕒 {poi.openingHours}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Emergency alert markers */}
        {emergencyAlerts.map((alert) => (
          <Marker
            key={alert.id}
            position={[alert.location.coordinates[1], alert.location.coordinates[0]]}
            icon={emergencyIcon}
          >
            <Popup>
              <div className="text-center max-w-xs">
                <h3 className="font-bold text-red-600">🚨 {alert.type.toUpperCase()}</h3>
                <p className="text-sm text-gray-600">{alert.description}</p>
                <p className="text-xs text-gray-500">
                  Distance: {Math.round(alert.distance)} m
                </p>
                <p className="text-xs text-gray-500">
                  Reported: {new Date(alert.createdAt).toLocaleTimeString()}
                </p>
                <button
                  onClick={() => {
                    // Handle emergency response
                    if (confirm('Respond to this emergency?')) {
                      axios.post(`${API_URL}/api/emergency/respond/${alert.id}`, {
                        message: 'On my way to help',
                        estimatedArrival: 10
                      }).then(() => {
                        alert('Response sent!')
                      }).catch(console.error)
                    }
                  }}
                  className="mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                >
                  Respond
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Control Panel */}
      <div className="absolute top-20 left-4 z-1000">
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="glass-morphism rounded-xl p-4 space-y-4 max-w-xs"
        >
          {/* Weather Info */}
          {weather && (
            <div className="text-center">
              <h3 className="text-sm font-bold text-neon-cyan mb-2">Weather</h3>
              <div className="flex items-center justify-between text-xs">
                <span>{weather.current.temperature}°C</span>
                <span>{weather.current.description}</span>
              </div>
              {!weather.rideConditions.isGoodForRiding && (
                <p className="text-xs text-red-400 mt-1">
                  ⚠️ Poor riding conditions
                </p>
              )}
            </div>
          )}

          {/* POI Filter */}
          <div>
            <h3 className="text-sm font-bold text-neon-cyan mb-2">Find Nearby</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'fuel', label: '⛽ Fuel', icon: '⛽' },
                { type: 'repair', label: '🔧 Repair', icon: '🔧' },
                { type: 'medical', label: '🏥 Medical', icon: '🏥' },
                { type: 'food', label: '🍕 Food', icon: '🍕' }
              ].map(({ type, label, icon }) => (
                <button
                  key={type}
                  onClick={() => handlePOITypeChange(type)}
                  className={`p-2 rounded text-xs transition-all ${
                    selectedPOIType === type
                      ? 'bg-neon-cyan text-dark-900'
                      : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            {isLoading && (
              <div className="loading-dots mt-2">
                <div></div>
                <div></div>
                <div></div>
              </div>
            )}
          </div>

          {/* Emergency Buttons */}
          <div>
            <h3 className="text-sm font-bold text-red-400 mb-2">Emergency</h3>
            <div className="space-y-2">
              <button
                onClick={() => sendEmergencyAlert('accident')}
                className="w-full p-2 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
              >
                🚨 Accident Alert
              </button>
              <button
                onClick={() => sendEmergencyAlert('breakdown')}
                className="w-full p-2 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 transition-colors"
              >
                🛠️ Breakdown Help
              </button>
              <button
                onClick={() => sendEmergencyAlert('medical')}
                className="w-full p-2 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
              >
                🏥 Medical Emergency
              </button>
            </div>
          </div>

          {/* Route Info */}
          {routeData && (
            <div>
              <h3 className="text-sm font-bold text-neon-purple mb-2">Route</h3>
              <div className="text-xs space-y-1">
                <p>📍 Distance: {(routeData.distance / 1000).toFixed(1)} km</p>
                <p>⏱️ Duration: {Math.round(routeData.duration / 60)} min</p>
                <button
                  onClick={() => {
                    setDestination(null)
                    setRouteData(null)
                  }}
                  className="w-full p-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  Clear Route
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Emergency Alerts Counter */}
      {emergencyAlerts.length > 0 && (
        <div className="absolute top-20 right-4 z-1000">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="glass-morphism rounded-full p-3 text-center"
          >
            <div className="text-red-400 text-lg font-bold">🚨</div>
            <div className="text-xs text-red-400">
              {emergencyAlerts.length} alerts
            </div>
          </motion.div>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-1000">
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass-morphism rounded-lg p-3 text-center"
        >
          <p className="text-xs text-gray-300">
            Click on map to set destination • Use controls to find nearby services
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default Map