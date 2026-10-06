import { encryptionKey } from './token-store.mjs'
export function configuration(env = process.env) {
  const production = Boolean(env.VERCEL) || env.NODE_ENV === 'production'
  const cloud = production || env.APP_MODE === 'cloud'
  const origin = env.APP_ORIGIN || (production ? '' : 'http://127.0.0.1:5173')
  const origins = new Set(
    (env.APP_ORIGINS || (production ? origin : 'http://127.0.0.1:5173,http://localhost:5173'))
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  )
  const key = encryptionKey(env.GOOGLE_TOKEN_ENCRYPTION_KEY)
  const clientId = env.GOOGLE_CLIENT_ID?.trim() || ''
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || ''
  const email = env.ALLOWED_GOOGLE_EMAIL?.trim().toLowerCase() || ''
  const redirectUri =
    env.GOOGLE_REDIRECT_URI || (production ? '' : 'http://127.0.0.1:8787/api/auth/callback')
  const loginRedirectUri =
    env.GOOGLE_LOGIN_REDIRECT_URI || (production ? '' : 'http://127.0.0.1:8787/api/login/callback')
  const databaseUrl = env.DATABASE_URL || ''
  let validUrls = true
  try {
    for (const value of [origin, redirectUri, loginRedirectUri, ...origins]) {
      const url = new URL(value)
      if (production && url.protocol !== 'https:') validUrls = false
    }
    if (new URL(origin).origin !== origin || !origins.has(origin)) validUrls = false
    if (cloud) {
      const database = new URL(databaseUrl)
      if (!['postgres:', 'postgresql:'].includes(database.protocol)) validUrls = false
    }
    if (
      production &&
      (new URL(redirectUri).origin !== origin || new URL(loginRedirectUri).origin !== origin)
    )
      validUrls = false
  } catch {
    validUrls = false
  }
  const configured = Boolean(clientId && clientSecret && key)
  return {
    production,
    cloud,
    origin,
    origins,
    key,
    clientId,
    clientSecret,
    email,
    redirectUri,
    loginRedirectUri,
    databaseUrl,
    configured,
    ready:
      !cloud ||
      Boolean(configured && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && databaseUrl && validUrls),
  }
}
