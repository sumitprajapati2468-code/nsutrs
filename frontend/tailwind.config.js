/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: '#00ffff',
          purple: '#bf00ff',
          pink: '#ff0080',
          blue: '#0080ff',
        },
        dark: {
          900: '#0a0a0a',
          800: '#1a1a1a',
          700: '#2a2a2a',
          600: '#3a3a3a',
        }
      },
      boxShadow: {
        'neon-cyan': '0 0 20px #00ffff',
        'neon-purple': '0 0 20px #bf00ff',
        'neon-pink': '0 0 20px #ff0080',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px #00ffff' },
          '100%': { boxShadow: '0 0 30px #bf00ff, 0 0 40px #bf00ff' },
        }
      }
    },
  },
  plugins: [],
}