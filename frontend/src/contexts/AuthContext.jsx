import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

  // Configure axios defaults
  useEffect(() => {
    // Ensure all relative axios calls go to the backend server
    axios.defaults.baseURL = API_URL

    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete axios.defaults.headers.common['Authorization']
    }
  }, [token, API_URL])

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          // Attach Authorization header explicitly to avoid race where defaults aren't set yet
          const response = await axios.get(`${API_URL}/api/auth/profile`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          setUser(normalizeUser(response.data.user))
        } catch (error) {
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
        }
      }
      setLoading(false)
    }

    checkAuth()
  }, [token, API_URL])

  // Global axios response interceptor: auto-logout on 401 to keep UI state consistent
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Clear local auth state
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
        }
        return Promise.reject(error)
      }
    )

    return () => {
      axios.interceptors.response.eject(id)
    }
  }, [])

  const normalizeUser = (u) => (u ? { id: u.id || u._id, _id: u._id || u.id, ...u } : u)

  const login = async (email, password) => {
    try {
      console.log('Attempting login with:', { email, API_URL })
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password
      })
      
      console.log('Login response:', response.data)
      
  const { token: newToken, user: userData } = response.data
      
  setToken(newToken)
  setUser(normalizeUser(userData))
      // Ensure Authorization header is set immediately to avoid race with useEffect
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
      localStorage.setItem('token', newToken)
      
      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed'
      }
    }
  }

  const register = async (userData) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, userData)
      
      const { token: newToken, user: newUser } = response.data
      
      setToken(newToken)
      setUser(normalizeUser(newUser))
      localStorage.setItem('token', newToken)
      // Set header immediately like in login to avoid race conditions
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
      
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed'
      }
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    delete axios.defaults.headers.common['Authorization']
  }

  const updateProfile = async (profileData) => {
    try {
      const response = await axios.put(`${API_URL}/api/auth/profile`, profileData)
      setUser(normalizeUser(response.data.user))
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Profile update failed'
      }
    }
  }

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    updateProfile,
    isAuthenticated: !!token && !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}