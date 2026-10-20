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
