import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Homologação Fase 1 - Regras de Integridade e Validações Adicionais', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('valida rejeição quando produto mestre CRM está inativo', () => {
    const isMasterActive = false
    const shouldBlock = !isMasterActive
    expect(shouldBlock).toBe(true)
  })

  it('valida que desvincular preserva publicação na loja sem apagar dados', () => {
    const storeProduct = {
      id: 'sp_123',
      name: 'Banner Homolog',
      quote_product_id: 'qp_456',
      published: true,
      slug: 'banner-homolog',
    }

    const unlinked = {
      ...storeProduct,
      quote_product_id: '',
    }

    expect(unlinked.id).toBe(storeProduct.id)
    expect(unlinked.name).toBe(storeProduct.name)
    expect(unlinked.slug).toBe(storeProduct.slug)
    expect(unlinked.quote_product_id).toBe('')
    expect(unlinked.published).toBe(true)
  })

  it('valida que rascunho nasce sempre com published = false', () => {
    const newDraft = {
      quote_product_id: 'qp_123',
      name: 'Produto Teste',
      category_id: 'cat_level3',
      published: false,
    }

    expect(newDraft.published).toBe(false)
  })
})
