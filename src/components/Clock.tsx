import { useDashboardSettings } from '../hooks/useDashboardSettings'
import { dateLabel, timeLabel } from '../services/dateService'
export function Clock({ now }: { now: Date }) {
  const { value: settings } = useDashboardSettings()
  const timezone = settings.timezone ?? 'America/Sao_Paulo'
  const hour = Number(now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }))
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  return (
    <div className="clock-block">
      <p className="eyebrow greeting">
        <span className="status-dot" />
        {greeting}
        {settings.name ? `, ${settings.name}` : ''}
      </p>
      <time
        className={`clock ${settings.hourFormat === '12h' ? 'clock-12h' : ''}`}
        dateTime={now.toISOString()}
      >
        {timeLabel(now, settings.hourFormat, timezone)}
      </time>
      <p className="calendar-date">
        <span>{dateLabel(now, { weekday: 'long' }, timezone)}</span>
        <span className="date-divider" />
        <span>{dateLabel(now, { day: '2-digit', month: 'long' }, timezone)}</span>
      </p>
    </div>
  )
}
