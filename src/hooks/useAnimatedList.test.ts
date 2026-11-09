import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAnimatedList } from './useAnimatedList'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function fixture(reduced = false) {
  const motion = Object.assign(new EventTarget(), { matches: reduced })
  vi.stubGlobal('matchMedia', () => motion)
  const list = document.createElement('ul')
  Object.defineProperty(list, 'clientHeight', { value: 200 })
  let top = 0
  const row = document.createElement('li')
  row.dataset.motionId = 'task-a'
  Object.defineProperty(row, 'offsetTop', { get: () => top })
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel }) as unknown as Animation)
  row.animate = animate
  list.append(row)
  const ref = { current: list }
  const hook = renderHook(({ revision, group }) => useAnimatedList(ref, revision, group), {
    initialProps: { revision: 'initial', group: 'list-a' },
  })
  return {
    ...hook,
    animate,
    cancel,
    reduce: () => {
      motion.matches = true
      motion.dispatchEvent(new Event('change'))
    },
    move: (position: number) => {
      top = position
    },
  }
}

it('anima somente mudanças de posição e cancela a animação ao desmontar', () => {
  const { animate, cancel, move, rerender, unmount } = fixture()
  expect(animate).not.toHaveBeenCalled()
  move(52)
  rerender({ revision: 'completed', group: 'list-a' })
  expect(animate).toHaveBeenCalledWith(
    [{ transform: 'translateY(-52px)' }, { transform: 'translateY(0)' }],
    expect.objectContaining({ duration: 300 }),
  )
  // Clock re-renders do not restart animation or perform another layout pass.
  rerender({ revision: 'completed', group: 'list-a' })
  expect(animate).toHaveBeenCalledTimes(1)
  unmount()
  expect(cancel).toHaveBeenCalledTimes(1)
})

it('não anima trocas de listas nem saltos para fora do viewport', () => {
  const { animate, move, rerender } = fixture()
  move(52)
  rerender({ revision: 'other-list', group: 'list-b' })
  move(600)
  rerender({ revision: 'offscreen', group: 'list-b' })
  expect(animate).not.toHaveBeenCalled()
})

it('respeita movimento reduzido mesmo quando uma tarefa muda de posição', () => {
  const { animate, move, rerender } = fixture(true)
  move(52)
  rerender({ revision: 'completed', group: 'list-a' })
  expect(animate).not.toHaveBeenCalled()
})

it('interrompe movimento em andamento quando a preferência do sistema muda', () => {
  const { animate, cancel, move, rerender, reduce } = fixture()
  move(52)
  rerender({ revision: 'completed', group: 'list-a' })
  expect(animate).toHaveBeenCalledTimes(1)
  reduce()
  expect(cancel).toHaveBeenCalledTimes(1)
})
