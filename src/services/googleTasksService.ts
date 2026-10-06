import type { GoogleTaskList, Task } from '../types'
import { googleFetch } from './googleApiService'

interface GoogleTask { id?: string; title?: string; status?: 'needsAction' | 'completed'; due?: string; deleted?: boolean }
interface GoogleTaskResponse { items?: GoogleTask[] }
interface GoogleTaskListsResponse { items?: GoogleTaskList[] }

function normalize(item: GoogleTask, taskListId: string): Task | null {
  if (!item.id || item.deleted) return null
  return { id: `google-task:${item.id}`, title: item.title?.trim() || 'Sem título', completed: item.status === 'completed', due: item.due?.slice(0, 10), source: 'google', taskListId }
}

export const googleTasksService = {
  async getTaskLists(): Promise<GoogleTaskList[]> {
    const data = await googleFetch<GoogleTaskListsResponse>('/api/task-lists')
    return (data.items ?? []).filter((item) => item.id && item.title)
  },
  async getTasks(taskListId: string): Promise<Task[]> {
    const tasks: Task[] = []
    const query = new URLSearchParams({ taskListId })
    const data = await googleFetch<GoogleTaskResponse>(`/api/tasks?${query}`)
    for (const item of data.items ?? []) {
      const task = normalize(item, taskListId)
      if (task) tasks.push(task)
    }
    return tasks
  },
  async updateTask(
    task: Task,
    changes: { title?: string; due?: string | null; completed?: boolean },
  ): Promise<Task> {
    if (!task.taskListId) throw new Error('A tarefa não possui uma lista do Google.')
    const id = task.id.replace(/^google-task:/, '')
    const result = await googleFetch<GoogleTask>(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...changes, taskListId: task.taskListId }),
    })
    return normalize(result, task.taskListId) ?? {
      ...task,
      ...changes,
      due: changes.due === null ? undefined : (changes.due ?? task.due),
    }
  },
  async setCompleted(task: Task, completed: boolean): Promise<Task> {
    return this.updateTask(task, { completed })
  },
  async createTask(title: string, due: string | undefined, taskListId: string): Promise<Task> {
    const result = await googleFetch<GoogleTask>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, due: due || null, taskListId }),
    })
    const task = normalize(result, taskListId)
    if (!task) throw new Error('O Google retornou uma tarefa inválida.')
    return task
  },
}
