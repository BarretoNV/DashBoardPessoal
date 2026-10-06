import type { DashboardSettings, Habit, Task } from '../types'
import { isRecord } from './storageService'
export const validTasks = (data: unknown): data is Task[] =>
  Array.isArray(data) &&
  data.every(
    (t) =>
      isRecord(t) &&
      typeof t.id === 'string' &&
      typeof t.title === 'string' &&
      t.title.trim().length > 0 &&
      typeof t.completed === 'boolean' &&
      (t.source === undefined || ['local', 'google'].includes(String(t.source))) &&
      (t.due === undefined || (typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due))) &&
      (t.priority === undefined || ['low', 'medium', 'high'].includes(String(t.priority))),
  )
export const validHabits = (data: unknown): data is Habit[] =>
  Array.isArray(data) &&
  data.every(
    (h) =>
      isRecord(h) &&
      typeof h.id === 'string' &&
      typeof h.name === 'string' &&
      h.name.trim().length > 0 &&
      Number.isInteger(h.target) &&
      Number(h.target) >= 1 &&
      Number(h.target) <= 7 &&
      Array.isArray(h.completedDays) &&
      h.completedDays.every((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)),
  )
export function validSettings(data: unknown): data is DashboardSettings {
  if (!isRecord(data)) return false
  const l = data.location
  return (
    typeof data.name === 'string' &&
    ['12h', '24h'].includes(String(data.hourFormat)) &&
    ['showWeather', 'showTasks', 'showHabits', 'ambient'].every(
      (k) => typeof data[k] === 'boolean',
    ) &&
    (data.animatedBackground === undefined || typeof data.animatedBackground === 'boolean') &&
    (data.autoAmbient === undefined || typeof data.autoAmbient === 'boolean') &&
    (data.autoRotateTaskLists === undefined || typeof data.autoRotateTaskLists === 'boolean') &&
    (data.autoScrollTasks === undefined || typeof data.autoScrollTasks === 'boolean') &&
    typeof data.accent === 'string' &&
    /^#[0-9a-f]{6}$/i.test(data.accent) &&
    (data.timezone === undefined ||
      (typeof data.timezone === 'string' && validTimezone(data.timezone))) &&
    (l === null ||
      (isRecord(l) &&
        typeof l.name === 'string' &&
        typeof l.latitude === 'number' &&
        Number.isFinite(l.latitude) &&
        Math.abs(l.latitude) <= 90 &&
        typeof l.longitude === 'number' &&
        Number.isFinite(l.longitude) &&
        Math.abs(l.longitude) <= 180))
  )
}
export function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}
export const validIntegrationPreferences = (
  data: unknown,
): data is import('../types').IntegrationPreferences =>
  isRecord(data) &&
  typeof data.calendarEnabled === 'boolean' &&
  typeof data.tasksEnabled === 'boolean'
