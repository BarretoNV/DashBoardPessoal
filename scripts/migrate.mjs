import { readFile, readdir } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL do ambiente de destino.')
const sql = neon(process.env.DATABASE_URL)
await sql`CREATE TABLE IF NOT EXISTS dashboard_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
const directory = new URL('../server/migrations/', import.meta.url)
for (const name of (await readdir(directory)).filter((n) => n.endsWith('.sql')).sort()) {
  const existing = await sql`SELECT name FROM dashboard_migrations WHERE name=${name}`
  if (existing.length) continue
  const source = await readFile(new URL(name, directory), 'utf8')
  const statements = source.includes('LANGUAGE plpgsql')
    ? [source]
    : source
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
  await sql.transaction([
    ...statements.map((s) => sql.query(s)),
    sql`INSERT INTO dashboard_migrations(name) VALUES(${name})`,
  ])
  console.log('Migração aplicada:', name)
}
