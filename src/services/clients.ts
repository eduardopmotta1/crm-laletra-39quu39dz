import pb from '@/lib/pocketbase/client'
import type { Client, KanbanStage } from '@/types/crm'

export const clientsService = {
  async getAll(filter?: string, sort = '-last_message_at'): Promise<Client[]> {
    try {
      const records = await pb.collection('clients').getFullList<Client>({
        filter,
        sort,
        expand: 'assigned_to',
        requestKey: null,
      })
      return records
    } catch (error) {
      console.error('Error fetching clients:', error)
      return []
    }
  },

  async getById(id: string): Promise<Client | null> {
    try {
      return await pb.collection('clients').getOne<Client>(id, {
        expand: 'assigned_to',
      })
    } catch (error) {
      console.error(`Error fetching client ${id}:`, error)
      return null
    }
  },

  async create(data: Partial<Client>): Promise<Client> {
    return await pb.collection('clients').create<Client>(data)
  },

  async update(id: string, data: Partial<Client>): Promise<Client> {
    return await pb.collection('clients').update<Client>(id, data)
  },

  async updateStage(id: string, stage: KanbanStage): Promise<Client> {
    return await pb.collection('clients').update<Client>(id, { stage })
  },

  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('clients').delete(id)
      return true
    } catch (error) {
      console.error(`Error deleting client ${id}:`, error)
      return false
    }
  },
}
