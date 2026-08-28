import type {
  QuoteProduct,
  QuoteMaterial,
  QuoteAdditional,
  QuoteCalculationItem,
  QuoteCalculationSummary,
  AdditionalCalcUnit,
} from '@/types/quotes'

export interface ItemCalculationParams {
  product?: QuoteProduct | null
  material?: QuoteMaterial | null
  width?: number // em metros
  height?: number // em metros
  quantity?: number // quantidade de peças
  additionalsSelection?: Array<{
    additional: QuoteAdditional
    quantity: number
  }>
  customUnitPrice?: number
  customCostPrice?: number
}

export function calculateQuoteItem(params: ItemCalculationParams): QuoteCalculationItem {
  const product = params.product
  const material = params.material || product?.expand?.main_material_id
  const quantity = Math.max(1, params.quantity || 1)
  const width = Math.max(0, params.width || 0)
  const height = Math.max(0, params.height || 0)

  const calcRule = product?.calc_rule || (material?.calc_unit as any) || 'm2'
  const minPrice = Number(product?.min_price || material?.min_price || 0)

  let individualArea = 0
  let totalArea = 0
  let linearMeters = 0
  let baseUnitCost = 0
  let baseUnitSale = 0

  const materialCost = Number(material?.cost_price || 0)
  const materialSale = Number(material?.sale_price || 0)

  // 1. Calculate Base Product by Rule
  switch (calcRule) {
    case 'm2': {
      individualArea = width * height
      totalArea = individualArea * quantity
      baseUnitCost = individualArea * materialCost
      baseUnitSale = individualArea * materialSale
      break
    }
    case 'metro_linear': {
      // Linear meters calculation: largura ou comprimento
      linearMeters = width > 0 ? width : height
      baseUnitCost = linearMeters * materialCost
      baseUnitSale = linearMeters * materialSale
      break
    }
    case 'unidade': {
      baseUnitCost = Number(product?.fixed_cost || materialCost || 0)
      baseUnitSale = Number(product?.fixed_price || materialSale || 0)
      break
    }
    case 'preco_fixo': {
      baseUnitCost = Number(product?.fixed_cost || materialCost || 0)
      baseUnitSale = Number(product?.fixed_price || materialSale || 0)
      break
    }
    default: {
      baseUnitCost = materialCost
      baseUnitSale = materialSale
      break
    }
  }

  // 2. Calculate Additionals / Acabamentos
  const calculatedAdditionals = (params.additionalsSelection || []).map((item) => {
    const add = item.additional
    const addQty = Math.max(0, item.quantity)
    const cost = Number(add.cost_price || 0)
    const sale = Number(add.sale_price || 0)

    let totalAddCost = 0
    let totalAddSale = 0

    switch (add.calc_unit as AdditionalCalcUnit) {
      case 'unidade':
        // e.g. 4 ilhoses por peça * quantidade de peças
        totalAddCost = addQty * cost * quantity
        totalAddSale = addQty * sale * quantity
        break
      case 'metro_linear':
        // e.g. perímetro de costura ou metragem
        totalAddCost = addQty * cost * quantity
        totalAddSale = addQty * sale * quantity
        break
      case 'm2': {
        // e.g. laminação ou verniz por m²
        const areaToApply = totalArea > 0 ? totalArea : addQty
        totalAddCost = areaToApply * cost
        totalAddSale = areaToApply * sale
        break
      }
      case 'valor_fixo':
        totalAddCost = addQty * cost
        totalAddSale = addQty * sale
        break
      default:
        totalAddCost = addQty * cost
        totalAddSale = addQty * sale
    }

    return {
      additional_id: add.id,
      name: add.name,
      calc_unit: add.calc_unit,
      quantity: addQty,
      unit_cost: cost,
      unit_sale: sale,
      total_cost: totalAddCost,
      total_sale: totalAddSale,
    }
  })

  const totalAdditionalsCost = calculatedAdditionals.reduce((sum, a) => sum + a.total_cost, 0)
  const totalAdditionalsSale = calculatedAdditionals.reduce((sum, a) => sum + a.total_sale, 0)

  const baseTotalCost = baseUnitCost * quantity
  const baseTotalSale = baseUnitSale * quantity

  // 3. Preço Unitário e Preço Mínimo
  // Base raw calculated unit price before min price
  const rawCalculatedUnitPrice = baseUnitSale + totalAdditionalsSale / quantity

  let appliedUnitPrice = rawCalculatedUnitPrice
  let isMinPriceApplied = false

  if (minPrice > 0 && rawCalculatedUnitPrice < minPrice) {
    appliedUnitPrice = minPrice
    isMinPriceApplied = true
  }

  const finalTotalSale = appliedUnitPrice * quantity
  const finalTotalCost = baseTotalCost + totalAdditionalsCost

  const itemGrossProfit = finalTotalSale - finalTotalCost
  const itemMarginPct = finalTotalSale > 0 ? (itemGrossProfit / finalTotalSale) * 100 : 0

  return {
    id: 'item_' + Math.random().toString(36).substring(2, 9),
    product_id: product?.id,
    product_name: product?.name || 'Item Personalizado',
    material_id: material?.id,
    material_name: material?.name,
    calc_rule: calcRule,

    width,
    height,
    quantity,

    additionals: calculatedAdditionals,

    individual_area: Number(individualArea.toFixed(4)),
    total_area: Number(totalArea.toFixed(4)),
    linear_meters: Number(linearMeters.toFixed(2)),

    material_cost_unit: materialCost,
    material_sale_unit: materialSale,

    base_item_cost: Number(baseTotalCost.toFixed(2)),
    base_item_sale: Number(baseTotalSale.toFixed(2)),
    additionals_cost: Number(totalAdditionalsCost.toFixed(2)),
    additionals_sale: Number(totalAdditionalsSale.toFixed(2)),

    calculated_unit_price: Number(rawCalculatedUnitPrice.toFixed(2)),
    applied_unit_price: Number(appliedUnitPrice.toFixed(2)),
    is_min_price_applied: isMinPriceApplied,

    item_total_cost: Number(finalTotalCost.toFixed(2)),
    item_total_sale: Number(finalTotalSale.toFixed(2)),
    item_gross_profit: Number(itemGrossProfit.toFixed(2)),
    item_margin_pct: Number(itemMarginPct.toFixed(2)),
  }
}

export function calculateQuoteSummary(
  items: QuoteCalculationItem[],
  discountAmount = 0,
): QuoteCalculationSummary {
  const subtotalCost = items.reduce((sum, item) => sum + (item.item_total_cost || 0), 0)
  const subtotalSale = items.reduce((sum, item) => sum + (item.item_total_sale || 0), 0)

  const finalTotal = Math.max(0, subtotalSale - discountAmount)
  const grossProfit = finalTotal - subtotalCost
  const profitMarginPct = finalTotal > 0 ? (grossProfit / finalTotal) * 100 : 0

  return {
    items,
    subtotal_cost: Number(subtotalCost.toFixed(2)),
    subtotal_sale: Number(subtotalSale.toFixed(2)),
    discount_amount: Number(discountAmount.toFixed(2)),
    final_total: Number(finalTotal.toFixed(2)),
    gross_profit: Number(grossProfit.toFixed(2)),
    profit_margin_pct: Number(profitMarginPct.toFixed(2)),
  }
}
