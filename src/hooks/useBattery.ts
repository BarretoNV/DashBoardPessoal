import { useEffect, useState } from 'react'

interface BatteryManager extends EventTarget {
  readonly level: number
  readonly charging: boolean
}

interface BatteryNavigator extends Navigator {
  getBattery?: () => Promise<BatteryManager>
}

export interface BatteryState {
  percentage: number
  charging: boolean
}

export function useBattery(): BatteryState | null {
  const [state, setState] = useState<BatteryState | null>(null)

  useEffect(() => {
    const batteryNavigator = navigator as BatteryNavigator
    if (!batteryNavigator.getBattery) return

    let disposed = false
    let battery: BatteryManager | undefined
    const update = () => {
      if (!disposed && battery) {
        setState(
          Number.isFinite(battery.level)
            ? {
                percentage: Math.round(Math.min(1, Math.max(0, battery.level)) * 100),
                charging: battery.charging,
              }
            : null,
        )
      }
    }

    const connect = async () => {
      try {
        const manager = await batteryNavigator.getBattery!()
        if (disposed) return
        battery = manager
        battery.addEventListener('levelchange', update)
        battery.addEventListener('chargingchange', update)
        update()
      } catch {
        if (!disposed) setState(null)
      }
    }
    void connect()

    return () => {
      disposed = true
      battery?.removeEventListener('levelchange', update)
      battery?.removeEventListener('chargingchange', update)
    }
  }, [])

  return state
}
