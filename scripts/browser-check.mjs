import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

await mkdir('artifacts', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
await page.goto('http://127.0.0.1:5173')
await page.getByRole('checkbox', { name: 'Estudar', exact: true }).waitFor()
for (const [name, width, height] of [
  ['minimum', 900, 700],
  ['split', 1248, 900],
  ['user-window', 1488, 910],
  ['wide-window', 1920, 900],
  ['fullscreen', 1920, 1080],
  ['compact', 1024, 768],
  ['mobile', 390, 844],
]) {
  await page.setViewportSize({ width, height })
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true })
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  assert.ok(dimensions.width <= width, `${name}: horizontal overflow ${dimensions.width}`)
  if (width >= 900 && height >= 700)
    assert.ok(dimensions.height <= height, `${name}: vertical overflow ${dimensions.height}`)
  console.log(`${name}: ${width} × ${height}, content ${dimensions.width} × ${dimensions.height}`)
}
await page.setViewportSize({ width: 1280, height: 1080 })
const quickCreate = page.getByRole('button', { name: 'Criar tarefa', exact: true })
await quickCreate.click()
await page
  .getByRole('form', { name: 'Criar tarefa', exact: true })
  .getByLabel('Título')
  .fill('Criação rápida')
await page.getByLabel('Data', { exact: false }).fill('2026-09-28')
await page.keyboard.press('Escape')
assert.equal(await page.getByRole('form', { name: 'Criar tarefa', exact: true }).count(), 0)
assert.equal(await quickCreate.evaluate((el) => el === document.activeElement), true)
await quickCreate.click()
await page
  .getByRole('form', { name: 'Criar tarefa', exact: true })
  .getByLabel('Título')
  .fill('Teste de persistência')
await page
  .getByRole('form', { name: 'Criar tarefa', exact: true })
  .getByRole('button', { name: 'Criar tarefa', exact: true })
  .click()
await page.getByText('Teste de persistência', { exact: true }).first().waitFor()
const taskButton = page.getByRole('button', { name: 'Editar tarefas', exact: true })
await taskButton.click()
const dialog = page.getByRole('dialog')
await dialog
  .getByRole('textbox', { name: 'Título da tarefa Teste de persistência', exact: true })
  .fill('Tarefa revisada')
await dialog
  .getByRole('combobox', { name: 'Prioridade de Tarefa revisada', exact: true })
  .selectOption('high')
await dialog.getByRole('checkbox', { name: 'Concluir Tarefa revisada', exact: true }).check()
await page.keyboard.press('Escape')
assert.equal(await dialog.count(), 0)
assert.equal(await taskButton.evaluate((el) => el === document.activeElement), true)
await page.reload()
await page.getByRole('button', { name: 'Editar tarefas', exact: true }).click()
assert.equal(
  await page.getByRole('checkbox', { name: 'Concluir Tarefa revisada', exact: true }).isChecked(),
  true,
)
await page.getByRole('button', { name: 'Excluir tarefa Tarefa revisada', exact: true }).click()
assert.equal(
  await page
    .getByRole('textbox', { name: 'Título da tarefa Tarefa revisada', exact: true })
    .count(),
  0,
)
await page.getByRole('button', { name: 'Hábitos', exact: true }).click()
await page.getByRole('textbox', { name: 'Novo hábito', exact: true }).fill('Leitura')
await page.getByRole('button', { name: 'Adicionar hábito', exact: true }).click()
await page.getByRole('combobox', { name: 'Meta de Leitura', exact: true }).selectOption('3')
const firstDay = page
  .getByRole('dialog')
  .getByRole('button', { name: /^Leitura, / })
  .first()
await firstDay.click()
assert.equal(await firstDay.getAttribute('aria-pressed'), 'true')
await page.screenshot({ path: 'artifacts/habit-editor.png', fullPage: true })
await page.reload()
await page.getByRole('button', { name: 'Editar hábitos', exact: true }).click()
assert.equal(
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Leitura, / })
    .first()
    .getAttribute('aria-pressed'),
  'true',
)
await page.getByRole('button', { name: 'Excluir hábito Leitura', exact: true }).click()
await page.getByRole('button', { name: 'Preferências', exact: true }).click()
await page.getByLabel('Seu nome', { exact: false }).fill('Guigu')
await page.getByLabel('Formato do relógio').selectOption('12h')
await page.keyboard.press('Escape')
await page.setViewportSize({ width: 390, height: 844 })
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= 390),
  '12h mobile overflow',
)
await page.screenshot({ path: 'artifacts/mobile-12h.png', fullPage: true })
await page.setViewportSize({ width: 1280, height: 1080 })
await page.getByRole('button', { name: 'Abrir configurações', exact: true }).click()
await page.getByLabel('Mostrar hábitos').uncheck()
await page.getByLabel('Mostrar tarefas').uncheck()
await page.keyboard.press('Escape')
assert.equal(await page.getByRole('heading', { name: /Constância/i }).count(), 0)
assert.equal(await page.getByRole('heading', { name: /Essencial/i }).count(), 0)
await page.getByRole('button', { name: 'Ocultar controles', exact: true }).click()
assert.equal(
  await page.getByRole('button', { name: 'Abrir configurações', exact: true }).count(),
  0,
)
await page.reload()
await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click()
await page.getByRole('button', { name: 'Abrir configurações', exact: true }).click()
await page.getByLabel('Mostrar hábitos').check()
await page.getByLabel('Mostrar tarefas').check()
await page.getByLabel('Formato do relógio').selectOption('24h')
// Validate the complete weather UI against a deterministic API response.
await page.route('https://api.open-meteo.com/**', (route) =>
  route.fulfill({
    json: {
      current: { temperature_2m: 24, weather_code: 2 },
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
        temperature_2m_max: [27, 25, 28, 26, 24, 23, 25],
        temperature_2m_min: [20, 19, 20, 18, 17, 18, 19],
        precipitation_probability_max: [20, 70, 5, 15, 30, 80, 65],
      },
    },
  }),
)
await page.getByRole('textbox', { name: 'Cidade', exact: true }).fill('São Paulo')
await page.getByRole('spinbutton', { name: 'Latitude', exact: true }).fill('-23.5505')
await page.getByRole('spinbutton', { name: 'Longitude', exact: true }).fill('-46.6333')
await page.getByRole('button', { name: 'Salvar localização', exact: true }).click()
await page.keyboard.press('Escape')
await page.getByText('Parcialmente nublado', { exact: true }).waitFor()
await page.screenshot({ path: 'artifacts/configured.png', fullPage: true })
// Long text should wrap without horizontal overflow, including at mobile width.
await page.getByRole('button', { name: 'Editar tarefas', exact: true }).click()
await page
  .getByRole('textbox', { name: 'Título', exact: true })
  .fill(
    'Uma tarefa importante com título muito longo para verificar a leitura e o comportamento em telas menores',
  )
await page.getByRole('dialog').getByRole('button', { name: 'Criar tarefa', exact: true }).click()
await page.keyboard.press('Escape')
await page.setViewportSize({ width: 390, height: 844 })
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390))
await page.screenshot({ path: 'artifacts/mobile-long-text.png', fullPage: true })
assert.deepEqual(errors, [])
// Storage failure must be reported inside the modal, where the user is editing.
const blocked = await context.newPage()
await blocked.addInitScript(() => {
  Storage.prototype.setItem = () => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError')
  }
})
await blocked.goto('http://127.0.0.1:5173')
await blocked.getByRole('button', { name: 'Abrir configurações', exact: true }).click()
await blocked
  .getByRole('dialog')
  .getByText('Não foi possível salvar. Suas alterações durarão apenas nesta sessão.')
  .waitFor()
await blocked.close()
const reducedContext = await browser.newContext({
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  reducedMotion: 'reduce',
})
const reducedPage = await reducedContext.newPage()
await reducedPage.goto('http://127.0.0.1:5173')
assert.equal(
  await reducedPage
    .locator('.greeting .status-dot')
    .evaluate((element) => getComputedStyle(element).animationName),
  'none',
)
assert.equal(
  await reducedPage
    .locator('.tasks .edge-scan > span')
    .evaluate((element) => getComputedStyle(element).animationName),
  'none',
)
await reducedContext.close()
console.log(
  'PASS: tarefas, hábitos, persistência, configurações, controles, clima, movimento reduzido, teclado e console.',
)
await browser.close()
