import pb from '@/lib/pocketbase/client'
import type { QuoteMaterial } from '@/types/quotes'

export const materialsService = {
  async getAll(filter?: string, sort = 'name'): Promise<QuoteMaterial[]> {
    try {
      const records = await pb.collection('quote_materials').getFullList<QuoteMaterial>({
        filter,
        sort,
      })
      return records
    } catch (err) {
      console.error('Error fetching materials:', err)
      return []
    }
  },

  async getActive(): Promise<QuoteMaterial[]> {
    return this.getAll('is_active = true', 'name')
  },

  async getById(id: string): Promise<QuoteMaterial | null> {
    try {
      return await pb.collection('quote_materials').getOne<QuoteMaterial>(id)
    } catch (err) {
      console.error(`Error fetching material ${id}:`, err)
      return null
    }
  },

  async getCategories(): Promise<string[]> {
    const list = await this.getAll()
    const categories = Array.from(new Set(list.map((m) => m.category).filter(Boolean))) as string[]
    return categories.sort()
  },

  async create(data: Partial<QuoteMaterial>): Promise<QuoteMaterial> {
    const record = await pb.collection('quote_materials').create<QuoteMaterial>({
      ...data,
      is_active: data.is_active !== undefined ? data.is_active : true,
      cost_price: Number(data.cost_price || 0),
      sale_price: Number(data.sale_price || 0),
      min_price: Number(data.min_price || 0),
    })
    return record
  },

  async update(id: string, data: Partial<QuoteMaterial>): Promise<QuoteMaterial> {
    const payload: any = { ...data }
    if (payload.cost_price !== undefined) payload.cost_price = Number(payload.cost_price)
    if (payload.sale_price !== undefined) payload.sale_price = Number(payload.sale_price)
    if (payload.min_price !== undefined) payload.min_price = Number(payload.min_price)

    const record = await pb.collection('quote_materials').update<QuoteMaterial>(id, payload)
    return record
  },

  async setActiveStatus(id: string, is_active: boolean): Promise<QuoteMaterial> {
    return this.update(id, { is_active })
  },

  // Soft delete / Logical deactivation to prevent breaking references
  async deactivate(id: string): Promise<QuoteMaterial> {
    return this.setActiveStatus(id, false)
  },

  async reactivate(id: string): Promise<QuoteMaterial> {
    return this.setActiveStatus(id, true)
  },
}
