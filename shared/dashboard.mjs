export const defaultDashboard = () => ({
  settings: {
    name: '',
    hourFormat: '24h',
    showWeather: true,
    showTasks: true,
    showHabits: true,
    accent: '#E6B84A',
    ambient: false,
    autoAmbient: true,
    autoRotateTaskLists: true,
    autoScrollTasks: true,
    animatedBackground: true,
    location: null,
    timezone: 'America/Sao_Paulo',
  },
  integrations: { calendarEnabled: false, tasksEnabled: false },
  tasks: [],
  habits: [],
  'google-task-list': '',
})
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const id = (v) => typeof v === 'string' && /^[\w:-]{1,160}$/.test(v)
const date = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const keys = (v, allowed) => Object.keys(v).every((k) => allowed.includes(k))
export function validDashboard(v) {
  try {
    if (!record(v) || !keys(v, ['settings', 'integrations', 'tasks', 'habits', 'google-task-list']))
      return false
    const s = v.settings,
      p = v.integrations
    if (
      !record(s) ||
      !keys(s, Object.keys(defaultDashboard().settings)) ||
      typeof s.name !== 'string' ||
      s.name.length > 40 ||
      !['12h', '24h'].includes(s.hourFormat) ||
      !/^#[0-9a-f]{6}$/i.test(s.accent) ||
      !['showWeather', 'showTasks', 'showHabits', 'ambient'].every((k) => typeof s[k] === 'boolean')
    )
      return false
    if (
      !['autoAmbient', 'autoRotateTaskLists', 'autoScrollTasks', 'animatedBackground'].every(
        (k) => s[k] === undefined || typeof s[k] === 'boolean',
      )
    )
      return false
    if (s.timezone !== undefined) new Intl.DateTimeFormat('en', { timeZone: s.timezone }).format()
    if (
      s.location !== null &&
      (!record(s.location) ||
        !keys(s.location, ['name', 'latitude', 'longitude']) ||
        !text(s.location.name, 160) ||
        !Number.isFinite(s.location.latitude) ||
        Math.abs(s.location.latitude) > 90 ||
        !Number.isFinite(s.location.longitude) ||
        Math.abs(s.location.longitude) > 180)
    )
      return false
    if (
      !record(p) ||
      !keys(p, ['calendarEnabled', 'tasksEnabled']) ||
      typeof p.calendarEnabled !== 'boolean' ||
      typeof p.tasksEnabled !== 'boolean'
    )
      return false
    if (typeof v['google-task-list'] !== 'string' || v['google-task-list'].length > 512)
      return false
    if (
      !Array.isArray(v.tasks) ||
      v.tasks.length > 2000 ||
      !v.tasks.every(
        (t) =>
          record(t) &&
          keys(t, ['id', 'title', 'completed', 'due', 'priority', 'source']) &&
          id(t.id) &&
          text(t.title, 160) &&
          typeof t.completed === 'boolean' &&
          (t.source === undefined || t.source === 'local') &&
          (t.due === undefined || date(t.due)) &&
          (t.priority === undefined || ['low', 'medium', 'high'].includes(t.priority)),
      )
    )
      return false
    if (
      !Array.isArray(v.habits) ||
      v.habits.length > 500 ||
      !v.habits.every(
        (h) =>
          record(h) &&
          keys(h, ['id', 'name', 'target', 'completedDays']) &&
          id(h.id) &&
          text(h.name, 160) &&
          Number.isInteger(h.target) &&
          h.target >= 1 &&
          h.target <= 7 &&
          Array.isArray(h.completedDays) &&
          h.completedDays.length <= 10000 &&
          h.completedDays.every(date),
      )
    )
      return false
    return ['tasks', 'habits'].every((k) => new Set(v[k].map((x) => x.id)).size === v[k].length)
  } catch {
    return false
  }
}
export function operations(key, before, after) {
  if (['tasks', 'habits'].includes(key)) {
    const result = []
    for (const item of before)
      if (!after.some((x) => x.id === item.id)) result.push({ type: 'remove', key, id: item.id })
    for (const item of after) {
      const old = before.find((x) => x.id === item.id)
      if (!old) result.push({ type: 'create', key, item })
      else {
        const changes = {}
        for (const field of new Set([...Object.keys(old), ...Object.keys(item)]))
          if (
            field !== 'id' &&
            field !== 'completedDays' &&
            JSON.stringify(old[field]) !== JSON.stringify(item[field])
          )
            changes[field] = item[field] ?? null
        if (Object.keys(changes).length) result.push({ type: 'edit', key, id: item.id, changes })
        if (key === 'habits')
          for (const day of new Set([...old.completedDays, ...item.completedDays]))
            if (old.completedDays.includes(day) !== item.completedDays.includes(day))
              result.push({
                type: 'day',
                key,
                id: item.id,
                day,
                completed: item.completedDays.includes(day),
              })
      }
    }
    return result
  }
  if (key === 'google-task-list') return before === after ? [] : [{ type: 'select', value: after }]
  const changes = {}
  for (const field of Object.keys(after))
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      changes[field] = after[field]
  return Object.keys(changes).length ? [{ type: 'fields', key, changes }] : []
}
export function applyOperations(data, ops) {
  const next = structuredClone(data)
  if (!Array.isArray(ops) || ops.length > 5000) throw new Error('Operações inválidas.')
  for (const op of ops) {
    if (!record(op)) throw new Error('Operação inválida.')
    if (op.type === 'replace') {
      if (ops.length !== 1 || !validDashboard(op.data)) throw new Error('Importação inválida.')
      return structuredClone(op.data)
    }
    if (op.type === 'select') {
      next['google-task-list'] = op.value
      continue
    }
    if (
      op.type === 'fields' &&
      ['settings', 'integrations'].includes(op.key) &&
      record(op.changes) &&
      !Object.hasOwn(op.changes, '__proto__')
    ) {
      next[op.key] = { ...next[op.key], ...op.changes }
      continue
    }
    if (!['tasks', 'habits'].includes(op.key)) throw new Error('Categoria inválida.')
    const list = next[op.key]
    if (op.type === 'create' && record(op.item)) {
      if (!list.some((x) => x.id === op.item.id)) list.unshift(op.item)
      continue
    }
    if (!id(op.id)) throw new Error('Identificador inválido.')
    const index = list.findIndex((x) => x.id === op.id)
    if (op.type === 'remove') {
      if (index >= 0) list.splice(index, 1)
      continue
    }
    if (index < 0) throw new Error('Item removido em outro dispositivo.')
    if (op.type === 'edit' && record(op.changes) && !Object.hasOwn(op.changes, 'id')) {
      if (
        !keys(
          op.changes,
          op.key === 'tasks'
            ? ['title', 'completed', 'due', 'priority', 'source']
            : ['name', 'target'],
        )
      )
        throw new Error('Campo inválido.')
      for (const [k, v] of Object.entries(op.changes)) {
        if (v === null) delete list[index][k]
        else list[index][k] = v
      }
    } else if (
      op.type === 'day' &&
      op.key === 'habits' &&
      date(op.day) &&
      typeof op.completed === 'boolean'
    )
      list[index].completedDays = op.completed
        ? [...new Set([...list[index].completedDays, op.day])]
        : list[index].completedDays.filter((d) => d !== op.day)
    else throw new Error('Operação inválida.')
  }
  if (!validDashboard(next)) throw new Error('Dados inválidos.')
  return next
}
