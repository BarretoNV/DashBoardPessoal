import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { IntegrationPreferences } from '../types'
import { googleAuthService, GOOGLE_SCOPES, type GoogleStatus } from '../services/googleAuthService'
import { validIntegrationPreferences } from '../services/validation'
import { usePersistentState } from './usePersistentState'
import { flushCloud, getCloudSnapshot } from '../services/cloudDashboard'
import { storageService } from '../services/storageService'

type GoogleFeature = 'calendar' | 'tasks'
function useConnectionState() {
  const preferences = usePersistentState<IntegrationPreferences>(
    'integrations',
    () => ({ calendarEnabled: false, tasksEnabled: false }),
    validIntegrationPreferences,
  )
  const [status, setStatus] = useState<GoogleStatus>({ connected: false, scopes: [] })
  const [available, setAvailable] = useState(false)
  const [checking, setChecking] = useState(true)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState<GoogleFeature | 'logout' | null>(null)
  const [error, setError] = useState(() =>
    new URLSearchParams(window.location.search).get('google') === 'error'
      ? 'Não foi possível concluir a conexão com o Google.'
      : '',
  )

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('google')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const [config, current] = await Promise.all([
        googleAuthService.config(),
        googleAuthService.status(),
      ])
      setAvailable(config.configured)
      setStatus(current)
      setRevision((value) => value + 1)
      setError('')
    } catch {
      setAvailable(false)
      setStatus({ connected: false, scopes: [] })
      setError('A API local não está disponível.')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshStatus(), 0)
    return () => window.clearTimeout(timer)
  }, [refreshStatus])

  const connect = useCallback(
    async (feature: GoogleFeature) => {
      setBusy(feature)
      setError('')
      const next: IntegrationPreferences =
        feature === 'calendar'
          ? { ...preferences.value, calendarEnabled: true }
          : { ...preferences.value, tasksEnabled: true }
      preferences.setValue(next)
      if (getCloudSnapshot().mode !== 'cloud') storageService.write('integrations', next)
      try {
        await flushCloud()
        googleAuthService.authorize([
          ...(next.calendarEnabled ? ['calendar' as const] : []),
          ...(next.tasksEnabled ? ['tasks' as const] : []),
        ])
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Não foi possível conectar.')
        setBusy(null)
      }
    },
    [preferences],
  )

  const disconnect = useCallback(async () => {
    setBusy('logout')
    setError('')
    try {
      await googleAuthService.logout()
      setStatus({ connected: false, scopes: [] })
      setRevision((value) => value + 1)
      preferences.setValue({ calendarEnabled: false, tasksEnabled: false })
    } catch {
      setError('Não foi possível desconectar a conta Google.')
    } finally {
      setBusy(null)
    }
  }, [preferences])

  const hasScope = (scope: string) => status.connected && status.scopes.includes(scope)
  return {
    preferences: preferences.value,
    saved: preferences.saved,
    available,
    checking,
    connected: status.connected,
    revision,
    calendarConnected: hasScope(GOOGLE_SCOPES.calendar),
    tasksConnected: hasScope(GOOGLE_SCOPES.tasks),
    busy,
    error,
    connect,
    disconnect,
    refreshStatus,
  }
}

type Connection = ReturnType<typeof useConnectionState>
const GoogleConnectionContext = createContext<Connection | null>(null)
export function GoogleConnectionProvider({ children }: { children: ReactNode }) {
  const state = useConnectionState()
  return (
    <GoogleConnectionContext.Provider value={state}>{children}</GoogleConnectionContext.Provider>
  )
}
export function useGoogleConnection() {
  const context = useContext(GoogleConnectionContext)
  if (!context) throw new Error('GoogleConnectionProvider is required')
  return context
}
