import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SettingsProvider } from './hooks/useDashboardSettings'
import { GoogleConnectionProvider } from './hooks/useGoogleConnection'
import * as cloud from './services/cloudDashboard'
import { defaultDashboard } from '../shared/dashboard.mjs'

const sessionWarning = /Não foi possível salvar\. Suas alterações durarão apenas nesta sessão\./

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 503 })),
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function showPanel(mode: 'local' | 'cloud', status: cloud.CloudSnapshot['status']) {
  const data = defaultDashboard()
  data.settings.showWeather = false
  vi.spyOn(cloud, 'getCloudSnapshot').mockReturnValue({
    mode,
    authenticated: mode === 'cloud',
    data: mode === 'cloud' ? data : null,
    revision: 1,
    status,
    message: '',
  })
  return render(
    <SettingsProvider>
      <GoogleConnectionProvider>
        <App />
      </GoogleConnectionProvider>
    </SettingsProvider>,
  )
}

it.each(['synced', 'saving', 'error'] as const)(
  'não mostra o aviso de armazenamento local quando a nuvem está em %s',
  (status) => {
    showPanel('cloud', status)
    expect(screen.queryByText(sessionWarning)).toBeNull()
  },
)

it('avisa quando o armazenamento local realmente falha', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage full', 'QuotaExceededError')
  })
  showPanel('local', 'synced')
  await waitFor(() => expect(screen.getByText(sessionWarning)).toBeTruthy())
})

it('não mostra aviso quando o armazenamento local funciona', async () => {
  showPanel('local', 'synced')
  await waitFor(() => expect(localStorage.getItem('command-center:settings')).not.toBeNull())
  expect(screen.queryByText(sessionWarning)).toBeNull()
})
