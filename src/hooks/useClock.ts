import { useEffect, useState } from 'react'
export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      clearTimeout(timer)
      setNow(new Date())
      timer = setTimeout(tick, 60000 - (Date.now() % 60000))
    }
    const resume = () => {
      if (!document.hidden) tick()
    }
    tick()
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', resume)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [])
  return now
}
