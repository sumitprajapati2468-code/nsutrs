import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
  PaperAirplaneIcon,
  PhoneIcon,
  VideoCameraIcon,
  UserGroupIcon,
  MapPinIcon,
  EllipsisVerticalIcon,
  PhotoIcon,
  MicrophoneIcon,
  XMarkIcon,
  PlusIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import { ChatBubbleLeftIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import axios from 'axios'

const Chat = () => {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [activeChat, setActiveChat] = useState(null)
  const [nearbyRiders, setNearbyRiders] = useState([])
  const [groupChats, setGroupChats] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [showParticipants, setShowParticipants] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [addSelectedUsers, setAddSelectedUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  
  const { user } = useAuth()
  const { socket, connected, onlineUsers, joinChatRoom } = useSocket()

  useEffect(() => {
    // Don't attempt to fetch protected resources before we know the user (and auth header) is ready
    if (!user) return

    fetchNearbyRiders()
    fetchGroupChats()
    scrollToBottom()
    socket.on('voice-call-incoming', (data) => {
      const accept = window.confirm(`Incoming voice call from ${data.callerName}. Accept?`)
      if (accept) {
        // Handle voice call acceptance
        socket.emit('voice-call-accepted', { callId: data.callId })
      } else {
        socket.emit('voice-call-declined', { callId: data.callId })
      }
    })

    // Listen for new messages from server and update UI
    const handleNewMessage = (payload) => {
      try {
        const { chatId, message } = payload
        if (!chatId || !message) return

        // If the message belongs to the active chat, append it
        if (activeChat && (activeChat.id === chatId || activeChat.id === (message.room || chatId))) {
          setMessages(prev => [...prev, {
            _id: message._id,
            sender: message.sender,
            content: message.content,
            type: message.type,
            media: message.media,
            location: message.location,
            timestamp: message.timestamp
          }])
          setTimeout(scrollToBottom, 50)
        } else {
          // Optionally: show toast/unread indicator for other rooms
          console.log('New message for other room', chatId)
        }
      } catch (e) {
        console.error('Error handling new-message', e)
      }
    }

    const handleJoinedRoom = ({ roomId }) => {
      // when server acknowledges join, we can fetch messages
      if (activeChat && activeChat.id === roomId) {
        fetchMessages(roomId)
      }
    }

    const handleUserJoinedChat = (data) => {
      // update participants list when someone joins
      if (!data || !data.userId) return
      setGroupChats(prev => prev.map(g => {
        if (g.id === activeChat?.id) {
          // avoid duplicates
          const already = g.participants.some(p => (p.user?._id || p.user || p) === data.userId)
          if (!already) {
            return { ...g, participants: [...g.participants, { user: data.userId }] }
          }
        }
        return g
      }))
    }

    const handleUserLeftChat = (data) => {
      if (!data || !data.userId) return
      setGroupChats(prev => prev.map(g => {
        if (g.id === activeChat?.id) {
          return { ...g, participants: g.participants.filter(p => (p.user?._id || p.user || p) !== data.userId) }
        }
        return g
      }))
    }

    socket.on('new-message', handleNewMessage)
    socket.on('joined-chat-room', handleJoinedRoom)
    socket.on('user-joined-chat', handleUserJoinedChat)
    socket.on('user-left-chat', handleUserLeftChat)

    return () => {
      socket.off('voice-call-incoming')
      socket.off('new-message', handleNewMessage)
      socket.off('joined-chat-room', handleJoinedRoom)
      socket.off('user-joined-chat', handleUserJoinedChat)
      socket.off('user-left-chat', handleUserLeftChat)
      socket.off('user-typing')
    }
  }, [socket, activeChat, user])

  useEffect(() => {
    if (activeChat) {
      if (socket && joinChatRoom) {
        joinChatRoom(activeChat.id)
      }
      fetchMessages(activeChat.id)
    }
  }, [activeChat])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchNearbyRiders = async () => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Use backend nearby users endpoint. It expects longitude then latitude.
          const response = await axios.get('/api/auth/nearby-users', {
            params: {
              longitude: position.coords.longitude,
              latitude: position.coords.latitude,
              radius: 5000
              , includeOffline: true // request both online and offline users
            }
          })
          setNearbyRiders(response.data.users || [])
        } catch (error) {
          console.error('Nearby riders fetch error:', error)
        }
      },
      (error) => console.error('Location error:', error)
    )
  }

  const fetchGroupChats = async () => {
    try {
      const response = await axios.get('/api/chat/rooms', { params: { type: 'group' } })
      const rooms = response.data.rooms || []
      setGroupChats(rooms.map(r => ({ id: r._id || r.id, name: r.name, participants: r.participants || [] })))
    } catch (error) {
      console.error('Group chats fetch error:', error)
    }
  }

  const fetchMessages = async (chatId) => {
    try {
      const response = await axios.get(`/api/chat/rooms/${chatId}/messages`)
      setMessages(response.data.messages)
      setTimeout(scrollToBottom, 100)
    } catch (error) {
      console.error('Messages fetch error:', error)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat) return

    try {
      if (socket) {
        socket.emit('send-message', {
          roomId: activeChat.id,
          message: newMessage,
          messageType: 'text'
        })
        setNewMessage('')
      } else {
        // fallback: save via HTTP
        const response = await axios.post(`/api/chat/rooms/${activeChat.id}/messages`, { message: newMessage })
        setMessages(prev => [...prev, response.data.message])
        setNewMessage('')
      }
      scrollToBottom()
    } catch (error) {
      console.error('Send message error:', error)
    }
  }

  const startPrivateChat = async (riderId) => {
    try {
      const response = await axios.post('/api/chat/rooms', {
        name: 'Private Chat',
        type: 'private',
        participants: [user.id, riderId]
      })
      const room = response.data.room
      setActiveChat({
        id: room._id || room.id,
        name: room.name || 'Private Chat',
        type: room.type || 'private',
        participants: room.participants || []
      })
    } catch (error) {
      console.error('Start private chat error:', error)
    }
  }

  const createGroupChat = async () => {
    if (!newGroupName.trim() || selectedUsers.length === 0) {
      alert('Please enter a group name and select at least one participant')
      return
    }

    try {
      // backend expects POST /api/chat/rooms and returns { room }
      const response = await axios.post('/api/chat/rooms', {
        name: newGroupName,
        type: 'group',
        participants: selectedUsers
      })

      const room = response.data.room

      // normalize the room object for frontend usage
      const normalized = {
        id: room._id || room.id,
        name: room.name,
        participants: room.participants || []
      }

      setGroupChats(prev => [...prev, normalized])
      setShowCreateGroup(false)
      setNewGroupName('')
      setSelectedUsers([])

      setActiveChat({
        id: normalized.id,
        name: normalized.name,
        type: 'group',
        participants: normalized.participants
      })

      // join the newly created room on the socket so messages flow immediately
      if (socket && joinChatRoom) {
        joinChatRoom(normalized.id)
      }

      // Ensure the server-side list is reflected in the UI (avoids race where creation succeeded but
      // subsequent page refresh / fetch may not yet include the new room due to auth/fetch timing)
      await fetchGroupChats()
    } catch (error) {
      console.error('Create group error:', error)
    }
  }

  const startVoiceCall = () => {
    if (!activeChat || !socket) return

    // pick a target participant (first other user)
    const target = activeChat.participants.find(p => {
      const pid = p?.user?._id || p?.user || p?._id || p
      return pid?.toString() !== (user.id || user._id)?.toString()
    })
    const targetUserId = target ? (target.user?._id || target.user || target._id || target) : null

    if (!targetUserId) {
      alert('No other participant available to call')
      return
    }

    socket.emit('call-user', {
      targetUserId: targetUserId.toString(),
      offer: null, // placeholder - real WebRTC offer should be added here
      callType: 'voice'
    })

    alert('Voice call signaling sent (if the peer is online)')
  }

  const startVideoCall = () => {
    if (!activeChat || !socket) return

    const target = activeChat.participants.find(p => {
      const pid = p?.user?._id || p?.user || p?._id || p
      return pid?.toString() !== (user.id || user._id)?.toString()
    })
    const targetUserId = target ? (target.user?._id || target.user || target._id || target) : null

    if (!targetUserId) {
      alert('No other participant available to call')
      return
    }

    socket.emit('call-user', {
      targetUserId: targetUserId.toString(),
      offer: null,
      callType: 'video'
    })

    alert('Video call signaling sent (if the peer is online)')
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file || !activeChat) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('chatId', activeChat.id)

    try {
      const response = await axios.post('/api/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      setMessages(prev => [...prev, response.data.message])
      scrollToBottom()
    } catch (error) {
      console.error('File upload error:', error)
    }
  }

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const toggleAddSelection = (userId) => {
    setAddSelectedUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId])
  }

  const addMembersToRoom = async () => {
    if (!addSelectedUsers.length || !activeChat) {
      alert('Select at least one user to add')
      return
    }

    try {
      const response = await axios.post(`/api/chat/rooms/${activeChat.id}/add`, {
        participants: addSelectedUsers
      })

      // update activeChat participants locally
      const updatedParticipants = response.data.participants || []
      setActiveChat(prev => ({ ...prev, participants: updatedParticipants }))
      // Keep the sidebar list in sync as well
      setGroupChats(prev => prev.map(g => g.id === (activeChat?.id) ? { ...g, participants: updatedParticipants } : g))
      // Re-sync from server to be safe
      await fetchGroupChats()
      setShowAddMembers(false)
      setAddSelectedUsers([])
      alert('Members added successfully')
    } catch (err) {
      console.error('Add members error:', err)
      alert(err?.response?.data?.message || 'Failed to add members')
    }
  }

  const filteredRiders = nearbyRiders.filter(rider =>
    rider.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-7xl mx-auto h-[calc(100vh-6rem)]">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
          
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-orbitron font-bold text-white">Chat</h1>
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="p-2 bg-neon-cyan/20 hover:bg-neon-cyan/30 text-neon-cyan rounded-full transition-colors"
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
              </div>
              
              <div className={`flex items-center px-3 py-2 rounded ${
                connected ? 'bg-green-900/20 text-green-300' : 'bg-red-900/20 text-red-300'
              }`}>
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  connected ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <span className="text-sm">
                  {connected ? `${onlineUsers.length} riders online` : 'Offline'}
                </span>
              </div>
            </motion.div>

            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search riders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-600 border border-gray-600 rounded text-white focus:border-neon-cyan focus:outline-none"
              />
            </div>

            {/* Group Chats */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-lg font-semibold text-white mb-3">Group Chats</h2>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {groupChats.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setActiveChat({
                      id: group.id,
                      name: group.name,
                      type: 'group',
                      participants: group.participants
                    })}
                    className={`w-full text-left p-3 rounded transition-colors ${
                      activeChat?.id === group.id 
                        ? 'bg-neon-cyan/20 border border-neon-cyan/30' 
                        : 'bg-dark-600 hover:bg-dark-500'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-neon-purple to-neon-cyan rounded-full flex items-center justify-center">
                        <UserGroupIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{group.name}</h3>
                        <p className="text-xs text-gray-400">
                          {group.participants.length} members
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Nearby Riders */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-lg font-semibold text-white mb-3">Nearby Riders</h2>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {filteredRiders.map((rider) => (
                  <button
                    key={rider._id || rider.id}
                    onClick={() => startPrivateChat(rider._id || rider.id)}
                    className="w-full text-left p-3 bg-dark-600 hover:bg-dark-500 rounded transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <div className="w-10 h-10 bg-gradient-to-br from-neon-cyan to-neon-purple rounded-full flex items-center justify-center">
                            <span className="text-white font-bold">
                              {rider.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          {/* Online indicator (green) or offline (gray) */}
                          {onlineUsers.some(u => u.userId === (rider._id || rider.id)) ? (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-dark-800" />
                          ) : (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-gray-500 rounded-full border-2 border-dark-800" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-white font-medium">{rider.name}</h3>
                          <div className="flex items-center space-x-1 text-xs text-gray-400">
                            <MapPinIcon className="w-3 h-3" />
                            <span>{Math.round(rider.distance)}m away</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-3">
            {activeChat ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col card-glow"
              >
                {/* Chat Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-neon-purple to-neon-cyan rounded-full flex items-center justify-center">
                      {activeChat.type === 'group' ? (
                        <UserGroupIcon className="w-5 h-5 text-white" />
                      ) : (
                        <span className="text-white font-bold">
                          {activeChat.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">{activeChat.name}</h2>
                      <p className="text-sm text-gray-400">
                        {activeChat.type === 'group' 
                          ? `${activeChat.participants.length} members`
                          : 'Private chat'
                        }
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={startVoiceCall}
                      className="p-2 text-gray-400 hover:text-neon-cyan transition-colors"
                    >
                      <PhoneIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => startVideoCall()}
                      className="p-2 text-gray-400 hover:text-neon-cyan transition-colors"
                    >
                      <VideoCameraIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setShowParticipants(true)}
                      className="p-2 text-gray-400 hover:text-neon-cyan transition-colors"
                    >
                      <EllipsisVerticalIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        (message.sender.id || message.sender._id) === (user.id || user._id) ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          (message.sender.id || message.sender._id) === (user.id || user._id)
                            ? 'bg-neon-cyan text-dark-800'
                            : 'bg-dark-600 text-white'
                        }`}
                      >
                        {(message.sender.id || message.sender._id) !== (user.id || user._id) && activeChat.type === 'group' && (
                          <p className="text-xs text-gray-400 mb-1">{message.sender.name}</p>
                        )}
                        
                        {message.type === 'text' && (
                          <p className="text-sm">{message.content}</p>
                        )}
                        
                        {message.type === 'image' && (
                          <img 
                            src={message.fileUrl} 
                            alt="Shared image" 
                            className="max-w-full rounded"
                          />
                        )}
                        
                        {message.type === 'location' && (
                          <div className="flex items-center space-x-2">
                            <MapPinIcon className="w-4 h-4" />
                            <span className="text-sm">Location shared</span>
                          </div>
                        )}
                        
                        <p className="text-xs opacity-75 mt-1">
                          {formatTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="p-4 border-t border-gray-700">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-gray-400 hover:text-neon-cyan transition-colors"
                    >
                      <PhotoIcon className="w-5 h-5" />
                    </button>
                    
                    <button
                      onClick={() => setIsRecording(!isRecording)}
                      className={`p-2 transition-colors ${
                        isRecording 
                          ? 'text-red-400 animate-pulse' 
                          : 'text-gray-400 hover:text-neon-cyan'
                      }`}
                    >
                      <MicrophoneIcon className="w-5 h-5" />
                    </button>
                    
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-2 bg-dark-600 border border-gray-600 rounded text-white focus:border-neon-cyan focus:outline-none"
                    />
                    
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim()}
                      className="p-2 bg-neon-cyan text-dark-800 rounded hover:bg-neon-cyan/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center card-glow">
                <div className="text-center">
                  <ChatBubbleLeftIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-white mb-2">
                    Select a chat to start messaging
                  </h2>
                  <p className="text-gray-400">
                    Choose from nearby riders or create a group chat
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create Group Modal */}
        {showCreateGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-dark-800 rounded-lg p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Create Group Chat</h3>
                <button
                  onClick={() => setShowCreateGroup(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Group name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2 bg-dark-600 border border-gray-600 rounded text-white focus:border-neon-cyan focus:outline-none"
                />
                
                <div>
                  <h4 className="text-white font-medium mb-2">Select participants:</h4>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {/* Nearby riders first (if any) */}
                    {nearbyRiders.map((rider) => (
                      <label
                        key={rider._id || rider.id}
                        className="flex items-center space-x-3 p-2 hover:bg-dark-600 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(rider._id || rider.id)}
                          onChange={() => toggleUserSelection(rider._id || rider.id)}
                          className="text-neon-cyan"
                        />
                        <span className="text-white">{rider.name}</span>
                      </label>
                    ))}

                    {/* Fallback: online users (exclude those already shown and exclude self) */}
                    {onlineUsers
                      .filter(u => !nearbyRiders.some(r => (r._id || r.id) === u.userId) && u.userId !== (user?.id || user?._id))
                      .map((u) => (
                        <label
                          key={u.userId}
                          className="flex items-center space-x-3 p-2 hover:bg-dark-600 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(u.userId)}
                            onChange={() => toggleUserSelection(u.userId)}
                            className="text-neon-cyan"
                          />
                          <span className="text-white">{u.name || u.email || u.userId}</span>
                        </label>
                      ))}
                  </div>

                  {/* Debug / quick-inspect button: prints arrays to console so you can see what's available */}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        // helpful quick-debug: inspect participant sources in console
                        // eslint-disable-next-line no-console
                        console.log('Create Group debug - onlineUsers:', onlineUsers)
                        // eslint-disable-next-line no-console
                        console.log('Create Group debug - nearbyRiders:', nearbyRiders)
                        // eslint-disable-next-line no-console
                        alert('Printed onlineUsers and nearbyRiders to the console')
                      }}
                      className="px-3 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
                    >
                      Print participants to console
                    </button>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={createGroupChat}
                    className="flex-1 px-4 py-2 bg-neon-cyan text-dark-800 rounded hover:bg-neon-cyan/80 transition-colors"
                  >
                    Create Group
                  </button>
                  <button
                    onClick={() => setShowCreateGroup(false)}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        {/* Participants Modal */}
        {showParticipants && activeChat && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="bg-dark-800 rounded-lg p-6 w-full max-w-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Participants</h3>
                <button
                  onClick={() => setShowParticipants(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* If current user is admin or moderator, show Add Members button */}
              {activeChat && activeChat.participants && (
                (() => {
                  const myPart = activeChat.participants.find(p => (p.user && (p.user._id || p.user))?.toString() === (user?.id || user?._id))
                  const canAdd = myPart && (myPart.role === 'admin' || myPart.role === 'moderator')
                  return canAdd ? (
                    <div className="mb-3">
                      <button onClick={() => setShowAddMembers(true)} className="px-3 py-1 bg-neon-cyan text-dark-800 rounded">Add Members</button>
                    </div>
                  ) : null
                })()
              )}

              <div className="space-y-3 max-h-72 overflow-y-auto">
                {activeChat.participants.map((p, idx) => {
                  const userObj = p.user || p
                  const id = userObj?._id || userObj?.id || userObj
                  const displayName = userObj?.name || userObj?.email || id
                  return (
                    <div key={id || idx} className="flex items-center justify-between p-2 rounded hover:bg-dark-700">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-neon-cyan to-neon-purple rounded-full flex items-center justify-center text-white font-bold">{(displayName || '').charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="text-white">{displayName}</div>
                          <div className="text-xs text-gray-400">{id?.toString?.()}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Add Members Modal */}
        {showAddMembers && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-dark-800 rounded-lg p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Add Members to "{activeChat?.name}"</h3>
                <button onClick={() => setShowAddMembers(false)} className="text-gray-400 hover:text-white"><XMarkIcon className="w-5 h-5"/></button>
              </div>

              <div className="space-y-3 max-h-56 overflow-y-auto">
                {nearbyRiders.map(r => (
                  <label key={r._id || r.id} className="flex items-center space-x-3 p-2 hover:bg-dark-700 rounded cursor-pointer">
                    <input type="checkbox" checked={addSelectedUsers.includes(r._id || r.id)} onChange={() => toggleAddSelection(r._id || r.id)} />
                    <span className="text-white">{r.name}</span>
                  </label>
                ))}

                {onlineUsers.filter(u => !nearbyRiders.some(r => (r._id || r.id) === u.userId)).map(u => (
                  <label key={u.userId} className="flex items-center space-x-3 p-2 hover:bg-dark-700 rounded cursor-pointer">
                    <input type="checkbox" checked={addSelectedUsers.includes(u.userId)} onChange={() => toggleAddSelection(u.userId)} />
                    <span className="text-white">{u.name || u.email || u.userId}</span>
                  </label>
                ))}
              </div>

              <div className="mt-4 flex space-x-2">
                <button onClick={addMembersToRoom} className="flex-1 px-4 py-2 bg-neon-cyan text-dark-800 rounded">Add Selected</button>
                <button onClick={() => { setShowAddMembers(false); setAddSelectedUsers([]) }} className="px-4 py-2 bg-gray-600 text-white rounded">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default Chat