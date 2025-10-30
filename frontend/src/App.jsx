import React, { Suspense, useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import io from 'socket.io-client'

// Components
import IntroVideo from './components/IntroVideo'
import Navbar from './components/Navbar'
import ScrollToTop from './components/ScrollToTop'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Map from './pages/Map'
import Emergency from './pages/Emergency'
import Chat from './pages/Chat'
import Chatbot from './pages/Chatbot'
import Profile from './pages/Profile'
import FeatureDetails from './pages/FeatureDetails'
import ForgotPassword from './pages/ForgotPassword'

// Context
import { AuthProvider } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'

function App() {
  const [loading, setLoading] = useState(true)

  // Loading is controlled by the IntroVideo. We show the video and then hide it when it finishes.
  if (loading) {
    return <IntroVideo onFinish={() => setLoading(false)} />
  }

  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <ScrollToTop />
          <div className="min-h-screen bg-dark-900 text-white relative overflow-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 bg-gradient-to-br from-dark-900 via-dark-800 to-purple-900/20 pointer-events-none" />
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,255,0.1),transparent_50%)] pointer-events-none" />
            
            <Navbar />
            
            <main className="relative z-10">
              <AnimatePresence mode="wait">
                <Suspense fallback={
                  <div className="flex items-center justify-center min-h-screen">
                    <div className="loading-dots">
                      <div></div>
                      <div></div>
                      <div></div>
                    </div>
                  </div>
                }>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/feature/:slug" element={<FeatureDetails />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route 
                      path="/dashboard" 
                      element={
                        <ProtectedRoute>
                          <Dashboard />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/map" 
                      element={
                        <ProtectedRoute>
                          <Map />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/emergency" 
                      element={
                        <ProtectedRoute>
                          <Emergency />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/chat" 
                      element={
                        <ProtectedRoute>
                          <Chat />
                        </ProtectedRoute>
                      } 
                    />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/chatbot" element={<Chatbot />} />
                    <Route 
                      path="/profile" 
                      element={
                        <ProtectedRoute>
                          <Profile />
                        </ProtectedRoute>
                      } 
                    />
                  </Routes>
                </Suspense>
              </AnimatePresence>
            </main>
          </div>
        </Router>
      </SocketProvider>
    </AuthProvider>
  )
}

export default App