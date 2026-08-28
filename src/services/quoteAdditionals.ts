import pb from '@/lib/pocketbase/client'
import type { QuoteAdditional } from '@/types/quotes'

export const additionalsService = {
  async getAll(filter?: string, sort = 'name'): Promise<QuoteAdditional[]> {
    try {
      return await pb.collection('quote_additionals').getFullList<QuoteAdditional>({
        filter,
        sort,
      })
    } catch (err) {
      console.error('Error fetching additionals:', err)
      return []
    }
  },

  async getActive(): Promise<QuoteAdditional[]> {
    return this.getAll('is_active = true', 'name')
  },

  async getById(id: string): Promise<QuoteAdditional | null> {
    try {
      return await pb.collection('quote_additionals').getOne<QuoteAdditional>(id)
    } catch (err) {
      console.error(`Error fetching additional ${id}:`, err)
      return null
    }
  },

  async create(data: Partial<QuoteAdditional>): Promise<QuoteAdditional> {
    const record = await pb.collection('quote_additionals').create<QuoteAdditional>({
      ...data,
      is_active: data.is_active !== undefined ? data.is_active : true,
      cost_price: Number(data.cost_price || 0),
      sale_price: Number(data.sale_price || 0),
      min_price: Number(data.min_price || 0),
    })
    return record
  },

  async update(id: string, data: Partial<QuoteAdditional>): Promise<QuoteAdditional> {
    const payload: any = { ...data }
    if (payload.cost_price !== undefined) payload.cost_price = Number(payload.cost_price)
    if (payload.sale_price !== undefined) payload.sale_price = Number(payload.sale_price)
    if (payload.min_price !== undefined) payload.min_price = Number(payload.min_price)

    return await pb.collection('quote_additionals').update<QuoteAdditional>(id, payload)
  },

  async setActiveStatus(id: string, is_active: boolean): Promise<QuoteAdditional> {
    return this.update(id, { is_active })
  },
}
