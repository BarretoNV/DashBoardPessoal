import { useEffect, useState } from 'react'
import type { WeatherData, WeatherLocation } from '../types'
import { fetchWeather } from '../services/weatherService'
interface WeatherState {
  key: string
  data?: WeatherData
  loading: boolean
  stale: boolean
}
export function useWeather(location: WeatherLocation | null, enabled: boolean) {
  const key = location ? `${location.latitude},${location.longitude}` : ''
  const latitude = location?.latitude
  const longitude = location?.longitude
  const [state, setState] = useState<WeatherState>({ key: '', loading: false, stale: false })
  useEffect(() => {
    if (!enabled || latitude === undefined || longitude === undefined) return
    let active = true
    let controller: AbortController
    const update = async () => {
      controller?.abort()
      controller = new AbortController()
      const current = controller
      const timeout = setTimeout(() => current.abort(), 12000)
      setState((old) => ({
        key,
        data: old.key === key ? old.data : undefined,
        loading: true,
        stale: old.key === key && old.stale,
      }))
      try {
        const data = await fetchWeather({ name: '', latitude, longitude }, current.signal)
        if (active && current === controller) setState({ key, data, loading: false, stale: false })
      } catch {
        if (active && current === controller)
          setState((old) => ({ ...old, loading: false, stale: true }))
      } finally {
        clearTimeout(timeout)
      }
    }
    const resume = () => {
      if (!document.hidden) void update()
    }
    void update()
    const interval = setInterval(() => void update(), 15 * 60000)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      active = false
      controller?.abort()
      clearInterval(interval)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [key, latitude, longitude, enabled])
  return state.key === key ? state : { key, loading: Boolean(key), stale: false }
}
