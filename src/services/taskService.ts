import type { Task } from '../types'
const rank = { high: 0, medium: 1, low: 2 }
const compareTasks = (a: Task, b: Task) =>
  Number(a.completed) - Number(b.completed) ||
  Number(!a.due) - Number(!b.due) ||
  (a.due ?? '').localeCompare(b.due ?? '') ||
  rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']
export const taskService = {
  setCompleted(tasks: Task[], id: string, completed: boolean) {
    return tasks.map((task) => (task.id === id ? { ...task, completed } : task))
  },
  normalizeLocal(tasks: Task[]) {
    return tasks.map((task) => ({ ...task, source: 'local' as const }))
  },
  visible(tasks: Task[]) {
    return [...tasks].sort(compareTasks).slice(0, 5)
  },
  ordered(tasks: Task[]) {
    return [...tasks].sort(compareTasks)
  },
  reconcileRemoteUpdates(
    lists: Array<{ id: string; tasks: Task[] }>,
    snapshots: Record<string, string[]>,
    unreadIds: string[],
    activeId: string,
    availableIds = lists.map((list) => list.id),
  ) {
    const available = new Set(availableIds)
    const nextSnapshots = { ...snapshots }
    const nextUnread = new Set(unreadIds.filter((id) => available.has(id)))
    for (const list of lists) {
      const previousIds = snapshots[list.id]
      if (previousIds) {
        const previous = new Set(previousIds)
        if (list.tasks.some((task) => !task.completed && !previous.has(task.id)) && list.id !== activeId) {
          nextUnread.add(list.id)
        }
      }
      if (list.id === activeId) nextUnread.delete(list.id)
      nextSnapshots[list.id] = list.tasks.map((task) => task.id)
    }
    return { snapshots: nextSnapshots, unreadIds: [...nextUnread] }
  },
  nextRotatingList(
    lists: Array<{ id: string }>,
    tasksByList: Record<string, Task[]>,
    currentId: string,
    unreadIds: string[],
  ) {
    const eligible = lists.filter((list) =>
      (tasksByList[list.id] ?? []).some((task) => !task.completed),
    )
    if (eligible.length < 2) return undefined
    const unread = new Set(unreadIds)
    const unreadNext = eligible.find((list) => list.id !== currentId && unread.has(list.id))
    if (unreadNext) return unreadNext.id
    const currentIndex = eligible.findIndex((list) => list.id === currentId)
    return eligible[(currentIndex + 1 + eligible.length) % eligible.length].id
  },
}
