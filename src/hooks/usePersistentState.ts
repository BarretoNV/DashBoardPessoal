import { useCallback, useEffect, useState, useSyncExternalStore, type SetStateAction } from 'react'
import { storageService } from '../services/storageService'
import {
  subscribeCloud,
  getCloudSnapshot,
  cloudKeys,
  updateCloud,
} from '../services/cloudDashboard'
export function usePersistentState<T>(
  key: string,
  initial: () => T,
  validate: (data: unknown) => data is T,
) {
  const [value, setValue] = useState<T>(() => storageService.read(key, initial, validate))
  const [saved, setSaved] = useState(true)
  const cloud = useSyncExternalStore(subscribeCloud, getCloudSnapshot)
  const synced = cloud.mode === 'cloud' && cloudKeys.has(key)
  const setPersistent = useCallback(
    (action: SetStateAction<T>) => {
      if (synced) updateCloud(key, action)
      else setValue(action)
    },
    [key, synced],
  )
  useEffect(() => {
    if (synced) return
    let active = true
    const saved = storageService.write(key, value)
    // Report the external write result after this synchronization cycle.
    queueMicrotask(() => {
      if (active) setSaved(saved)
    })
    return () => {
      active = false
    }
  }, [key, value, synced])
  return {
    value: synced && cloud.data ? (cloud.data[key as keyof typeof cloud.data] as T) : value,
    setValue: setPersistent,
    saved: synced ? cloud.status === 'synced' : saved,
  }
}
