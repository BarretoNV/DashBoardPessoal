import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  ExternalLink,
  MapPin,
  Sun,
  Umbrella,
} from 'lucide-react'
import { useDashboardSettings } from '../hooks/useDashboardSettings'
import { useWeather } from '../hooks/useWeather'
import { dateLabel, zonedDateTime } from '../services/dateService'
import { weatherCondition } from '../services/weatherService'
import type { WeatherDay } from '../types'

function WeatherGlyph({ code, size }: { code: number; size: number }) {
  const props = { size, 'aria-hidden': true as const }
  if (code === 0) return <Sun {...props} />
  if (code <= 2) return <CloudSun {...props} />
  if (code === 3) return <Cloud {...props} />
  if (code <= 48) return <CloudFog {...props} />
  if (code <= 57) return <CloudDrizzle {...props} />
  if (code <= 67 || (code >= 80 && code <= 82)) return <CloudRain {...props} />
  if (code <= 77 || (code >= 85 && code <= 86)) return <CloudSnow {...props} />
  return <CloudLightning {...props} />
}

function coordinate(value: number) {
  const text = String(value)
  return text.includes('.') ? text : `${text}.0`
}

function ForecastDay({ day, timezone }: { day: WeatherDay; timezone?: string }) {
  const label = dateLabel(zonedDateTime(day.date, timezone, 12), { weekday: 'short' }, timezone)
    .replace('.', '')
    .toUpperCase()
  return (
    <li className="forecast-day" title={weatherCondition(day.code)}>
      <span className="forecast-label">{label}</span>
      <WeatherGlyph code={day.code} size={20} />
      <span className="forecast-temperature">
        <strong>{Math.round(day.high)}°</strong>
        <span>{Math.round(day.low)}°</span>
      </span>
      <span
        className="forecast-rain"
        aria-label={`${Math.round(day.precipitationProbability)}% de chance de chuva`}
      >
        <Umbrella size={11} aria-hidden="true" /> {Math.round(day.precipitationProbability)}%
      </span>
    </li>
  )
}

export function Weather() {
  const { value: settings } = useDashboardSettings()
  const { data, loading, stale } = useWeather(settings.location, settings.showWeather)
  if (!settings.showWeather) return null
  if (!settings.location)
    return (
      <section className="weather weather-empty" aria-label="Previsão do tempo">
        <CloudSun size={30} />
        <div>
          <p>O tempo lá fora</p>
          <span>Configure sua localização</span>
        </div>
      </section>
    )
  const locationName = settings.location.name || 'Sua localização'
  const windyUrl = `https://www.windy.com/${coordinate(settings.location.latitude)}/${coordinate(settings.location.longitude)}`
  return (
    <section className="weather" aria-label="Previsão do tempo">
      <div className="weather-current">
        {data ? (
          <WeatherGlyph code={data.code} size={34} />
        ) : (
          <CloudSun size={34} aria-hidden="true" />
        )}
        {data ? (
          <>
            <strong>
              {Math.round(data.temperature)}
              <span>°C</span>
            </strong>
            <div className="weather-detail">
              <p>{weatherCondition(data.code)}</p>
              <span>
                <MapPin size={14} aria-hidden="true" /> {locationName}
              </span>
              {stale ? <span role="status">Leitura desatualizada</span> : null}
            </div>
            <a
              className="weather-external"
              href={windyUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir previsão de ${locationName} no Windy`}
              title="Abrir previsão detalhada no Windy"
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </>
        ) : (
          <p role="status">{loading ? 'Consultando o clima…' : 'Clima indisponível.'}</p>
        )}
      </div>
      {data ? (
        <ol className="forecast-strip" aria-label="Previsão para os próximos seis dias">
          {data.days.slice(1).map((day) => (
            <ForecastDay key={day.date} day={day} timezone={settings.timezone} />
          ))}
        </ol>
      ) : null}
    </section>
  )
}
