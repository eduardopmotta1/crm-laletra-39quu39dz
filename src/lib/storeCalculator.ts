import type {
  StoreProduct,
  StorePriceCalculationParams,
  StorePriceCalculationResult,
  PricingType,
  StorePriceTier,
} from '@/types/store'

/**
 * Motor de cálculo de preços da Laletra Store (Client-side e Server-side compartilhado)
 * Suporta:
 * 1. fixed: Preço unitário fixo × quantidade
 * 2. quantity_tiers: Faixas de quantidade (ex.: 500un R$ 135, 1.000un R$ 198)
 * 3. square_meter: Largura × Altura (m²), respeitando área mínima
 * Mais: Variações (options) com modificadores e Acabamentos adicionais (finishings).
 * Produtos com quote_only retornam zero e flag indicativa.
 */
export function calculateStoreProductPrice(
  params: StorePriceCalculationParams,
): StorePriceCalculationResult {
  const {
    product,
    quantity = 1,
    width = 0,
    height = 0,
    selected_options = {},
    selected_finishings = [],
  } = params

  const pricingType: PricingType = product?.pricing_type || params.pricing_type || 'fixed'

  if (!product || product.quote_only) {
    return {
      success: true,
      quote_only: true,
      message: 'Este produto requer orçamento sob medida com nossa equipe comercial.',
      product_id: product?.id,
      pricing_type: pricingType,
      quantity,
      area_m2: null,
      base_total: 0,
      options_total: 0,
      finishings_total: 0,
      total: 0,
      unit_price: 0,
      lead_time_days: product?.lead_time_days || 3,
    }
  }

  let baseTotal = 0
  let areaM2: number | null = null

  // 1. Base por Pricing Type
  if (pricingType === 'fixed') {
    const unitP = Number(product.store_price) || 0
    baseTotal = unitP * quantity
  } else if (pricingType === 'quantity_tiers') {
    const rawTiers: StorePriceTier[] = Array.isArray(product.price_tiers)
      ? [...product.price_tiers]
      : []
    let matchedTier: StorePriceTier | null = null

    if (rawTiers.length > 0) {
      rawTiers.sort((a, b) => Number(a.quantity) - Number(b.quantity))
      for (let i = 0; i < rawTiers.length; i++) {
        if (quantity >= Number(rawTiers[i].quantity)) {
          matchedTier = rawTiers[i]
        }
      }
      if (!matchedTier) {
        matchedTier = rawTiers[0]
      }
    }

    if (matchedTier) {
      const tierPrice = Number(matchedTier.price) || 0
      const tierQty = Number(matchedTier.quantity) || 1
      baseTotal = tierPrice * (quantity / tierQty)
    } else {
      const defP = Number(product.store_price) || 0
      baseTotal = defP * quantity
    }
  } else if (pricingType === 'square_meter') {
    // Largura e Altura: se maior que 10, converte cm para metros (ex.: 100cm -> 1.0m)
    const wM = width > 10 ? width / 100 : width
    const hM = height > 10 ? height / 100 : height
    const calcArea = Number((wM * hM).toFixed(4))
    areaM2 = calcArea

    const minArea = Number(product.sqm_min_area) || 0.5
    const effectiveArea = Math.max(calcArea, minArea)
    const baseSqm = Number(product.sqm_base_price) || Number(product.store_price) || 65.0

    const unitSqmTotal = effectiveArea * baseSqm
    baseTotal = unitSqmTotal * quantity
  }

  // 2. Modificadores de Variação (options)
  let optionsUnitModifier = 0
  if (Array.isArray(product.options)) {
    for (const opt of product.options) {
      const chosenValueId = selected_options[opt.name]
      if (chosenValueId && Array.isArray(opt.values)) {
        const found = opt.values.find((v) => v.id === chosenValueId || v.label === chosenValueId)
        if (found) {
          optionsUnitModifier += Number(found.price_modifier) || 0
        }
      }
    }
  }
  const optionsTotal = Number((optionsUnitModifier * quantity).toFixed(2))

  // 3. Acabamentos Adicionais (finishings)
  let finishingsTotal = 0
  if (Array.isArray(product.finishings) && selected_finishings.length > 0) {
    for (const fin of product.finishings) {
      if (selected_finishings.includes(fin.id)) {
        finishingsTotal += Number(fin.price) || 0
      }
    }
  }
  finishingsTotal = Number(finishingsTotal.toFixed(2))

  const grandTotal = Number((baseTotal + optionsTotal + finishingsTotal).toFixed(2))
  const unitPrice = Number((grandTotal / (quantity || 1)).toFixed(2))

  return {
    success: true,
    quote_only: false,
    product_id: product.id,
    pricing_type: pricingType,
    quantity,
    area_m2: areaM2 && areaM2 > 0 ? areaM2 : null,
    base_total: Number(baseTotal.toFixed(2)),
    options_total: optionsTotal,
    finishings_total: finishingsTotal,
    total: grandTotal,
    unit_price: unitPrice,
    lead_time_days: product.lead_time_days || 3,
  }
}
