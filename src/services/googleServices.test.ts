import { afterEach, describe, expect, it, vi } from 'vitest'
import { googleCalendarService } from './googleCalendarService'
import { googleTasksService } from './googleTasksService'
import { calendarService } from './calendarService'
import { googleFetch } from './googleApiService'

afterEach(() => vi.restoreAllMocks())

describe('Google Calendar', () => {
  it('normaliza eventos com horário e de dia inteiro no fuso configurado', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'timed',
              summary: 'Consulta',
              htmlLink: 'https://calendar.google.com/calendar/event?eid=abc',
              start: { dateTime: '2026-09-24T10:00:00-03:00' },
              end: { dateTime: '2026-09-24T11:00:00-03:00' },
            },
            {
              id: 'all-day',
              summary: 'Aniversário',
              start: { date: '2026-09-25' },
              end: { date: '2026-09-26' },
            },
          ],
        }),
      ),
    )
    const events = await googleCalendarService.getEvents(
      new Date('2026-09-24T03:00:00Z'),
      new Date('2026-09-27T03:00:00Z'),
      'America/Sao_Paulo',
    )
    expect(events).toHaveLength(2)
    expect(events[0].url).toBe('https://calendar.google.com/calendar/event?eid=abc')
    expect(events[1]).toMatchObject({
      id: 'google-calendar:all-day',
      allDay: true,
      source: 'google',
    })
    expect(events[1].start.toISOString()).toBe('2026-09-25T03:00:00.000Z')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/calendar/events')
    expect(String(url)).toContain('timeZone=America%2FSao_Paulo')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
  })

  it('recua para a agenda local quando a API falha', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    const result = await calendarService.getEvents(
      new Date('2026-09-24T03:00:00Z'),
      new Date('2026-09-25T03:00:00Z'),
      { googleEnabled: true, googleConnected: true, timezone: 'America/Sao_Paulo' },
    )
    expect(result.source).toBe('local')
    expect(result.events.every((event) => event.source === 'local')).toBe(true)
    expect(result.notice).toContain('Google Calendar')
  })
})

describe('Google Tasks', () => {
  it('carrega as listas disponíveis', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: 'a', title: 'Pessoal', updated: '2026-09-28T10:00:00Z' }] })),
    )
    await expect(googleTasksService.getTaskLists()).resolves.toEqual([
      { id: 'a', title: 'Pessoal', updated: '2026-09-28T10:00:00Z' },
    ])
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/task-lists')
  })

  it('carrega pendentes e concluídas e atualiza o estado remotamente', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              { id: 'a', title: 'Pendente', status: 'needsAction' },
              { id: 'b', title: 'Feita', status: 'completed' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'a', title: 'Pendente', status: 'completed' })),
      )
    const tasks = await googleTasksService.getTasks('list-a')
    expect(tasks.map((task) => task.completed)).toEqual([false, true])
    expect(String(fetchMock.mock.calls[0][0])).toContain('taskListId=list-a')
    const updated = await googleTasksService.setCompleted(tasks[0], true)
    expect(updated.completed).toBe(true)
    const [url, init] = fetchMock.mock.calls[1]
    expect(String(url)).toContain('/tasks/a')
    expect(init?.method).toBe('PATCH')
    expect(init?.body).toContain('"completed":true')
  })

  it('cria uma tarefa com data sem deslocá-la pelo fuso horário', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'new',
          title: 'Planejar a semana',
          status: 'needsAction',
          due: '2026-09-28T00:00:00.000Z',
        }),
      ),
    )
    const task = await googleTasksService.createTask('Planejar a semana', '2026-09-28', 'list-a')
    expect(task).toMatchObject({
      id: 'google-task:new',
      title: 'Planejar a semana',
      due: '2026-09-28',
      source: 'google',
      taskListId: 'list-a',
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ title: 'Planejar a semana', due: '2026-09-28', taskListId: 'list-a' }))
  })

  it('edita título e data na lista de origem', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        id: 'a', title: 'Atualizada', status: 'needsAction', due: '2026-09-30T00:00:00.000Z',
      })),
    )
    const task = await googleTasksService.updateTask({
      id: 'google-task:a', title: 'Antiga', completed: false, source: 'google', taskListId: 'list-a',
    }, { title: 'Atualizada', due: '2026-09-30' })
    expect(task).toMatchObject({ title: 'Atualizada', due: '2026-09-30' })
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      title: 'Atualizada', due: '2026-09-30', taskListId: 'list-a',
    }))
  })

  it('expõe erro seguro com o status HTTP', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Negado' } }), { status: 403 }),
    )
    await expect(googleFetch('https://example.test')).rejects.toMatchObject({
      status: 403,
      message: 'Negado',
    })
  })
})
