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
    const sanitized = { ...data }
    if (typeof sanitized.due_date === 'string' && sanitized.due_date.includes('T')) {
      sanitized.due_date = sanitized.due_date.split('T')[0]
    }

    // When creating a task for a client, if there's an active attendance and no attendance_id set, set attendance_id
    if (!sanitized.attendance_id && sanitized.client_id) {
      try {
        const activeAtts = await pb.collection('attendances').getList(1, 1, {
          filter: `client_id = "${sanitized.client_id}" && is_archived != true`,
          sort: '-created',
          requestKey: null,
        })
        if (activeAtts.items.length > 0) {
          sanitized.attendance_id = activeAtts.items[0].id
        }
      } catch (attErr) {
        console.error('Error attaching active attendance to task:', attErr)
      }
    }

    return await pb.collection('tasks').create<Task>(sanitized)
  },

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const sanitized = { ...data }
    if (typeof sanitized.due_date === 'string' && sanitized.due_date.includes('T')) {
      sanitized.due_date = sanitized.due_date.split('T')[0]
    }
    return await pb.collection('tasks').update<Task>(id, sanitized)
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
