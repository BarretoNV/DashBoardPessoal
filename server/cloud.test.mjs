// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { CloudStore } from './cloud-store.mjs'
import { createRuntime } from './runtime.mjs'
import { GoogleAuthManager } from './google-auth.mjs'
import { configuration } from './config.mjs'
import { defaultDashboard, applyOperations, validDashboard } from '../shared/dashboard.mjs'

const key = randomBytes(32)
const env = {
  APP_MODE: 'cloud',
  APP_ORIGIN: 'http://127.0.0.1:5173',
  APP_ORIGINS: 'http://127.0.0.1:5173',
  DATABASE_URL: 'postgres://test:test@localhost/test',
  GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_TOKEN_ENCRYPTION_KEY: key.toString('base64'),
  ALLOWED_GOOGLE_EMAIL: 'owner@example.test',
}
let db, store, base, server
let identity = { sub: 'owner', email: 'owner@example.test', email_verified: true, nonce: '' }
let nonce = ''
const client = {
  generateCodeVerifierAsync: vi.fn(async () => ({
    codeVerifier: 'pkce-secret',
    codeChallenge: 'challenge',
  })),
  generateAuthUrl: vi.fn((options) => {
    nonce = options.nonce
    return `https://accounts.google.test/?state=${options.state}`
  }),
  getToken: vi.fn(async () => ({
    tokens: { id_token: 'identity-token', refresh_token: 'refresh-secret', scope: 'calendar' },
  })),
  verifyIdToken: vi.fn(async () => ({ getPayload: () => ({ ...identity, nonce }) })),
  setCredentials: vi.fn(),
  getAccessToken: vi.fn(async () => ({ token: 'access' })),
  revokeToken: vi.fn(async () => {}),
}
beforeAll(async () => {
  db = new PGlite()
  for (const name of ['001_cloud.sql', '002_atomic_save.sql'])
    await db.exec(await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'))
  const sql = async (parts, ...values) => {
    const query = parts.reduce((s, p, i) => s + p + (i < values.length ? `$${i + 1}` : ''), '')
    return (await db.query(query, values)).rows
  }
  store = new CloudStore('', key, sql)
  await store.owner('owner', 'owner@example.test')
  server = await new Promise((resolve) => {
    const instance = createRuntime(env, { store, createClient: () => client }).listen(
      0,
      '127.0.0.1',
      () => resolve(instance),
    )
  })
  base = `http://127.0.0.1:${server.address().port}`
}, 30000)
afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (db) await db.close()
})
describe('banco cloud e operações atômicas', () => {
  it('valida migrações, revisões, conflitos e repetição sem duplicação', async () => {
    await store.dashboard('owner', defaultDashboard())
    const first = await store.update('owner', 0, 'first', {
      ...defaultDashboard(),
      tasks: [{ id: 'a', title: 'A', completed: false }],
    })
    expect(first.revision).toBe(1)
    expect(await store.update('owner', 0, 'stale', defaultDashboard())).toBeNull()
    const replay = await store.update('owner', 0, 'first', defaultDashboard())
    expect(replay).toEqual(first)
    const [a, b] = await Promise.all([
      store.update('owner', 1, 'device-a', {
        ...first.data,
        settings: { ...first.data.settings, name: 'A' },
      }),
      store.update('owner', 1, 'device-b', {
        ...first.data,
        settings: { ...first.data.settings, name: 'B' },
      }),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect((await store.dashboard('owner', defaultDashboard())).revision).toBe(2)
  })
  it('criptografa tokens e PKCE; consome OAuth uma vez entre instâncias', async () => {
    await store.putRequest('state', { kind: 'login', codeVerifier: 'pkce-secret' }, 'owner')
    const raw = (await db.query('SELECT payload FROM dashboard_oauth')).rows
    expect(JSON.stringify(raw)).not.toContain('pkce-secret')
    expect(await store.takeRequest('state')).toMatchObject({
      codeVerifier: 'pkce-secret',
      ownerId: 'owner',
    })
    expect(await store.takeRequest('state')).toBeNull()
    const first = new GoogleAuthManager({
      store: store.tokenStore('owner'),
      requestStore: store,
      ownerId: 'owner',
      clientId: 'test-client',
      redirectUri: 'http://test/callback',
      createOAuthClient: () => client,
    })
    const authorization = await first.authorizationUrl(['calendar'])
    const restarted = new GoogleAuthManager({
      store: store.tokenStore('owner'),
      requestStore: store,
      ownerId: 'owner',
      clientId: 'test-client',
      redirectUri: 'http://test/callback',
      createOAuthClient: () => client,
    })
    await restarted.exchangeCode('code', authorization.state)
    expect(await restarted.status()).toMatchObject({ connected: true })
    expect(
      JSON.stringify((await db.query('SELECT payload FROM dashboard_credentials')).rows),
    ).not.toContain('refresh-secret')
    identity = { ...identity, sub: 'another' }
    const wrong = await first.authorizationUrl(['calendar'])
    await expect(restarted.exchangeCode('code', wrong.state)).rejects.toThrow('Conta Google')
    identity = { ...identity, sub: 'owner' }
    expect((await store.tokenStore('owner').read()).refreshToken).toBe('refresh-secret')
    client.getAccessToken.mockRejectedValueOnce({ response: { data: { error: 'invalid_grant' } } })
    await expect(restarted.client()).rejects.toBeTruthy()
    expect(await store.tokenStore('owner').read()).toBeNull()
  })
  it('reaplica alterações por campo e dia sem apagar outros dispositivos', () => {
    const initial = defaultDashboard()
    initial.habits = [{ id: 'habit', name: 'H', target: 3, completedDays: [] }]
    const result = applyOperations(initial, [
      { type: 'day', key: 'habits', id: 'habit', day: '2026-10-06', completed: true },
      { type: 'day', key: 'habits', id: 'habit', day: '2026-10-05', completed: true },
    ])
    expect(result.habits[0].completedDays).toHaveLength(2)
    expect(
      validDashboard({
        ...result,
        tasks: [{ id: 'a', title: 'X', completed: false, due: '2026-02-30' }],
      }),
    ).toBe(false)
    expect(
      validDashboard({
        ...result,
        tasks: [{ id: 'a', title: 'X', completed: false, refreshToken: 'secret' }],
      }),
    ).toBe(false)
  })
})
describe('acesso privado e API', () => {
  it('verifica configuração e migração do banco sem expor dados no health check', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(503)
    await db.exec(
      "CREATE TABLE dashboard_migrations(name text PRIMARY KEY); INSERT INTO dashboard_migrations(name) VALUES('002_atomic_save.sql')",
    )
    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
  it('nega visitante, expiração, outra conta e mutações sem CSRF', async () => {
    expect((await fetch(`${base}/api/dashboard`)).status).toBe(401)
    await store.session('expired', 'owner', 'csrf')
    await db.query("UPDATE dashboard_sessions SET expires_at=now()-interval '1 day'")
    expect(
      (await fetch(`${base}/api/dashboard`, { headers: { cookie: 'dashboard_session=expired' } }))
        .status,
    ).toBe(401)
    await store.owner('other', 'other@example.test')
    await store.session('other-token', 'other', 'csrf')
    expect(
      (
        await fetch(`${base}/api/dashboard`, {
          headers: { cookie: 'dashboard_session=other-token' },
        })
      ).status,
    ).toBe(403)
    await store.session('allowed', 'owner', 'csrf')
    expect(
      (
        await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: { cookie: 'dashboard_session=allowed', Origin: env.APP_ORIGIN },
        })
      ).status,
    ).toBe(403)
    expect(
      (await fetch(`${base}/api/auth/status`, { headers: { cookie: 'dashboard_session=allowed' } }))
        .status,
    ).toBe(200)
    const response = await fetch(`${base}/api/dashboard`, {
      headers: { cookie: 'dashboard_session=allowed' },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.status).toBe(200)
    const current = await response.json()
    const patch = await fetch(`${base}/api/dashboard`, {
      method: 'PATCH',
      headers: {
        cookie: 'dashboard_session=allowed',
        Origin: env.APP_ORIGIN,
        'X-CSRF-Token': 'csrf',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        revision: current.revision,
        operationId: 'api-patch',
        operations: [{ type: 'fields', key: 'settings', changes: { name: 'Sincronizado' } }],
      }),
    })
    expect(patch.status).toBe(200)
    expect((await patch.json()).data.settings.name).toBe('Sincronizado')
    const logout = await fetch(`${base}/api/session/logout`, {
      method: 'POST',
      headers: {
        cookie: 'dashboard_session=allowed',
        Origin: env.APP_ORIGIN,
        'X-CSRF-Token': 'csrf',
      },
    })
    expect(logout.status).toBe(204)
    expect(await store.getSession('allowed')).toBeNull()
  })
  it('valida state e conta no callback e emite cookie seguro em produção', async () => {
    const bad = await fetch(`${base}/api/login/callback?code=x&state=x`, { redirect: 'manual' })
    expect(bad.headers.get('location')).toContain('login=error')
    const start = await fetch(`${base}/api/login/start`, { redirect: 'manual' })
    const state = new URL(start.headers.get('location')).searchParams.get('state')
    const cookie = start.headers.get('set-cookie').split(';')[0]
    const finish = await fetch(`${base}/api/login/callback?code=x&state=${state}`, {
      headers: { cookie },
      redirect: 'manual',
    })
    expect(finish.headers.get('location')).toBe(env.APP_ORIGIN)
    expect(finish.headers.get('set-cookie')).toContain('HttpOnly')
    const second = await fetch(`${base}/api/login/start`, { redirect: 'manual' })
    const secondState = new URL(second.headers.get('location')).searchParams.get('state')
    identity = { ...identity, email: 'other@example.test' }
    const denied = await fetch(`${base}/api/login/callback?code=x&state=${secondState}`, {
      headers: { cookie: second.headers.get('set-cookie').split(';')[0] },
      redirect: 'manual',
    })
    expect(denied.headers.get('location')).toContain('login=denied')
    identity = { ...identity, email: 'owner@example.test' }
    expect(configuration({ ...env, VERCEL: '1' }).ready).toBe(false)
    expect(
      configuration({
        ...env,
        VERCEL: '1',
        APP_ORIGIN: 'https://panel.test',
        APP_ORIGINS: 'https://panel.test',
        GOOGLE_REDIRECT_URI: 'https://panel.test/api/auth/callback',
        GOOGLE_LOGIN_REDIRECT_URI: 'https://panel.test/api/login/callback',
      }).ready,
    ).toBe(true)
  })
  it('retorna erro controlado se o banco está indisponível', async () => {
    const read = vi
      .spyOn(store, 'getSession')
      .mockRejectedValueOnce(new Error('postgres password secret'))
    const response = await fetch(`${base}/api/session`, {
      headers: { cookie: 'dashboard_session=anything' },
    })
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('password')
    read.mockRestore()
  })
})
