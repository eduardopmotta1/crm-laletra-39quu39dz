import pb from '@/lib/pocketbase/client'
import type {
  StoreCategory,
  StoreBanner,
  StoreProduct,
  StorePriceCalculationParams,
  StorePriceCalculationResult,
} from '@/types/store'
import { calculateStoreProductPrice } from '@/lib/storeCalculator'

export const storeService = {
  /**
   * Busca lista pública de categorias ativas
   */
  async getCategories(): Promise<StoreCategory[]> {
    try {
      const res = await pb.send<{ success: boolean; data: StoreCategory[] }>(
        '/backend/v1/store/categories',
        { method: 'GET' },
      )
      return res.data || []
    } catch (err) {
      // Fallback para SDK PocketBase caso o hook não responda
      const records = await pb.collection('store_categories').getFullList<StoreCategory>({
        filter: 'is_active = true',
        sort: 'order_index,name',
      })
      return records
    }
  },

  /**
   * Busca lista pública de banners ativos
   */
  async getBanners(): Promise<StoreBanner[]> {
    try {
      const res = await pb.send<{ success: boolean; data: StoreBanner[] }>(
        '/backend/v1/store/banners',
        { method: 'GET' },
      )
      return res.data || []
    } catch (err) {
      const records = await pb.collection('store_banners').getFullList<StoreBanner>({
        filter: 'is_active = true',
        sort: 'order_index,created',
      })
      return records
    }
  },

  /**
   * Busca produtos públicos com filtros (categoria, busca, destaque)
   */
  async getProducts(params?: {
    category?: string
    featured?: boolean
    search?: string
  }): Promise<StoreProduct[]> {
    try {
      const searchParams = new URLSearchParams()
      if (params?.category) searchParams.set('category', params.category)
      if (params?.featured) searchParams.set('featured', 'true')
      if (params?.search) searchParams.set('search', params.search)

      const queryStr = searchParams.toString() ? `?${searchParams.toString()}` : ''
      const res = await pb.send<{ success: boolean; data: StoreProduct[] }>(
        `/backend/v1/store/products${queryStr}`,
        { method: 'GET' },
      )
      return res.data || []
    } catch (err) {
      let filter = 'published = true'
      if (params?.featured) filter += ' && featured = true'
      if (params?.search)
        filter += ` && (name ~ '${params.search}' || subtitle ~ '${params.search}')`

      const records = await pb.collection('store_products').getFullList<StoreProduct>({
        filter,
        sort: 'order_index,name',
        expand: 'category_id',
      })
      return records
    }
  },

  /**
   * Busca detalhes de um produto público por seo_slug
   */
  async getProductBySlug(
    slug: string,
  ): Promise<{ product: StoreProduct; related: StoreProduct[] }> {
    try {
      const res = await pb.send<{
        success: boolean
        data: StoreProduct
        related: StoreProduct[]
      }>(`/backend/v1/store/product/${encodeURIComponent(slug)}`, { method: 'GET' })

      return {
        product: res.data,
        related: res.related || [],
      }
    } catch (err) {
      const record = await pb
        .collection('store_products')
        .getFirstListItem<StoreProduct>(`seo_slug = "${slug}" && published = true`, {
          expand: 'category_id',
        })
      return {
        product: record,
        related: [],
      }
    }
  },

  /**
   * Cálculo de preço (chama endpoint server-side /backend/v1/store/calculate-price, com fallback local client-side)
   */
  async calculatePrice(params: StorePriceCalculationParams): Promise<StorePriceCalculationResult> {
    if (params.product_id) {
      try {
        const optionValues = params.selected_options ? Object.values(params.selected_options) : []
        const res = await pb.send<StorePriceCalculationResult>(
          '/backend/v1/store/calculate-price',
          {
            method: 'POST',
            body: {
              product_id: params.product_id,
              quantity: params.quantity,
              width: params.width,
              height: params.height,
              option_value_ids: optionValues,
              finishing_ids: params.selected_finishings || [],
            },
          },
        )
        return res
      } catch (err) {
        console.warn('Fallback para cálculo de preço local da loja:', err)
      }
    }

    return calculateStoreProductPrice(params)
  },

  // ==========================================
  // OPERAÇÕES ADMINISTRATIVAS (Requer Login CRM)
  // ==========================================
  async adminGetAllCategories(): Promise<StoreCategory[]> {
    return await pb.collection('store_categories').getFullList<StoreCategory>({
      sort: 'order_index,name',
    })
  },

  async adminCreateCategory(data: Partial<StoreCategory> | FormData): Promise<StoreCategory> {
    return await pb.collection('store_categories').create<StoreCategory>(data)
  },

  async adminUpdateCategory(
    id: string,
    data: Partial<StoreCategory> | FormData,
  ): Promise<StoreCategory> {
    return await pb.collection('store_categories').update<StoreCategory>(id, data)
  },

  async adminDeleteCategory(id: string): Promise<boolean> {
    return await pb.collection('store_categories').delete(id)
  },

  async adminGetAllProducts(): Promise<StoreProduct[]> {
    return await pb.collection('store_products').getFullList<StoreProduct>({
      sort: 'order_index,-created',
      expand: 'category_id,quote_product_id',
    })
  },

  async adminCreateProduct(data: Partial<StoreProduct> | FormData): Promise<StoreProduct> {
    return await pb.collection('store_products').create<StoreProduct>(data)
  },

  async adminUpdateProduct(
    id: string,
    data: Partial<StoreProduct> | FormData,
  ): Promise<StoreProduct> {
    return await pb.collection('store_products').update<StoreProduct>(id, data)
  },

  async adminDeleteProduct(id: string): Promise<boolean> {
    return await pb.collection('store_products').delete(id)
  },

  async adminGetAllBanners(): Promise<StoreBanner[]> {
    return await pb.collection('store_banners').getFullList<StoreBanner>({
      sort: 'order_index,created',
    })
  },

  async adminCreateBanner(data: Partial<StoreBanner> | FormData): Promise<StoreBanner> {
    return await pb.collection('store_banners').create<StoreBanner>(data)
  },

  async adminUpdateBanner(id: string, data: Partial<StoreBanner> | FormData): Promise<StoreBanner> {
    return await pb.collection('store_banners').update<StoreBanner>(id, data)
  },

  async adminDeleteBanner(id: string): Promise<boolean> {
    return await pb.collection('store_banners').delete(id)
  },
}
