import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useClock } from './useClock'
import { useWeather } from './useWeather'
import { usePersistentState } from './usePersistentState'
import { useIdleAmbient } from './useIdleAmbient'
import { validTasks } from '../services/validation'
import type { Task } from '../types'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})
it('relógio atravessa meia-noite e atualiza depois de suspensão', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 24, 23, 59, 50))
  const { result } = renderHook(useClock)
  act(() => vi.advanceTimersByTime(10000))
  expect(result.current.getDate()).toBe(25)
  act(() => {
    vi.setSystemTime(new Date(2026, 8, 26, 10))
    window.dispatchEvent(new Event('focus'))
  })
  expect(result.current.getDate()).toBe(26)
})
it('mantém última leitura na falha e recupera após reconexão', async () => {
  const response = () =>
    new Response(
      JSON.stringify({
        current: { temperature_2m: 24, weather_code: 2 },
        daily: {
          time: ['2026-09-24'],
          weather_code: [2],
          temperature_2m_max: [27],
          temperature_2m_min: [20],
          precipitation_probability_max: [20],
        },
      }),
    )
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response())
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(response())
  const { result } = renderHook(() =>
    useWeather({ name: 'Teste', latitude: 0, longitude: 0 }, true),
  )
  await waitFor(() => expect(result.current.data?.temperature).toBe(24))
  act(() => window.dispatchEvent(new Event('online')))
  await waitFor(() => expect(result.current.stale).toBe(true))
  expect(result.current.data?.temperature).toBe(24)
  act(() => window.dispatchEvent(new Event('online')))
  await waitFor(() => expect(result.current.stale).toBe(false))
})
it('não consulta clima oculto e aborta ao trocar localização', async () => {
  const signals: AbortSignal[] = []
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    signals.push(init!.signal as AbortSignal)
    return new Promise(() => {})
  })
  const { rerender, unmount } = renderHook(
    ({ enabled, latitude }) => useWeather({ name: '', latitude, longitude: 0 }, enabled),
    { initialProps: { enabled: false, latitude: 0 } },
  )
  expect(fetchMock).not.toHaveBeenCalled()
  rerender({ enabled: true, latitude: 0 })
  rerender({ enabled: true, latitude: 1 })
  expect(signals[0].aborted).toBe(true)
  unmount()
  expect(signals[1].aborted).toBe(true)
})
it('persiste edições e não restaura exemplos sobre uma lista vazia', async () => {
  const defaults = (): Task[] => [{ id: '1', title: 'Exemplo', completed: false, source: 'local' }]
  const { result, unmount } = renderHook(() => usePersistentState('tasks', defaults, validTasks))
  act(() => result.current.setValue([]))
  unmount()
  const reloaded = renderHook(() => usePersistentState('tasks', defaults, validTasks))
  expect(reloaded.result.current.value).toEqual([])
})
it('ativa o ambiente por inatividade e reinicia ao interagir', () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(
    ({ enabled, blocked }) => useIdleAmbient({ enabled, blocked, timeoutMs: 1000 }),
    { initialProps: { enabled: true, blocked: false } },
  )
  act(() => vi.advanceTimersByTime(999))
  expect(result.current.idleAmbient).toBe(false)
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.idleAmbient).toBe(true)
  act(() => result.current.registerActivity())
  expect(result.current.idleAmbient).toBe(false)
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current.idleAmbient).toBe(true)
  rerender({ enabled: true, blocked: true })
  act(() => vi.advanceTimersByTime(0))
  expect(result.current.idleAmbient).toBe(false)
  act(() => vi.advanceTimersByTime(2000))
  expect(result.current.idleAmbient).toBe(false)
})
