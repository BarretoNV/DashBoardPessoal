import { Check, Circle } from 'lucide-react'
import type { CalendarEvent, DataSource } from '../types'
import { eventState } from '../services/calendarService'
import { timeLabel } from '../services/dateService'
import { useDashboardSettings } from '../hooks/useDashboardSettings'
import { SectionHeader } from './SectionHeader'
import { DetailText } from './DetailText'
export function TodayAgenda({
  events,
  allDayEvents = [],
  next,
  now,
  loading,
  error,
  source,
  notice,
}: {
  events: CalendarEvent[]
  allDayEvents?: CalendarEvent[]
  next?: CalendarEvent
  now: Date
  loading: boolean
  error: boolean
  source: DataSource
  notice?: string
}) {
  const { value: settings } = useDashboardSettings()
  return (
    <section className="agenda panel">
      <SectionHeader number="01" title="Hoje">
        {!settings.ambient && <span className="tag">{source === 'google' ? 'Google Calendar' : 'Dados locais'}</span>}
      </SectionHeader>
      {!loading && !error && allDayEvents.length > 0 && (
        <div className="agenda-all-day">
          <span className="agenda-all-day-label">Dia inteiro</span>
          <ul aria-label="Eventos de dia inteiro">
            {allDayEvents.map(event => (
              <li key={event.id}>
                {event.url ? (
                  <a href={event.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${event.title} no Google Agenda`}>
                    <DetailText text={event.title} />
                  </a>
                ) : <DetailText text={event.title} focusable />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {loading || error || !events.length ? (
        <p className="empty">
          {loading
            ? 'Carregando agenda…'
            : error
              ? 'Agenda indisponível.'
              : allDayEvents.length ? 'Sem compromissos com horário hoje.' : 'Sem compromissos hoje.'}
        </p>
      ) : (
        <ol className="agenda-list">
          {events.map((event) => {
            const state = eventState(event, now)
            return (
              <li
                key={event.id}
                className={`agenda-item ${state} ${event.id === next?.id ? 'is-next' : ''}`}
              >
                <time>{event.allDay ? 'DIA' : timeLabel(event.start, settings.hourFormat, settings.timezone)}</time>
                <span className="timeline-marker">
                  {state === 'past' ? <Check size={15} /> : <Circle size={10} />}
                </span>
                <div>
                  <p>
                    <DetailText text={event.title} focusable />
                  </p>
                  <span>{state === 'current' ? 'Em andamento' : event.category}</span>
                </div>
                {event.id === next?.id && (
                  <span className="event-label">{state === 'current' ? 'AGORA' : 'PRÓXIMO'}</span>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {!loading && !error && events.length > 0 && !next && (
        <p className="agenda-done">Agenda concluída por hoje.</p>
      )}
      {!settings.ambient && notice && <p className="data-notice" role="status">{notice}</p>}
    </section>
  )
}
