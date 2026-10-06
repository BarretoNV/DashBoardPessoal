import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const scopes = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/tasks',
]
let connected = true
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  await context.addInitScript(() => {
    localStorage.setItem(
      'command-center:integrations',
      JSON.stringify({
        version: 1,
        data: { calendarEnabled: true, tasksEnabled: true },
      }),
    )
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/session')
      return route.fulfill({ json: { mode: 'local', authenticated: true } })
    if (url.pathname === '/api/task-lists')
      return route.fulfill({ json: { items: [{ id: '@default', title: 'Pessoal' }] } })
    if (url.pathname === '/api/auth/config') return route.fulfill({ json: { configured: true } })
    if (url.pathname === '/api/auth/status')
      return route.fulfill({ json: { connected, scopes: connected ? scopes : [] } })
    if (url.pathname === '/api/auth/logout') {
      connected = false
      return route.fulfill({ status: 204, body: '' })
    }
    if (url.pathname === '/api/calendar/events') {
      return route.fulfill({
        json: {
          items: [
            {
              id: 'real-event',
              summary: 'Evento persistente',
              start: { dateTime: `${day}T19:00:00-03:00` },
              end: { dateTime: `${day}T20:00:00-03:00` },
            },
          ],
        },
      })
    }
    if (url.pathname === '/api/tasks' && request.method() === 'GET') {
      return route.fulfill({
        json: { items: [{ id: 'real-task', title: 'Tarefa persistente', status: 'needsAction' }] },
      })
    }
    if (url.pathname === '/api/tasks/real-task') {
      return route.fulfill({
        json: { id: 'real-task', title: 'Tarefa persistente', status: 'completed' },
      })
    }
    return route.continue()
  })

  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5173')
  await page.getByText('Evento persistente', { exact: true }).first().waitFor()
  await page.getByRole('checkbox', { name: 'Tarefa persistente', exact: true }).waitFor()
  await page.reload()
  await page.getByText('Google Calendar', { exact: true }).first().waitFor()
  assert.equal((await page.getByText('Evento persistente', { exact: true }).count()) > 0, true)

  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('http://127.0.0.1:5173')
  await reopened.getByText('Evento persistente', { exact: true }).first().waitFor()
  await reopened.getByRole('button', { name: 'Abrir configurações', exact: true }).click()
  const dialog = reopened.getByRole('dialog')
  assert.equal(await dialog.getByText('Conectado', { exact: true }).count(), 2)
  await dialog.getByRole('button', { name: 'Desconectar Google', exact: true }).click()
  await reopened.keyboard.press('Escape')
  await reopened.reload()
  await reopened.getByText('Dados locais', { exact: true }).first().waitFor()
  assert.equal(connected, false)
  console.log('PASS: F5, reabertura, sessão restaurada e logout controlado.')
} finally {
  await browser.close()
}
