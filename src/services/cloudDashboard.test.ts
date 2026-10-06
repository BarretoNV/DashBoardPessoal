import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import {
  defaultDashboard,
  applyOperations,
  type DashboardData,
  type Operation,
} from '../../shared/dashboard.mjs'
let remote: { data: DashboardData; revision: number }
let requests: Array<{ revision: number; operations: Operation[]; operationId: string }>
let failure = false,
  conflicts = 0

let cloud: typeof import('./cloudDashboard')
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  remote = { data: defaultDashboard(), revision: 0 }
  requests = []
  failure = false
  conflicts = 0
  vi.spyOn(window, 'setInterval')
  vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
  vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/session')
        return response({ mode: 'cloud', authenticated: true, csrf: 'csrf' })
      if (path === '/api/dashboard' && init?.method === 'PATCH') {
        expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf')
        const body = JSON.parse(init.body as string) as (typeof requests)[number]
        requests.push(body)
        if (failure) return response({ error: 'Unavailable' }, 503)
        if (conflicts > 0) {
          conflicts--
          remote.revision++
          remote.data.settings.name = 'Outro dispositivo'
          return response(remote, 409)
        }
        if (body.revision !== remote.revision) return response(remote, 409)
        remote = {
          data: applyOperations(remote.data, body.operations),
          revision: remote.revision + 1,
        }
        return response(remote)
      }
      if (path === '/api/dashboard') return response(remote)
      return new Response(null, { status: 204 })
    }),
  )
  cloud = await import('./cloudDashboard')
  await cloud.initializeCloud()
})
afterEach(() => {
  vi.mocked(window.setInterval).mock.results.forEach((result) =>
    clearInterval(result.value as ReturnType<typeof setInterval>),
  )
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('sincronização do painel', () => {
  it('uma consulta antiga não substitui a alteração que está sendo salva', async () => {
    let finishRead!: (value: Response) => void
    let finishWrite!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_path: string, init?: RequestInit) =>
          new Promise<Response>((resolve) => {
            if (init?.method === 'PATCH') finishWrite = resolve
            else finishRead = resolve
          }),
      ),
    )
    cloud.retryCloud()
    cloud.updateCloud<DashboardData['settings']>('settings', (old) => ({ ...old, name: 'Atual' }))
    finishRead(response({ data: defaultDashboard(), revision: 0 }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(cloud.getCloudSnapshot()).toMatchObject({
      status: 'saving',
      data: { settings: { name: 'Atual' } },
    })
    const data = defaultDashboard()
    data.settings.name = 'Atual'
    finishWrite(response({ data, revision: 1 }))
    await waitFor(() => expect(cloud.getCloudSnapshot().status).toBe('synced'))
  })
  it('carrega a nuvem sem importar automaticamente o armazenamento local', () => {
    expect(cloud.getCloudSnapshot()).toMatchObject({
      mode: 'cloud',
      authenticated: true,
      data: { tasks: [], habits: [] },
    })
    expect(localStorage.length).toBe(0)
  })
  it('não mostra eventos de demonstração no painel publicado', async () => {
    const { localCalendarService } = await import('./localCalendarService')
    expect(
      await localCalendarService.getEvents(
        new Date('2026-10-06T03:00:00Z'),
        new Date('2026-10-07T03:00:00Z'),
        'America/Sao_Paulo',
      ),
    ).toEqual([])
  })
  it('serializa alterações rápidas e preserva outro dispositivo após conflito', async () => {
    conflicts = 1
    cloud.updateCloud<DashboardData['settings']>('settings', (old) => ({
      ...old,
      accent: '#112233',
    }))
    cloud.updateCloud<DashboardData['tasks']>('tasks', () => [
      { id: 'task', title: 'Tarefa', completed: false, source: 'local' },
    ])
    await waitFor(() => expect(cloud.getCloudSnapshot().status).toBe('synced'))
    expect(remote.data.settings.name).toBe('Outro dispositivo')
    expect(remote.data.settings.accent).toBe('#112233')
    expect(remote.data.tasks).toHaveLength(1)
    expect(requests[0].operationId).toBe(requests[1].operationId)
  })
  it('preserva alteração pendente após falha e usa o mesmo ID no retry', async () => {
    failure = true
    cloud.updateCloud<DashboardData['tasks']>('tasks', () => [
      { id: 'pending', title: 'Pendente', completed: false, source: 'local' },
    ])
    await waitFor(() => expect(cloud.getCloudSnapshot().status).toBe('error'))
    expect(cloud.getCloudSnapshot().data?.tasks[0].title).toBe('Pendente')
    failure = false
    cloud.retryCloud()
    await waitFor(() => expect(cloud.getCloudSnapshot().status).toBe('synced'))
    expect(requests[0].operationId).toBe(requests[1].operationId)
    expect(remote.data.tasks).toHaveLength(1)
  })
  it('limita conflitos e bloqueia edição offline', async () => {
    conflicts = 5
    cloud.updateCloud<DashboardData['settings']>('settings', (old) => ({
      ...old,
      name: 'Meu nome',
    }))
    await waitFor(() => expect(cloud.getCloudSnapshot().status).toBe('error'))
    expect(requests).toHaveLength(4)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    cloud.updateCloud<DashboardData['tasks']>('tasks', () => [
      { id: 'offline', title: 'Offline', completed: false, source: 'local' },
    ])
    expect(cloud.getCloudSnapshot().data?.tasks).toHaveLength(0)
  })
  it('rejeita importação inválida, datas impossíveis, tokens e arquivo acima de 1 MB', async () => {
    await expect(cloud.readBackup(new File(['bad'], 'bad.json'))).rejects.toBeTruthy()
    await expect(
      cloud.readBackup(new File(['a'.repeat(1024 * 1024 + 1)], 'large.json')),
    ).rejects.toThrow('1 MB')
    const invalid = defaultDashboard()
    invalid.tasks = [
      { id: 'bad', title: 'Bad', completed: false, source: 'local', due: '2026-02-30' },
    ]
    await expect(
      cloud.readBackup(new File([JSON.stringify({ version: 1, data: invalid })], 'bad.json')),
    ).rejects.toThrow('inválido')
    const withToken = { ...defaultDashboard(), refreshToken: 'secret' }
    await expect(
      cloud.readBackup(new File([JSON.stringify({ version: 1, data: withToken })], 'bad.json')),
    ).rejects.toThrow('inválido')
    const data = defaultDashboard()
    data.habits = [{ id: 'h', name: 'Hábito', target: 3, completedDays: [] }]
    expect(
      await cloud.readBackup(new File([JSON.stringify({ version: 1, data })], 'backup.json')),
    ).toEqual(data)
  })
  it('expiração remove os dados privados e o CSRF da memória', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ code: 'SESSION_REQUIRED', error: 'expired' }, 401)),
    )
    await cloud.cloudFetch('/api/tasks')
    expect(cloud.getCloudSnapshot()).toMatchObject({ authenticated: false, data: null })
  })
  it('Google desconectado não encerra a sessão do painel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ error: 'Google não conectado.' }, 401)),
    )
    await cloud.cloudFetch('/api/tasks')
    expect(cloud.getCloudSnapshot()).toMatchObject({ authenticated: true, data: { tasks: [] } })
  })
})
