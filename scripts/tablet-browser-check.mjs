import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const origin = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173'
await mkdir('artifacts/tablet', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  })
  await context.addInitScript(() => {
    const save = (key, data) =>
      localStorage.setItem(`command-center:${key}`, JSON.stringify({ version: 1, data }))
    save('settings', {
      name: 'Uma pessoa com nome comprido',
      hourFormat: '24h',
      showWeather: true,
      showTasks: true,
      showHabits: true,
      accent: '#C3D6AE',
      ambient: false,
      autoAmbient: false,
      location: null,
      timezone: 'America/Sao_Paulo',
      animatedBackground: true,
    })
    save('integrations', { calendarEnabled: true, tasksEnabled: false })
    save(
      'tasks',
      Array.from({ length: 12 }, (_, i) => ({
        id: `t${i}`,
        title: `Tarefa ${i + 1} com um título suficientemente longo para testar o espaço disponível`,
        completed: false,
        source: 'local',
      })),
    )
    save(
      'habits',
      Array.from({ length: 6 }, (_, i) => ({
        id: `h${i}`,
        name: `Hábito ${i + 1} com nome longo`,
        target: 4,
        completedDays: [],
      })),
    )
  })
  await context.route('**/api/session', (route) => route.fulfill({ json: { mode: 'local' } }))
  await context.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { configured: true } }),
  )
  await context.route('**/api/auth/status', (route) =>
    route.fulfill({
      json: {
        connected: true,
        scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
      },
    }),
  )
  let calendarState = 'populated'
  await context.route('**/api/calendar/events?**', async (route) => {
    const start = new URL(route.request().url()).searchParams.get('timeMin')
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(start),
    )
    const next = new Date(new Date(`${day}T12:00:00Z`).getTime() + 86400000)
      .toISOString()
      .slice(0, 10)
    const items =
      calendarState === 'empty'
        ? []
        : [
            ...Array.from({ length: 8 }, (_, i) => ({
              id: `all${i}`,
              summary: `Evento de dia inteiro ${i + 1} com título longo`,
              start: { date: day },
              end: { date: next },
            })),
            ...Array.from({ length: 5 }, (_, i) => ({
              id: `event${i}`,
              summary: `Compromisso ${i + 1} com título longo para conferir limites`,
              start: { dateTime: `${day}T${18 + i}:00:00-03:00` },
              end: { dateTime: `${day}T${18 + i}:50:00-03:00` },
              htmlLink: 'https://calendar.google.com/',
            })),
          ]
    await route.fulfill({ json: { items } })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(origin)
  await page
    .getByText('Evento de dia inteiro 1 com título longo', { exact: true })
    .first()
    .waitFor()
  // Layout checks include child bounds, so hiding body overflow cannot produce a false pass.
  async function checkLayout() {
    const failures = await page.evaluate(() => {
      const out = []
      if (
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight
      )
        out.push('page overflow')
      for (const el of document.querySelectorAll('.topbar, .next-event, .panel')) {
        const r = el.getBoundingClientRect()
        if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
          out.push(`${el.className}: outside viewport`)
      }
      const next = document.querySelector('.next-event').getBoundingClientRect()
      for (const el of document.querySelector('.next-event').children) {
        const r = el.getBoundingClientRect()
        if (
          r.left < next.left - 1 ||
          r.right > next.right + 1 ||
          r.top < next.top - 1 ||
          r.bottom > next.bottom + 1
        )
          out.push(`${el.className}: outside next event`)
      }
      for (const el of document.querySelectorAll(
        '.day-cell, .task-checkbox, .task-edit-trigger, .icon-button, .ambient-button',
      )) {
        const r = el.getBoundingClientRect()
        if (getComputedStyle(el).visibility !== 'hidden' && (r.width < 43.9 || r.height < 43.9))
          out.push(`${el.className}: touch target ${r.width}x${r.height}`)
      }
      return out
    })
    assert.deepEqual(failures, [])
  }
  for (const [width, height] of [
    [960, 540],
    [1024, 600],
    [1138, 712],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height })
    await checkLayout()
    await page.screenshot({ path: `artifacts/tablet/landscape-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 960, height: 540 })
  assert.equal(await page.locator('video, .edge-scan').count(), 0)
  assert.equal(
    await page.locator('.app-shell').evaluate((el) => el.style.getPropertyValue('--accent')),
    '#C3D6AE',
  )
  await page.mouse.move(0, 0)
  await page.waitForTimeout(5500)
  assert.ok(
    await page.locator('.agenda-viewport').evaluate((el) => el.scrollTop > 0),
    'agenda should auto scroll long all-day content',
  )
  const before = await page.locator('.panel').evaluateAll((els) =>
    els.map((el) => ({
      top: el.getBoundingClientRect().top,
      height: el.getBoundingClientRect().height,
    })),
  )
  await page.getByRole('button', { name: 'Ocultar controles', exact: true }).tap()
  const after = await page.locator('.panel').evaluateAll((els) =>
    els.map((el) => ({
      top: el.getBoundingClientRect().top,
      height: el.getBoundingClientRect().height,
    })),
  )
  assert.deepEqual(after, before)
  await checkLayout()
  await page.screenshot({ path: 'artifacts/tablet/ambient.png', fullPage: true })
  await page.getByRole('button', { name: 'Mostrar controles', exact: true }).tap()
  await page.getByRole('button', { name: 'Abrir configurações' }).tap()
  assert.equal(await page.getByText('Fundo animado', { exact: true }).count(), 0)
  await page.getByLabel('Formato do relógio').selectOption('12h')
  await page.getByLabel('Mostrar hábitos').uncheck()
  await page.getByLabel('Mostrar tarefas').uncheck()
  await page.keyboard.press('Escape')
  await checkLayout()
  assert.equal(
    await page.locator('.agenda').evaluate((el) => el.getBoundingClientRect().width),
    await page.locator('.dashboard-grid').evaluate((el) => el.getBoundingClientRect().width),
  )
  await page.getByRole('button', { name: 'Abrir configurações' }).tap()
  await page.getByLabel('Mostrar hábitos').check()
  await page.getByLabel('Mostrar tarefas').check()
  await page.keyboard.press('Escape')
  await checkLayout()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('.agenda-viewport').evaluate((el) => (el.scrollTop = 0))
  await page.waitForTimeout(5500)
  assert.equal(await page.locator('.agenda-viewport').evaluate((el) => el.scrollTop), 0)
  calendarState = 'empty'
  await page.reload()
  await page.getByText('Sem compromissos hoje.', { exact: true }).waitFor()
  await checkLayout()
  // Authenticated cloud sessions reserve room for their sync strip.
  const { defaultDashboard } = await import('../shared/dashboard.mjs')
  const cloudData = defaultDashboard()
  cloudData.settings = { ...cloudData.settings, autoAmbient: false }
  cloudData.tasks = [
    { id: 'cloud-task', title: 'Tarefa sincronizada', completed: false, source: 'local' },
  ]
  cloudData.habits = Array.from({ length: 4 }, (_, i) => ({
    id: 'cloud-habit-' + i,
    name: 'Hábito ' + i,
    target: 4,
    completedDays: [],
  }))
  await context.route('**/api/session', (route) =>
    route.fulfill({ json: { mode: 'cloud', authenticated: true, csrf: 'test-only' } }),
  )
  await context.route('**/api/dashboard', (route) =>
    route.fulfill({ json: { data: cloudData, revision: 0 } }),
  )
  await page.reload()
  await page.getByText('Sincronizado', { exact: true }).waitFor()
  await checkLayout()
  assert.ok(
    await page.locator('.task-list').evaluate((el) => el.clientHeight >= 44),
    'cloud list must fit at least one touchable row',
  )
  assert.ok(
    (await page.locator('.weekly').evaluate((el) => el.getBoundingClientRect().bottom)) <=
      (await page.locator('.sync-bar').evaluate((el) => el.getBoundingClientRect().top)),
    'sync strip must not cover habits',
  )
  await page.screenshot({ path: 'artifacts/tablet/cloud.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log(
    'PASS: tablet landscape, child bounds, touch targets, long agenda, ambient stability, saved accent, 12h, disabled sections, empty state and reduced motion.',
  )
} finally {
  await browser.close()
}
