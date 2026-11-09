import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

await mkdir('artifacts/motion', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let context
try {
  context = await browser.newContext({
    viewport: { width: 1138, height: 712 },
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    recordVideo: { dir: 'artifacts/motion', size: { width: 1138, height: 712 } },
  })
  await context.addInitScript(() => {
    localStorage.setItem(
      'command-center:settings',
      JSON.stringify({
        version: 1,
        data: {
          name: '',
          hourFormat: '24h',
          showWeather: true,
          showTasks: true,
          showHabits: true,
          accent: '#A8C7FA',
          ambient: false,
          autoAmbient: false,
          location: null,
          timezone: 'America/Sao_Paulo',
        },
      }),
    )
  })
  await context.route('**/api/session', (route) => route.fulfill({ json: { mode: 'local' } }))
  await context.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { configured: false } }),
  )
  await context.route('**/api/auth/status', (route) =>
    route.fulfill({ json: { connected: false, scopes: [] } }),
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const settle = () =>
    page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
    )
  await page.goto(process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173')
  await page.getByRole('checkbox', { name: 'Estudar', exact: true }).waitFor()
  await settle()
  await page.waitForTimeout(700)
  await page.getByRole('checkbox', { name: 'Estudar', exact: true }).tap()
  assert.ok(
    await page
      .locator('.task-list li')
      .evaluateAll((rows) =>
        rows.some((row) =>
          row
            .getAnimations()
            .some((a) =>
              a.effect.getKeyframes().some((k) => String(k.transform).startsWith('translateY(')),
            ),
        ),
      ),
    'task reorder should animate',
  )
  await settle()
  await page.waitForTimeout(500)
  const habit = page.locator('.day-cell.today').first()
  await habit.tap()
  assert.ok(
    await habit.locator('svg').evaluate((el) => el.getAnimations().length > 0),
    'habit check should settle into place',
  )
  await settle()
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).tap()
  await settle()
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Abrir configurações' }).tap()
  assert.ok(
    await page.locator('.settings-dialog').evaluate((el) => el.getAnimations().length > 0),
    'dialog should animate in',
  )
  await settle()
  await page.getByRole('button', { name: 'Hábitos', exact: true }).tap()
  await settle()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Preferências', exact: true }).tap()
  await settle()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Fechar configurações' }).tap()
  await page.locator('.settings-dialog.is-closing').waitFor({ state: 'attached' })
  await page.locator('.settings-dialog').waitFor({ state: 'hidden' })
  assert.equal(
    await page
      .getByRole('button', { name: 'Abrir configurações' })
      .evaluate((el) => el === document.activeElement),
    true,
  )
  await page.getByRole('button', { name: 'Ocultar controles' }).tap()
  await settle()
  await page.getByRole('button', { name: 'Mostrar controles' }).tap()
  await settle()
  await page.waitForTimeout(700)
  // Reduced motion disables both CSS and imperative reordering animations.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('checkbox', { name: 'Estudar', exact: true }).tap()
  await page.getByRole('button', { name: 'Abrir configurações' }).tap()
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.evaluate(() => document.getAnimations().length), 0)
  await page.keyboard.press('Escape')
  await page.locator('.settings-dialog').waitFor({ state: 'hidden' })
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  )
  assert.deepEqual(errors, [])
  const video = page.video()
  await context.close()
  context = null
  await video.saveAs('artifacts/motion/demo.webm')
  console.log(
    'PASS: animated task reorder, habit feedback, dialog entry/exit, tabs, focus restoration and reduced motion. Video: artifacts/motion/demo.webm',
  )
} finally {
  await context?.close()
  await browser.close()
}
