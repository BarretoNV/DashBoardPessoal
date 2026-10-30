import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium } from '@playwright/test'

// Exercise the production build, without production credentials or a database.
const root = resolve('dist')
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'))
assert.equal(manifest.display, 'fullscreen')
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')
assert.equal(manifest.id, '/')
assert.equal(manifest.orientation, 'any')
for (const icon of manifest.icons) {
  const png = await readFile(resolve(root, `.${icon.src}`))
  const [width, height] = icon.sizes.split('x').map(Number)
  assert.equal(png.readUInt32BE(16), width)
  assert.equal(png.readUInt32BE(20), height)
}
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
let workerVersion = 1
let sessionMode = 'local'
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (pathname.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify(
        pathname === '/api/session'
          ? { mode: sessionMode, authenticated: false }
          : { connected: false, configured: false },
      ),
    )
    return
  }
  try {
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (!path.startsWith(`${root}/`) && !path.startsWith(`${root}\\`)) throw new Error('path')
    let body = await readFile(path)
    if (pathname === '/sw.js') {
      body = Buffer.from(
        body.toString().replace('${CACHE_PREFIX}v1', `\${CACHE_PREFIX}v${workerVersion}`),
      )
      res.setHeader('Cache-Control', 'no-cache')
    }
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream')
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto(origin)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await page.getByRole('button', { name: 'Abrir configurações' }).waitFor()
  await mkdir('artifacts/pwa', { recursive: true })
  for (const [width, height] of [
    [360, 800],
    [412, 915],
    [800, 360],
  ]) {
    await page.setViewportSize({ width, height })
    await page.screenshot({ path: `artifacts/pwa/dashboard-${width}.png`, fullPage: true })
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow at ${width}`,
    )
    await page.getByRole('button', { name: 'Abrir configurações' }).click()
    await page.getByRole('dialog').waitFor()
    await page.screenshot({ path: `artifacts/pwa/settings-${width}.png`, fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.keyboard.press('Escape')
  }
  // A reduced visual viewport approximates keyboard space; a physical keyboard remains manual QA.
  await page.setViewportSize({ width: 360, height: 400 })
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click()
  await page
    .getByRole('form', { name: 'Criar tarefa' })
    .getByLabel('Título')
    .fill('Verificação mobile')
  await page.screenshot({ path: 'artifacts/pwa/keyboard-space.png', fullPage: true })
  await page.keyboard.press('Escape')
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => fetch('/api/health'))
  await page.evaluate(() => fetch('/api/login/callback'))
  assert.deepEqual(
    await page.evaluate(async () => {
      const cache = await caches.open('centro-pessoal-offline-v1')
      return (await cache.keys()).map((request) => new URL(request.url).pathname)
    }),
    ['/offline.html'],
  )
  workerVersion = 2
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
  await page.waitForFunction(async () => {
    const keys = await caches.keys()
    return keys.includes('centro-pessoal-offline-v2') && !keys.includes('centro-pessoal-offline-v1')
  })
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('heading', { name: 'Sem conexão.' }).waitFor()
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await page.getByRole('heading', { name: 'Sem conexão.' }).waitFor()
  await page.screenshot({ path: 'artifacts/pwa/offline.png' })
  assert.equal(
    await page.evaluate(async () => {
      try {
        await fetch('/api/health')
        return true
      } catch {
        return false
      }
    }),
    false,
  )
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await page.getByRole('button', { name: 'Abrir configurações' }).waitFor()
  sessionMode = 'cloud'
  await page.reload()
  await page.getByRole('link', { name: 'Entrar com Google' }).waitFor()
  await page.screenshot({ path: 'artifacts/pwa/login.png', fullPage: true })
  console.log(
    'PWA: manifest, icons, production registration, mobile layouts, login, offline/recovery, API exclusion and worker update passed.',
  )
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
