import { Check, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import type { Habit } from '../types'
import { dateKey, dateLabel, weekDays } from '../services/dateService'
import { useHabitPagination } from '../hooks/useHabitPagination'
import { SectionHeader } from './SectionHeader'
import { ProgressBar } from './ProgressBar'
import { DetailText } from './DetailText'
import { useDashboardSettings } from '../hooks/useDashboardSettings'

export function WeeklyTracker({
  habits,
  now,
  ambient,
  onEdit,
  onToggleDay,
  editing,
}: {
  habits: Habit[]
  now: Date
  ambient: boolean
  onEdit: () => void
  onToggleDay: (id: string, day: string) => void
  editing: boolean
}) {
  const { value: settings } = useDashboardSettings()
  const timezone = settings.timezone
  const days = weekDays(now, timezone)
  const today = dateKey(now, timezone)
  const pagination = useHabitPagination(habits.length, editing)
  const visible = habits.slice(
    pagination.page * pagination.size,
    (pagination.page + 1) * pagination.size,
  )
  const range =
    dateLabel(days[0], { day: '2-digit', month: 'short' }, timezone) +
    ' — ' +
    dateLabel(days[6], { day: '2-digit', month: 'short' }, timezone)
  return (
    <section
      className="weekly panel"
      aria-label="Hábitos da semana"
      onMouseEnter={() => pagination.setHovered(true)}
      onMouseLeave={() => pagination.setHovered(false)}
      onFocusCapture={() => pagination.setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) pagination.setFocused(false)
      }}
    >
      <SectionHeader number="03" title="Constância">
        <div className="heading-actions">
          <span className="week-range">{range}</span>
          {pagination.pageCount > 1 && (
            <nav className="habit-pagination" aria-label="Páginas de hábitos">
              <button
                className="icon-button"
                aria-label="Hábitos anteriores"
                onClick={() => pagination.go(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span
                className="page-count"
                aria-label={'Página ' + (pagination.page + 1) + ' de ' + pagination.pageCount}
              >
                {pagination.page + 1} / {pagination.pageCount}
              </span>
              <button
                className="icon-button"
                aria-label="Próximos hábitos"
                onClick={() => pagination.go(1)}
              >
                <ChevronRight size={18} />
              </button>
            </nav>
          )}
          {!ambient && (
            <button
              className="icon-button edit-control"
              aria-label="Editar hábitos"
              onClick={onEdit}
            >
              <SlidersHorizontal size={17} />
            </button>
          )}
        </div>
      </SectionHeader>
      {!habits.length ? (
        <p className="empty">Nenhum acompanhamento configurado.</p>
      ) : (
        <div className="tracker-table">
          <div className="tracker-row tracker-head">
            <span className="muted">Esta semana</span>
            {days.map((day) => (
              <span key={dateKey(day, timezone)} className={dateKey(day, timezone) === today ? 'today-label' : ''}>
                {dateLabel(day, { weekday: 'short' }, timezone).replace('.', '')}
                <small>{dateLabel(day, { day: 'numeric' }, timezone)}</small>
              </span>
            ))}
            <span className="goal-heading">Meta semanal</span>
          </div>
          {visible.map((habit) => {
            const count = days.filter((day) => habit.completedDays.includes(dateKey(day, timezone))).length
            return (
              <div className="tracker-row" key={habit.id}>
                <span className="habit-name">
                  <DetailText text={habit.name} focusable />
                </span>
                {days.map((day) => {
                  const key = dateKey(day, timezone)
                  const done = habit.completedDays.includes(key)
                  return (
                    <button
                      type="button"
                      className={'day-cell ' + (key === today ? 'today' : '')}
                      key={key}
                      aria-label={habit.name + ', ' + dateLabel(day, {}, timezone)}
                      aria-pressed={done}
                      disabled={key > today}
                      onClick={() => onToggleDay(habit.id, key)}
                    >
                      <span
                        className={
                          'habit-dot ' + (done ? 'done ' : '') + (key > today ? 'future' : '')
                        }
                      >
                        {done && <Check size={15} />}
                      </span>
                    </button>
                  )
                })}
                <div className="habit-progress">
                  <span>
                    <strong>{count}</strong> / {habit.target}
                  </span>
                  <ProgressBar
                    value={count}
                    target={habit.target}
                    label={'Meta de ' + habit.name}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
