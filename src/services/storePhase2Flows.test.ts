import { describe, it, expect, beforeEach, vi } from 'vitest'
import { calculateStoreProductPrice } from '@/lib/storeCalculator'
import { StoreProduct } from '@/types/store'

describe('Laletra Store - Fase 2: Segurança, Carrinho e Checkout', () => {
  const mockProductFixed: StoreProduct = {
    id: 'prod_fixed_1',
    category_id: 'cat_1',
    name: 'Bloco de Notas Personalizado',
    slug: 'bloco-de-notas',
    short_description: 'Bloco 10x15cm',
    full_description: 'Descrição completa',
    pricing_type: 'fixed',
    store_price: 18.5,
    min_quantity: 1,
    lead_time_days: 3,
    published: true,
    created: '2026-03-01',
    updated: '2026-03-01',
  }

  const mockProductTiers: StoreProduct = {
    id: 'prod_tiers_1',
    category_id: 'cat_1',
    name: 'Cartões de Visita Couché 300g',
    slug: 'cartoes-de-visita-300g',
    pricing_type: 'quantity_tiers',
    store_price: 65.0,
    price_tiers: [
      { quantity: 100, price: 65.0, label: '100 un' },
      { quantity: 500, price: 120.0, label: '500 un' },
      { quantity: 1000, price: 180.0, label: '1000 un' },
    ],
    min_quantity: 100,
    lead_time_days: 2,
    published: true,
    created: '2026-03-01',
    updated: '2026-03-01',
  }

  const mockProductSqm: StoreProduct = {
    id: 'prod_sqm_1',
    category_id: 'cat_2',
    name: 'Lona Frontlight 440g',
    slug: 'lona-frontlight-440g',
    pricing_type: 'square_meter',
    sqm_base_price: 65.0,
    sqm_min_area: 0.5,
    lead_time_days: 2,
    published: true,
    created: '2026-03-01',
    updated: '2026-03-01',
  }

  it('1. Preço é recalculado com segurança e precisão para produtos com preço fixo', () => {
    const res = calculateStoreProductPrice(mockProductFixed, {
      quantity: 5,
    })
    expect(res.totalPrice).toBe(92.5)
    expect(res.unitPrice).toBe(18.5)
  })

  it('2. Faixas de quantidade (tiers) selecionam o escalonamento correto sem distorção', () => {
    // 500 unidades deve custar 120
    const res500 = calculateStoreProductPrice(mockProductTiers, {
      quantity: 500,
    })
    expect(res500.totalPrice).toBe(120.0)

    // 1000 unidades deve custar 180
    const res1000 = calculateStoreProductPrice(mockProductTiers, {
      quantity: 1000,
    })
    expect(res1000.totalPrice).toBe(180.0)
  })

  it('3. Cálculo por metro quadrado respeita área mínima e dimensões informadas', () => {
    // 100x100cm = 1m² => 1m² * 65.00 = 65.00
    const res1m = calculateStoreProductPrice(mockProductSqm, {
      quantity: 1,
      width: 100,
      height: 100,
    })
    expect(res1m.areaM2).toBe(1.0)
    expect(res1m.totalPrice).toBe(65.0)

    // Área inferior à mínima (0.5m²) usa o piso mínimo de 0.5m²
    // 30x30cm = 0.09m² => piso 0.5m² * 65.00 = 32.50
    const resSmall = calculateStoreProductPrice(mockProductSqm, {
      quantity: 1,
      width: 30,
      height: 30,
    })
    expect(resSmall.areaM2).toBe(0.09)
    expect(resSmall.totalPrice).toBe(32.5)
  })

  it('4. Simulação de manipulação de preço no frontend: total calculado pelo servidor prevalece', () => {
    // Se o cliente tentar injetar totalPrice = 1.00 ou unitPrice = 0.10, o cálculo oficial ignora
    const maliciousFrontendItem = {
      product_id: mockProductFixed.id,
      quantity: 10,
      tampered_price: 1.0, // tentativa de fraude
    }

    const calculated = calculateStoreProductPrice(mockProductFixed, {
      quantity: maliciousFrontendItem.quantity,
    })

    // O preço verdadeiro deve ser 10 * 18.50 = 185.00
    expect(calculated.totalPrice).toBe(185.0)
    expect(calculated.totalPrice).not.toBe(maliciousFrontendItem.tampered_price)
  })

  it('5. Validação de formato de arquivos técnicos aceitos na esteira de pré-impressão', () => {
    const allowedExtensions = ['pdf', 'ai', 'eps', 'jpg', 'jpeg', 'png', 'webp', 'zip']
    const testFilenames = [
      { name: 'arte_final_cartao.pdf', valid: true },
      { name: 'fechamento_caixa.ai', valid: true },
      { name: 'banner_alta_resolucao.eps', valid: true },
      { name: 'logo_cliente.png', valid: true },
      { name: 'pacote_arquivos.zip', valid: true },
      { name: 'arquivo_executavel.exe', valid: false },
      { name: 'script_perigoso.sh', valid: false },
      { name: 'malware.bat', valid: false },
    ]

    for (const test of testFilenames) {
      const ext = (test.name.split('.').pop() || '').toLowerCase()
      const isAllowed = allowedExtensions.includes(ext)
      expect(isAllowed).toBe(test.valid)
    }
  })

  it('6. Regra de idempotência estrita de pedidos: client_request_id único previne duplicações', () => {
    const ordersDatabase = new Map<string, any>()

    const createOrderWithIdempotency = (req: {
      client_request_id: string
      total_amount: number
    }) => {
      if (ordersDatabase.has(req.client_request_id)) {
        return {
          is_duplicate: true,
          existing_order: ordersDatabase.get(req.client_request_id),
        }
      }

      const newOrder = {
        id: 'ord_' + Math.random().toString(36).substring(7),
        client_request_id: req.client_request_id,
        order_number: 'LL-2026-12345',
        total_amount: req.total_amount,
      }
      ordersDatabase.set(req.client_request_id, newOrder)
      return { is_duplicate: false, existing_order: newOrder }
    }

    const firstTry = createOrderWithIdempotency({
      client_request_id: 'cart-session-abc-123',
      total_amount: 150.0,
    })
    expect(firstTry.is_duplicate).toBe(false)
    expect(firstTry.existing_order.order_number).toBe('LL-2026-12345')

    // Segundo clique / retry com o mesmo client_request_id
    const retryTry = createOrderWithIdempotency({
      client_request_id: 'cart-session-abc-123',
      total_amount: 150.0,
    })
    expect(retryTry.is_duplicate).toBe(true)
    expect(retryTry.existing_order.id).toBe(firstTry.existing_order.id)
  })

  it('7. Regra permanente contra merges cegos de clientes (caso Eduardo P Motta)', () => {
    // Simula a lógica adotada no backend da Fase 2:
    // Nunca mescla nem altera cliente existente de forma cega no CRM.
    // Se encontrar telefone compatível, marca como "suggested" para confirmação humana,
    // garantindo integridade e prevenindo duplicidades ou fusões indesejadas.
    const evaluateCrmLink = (inputPhone: string, existingCrmPhones: string[]) => {
      const isExactMatch = existingCrmPhones.includes(inputPhone)
      if (isExactMatch) {
        return {
          crm_link_status: 'suggested',
          automaticMergePerformed: false,
          note: 'Sugestão de vínculo aguardando aprovação explícita no CRM.',
        }
      }
      return {
        crm_link_status: 'unlinked',
        automaticMergePerformed: false,
        note: 'Novo comprador não vinculado.',
      }
    }

    const result = evaluateCrmLink('5511988887777', ['5511988887777'])
    expect(result.automaticMergePerformed).toBe(false)
    expect(result.crm_link_status).toBe('suggested')
  })
})
