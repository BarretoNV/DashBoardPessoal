import { google } from 'googleapis'

export function createGoogleGateway(authManager, googleApi = google) {
  return {
    async calendarEvents({ timeMin, timeMax, timeZone }) {
      const auth = await authManager.client()
      const calendar = googleApi.calendar({ version: 'v3', auth })
      const items = []
      let pageToken
      do {
        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin,
          timeMax,
          timeZone,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          showDeleted: false,
          pageToken,
        })
        items.push(...(response.data.items ?? []))
        pageToken = response.data.nextPageToken ?? undefined
      } while (pageToken)
      return items
    },

    async taskLists() {
      const auth = await authManager.client()
      const tasks = googleApi.tasks({ version: 'v1', auth })
      const items = []
      let pageToken
      do {
        const response = await tasks.tasklists.list({ maxResults: 1000, pageToken })
        items.push(...(response.data.items ?? []))
        pageToken = response.data.nextPageToken ?? undefined
      } while (pageToken)
      return items
    },

    async tasks(taskListId) {
      const auth = await authManager.client()
      const tasks = googleApi.tasks({ version: 'v1', auth })
      const items = []
      let pageToken
      do {
        const response = await tasks.tasks.list({
          tasklist: taskListId,
          maxResults: 100,
          showCompleted: true,
          showHidden: true,
          showDeleted: false,
          pageToken,
        })
        items.push(...(response.data.items ?? []))
        pageToken = response.data.nextPageToken ?? undefined
      } while (pageToken)
      return items
    },

    async createTask({ title, due, taskListId }) {
      const auth = await authManager.client()
      const tasks = googleApi.tasks({ version: 'v1', auth })
      const response = await tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: {
          title,
          ...(due ? { due: `${due}T00:00:00.000Z` } : {}),
        },
      })
      return response.data
    },

    async updateTask(id, changes, taskListId) {
      const auth = await authManager.client()
      const tasks = googleApi.tasks({ version: 'v1', auth })
      const requestBody = {
        ...(changes.title !== undefined ? { title: changes.title } : {}),
        ...(changes.due !== undefined
          ? { due: changes.due ? `${changes.due}T00:00:00.000Z` : null }
          : {}),
        ...(changes.completed !== undefined
          ? changes.completed
            ? { status: 'completed', completed: new Date().toISOString() }
            : { status: 'needsAction', completed: null }
          : {}),
      }
      const response = await tasks.tasks.patch({
        tasklist: taskListId,
        task: id,
        requestBody,
      })
      return response.data
    },
  }
}
