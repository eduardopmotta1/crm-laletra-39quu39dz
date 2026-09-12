import { describe, it, expect } from 'vitest'
import type { ProductionOrder } from '@/types/crm'
import type { Quote } from '@/types/quotes'

/**
 * Função utilitária que replica o predicado de vínculo/deduplicidade
 * utilizado em getLinkedOrderForQuote (QuotesListPage / WhatsAppChatDrawer)
 * e matchesQuote (quoteToProductionService).
 */
export function isOrderLinkedToQuote(
  order: Pick<ProductionOrder, 'quote_id' | 'notes' | 'description'>,
  quote: Pick<Quote, 'id' | 'code'>,
): boolean {
  if (!quote?.id) return false

  // CRITÉRIO PRINCIPAL: quote_id idêntico
  if (order.quote_id && order.quote_id === quote.id) {
    return true
  }

  // FALLBACK LEGADO: apenas tag exata [QUOTE_ID:<quote.id>]
  const exactLegacyTag = `[QUOTE_ID:${quote.id}]`
  if (order.notes && order.notes.includes(exactLegacyTag)) {
    return true
  }
  if (order.description && order.description.includes(exactLegacyTag)) {
    return true
  }

  // NUNCA deduplicar por [ORC:<code-do-orçamento>]
  return false
}

describe('Deduplicação de Pedidos de Produção por Vínculo de Orçamento', () => {
  // CENÁRIO 1: quote 6e5uz1c2r3rkefx vs pedido #001856 (quote_id vazio, [QUOTE_ID:3tl3vju1te726or], [ORC:ORC-2026-0017])
  // -> NÃO é considerado pedido desse quote atual.
  it('CENÁRIO 1: Pedido #001856 NÃO deve bloquear quote atual 6e5uz1c2r3rkefx mesmo contendo tag [ORC:ORC-2026-0017]', () => {
    const currentQuote: Pick<Quote, 'id' | 'code'> = {
      id: '6e5uz1c2r3rkefx',
      code: 'ORC-2026-0017',
    }

    const order001856: Pick<ProductionOrder, 'quote_id' | 'notes' | 'description'> = {
      quote_id: '',
      notes:
        'Origem: Orçamento ORC-2026-0017 aprovado em 11/09/2026. [QUOTE_ID:3tl3vju1te726or] [ORC:ORC-2026-0017]',
      description: 'Banner promocional e adesivos',
    }

    const isLinked = isOrderLinkedToQuote(order001856, currentQuote)
    expect(isLinked).toBe(false)
  })

  // CENÁRIO 2: production_order.quote_id === quote.id -> considerado duplicado real (proteção mantida)
  it('CENÁRIO 2: production_order.quote_id === quote.id é considerado duplicado real (proteção mantida)', () => {
    const currentQuote: Pick<Quote, 'id' | 'code'> = {
      id: '6e5uz1c2r3rkefx',
      code: 'ORC-2026-0017',
    }

    const orderWithExactQuoteId: Pick<ProductionOrder, 'quote_id' | 'notes' | 'description'> = {
      quote_id: '6e5uz1c2r3rkefx',
      notes: 'Pedido criado pelo sistema',
      description: 'Banner 1x1m',
    }

    const isLinked = isOrderLinkedToQuote(orderWithExactQuoteId, currentQuote)
    expect(isLinked).toBe(true)
  })

  // CENÁRIO 3: quote_id vazio mas notes contém [QUOTE_ID:<quote.id atual>] exato -> vínculo legado válido
  it('CENÁRIO 3: quote_id vazio mas notes contém [QUOTE_ID:<quote.id atual>] exato -> vínculo legado válido', () => {
    const currentQuote: Pick<Quote, 'id' | 'code'> = {
      id: 'quote_legado_999',
      code: 'ORC-2025-0100',
    }

    const legacyOrder: Pick<ProductionOrder, 'quote_id' | 'notes' | 'description'> = {
      quote_id: '',
      notes: 'Origem: Orçamento ORC-2025-0100. [QUOTE_ID:quote_legado_999]',
      description: 'Adesivo perfurado',
    }

    const isLinked = isOrderLinkedToQuote(legacyOrder, currentQuote)
    expect(isLinked).toBe(true)
  })

  // CENÁRIO 4: mesmo client/attendance/código ORC mas quote_id diferente -> NÃO considerar duplicado
  it('CENÁRIO 4: mesmo código ORC mas quote_id diferente -> NÃO considerar duplicado', () => {
    const currentQuote: Pick<Quote, 'id' | 'code'> = {
      id: 'novo_quote_id_123',
      code: 'ORC-2026-0050',
    }

    const oldOrderWithReusedCode: Pick<ProductionOrder, 'quote_id' | 'notes' | 'description'> = {
      quote_id: 'quote_antigo_deletado_888',
      notes:
        'Origem: Orçamento ORC-2026-0050. [QUOTE_ID:quote_antigo_deletado_888] [ORC:ORC-2026-0050]',
      description: 'Fachada lona',
    }

    const isLinked = isOrderLinkedToQuote(oldOrderWithReusedCode, currentQuote)
    expect(isLinked).toBe(false)
  })

  it('Garante que comparação de [QUOTE_ID:<id>] não aceita id parcial como substring', () => {
    const currentQuote: Pick<Quote, 'id' | 'code'> = {
      id: '123',
      code: 'ORC-2026-0001',
    }

    // Pedido antigo tinha ID "123456"
    const orderWithLongerId: Pick<ProductionOrder, 'quote_id' | 'notes' | 'description'> = {
      quote_id: '',
      notes: '[QUOTE_ID:123456]',
      description: '',
    }

    // `[QUOTE_ID:123]` não é substring de `[QUOTE_ID:123456]` porque fecha com `]`
    const isLinked = isOrderLinkedToQuote(orderWithLongerId, currentQuote)
    expect(isLinked).toBe(false)
  })
})
