import { mockHabits } from '../data/demo'
import { validHabits } from '../services/validation'
import { usePersistentState } from './usePersistentState'
export function useHabits() {
  return usePersistentState('habits', mockHabits, validHabits)
}
