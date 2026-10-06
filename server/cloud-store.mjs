import { neon } from '@neondatabase/serverless'
import { seal, unseal, hashToken } from './crypto.mjs'
export class CloudStore {
  constructor(url, key, sql) {
    this.sql = sql || neon(url)
    this.key = key
  }
  async owner(id, email) {
    await this
      .sql`INSERT INTO dashboard_owner(id,email) VALUES(${id},${email}) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email`
  }
  async session(token, ownerId, csrf) {
    await this.sql`DELETE FROM dashboard_sessions WHERE expires_at<now()`
    await this
      .sql`INSERT INTO dashboard_sessions(hash,owner_id,csrf,expires_at) VALUES(${hashToken(token)},${ownerId},${csrf},now()+interval '30 days')`
  }
  async getSession(token) {
    if (!token) return null
    const rows = await this
      .sql`SELECT s.owner_id,s.csrf,o.email FROM dashboard_sessions s JOIN dashboard_owner o ON o.id=s.owner_id WHERE hash=${hashToken(token)} AND expires_at>now()`
    return rows[0] || null
  }
  async logout(token) {
    await this.sql`DELETE FROM dashboard_sessions WHERE hash=${hashToken(token)}`
  }
  async putRequest(state, payload, ownerId = null) {
    await this
      .sql`INSERT INTO dashboard_oauth(state_hash,owner_id,payload,expires_at) VALUES(${hashToken(state)},${ownerId},${JSON.stringify(seal(payload, this.key))}::jsonb,now()+interval '10 minutes')`
    await this.sql`DELETE FROM dashboard_oauth WHERE expires_at<now()`
  }
  async takeRequest(state) {
    const rows = await this
      .sql`DELETE FROM dashboard_oauth WHERE state_hash=${hashToken(state)} AND expires_at>now() RETURNING owner_id,payload`
    return rows[0] ? { ...unseal(rows[0].payload, this.key), ownerId: rows[0].owner_id } : null
  }
  tokenStore(ownerId) {
    return {
      read: async () => {
        const rows = await this
          .sql`SELECT payload FROM dashboard_credentials WHERE owner_id=${ownerId}`
        return rows[0] ? unseal(rows[0].payload, this.key) : null
      },
      write: async (session) => {
        await this
          .sql`INSERT INTO dashboard_credentials(owner_id,payload) VALUES(${ownerId},${JSON.stringify(seal(session, this.key))}::jsonb) ON CONFLICT(owner_id) DO UPDATE SET payload=EXCLUDED.payload`
      },
      clear: async () => {
        await this.sql`DELETE FROM dashboard_credentials WHERE owner_id=${ownerId}`
      },
    }
  }
  async dashboard(ownerId, defaults) {
    await this
      .sql`INSERT INTO dashboard_state(owner_id,data) VALUES(${ownerId},${JSON.stringify(defaults)}::jsonb) ON CONFLICT DO NOTHING`
    const rows = await this.sql`SELECT data,revision FROM dashboard_state WHERE owner_id=${ownerId}`
    return rows[0]
  }
  async update(ownerId, revision, operationId, data) {
    // The database locks the owner row before checking the revision and replay ID.
    const rows = await this
      .sql`SELECT * FROM dashboard_save(${ownerId},${revision},${operationId},${JSON.stringify(data)}::jsonb)`
    return rows[0] || null
  }
  async replay(ownerId, operationId) {
    const rows = await this
      .sql`SELECT s.data,s.revision FROM dashboard_state s WHERE s.owner_id=${ownerId} AND EXISTS(SELECT 1 FROM dashboard_operations o WHERE o.owner_id=${ownerId} AND o.operation_id=${operationId})`
    return rows[0] || null
  }
}
