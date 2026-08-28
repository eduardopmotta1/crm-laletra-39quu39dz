import pb from '@/lib/pocketbase/client'
import type { QuoteProduct } from '@/types/quotes'

export const productsService = {
  async getAll(filter?: string, sort = 'name'): Promise<QuoteProduct[]> {
    try {
      return await pb.collection('quote_products').getFullList<QuoteProduct>({
        filter,
        sort,
        expand: 'main_material_id,additionals',
      })
    } catch (err) {
      console.error('Error fetching products:', err)
      return []
    }
  },

  async getActive(): Promise<QuoteProduct[]> {
    return this.getAll('is_active = true', 'name')
  },

  async getById(id: string): Promise<QuoteProduct | null> {
    try {
      return await pb.collection('quote_products').getOne<QuoteProduct>(id, {
        expand: 'main_material_id,additionals',
      })
    } catch (err) {
      console.error(`Error fetching product ${id}:`, err)
      return null
    }
  },

  async getCategories(): Promise<string[]> {
    const list = await this.getAll()
    const categories = Array.from(new Set(list.map((p) => p.category).filter(Boolean))) as string[]
    return categories.sort()
  },

  async create(data: FormData | Partial<QuoteProduct>): Promise<QuoteProduct> {
    const record = await pb.collection('quote_products').create<QuoteProduct>(data as any, {
      expand: 'main_material_id,additionals',
    })
    return record
  },

  async update(id: string, data: FormData | Partial<QuoteProduct>): Promise<QuoteProduct> {
    const record = await pb.collection('quote_products').update<QuoteProduct>(id, data as any, {
      expand: 'main_material_id,additionals',
    })
    return record
  },

  async setActiveStatus(id: string, is_active: boolean): Promise<QuoteProduct> {
    return this.update(id, { is_active })
  },

  async deactivate(id: string): Promise<QuoteProduct> {
    return this.setActiveStatus(id, false)
  },

  async reactivate(id: string): Promise<QuoteProduct> {
    return this.setActiveStatus(id, true)
  },

  getImageUrl(product: QuoteProduct, fileName?: string): string {
    const targetFile = fileName || product.main_image
    if (!targetFile) return ''
    return pb.files.getURL(product, targetFile)
  },
}
