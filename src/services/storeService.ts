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

  // ==========================================
  // FASE 2/3: Métodos de Carrinho, Comprador, Arte e Checkout
  // ==========================================

  /**
   * Consulta pública de configuração de precificação de criação de arte
   */
  async getArtCreationPricing(): Promise<{
    base_creation_fee: number
    description: string
    free_for_orders_above?: number
    is_active: boolean
    lead_time_extra_days: number
  }> {
    try {
      const res = await pb.send<{
        success: boolean
        pricing: {
          base_creation_fee: number
          description: string
          free_for_orders_above?: number
          is_active: boolean
          lead_time_extra_days: number
        }
      }>('/backend/v1/store/art-creation-pricing', { method: 'GET' })
      if (res && res.success && res.pricing) {
        return res.pricing
      }
    } catch (err) {
      console.warn('Erro ao consultar /backend/v1/store/art-creation-pricing:', err)
    }

    return {
      base_creation_fee: 45.0,
      description: 'Criação profissional de arte pela equipe LaLetra',
      free_for_orders_above: 500.0,
      is_active: true,
      lead_time_extra_days: 2,
    }
  },

  async validateCartOnServer(
    items: Array<{
      product_id: string
      quantity: number
      width?: number | null
      height?: number | null
      selected_options?: Record<string, string>
      selected_finishings?: string[]
      art_option?: string
      art_notes?: string
    }>,
    deliveryMethod: 'pickup' | 'delivery' = 'pickup',
    shippingZip?: string,
  ): Promise<any> {
    return pb.send('/backend/v1/store/cart/validate', {
      method: 'POST',
      body: {
        items,
        delivery_method: deliveryMethod,
        shipping_zip: shippingZip,
      },
    })
  },

  async registerCustomer(data: {
    name: string
    email: string
    phone: string
    password: string
    person_type?: 'pf' | 'pj'
    document_cpf_cnpj?: string
    trade_name?: string
  }): Promise<{ success: boolean; token: string; customer: any }> {
    return pb.send('/backend/v1/store/customer/register', {
      method: 'POST',
      body: data,
    })
  },

  async loginCustomer(
    email: string,
    password: string,
  ): Promise<{ success: boolean; token: string; customer: any }> {
    return pb.send('/backend/v1/store/customer/login', {
      method: 'POST',
      body: { email, password },
    })
  },

  async getCustomerProfile(token: string): Promise<{ success: boolean; customer: any }> {
    return pb.send('/backend/v1/store/customer/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  },

  async saveCustomerAddress(token: string, address: any): Promise<any> {
    return pb.send('/backend/v1/store/customer/address', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: address,
    })
  },

  async deleteCustomerAddress(token: string, addressId: string): Promise<any> {
    return pb.send(`/backend/v1/store/customer/address/${encodeURIComponent(addressId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  },

  async getCustomerOrders(token: string): Promise<{ success: boolean; orders: any[] }> {
    return pb.send('/backend/v1/store/customer/orders', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  },

  async requestPasswordReset(
    email: string,
  ): Promise<{ success: boolean; message: string; reset_token?: string }> {
    return pb.send('/backend/v1/store/customer/forgot-password', {
      method: 'POST',
      body: { email },
    })
  },

  async resetPasswordWithToken(
    token: string,
    password: string,
  ): Promise<{ success: boolean; message: string }> {
    return pb.send('/backend/v1/store/customer/reset-password', {
      method: 'POST',
      body: { token, password },
    })
  },

  async checkoutOrder(
    payload: {
      client_request_id: string
      delivery_method: 'pickup' | 'delivery'
      payment_method: 'pix' | 'credit_card' | 'bank_slip' | 'billed_invoice'
      customer: {
        name: string
        email: string
        phone: string
        document?: string
      }
      shipping_address?: any
      items: Array<{
        product_id: string
        quantity: number
        width?: number | null
        height?: number | null
        selected_options?: Record<string, string>
        selected_finishings?: string[]
        art_option?: string
        art_notes?: string
      }>
      notes?: string
    },
    customerToken?: string | null,
  ): Promise<any> {
    const headers: Record<string, string> = {}
    if (customerToken) {
      headers.Authorization = `Bearer ${customerToken}`
    }
    return pb.send('/backend/v1/store/checkout', {
      method: 'POST',
      headers,
      body: payload,
    })
  },

  async getOrderByNumber(orderNumber: string): Promise<{ success: boolean; order: any }> {
    return pb.send(`/backend/v1/store/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'GET',
    })
  },

  async uploadOrderArt(orderNumber: string, file: File, customerNotes?: string): Promise<any> {
    const formData = new FormData()
    formData.append('art_file', file)
    if (customerNotes) {
      formData.append('customer_notes', customerNotes)
    }
    return pb.send(`/backend/v1/store/orders/${encodeURIComponent(orderNumber)}/upload-art`, {
      method: 'POST',
      body: formData,
    })
  },

  /**
   * Endpoint de aprovação ou solicitação de ajustes de arte pelo comprador (Fase 3 - migration 0115 / hook)
   */
  async approveOrAdjustArt(
    orderNumber: string,
    approved: boolean,
    feedback?: string,
  ): Promise<{ success: boolean; order_number: string; art_status: string; message: string }> {
    return pb.send(`/backend/v1/store/orders/${encodeURIComponent(orderNumber)}/art-approval`, {
      method: 'POST',
      body: {
        approved,
        feedback: feedback || '',
      },
    })
  },

  async requestOrderSupport(
    orderNumber: string,
    message: string,
    subject?: string,
    token?: string | null,
  ): Promise<{ success: boolean; message: string }> {
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    return pb.send(`/backend/v1/store/orders/${encodeURIComponent(orderNumber)}/support`, {
      method: 'POST',
      headers,
      body: {
        message,
        subject: subject || 'Dúvida sobre o pedido',
      },
    })
  },

  async simulateMercadoPagoWebhook(orderNumber: string, paymentId?: string): Promise<any> {
    return pb.send('/backend/v1/store/webhooks/mercadopago', {
      method: 'POST',
      body: {
        order_number: orderNumber,
        payment_id: paymentId || `MP-TEST-${Date.now()}`,
        status: 'approved',
      },
    })
  },

  // Métodos CRM para Pedidos da Loja
  async adminGetStoreOrders(filterStr?: string): Promise<any[]> {
    return await pb.collection('store_orders').getFullList({
      sort: '-created',
      filter: filterStr || '',
      expand: 'customer_id,production_order_id',
    })
  },

  async adminGetStoreOrderDetails(orderId: string): Promise<any> {
    const order = await pb.collection('store_orders').getOne(orderId, {
      expand: 'customer_id,production_order_id',
    })
    const items = await pb.collection('store_order_items').getFullList({
      filter: `order_id = "${orderId}"`,
      sort: 'created',
    })
    const arts = await pb.collection('store_art_uploads').getFullList({
      filter: `order_id = "${orderId}"`,
      sort: '-created',
    })
    const payments = await pb.collection('store_payments').getFullList({
      filter: `order_id = "${orderId}"`,
      sort: '-created',
    })
    return {
      order,
      items,
      arts,
      payments,
    }
  },

  async adminUpdateOrderStatus(
    orderId: string,
    data: {
      payment_status?: string
      art_status?: string
      production_status?: string
      human_intervention_needed?: boolean
      human_intervention_reason?: string
      notes?: string
    },
  ): Promise<any> {
    return await pb.collection('store_orders').update(orderId, data)
  },

  async adminReviewArt(
    artId: string,
    status: 'approved' | 'rejected',
    rejectionReason?: string,
  ): Promise<any> {
    return await pb.collection('store_art_uploads').update(artId, {
      status,
      rejection_reason: rejectionReason || '',
      reviewed_at: new Date().toISOString(),
    })
  },

  async adminVerifyLinkStoreCustomer(
    customerId: string,
    clientCrmId: string,
    verified: boolean,
  ): Promise<any> {
    return await pb.collection('store_customers').update(customerId, {
      linked_client_id: verified ? clientCrmId : null,
      crm_link_status: verified ? 'verified_linked' : 'rejected',
      crm_link_notes: verified
        ? `Vínculo com cliente CRM ${clientCrmId} confirmado manualmente por atendente.`
        : 'Vínculo rejeitado/desvinculado por atendente.',
    })
  },

  async adminReleaseOrderToProduction(orderId: string): Promise<any> {
    return await pb.send(
      `/backend/v1/crm/store/orders/${encodeURIComponent(orderId)}/release-to-production`,
      {
        method: 'POST',
      },
    )
  },
}
