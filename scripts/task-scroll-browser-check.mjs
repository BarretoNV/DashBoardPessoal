import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const tasks = Array.from({ length: 9 }, (_, index) => ({
  id: `task-${index + 1}`,
  title: `Tarefa longa ${index + 1}`,
  status: index === 8 ? 'completed' : 'needsAction',
  due: index === 0 ? '2026-09-29T00:00:00.000Z' : undefined,
}))

async function configure(context, taskItems = tasks) {
  await context.addInitScript(() => {
    localStorage.setItem('command-center:integrations', JSON.stringify({
      version: 1,
      data: { calendarEnabled: false, tasksEnabled: true },
    }))
  })
  await context.route('**/api/auth/config', (route) => route.fulfill({ json: { configured: true } }))
  await context.route('**/api/auth/status', (route) => route.fulfill({
    json: {
      connected: true,
      scopes: ['https://www.googleapis.com/auth/tasks'],
    },
  }))
  await context.route('**/api/task-lists', (route) => route.fulfill({
    json: { items: [{ id: '@default', title: 'Minha lista' }] },
  }))
  await context.route('**/api/tasks?**', (route) => route.fulfill({ json: { items: taskItems } }))
  await context.route('**/api/tasks/*', (route) => {
    const body = route.request().postDataJSON()
    const id = route.request().url().split('/').pop()
    const original = taskItems.find((task) => task.id === id)
    route.fulfill({ json: {
      ...original,
      title: body.title ?? original?.title,
      due: body.due ? `${body.due}T00:00:00.000Z` : undefined,
    } })
  })
}

await mkdir('artifacts', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  viewport: { width: 1280, height: 900 },
})
await configure(context)
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
await page.goto('http://127.0.0.1:5173')
await page.getByRole('checkbox', { name: 'Tarefa longa 9' }).waitFor()
await page.getByRole('button', { name: 'Editar Tarefa longa 5' }).click()
const editForm = page.getByRole('form', { name: 'Editar tarefa Tarefa longa 5' })
await page.screenshot({ path: 'artifacts/task-inline-edit.png', fullPage: true })
await editForm.locator('input[type="date"]').fill('2026-09-28')
await editForm.getByRole('button', { name: 'Salvar edição' }).click()
await page.locator('.task-due').filter({ hasText: '28' }).waitFor()
assert.equal(await page.getByRole('checkbox', { name: /^Tarefa longa/ }).first().getAttribute('aria-label'), 'Tarefa longa 5')
await page.mouse.move(0, 0)
const list = page.locator('.task-list')
const dimensions = await list.evaluate((element) => ({
  clientHeight: element.clientHeight,
  scrollHeight: element.scrollHeight,
}))
assert.ok(dimensions.scrollHeight > dimensions.clientHeight, 'a lista deveria ter overflow')
assert.equal(await page.getByRole('checkbox', { name: /^Tarefa longa/ }).count(), 9)
await page.waitForTimeout(9200)
const scrollTop = await list.evaluate((element) => element.scrollTop)
assert.ok(scrollTop > 0, `rolagem inesperada: ${scrollTop}px`)
await page.screenshot({ path: 'artifacts/task-auto-scroll.png', fullPage: true })
assert.deepEqual(errors, [])

const reducedContext = await browser.newContext({
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
})
await configure(reducedContext)
const reducedPage = await reducedContext.newPage()

const completedContext = await browser.newContext({
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  viewport: { width: 1280, height: 900 },
})
const mostlyCompleted = tasks.map((task, index) => ({
  ...task,
  status: index < 2 ? 'needsAction' : 'completed',
}))
await configure(completedContext, mostlyCompleted)
const completedPage = await completedContext.newPage()

await Promise.all([
  reducedPage.goto('http://127.0.0.1:5173'),
  completedPage.goto('http://127.0.0.1:5173'),
])
await Promise.all([
  reducedPage.getByRole('checkbox', { name: 'Tarefa longa 9' }).waitFor(),
  completedPage.getByRole('checkbox', { name: 'Tarefa longa 9' }).waitFor(),
])
await Promise.all([reducedPage.waitForTimeout(9200), completedPage.waitForTimeout(9200)])
assert.equal(await reducedPage.locator('.task-list').evaluate((element) => element.scrollTop), 0)
const completedList = completedPage.locator('.task-list')
assert.ok(await completedList.evaluate((element) => element.scrollHeight > element.clientHeight))
assert.equal(await completedList.evaluate((element) => element.scrollTop), 0)

await browser.close()
console.log(`PASS: 9 tarefas, viewport ${dimensions.clientHeight}/${dimensions.scrollHeight}px, rolagem ${scrollTop.toFixed(1)}px; concluídas não animam e movimento reduzido é respeitado.`)
