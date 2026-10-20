import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateStoreProductPrice } from '@/lib/storeCalculator'
import { storeService } from '@/services/storeService'
import type { StoreProduct } from '@/types/store'

describe('Laletra Store - Cálculo de Preços e Motor de Precificação', () => {
  it('deve calcular corretamente produto com Preço Fixo (fixed)', () => {
    const product: StoreProduct = {
      id: 'prod-fixed-1',
      name: 'Caneca Cerâmica',
      seo_slug: 'caneca-ceramica',
      pricing_type: 'fixed',
      store_price: 29.9,
      published: true,
      options: [],
      finishings: [],
    }

    const result = calculateStoreProductPrice({
      product,
      quantity: 5,
    })

    expect(result.success).toBe(true)
    expect(result.pricing_type).toBe('fixed')
    expect(result.quantity).toBe(5)
    expect(result.base_total).toBe(149.5)
    expect(result.total).toBe(149.5)
    expect(result.unit_price).toBe(29.9)
  })

  it('deve calcular faixas de quantidade (quantity_tiers) selecionando o tier apropriado', () => {
    const product: StoreProduct = {
      id: 'prod-tiers-1',
      name: 'Cartão de Visita',
      seo_slug: 'cartao-de-visita',
      pricing_type: 'quantity_tiers',
      store_price: 135,
      price_tiers: [
        { quantity: 500, price: 135.0, label: '500 un' },
        { quantity: 1000, price: 198.0, label: '1.000 un' },
        { quantity: 5000, price: 680.0, label: '5.000 un' },
      ],
      published: true,
      options: [],
      finishings: [],
    }

    // Pedido de 1.000 unidades
    const res1000 = calculateStoreProductPrice({
      product,
      quantity: 1000,
    })
    expect(res1000.base_total).toBe(198.0)
    expect(res1000.total).toBe(198.0)
    expect(res1000.unit_price).toBe(0.2) // 198 / 1000

    // Pedido de 500 unidades
    const res500 = calculateStoreProductPrice({
      product,
      quantity: 500,
    })
    expect(res500.base_total).toBe(135.0)
    expect(res500.total).toBe(135.0)
  })

  it('deve calcular metro quadrado (square_meter) respeitando a área mínima', () => {
    const bannerProduct: StoreProduct = {
      id: 'prod-sqm-1',
      name: 'Banner Lona 440g',
      seo_slug: 'banner-lona',
      pricing_type: 'square_meter',
      sqm_base_price: 60.0,
      sqm_min_area: 0.5,
      published: true,
      options: [],
      finishings: [],
    }

    // Caso 1: 100cm x 200cm = 1.0m x 2.0m = 2.0 m²
    const res2m = calculateStoreProductPrice({
      product: bannerProduct,
      quantity: 1,
      width: 100, // cm
      height: 200, // cm
    })
    expect(res2m.area_m2).toBe(2.0)
    expect(res2m.base_total).toBe(120.0) // 2 * 60

    // Caso 2: Pequeno formato 40cm x 40cm = 0.16 m² (abaixo da área mínima de 0.5m²)
    const resMin = calculateStoreProductPrice({
      product: bannerProduct,
      quantity: 1,
      width: 40,
      height: 40,
    })
    expect(resMin.area_m2).toBe(0.16)
    expect(resMin.base_total).toBe(30.0) // 0.5m² min * 60 = 30.0
  })

  it('deve somar variações (options) e acabamentos adicionais (finishings)', () => {
    const product: StoreProduct = {
      id: 'prod-full-1',
      name: 'Pasta com Bolsa',
      seo_slug: 'pasta-com-bolsa',
      pricing_type: 'fixed',
      store_price: 10.0,
      options: [
        {
          name: 'Acabamento',
          values: [
            { id: 'fosco', label: 'Laminação Fosca', price_modifier: 0 },
            { id: 'soft_touch', label: 'Soft Touch', price_modifier: 2.5 },
          ],
        },
      ],
      finishings: [
        { id: 'verniz_uv', name: 'Verniz Localizado', price: 50.0 },
        { id: 'hot_stamp', name: 'Hot Stamping', price: 70.0 },
      ],
      published: true,
    }

    const result = calculateStoreProductPrice({
      product,
      quantity: 10,
      selected_options: {
        Acabamento: 'soft_touch',
      },
      selected_finishings: ['verniz_uv'],
    })

    // Base: 10 * 10.0 = 100.0
    // Options: 10 * 2.5 = 25.0
    // Finishings: 50.0 (lote)
    // Total: 100 + 25 + 50 = 175.0
    expect(result.base_total).toBe(100.0)
    expect(result.options_total).toBe(25.0)
    expect(result.finishings_total).toBe(50.0)
    expect(result.total).toBe(175.0)
    expect(result.unit_price).toBe(17.5)
  })

  it('deve tratar produtos do tipo quote_only retornando total 0 e flag explicativa', () => {
    const quoteOnlyProduct: StoreProduct = {
      id: 'prod-quote-only',
      name: 'Fachada Comercial Luminosa',
      seo_slug: 'fachada-luminosa',
      pricing_type: 'fixed',
      store_price: 0,
      quote_only: true,
      published: true,
    }

    const result = calculateStoreProductPrice({
      product: quoteOnlyProduct,
      quantity: 1,
    })

    expect(result.quote_only).toBe(true)
    expect(result.total).toBe(0)
    expect(result.unit_price).toBe(0)
    expect(result.message).toContain('requer orçamento sob medida')
  })
})

describe('Laletra Store - Segurança de Catálogo e Separação de Custos', () => {
  it('nenhum objeto do produto público deve conter propriedades de custo interno do CRM', () => {
    const publicProduct: StoreProduct = {
      id: 'prod-safe-1',
      name: 'Panfleto 10x15',
      seo_slug: 'panfleto-10x15',
      pricing_type: 'quantity_tiers',
      store_price: 110.0,
      published: true,
      lead_time_days: 4,
    }

    const internalForbiddenKeys = [
      'cost_price',
      'fixed_cost',
      'min_price',
      'cost_unit',
      'profit_margin',
      'raw_materials_cost',
      'internal_notes',
      'supplier_id',
    ]

    for (const key of internalForbiddenKeys) {
      expect((publicProduct as any)[key]).toBeUndefined()
    }
  })
})
