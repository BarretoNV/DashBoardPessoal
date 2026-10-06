import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAutoTaskScroll } from './useAutoTaskScroll'

function viewport(overflow = true) {
  const element = document.createElement('ul')
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: overflow ? 200 : 100 },
  })
  return element
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('detecta overflow, espera no topo e completa o ciclo com retorno por fade', () => {
  const element = viewport()
  const ref = { current: element }
  const { result } = renderHook(() => useAutoTaskScroll({
    viewportRef: ref,
    resetKey: 'lista-a',
    measureKey: 'sete-tarefas',
    enabled: true,
    paused: false,
  }))

  act(() => vi.advanceTimersByTime(20))
  expect(result.current.hasOverflow).toBe(true)
  act(() => vi.advanceTimersByTime(3990))
  expect(element.scrollTop).toBe(0)
  act(() => vi.advanceTimersByTime(1000))
  expect(element.scrollTop).toBeGreaterThan(10)
  expect(element.scrollTop).toBeLessThan(14)
  act(() => vi.advanceTimersByTime(17000))
  expect(result.current.lastCompletedKey).toBe('lista-a')
  expect(element.classList.contains('task-list-fading')).toBe(false)
  expect(element.scrollTop).toBeLessThan(15)
})

it('mantém a posição pausada e desliga a animação com movimento reduzido', () => {
  const element = viewport()
  const ref = { current: element }
  const { result, rerender } = renderHook(({ paused }) => useAutoTaskScroll({
    viewportRef: ref,
    resetKey: 'lista-a',
    measureKey: 'tarefas',
    enabled: true,
    paused,
  }), { initialProps: { paused: false } })

  act(() => vi.advanceTimersByTime(5020))
  const position = element.scrollTop
  rerender({ paused: true })
  act(() => vi.advanceTimersByTime(5000))
  expect(element.scrollTop).toBe(position)
  expect(result.current.isAutoScrolling).toBe(true)

  cleanup()
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  const reduced = viewport()
  const reducedResult = renderHook(() => useAutoTaskScroll({
    viewportRef: { current: reduced },
    resetKey: 'lista-b',
    measureKey: 'tarefas',
    enabled: true,
    paused: false,
  }))
  act(() => vi.advanceTimersByTime(6000))
  expect(reduced.scrollTop).toBe(0)
  expect(reducedResult.result.current.isAutoScrolling).toBe(false)
})

it('não inicia rolagem quando apenas tarefas concluídas causam overflow', () => {
  const element = viewport()
  const pending = document.createElement('li')
  pending.dataset.taskPending = 'true'
  Object.defineProperties(pending, {
    offsetTop: { configurable: true, value: 0 },
    offsetHeight: { configurable: true, value: 46 },
  })
  element.append(pending, document.createElement('li'), document.createElement('li'))
  const { result } = renderHook(() => useAutoTaskScroll({
    viewportRef: { current: element },
    resetKey: 'lista-concluidas',
    measureKey: 'uma-pendente-duas-concluidas',
    enabled: true,
    paused: false,
  }))

  act(() => vi.advanceTimersByTime(10000))
  expect(element.scrollTop).toBe(0)
  expect(result.current.hasOverflow).toBe(false)
  expect(result.current.isAutoScrolling).toBe(false)
})
