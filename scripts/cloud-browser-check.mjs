import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { randomBytes } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { CloudStore } from '../server/cloud-store.mjs'
import { createRuntime } from '../server/runtime.mjs'
import { defaultDashboard } from '../shared/dashboard.mjs'

const db = new PGlite(),
  key = randomBytes(32)
for (const name of ['001_cloud.sql', '002_atomic_save.sql'])
  await db.exec(await readFile(new URL(`../server/migrations/${name}`, import.meta.url), 'utf8'))
const sql = async (parts, ...values) =>
  (
    await db.query(
      parts.reduce((s, p, i) => s + p + (i < values.length ? `$${i + 1}` : ''), ''),
      values,
    )
  ).rows
const store = new CloudStore('', key, sql)
await store.owner('test-owner', 'owner@example.test')
await store.session('browser-a', 'test-owner', 'csrf-a')
await store.session('browser-b', 'test-owner', 'csrf-b')
const env = {
  APP_MODE: 'cloud',
  APP_ORIGIN: 'http://127.0.0.1:5173',
  APP_ORIGINS: 'http://127.0.0.1:5173',
  DATABASE_URL: 'postgres://test:test@localhost/test',
  GOOGLE_CLIENT_ID: 'test',
  GOOGLE_CLIENT_SECRET: 'test',
  GOOGLE_TOKEN_ENCRYPTION_KEY: key.toString('base64'),
  ALLOWED_GOOGLE_EMAIL: 'owner@example.test',
}
const server = await new Promise((resolve) => {
  const instance = createRuntime(env, { store }).listen(0, '127.0.0.1', () => resolve(instance))
})
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
await mkdir('artifacts', { recursive: true })
const errors = []
let blocked = false
let closing = false
async function context(token) {
  const ctx = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1280, height: 900 },
  })
  if (token)
    await ctx.addCookies([
      {
        name: 'dashboard_session',
        value: token,
        url: env.APP_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
  await ctx.route('**/api/**', async (route) => {
    if (blocked && route.request().method() === 'PATCH') return route.abort('failed')
    const url = new URL(route.request().url())
    try {
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    } catch (error) {
      if (!closing) errors.push(error.message)
      await route.abort().catch(() => {})
    }
  })
  const page = await ctx.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  return { ctx, page }
}
try {
  const guest = await context()
  await guest.page.goto(env.APP_ORIGIN)
  await expect(guest.page.getByRole('link', { name: 'Entrar com Google' })).toBeVisible()
  await guest.page.screenshot({ path: 'artifacts/cloud-login.png' })
  const a = await context('browser-a'),
    b = await context('browser-b')
  await Promise.all([a.page.goto(env.APP_ORIGIN), b.page.goto(env.APP_ORIGIN)])
  await expect(a.page.getByText('Sincronizado', { exact: true })).toBeVisible()
  await a.page.getByRole('button', { name: 'Criar tarefa', exact: true }).click()
  const form = a.page.getByRole('form', { name: 'Criar tarefa', exact: true })
  await form.getByLabel('Título', { exact: true }).fill('Tarefa na nuvem')
  await form.getByRole('button', { name: 'Criar tarefa', exact: true }).click()
  await expect(a.page.getByText('Sincronizado', { exact: true })).toBeVisible()
  await b.page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(b.page.getByRole('checkbox', { name: 'Tarefa na nuvem', exact: true })).toBeVisible()
  await b.page.getByRole('checkbox', { name: 'Tarefa na nuvem', exact: true }).check()
  await expect(b.page.getByText('Sincronizado', { exact: true })).toBeVisible()
  await a.page.reload()
  await expect(a.page.getByRole('checkbox', { name: 'Tarefa na nuvem', exact: true })).toBeChecked()
  await a.page.getByRole('button', { name: 'Abrir configurações', exact: true }).click()
  await a.page.getByRole('button', { name: 'Hábitos', exact: true }).click()
  await a.page.getByRole('textbox', { name: 'Novo hábito', exact: true }).fill('Leitura cloud')
  await a.page.getByRole('button', { name: 'Adicionar hábito', exact: true }).click()
  await a.page
    .getByRole('combobox', { name: 'Meta de Leitura cloud', exact: true })
    .selectOption('3')
  await a.page
    .getByRole('dialog')
    .getByRole('button', { name: /^Leitura cloud, / })
    .first()
    .click()
  await expect(a.page.getByText('Sincronizado', { exact: true })).toBeVisible()
  await a.page.getByRole('button', { name: 'Preferências', exact: true }).click()
  await a.page.getByLabel('Seu nome', { exact: false }).fill('Proprietário')
  await expect(a.page.getByText('Sincronizado', { exact: true })).toBeVisible()
  const download = await Promise.all([
    a.page.waitForEvent('download'),
    a.page.getByRole('button', { name: 'Exportar backup JSON' }).click(),
  ])
  const backup = JSON.parse(await readFile(await download[0].path(), 'utf8'))
  assert.equal(backup.data.settings.name, 'Proprietário')
  assert.equal(backup.data.habits[0].name, 'Leitura cloud')
  assert.equal(JSON.stringify(backup).includes('csrf'), false)
  const imported = defaultDashboard()
  imported.settings.name = 'Importado'
  imported.tasks = [
    { id: 'imported', title: 'Tarefa importada', source: 'local', completed: false },
  ]
  await a.page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, data: imported })),
  })
  await expect(a.page.getByText(/1 tarefas e 0 hábitos/)).toBeVisible()
  assert.equal(
    (await store.dashboard('test-owner', defaultDashboard())).data.settings.name,
    'Proprietário',
  )
  await Promise.all([
    a.page.waitForEvent('download'),
    a.page.getByRole('button', { name: 'Confirmar substituição e baixar backup' }).click(),
  ])
  await expect(a.page.getByText('Sincronizado', { exact: true })).toBeVisible()
  await expect(a.page.getByLabel('Seu nome', { exact: false })).toHaveValue('Importado')
  await a.page.keyboard.press('Escape')
  await b.page.reload()
  await expect(
    b.page.getByRole('checkbox', { name: 'Tarefa importada', exact: true }),
  ).toBeVisible()
  blocked = true
  await a.page.getByRole('checkbox', { name: 'Tarefa importada', exact: true }).check()
  await expect(a.page.getByText('Falha ao sincronizar', { exact: true })).toBeVisible()
  await expect(
    a.page.getByRole('checkbox', { name: 'Tarefa importada', exact: true }),
  ).toBeChecked()
  blocked = false
  await a.page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await expect(a.page.getByText('Sincronizado', { exact: true })).toBeVisible()
  assert.equal(
    (await store.dashboard('test-owner', defaultDashboard())).data.tasks[0].completed,
    true,
  )
  await a.page.screenshot({ path: 'artifacts/cloud-dashboard.png', fullPage: true })
  await a.page.getByRole('button', { name: 'Sair do painel' }).click()
  await expect(a.page.getByRole('link', { name: 'Entrar com Google' })).toBeVisible()
  assert.equal(await store.getSession('browser-a'), null)
  assert.notEqual(await store.getSession('browser-b'), null)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: login privado, API real com PostgreSQL isolado, dois navegadores, tarefas, hábitos, preferências, backup, importação, retry e logout.',
  )
} catch (error) {
  console.error('Browser test failed:', error.message)
  throw error
} finally {
  closing = true
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
  await db.close()
}
