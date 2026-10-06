import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

await mkdir('artifacts', { recursive: true })
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await context.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        current: { temperature_2m: 20, weather_code: 2 },
        daily: {
          time: [
            '2026-09-24',
            '2026-09-25',
            '2026-09-26',
            '2026-09-27',
            '2026-09-28',
            '2026-09-29',
            '2026-09-30',
          ],
          weather_code: [2, 61, 0, 3, 45, 80, 95],
          temperature_2m_max: [23, 22, 24, 21, 20, 19, 22],
          temperature_2m_min: [17, 16, 17, 15, 14, 15, 16],
          precipitation_probability_max: [20, 70, 5, 15, 30, 80, 65],
        },
      },
    }),
  )
  await page.clock.install({ time: new Date('2026-09-24T22:15:00Z') })
  const fixture = `${baseUrl}/scripts/fixtures/layout.html`
  const sizes = [
    [900, 700],
    [1024, 768],
    [1248, 900],
    [1488, 910],
    [1920, 900],
    [1920, 1080],
  ]
  for (const scenario of ['', 'done', '12h', 'done&completed', 'hidden', 'no-habits&no-tasks']) {
    await page.goto(fixture + '?' + scenario)
    await page.getByText('Parcialmente nublado', { exact: true }).waitFor()
    const backgroundVideo = page.locator('.background-video')
    assert.equal(await backgroundVideo.count(), 1)
    assert.equal(await backgroundVideo.evaluate((element) => element.playbackRate), 0.6)
    assert.equal(await backgroundVideo.evaluate((element) => element.muted), true)
    assert.equal(await backgroundVideo.evaluate((element) => element.loop), false)
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height })
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      const geometry = await page.evaluate(() => {
        const elements = [
          ...document.querySelectorAll(
            '.topbar,.overview,.next-event,.panel,.agenda-item,.task-list>li,.tracker-row,.clock-block,.weather',
          ),
        ]
        return {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          clipped: elements
            .filter((el) => {
              const r = el.getBoundingClientRect()
              return r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < 0
            })
            .map((el) => el.className),
          escapesPanel: [...document.querySelectorAll('.agenda-item,.task-list>li,.tracker-row')]
            .filter((el) => {
              const r = el.getBoundingClientRect()
              const p = el.closest('.panel').getBoundingClientRect()
              return r.bottom > p.bottom + 1 || r.top < p.top
            })
            .map((el) => el.className),
          rowTextOverflow: [...document.querySelectorAll('.agenda-item>div')].filter((el) => {
            const r = el.getBoundingClientRect()
            const p = el.parentElement.getBoundingClientRect()
            return r.bottom > p.bottom + 1 || r.top < p.top - 1
          }).length,
          heroOverflow: [...document.querySelectorAll('.clock-block,.weather')].filter((el) => {
            const r = el.getBoundingClientRect()
            const p = el.closest('.overview').getBoundingClientRect()
            return r.top < p.top - 1 || r.bottom > p.bottom + 1
          }).length,
          visibleForecast: [...document.querySelectorAll('.forecast-day')].filter(
            (el) => getComputedStyle(el).display !== 'none',
          ).length,
        }
      })
      if (!scenario && (width === 900 || width === 1488))
        await page.screenshot({ path: `artifacts/stress-${width}.png` })
      assert.ok(
        geometry.width <= width && geometry.height <= height,
        JSON.stringify({ scenario, width, height, geometry }),
      )
      assert.deepEqual(geometry.clipped, [], 'offscreen: ' + scenario + ' ' + width)
      assert.deepEqual(geometry.escapesPanel, [], 'clipped rows: ' + scenario + ' ' + width)
      assert.equal(geometry.rowTextOverflow, 0, 'text overlaps: ' + scenario + ' ' + width)
      assert.equal(geometry.heroOverflow, 0, 'hero overlaps: ' + scenario + ' ' + width)
      if (width === 1920) assert.equal(geometry.visibleForecast, 5, 'wide forecast: ' + scenario)
    }
    console.log('PASS layout: ' + (scenario || 'five-events-five-tasks-seven-habits'))
  }
  const backgroundVideo = page.locator('.background-video')
  await backgroundVideo.dispatchEvent('ended')
  assert.equal(
    await backgroundVideo.evaluate((element) => element.classList.contains('fading')),
    true,
  )
  await page.clock.runFor(650)
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  assert.equal(
    await backgroundVideo.evaluate((element) => element.classList.contains('fading')),
    false,
  )
  console.log('PASS animated background speed, mute and fade restart')
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto(fixture)
  const tasks = page.getByRole('region', { name: 'Tarefas', exact: true })
  const first = tasks.getByRole('checkbox').first()
  const title = await first.getAttribute('aria-label')
  await first.check()
  const completed = tasks.getByRole('checkbox', { name: title, exact: true })
  assert.equal(await completed.isChecked(), true)
  assert.equal(await completed.evaluate((el) => el === document.activeElement), true)
  await page.keyboard.press('Space')
  assert.equal(await completed.isChecked(), false)
  await page.getByRole('button', { name: 'Ocultar controles', exact: true }).click()
  await tasks.getByRole('checkbox', { name: title, exact: true }).check()
  const habits = page.getByRole('region', { name: 'Hábitos da semana', exact: true })
  const today = habits.getByRole('button', { name: /24\/09\/2026$/ }).first()
  const habitLabel = await today.getAttribute('aria-label')
  await today.click()
  assert.equal(await today.getAttribute('aria-pressed'), 'true')
  assert.equal(
    await habits
      .getByRole('button', { name: /25\/09\/2026$/ })
      .first()
      .isDisabled(),
    true,
  )
  // The actual entry reads the fixture's storage without resetting it.
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Mostrar controles', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click()
  await page.getByRole('button', { name: 'Editar tarefas', exact: true }).click()
  assert.equal(
    await page
      .getByRole('dialog')
      .getByRole('checkbox', { name: 'Concluir ' + title, exact: true })
      .isChecked(),
    true,
  )
  await page.keyboard.press('Escape')
  assert.equal(
    await page.getByRole('button', { name: habitLabel, exact: true }).getAttribute('aria-pressed'),
    'true',
  )
  console.log('PASS direct marking, focus, hidden controls and persistence')
  await page.goto(fixture)
  const counter = page.locator('.page-count')
  await counter.waitFor()
  await page.mouse.move(2, 2)
  await page.clock.runFor(15000)
  assert.equal(await counter.innerText(), '2 / 4')
  await habits.hover()
  await page.clock.runFor(30000)
  assert.equal(await counter.innerText(), '2 / 4')
  await page.getByRole('button', { name: 'Próximos hábitos', exact: true }).click()
  assert.equal(await counter.innerText(), '3 / 4')
  await page.mouse.move(2, 2)
  await page.clock.runFor(30000)
  assert.equal(await counter.innerText(), '3 / 4')
  await page.getByRole('button', { name: 'Abrir configurações', exact: true }).click()
  await page.clock.runFor(30000)
  assert.equal(await counter.innerText(), '3 / 4')
  await page.keyboard.press('Escape')
  await page.clock.runFor(15000)
  assert.equal(await counter.innerText(), '4 / 4')
  await page.getByRole('button', { name: 'Editar hábitos', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Excluir hábito / })
    .last()
    .click()
  await page.keyboard.press('Escape')
  assert.equal(await counter.innerText(), '3 / 3')
  console.log('PASS pagination, hover/focus/editor pauses and deletion')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.equal(
    await page
      .locator('.forecast-day')
      .evaluateAll(
        (elements) =>
          elements.filter((element) => getComputedStyle(element).display !== 'none').length,
      ),
    0,
  )
  await page.screenshot({ path: 'artifacts/revision-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.getByRole('button', { name: 'Abrir configurações', exact: true }).click()
  const settingsDialog = page.getByRole('dialog')
  await settingsDialog.getByText('Google Calendar', { exact: true }).waitFor()
  assert.equal(await settingsDialog.getByText('Google Tasks', { exact: true }).count(), 1)
  assert.equal(
    await settingsDialog.getByText('Open-Meteo ativo sem conta', { exact: true }).count(),
    1,
  )
  const backgroundToggle = settingsDialog.getByLabel('Fundo animado', { exact: true })
  assert.equal(await backgroundToggle.isChecked(), true)
  await backgroundToggle.uncheck()
  assert.equal(await page.locator('.background-video').count(), 0)
  await backgroundToggle.check()
  assert.equal(await page.locator('.background-video').count(), 1)
  await page.screenshot({ path: 'artifacts/integrations-settings.png' })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1488, height: 910 })
  await page.route('**/HeroPic.jpg', (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }),
  )
  await page.goto(fixture)
  await page.getByRole('checkbox').first().waitFor()
  await page.screenshot({ path: 'artifacts/no-background.png' })
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.querySelector('.background-media')).backgroundColor,
    ),
    'rgb(9, 11, 13)',
  )
  assert.deepEqual(errors, [])
  console.log('PASS mobile, image fallback and console')
  const reducedContext = await browser.newContext({ reducedMotion: 'reduce' })
  const reducedPage = await reducedContext.newPage()
  await reducedPage.goto(fixture)
  assert.equal(await reducedPage.locator('.background-media').count(), 1)
  assert.equal(await reducedPage.locator('.background-video').count(), 1)
  await reducedContext.close()
  console.log('PASS explicit animated-background preference overrides system motion setting')
} finally {
  await browser.close()
}
