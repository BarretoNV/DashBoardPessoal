import express from 'express'
import { resolve } from 'node:path'
import { google } from 'googleapis'
import { configuration } from './config.mjs'
import { CloudStore } from './cloud-store.mjs'
import { installCloudAuth } from './cloud-auth.mjs'
import { GoogleAuthManager } from './google-auth.mjs'
import { EncryptedTokenStore } from './token-store.mjs'
import { createGoogleGateway } from './google-gateway.mjs'
import { createApp } from './app.mjs'
import { defaultDashboard, applyOperations } from '../shared/dashboard.mjs'
export function createRuntime(env = process.env, dependencies = {}) {
  const config = configuration(env),
    app = express()
  let cloudStore
  app.disable('x-powered-by')
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.get('/api/health', async (_req, res) => {
    let ok = config.ready
    if (ok && cloudStore) {
      try {
        const rows =
          await cloudStore.sql`SELECT name FROM dashboard_migrations WHERE name='002_atomic_save.sql'`
        ok = rows.length === 1
      } catch {
        ok = false
      }
    }
    res.status(ok ? 200 : 503).json({ ok })
  })
  if (!config.ready) {
    app.use('/api', (_req, res) =>
      res.status(503).json({ error: 'Configuração do servidor incompleta.' }),
    )
    return app
  }
  app.use(express.json({ limit: '1mb' }))
  const createClient =
    dependencies.createClient ||
    ((redirect) => new google.auth.OAuth2(config.clientId, config.clientSecret, redirect))
  const common = {
    configured: config.configured,
    origins: config.origins,
    appOrigin: config.origin,
    secure: config.production,
    scopes: {
      calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
      tasks: 'https://www.googleapis.com/auth/tasks',
    },
  }
  if (config.cloud) {
    const store = dependencies.store || new CloudStore(config.databaseUrl, config.key)
    cloudStore = store
    installCloudAuth(app, config, store, createClient)
    app.get('/api/dashboard', async (req, res) =>
      res.json(await store.dashboard(req.ownerId, defaultDashboard())),
    )
    app.patch('/api/dashboard', async (req, res) => {
      const { revision, operationId, operations } = req.body || {}
      if (
        !Number.isInteger(revision) ||
        revision < 0 ||
        typeof operationId !== 'string' ||
        !/^[\w-]{1,80}$/.test(operationId)
      )
        return res.status(400).json({ error: 'Alteração inválida.' })
      const replay = await store.replay(req.ownerId, operationId)
      if (replay) return res.json(replay)
      const current = await store.dashboard(req.ownerId, defaultDashboard())
      let data
      try {
        data = applyOperations(current.data, operations)
      } catch {
        return res.status(400).json({ error: 'Dados inválidos ou item removido.' })
      }
      const saved = await store.update(req.ownerId, revision, operationId, data)
      return saved ? res.json(saved) : res.status(409).json(current)
    })
    app.use((req, res, next) => {
      if (!req.path.startsWith('/api/')) return next()
      const authManager = new GoogleAuthManager({
        store: store.tokenStore(req.ownerId),
        redirectUri: config.redirectUri,
        createOAuthClient: () => createClient(config.redirectUri),
        requestStore: store,
        ownerId: req.ownerId,
        clientId: config.clientId,
      })
      return createApp({ ...common, authManager, gateway: createGoogleGateway(authManager) })(
        req,
        res,
        next,
      )
    })
  } else {
    app.get('/api/session', (_req, res) => res.json({ mode: 'local', authenticated: true }))
    const authManager = new GoogleAuthManager({
      store: new EncryptedTokenStore(resolve('.data/google-session.enc'), config.key),
      redirectUri: config.redirectUri,
      createOAuthClient: () => createClient(config.redirectUri),
    })
    app.use(createApp({ ...common, authManager, gateway: createGoogleGateway(authManager) }))
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }))
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error)
    console.error(
      'API_ERROR',
      error?.type === 'entity.too.large' ? 'payload_limit' : 'request_failed',
    )
    res
      .status(error?.type === 'entity.too.large' ? 413 : 503)
      .json({ error: 'Não foi possível concluir a solicitação.' })
  })
  return app
}
