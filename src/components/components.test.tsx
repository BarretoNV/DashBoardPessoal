import { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsProvider } from '../hooks/useDashboardSettings'
import { NextEvent } from './NextEvent'
import type { CalendarEvent } from '../types'
import { TaskCreateForm } from './TaskCreateForm'
import { BackgroundMedia } from './BackgroundMedia'
import { TaskList } from './TaskList'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('fundo animado', () => {
  it('permanece montado quando o autoplay falha transitoriamente no StrictMode', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new DOMException('Reprodução interrompida', 'AbortError'),
    )
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    const view = render(
      <StrictMode>
        <BackgroundMedia enabled />
      </StrictMode>,
    )
    await waitFor(() => expect(view.container.querySelector('video.background-video')).toBeTruthy())
  })
})

function show(event: CalendarEvent | undefined, now: Date, tomorrowFirst?: CalendarEvent) {
  return render(
    <SettingsProvider>
      <NextEvent
        event={event}
        now={now}
        tomorrowFirst={tomorrowFirst}
        source={event?.source ?? tomorrowFirst?.source ?? 'local'}
        loading={false}
        error={false}
      />
    </SettingsProvider>,
  )
}

describe('cartão A seguir', () => {
  it('mostra o primeiro evento de amanhã quando a agenda de hoje terminou', () => {
    show(undefined, new Date('2026-09-25T01:00:00Z'), {
      id: 'tomorrow',
      title: 'Treino',
      start: new Date('2026-09-25T12:00:00Z'),
      end: new Date('2026-09-25T13:00:00Z'),
      source: 'google',
    })
    expect(screen.getByText('Agenda concluída por hoje.')).toBeTruthy()
    expect(screen.getByText('AMANHÃ')).toBeTruthy()
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getAllByText('Treino')).toHaveLength(2)
  })

  it('mostra quanto falta e até que horas um compromisso em andamento continua', () => {
    show(
      {
        id: 'current',
        title: 'Estudo',
        start: new Date('2026-09-24T22:00:00Z'),
        end: new Date('2026-09-25T00:00:00Z'),
        source: 'local',
      },
      new Date('2026-09-24T23:00:00Z'),
    )
    expect(screen.getByText('Agora')).toBeTruthy()
    expect(screen.getByText('termina em 1h · às 21:00')).toBeTruthy()
  })

  it('respeita o formato de 12 horas no horário final', () => {
    localStorage.setItem(
      'command-center:settings',
      JSON.stringify({
        version: 1,
        data: {
          name: '',
          hourFormat: '12h',
          showWeather: true,
          showTasks: true,
          showHabits: true,
          accent: '#E6B84A',
          ambient: false,
          location: null,
          timezone: 'America/Sao_Paulo',
        },
      }),
    )
    show(
      {
        id: 'current-12h',
        title: 'Estudo',
        start: new Date('2026-09-24T22:00:00Z'),
        end: new Date('2026-09-25T00:30:00Z'),
        source: 'local',
      },
      new Date('2026-09-24T23:00:00Z'),
    )
    expect(screen.getByText(/termina em 1h 30min · às 09:30 PM/i)).toBeTruthy()
  })

  it('mantém os textos de eventos futuros, sem fim e de dia inteiro', () => {
    const view = show(
      {
        id: 'future',
        title: 'Consulta',
        start: new Date('2026-09-24T23:30:00Z'),
        source: 'local',
      },
      new Date('2026-09-24T23:00:00Z'),
    )
    expect(screen.getByText('em 30 min')).toBeTruthy()
    view.unmount()

    const withoutEnd = show(
      {
        id: 'without-end',
        title: 'Lembrete',
        start: new Date('2026-09-24T23:00:00Z'),
        source: 'local',
      },
      new Date('2026-09-24T23:00:30Z'),
    )
    expect(screen.getByText('em andamento')).toBeTruthy()
    withoutEnd.unmount()

    show(
      {
        id: 'all-day',
        title: 'Feriado',
        start: new Date('2026-09-24T03:00:00Z'),
        end: new Date('2026-09-25T03:00:00Z'),
        allDay: true,
        source: 'local',
      },
      new Date('2026-09-24T23:00:00Z'),
    )
    expect(screen.getByText('durante todo o dia')).toBeTruthy()
  })

  it('abre eventos do Google em nova aba e não sugere ação para eventos locais', () => {
    const view = show(
      {
        id: 'google',
        title: 'Consulta',
        start: new Date('2026-09-25T12:00:00Z'),
        source: 'google',
        url: 'https://calendar.google.com/calendar/event?eid=abc',
      },
      new Date('2026-09-25T10:00:00Z'),
    )
    const link = screen.getByRole('link', { name: 'Abrir Consulta no Google Agenda' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('href')).toContain('calendar.google.com')
    view.unmount()
    show(
      {
        id: 'local',
        title: 'Treino',
        start: new Date('2026-09-25T12:00:00Z'),
        source: 'local',
      },
      new Date('2026-09-25T10:00:00Z'),
    )
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('abre o Google Agenda mesmo quando não há mais eventos hoje', () => {
    render(
      <SettingsProvider>
        <NextEvent
          event={undefined}
          now={new Date('2026-09-25T23:00:00Z')}
          source="google"
          loading={false}
          error={false}
        />
      </SettingsProvider>,
    )
    const link = screen.getByRole('link', { name: 'Abrir Google Agenda' })
    expect(link.getAttribute('href')).toBe('https://calendar.google.com/calendar/u/0/r')
    expect(link.getAttribute('target')).toBe('_blank')
  })
})

describe('criação de tarefa', () => {
  it('envia título e data e limpa o formulário após sucesso', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue({
      id: 'new',
      title: 'Planejar',
      completed: false,
      source: 'google',
    })
    render(<TaskCreateForm onCreate={onCreate} />)
    await user.type(screen.getByLabelText('Título'), 'Planejar')
    await user.type(screen.getByLabelText(/Data/), '2026-09-28')
    await user.click(screen.getByRole('button', { name: 'Criar tarefa' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Planejar', '2026-09-28'))
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('')
  })

  it('mantém os dados e informa erro quando o Google falha', async () => {
    const user = userEvent.setup()
    render(<TaskCreateForm onCreate={vi.fn().mockRejectedValue(new Error('offline'))} />)
    await user.type(screen.getByLabelText('Título'), 'Continuar depois')
    await user.click(screen.getByRole('button', { name: 'Criar tarefa' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível criar')
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Continuar depois')
  })
})

describe('listas do Google Tasks', () => {
  it('troca de lista, mostra data e oferece atalho para o Google', async () => {
    const user = userEvent.setup()
    const onSelectList = vi.fn()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <SettingsProvider>
        <TaskList
          tasks={[{ id: 'a', title: 'Entregar relatório', completed: false, due: '2026-09-28', source: 'google', taskListId: 'work' }]}
          lists={[{ id: 'work', title: 'Trabalho' }, { id: 'personal', title: 'Pessoal' }]}
          tasksByList={{ work: [{ id: 'a', title: 'Entregar relatório', completed: false, due: '2026-09-28', source: 'google', taskListId: 'work' }], personal: [] }}
          selectedListId="work"
          unreadListIds={['personal']}
          onSelectList={onSelectList}
          onRotateList={vi.fn()}
          onMarkListSeen={vi.fn()}
          now={new Date('2026-09-28T12:00:00-03:00')}
          activityRevision={0}
          settingsOpen={false}
          autoRotate
          autoScroll
          ambient={false}
          onEdit={vi.fn()}
          onComplete={vi.fn()}
          onUpdate={onUpdate}
          onCreate={vi.fn()}
          source="google"
          loading={false}
        />
      </SettingsProvider>,
    )
    expect(screen.getByText('HOJE')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Abrir Google Tasks' }).getAttribute('href')).toContain('/tasks')
    await user.click(screen.getByRole('button', { name: 'Lista Trabalho' }))
    expect(screen.getByRole('menu', { name: 'Listas do Google Tasks' })).toBeTruthy()
    await user.click(screen.getByRole('menuitemradio', { name: /Pessoal/ }))
    expect(onSelectList).toHaveBeenCalledWith('personal')
    await user.click(screen.getByRole('button', { name: 'Editar Entregar relatório' }))
    const editForm = screen.getByRole('form', { name: 'Editar tarefa Entregar relatório' })
    await user.clear(within(editForm).getByLabelText('Título'))
    await user.type(within(editForm).getByLabelText('Título'), 'Entregar relatório final')
    await user.clear(within(editForm).getByLabelText('Data', { exact: true }))
    await user.type(within(editForm).getByLabelText('Data', { exact: true }), '2026-09-30')
    await user.click(within(editForm).getByRole('button', { name: 'Salvar edição' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('a', {
      title: 'Entregar relatório final',
      due: '2026-09-30',
    }))
  })

  it('alterna após 30 segundos e só limpa a novidade depois de 8 segundos visível', () => {
    vi.useFakeTimers()
    const onRotateList = vi.fn()
    const onMarkListSeen = vi.fn()
    const tasks = {
      work: [{ id: 'a', title: 'Trabalho', completed: false, source: 'google' as const, taskListId: 'work' }],
      personal: [{ id: 'b', title: 'Pessoal', completed: false, source: 'google' as const, taskListId: 'personal' }],
    }
    const props = {
      lists: [{ id: 'work', title: 'Trabalho' }, { id: 'personal', title: 'Pessoal' }],
      tasksByList: tasks,
      unreadListIds: ['personal'],
      onSelectList: vi.fn(),
      onRotateList,
      onMarkListSeen,
      now: new Date('2026-09-28T12:00:00-03:00'),
      activityRevision: 0,
      settingsOpen: false,
      autoRotate: true,
      autoScroll: true,
      ambient: false,
      onEdit: vi.fn(),
      onComplete: vi.fn(),
      onUpdate: vi.fn().mockResolvedValue(undefined),
      onCreate: vi.fn(),
      source: 'google' as const,
      loading: false,
    }
    const view = render(
      <SettingsProvider><TaskList {...props} tasks={tasks.work} selectedListId="work" /></SettingsProvider>,
    )
    act(() => vi.advanceTimersByTime(30000))
    act(() => vi.advanceTimersByTime(0))
    expect(onRotateList).toHaveBeenCalledWith('personal')
    view.rerender(
      <SettingsProvider><TaskList {...props} tasks={tasks.personal} selectedListId="personal" /></SettingsProvider>,
    )
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(7999))
    expect(onMarkListSeen).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onMarkListSeen).toHaveBeenCalledWith('personal')
  })
})
