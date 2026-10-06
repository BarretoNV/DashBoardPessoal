import { useEffect, useRef, useState } from 'react'
import backgroundVideo from '../assets/backgroundNasaVideo.mp4'

const FADE_DURATION = 600

export function BackgroundMedia({ enabled }: { enabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const restartTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [fading, setFading] = useState(false)
  const [sourceFailed, setSourceFailed] = useState(false)
  const active = enabled && !sourceFailed

  useEffect(() => {
    if (!active) return
    const element = video.current
    if (!element) return
    element.defaultPlaybackRate = 0.6
    element.playbackRate = 0.6
    const syncVisibility = () => {
      if (document.hidden) element.pause()
      else void element.play().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', syncVisibility)
    syncVisibility()
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      element.pause()
    }
  }, [active])

  useEffect(
    () => () => {
      if (restartTimer.current) clearTimeout(restartTimer.current)
    },
    [],
  )

  function restart() {
    const element = video.current
    if (!element) return
    setFading(true)
    restartTimer.current = setTimeout(() => {
      element.currentTime = 0
      element.playbackRate = 0.6
      void element.play().catch(() => undefined)
      requestAnimationFrame(() => setFading(false))
    }, FADE_DURATION)
  }

  return (
    <div className="background-media" aria-hidden="true">
      {active ? (
        <video
          ref={video}
          className={`background-video ${fading ? 'fading' : ''}`}
          src={backgroundVideo}
          muted
          autoPlay
          playsInline
          preload="metadata"
          tabIndex={-1}
          onCanPlay={(event) => {
            event.currentTarget.defaultPlaybackRate = 0.6
            event.currentTarget.playbackRate = 0.6
            if (!document.hidden) void event.currentTarget.play().catch(() => undefined)
          }}
          onEnded={restart}
          onError={() => setSourceFailed(true)}
        />
      ) : null}
    </div>
  )
}
