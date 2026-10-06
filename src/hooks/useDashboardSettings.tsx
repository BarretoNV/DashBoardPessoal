import { createContext, useContext, type ReactNode } from 'react'
import { dashboardConfig } from '../config/dashboard'
import { validSettings } from '../services/validation'
import { usePersistentState } from './usePersistentState'
function useSettingsState() {
  return usePersistentState('settings', () => dashboardConfig, validSettings)
}
const SettingsContext = createContext<ReturnType<typeof useSettingsState> | null>(null)
export function SettingsProvider({ children }: { children: ReactNode }) {
  const state = useSettingsState()
  return <SettingsContext.Provider value={state}>{children}</SettingsContext.Provider>
}
export function useDashboardSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('SettingsProvider is required')
  return context
}
