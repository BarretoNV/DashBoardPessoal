import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useHabitPagination } from './useHabitPagination'
import { toggleHabitDay } from '../services/habitService'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('avança de 15 em 15 segundos e retorna ao início', () => {
  const { result } = renderHook(() => useHabitPagination(5, false))
  expect(result.current.size).toBe(2)
  act(() => vi.advanceTimersByTime(15000))
  expect(result.current.page).toBe(1)
  act(() => vi.advanceTimersByTime(30000))
  expect(result.current.page).toBe(0)
})
it('pausa por hover, foco, configurações e aba oculta', () => {
  const { result, rerender } = renderHook(({ editing }) => useHabitPagination(6, editing), { initialProps: { editing: false } })
  act(() => result.current.setHovered(true))
  act(() => vi.advanceTimersByTime(30000))
  expect(result.current.page).toBe(0)
  act(() => { result.current.setHovered(false); result.current.setFocused(true) })
  act(() => vi.advanceTimersByTime(30000))
  expect(result.current.page).toBe(0)
  act(() => result.current.setFocused(false))
  rerender({ editing: true })
  act(() => vi.advanceTimersByTime(30000))
  expect(result.current.page).toBe(0)
  rerender({ editing: false })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  act(() => vi.advanceTimersByTime(30000))
  expect(result.current.page).toBe(0)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  act(() => vi.advanceTimersByTime(15000))
  expect(result.current.page).toBe(1)
})
it('reinicia o intervalo após navegação manual e corrige exclusão na última página', () => {
  const { result, rerender } = renderHook(({ count }) => useHabitPagination(count, false), { initialProps: { count: 6 } })
  act(() => vi.advanceTimersByTime(14000))
  act(() => result.current.go(1))
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current.page).toBe(1)
  act(() => result.current.go(1))
  expect(result.current.page).toBe(2)
  rerender({ count: 2 })
  expect(result.current.page).toBe(0)
  expect(result.current.pageCount).toBe(1)
})
it('usa três linhas com altura de 900px e reage ao redimensionamento', () => {
  const query = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', () => query)
  const { result } = renderHook(() => useHabitPagination(7, false))
  expect(result.current.size).toBe(3)
  query.matches = false
  act(() => query.addEventListener.mock.calls[0][1]())
  expect(result.current.size).toBe(2)
})
it('marca e desmarca sem duplicar e não permite futuro ou outra semana', () => {
  const now = new Date(2026, 8, 24)
  const habits = [{ id: 'a', name: 'Treino', target: 5, completedDays: ['2026-09-14'] }]
  const marked = toggleHabitDay(habits, 'a', '2026-09-24', now)
  expect(marked[0].completedDays).toEqual(['2026-09-14', '2026-09-24'])
  expect(toggleHabitDay(marked, 'a', '2026-09-24', now)).toEqual(habits)
  expect(toggleHabitDay(habits, 'a', '2026-09-25', now)).toBe(habits)
  expect(toggleHabitDay(habits, 'a', '2026-09-14', now)).toBe(habits)
})
