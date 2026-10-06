import type { CalendarEvent } from '../types'
import { mockEvents } from '../data/demo'
import { addDateKey, dateKey, zonedDateTime } from './dateService'
import { getCloudSnapshot } from './cloudDashboard'

export const localCalendarService = {
  async getEvents(start: Date, end: Date, timezone: string): Promise<CalendarEvent[]> {
    if (getCloudSnapshot().mode === 'cloud') return []
    const events: CalendarEvent[] = []
    let key = dateKey(start, timezone)
    const endKey = dateKey(new Date(end.getTime() - 1), timezone)
    while (key <= endKey) {
      events.push(...mockEvents(zonedDateTime(key, timezone, 12), timezone))
      key = addDateKey(key, 1)
    }
    return events.filter((event) => event.start < end && (event.end ?? event.start) > start)
  },
}
