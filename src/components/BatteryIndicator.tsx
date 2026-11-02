import { Zap } from 'lucide-react'
import { useBattery } from '../hooks/useBattery'

export function BatteryIndicator() {
  const battery = useBattery()
  if (!battery) return null

  const { percentage, charging } = battery
  const label = `Bateria: ${percentage}%, ${charging ? 'carregando' : 'sem carregar'}`
  return (
    <span
      className={`battery-indicator${charging ? ' is-charging' : percentage <= 20 ? ' is-low' : ''}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg width="23" height="16" viewBox="0 0 26 18" fill="none" aria-hidden="true">
        <rect x="1" y="2" width="21" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M24 6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect
          x="3.5"
          y="4.5"
          width={(16 * percentage) / 100}
          height="9"
          rx="0.5"
          fill="currentColor"
        />
      </svg>
      <span aria-hidden="true">{percentage}%</span>
      {charging && <Zap size={13} fill="currentColor" aria-hidden="true" />}
    </span>
  )
}
