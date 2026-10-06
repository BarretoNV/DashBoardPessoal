import { useEffect, useState } from 'react'
import type { CalendarEvent, DataSource } from '../types'
import { calendarService, selectEvents } from '../services/calendarService'
import { addDateKey, dateKey, zonedDateTime } from '../services/dateService'
import { useDashboardSettings } from './useDashboardSettings'
import { useGoogleConnection } from './useGoogleConnection'

interface CalendarState {
  day: string
  todayEvents: CalendarEvent[]
  tomorrowFirst?: CalendarEvent
  source: DataSource
  notice?: string
  error: boolean
}

export function useCalendar(now: Date) {
  const { value: settings } = useDashboardSettings()
  const google = useGoogleConnection()
  const timezone = settings.timezone ?? 'America/Sao_Paulo'
  const day = dateKey(now, timezone)
  const [state, setState] = useState<CalendarState>({
    day: '',
    todayEvents: [],
    source: 'local',
    error: false,
  })
  useEffect(() => {
    let active = true
    const range = {
      todayStart: zonedDateTime(day, timezone),
      tomorrowStart: zonedDateTime(addDateKey(day, 1), timezone),
      afterTomorrowStart: zonedDateTime(addDateKey(day, 2), timezone),
    }
    calendarService.getEvents(range.todayStart, range.afterTomorrowStart, {
      timezone,
      googleEnabled: google.preferences.calendarEnabled,
      googleConnected: google.calendarConnected,
    }).then(result => {
      if (!active) return
      const todayEvents = result.events.filter(event =>
        event.start < range.tomorrowStart && (event.end ?? event.start) > range.todayStart,
      )
      const tomorrowFirst = result.events
        .filter(event => event.start >= range.tomorrowStart && event.start < range.afterTomorrowStart)
        .sort((a, b) => a.start.getTime() - b.start.getTime())[0]
      setState({ day, todayEvents, tomorrowFirst, source: result.source, notice: result.notice, error: false })
    }).catch(() => {
      if (active) setState({ day, todayEvents: [], source: 'local', notice: 'Agenda indisponível.', error: true })
    })
    return () => { active = false }
  }, [day, timezone, google.preferences.calendarEnabled, google.calendarConnected])
  const ready = state.day === day
  const events = ready ? state.todayEvents : []
  return {
    events,
    ...selectEvents(events, now),
    tomorrowFirst: ready ? state.tomorrowFirst : undefined,
    source: state.source,
    notice: state.notice,
    loading: !ready,
    error: state.error,
  }
}
