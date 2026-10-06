import { ArrowUpRight, CalendarCheck, CalendarDays, Clock3 } from 'lucide-react'
import type { CalendarEvent, DataSource } from '../types'
import { countdown, eventState, remainingTime } from '../services/calendarService'
import { timeLabel } from '../services/dateService'
import { useDashboardSettings } from '../hooks/useDashboardSettings'
import { DetailText } from './DetailText'

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r'

export function NextEvent({
  event,
  now,
  loading,
  error,
  tomorrowFirst,
  source,
}: {
  event?: CalendarEvent
  now: Date
  loading: boolean
  error: boolean
  tomorrowFirst?: CalendarEvent
  source: DataSource
}) {
  const { value: settings } = useDashboardSettings()
  const current = event && eventState(event, now) === 'current'
  const calendarUrl = event?.url ?? (source === 'google' ? GOOGLE_CALENDAR_URL : undefined)
  return (
    <section className={`next-event ${event ? 'has-event' : ''}`} aria-label="Próximo compromisso">
      <span className="edge-scan" aria-hidden="true">
        <span />
      </span>
      <div className="next-heading">
        <span className="eyebrow">{current ? 'Agora' : 'A seguir'}</span>
        {calendarUrl ? (
          <a
            className="event-external"
            href={calendarUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={
              event?.url ? `Abrir ${event.title} no Google Agenda` : 'Abrir Google Agenda'
            }
            title={event?.url ? 'Abrir evento no Google Agenda' : 'Abrir Google Agenda'}
          >
            {event?.url ? (
              <ArrowUpRight size={20} aria-hidden="true" />
            ) : (
              <CalendarDays size={19} aria-hidden="true" />
            )}
          </a>
        ) : event ? null : (
          <CalendarCheck size={24} aria-hidden="true" />
        )}
      </div>
      {event ? (
        <>
          <div className="next-time">
            {event.allDay
              ? 'DIA INTEIRO'
              : timeLabel(event.start, settings.hourFormat, settings.timezone)}
          </div>
          <h2>
            <DetailText text={event.title} focusable />
          </h2>
          <p className="countdown">
            <Clock3 size={17} />
            {current
              ? event.allDay
                ? 'durante todo o dia'
                : event.end
                  ? `termina em ${remainingTime(event.end, now)} · às ${timeLabel(event.end, settings.hourFormat, settings.timezone)}`
                  : 'em andamento'
              : countdown(event, now)}
          </p>
        </>
      ) : (
        <div className="next-empty">
          <h2>{loading ? 'Um momento…' : error ? 'Agenda indisponível' : 'Tempo livre.'}</h2>
          <p>
            {loading
              ? 'Consultando sua agenda.'
              : error
                ? 'Tente novamente mais tarde.'
                : 'Agenda concluída por hoje.'}
          </p>
          {!loading && !error && tomorrowFirst && (
            <div className="tomorrow-preview">
              <span>AMANHÃ</span>
              <strong>
                {tomorrowFirst.allDay
                  ? 'Dia inteiro'
                  : timeLabel(tomorrowFirst.start, settings.hourFormat, settings.timezone)}
              </strong>
              <DetailText text={tomorrowFirst.title} focusable />
            </div>
          )}
          {!loading && !error && !tomorrowFirst && (
            <p className="next-secondary">Sem mais compromissos próximos.</p>
          )}
        </div>
      )}
    </section>
  )
}
