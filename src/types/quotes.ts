// Tipos para o Módulo de Orçamentos (CRM Laletra)

export type MaterialCalcUnit =
  | 'm2'
  | 'metro_linear'
  | 'unidade'
  | 'centimetro'
  | 'quilo'
  | 'valor_fixo'

export type AdditionalCalcUnit = 'unidade' | 'metro_linear' | 'm2' | 'valor_fixo'

export type ProductCalcRule = 'm2' | 'metro_linear' | 'unidade' | 'preco_fixo'

export type QuoteStatus =
  | 'rascunho'
  | 'enviado'
  | 'aprovado'
  | 'recusado'
  | 'expirado'
  | 'alteracao_solicitada'

export interface QuoteMaterial {
  id: string
  name: string
  description?: string
  category: string
  calc_unit: MaterialCalcUnit
  cost_price: number
  sale_price: number
  min_price: number
  is_active: boolean
  created: string
  updated: string
}

export interface QuoteAdditional {
  id: string
  name: string
  description?: string
  category?: string
  calc_unit: AdditionalCalcUnit
  cost_price: number
  sale_price: number
  min_price: number
  is_active: boolean
  created: string
  updated: string
}

export interface QuoteProduct {
  id: string
  name: string
  category: string
  description?: string
  main_image?: string
  gallery_images?: string[]
  main_material_id?: string
  additionals?: string[]
  calc_rule: ProductCalcRule
  sale_unit?: string
  has_default_dimensions?: boolean
  default_width?: number
  default_height?: number
  default_quantity?: number
  min_price?: number
  fixed_price?: number
  fixed_cost?: number
  requires_art_approval?: boolean
  internal_notes?: string
  is_active: boolean
  created: string
  updated: string

  // Expands
  expand?: {
    main_material_id?: QuoteMaterial
    additionals?: QuoteAdditional[]
  }
}

export interface QuoteCalculationItem {
  id: string
  product_id?: string
  product_name: string
  material_id?: string
  material_name?: string
  calc_rule: ProductCalcRule
  requires_art_approval?: boolean

  // Inputs
  width?: number // em metros
  height?: number // em metros
  quantity: number

  // Selected additionals with specific quantities
  additionals?: Array<{
    additional_id: string
    name: string
    calc_unit: AdditionalCalcUnit
    quantity: number // e.g. 4 ilhoses, or 2m costura
    unit_cost: number
    unit_sale: number
    total_cost: number
    total_sale: number
  }>

  // Intermediate results
  individual_area?: number // m² individual
  total_area?: number // m² total
  linear_meters?: number

  // Cost and Sale
  material_cost_unit?: number
  material_sale_unit?: number

  base_item_cost: number
  base_item_sale: number
  additionals_cost: number
  additionals_sale: number

  calculated_unit_price: number
  applied_unit_price: number // after checking min_price
  is_min_price_applied: boolean

  item_total_cost: number
  item_total_sale: number
  item_gross_profit: number
  item_margin_pct: number
  notes?: string
}

export interface QuoteCalculationSummary {
  items: QuoteCalculationItem[]
  subtotal_cost: number
  subtotal_sale: number
  discount_amount: number
  final_total: number
  gross_profit: number
  profit_margin_pct: number
}

export interface Quote {
  id: string
  code: string
  client_id?: string
  attendance_id?: string
  client_name: string
  client_phone?: string
  client_email?: string
  user_id?: string
  status: QuoteStatus
  items: QuoteCalculationItem[]
  total_cost: number
  total_sale: number
  discount_amount: number
  final_total: number
  gross_profit: number
  profit_margin_pct: number
  notes?: string
  customer_notes?: string
  internal_notes?: string
  valid_until?: string
  public_token?: string
  approved_at?: string
  rejected_at?: string
  created: string
  updated: string
  expand?: {
    client_id?: {
      id: string
      name: string
      phone: string
      email?: string
    }
    attendance_id?: {
      id: string
      stage?: string
      product_interest?: string
      quote_value?: number
    }
    user_id?: {
      id: string
      name: string
      email: string
    }
  }
}

export interface PublicQuoteItem {
  id: string
  product_name: string
  material_name?: string
  quantity: number
  width?: number
  height?: number
  unit_measure?: string
  calc_rule?: string
  unit_price: number
  total_sale: number
  additionals: {
    name: string
    quantity: number
    unit_sale: number
    total_sale: number
  }[]
}

export interface PublicQuoteData {
  code: string
  client_name: string
  status: QuoteStatus
  public_token: string
  total_sale: number
  discount_amount: number
  final_total: number
  notes?: string
  customer_notes?: string
  valid_until?: string
  approved_at?: string
  rejected_at?: string
  created: string
  items: PublicQuoteItem[]
}

export const CALC_UNIT_LABELS: Record<MaterialCalcUnit, string> = {
  m2: 'Metro quadrado (m²)',
  metro_linear: 'Metro linear (m)',
  unidade: 'Unidade (un)',
  centimetro: 'Centímetro (cm)',
  quilo: 'Quilo (kg)',
  valor_fixo: 'Valor fixo (R$)',
}

export const ADDITIONAL_UNIT_LABELS: Record<AdditionalCalcUnit, string> = {
  unidade: 'Por Unidade',
  metro_linear: 'Por Metro Linear',
  m2: 'Por Metro Quadrado (m²)',
  valor_fixo: 'Valor Fixo',
}

export const CALC_RULE_LABELS: Record<ProductCalcRule, string> = {
  m2: 'Metro Quadrado (L × A × Preço/m²)',
  metro_linear: 'Metro Linear (Comprimento × Preço/m)',
  unidade: 'Unidade (Qtd × Preço Unitário)',
  preco_fixo: 'Preço Fixo',
}
