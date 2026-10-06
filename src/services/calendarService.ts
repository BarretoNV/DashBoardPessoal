import type { CalendarEvent, DataStatus } from '../types'
import { googleCalendarService } from './googleCalendarService'
import { localCalendarService } from './localCalendarService'

export interface CalendarResult extends DataStatus { events: CalendarEvent[] }
export const calendarService = {
  async getEvents(start: Date, end: Date, options?: { timezone?: string; googleEnabled?: boolean; googleConnected?: boolean }): Promise<CalendarResult> {
    const timezone = options?.timezone ?? 'America/Sao_Paulo'
    if (options?.googleEnabled && options.googleConnected) {
      try { return { events: await googleCalendarService.getEvents(start, end, timezone), source: 'google' } }
      catch { return { events: await localCalendarService.getEvents(start, end, timezone), source: 'local', notice: 'Google Calendar temporariamente indisponível.' } }
    }
    return {
      events: await localCalendarService.getEvents(start, end, timezone),
      source: 'local',
      notice: options?.googleEnabled ? 'Reconecte o Google Calendar para sincronizar.' : undefined,
    }
  },
}
export function eventState(event: CalendarEvent, now: Date): 'past' | 'current' | 'future' {
  const end = event.end?.getTime() ?? Math.floor(event.start.getTime() / 60000) * 60000 + 60000
  return now.getTime() >= end ? 'past' : now < event.start ? 'future' : 'current'
}
export function selectEvents(events: CalendarEvent[], now: Date) {
  const allDay = events.filter(event => event.allDay && eventState(event, now) !== 'past')
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id))
  const sorted = events.filter(event => !event.allDay).sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id))
  const remaining = sorted.filter(event => eventState(event, now) !== 'past')
  const previous = sorted.filter(event => eventState(event, now) === 'past')
  const slots = Math.max(0, 5 - remaining.length)
  return { allDay, next: remaining[0], visible: [...(slots ? previous.slice(-slots) : []), ...remaining.slice(0, 5)] }
}
export function countdown(event: CalendarEvent, now: Date): string {
  if (eventState(event, now) === 'current') return 'agora'
  const minutes = Math.max(1, Math.ceil((event.start.getTime() - now.getTime()) / 60000))
  return minutes < 60 ? `em ${minutes} min` : `em ${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`
}

export function remainingTime(end: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 60000))
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`
}
