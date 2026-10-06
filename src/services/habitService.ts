import type { Habit } from '../types'
import { dateKey, weekDays } from './dateService'

export function toggleHabitDay(habits: Habit[], id: string, day: string, now: Date, timezone?: string): Habit[] {
  if (day > dateKey(now, timezone) || !weekDays(now, timezone).some((date) => dateKey(date, timezone) === day)) return habits
  return habits.map((habit) =>
    habit.id !== id
      ? habit
      : {
          ...habit,
          completedDays: habit.completedDays.includes(day)
            ? habit.completedDays.filter((record) => record !== day)
            : [...habit.completedDays, day],
        },
  )
}
