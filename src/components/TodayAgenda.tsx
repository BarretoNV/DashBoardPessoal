import { useEffect, useRef, useState } from 'react'
import { useAutoTaskScroll } from '../hooks/useAutoTaskScroll'
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
  settingsOpen = false,
  activityRevision = 0,
}: {
  events: CalendarEvent[]
  allDayEvents?: CalendarEvent[]
  next?: CalendarEvent
  now: Date
  loading: boolean
  error: boolean
  source: DataSource
  notice?: string
  settingsOpen?: boolean
  activityRevision?: number
}) {
  const { value: settings } = useDashboardSettings()
  const viewport = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [cooling, setCooling] = useState(false)
  const [visible, setVisible] = useState(() => !document.hidden)
  const previousActivity = useRef(activityRevision)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (previousActivity.current === activityRevision) return
    previousActivity.current = activityRevision
    const start = window.setTimeout(() => setCooling(true), 0)
    const end = window.setTimeout(() => setCooling(false), 8000)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(end)
    }
  }, [activityRevision])
  useAutoTaskScroll({
    viewportRef: viewport,
    resetKey: now.toLocaleDateString('en-CA', { timeZone: settings.timezone }),
    measureKey: [
      loading,
      error,
      ...allDayEvents.map((e) => e.id + e.title),
      ...events.map((e) => e.id + e.title),
    ].join('|'),
    itemSelector: '[data-agenda-item]',
    enabled: true,
    paused: hovered || focused || cooling || settingsOpen || !visible,
  })
  return (
    <section
      className="agenda panel"
      aria-label="Agenda"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
      }}
    >
      <SectionHeader number="01" title="Agenda">
        {!settings.ambient && (
          <span className="tag">{source === 'google' ? 'Google Calendar' : 'Dados locais'}</span>
        )}
      </SectionHeader>
      <div className="agenda-viewport" ref={viewport} tabIndex={0} aria-label="Compromissos do dia">
        {!loading && !error && allDayEvents.length > 0 && (
          <div className="agenda-all-day">
            <span className="agenda-all-day-label">Dia inteiro</span>
            <ul aria-label="Eventos de dia inteiro">
              {allDayEvents.map((event) => (
                <li key={event.id} data-agenda-item>
                  {event.url ? (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Abrir ${event.title} no Google Agenda`}
                    >
                      <DetailText text={event.title} />
                    </a>
                  ) : (
                    <DetailText text={event.title} focusable />
                  )}
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
                : allDayEvents.length
                  ? 'Sem compromissos com horário hoje.'
                  : 'Sem compromissos hoje.'}
          </p>
        ) : (
          <ol className="agenda-list">
            {events.map((event) => {
              const state = eventState(event, now)
              return (
                <li
                  key={event.id}
                  data-agenda-item
                  className={`agenda-item ${state} ${event.id === next?.id ? 'is-next' : ''}`}
                >
                  <time>
                    {event.allDay
                      ? 'DIA'
                      : timeLabel(event.start, settings.hourFormat, settings.timezone)}
                  </time>
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
      </div>
      {!settings.ambient && notice && (
        <p className="data-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  )
}
