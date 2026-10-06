import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const TOP_DWELL_MS = 4000
const BOTTOM_DWELL_MS = 4000
const FADE_MS = 300
const SPEED_PX_PER_SECOND = 12

type Phase = 'top' | 'scroll' | 'bottom' | 'fade-out' | 'fade-in'

export function useAutoTaskScroll({
  viewportRef,
  resetKey,
  measureKey,
  enabled,
  paused,
}: {
  viewportRef: RefObject<HTMLElement | null>
  resetKey: string
  measureKey: string
  enabled: boolean
  paused: boolean
}) {
  const [hasOverflow, setHasOverflow] = useState(false)
  const [lastCompletedKey, setLastCompletedKey] = useState<string | null>(null)
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const phase = useRef<Phase>('top')
  const phaseElapsed = useRef(0)
  const scrollPosition = useRef(0)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTop = 0
    scrollPosition.current = 0
    viewport.classList.remove('task-list-fading')
    phase.current = 'top'
    phaseElapsed.current = 0
  }, [resetKey, viewportRef])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => {
      const pendingItems = viewport.querySelectorAll<HTMLElement>('[data-task-pending="true"]')
      const lastPending = pendingItems.item(pendingItems.length - 1)
      const pendingBottom = lastPending
        ? lastPending.offsetTop + lastPending.offsetHeight
        : 0
      setHasOverflow(
        pendingItems.length > 0
          ? pendingBottom > viewport.clientHeight + 1
          : viewport.children.length === 0 && viewport.scrollHeight > viewport.clientHeight + 1,
      )
    }
    const frame = requestAnimationFrame(measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(viewport)
    viewport.querySelectorAll('[data-task-pending="true"]').forEach((item) => observer?.observe(item))
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [measureKey, viewportRef])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !enabled || paused || reducedMotion || !hasOverflow) return
    let frame = 0
    let previous = 0
    scrollPosition.current = viewport.scrollTop
    const tick = (time: number) => {
      const delta = previous ? Math.min(100, time - previous) : 0
      previous = time
      phaseElapsed.current += delta
      if (phase.current === 'top' && phaseElapsed.current >= TOP_DWELL_MS) {
        phase.current = 'scroll'
        phaseElapsed.current = 0
      } else if (phase.current === 'scroll') {
        const bottom = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
        scrollPosition.current = Math.min(
          bottom,
          scrollPosition.current + SPEED_PX_PER_SECOND * delta / 1000,
        )
        viewport.scrollTop = scrollPosition.current
        if (scrollPosition.current >= bottom - 0.5) {
          viewport.scrollTop = bottom
          scrollPosition.current = bottom
          phase.current = 'bottom'
          phaseElapsed.current = 0
        }
      } else if (phase.current === 'bottom' && phaseElapsed.current >= BOTTOM_DWELL_MS) {
        viewport.classList.add('task-list-fading')
        phase.current = 'fade-out'
        phaseElapsed.current = 0
      } else if (phase.current === 'fade-out' && phaseElapsed.current >= FADE_MS) {
        viewport.scrollTop = 0
        scrollPosition.current = 0
        viewport.classList.remove('task-list-fading')
        phase.current = 'fade-in'
        phaseElapsed.current = 0
      } else if (phase.current === 'fade-in' && phaseElapsed.current >= FADE_MS) {
        phase.current = 'top'
        phaseElapsed.current = 0
        setLastCompletedKey(resetKey)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled, hasOverflow, paused, reducedMotion, resetKey, viewportRef])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !paused || !viewport.classList.contains('task-list-fading')) return
    viewport.classList.remove('task-list-fading')
    scrollPosition.current = viewport.scrollTop
    phase.current = 'bottom'
    phaseElapsed.current = 0
  }, [paused, viewportRef])

  return {
    hasOverflow,
    lastCompletedKey,
    isAutoScrolling: enabled && hasOverflow && !reducedMotion,
  }
}
