import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataSource, GoogleTaskList, Task } from '../types'
import { mockTasks } from '../data/demo'
import { validTasks } from '../services/validation'
import { taskService } from '../services/taskService'
import { googleTasksService } from '../services/googleTasksService'
import { useGoogleConnection } from './useGoogleConnection'
import { usePersistentState } from './usePersistentState'

type TasksByList = Record<string, Task[]>
type TaskSnapshots = Record<string, string[]>

const validString = (value: unknown): value is string => typeof value === 'string'
const validStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
const validSnapshots = (value: unknown): value is TaskSnapshots =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.values(value).every(validStringArray)

export function useTasks() {
  const local = usePersistentState('tasks', () => mockTasks, validTasks)
  const selected = usePersistentState('google-task-list', () => '', validString)
  const snapshots = usePersistentState<TaskSnapshots>('google-task-snapshots', () => ({}), validSnapshots)
  const unread = usePersistentState<string[]>('google-task-unread', () => [], validStringArray)
  const google = useGoogleConnection()
  const [displayedListId, setDisplayedListId] = useState('')
  const [remoteState, setRemoteState] = useState<{
    revision: number
    lists: GoogleTaskList[]
    tasksByList: TasksByList
    notice?: string
  } | null>(null)
  const [remoteLoadFailed, setRemoteLoadFailed] = useState(false)
  const selectedRef = useRef(selected.value)
  const snapshotsRef = useRef(snapshots.value)
  const unreadRef = useRef(unread.value)
  const displayedRef = useRef(displayedListId)
  const setSelected = selected.setValue
  const setSnapshots = snapshots.setValue
  const setUnread = unread.setValue
  useEffect(() => {
    selectedRef.current = selected.value
    snapshotsRef.current = snapshots.value
    unreadRef.current = unread.value
    displayedRef.current = displayedListId
  }, [displayedListId, selected.value, snapshots.value, unread.value])

  const enabled = google.preferences.tasksEnabled
  const connected = google.tasksConnected
  const revision = google.revision

  const refresh = useCallback(async () => {
    if (!enabled || !connected || document.hidden) return
    try {
      const lists = await googleTasksService.getTaskLists()
      const results = await Promise.allSettled(
        lists.map(async (list) => ({ list, tasks: await googleTasksService.getTasks(list.id) })),
      )
      const successful = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      const failedCount = results.length - successful.length
      const preferredId = lists.some((list) => list.id === selectedRef.current)
        ? selectedRef.current
        : (lists[0]?.id ?? '')
      const activeId = lists.some((list) => list.id === displayedRef.current)
        ? displayedRef.current
        : preferredId
      if (preferredId !== selectedRef.current) setSelected(preferredId)
      if (activeId !== displayedRef.current) setDisplayedListId(activeId)

      const reconciled = taskService.reconcileRemoteUpdates(
        successful.map(({ list, tasks }) => ({ id: list.id, tasks })),
        snapshotsRef.current,
        unreadRef.current,
        activeId,
        lists.map((list) => list.id),
      )
      setSnapshots(reconciled.snapshots)
      setUnread(reconciled.unreadIds)
      setRemoteState((old) => {
        const tasksByList = { ...(old?.revision === revision ? old.tasksByList : {}) }
        for (const { list, tasks } of successful) tasksByList[list.id] = tasks
        return {
          revision,
          lists,
          tasksByList,
          notice: failedCount ? `${failedCount} ${failedCount === 1 ? 'lista não pôde' : 'listas não puderam'} ser sincronizada${failedCount === 1 ? '' : 's'}.` : undefined,
        }
      })
      setRemoteLoadFailed(false)
    } catch {
      setRemoteLoadFailed(true)
      setRemoteState((old) => old?.revision === revision
        ? { ...old, notice: 'Google Tasks temporariamente indisponível.' }
        : null)
    }
  }, [connected, enabled, revision, setSelected, setSnapshots, setUnread])

  useEffect(() => {
    if (!enabled || !connected) return
    const initial = window.setTimeout(() => void refresh(), 0)
    const interval = window.setInterval(() => void refresh(), 120000)
    const resume = () => {
      if (!document.hidden) void refresh()
    }
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(initial)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [connected, enabled, refresh])

  const remote = connected && remoteState?.revision === revision ? remoteState : null
  const selectedListId = remote?.lists.some((list) => list.id === displayedListId)
    ? displayedListId
    : (remote?.lists[0]?.id ?? '')
  const remoteTasks = selectedListId ? remote?.tasksByList[selectedListId] : undefined
  const source: DataSource = remote ? 'google' : 'local'
  const value = remote ? (remoteTasks ?? []) : taskService.normalizeLocal(local.value)
  const loading = Boolean(enabled && connected && !remoteLoadFailed && (!remote || remoteTasks === undefined))
  const notice = enabled && !connected
    ? 'Reconecte o Google Tasks para sincronizar.'
    : remote?.notice ?? (remoteLoadFailed ? 'Google Tasks temporariamente indisponível.' : undefined)

  const selectList = useCallback((id: string) => {
    setDisplayedListId(id)
    setSelected(id)
    setUnread((old) => old.filter((item) => item !== id))
  }, [setSelected, setUnread])

  const rotateList = useCallback((id: string) => setDisplayedListId(id), [])
  const markListSeen = useCallback((id: string) => {
    setUnread((old) => old.filter((item) => item !== id))
  }, [setUnread])

  const complete = useCallback(async (id: string, completed: boolean) => {
    if (remote && selectedListId) {
      const current = remote.tasksByList[selectedListId]?.find((task) => task.id === id)
      if (!current) return
      setRemoteState((old) => old?.revision === revision ? {
        ...old,
        tasksByList: {
          ...old.tasksByList,
          [selectedListId]: old.tasksByList[selectedListId].map((task) =>
            task.id === id ? { ...task, completed } : task),
        },
      } : old)
      try {
        const updated = await googleTasksService.setCompleted(current, completed)
        setRemoteState((old) => old?.revision === revision ? {
          ...old,
          tasksByList: {
            ...old.tasksByList,
            [selectedListId]: old.tasksByList[selectedListId].map((task) =>
              task.id === id ? updated : task),
          },
        } : old)
      } catch {
        setRemoteState((old) => old?.revision === revision ? {
          ...old,
          notice: 'Não foi possível atualizar a tarefa no Google.',
          tasksByList: {
            ...old.tasksByList,
            [selectedListId]: old.tasksByList[selectedListId].map((task) =>
              task.id === id ? current : task),
          },
        } : old)
      }
      return
    }
    local.setValue((old) => taskService.setCompleted(old, id, completed))
  }, [local, remote, revision, selectedListId])

  const update = useCallback(async (
    id: string,
    changes: { title: string; due?: string },
  ): Promise<Task | undefined> => {
    const title = changes.title.trim()
    if (!title) throw new Error('Informe um título para a tarefa.')
    if (remote && selectedListId) {
      const current = remote.tasksByList[selectedListId]?.find((task) => task.id === id)
      if (!current) return undefined
      const optimistic = { ...current, title, due: changes.due || undefined }
      setRemoteState((old) => old?.revision === revision ? {
        ...old,
        notice: undefined,
        tasksByList: {
          ...old.tasksByList,
          [selectedListId]: old.tasksByList[selectedListId].map((task) =>
            task.id === id ? optimistic : task),
        },
      } : old)
      try {
        const updated = await googleTasksService.updateTask(current, {
          title,
          due: changes.due || null,
        })
        setRemoteState((old) => old?.revision === revision ? {
          ...old,
          tasksByList: {
            ...old.tasksByList,
            [selectedListId]: old.tasksByList[selectedListId].map((task) =>
              task.id === id ? updated : task),
          },
        } : old)
        return updated
      } catch (error) {
        setRemoteState((old) => old?.revision === revision ? {
          ...old,
          notice: 'Não foi possível editar a tarefa no Google.',
          tasksByList: {
            ...old.tasksByList,
            [selectedListId]: old.tasksByList[selectedListId].map((task) =>
              task.id === id ? current : task),
          },
        } : old)
        throw error
      }
    }
    let updated: Task | undefined
    local.setValue((old) => old.map((task) => {
      if (task.id !== id) return task
      updated = { ...task, title, due: changes.due || undefined }
      return updated
    }))
    return updated
  }, [local, remote, revision, selectedListId])

  const create = useCallback(async (title: string, due?: string): Promise<Task> => {
    if (remote && selectedListId) {
      const created = await googleTasksService.createTask(title, due, selectedListId)
      setRemoteState((old) => old?.revision === revision ? {
        ...old,
        notice: undefined,
        tasksByList: {
          ...old.tasksByList,
          [selectedListId]: [created, ...(old.tasksByList[selectedListId] ?? [])],
        },
      } : old)
      setSnapshots((old) => ({
        ...old,
        [selectedListId]: [...new Set([...(old[selectedListId] ?? []), created.id])],
      }))
      return created
    }
    const created: Task = {
      id: crypto.randomUUID(), title, completed: false, priority: 'medium', due, source: 'local',
    }
    local.setValue((old) => [created, ...old])
    return created
  }, [local, remote, revision, selectedListId, setSnapshots])

  return {
    value,
    setValue: local.setValue,
    saved: local.saved && selected.saved && snapshots.saved && unread.saved,
    source,
    notice,
    loading,
    complete,
    update,
    create,
    lists: remote?.lists ?? [],
    tasksByList: remote?.tasksByList ?? {},
    selectedListId,
    selectList,
    rotateList,
    markListSeen,
    unreadListIds: unread.value,
    refresh,
  }
}
