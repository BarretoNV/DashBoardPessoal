import type { WeatherData, WeatherDay, WeatherLocation } from '../types'
import { isRecord } from './storageService'
export async function fetchWeather(
  location: WeatherLocation,
  signal: AbortSignal,
): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '7',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal })
  if (!response.ok) throw new Error('Weather unavailable')
  const data: unknown = await response.json()
  if (!isRecord(data) || !isRecord(data.current) || !isRecord(data.daily))
    throw new Error('Invalid weather')
  const { temperature_2m: temperature, weather_code: code } = data.current
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || !validCode(code))
    throw new Error('Invalid weather')
  const dates = data.daily.time
  const codes = data.daily.weather_code
  const highs = data.daily.temperature_2m_max
  const lows = data.daily.temperature_2m_min
  const precipitation = data.daily.precipitation_probability_max
  if (
    !Array.isArray(dates) ||
    !Array.isArray(codes) ||
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(precipitation) ||
    dates.length < 1 ||
    ![codes, highs, lows, precipitation].every((values) => values.length === dates.length)
  )
    throw new Error('Invalid weather')
  const days: WeatherDay[] = dates.slice(0, 7).map((date, index) => {
    const dayCode = codes[index]
    const high = highs[index]
    const low = lows[index]
    const precipitationProbability = precipitation[index]
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !validCode(dayCode) ||
      typeof high !== 'number' ||
      !Number.isFinite(high) ||
      typeof low !== 'number' ||
      !Number.isFinite(low) ||
      typeof precipitationProbability !== 'number' ||
      !Number.isFinite(precipitationProbability) ||
      precipitationProbability < 0 ||
      precipitationProbability > 100
    )
      throw new Error('Invalid weather')
    return { date, code: dayCode, high, low, precipitationProbability }
  })
  return { temperature, code, days, updatedAt: Date.now() }
}

function validCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99
}
export function weatherCondition(code: number): string {
  if (code === 0) return 'Céu limpo'
  if (code <= 2) return 'Parcialmente nublado'
  if (code === 3) return 'Nublado'
  if (code <= 48) return 'Nevoeiro'
  if (code <= 57) return 'Garoa'
  if (code <= 67) return 'Chuva'
  if (code <= 77) return 'Neve'
  if (code <= 82) return 'Pancadas de chuva'
  if (code <= 86) return 'Pancadas de neve'
  return 'Trovoadas'
}
