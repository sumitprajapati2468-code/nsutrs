import React from 'react'
import logo from '../assets/Rider-saathi-logo.jpeg'

export default function Footer() {
  return (
    <footer className="relative text-gray-300 mt-12">
      {/* Decorative wave */}
      <div className="-mt-1">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-10 md:h-16 fill-current text-[#0b1020]">
          <path d="M0,0 C150,100 350,100 600,50 C850,0 1050,0 1200,80 L1200,120 L0,120 Z"></path>
        </svg>
      </div>

      <div className="bg-gradient-to-r from-[#07121a] via-[#0b1b24] to-[#1a1420] py-12">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {/* Brand */}
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Rider Saathi" className="h-12 w-12 rounded-full object-cover ring-2 ring-neon-cyan/30" />
              <div>
                <div className="text-white font-semibold text-lg">Rider Saathi</div>
                <div className="text-sm text-gray-400">Making rides safer</div>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-400 max-w-sm">Rider Saathi combines GPS tracking, emergency alerts, AI navigation and real-time communication — designed for riders who value safety and control.</p>
            <div className="flex gap-3 mt-4">
              {/* Social icons - simple inline SVGs with hover */}
              <a href="#" aria-label="Twitter" className="p-2 rounded-md bg-gradient-to-tr from-neon-cyan/10 to-transparent hover:scale-105 transition-transform">
                <svg className="w-5 h-5 text-neon-cyan" viewBox="0 0 24 24" fill="currentColor"><path d="M22 5.92c-.7.31-1.45.52-2.24.62a3.86 3.86 0 0 0 1.7-2.13 7.72 7.72 0 0 1-2.45.94 3.86 3.86 0 0 0-6.57 3.52A10.95 10.95 0 0 1 3.17 4.5a3.86 3.86 0 0 0 1.19 5.15c-.6-.02-1.17-.18-1.66-.45v.05a3.86 3.86 0 0 0 3.09 3.78c-.34.09-.7.14-1.07.14-.26 0-.51-.02-.75-.07a3.87 3.87 0 0 0 3.61 2.68A7.75 7.75 0 0 1 2 19.54 10.94 10.94 0 0 0 8.29 21c6.08 0 9.41-5.03 9.41-9.4v-.43c.64-.47 1.19-1.06 1.62-1.73-.59.26-1.22.44-1.87.52z"/></svg>
              </a>
              <a href="#" aria-label="Instagram" className="p-2 rounded-md bg-gradient-to-tr from-neon-purple/10 to-transparent hover:scale-105 transition-transform">
                <svg className="w-5 h-5 text-neon-purple" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 6.2A3.8 3.8 0 1 0 15.8 12 3.8 3.8 0 0 0 12 8.2zM18.5 6.1a1.1 1.1 0 1 0 1.1 1.1 1.1 1.1 0 0 0-1.1-1.1z"/></svg>
              </a>
              <a href="#" aria-label="LinkedIn" className="p-2 rounded-md bg-gradient-to-tr from-neon-pink/10 to-transparent hover:scale-105 transition-transform">
                <svg className="w-5 h-5 text-neon-pink" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 1 4.98 8.5 2.5 2.5 0 1 1 4.98 3.5zM3 9h4v12H3zM10 9h3.7v1.6h.1a4 4 0 0 1 3.6-2c3.8 0 4.5 2.5 4.5 5.8V21h-4v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4z"/></svg>
              </a>
            </div>
          </div>

          {/* Links */}
          <div className="flex flex-col">
            <h4 className="text-white font-semibold mb-3">Quick Links</h4>
            <nav className="flex flex-col gap-2">
              <a href="/" className="text-gray-300 hover:text-white transition">Home</a>
              <a href="/#features" className="text-gray-300 hover:text-white transition">Features</a>
              <a href="/dashboard" className="text-gray-300 hover:text-white transition">Dashboard</a>
              <a href="/contact" className="text-gray-300 hover:text-white transition">Contact</a>
            </nav>
          </div>

          {/* Newsletter */}
          <div className="flex flex-col">
            <h4 className="text-white font-semibold mb-3">Stay in the loop</h4>
            <p className="text-sm text-gray-400 mb-4">Subscribe for updates, safety tips and feature launches.</p>
            <form className="flex items-center gap-2">
              <input type="email" placeholder="Your email" className="flex-1 px-4 py-2 rounded-md bg-[#07121a] border border-neutral-800 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan/30" />
              <button className="px-4 py-2 rounded-md bg-neon-cyan text-black font-semibold hover:brightness-110 transition">Subscribe</button>
            </form>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 mt-10">
          <div className="border-t border-neutral-800 pt-6 text-center text-sm text-gray-500">© {new Date().getFullYear()} Rider Saathi. All rights reserved.</div>
        </div>
      </div>
    </footer>
  )
}
