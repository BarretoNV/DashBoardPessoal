export const storageService = {
  read<T>(key: string, fallback: () => T, validate: (data: unknown) => data is T): T {
    try {
      const raw = localStorage.getItem(`command-center:${key}`)
      if (raw === null) return fallback()
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed) && parsed.version === 1 && validate(parsed.data)) return parsed.data
    } catch {
      /* Unavailable or damaged storage: use safe defaults. */
    }
    return fallback()
  },
  write<T>(key: string, data: T): boolean {
    try {
      localStorage.setItem(`command-center:${key}`, JSON.stringify({ version: 1, data }))
      return true
    } catch {
      return false
    }
  },
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
