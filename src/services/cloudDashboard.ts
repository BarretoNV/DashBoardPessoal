import {
  defaultDashboard,
  applyOperations,
  operations,
  validDashboard,
  type DashboardData,
  type Operation,
} from '../../shared/dashboard.mjs'
import { storageService } from './storageService'
export interface CloudSnapshot {
  mode: 'loading' | 'local' | 'cloud' | 'error'
  authenticated: boolean
  data: DashboardData | null
  revision: number
  status: 'synced' | 'saving' | 'error'
  message: string
}
let snapshot: CloudSnapshot = {
  mode: 'loading',
  authenticated: false,
  data: null,
  revision: 0,
  status: 'synced',
  message: '',
}
let csrf = '',
  started = false,
  processing = false,
  sessionGeneration = 0
const listeners = new Set<() => void>()
const queue: Array<{ id: string; ops: Operation[]; replaceRevision?: number }> = []
export const subscribeCloud = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getCloudSnapshot = () => snapshot
const publish = (changes: Partial<CloudSnapshot>) => {
  snapshot = { ...snapshot, ...changes }
  listeners.forEach((fn) => fn())
}
export async function cloudFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (csrf) headers.set('X-CSRF-Token', csrf)
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    signal: init.signal || AbortSignal.timeout(15000),
  })
  const sessionExpired =
    response.status === 401 &&
    (
      (await response
        .clone()
        .json()
        .catch(() => null)) as { code?: string } | null
    )?.code === 'SESSION_REQUIRED'
  if (sessionExpired) {
    sessionGeneration++
    csrf = ''
    queue.length = 0
    publish({ authenticated: false, data: null, message: 'Sua sessão expirou. Entre novamente.' })
  }
  return response
}
async function dashboard() {
  const response = await cloudFetch('/api/dashboard')
  if (!response.ok) throw new Error('Não foi possível carregar os dados sincronizados.')
  const body = (await response.json()) as { data: DashboardData; revision: number }
  if (!validDashboard(body.data) || !Number.isInteger(body.revision))
    throw new Error('Resposta inválida do servidor.')
  return body
}
async function refresh() {
  if (
    snapshot.mode !== 'cloud' ||
    !snapshot.authenticated ||
    queue.length ||
    processing ||
    document.hidden
  )
    return
  try {
    const body = await dashboard()
    if (
      snapshot.authenticated &&
      !queue.length &&
      !processing &&
      body.revision >= snapshot.revision
    )
      publish({ ...body, status: 'synced', message: '' })
  } catch {
    if (snapshot.authenticated)
      publish({ status: 'error', message: 'Sem conexão com o servidor. Edição indisponível.' })
  }
}
export async function initializeCloud() {
  if (started) return
  started = true
  try {
    const response = await cloudFetch('/api/session')
    if (!response.ok) throw new Error('Servidor indisponível ou não configurado.')
    const session = (await response.json()) as {
      mode: 'local' | 'cloud'
      authenticated: boolean
      csrf?: string
    }
    if (!['local', 'cloud'].includes(session.mode))
      throw new Error('Resposta inválida do servidor.')
    csrf = session.csrf || ''
    publish({ mode: session.mode, authenticated: session.authenticated })
    if (session.mode === 'cloud' && session.authenticated) {
      const body = await dashboard()
      publish(body)
    }
  } catch (error) {
    publish({
      mode: 'error',
      message: error instanceof Error ? error.message : 'Servidor indisponível.',
    })
  }
  window.setInterval(() => void refresh(), 30000)
  window.addEventListener('focus', () => void refresh())
  document.addEventListener('visibilitychange', () => void refresh())
  window.addEventListener('online', () => void refresh())
}
async function drain() {
  if (processing || !queue.length) return
  processing = true
  const generation = sessionGeneration
  publish({ status: 'saving', message: '' })
  try {
    while (queue.length && generation === sessionGeneration) {
      const pending = queue[0]
      let revision = pending.replaceRevision ?? snapshot.revision
      let result: { data: DashboardData; revision: number } | null = null
      for (let retry = 0; retry <= 3; retry++) {
        const response = await cloudFetch('/api/dashboard', {
          method: 'PATCH',
          body: JSON.stringify({ revision, operationId: pending.id, operations: pending.ops }),
        })
        if (response.status === 409) {
          if (pending.replaceRevision !== undefined)
            throw new Error(
              'Dados mudaram em outro dispositivo. Recarregue antes de importar novamente.',
            )
          const current = await dashboard()
          revision = current.revision
          continue
        }
        if (!response.ok)
          throw new Error('Não foi possível sincronizar. Sua alteração continua pendente.')
        const body = (await response.json()) as { data: DashboardData; revision: number }
        if (!validDashboard(body.data)) throw new Error('Resposta inválida do servidor.')
        result = body
        break
      }
      if (generation !== sessionGeneration) break
      if (!result) throw new Error('Conflito entre dispositivos. Tente novamente.')
      queue.shift()
      let optimistic = result.data
      for (const entry of queue) optimistic = applyOperations(optimistic, entry.ops)
      publish({ data: optimistic, revision: result.revision })
    }
    if (generation === sessionGeneration) publish({ status: 'synced', message: '' })
  } catch (error) {
    if (generation === sessionGeneration)
      publish({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao sincronizar.',
      })
  } finally {
    processing = false
  }
}
export function updateCloud<T>(key: string, action: T | ((old: T) => T)) {
  if (!snapshot.data || !navigator.onLine || snapshot.status === 'error') {
    publish({ status: 'error', message: 'Conecte-se e tente novamente antes de editar.' })
    return
  }
  const before = snapshot.data[key as keyof DashboardData] as T
  const after = typeof action === 'function' ? (action as (old: T) => T)(before) : action
  const ops = operations(key, before, after)
  if (!ops.length) return
  try {
    const data = applyOperations(snapshot.data, ops)
    queue.push({ id: crypto.randomUUID(), ops })
    publish({ data, status: 'saving' })
    void drain()
  } catch {
    publish({ status: 'error', message: 'Alteração inválida.' })
  }
}
export const retryCloud = () => (queue.length ? void drain() : void refresh())
export async function flushCloud() {
  if (snapshot.mode !== 'cloud') return
  while (processing) await new Promise((resolve) => window.setTimeout(resolve, 25))
  if (queue.length || snapshot.status === 'error')
    throw new Error('Sincronize as alterações antes de conectar o Google.')
}
export const cloudKeys = new Set([
  'settings',
  'integrations',
  'tasks',
  'habits',
  'google-task-list',
])
export function exportDashboard(data?: DashboardData) {
  const local = {
    settings: storageService.read(
      'settings',
      () => defaultDashboard().settings,
      (v): v is DashboardData['settings'] => v !== null,
    ),
    integrations: storageService.read(
      'integrations',
      () => ({ calendarEnabled: false, tasksEnabled: false }),
      (v): v is DashboardData['integrations'] => v !== null,
    ),
    tasks: storageService.read(
      'tasks',
      () => [],
      (v): v is DashboardData['tasks'] => Array.isArray(v),
    ),
    habits: storageService.read(
      'habits',
      () => [],
      (v): v is DashboardData['habits'] => Array.isArray(v),
    ),
    'google-task-list': storageService.read(
      'google-task-list',
      () => '',
      (v): v is string => typeof v === 'string',
    ),
  }
  const payload = data || snapshot.data || local
  if (!validDashboard(payload))
    throw new Error('Dados locais inválidos. Abra as preferências antes de exportar.')
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ version: 1, data: payload }, null, 2)], {
      type: 'application/json',
    }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `painel-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function readBackup(file: File): Promise<DashboardData> {
  if (file.size > 1024 * 1024) throw new Error('O limite do arquivo é 1 MB.')
  const backup: unknown = JSON.parse(await file.text())
  if (
    !backup ||
    typeof backup !== 'object' ||
    !('version' in backup) ||
    backup.version !== 1 ||
    !('data' in backup) ||
    !validDashboard(backup.data)
  )
    throw new Error('Arquivo de backup inválido.')
  return backup.data
}
export function importDashboard(data: DashboardData) {
  if (!snapshot.data || queue.length || snapshot.status !== 'synced' || !navigator.onLine)
    throw new Error('Aguarde a sincronização antes de importar.')
  if (!validDashboard(data)) throw new Error('Arquivo inválido.')
  exportDashboard(snapshot.data)
  queue.push({
    id: crypto.randomUUID(),
    ops: [{ type: 'replace', data }],
    replaceRevision: snapshot.revision,
  })
  publish({ data, status: 'saving' })
  void drain()
}
export async function logoutPanel() {
  if (queue.length) throw new Error('Sincronize as alterações pendentes antes de sair.')
  const response = await cloudFetch('/api/session/logout', { method: 'POST' })
  if (!response.ok) throw new Error('Não foi possível sair.')
  sessionGeneration++
  csrf = ''
  publish({ authenticated: false, data: null })
}
