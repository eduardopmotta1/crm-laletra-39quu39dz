export type PricingType = 'fixed' | 'quantity_tiers' | 'square_meter'

export interface StorePriceTier {
  quantity: number
  price: number
  label?: string
}

export interface StoreOptionValue {
  id: string
  label: string
  price_modifier: number
}

export interface StoreProductOption {
  name: string
  values: StoreOptionValue[]
}

export interface StoreProductFinishing {
  id: string
  name: string
  price: number
  description?: string
}

export interface StoreCategory {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  image?: string
  image_url?: string | null
  order_index?: number
  is_active?: boolean
  created?: string
  updated?: string
}

export interface StoreBanner {
  id: string
  title: string
  subtitle?: string
  cta_text?: string
  link_url?: string
  image?: string
  image_url?: string | null
  badge?: string
  bg_color?: string
  order_index?: number
  is_active?: boolean
  created?: string
  updated?: string
}

export interface StoreProduct {
  id: string
  name: string
  seo_slug: string
  subtitle?: string
  description_public?: string
  category_id?: string
  category_slug?: string
  category_name?: string
  category?: {
    id: string
    name: string
    slug: string
  } | null
  pricing_type: PricingType
  store_price?: number
  price_tiers?: StorePriceTier[]
  sqm_min_area?: number
  sqm_base_price?: number
  options?: StoreProductOption[]
  finishings?: StoreProductFinishing[]
  lead_time_days?: number
  quote_only?: boolean
  published?: boolean
  featured?: boolean
  order_index?: number
  badge_label?: string | null
  unit_label?: string | null
  main_image?: string
  main_image_url?: string | null
  gallery_images?: string[]
  gallery_image_urls?: string[]
  quote_product_id?: string
  created?: string
  updated?: string
}

export interface StorePriceCalculationParams {
  product_id?: string
  product?: StoreProduct
  pricing_type?: PricingType
  quantity: number
  width?: number
  height?: number
  selected_options?: Record<string, string> // optionName -> optionValueId
  selected_finishings?: string[] // array de finishing ids
}

export interface StorePriceCalculationResult {
  success: boolean
  quote_only?: boolean
  message?: string
  product_id?: string
  pricing_type: PricingType
  quantity: number
  area_m2?: number | null
  base_total: number
  options_total: number
  finishings_total: number
  total: number
  unit_price: number
  lead_time_days?: number
}

// -------------------------------------------------------------
// FASE 2: Tipos para Carrinho, Checkout, Comprador e Pedidos Loja
// -------------------------------------------------------------

export type StoreArtOption = 'send_ready' | 'send_later' | 'request_creation'

export interface StoreCartItem {
  cart_item_id: string
  product_id: string
  product_name: string
  product_slug: string
  pricing_type: PricingType
  quantity: number
  width?: number | null
  height?: number | null
  area_m2?: number | null
  selected_options: Record<string, string>
  selected_options_labels?: Record<string, string>
  selected_finishings: string[]
  selected_finishings_labels?: string[]
  unit_price: number
  total_price: number
  lead_time_days?: number
  image_url?: string | null
  // Opção de arte selecionada pelo comprador
  art_option?: StoreArtOption
  art_creation_fee?: number
  art_notes?: string
  art_file_name?: string
}

export interface StoreArtPricingConfig {
  base_creation_fee: number
  description: string
  free_for_orders_above?: number
  is_active: boolean
  lead_time_extra_days: number
}

export interface StoreCartValidationResponse {
  success: boolean
  items: Array<{
    product_id: string
    product_name: string
    pricing_type: string
    quantity: number
    width: number | null
    height: number | null
    area_m2: number | null
    selected_options: Record<string, string>
    selected_finishings: string[]
    unit_price: number
    total_price: number
    lead_time_days: number
  }>
  subtotal: number
  shipping_fee: number
  shipping_note: string
  total_amount: number
  estimated_days: number
  error?: string
}

export interface StoreCustomerProfile {
  id: string
  name: string
  email: string
  phone: string
  person_type: 'pf' | 'pj'
  document_cpf_cnpj?: string
  trade_name?: string
  addresses?: StoreAddress[]
}

export interface StoreAddress {
  id?: string
  label?: string
  zip_code: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  is_default?: boolean
}

export interface StoreOrderSummary {
  id: string
  order_number: string
  customer_name: string
  customer_email: string
  customer_phone: string
  delivery_method: 'pickup' | 'delivery'
  shipping_address?: StoreAddress | null
  subtotal: number
  shipping_fee: number
  total_amount: number
  payment_status: 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded'
  payment_method?: 'pix' | 'credit_card' | 'bank_slip' | 'billed_invoice'
  art_status: 'pending_upload' | 'uploaded' | 'under_review' | 'approved' | 'rejected'
  production_status:
    | 'waiting_release'
    | 'released_to_production'
    | 'in_production'
    | 'ready'
    | 'delivered'
  estimated_delivery_date?: string
  created: string
  items?: Array<{
    id: string
    product_name: string
    quantity: number
    width?: number | null
    height?: number | null
    unit_price: number
    total_price: number
    options?: any
    finishings?: any
    art_notes?: string
    art_option?: StoreArtOption
    art_creation_fee?: number
  }>
  requires_art_approval?: boolean
  arts?: Array<{
    id: string
    original_filename: string
    status: string
    rejection_reason?: string
    created: string
  }>
  payments?: Array<{
    id: string
    method: string
    status: string
    amount: number
    pix_qr_code?: string
  }>
}
