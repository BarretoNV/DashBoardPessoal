import type { CalendarEvent } from '../types'
import { googleFetch } from './googleApiService'
import { zonedDateTime } from './dateService'

interface GoogleEventDate {
  date?: string
  dateTime?: string
}
interface GoogleEvent {
  id?: string
  summary?: string
  status?: string
  start?: GoogleEventDate
  end?: GoogleEventDate
  location?: string
  htmlLink?: string
}
interface GoogleEventList {
  items?: GoogleEvent[]
}

function normalize(item: GoogleEvent, timezone: string): CalendarEvent | null {
  if (!item.id || item.status === 'cancelled' || !item.start || !item.end) return null
  const allDay = Boolean(item.start.date)
  const start = item.start.date
    ? zonedDateTime(item.start.date, timezone)
    : new Date(item.start.dateTime ?? '')
  const end = item.end.date
    ? zonedDateTime(item.end.date, timezone)
    : new Date(item.end.dateTime ?? '')
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null
  return {
    id: `google-calendar:${item.id}`,
    title: item.summary?.trim() || 'Sem título',
    start,
    end,
    allDay,
    category: allDay ? 'Dia inteiro' : item.location?.trim() || 'Google Calendar',
    source: 'google',
    url: item.htmlLink?.startsWith('https://') ? item.htmlLink : undefined,
  }
}

export const googleCalendarService = {
  async getEvents(start: Date, end: Date, timezone: string): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = []
    const query = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: timezone,
    })
    const data = await googleFetch<GoogleEventList>(`/api/calendar/events?${query}`)
    for (const item of data.items ?? []) {
      const event = normalize(item, timezone)
      if (event) events.push(event)
    }
    return events.sort((a, b) => a.start.getTime() - b.start.getTime())
  },
}
