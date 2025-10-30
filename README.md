# Rider Sathi - Smart Ride Companion Platform

🚀 **A Full-Stack 3D Animated Website for Bikers and Travelers**

## 🌟 Features

- **3D Interactive Homepage** with Three.js bike animation
- **Real-time GPS Tracking** using OpenStreetMap & OSRM
- **Group Voice & Video Calls** with WebRTC
- **AI Ride Assistant** powered by Rasa
- **Weather Integration** with OpenWeatherMap
- **Emergency Alerts & Medical Assistance**
- **Rewards System** for helping fellow riders
- **Live Group Chat** with Socket.io
- **Nearby Essentials Finder** (fuel, repair, medical)
- **Voice Commands** with Speech Recognition
- **Offline Maps** capability

## 🛠 Tech Stack

### Frontend
- React + Vite
- Three.js for 3D animations
- TailwindCSS + Framer Motion
- Socket.io-client
- Leaflet for maps
- Lottie for animations

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Socket.io for real-time communication
- JWT Authentication
- Integration with external APIs

### APIs & Services
- OpenStreetMap / OSRM for routing
- OpenWeatherMap for weather
- Rasa AI for chatbot
- Jitsi/WebRTC for calls
- Overpass API for POI search

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- Docker & Docker Compose
- MongoDB (or use Docker)

### Installation

1. **Clone and setup**
```bash
git clone <repository>
cd rider-sathi
```

2. **Environment Setup**
```bash
# Backend environment
cp backend/.env.example backend/.env
# Add your API keys for OpenWeatherMap, etc.
```

3. **Docker Development (Recommended)**
```bash
docker-compose up --build
```

4. **Manual Development**
```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend (in new terminal)
cd backend
npm install
npm run dev
```

### Access the Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- MongoDB: localhost:27017

## 🎯 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile

### GPS & Tracking
- `POST /api/gps/location` - Update location
- `GET /api/gps/route` - Get route between points
- `WebSocket /gps` - Real-time location updates

### Emergency
- `POST /api/emergency/alert` - Send emergency alert
- `GET /api/emergency/nearby-medical` - Find nearby hospitals

### Weather
- `GET /api/weather/current` - Current weather
- `GET /api/weather/forecast` - Weather forecast

### Rewards
- `GET /api/rewards/leaderboard` - Get leaderboard
- `POST /api/rewards/claim` - Claim reward points

### Chat
- `WebSocket /chat` - Real-time messaging

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up

# Build and start
docker-compose up --build

# Stop services
docker-compose down

# View logs
docker-compose logs -f backend
```

## 🔧 Configuration

### Environment Variables

Create `backend/.env`:
```env
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/ridersathi
JWT_SECRET=your-super-secret-jwt-key
WEATHER_API_KEY=your-openweather-api-key
RASA_URL=http://localhost:5005
```

### API Keys Required
- **OpenWeatherMap**: Get free API key from openweathermap.org
- **Rasa**: Setup local Rasa server or use cloud version

## 📱 Features Walkthrough

### 1. 3D Homepage
- Rotating motorcycle model
- Smooth GSAP animations
- Interactive navigation

### 2. GPS Tracking
- Real-time location updates
- Route optimization with OSRM
- Offline map caching

### 3. Emergency System
- One-tap emergency alerts
- Automatic nearby hospital finder
- Group notification system

### 4. AI Assistant
- Voice command recognition
- Natural language processing
- Route suggestions and help

### 5. Social Features
- Group ride coordination
- Live chat during rides
- Reward points for helping others

## 🎨 UI/UX Features

- **Neon Glow Theme**: Dark mode with cyan/purple accents
- **Smooth Transitions**: Framer Motion animations
- **3D Elements**: Three.js interactive components
- **Responsive Design**: Mobile-first approach
- **Loading Animations**: Lottie and custom loaders

## 🔒 Security Features

- JWT token authentication
- Rate limiting on APIs
- Input validation and sanitization
- CORS configuration
- Helmet.js security headers

## 🧪 Testing

```bash
# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
npm test
```

## 📦 Deployment

### Production Build
```bash
# Frontend
npm run build

# Backend
npm start
```

### Cloud Deployment
- **Frontend**: Vercel, Netlify
- **Backend**: Render, Railway, Heroku
- **Database**: MongoDB Atlas

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

- Create an issue for bugs
- Join our Discord for community support
- Check documentation in `/docs`

---

**Built with ❤️ for the riding community**