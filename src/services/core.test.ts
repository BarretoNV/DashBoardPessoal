import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarService, countdown, eventState, remainingTime, selectEvents } from './calendarService'
import { dateKey, taskDueLabel, weekDays } from './dateService'
import { storageService } from './storageService'
import { validHabits, validSettings, validTasks } from './validation'
import { dashboardConfig } from '../config/dashboard'
import { taskService } from './taskService'
import { fetchWeather } from './weatherService'
import type { CalendarEvent, Task } from '../types'
const event = (id: string, hour: number, end?: number): CalendarEvent => ({
  id,
  title: id,
  source: 'local',
  start: new Date(2026, 8, 24, hour),
  ...(end ? { end: new Date(2026, 8, 24, end) } : {}),
})
beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
describe('agenda e datas', () => {
  it('separa eventos de dia inteiro sem ocupar o destaque ou as cinco vagas com horário', () => {
    const allDay = { ...event('Convocação', 0, 24), allDay: true }
    const timed = Array.from({ length: 6 }, (_, i) => event(`horário-${i}`, i + 13))
    const result = selectEvents([allDay, ...timed], new Date(2026, 8, 24, 12))
    expect(result.next?.id).toBe('horário-0')
    expect(result.visible).toHaveLength(5)
    expect(result.visible.every(item => !item.allDay)).toBe(true)
    expect(result.allDay).toEqual([allDay])
    expect(selectEvents([allDay], new Date(2026, 8, 24, 12)).next).toBeUndefined()
    expect(selectEvents([allDay], new Date(2026, 8, 25, 0)).allDay).toEqual([])
  })
  it('prioriza evento em andamento e respeita o fim exclusivo', () => {
    const events = [event('futuro', 19), event('atual', 11, 13), event('passado', 9, 10)]
    expect(selectEvents(events, new Date(2026, 8, 24, 12)).next?.id).toBe('atual')
    expect(countdown(events[1], new Date(2026, 8, 24, 12))).toBe('agora')
    expect(selectEvents(events, new Date(2026, 8, 24, 13)).next?.id).toBe('futuro')
  })
  it('eventos sem fim duram somente até o fim do minuto de início', () => {
    expect(eventState(event('a', 9), new Date(2026, 8, 24, 9, 0, 59))).toBe('current')
    expect(eventState(event('a', 9), new Date(2026, 8, 24, 9, 1))).toBe('past')
  })
  it('limita a cinco e não deixa passados ocultarem futuros', () => {
    const events = Array.from({ length: 10 }, (_, i) => event(String(i), i + 8))
    const result = selectEvents(events, new Date(2026, 8, 24, 12, 30))
    expect(result.visible).toHaveLength(5)
    expect(result.visible.map((e) => e.start.getHours())).toEqual([13, 14, 15, 16, 17])
    expect(selectEvents(events, new Date(2026, 8, 24, 23)).next).toBeUndefined()
  })
  it('ordena simultâneos deterministicamente e mostra duração legível', () => {
    expect(selectEvents([event('b', 19), event('a', 19)], new Date(2026, 8, 24, 18)).next?.id).toBe(
      'a',
    )
    expect(countdown(event('a', 19), new Date(2026, 8, 24, 17, 36))).toBe('em 1h 24min')
    expect(countdown(event('a', 19), new Date(2026, 8, 24, 18, 42))).toBe('em 18 min')
  })
  it('formata o tempo restante arredondando para cima', () => {
    const end = new Date(2026, 8, 24, 19)
    expect(remainingTime(end, new Date(2026, 8, 24, 18, 30, 1))).toBe('30 min')
    expect(remainingTime(end, new Date(2026, 8, 24, 18))).toBe('1h')
    expect(remainingTime(end, new Date(2026, 8, 24, 17, 35, 1))).toBe('1h 25min')
  })
  it('recria exemplos ao virar o dia', async () => {
    const result = await calendarService.getEvents(new Date(2026, 8, 25), new Date(2026, 8, 26))
    expect(result.events).toHaveLength(3)
    expect(result.events.every((e) => dateKey(e.start) === '2026-09-25')).toBe(true)
  })
  it('semana começa segunda e muda no limite de mês e ano', () => {
    expect(weekDays(new Date(2027, 0, 3)).map((day) => dateKey(day))).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ])
    expect(dateKey(weekDays(new Date(2027, 0, 4))[0])).toBe('2027-01-04')
    const oldRecords = ['2026-12-28', '2026-12-30']
    expect(
      weekDays(new Date(2027, 0, 4)).filter((day) => oldRecords.includes(dateKey(day))),
    ).toHaveLength(0)
  })
  it('formata datas de tarefas como dias civis no fuso configurado', () => {
    const now = new Date('2026-09-29T02:30:00Z')
    expect(taskDueLabel('2026-09-28', now, 'America/Sao_Paulo')).toEqual({ text: 'HOJE', overdue: false })
    expect(taskDueLabel('2026-09-29', now, 'America/Sao_Paulo')).toEqual({ text: 'AMANHÃ', overdue: false })
    expect(taskDueLabel('2026-09-27', now, 'America/Sao_Paulo').overdue).toBe(true)
  })
})
describe('persistência e validação', () => {
  it('marca somente tarefas pendentes novas em listas que não estão abertas', () => {
    const base: Task = { id: 'known', title: 'Conhecida', completed: false, source: 'google', taskListId: 'work' }
    const first = taskService.reconcileRemoteUpdates(
      [{ id: 'work', tasks: [base] }, { id: 'personal', tasks: [] }],
      {},
      [],
      'work',
    )
    expect(first.unreadIds).toEqual([])
    const changed = taskService.reconcileRemoteUpdates(
      [
        { id: 'work', tasks: [base, { ...base, id: 'new-active' }] },
        { id: 'personal', tasks: [{ ...base, id: 'new-other', taskListId: 'personal' }] },
      ],
      first.snapshots,
      [],
      'work',
    )
    expect(changed.unreadIds).toEqual(['personal'])
    const completedOnly = taskService.reconcileRemoteUpdates(
      [{ id: 'personal', tasks: [{ ...base, id: 'done', completed: true, taskListId: 'personal' }] }],
      { personal: [] },
      [],
      'work',
    )
    expect(completedOnly.unreadIds).toEqual([])
  })
  it('prioriza novidades e ignora listas sem pendências na rotação', () => {
    const pending: Task = { id: 'a', title: 'Pendente', completed: false, source: 'google' }
    const done: Task = { ...pending, id: 'b', completed: true }
    const lists = [{ id: 'one' }, { id: 'empty' }, { id: 'new' }]
    const tasksByList = { one: [pending], empty: [done], new: [{ ...pending, id: 'c' }] }
    expect(taskService.nextRotatingList(lists, tasksByList, 'one', ['new'])).toBe('new')
    expect(taskService.nextRotatingList(lists, tasksByList, 'new', [])).toBe('one')
    expect(taskService.nextRotatingList(lists, { one: [pending] }, 'one', [])).toBeUndefined()
  })

  it('preserva listas vazias intencionais', () => {
    storageService.write('tasks', [])
    expect(
      storageService.read(
        'tasks',
        (): Task[] => [{ id: 'a', title: 'Exemplo', completed: false, source: 'local' }],
        validTasks,
      ),
    ).toEqual([])
  })
  it('recupera JSON inválido e versões desconhecidas', () => {
    localStorage.setItem('command-center:settings', '{broken')
    expect(storageService.read('settings', () => dashboardConfig, validSettings)).toEqual(
      dashboardConfig,
    )
    localStorage.setItem(
      'command-center:settings',
      JSON.stringify({ version: 9, data: dashboardConfig }),
    )
    expect(storageService.read('settings', () => dashboardConfig, validSettings)).toEqual(
      dashboardConfig,
    )
  })
  it('captura falhas de armazenamento', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(storageService.write('tasks', [])).toBe(false)
  })
  it('rejeita dados inválidos', () => {
    expect(validSettings(dashboardConfig)).toBe(true)
    expect(validSettings({
      ...dashboardConfig,
      autoAmbient: undefined,
      autoRotateTaskLists: undefined,
      autoScrollTasks: undefined,
    })).toBe(true)
    expect(validSettings({ ...dashboardConfig, animatedBackground: false })).toBe(true)
    expect(validTasks([{ id: 'x', title: ' ', completed: false }])).toBe(false)
    expect(validHabits([{ id: 'x', name: 'A', target: 8, completedDays: [] }])).toBe(false)
    expect(
      validSettings({ ...dashboardConfig, location: { name: 'x', latitude: 91, longitude: 0 } }),
    ).toBe(false)
  })
  it('prioriza tarefas pendentes antes das concluídas', () => {
    expect(
      taskService
        .visible([
          { id: 'done', title: 'x', completed: true, priority: 'high', source: 'local' },
          { id: 'low', title: 'x', completed: false, source: 'local' },
          { id: 'high', title: 'x', completed: false, priority: 'high', source: 'local' },
        ])
        .map((t) => t.id),
    ).toEqual(['high', 'low', 'done'])
    expect(taskService.ordered(Array.from({ length: 7 }, (_, index) => ({
      id: String(index),
      title: `Tarefa ${index}`,
      completed: false,
      source: 'local' as const,
    })))).toHaveLength(7)
    expect(taskService.ordered([
      { id: 'sem-data', title: 'Sem data', completed: false, priority: 'high', source: 'local' },
      { id: 'amanha', title: 'Amanhã', completed: false, due: '2026-09-30', source: 'local' },
      { id: 'hoje', title: 'Hoje', completed: false, due: '2026-09-29', source: 'local' },
    ]).map((task) => task.id)).toEqual(['hoje', 'amanha', 'sem-data'])
  })
})
describe('clima', () => {
  it('valida resposta e coordenadas enviadas', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
      ),
    )
    const result = await fetchWeather(
      { name: 'Teste', latitude: -23, longitude: -46 },
      new AbortController().signal,
    )
    expect(result).toMatchObject({ temperature: 24, code: 2 })
    expect(result.days).toHaveLength(7)
    expect(result.days[1]).toMatchObject({
      date: '2026-09-25',
      code: 61,
      high: 25,
      low: 19,
      precipitationProbability: 70,
    })
    expect(String(fetchMock.mock.calls[0][0])).toContain('latitude=-23')
    expect(String(fetchMock.mock.calls[0][0])).toContain('forecast_days=7')
    expect(String(fetchMock.mock.calls[0][0])).toContain('precipitation_probability_max')
  })
  it('rejeita HTTP com erro e dados ausentes', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ current: {}, daily: {} })))
    const location = { name: 'Teste', latitude: 0, longitude: 0 }
    await expect(fetchWeather(location, new AbortController().signal)).rejects.toThrow()
    await expect(fetchWeather(location, new AbortController().signal)).rejects.toThrow()
  })
})
