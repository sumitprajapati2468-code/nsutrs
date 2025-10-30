import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import axios from 'axios'

const Chatbot = () => {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatWindowRef = useRef(null)
  const navigate = useNavigate()

  // We'll call the backend proxy (/api/ai/gpt) which uses the server-side OpenAI key.
  // This avoids exposing secrets to the browser.

  const appendMessage = (text, cls) => {
    setMessages(prev => [...prev, { text, cls }])
    setTimeout(() => {
      chatWindowRef.current?.scrollTo({ top: chatWindowRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
  }

  const sendMessage = async () => {
    const content = input.trim()
    if (!content) return
    appendMessage(content, 'user')
    setInput('')
    appendMessage('… thinking', 'bot')
    setLoading(true)

    try {
      // Send message to backend proxy which will forward to OpenAI using server-side key
  // Use Vite env via import.meta.env in the browser (process is not defined in the browser)
  const payload = { messages: [{ role: 'user', content }], model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-3.5-turbo' }

      let response
      try {
        response = await axios.post('/api/ai/gpt', payload)
      } catch (err) {
        // If auth failure (401), try the temporary public proxy if available
        const status = err?.response?.status
        if (status === 401) {
          console.warn('Auth failed for /api/ai/gpt — attempting /api/ai/gpt-public for testing')
          response = await axios.post('/api/ai/gpt-public', payload)
        } else {
          throw err
        }
      }

      // If proxy returned OpenAI response, extract the assistant reply
      const data = response.data
      const reply = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || (data?.responses && data.responses[0]) || 'No reply'

      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { text: reply, cls: 'bot' } : m))
    } catch (err) {
      console.error('Chatbot error:', err?.response?.data || err.message)
      const serverMsg = err?.response?.data?.error || err?.response?.data || err.message
      // show helpful message to user
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { text: 'Error: ' + JSON.stringify(serverMsg), cls: 'bot' } : m))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-orbitron font-bold text-neon-cyan">Rider Saathi AI Chat Bot</h1>
          <button onClick={() => navigate('/')} className="text-gray-300 hover:text-neon-cyan">← Back to Home</button>
        </div>

        <div className="card-glow p-4">
          <div ref={chatWindowRef} id="chat-window" className="h-96 overflow-auto p-4 rounded bg-dark-800 border border-gray-800">
            {messages.length === 0 && (
              <div className="text-gray-400">Ask me anything about Rider Saathi — features, navigation, emergency assistance, or how things work.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`mb-3 max-w-[85%] p-3 rounded ${m.cls === 'user' ? 'ml-auto bg-gradient-to-r from-neon-cyan to-neon-purple text-dark-900' : 'bg-dark-700 border border-gray-700 text-gray-200'}`}>
                {m.text}
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }}
              placeholder="Ask me anything about Rider Saathi..."
              className="flex-1 px-4 py-3 bg-dark-700 border border-gray-700 rounded text-white focus:outline-none"
            />
            <button onClick={sendMessage} disabled={loading} className="px-4 py-3 rounded bg-gradient-to-r from-neon-cyan to-neon-purple text-dark-900 font-semibold disabled:opacity-50">
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Chatbot
