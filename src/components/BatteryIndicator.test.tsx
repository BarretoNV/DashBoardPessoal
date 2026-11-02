import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BatteryIndicator } from './BatteryIndicator'

class MockBattery extends EventTarget {
  level = 0.65
  charging = false
}

function provide(getBattery: (() => Promise<MockBattery>) | undefined) {
  vi.stubGlobal('navigator', { getBattery })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('acompanha nível, carga baixa, carregamento e bateria cheia', async () => {
  const battery = new MockBattery()
  provide(async () => battery)
  render(<BatteryIndicator />)
  expect(await screen.findByRole('img', { name: 'Bateria: 65%, sem carregar' })).toBeTruthy()
  act(() => {
    battery.level = 0.2
    battery.dispatchEvent(new Event('levelchange'))
  })
  expect(screen.getByRole('img').classList.contains('is-low')).toBe(true)
  act(() => {
    battery.charging = true
    battery.dispatchEvent(new Event('chargingchange'))
  })
  expect(
    screen.getByRole('img', { name: 'Bateria: 20%, carregando' }).classList.contains('is-low'),
  ).toBe(false)
  act(() => {
    battery.level = 1
    battery.dispatchEvent(new Event('levelchange'))
  })
  expect(screen.getByRole('img', { name: 'Bateria: 100%, carregando' })).toBeTruthy()
  act(() => {
    battery.charging = false
    battery.dispatchEvent(new Event('chargingchange'))
  })
  expect(screen.getByRole('img', { name: 'Bateria: 100%, sem carregar' })).toBeTruthy()
})

it('não renderiza quando a API está ausente ou rejeita o acesso', async () => {
  provide(undefined)
  const first = render(<BatteryIndicator />)
  expect(first.container.textContent).toBe('')
  first.unmount()
  provide(async () => {
    throw new Error('Acesso negado')
  })
  const second = render(<BatteryIndicator />)
  await act(async () => {})
  expect(second.container.textContent).toBe('')
})

it('remove listeners ao desmontar', async () => {
  const battery = new MockBattery()
  const remove = vi.spyOn(battery, 'removeEventListener')
  provide(async () => battery)
  const view = render(<BatteryIndicator />)
  await screen.findByRole('img')
  view.unmount()
  expect(remove).toHaveBeenCalledWith('levelchange', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('chargingchange', expect.any(Function))
})

it('ignora a resposta quando desmontado durante a consulta', async () => {
  const battery = new MockBattery()
  const add = vi.spyOn(battery, 'addEventListener')
  let resolve!: (value: MockBattery) => void
  provide(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const view = render(<BatteryIndicator />)
  view.unmount()
  await act(async () => {
    resolve(battery)
  })
  expect(add).not.toHaveBeenCalled()
})
