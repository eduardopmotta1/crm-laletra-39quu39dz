import pb from '@/lib/pocketbase/client'
import type { Task } from '@/types/crm'

export const tasksService = {
  async getAll(filter?: string, sort = 'due_date'): Promise<Task[]> {
    try {
      return await pb.collection('tasks').getFullList<Task>({
        filter,
        sort,
        expand: 'client_id,assigned_to',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching tasks:', error)
      return []
    }
  },

  async getByClientId(clientId: string): Promise<Task[]> {
    try {
      return await pb.collection('tasks').getFullList<Task>({
        filter: `client_id = "${clientId}"`,
        sort: 'due_date',
        expand: 'assigned_to',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching tasks for client ${clientId}:`, error)
      return []
    }
  },

  async create(data: Partial<Task>): Promise<Task> {
    return await pb.collection('tasks').create<Task>(data)
  },

  async update(id: string, data: Partial<Task>): Promise<Task> {
    return await pb.collection('tasks').update<Task>(id, data)
  },

  async toggleStatus(
    id: string,
    currentStatus: 'pendente' | 'concluida' | 'cancelada',
  ): Promise<Task> {
    const nextStatus = currentStatus === 'concluida' ? 'pendente' : 'concluida'
    return await pb.collection('tasks').update<Task>(id, { status: nextStatus })
  },

  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('tasks').delete(id)
      return true
    } catch (error) {
      console.error(`Error deleting task ${id}:`, error)
      return false
    }
  },
}
