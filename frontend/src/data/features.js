import featureImg from '../assets/Rider-saathi-logo.jpeg'
import gpsImg from '../assets/rspics/GPS & Live Tracking.png'
import accidentImg from '../assets/rspics/Accident Alerts & Medical Assistance.png'
import aiImg from '../assets/rspics/AI Ride Assistant.png'
import weatherImg from '../assets/rspics/Weather Updates.png'
import groupVoiceImg from '../assets/rspics/Group Voice & Bluetooth Calls.png'
import groupChatImg from '../assets/rspics/Group Chat.png'
import rewardsImg from '../assets/rspics/Rewards for Helping Riders.png'
import deadBatteryImg from '../assets/rspics/Dead Battery Alerts.png'
import nearbyImg from '../assets/rspics/Nearby Essentials.png'
import voiceCmdImg from '../assets/rspics/Voice Commands.png'
import externalImg from '../assets/rspics/External Device Connectivity.png'
import offlineImg from '../assets/rspics/offline_map.jpeg'

const features = [
  {
    icon: '🛰️',
    title: 'Real-time GPS Tracking',
    slug: 'gps-tracking',
  image: gpsImg,
    description: 'Advanced GPS tracking with live location sharing and route optimization using OpenStreetMap.',
    longDescription: `Imagine you are on a group ride through winding mountain roads where it's easy to get separated. The GPS & Live Tracking feature transforms this potential anxiety into a seamless, coordinated experience. Each rider in your group appears as a moving icon on a shared map within the app. This allows the ride leader to ensure no one has fallen behind or taken a wrong turn. For the riders, it provides the comfort of knowing exactly where their friends are, making it simple to regroup after traffic lights or at planned stops. This feature also provides immense peace of mind for family and friends back home, who can be given access to track your journey and know that you are safe and on schedule.`
  },
  {
    icon: '🚨',
    title: 'Emergency Assistance',
    slug: 'emergency-assistance',
  image: accidentImg,
    description: 'One-tap emergency alerts with automatic nearby hospital finder and instant notifications.',
    longDescription: `This is your digital guardian angel. Using your phone's built-in sensors like the accelerometer and gyroscope, the app can detect the sudden impact and G-forces associated with a crash. When a potential accident is detected, it starts a countdown. If you're okay, you can simply cancel the alert. If you don't respond, the app automatically sends an emergency message containing your precise GPS coordinates to your pre-selected emergency contacts. In a critical situation where every second matters, this automated system can be the difference between a minor incident and a tragedy, ensuring that help is dispatched to your exact location even if you are incapacitated and unable to call for it yourself.`
  },
  {
    icon: '🤖',
    title: 'AI Ride Assistant',
    slug: 'ai-ride-assistant',
  image: aiImg,
    description: 'Intelligent voice assistant powered by Rasa AI for navigation help and emergency support.',
    longDescription: `Think of this as having an experienced riding expert along with you on every journey. The AI Ride Assistant analyzes multiple data points in real-time—your speed, lean angle, the road ahead, and historical data from other riders. It can then offer predictive advice through your helmet speaker. It might give you a heads-up about a particularly challenging hairpin turn coming up, suggest a smoother riding line for better cornering, or even advise you to take a break if it detects signs of rider fatigue based on the duration and intensity of your ride. This intelligent, personalized feedback helps you become a safer, more efficient, and more confident rider over time.`
  },
  {
    icon: '🌤️',
    title: 'Weather Integration',
    slug: 'weather-integration',
  image: weatherImg,
    description: 'Real-time weather updates and road condition alerts to plan your rides better.',
    longDescription: `Riding is as much about the environment as it is about the road, and weather is a critical factor. This feature acts as your personal meteorologist, providing dynamic weather updates tailored to your specific route and timeline. It goes beyond a simple forecast, alerting you to incoming rain showers, dangerous crosswinds, or sudden temperature drops you might encounter as you gain altitude. This allows for proactive decision-making. You can choose to put on your rain gear before the downpour starts, take a break to let a storm pass, or even have the app suggest an alternate route to bypass an area with hazardous weather conditions, ensuring your ride is as safe and comfortable as possible.`
  },
  {
    icon: '💬',
    title: 'Group Communication',
    slug: 'group-communication',
  image: groupVoiceImg,
    description: 'Live group chat and voice calls with fellow riders using WebRTC technology.',
    longDescription: `Group Voice & Bluetooth Calls: This feature effectively creates a private, hands-free intercom system for your entire riding group. By pairing your helmet's Bluetooth headset to the app, you can engage in real-time, continuous conversations with fellow riders. This is a game-changer for on-road communication, replacing ambiguous hand signals and the need to pull over. You can instantly warn the group about a road hazard like gravel or a pothole, discuss a change of plans on the fly ("Let's take the next exit for a coffee break!"), or simply share the excitement of the ride. The crystal-clear audio ensures that crucial information is communicated effectively, dramatically enhancing both the safety and the social enjoyment of the journey.

Group Chat: Group Chat is the perfect tool for non-urgent, strategic communication within your riding group. While voice calls are for immediate alerts, the chat function is for planning and coordination. It's an ideal way to share a specific address, a link to a point of interest, or confirm the plan for the next stop without interrupting everyone's music or conversation. A rider can pull over safely to type a message, or a passenger can manage the chat. It keeps a log of the conversation, making it easy to refer back to information and ensuring everyone is on the same page for the day's ride.`
  },
  {
    icon: '🏆',
    title: 'Rewards System',
    slug: 'rewards-system',
  image: rewardsImg,
    description: 'Earn points for helping other riders and climb the community leaderboard.',
    longDescription: `This feature transforms the riding community from a loose network into an active support system. It gamifies the tradition of bikers helping bikers. If a rider in your vicinity reports an issue—like a mechanical failure or a flat tire—you might receive a notification. By navigating to their location and offering assistance, you can "check in" to the event. The rider who was helped can then confirm your assistance, earning you points, badges, or other rewards within the app. This not only encourages a culture of camaraderie and mutual support but also provides a tangible sense of security, knowing that a community of fellow riders is on standby to help if you ever find yourself in need.`
  },
  {
    icon: '🔋',
    title: 'Dead Battery Alert',
    slug: 'dead-battery-alert',
  image: deadBatteryImg,
    description: 'Automatic low-battery and dead-battery alerts with suggested nearby charging points and safety tips.',
    longDescription: `For the growing number of electric motorcycle and scooter riders, "range anxiety" is a constant concern. This feature directly addresses that fear by intelligently monitoring your vehicle's battery status, likely through a Bluetooth connection to the bike's management system. It doesn't just warn you when the battery is low; it provides smart alerts based on your proximity to known charging stations. For example, it might notify you, "Battery at 20%. The last charging station for the next 50 km is 5 km ahead." This allows for intelligent energy management and ensures you'll never be left stranded with a dead battery far from a power source.`
  },
  {
    icon: '📍',
    title: 'Near by Essential',
    slug: 'nearby-essential',
  image: nearbyImg,
    description: 'Find nearby essentials like petrol pumps, repair shops, hospitals and food using location-aware search.',
    longDescription: `Nearby Essentials: While any map can find a gas station, this feature is curated specifically for the needs of a rider. It's a smart map layer that understands what's truly essential during a journey on two wheels. It won't just find any fuel stop, but can prioritize those with premium fuel. It can differentiate between a general car mechanic and a specialized motorcycle repair shop. It can point you towards "biker-friendly" cafes with ample parking, scenic viewpoints perfect for a photo-op, or lodges known for welcoming motorcyclists. This level of curated information removes the guesswork and stress from finding services on the road, making your trip smoother and more enjoyable.`
  },
  {
    icon: '🎙️',
    title: 'Voice Command',
    slug: 'voice-command',
  image: voiceCmdImg,
    description: 'Hands-free voice commands for navigation, calling, and controlling key app features while riding.',
    longDescription: `Maintaining focus on the road is paramount to a rider's safety. Voice Commands make this possible by allowing you to interact with the app's full suite of features without ever taking your hands off the handlebars or your eyes off the road. You can initiate and control navigation ("Navigate home"), manage your communications ("Call the group" or "Read my last message"), and control your music ("Play my riding playlist") using simple, intuitive voice prompts. This seamless integration of technology ensures that you remain in complete control of both your bike and your digital environment without compromising your safety.`
  },
  {
    icon: '🔌',
    title: 'External Device Connectivity',
    slug: 'external-device-connectivity',
  image: externalImg,
    description: 'Connect helmets, headsets, and other external devices via Bluetooth for audio navigation and calls.',
    longDescription: `While the app's built-in communication is powerful, it can be limited by the range of Bluetooth or cellular networks. This feature bridges that gap by allowing the app to integrate with dedicated, high-power communication hardware, such as mesh network intercoms. These devices create a robust, independent network between riders that can extend for several kilometers, dynamically re-routing signals through each rider to maintain a stable connection. This is essential for serious adventure riders, off-road groups, or tours traveling through remote landscapes where cell service is non-existent, guaranteeing reliable communication no matter how far apart the group spreads out.`
  },
  {
    icon: '🗺️',
    title: 'Offline Maps',
    slug: 'offline-maps',
    image: offlineImg,
    description: 'Download map regions for offline navigation to stay on course even without a network connection.',
    longDescription: `For any rider who loves to explore remote backroads or venture into areas with spotty network coverage, this feature is an absolute necessity. Before you begin your trip, you can download detailed maps for your entire planned region. Once downloaded, the app uses your phone's GPS chip—which works globally without an internet connection—to provide full, turn-by-turn navigation. This means you can confidently navigate through national parks, mountain passes, and rural countryside without ever worrying about losing your signal and getting lost. It offers the freedom to explore off the beaten path with the security of always knowing the way.`
  }
]

export default features
