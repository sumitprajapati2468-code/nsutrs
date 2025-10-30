import React, { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import introMp4 from '../assets/rider-saathi-intro.mp4'

// IntroVideo: plays a full-screen mp4 from /assets and calls onFinish when done.
// It tries to autoplay muted and falls back to calling onFinish after a timeout if playback fails.
const IntroVideo = ({ onFinish }) => {
  const videoRef = useRef(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) {
      onFinish && onFinish()
      return
    }

    let finished = false

    const handleEnded = () => {
      if (finished) return
      finished = true
      // small fade-out buffer before finishing
      setTimeout(() => onFinish && onFinish(), 250)
    }

    const handleError = () => {
      if (finished) return
      finished = true
      setTimeout(() => onFinish && onFinish(), 500)
    }

    v.addEventListener('ended', handleEnded)
    v.addEventListener('error', handleError)

    // Try to play; some browsers block autoplay if not muted.
    const tryPlay = async () => {
      try {
        await v.play()
      } catch (err) {
        // If autoplay blocked, ensure muted then try again
        v.muted = true
        try {
          await v.play()
        } catch (err2) {
          // Give up and finish after short fallback
          handleError()
        }
      }
    }

    tryPlay()

    // Fallback: if video doesn't fire ended/error, ensure we finish after 10s
    const fallback = setTimeout(() => {
      if (!finished) {
        finished = true
        onFinish && onFinish()
      }
    }, 10000)

    return () => {
      v.removeEventListener('ended', handleEnded)
      v.removeEventListener('error', handleError)
      clearTimeout(fallback)
    }
  }, [onFinish])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
    >
      <video
        ref={videoRef}
        src={introMp4}
        className="w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        preload="auto"
      />
      {/* Optional skip button for dev or impatient users */}
      <button
        aria-label="Skip intro"
        onClick={() => onFinish && onFinish()}
        className="absolute top-6 right-6 bg-black/40 text-white px-3 py-1 rounded-md text-sm backdrop-blur-sm"
      >
        Skip
      </button>
    </motion.div>
  )
}

export default IntroVideo
