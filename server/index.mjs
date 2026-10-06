import { resolve } from 'node:path'
import { google } from 'googleapis'
import { createApp } from './app.mjs'
import { GoogleAuthManager } from './google-auth.mjs'
import { createGoogleGateway } from './google-gateway.mjs'
import { EncryptedTokenStore, encryptionKey } from './token-store.mjs'

const port = Number(process.env.API_PORT || 8787)
const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? ''
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''
const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || 'http://127.0.0.1:8787/api/auth/callback'
const appOrigin = process.env.APP_ORIGIN?.trim() || 'http://127.0.0.1:5173'
const key = encryptionKey(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY)
const origins = new Set(
  (process.env.APP_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)
const configured = Boolean(clientId && clientSecret && key)
const store = new EncryptedTokenStore(resolve('.data/google-session.enc'), key)
const authManager = new GoogleAuthManager({
  store,
  redirectUri,
  createOAuthClient: (origin = redirectUri) => new google.auth.OAuth2(clientId, clientSecret, origin),
})
const app = createApp({
  authManager,
  gateway: createGoogleGateway(authManager),
  configured,
  origins,
  appOrigin,
  scopes: {
    calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
    tasks: 'https://www.googleapis.com/auth/tasks',
  },
})

app.listen(port, '127.0.0.1', () => {
  console.log(
    configured
      ? `API local pronta em http://127.0.0.1:${port}`
      : 'API local iniciada. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_TOKEN_ENCRYPTION_KEY.',
  )
})
