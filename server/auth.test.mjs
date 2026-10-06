import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EncryptedTokenStore } from './token-store.mjs'
import { GoogleAuthManager } from './google-auth.mjs'
import { createApp } from './app.mjs'

const temporary = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function store() {
  const directory = await mkdtemp(join(tmpdir(), 'dashboard-auth-'))
  temporary.push(directory)
  return new EncryptedTokenStore(join(directory, 'session.enc'), randomBytes(32))
}

describe('sessão OAuth local', () => {
  it('persiste criptografada e restaura depois de recriar o servidor', async () => {
    const tokenStore = await store()
    await tokenStore.write({ refreshToken: 'refresh-secret', scopes: ['calendar'] })
    const raw = await import('node:fs/promises').then(({ readFile }) =>
      readFile(tokenStore.filePath, 'utf8'),
    )
    expect(raw).not.toContain('refresh-secret')

    const getAccessToken = vi.fn().mockResolvedValue({ token: 'new-access-token' })
    const setCredentials = vi.fn()
    const first = new GoogleAuthManager({
      store: tokenStore,
      redirectUri: 'http://127.0.0.1:5173',
      createOAuthClient: () => ({ getAccessToken, setCredentials }),
    })
    expect(await first.status()).toEqual({ connected: true, scopes: ['calendar'] })

    const restarted = new GoogleAuthManager({
      store: tokenStore,
      redirectUri: 'http://127.0.0.1:5173',
      createOAuthClient: () => ({ getAccessToken, setCredentials }),
    })
    await restarted.client()
    expect(setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-secret' })
    expect(getAccessToken).toHaveBeenCalledTimes(2)
  })

  it('preserva refresh token anterior em autorização incremental e revoga no logout', async () => {
    const tokenStore = await store()
    await tokenStore.write({ refreshToken: 'existing-refresh', scopes: ['calendar'] })
    const revokeToken = vi.fn().mockResolvedValue(undefined)
    const manager = new GoogleAuthManager({
      store: tokenStore,
      redirectUri: 'http://127.0.0.1:5173',
      createOAuthClient: () => ({
        generateCodeVerifierAsync: vi.fn().mockResolvedValue({ codeVerifier: 'verifier', codeChallenge: 'challenge' }),
        generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.test'),
        getToken: vi.fn().mockResolvedValue({ tokens: { access_token: 'access', scope: 'tasks' } }),
        setCredentials: vi.fn(),
        revokeToken,
      }),
    })
    const authorization = await manager.authorizationUrl(['tasks'])
    expect(await manager.exchangeCode('code', authorization.state)).toEqual({
      connected: true,
      scopes: ['calendar', 'tasks'],
    })
    expect((await tokenStore.read()).refreshToken).toBe('existing-refresh')
    await manager.logout()
    expect(revokeToken).toHaveBeenCalledWith('existing-refresh')
    expect(await tokenStore.read()).toBeNull()
  })

  it('remove uma sessão cujo refresh token foi revogado', async () => {
    const tokenStore = await store()
    await tokenStore.write({ refreshToken: 'revoked', scopes: ['calendar'] })
    const manager = new GoogleAuthManager({
      store: tokenStore,
      redirectUri: 'http://127.0.0.1:5173',
      createOAuthClient: () => ({
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockRejectedValue({ response: { data: { error: 'invalid_grant' } } }),
      }),
    })
    await expect(manager.client()).rejects.toBeTruthy()
    expect(await manager.status()).toEqual({ connected: false, scopes: [] })
  })
})

describe('API local', () => {
  it('expõe somente status e exige origem local em mutações', async () => {
    const authManager = {
      status: vi.fn().mockResolvedValue({ connected: true, scopes: ['calendar'] }),
      logout: vi.fn().mockResolvedValue(undefined),
      exchangeCode: vi.fn(),
      authorizationUrl: vi.fn(),
    }
    const gateway = {
      calendarEvents: vi.fn(),
      taskLists: vi.fn().mockResolvedValue([{ id: 'list-a', title: 'Pessoal' }]),
      tasks: vi.fn(),
      createTask: vi.fn().mockResolvedValue({ id: 'new', title: 'Planejar', due: '2026-09-28T00:00:00.000Z' }),
      updateTask: vi.fn().mockResolvedValue({ id: 'a', title: 'Atualizada' }),
    }
    const app = createApp({
      authManager,
      gateway,
      configured: true,
      origins: new Set(['http://127.0.0.1:5173']),
      appOrigin: 'http://127.0.0.1:5173',
      scopes: { calendar: 'calendar', tasks: 'tasks' },
    })
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
    })
    try {
      const address = server.address()
      const base = `http://127.0.0.1:${address.port}`
      const status = await fetch(`${base}/api/auth/status`).then((response) => response.json())
      expect(status).toEqual({ connected: true, scopes: ['calendar'] })
      expect(status).not.toHaveProperty('refreshToken')

      const denied = await fetch(`${base}/api/auth/logout`, { method: 'POST' })
      expect(denied.status).toBe(403)
      const logout = await fetch(`${base}/api/auth/logout`, {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1:5173' },
      })
      expect(logout.status).toBe(204)
      expect(authManager.logout).toHaveBeenCalledOnce()

      const lists = await fetch(`${base}/api/task-lists`).then((response) => response.json())
      expect(lists.items).toEqual([{ id: 'list-a', title: 'Pessoal' }])

      const missingList = await fetch(`${base}/api/tasks`)
      expect(missingList.status).toBe(400)
      const listed = await fetch(`${base}/api/tasks?taskListId=list-a`)
      expect(listed.status).toBe(200)
      expect(gateway.tasks).toHaveBeenCalledWith('list-a')

      const created = await fetch(`${base}/api/tasks`, {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '  Planejar  ', due: '2026-09-28', taskListId: 'list-a' }),
      })
      expect(created.status).toBe(201)
      expect(gateway.createTask).toHaveBeenCalledWith({ title: 'Planejar', due: '2026-09-28', taskListId: 'list-a' })

      const invalidDate = await fetch(`${base}/api/tasks`, {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Planejar', due: '2026-02-30', taskListId: 'list-a' }),
      })
      expect(invalidDate.status).toBe(400)

      const unexpected = await fetch(`${base}/api/tasks`, {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Planejar', priority: 'high', taskListId: 'list-a' }),
      })
      expect(unexpected.status).toBe(400)

      const invalidPatch = await fetch(`${base}/api/tasks/a`, {
        method: 'PATCH',
        headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      })
      expect(invalidPatch.status).toBe(400)

      const edited = await fetch(`${base}/api/tasks/a`, {
        method: 'PATCH',
        headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: ' Atualizada ', due: '2026-09-30', taskListId: 'list-a' }),
      })
      expect(edited.status).toBe(200)
      expect(gateway.updateTask).toHaveBeenCalledWith('a', {
        title: 'Atualizada', due: '2026-09-30',
      }, 'list-a')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
