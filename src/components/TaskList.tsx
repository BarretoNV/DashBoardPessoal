import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown, ExternalLink, Plus, SlidersHorizontal, X } from 'lucide-react'
import type { DataSource, GoogleTaskList, Task } from '../types'
import { taskService } from '../services/taskService'
import { taskDueLabel } from '../services/dateService'
import { useDashboardSettings } from '../hooks/useDashboardSettings'
import { useAutoTaskScroll } from '../hooks/useAutoTaskScroll'
import { SectionHeader } from './SectionHeader'
import { DetailText } from './DetailText'
import { TaskCreateForm } from './TaskCreateForm'

export function TaskList({
  tasks,
  lists,
  tasksByList,
  selectedListId,
  unreadListIds,
  onSelectList,
  onRotateList,
  onMarkListSeen,
  now,
  activityRevision,
  settingsOpen,
  autoRotate,
  autoScroll,
  ambient,
  onEdit,
  onComplete,
  onUpdate,
  onCreate,
  source,
  notice,
  loading,
}: {
  tasks: Task[]
  lists: GoogleTaskList[]
  tasksByList: Record<string, Task[]>
  selectedListId: string
  unreadListIds: string[]
  onSelectList: (id: string) => void
  onRotateList: (id: string) => void
  onMarkListSeen: (id: string) => void
  now: Date
  activityRevision: number
  settingsOpen: boolean
  autoRotate: boolean
  autoScroll: boolean
  ambient: boolean
  onEdit: () => void
  onComplete: (id: string, completed: boolean) => void | Promise<void>
  onUpdate: (id: string, changes: { title: string; due?: string }) => Promise<Task | undefined>
  onCreate: (title: string, due?: string) => Promise<Task>
  source: DataSource
  notice?: string
  loading: boolean
}) {
  const { value: settings } = useDashboardSettings()
  const [creating, setCreating] = useState(false)
  const [selectingList, setSelectingList] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [autoShownId, setAutoShownId] = useState<string | null>(null)
  const [activityCooling, setActivityCooling] = useState(false)
  const [minimumDwellReady, setMinimumDwellReady] = useState(false)
  const [updated, setUpdated] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const restore = useRef<string | null>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const listSelector = useRef<HTMLDivElement>(null)
  const listButtons = useRef(new Map<string, HTMLButtonElement>())
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const taskViewport = useRef<HTMLUListElement>(null)
  const datePicker = useRef<HTMLInputElement>(null)
  const previousActivity = useRef(activityRevision)
  const dwellEligible = useRef(false)
  const pending = tasks.filter((task) => !task.completed).length
  const ordered = taskService.ordered(tasks)
  const selectedList = lists.find((list) => list.id === selectedListId)
  const eligibleLists = lists.filter((list) =>
    (tasksByList[list.id] ?? []).some((task) => !task.completed),
  )
  const rotationIndex = eligibleLists.findIndex((list) => list.id === selectedListId)
  const interactionPaused =
    hovered || focusWithin || selectingList || creating || editingTaskId !== null || settingsOpen || !pageVisible || activityCooling
  const rotationPaused = !autoRotate || source !== 'google' || interactionPaused
  const measureKey = ordered.map((task) => `${task.id}:${task.completed}:${task.due ?? ''}`).join('|')
  const scroll = useAutoTaskScroll({
    viewportRef: taskViewport,
    resetKey: selectedListId || 'local',
    measureKey,
    enabled: autoScroll,
    paused: interactionPaused,
  })
  useLayoutEffect(() => {
    if (restore.current) inputs.current.get(restore.current)?.focus({ preventScroll: true })
    restore.current = null
  }, [tasks])
  useEffect(() => {
    if (!creating) return
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!popover.current?.contains(target) && !createButton.current?.contains(target)) {
        setCreating(false)
        createButton.current?.focus({ preventScroll: true })
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setCreating(false)
        createButton.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('pointerdown', closeOnPointer)
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer)
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [creating])
  useEffect(() => {
    if (!selectingList) return
    const closeOnPointer = (event: PointerEvent) => {
      if (!listSelector.current?.contains(event.target as Node)) setSelectingList(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectingList(false)
    }
    document.addEventListener('pointerdown', closeOnPointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectingList])
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (previousActivity.current === activityRevision) return
    previousActivity.current = activityRevision
    const start = window.setTimeout(() => setActivityCooling(true), 0)
    const end = window.setTimeout(() => setActivityCooling(false), 4000)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(end)
    }
  }, [activityRevision])
  useEffect(() => {
    dwellEligible.current = false
    const reset = window.setTimeout(() => setMinimumDwellReady(false), 0)
    if (rotationPaused) return () => window.clearTimeout(reset)
    const ready = window.setTimeout(() => {
      dwellEligible.current = true
      setMinimumDwellReady(true)
    }, 30000)
    return () => {
      window.clearTimeout(reset)
      window.clearTimeout(ready)
    }
  }, [activityRevision, rotationPaused, selectedListId])
  useEffect(() => {
    if (rotationPaused) return
    if (!minimumDwellReady || !dwellEligible.current) return
    if (scroll.isAutoScrolling && scroll.lastCompletedKey !== selectedListId) return
    const nextId = taskService.nextRotatingList(lists, tasksByList, selectedListId, unreadListIds)
    if (!nextId) return
    const timer = window.setTimeout(() => {
      setAutoShownId(nextId)
      onRotateList(nextId)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [lists, minimumDwellReady, onRotateList, rotationPaused, scroll.isAutoScrolling, scroll.lastCompletedKey, selectedListId, tasksByList, unreadListIds])
  useEffect(() => {
    if (
      autoShownId !== selectedListId ||
      !unreadListIds.includes(selectedListId) ||
      settingsOpen ||
      !pageVisible
    ) return
    const timer = window.setTimeout(() => {
      onMarkListSeen(selectedListId)
      setAutoShownId(null)
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [autoShownId, onMarkListSeen, pageVisible, selectedListId, settingsOpen, unreadListIds])
  const moveListFocus = (id: string, direction: number) => {
    const index = lists.findIndex((list) => list.id === id)
    const next = lists[(index + direction + lists.length) % lists.length]
    if (next) listButtons.current.get(next.id)?.focus()
  }
  useEffect(() => {
    if (!updated) return
    const timeout = window.setTimeout(() => setUpdated(null), 650)
    return () => window.clearTimeout(timeout)
  }, [updated])
  const cancelEdit = (taskId: string) => {
    setEditingTaskId(null)
    setEditError('')
    requestAnimationFrame(() => inputs.current.get(taskId)?.focus({ preventScroll: true }))
  }
  const saveEdit = async (task: Task) => {
    if (!editTitle.trim()) {
      setEditError('Informe um título.')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      await onUpdate(task.id, { title: editTitle.trim(), due: editDue || undefined })
      setUpdated(task.id)
      setEditingTaskId(null)
    } catch {
      setEditError('Não foi possível salvar a tarefa.')
    } finally {
      setEditSaving(false)
    }
  }
  return (
    <section
      className="tasks panel"
      aria-label="Tarefas"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusWithin(false)
        }
      }}
    >
      <SectionHeader
        number="02"
        title={source === 'google' ? (
          <span className="task-list-selector" ref={listSelector}>
            <button
              className="task-list-trigger"
              type="button"
              aria-label={`Lista ${selectedList?.title ?? 'Google Tasks'}`}
              aria-haspopup="menu"
              aria-expanded={selectingList}
              onClick={() => setSelectingList((open) => !open)}
              onKeyDown={(event) => {
                if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && lists.length) {
                  event.preventDefault()
                  setSelectingList(true)
                  requestAnimationFrame(() => listButtons.current.get(
                    event.key === 'ArrowDown' ? lists[0].id : lists[lists.length - 1].id,
                  )?.focus())
                }
              }}
            >
              <span>{selectedList?.title ?? 'Google Tasks'}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {selectingList ? (
              <span className="task-list-menu" role="menu" aria-label="Listas do Google Tasks">
                {lists.map((list) => {
                  const listPending = (tasksByList[list.id] ?? []).filter((task) => !task.completed).length
                  const hasNew = unreadListIds.includes(list.id)
                  return (
                    <button
                      key={list.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={list.id === selectedListId}
                      ref={(element) => {
                        if (element) listButtons.current.set(list.id, element)
                        else listButtons.current.delete(list.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault()
                          moveListFocus(list.id, event.key === 'ArrowDown' ? 1 : -1)
                        }
                      }}
                      onClick={() => {
                        setAutoShownId(null)
                        onSelectList(list.id)
                        setSelectingList(false)
                      }}
                    >
                      <span className={`list-new-dot ${hasNew ? 'visible' : ''}`} aria-label={hasNew ? 'Novas tarefas' : undefined} />
                      <span className="list-menu-title">{list.title}</span>
                      <span className="list-menu-count">{listPending}</span>
                    </button>
                  )
                })}
              </span>
            ) : null}
          </span>
        ) : 'Essencial'}
      >
        <div className="heading-actions">
          <span
            className={`task-pending-count${loading ? ' syncing' : ''}`}
            aria-label={loading ? 'Sincronizando tarefas' : `${pending} ${pending === 1 ? 'tarefa pendente' : 'tarefas pendentes'}`}
            title={loading ? 'Sincronizando tarefas' : `${pending} ${pending === 1 ? 'tarefa pendente' : 'tarefas pendentes'}`}
          >
            {loading ? '…' : pending}
          </span>
          {eligibleLists.length > 1 && rotationIndex >= 0 ? (
            <span className="task-list-position" title={`Lista ${rotationIndex + 1} de ${eligibleLists.length}`} aria-label={`Lista ${rotationIndex + 1} de ${eligibleLists.length}`}>{rotationIndex + 1}/{eligibleLists.length}</span>
          ) : null}
          {!ambient && source === 'google' ? (
            <a
              className="icon-button edit-control"
              href="https://calendar.google.com/calendar/u/0/r/tasks"
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir Google Tasks"
              title="Abrir Google Tasks"
            >
              <ExternalLink size={17} />
            </a>
          ) : null}
          {!ambient ? (
            <button
              ref={createButton}
              className="icon-button edit-control task-add-button"
              onClick={() => setCreating((open) => !open)}
              aria-label="Criar tarefa"
              title="Criar tarefa"
              aria-expanded={creating}
              aria-controls="quick-task-create"
            >
              <Plus size={18} />
            </button>
          ) : null}
          {!ambient && source === 'local' ? (
            <button
              className="icon-button edit-control"
              onClick={onEdit}
              aria-label="Editar tarefas"
            >
              <SlidersHorizontal size={17} />
            </button>
          ) : null}
        </div>
      </SectionHeader>
      {creating ? (
        <div className="task-create-popover" id="quick-task-create" ref={popover}>
          <TaskCreateForm
            compact
            autoFocus
            onCreate={async (title, due) => {
              const task = await onCreate(title, due)
              setUpdated(task.id)
              return task
            }}
            onCancel={() => {
              setCreating(false)
              createButton.current?.focus({ preventScroll: true })
            }}
          />
        </div>
      ) : null}
      {pending === 0 && <p className="empty task-empty">Nada pendente.</p>}
      <ul
        className="task-list task-list-enter"
        key={selectedListId || 'local'}
        ref={taskViewport}
      >
        {ordered.map((task) => (
          <li
            key={task.id}
            className={`${task.completed ? 'completed' : ''} ${updated === task.id ? 'task-updated' : ''}`}
            data-task-pending={!task.completed || undefined}
          >
            <div className="task-click">
              <input
                className="task-checkbox"
                type="checkbox"
                aria-label={task.title}
                checked={task.completed}
                ref={(element) => {
                  if (element) inputs.current.set(task.id, element)
                  else inputs.current.delete(task.id)
                }}
                onChange={(event) => {
                  restore.current = task.id
                  setUpdated(task.id)
                  onComplete(task.id, event.target.checked)
                }}
              />
              {editingTaskId === task.id ? (
                <form
                  className="task-direct-edit"
                  aria-label={`Editar tarefa ${task.title}`}
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveEdit(task)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelEdit(task.id)
                    }
                  }}
                >
                  <input
                    className="task-title-input"
                    aria-label="Título"
                    autoFocus
                    value={editTitle}
                    maxLength={160}
                    disabled={editSaving}
                    onChange={(event) => setEditTitle(event.target.value)}
                  />
                  <span className="task-direct-actions">
                    <button
                      type="button"
                      className={`task-mini-button ${editDue ? 'has-date' : ''}`}
                      aria-label={editDue ? `Alterar data ${editDue}` : 'Adicionar data'}
                      title={editDue ? `Data: ${editDue}` : 'Adicionar data'}
                      disabled={editSaving}
                      onClick={() => {
                        if (typeof datePicker.current?.showPicker === 'function') datePicker.current.showPicker()
                        else datePicker.current?.click()
                      }}
                    >
                      <CalendarDays size={15} />
                    </button>
                    <input
                      ref={datePicker}
                      className="task-date-picker"
                      type="date"
                      aria-label="Data"
                      value={editDue}
                      disabled={editSaving}
                      onChange={(event) => setEditDue(event.target.value)}
                    />
                    <button
                      type="submit"
                      className="task-mini-button save"
                      aria-label="Salvar edição"
                      title="Salvar"
                      disabled={editSaving}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      type="button"
                      className="task-mini-button"
                      aria-label="Cancelar edição"
                      title="Cancelar"
                      disabled={editSaving}
                      onClick={() => cancelEdit(task.id)}
                    >
                      <X size={16} />
                    </button>
                  </span>
                  {editDue ? <span className="task-edit-date">{taskDueLabel(editDue, now, settings.timezone).text}</span> : null}
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="task-copy task-edit-trigger"
                    aria-label={`Editar ${task.title}`}
                    onClick={() => {
                      setEditingTaskId(task.id)
                      setEditTitle(task.title)
                      setEditDue(task.due ?? '')
                      setEditError('')
                    }}
                  >
                    <DetailText text={task.title} />
                    {task.due ? (() => {
                      const due = taskDueLabel(task.due, now, settings.timezone)
                      return <span className={`task-due ${due.overdue ? 'overdue' : ''}`}>{due.text}</span>
                    })() : null}
                  </button>
                  {!task.completed && task.priority === 'high' && (
                    <span className="priority-dot" title="Prioridade alta" />
                  )}
                </>
              )}
            </div>
            {editingTaskId === task.id && editError ? (
              <span className="task-inline-error" role="alert">{editError}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {!ambient && notice && !editError && <p className="data-notice" role="status">{notice}</p>}
    </section>
  )
}
