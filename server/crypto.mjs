import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
export const randomToken = () => randomBytes(32).toString('hex')
export const hashToken = (value) => createHash('sha256').update(value).digest('hex')
export function seal(value, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  }
}
export function unseal(value, key) {
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'))
  cipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return JSON.parse(
    Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString(),
  )
}
