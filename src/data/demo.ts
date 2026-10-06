import type { CalendarEvent, Habit, Task } from '../types'
import { dateKey, weekDays, zonedDateTime } from '../services/dateService'
// Dados de demonstração. A agenda é recriada para o dia consultado.
export function mockEvents(date: Date, timezone = 'America/Sao_Paulo'): CalendarEvent[] {
  return [
    { title: 'Treino', hour: 9, minute: 0, duration: 60, category: 'Bem-estar' },
    { title: 'Trabalho', hour: 11, minute: 0, duration: 120, category: 'Foco' },
    { title: 'Estudo', hour: 19, minute: 30, duration: 60, category: 'Desenvolvimento' },
  ].map((item, i) => {
    const start = zonedDateTime(dateKey(date, timezone), timezone, item.hour, item.minute)
    return {
      id: `demo-${dateKey(date, timezone)}-${i}`,
      title: item.title,
      category: item.category,
      source: 'local',
      start,
      end: new Date(start.getTime() + item.duration * 60000),
    }
  })
}
export const mockTasks: Task[] = [
  { id: 'demo-study', title: 'Estudar', completed: false, priority: 'high', source: 'local' },
  { id: 'demo-review', title: 'Revisar conteúdo', completed: false, priority: 'medium', source: 'local' },
  { id: 'demo-plan', title: 'Organizar tarefas', completed: false, priority: 'low', source: 'local' },
  { id: 'demo-training', title: 'Treino', completed: true, source: 'local' },
]
export function mockHabits(): Habit[] {
  const today = new Date()
  const elapsed = weekDays(today).filter((d) => dateKey(d) < dateKey(today))
  return [
    {
      id: 'demo-training',
      name: 'Treino',
      target: 5,
      completedDays: elapsed.filter((_, i) => i % 2 === 0).map((day) => dateKey(day)),
    },
    { id: 'demo-study', name: 'Estudo', target: 5, completedDays: elapsed.map((day) => dateKey(day)) },
  ]
}
