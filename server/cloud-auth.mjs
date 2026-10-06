import { randomToken } from './crypto.mjs'
export const SESSION_COOKIE = 'dashboard_session'
export function readCookie(request, name) {
  try {
    return decodeURIComponent(
      (request.get('cookie') || '')
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(`${name}=`))
        ?.slice(name.length + 1) || '',
    )
  } catch {
    return ''
  }
}
export function cookieOptions(production, maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  }
}
export function installCloudAuth(app, config, store, createClient) {
  app.get('/api/session', async (req, res) => {
    const session = await store.getSession(readCookie(req, SESSION_COOKIE))
    if (!session) return res.json({ mode: 'cloud', authenticated: false })
    if (session.email !== config.email)
      return res.status(403).json({ error: 'Conta não autorizada.' })
    res.json({ mode: 'cloud', authenticated: true, csrf: session.csrf })
  })
  app.get('/api/login/start', async (_req, res) => {
    const client = createClient(config.loginRedirectUri)
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync()
    const state = randomToken(),
      nonce = randomToken()
    await store.putRequest(state, { kind: 'login', codeVerifier, nonce })
    res.cookie('login_state', state, cookieOptions(config.production, 600000))
    res.redirect(
      client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }),
    )
  })
  app.get('/api/login/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    if (!state || !code || state !== readCookie(req, 'login_state'))
      return res.redirect(`${config.origin}/?login=error`)
    const pending = await store.takeRequest(state)
    if (!pending || pending.kind !== 'login') return res.redirect(`${config.origin}/?login=error`)
    try {
      const client = createClient(config.loginRedirectUri)
      const { tokens } = await client.getToken({
        code,
        codeVerifier: pending.codeVerifier,
        redirect_uri: config.loginRedirectUri,
      })
      const identity = (
        await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId })
      ).getPayload()
      if (
        !identity ||
        identity.nonce !== pending.nonce ||
        !identity.sub ||
        !identity.email_verified ||
        identity.email?.toLowerCase() !== config.email
      )
        return res.redirect(`${config.origin}/?login=denied`)
      await store.owner(identity.sub, config.email)
      const token = randomToken(),
        csrf = randomToken()
      await store.session(token, identity.sub, csrf)
      res.clearCookie('login_state', cookieOptions(config.production))
      res.cookie(SESSION_COOKIE, token, cookieOptions(config.production, 30 * 86400000))
      res.redirect(config.origin)
    } catch {
      res.redirect(`${config.origin}/?login=error`)
    }
  })
  app.use('/api', async (req, res, next) => {
    const session = await store.getSession(readCookie(req, SESSION_COOKIE))
    if (!session)
      return res
        .status(401)
        .json({ code: 'SESSION_REQUIRED', error: 'Entre no painel para continuar.' })
    if (session.email !== config.email)
      return res.status(403).json({ error: 'Conta não autorizada.' })
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (!config.origins.has(req.get('origin')) || req.get('x-csrf-token') !== session.csrf)
    )
      return res.status(403).json({ error: 'Solicitação não autorizada.' })
    req.ownerId = session.owner_id
    next()
  })
  app.post('/api/session/logout', async (req, res) => {
    await store.logout(readCookie(req, SESSION_COOKIE))
    res.clearCookie(SESSION_COOKIE, cookieOptions(config.production))
    res.status(204).end()
  })
}
