export const GOOGLE_SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
  tasks: 'https://www.googleapis.com/auth/tasks',
} as const

export interface GoogleStatus {
  connected: boolean
  scopes: string[]
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = response.status === 204 ? null : await response.json()
  if (!response.ok) {
    throw new Error(
      (body as { error?: string } | null)?.error ?? 'A API local não respondeu corretamente.',
    )
  }
  return body as T
}

export const googleAuthService = {
  async config(): Promise<{ configured: boolean }> {
    return api('/api/auth/config')
  },
  async status(): Promise<GoogleStatus> {
    return api('/api/auth/status')
  },
  authorize(features: Array<'calendar' | 'tasks'>): void {
    const query = new URLSearchParams({ features: [...new Set(features)].join(',') })
    window.location.assign(`/api/auth/start?${query}`)
  },
  async logout(): Promise<void> {
    await api('/api/auth/logout', { method: 'POST', body: '{}' })
  },
}
