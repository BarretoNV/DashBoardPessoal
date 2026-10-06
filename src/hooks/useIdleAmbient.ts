import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_IDLE_MS = 120000

export function useIdleAmbient({
  enabled,
  blocked,
  timeoutMs = DEFAULT_IDLE_MS,
}: {
  enabled: boolean
  blocked: boolean
  timeoutMs?: number
}) {
  const [idleAmbient, setIdleAmbient] = useState(false)
  const [activityRevision, setActivityRevision] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const enabledRef = useRef(enabled)
  const blockedRef = useRef(blocked)
  const timeoutRef = useRef(timeoutMs)

  useEffect(() => {
    enabledRef.current = enabled
    blockedRef.current = blocked
    timeoutRef.current = timeoutMs
  }, [blocked, enabled, timeoutMs])

  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    if (!enabledRef.current || blockedRef.current || document.hidden) return
    timer.current = setTimeout(() => setIdleAmbient(true), timeoutRef.current)
  }, [])

  const registerActivity = useCallback(() => {
    setIdleAmbient(false)
    setActivityRevision((value) => value + 1)
    schedule()
  }, [schedule])

  useEffect(() => {
    const kickoff = setTimeout(() => {
      setIdleAmbient(false)
      schedule()
    }, 0)
    const resume = () => registerActivity()
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      clearTimeout(kickoff)
      clearTimeout(timer.current)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [blocked, enabled, registerActivity, schedule, timeoutMs])

  return { idleAmbient, activityRevision, registerActivity }
}
