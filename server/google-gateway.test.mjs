import { describe, expect, it, vi } from 'vitest'
import { createGoogleGateway } from './google-gateway.mjs'

describe('Google Tasks gateway', () => {
  it('cria na lista padrão e converte a data sem alterar o dia', async () => {
    const insert = vi.fn().mockResolvedValue({
      data: { id: 'new', title: 'Planejar', due: '2026-09-28T00:00:00.000Z' },
    })
    const auth = { marker: 'oauth-client' }
    const authManager = { client: vi.fn().mockResolvedValue(auth) }
    const googleApi = {
      tasks: vi.fn().mockReturnValue({ tasks: { insert } }),
    }
    const gateway = createGoogleGateway(authManager, googleApi)

    const result = await gateway.createTask({ title: 'Planejar', due: '2026-09-28', taskListId: 'work' })

    expect(googleApi.tasks).toHaveBeenCalledWith({ version: 'v1', auth })
    expect(insert).toHaveBeenCalledWith({
      tasklist: 'work',
      requestBody: { title: 'Planejar', due: '2026-09-28T00:00:00.000Z' },
    })
    expect(result.id).toBe('new')
  })

  it('omite a data quando ela não foi informada', async () => {
    const insert = vi.fn().mockResolvedValue({ data: { id: 'new', title: 'Planejar' } })
    const gateway = createGoogleGateway(
      { client: vi.fn().mockResolvedValue({}) },
      { tasks: vi.fn().mockReturnValue({ tasks: { insert } }) },
    )

    await gateway.createTask({ title: 'Planejar', taskListId: 'personal' })

    expect(insert).toHaveBeenCalledWith({
      tasklist: 'personal',
      requestBody: { title: 'Planejar' },
    })
  })

  it('edita título e remove a data na lista correta', async () => {
    const patch = vi.fn().mockResolvedValue({ data: { id: 'a', title: 'Atualizada' } })
    const gateway = createGoogleGateway(
      { client: vi.fn().mockResolvedValue({}) },
      { tasks: vi.fn().mockReturnValue({ tasks: { patch } }) },
    )
    await gateway.updateTask('a', { title: 'Atualizada', due: null }, 'work')
    expect(patch).toHaveBeenCalledWith({
      tasklist: 'work', task: 'a', requestBody: { title: 'Atualizada', due: null },
    })
  })

  it('lista todas as listas com paginação', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ data: { items: [{ id: 'a', title: 'Pessoal' }], nextPageToken: 'next' } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'b', title: 'Trabalho' }] } })
    const gateway = createGoogleGateway(
      { client: vi.fn().mockResolvedValue({}) },
      { tasks: vi.fn().mockReturnValue({ tasklists: { list } }) },
    )
    await expect(gateway.taskLists()).resolves.toHaveLength(2)
    expect(list).toHaveBeenLastCalledWith({ maxResults: 1000, pageToken: 'next' })
  })
})
