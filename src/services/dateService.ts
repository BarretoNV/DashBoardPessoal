const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

function parts(date: Date, timezone: string) {
  const result: Record<string, number> = {}
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    if (part.type !== 'literal') result[part.type] = Number(part.value)
  }
  return result as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

export function dateKey(date: Date, timezone = DEFAULT_TIMEZONE): string {
  const value = parts(date, timezone)
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

export function addDateKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function zonedDateTime(key: string, timezone = DEFAULT_TIMEZONE, hour = 0, minute = 0): Date {
  const [year, month, day] = key.split('-').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute)
  let estimate = desired
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = parts(new Date(estimate), timezone)
    const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second)
    const correction = desired - observedUtc
    estimate += correction
    if (correction === 0) break
  }
  return new Date(estimate)
}

export function dayRange(now: Date, timezone = DEFAULT_TIMEZONE) {
  const today = dateKey(now, timezone)
  const tomorrow = addDateKey(today, 1)
  return {
    today,
    tomorrow,
    afterTomorrow: addDateKey(today, 2),
    todayStart: zonedDateTime(today, timezone),
    tomorrowStart: zonedDateTime(tomorrow, timezone),
    afterTomorrowStart: zonedDateTime(addDateKey(today, 2), timezone),
  }
}

export function weekDays(now: Date, timezone = DEFAULT_TIMEZONE): Date[] {
  const current = dateKey(now, timezone)
  const [year, month, day] = current.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const monday = addDateKey(current, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => zonedDateTime(addDateKey(monday, index), timezone, 12))
}

export const timeLabel = (date: Date, format: '12h' | '24h', timezone = DEFAULT_TIMEZONE) =>
  date.toLocaleTimeString('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: format === '12h',
  })

export const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions, timezone = DEFAULT_TIMEZONE) =>
  date.toLocaleDateString('pt-BR', { ...options, timeZone: timezone })

export const defaultTimezone = DEFAULT_TIMEZONE

export function taskDueLabel(due: string, now: Date, timezone = DEFAULT_TIMEZONE) {
  const today = dateKey(now, timezone)
  const tomorrow = addDateKey(today, 1)
  if (due === today) return { text: 'HOJE', overdue: false }
  if (due === tomorrow) return { text: 'AMANHÃ', overdue: false }
  const [year, month, day] = due.split('-').map(Number)
  const text = new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  }).replace('.', '').toUpperCase()
  return { text, overdue: due < today }
}
