import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Animate only changed row positions, never clock ticks or automatic scrolling. */
export function useAnimatedList(
  viewportRef: RefObject<HTMLElement | null>,
  revision: string,
  group: string,
) {
  const previous = useRef(new Map<string, number>())
  const previousGroup = useRef(group)
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rows = Array.from(viewport.querySelectorAll<HTMLElement>('[data-motion-id]'))
    const positions = new Map(rows.map((row) => [row.dataset.motionId!, row.offsetTop]))
    const animations: Animation[] = []
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (previousGroup.current === group && !motion?.matches) {
      for (const row of rows) {
        const before = previous.current.get(row.dataset.motionId!)
        const delta = before === undefined ? 0 : before - row.offsetTop
        // Large offscreen jumps are better handled by the existing list fade.
        if (
          delta &&
          Math.abs(delta) <= viewport.clientHeight &&
          typeof row.animate === 'function'
        ) {
          animations.push(
            row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
              duration: 300,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }),
          )
        }
      }
    }
    previous.current = positions
    previousGroup.current = group
    const cancel = () => animations.forEach((animation) => animation.cancel())
    motion?.addEventListener?.('change', cancel)
    return () => {
      motion?.removeEventListener?.('change', cancel)
      cancel()
    }
  }, [viewportRef, revision, group])
}
