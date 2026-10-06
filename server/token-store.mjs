import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function encryptionKey(value) {
  if (!value) return null
  const key = Buffer.from(value, 'base64')
  return key.length === 32 ? key : null
}

export class EncryptedTokenStore {
  constructor(filePath, key) {
    this.filePath = filePath
    this.key = key
  }

  async read() {
    if (!this.key) return null
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8'))
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(payload.iv, 'base64'),
      )
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
      const clear = Buffer.concat([
        decipher.update(Buffer.from(payload.data, 'base64')),
        decipher.final(),
      ])
      const session = JSON.parse(clear.toString('utf8'))
      return typeof session.refreshToken === 'string' && Array.isArray(session.scopes)
        ? session
        : null
    } catch {
      return null
    }
  }

  async write(session) {
    if (!this.key) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY não está configurada.')
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const data = Buffer.concat([
      cipher.update(JSON.stringify(session), 'utf8'),
      cipher.final(),
    ])
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(
      this.filePath,
      JSON.stringify({
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
      }),
      { mode: 0o600 },
    )
  }

  async clear() {
    await rm(this.filePath, { force: true })
  }
}
