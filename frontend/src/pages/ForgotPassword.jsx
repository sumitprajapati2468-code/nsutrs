import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import axios from 'axios'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')

    try {
      // Attempt to call a conventional endpoint. If backend doesn't implement it yet,
      // we'll still show a friendly fallback message.
      const response = await axios.post('/api/auth/forgot-password', { email })
      if (response?.data?.success) {
        setMessage(response.data.message || 'If an account exists, a reset link has been sent to your email.')
      } else {
        // Backend responded but indicated failure — show returned message or fallback
        setMessage(response?.data?.message || 'If an account exists, a reset link has been sent.')
      }
    } catch (err) {
      // Show a friendly message even when endpoint is missing (development/demo)
      setMessage('If an account exists for that email, you will receive a reset link shortly. (Demo fallback)')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h2 className="text-3xl font-orbitron font-bold text-white">Forgot password?</h2>
          <p className="mt-2 text-gray-400">Enter your email and we'll send instructions to reset your password.</p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="card-glow space-y-6"
        >
          {message && (
            <div className="bg-green-900/20 border border-green-500/30 text-green-400 px-4 py-3 rounded">
              {message}
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-4 pr-4 py-3 bg-dark-600 border border-gray-600 rounded text-white placeholder-gray-400 focus:border-neon-cyan focus:outline-none transition-colors"
              placeholder="Enter your email"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 bg-neon-cyan text-dark-800 font-semibold rounded hover:bg-neon-cyan/80 transition-colors ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </motion.form>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <p className="text-gray-400">
            Remembered your password?{' '}
            <Link to="/login" className="text-neon-cyan hover:text-neon-purple transition-colors font-medium">Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default ForgotPassword
