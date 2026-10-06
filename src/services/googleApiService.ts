export class GoogleApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function googleFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let message = 'O Google está temporariamente indisponível.'
    try {
      const body = await response.json() as { error?: string | { message?: string } }
      message = typeof body.error === 'string' ? body.error : body.error?.message || message
    } catch { /* Keep the safe message. */ }
    throw new GoogleApiError(message, response.status)
  }
  return response.json() as Promise<T>
}
