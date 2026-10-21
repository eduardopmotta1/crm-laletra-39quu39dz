import pb from '@/lib/pocketbase/client'
import type {
  StoreCategory,
  StoreBanner,
  StoreProduct,
  StorePriceCalculationParams,
  StorePriceCalculationResult,
  StoreAllSettings,
} from '@/types/store'
import { calculateStoreProductPrice } from '@/lib/storeCalculator'
import { DEFAULT_STORE_FOOTER_SETTINGS, mergeFooterSettings } from '@/lib/storeFooterDefaults'

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
      if (res && res.data) {
        return res.data
      }
    } catch (err) {
      // Fallback para SDK PocketBase caso o hook não responda
    }

    try {
      const records = await pb.collection('store_categories').getFullList<StoreCategory>({
        filter: 'is_active = true',
        sort: 'order_index,name',
      })
      return records.map((r) => ({
        ...r,
        image_url: r.image ? pb.files.getURL(r, r.image) : r.image_url || null,
      }))
    } catch {
      return []
    }
  },

  /**
   * Busca as configurações consolidadas da loja pública
   */
  async getSettings(): Promise<StoreAllSettings> {
    try {
      const res = await pb.send<{ success: boolean; data: any }>('/backend/v1/store/settings', {
        method: 'GET',
      })
      if (res && res.data) {
        const data = res.data
        return {
          ...data,
          footer: mergeFooterSettings(data.footer),
        }
      }
    } catch (err) {
      // fallback
    }

    try {
      const records = await pb.collection('store_settings').getFullList<any>()
      const result: any = {
        appearance: {
          primary_color: '#059669',
          secondary_color: '#0f172a',
          button_color: '#059669',
          header_color: '#ffffff',
          bg_color: '#f8fafc',
          text_color: '#0f172a',
          logo_url: '',
          favicon_url: '',
        },
        commercial_info: {
          whatsapp: '+55 (21) 2391-9112',
          phone: '+55 (21) 2391-9112',
          email: 'contato@laletragrafica.com.br',
          business_hours: 'Seg a Sex das 08h às 18h',
          address: 'Av. Marechal Floriano, 19, Sala 301 - Centro, Rio de Janeiro - RJ, 20080-003',
          footer_text:
            'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
          copyright_text: 'Gráfica LaLetra. Todos os direitos reservados.',
        },
        home_layout: {
          show_hero_banners: true,
          show_advantages_bar: true,
          show_categories_grid: true,
          show_featured_products: true,
          show_custom_quote_cta: true,
          hero_title: '',
          hero_subtitle: '',
          featured_product_ids: [],
          custom_quote_title: 'Precisa de um projeto gráfico personalizado ou grandes tiragens?',
          custom_quote_subtitle:
            'Nossa equipe comercial elabora cotações exclusivas com descontos por volume, corte especial e visitas técnicas para comunicação visual corporativa.',
        },
        footer: { ...DEFAULT_STORE_FOOTER_SETTINGS },
      }
      for (const rec of records) {
        const val =
          typeof rec.setting_value === 'string' ? JSON.parse(rec.setting_value) : rec.setting_value
        if (rec.setting_key === 'footer') {
          result.footer = mergeFooterSettings(val)
        } else if (result[rec.setting_key]) {
          result[rec.setting_key] = { ...result[rec.setting_key], ...val }
        }
      }
      return result
    } catch {
      return {
        appearance: {
          primary_color: '#059669',
          secondary_color: '#0f172a',
          button_color: '#059669',
          header_color: '#ffffff',
          bg_color: '#f8fafc',
          text_color: '#0f172a',
          logo_url: '',
          favicon_url: '',
        },
        commercial_info: {
          whatsapp: '+55 (21) 2391-9112',
          phone: '+55 (21) 2391-9112',
          email: 'contato@laletragrafica.com.br',
          business_hours: 'Seg a Sex das 08h às 18h',
          address: 'Av. Marechal Floriano, 19, Sala 301 - Centro, Rio de Janeiro - RJ, 20080-003',
          footer_text:
            'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
          copyright_text: 'Gráfica LaLetra. Todos os direitos reservados.',
        },
        home_layout: {
          show_hero_banners: true,
          show_advantages_bar: true,
          show_categories_grid: true,
          show_featured_products: true,
          show_custom_quote_cta: true,
          hero_title: '',
          hero_subtitle: '',
          featured_product_ids: [],
          custom_quote_title: 'Precisa de um projeto gráfico personalizado ou grandes tiragens?',
          custom_quote_subtitle:
            'Nossa equipe comercial elabora cotações exclusivas com descontos por volume, corte especial e visitas técnicas para comunicação visual corporativa.',
        },
        footer: { ...DEFAULT_STORE_FOOTER_SETTINGS },
      }
    }
  },

  /**
   * Salva configuração administrativa no backend
   */
  async adminSaveSetting(settingKey: string, settingValue: any): Promise<boolean> {
    try {
      await pb.send('/backend/v1/store/admin/settings', {
        method: 'POST',
        body: {
          setting_key: settingKey,
          setting_value: settingValue,
        },
      })
      return true
    } catch {
      // Fallback direto via SDK na coleção store_settings
      try {
        const existing = await pb
          .collection('store_settings')
          .getFirstListItem(`setting_key = "${settingKey}"`)
        await pb.collection('store_settings').update(existing.id, {
          setting_value: settingValue,
        })
      } catch {
        await pb.collection('store_settings').create({
          setting_key: settingKey,
          setting_value: settingValue,
        })
      }
      return true
    }
  },

  /**
   * Upload direto de ativo comercial (logo, favicon, banner, foto produto)
   */
  async uploadMedia(
    file: File,
    purpose: 'logo' | 'favicon' | 'banner' | 'product' | 'general' = 'general',
  ): Promise<{
    url: string
    id: string
    name: string
  }> {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ]
    if (!allowed.includes(file.type)) {
      throw new Error('Formato inválido. Apenas JPG, PNG, WebP e ICO são permitidos.')
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Tamanho máximo permitido é 10MB.')
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', file.name)
    formData.append('purpose', purpose)
    formData.append('original_name', file.name)
    formData.append('file_size', String(file.size))
    formData.append('file_type', file.type)

    const record = await pb.collection('store_media_uploads').create<any>(formData)
    const fileUrl = pb.files.getURL(record, record.file)

    return {
      url: fileUrl,
      id: record.id,
      name: file.name,
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
