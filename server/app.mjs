import express from 'express'

function safeError(error) {
  if (error?.status === 401) return { status: 401, message: 'Google não conectado.' }
  if (error?.response?.status === 401) return { status: 401, message: 'A conexão Google precisa ser refeita.' }
  return { status: 502, message: 'O Google está temporariamente indisponível.' }
}

function cookie(request, name) {
  const entry = request.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : ''
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function createApp({ authManager, gateway, configured, origins, appOrigin, scopes }) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '16kb' }))

  const mutationOrigin = (request, response, next) => {
    const origin = request.get('origin')
    if (!origin || !origins.has(origin)) {
      response.status(403).json({ error: 'Origem não autorizada.' })
      return
    }
    next()
  }

  app.get('/api/auth/config', (_request, response) => {
    response.json({ configured })
  })
  app.get('/api/auth/status', async (_request, response) => {
    response.json(await authManager.status())
  })
  app.get('/api/auth/start', async (request, response) => {
    if (!configured) {
      response.status(503).json({ error: 'Credenciais Google não configuradas.' })
      return
    }
    const features = String(request.query.features ?? '').split(',')
    const requestedScopes = [
      ...(features.includes('calendar') ? [scopes.calendar] : []),
      ...(features.includes('tasks') ? [scopes.tasks] : []),
    ]
    if (!requestedScopes.length) {
      response.status(400).json({ error: 'Nenhuma integração selecionada.' })
      return
    }
    const authorization = await authManager.authorizationUrl(requestedScopes)
    response.cookie('oauth_state', authorization.state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 10 * 60 * 1000,
      path: '/',
    })
    response.redirect(authorization.url)
  })
  app.get('/api/auth/callback', async (request, response) => {
    const state = typeof request.query.state === 'string' ? request.query.state : ''
    const code = typeof request.query.code === 'string' ? request.query.code : ''
    if (!state || !code || state !== cookie(request, 'oauth_state')) {
      response.redirect(`${appOrigin}/?google=error`)
      return
    }
    try {
      await authManager.exchangeCode(code, state)
      response.clearCookie('oauth_state', { path: '/' })
      response.redirect(`${appOrigin}/?google=connected`)
    } catch {
      response.redirect(`${appOrigin}/?google=error`)
    }
  })
  app.post('/api/auth/logout', mutationOrigin, async (_request, response) => {
    await authManager.logout()
    response.status(204).end()
  })
  app.get('/api/calendar/events', async (request, response) => {
    const { timeMin, timeMax, timeZone } = request.query
    if (![timeMin, timeMax, timeZone].every((value) => typeof value === 'string')) {
      response.status(400).json({ error: 'Intervalo da agenda inválido.' })
      return
    }
    try {
      response.json({ items: await gateway.calendarEvents({ timeMin, timeMax, timeZone }) })
    } catch (error) {
      const safe = safeError(error)
      response.status(safe.status).json({ error: safe.message })
    }
  })
  app.get('/api/task-lists', async (_request, response) => {
    try {
      response.json({ items: await gateway.taskLists() })
    } catch (error) {
      const safe = safeError(error)
      response.status(safe.status).json({ error: safe.message })
    }
  })
  app.get('/api/tasks', async (request, response) => {
    const taskListId = typeof request.query.taskListId === 'string' ? request.query.taskListId : ''
    if (!taskListId) {
      response.status(400).json({ error: 'Lista de tarefas inválida.' })
      return
    }
    try {
      response.json({ items: await gateway.tasks(taskListId) })
    } catch (error) {
      const safe = safeError(error)
      response.status(safe.status).json({ error: safe.message })
    }
  })
  app.post('/api/tasks', mutationOrigin, async (request, response) => {
    const body = request.body
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : []
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const due = body?.due
    const taskListId = typeof body?.taskListId === 'string' ? body.taskListId.trim() : ''
    if (
      !title ||
      title.length > 160 ||
      !taskListId ||
      keys.some((key) => !['title', 'due', 'taskListId'].includes(key)) ||
      !(due === null || due === undefined || (typeof due === 'string' && validDateKey(due)))
    ) {
      response.status(400).json({ error: 'Dados da tarefa inválidos.' })
      return
    }
    try {
      response.status(201).json(await gateway.createTask({ title, due: due || undefined, taskListId }))
    } catch (error) {
      const safe = safeError(error)
      response.status(safe.status).json({ error: safe.message })
    }
  })
  app.patch('/api/tasks/:id', mutationOrigin, async (request, response) => {
    const body = request.body
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : []
    const taskListId = typeof body?.taskListId === 'string' ? body.taskListId.trim() : ''
    const hasTitle = Object.hasOwn(body ?? {}, 'title')
    const hasDue = Object.hasOwn(body ?? {}, 'due')
    const hasCompleted = Object.hasOwn(body ?? {}, 'completed')
    const title = hasTitle && typeof body.title === 'string' ? body.title.trim() : undefined
    const due = hasDue ? body.due : undefined
    if (
      !taskListId ||
      (!hasTitle && !hasDue && !hasCompleted) ||
      keys.some((key) => !['title', 'due', 'completed', 'taskListId'].includes(key)) ||
      (hasTitle && (!title || title.length > 160)) ||
      (hasDue && !(due === null || (typeof due === 'string' && validDateKey(due)))) ||
      (hasCompleted && typeof body.completed !== 'boolean')
    ) {
      response.status(400).json({ error: 'Dados da tarefa inválidos.' })
      return
    }
    try {
      response.json(await gateway.updateTask(request.params.id, {
        ...(hasTitle ? { title } : {}),
        ...(hasDue ? { due } : {}),
        ...(hasCompleted ? { completed: body.completed } : {}),
      }, taskListId))
    } catch (error) {
      const safe = safeError(error)
      response.status(safe.status).json({ error: safe.message })
    }
  })

  return app
}
