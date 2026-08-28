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

    // Se attendance_id NÃO foi informado mas client_id existe, NÃO usar '-created' para adivinhar.
    // SOMENTE vincular automaticamente se existir EXATAMENTE UM atendimento ativo (100% não ambíguo).
    // Se houver 0 ou mais de 1 atendimento ativo, NÃO vincular por adivinhação.
    if (!sanitized.attendance_id && sanitized.client_id) {
      try {
        const activeAtts = await pb.collection('attendances').getList(1, 2, {
          filter: `client_id = "${sanitized.client_id}" && is_archived != true`,
          requestKey: null,
        })
        if (activeAtts.totalItems === 1 && activeAtts.items.length === 1) {
          sanitized.attendance_id = activeAtts.items[0].id
        }
      } catch (attErr) {
        console.error('Error checking active attendance for task fallback:', attErr)
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
