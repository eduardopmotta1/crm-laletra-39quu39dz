import pb from '@/lib/pocketbase/client'
import type { Quote } from '@/types/quotes'

export const quotesService = {
  async getAll(filter?: string, sort = '-created'): Promise<Quote[]> {
    try {
      return await pb.collection('quotes').getFullList<Quote>({
        filter,
        sort,
        expand: 'client_id,user_id',
      })
    } catch (err) {
      console.error('Error fetching quotes:', err)
      return []
    }
  },

  async getById(id: string): Promise<Quote | null> {
    try {
      return await pb.collection('quotes').getOne<Quote>(id, {
        expand: 'client_id,user_id',
      })
    } catch (err) {
      console.error(`Error fetching quote ${id}:`, err)
      return null
    }
  },

  async generateNextCode(): Promise<string> {
    try {
      const year = new Date().getFullYear()
      const total = await pb.collection('quotes').getList(1, 1, {
        sort: '-created',
      })
      const nextNum = (total.totalItems + 1).toString().padStart(4, '0')
      return `ORC-${year}-${nextNum}`
    } catch (err) {
      const random = Math.floor(1000 + Math.random() * 9000)
      return `ORC-${new Date().getFullYear()}-${random}`
    }
  },

  async create(data: Partial<Quote>): Promise<Quote> {
    const code = data.code || (await this.generateNextCode())
    return await pb.collection('quotes').create<Quote>(
      {
        ...data,
        code,
        status: data.status || 'rascunho',
      },
      {
        expand: 'client_id,user_id',
      },
    )
  },

  async update(id: string, data: Partial<Quote>): Promise<Quote> {
    return await pb.collection('quotes').update<Quote>(id, data, {
      expand: 'client_id,user_id',
    })
  },

  async updateStatus(id: string, status: Quote['status']): Promise<Quote> {
    return this.update(id, { status })
  },
}
