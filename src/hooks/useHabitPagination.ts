import { useEffect, useState } from 'react'

export function useHabitPagination(count: number, editing: boolean) {
  const [large, setLarge] = useState(() => window.matchMedia('(min-height: 900px)').matches)
  const [hidden, setHidden] = useState(() => document.hidden)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useState(0)
  const [restart, setRestart] = useState(0)
  const size = large ? 3 : 2
  const pageCount = Math.max(1, Math.ceil(count / size))
  const page = Math.min(index, pageCount - 1)
  if (index !== page) setIndex(page)
  const paused = editing || hidden || hovered || focused

  useEffect(() => {
    const query = window.matchMedia('(min-height: 900px)')
    const resize = () => setLarge(query.matches)
    const visibility = () => setHidden(document.hidden)
    query.addEventListener('change', resize)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      query.removeEventListener('change', resize)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  useEffect(() => {
    if (paused || pageCount <= 1) return
    const timer = setInterval(() => setIndex((old) => (old + 1) % pageCount), 15000)
    return () => clearInterval(timer)
  }, [paused, pageCount, size, restart])

  const go = (delta: number) => {
    setIndex((page + delta + pageCount) % pageCount)
    setRestart((old) => old + 1)
  }
  return { page, pageCount, size, paused, go, setHovered, setFocused }
}
