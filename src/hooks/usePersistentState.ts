import { useEffect, useState } from 'react'
import { storageService } from '../services/storageService'
export function usePersistentState<T>(
  key: string,
  initial: () => T,
  validate: (data: unknown) => data is T,
) {
  const [value, setValue] = useState<T>(() => storageService.read(key, initial, validate))
  const [saved, setSaved] = useState(true)
  useEffect(() => {
    let active = true
    const saved = storageService.write(key, value)
    // Report the external write result after this synchronization cycle.
    queueMicrotask(() => {
      if (active) setSaved(saved)
    })
    return () => {
      active = false
    }
  }, [key, value])
  return { value, setValue, saved }
}
