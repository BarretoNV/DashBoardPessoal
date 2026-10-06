import { randomBytes } from 'node:crypto'

export class GoogleAuthManager {
  constructor({ createOAuthClient, store, redirectUri }) {
    this.createOAuthClient = createOAuthClient
    this.store = store
    this.redirectUri = redirectUri
    this.requests = new Map()
    this.cachedClient = null
  }

  async status() {
    const session = await this.store.read()
    if (!session?.refreshToken) return { connected: false, scopes: [] }
    try {
      await this.client()
    } catch {
      const remaining = await this.store.read()
      return remaining?.refreshToken
        ? { connected: true, scopes: remaining.scopes }
        : { connected: false, scopes: [] }
    }
    return {
      connected: true,
      scopes: session.scopes,
    }
  }

  async authorizationUrl(scopes) {
    const client = this.createOAuthClient()
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync()
    const state = randomBytes(32).toString('hex')
    const now = Date.now()
    for (const [key, request] of this.requests) {
      if (now - request.createdAt > 10 * 60 * 1000) this.requests.delete(key)
    }
    this.requests.set(state, { codeVerifier, scopes, createdAt: now })
    return {
      state,
      url: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: scopes,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }),
    }
  }

  async exchangeCode(code, state) {
    const request = this.requests.get(state)
    this.requests.delete(state)
    if (!request || Date.now() - request.createdAt > 10 * 60 * 1000) {
      throw new Error('Solicitação OAuth inválida ou expirada.')
    }
    const previous = await this.store.read()
    const client = this.createOAuthClient()
    const { tokens } = await client.getToken({
      code,
      codeVerifier: request.codeVerifier,
      redirect_uri: this.redirectUri,
    })
    const refreshToken = tokens.refresh_token ?? previous?.refreshToken
    if (!refreshToken) {
      throw new Error('O Google não retornou um refresh token. Revogue o acesso e conecte novamente.')
    }
    const granted = new Set([
      ...(previous?.scopes ?? []),
      ...request.scopes,
      ...String(tokens.scope ?? '').split(' ').filter(Boolean),
    ])
    await this.store.write({ refreshToken, scopes: [...granted] })
    client.setCredentials({ ...tokens, refresh_token: refreshToken })
    this.cachedClient = client
    return { connected: true, scopes: [...granted] }
  }

  async client() {
    const session = await this.store.read()
    if (!session?.refreshToken) {
      const error = new Error('Google não conectado.')
      error.status = 401
      throw error
    }
    const client = this.cachedClient ?? this.createOAuthClient()
    if (!this.cachedClient) client.setCredentials({ refresh_token: session.refreshToken })
    try {
      await client.getAccessToken()
      this.cachedClient = client
      return client
    } catch (cause) {
      if (cause?.response?.data?.error === 'invalid_grant') {
        this.cachedClient = null
        await this.store.clear()
      }
      throw cause
    }
  }

  async logout() {
    const session = await this.store.read()
    if (session?.refreshToken) {
      try {
        const client = this.createOAuthClient()
        await client.revokeToken(session.refreshToken)
      } catch {
        // Local cleanup must still complete if Google is temporarily unreachable.
      }
    }
    await this.store.clear()
    this.cachedClient = null
  }
}
