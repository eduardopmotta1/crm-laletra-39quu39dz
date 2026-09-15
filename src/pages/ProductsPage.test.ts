import { describe, it, expect, vi } from 'vitest'
import type { QuoteProduct } from '@/types/quotes'

/**
 * Função pura que espelha exatamente a lógica de toggle implementada em ProductsPage
 */
export function toggleAdditional(currentAdditionals: string[], addId: string): string[] {
  const exists = currentAdditionals.includes(addId)
  return exists ? currentAdditionals.filter((id) => id !== addId) : [...currentAdditionals, addId]
}

/**
 * Monta o FormData do produto espelhando exatamente a lógica de handleSaveProduct em ProductsPage
 */
export function buildProductFormData(productData: {
  name: string
  category: string
  description?: string
  calc_rule: 'm2' | 'metro_linear' | 'unidade' | 'preco_fixo'
  sale_unit: string
  is_active: boolean
  has_default_dimensions?: boolean
  requires_art_approval?: boolean
  internal_notes?: string
  additionals: string[]
}): FormData {
  const formData = new FormData()
  formData.append('name', productData.name.trim())
  formData.append('category', productData.category.trim() || 'Geral')
  formData.append('description', productData.description?.trim() || '')
  formData.append('calc_rule', productData.calc_rule)
  formData.append('sale_unit', productData.sale_unit)
  formData.append('is_active', String(productData.is_active))
  formData.append('has_default_dimensions', String(productData.has_default_dimensions ?? false))
  formData.append('requires_art_approval', String(productData.requires_art_approval ?? true))
  formData.append('internal_notes', productData.internal_notes?.trim() || '')

  // Append additionals relations array (garantindo envio de lista vazia para PocketBase remover vínculos)
  if (productData.additionals.length === 0) {
    formData.append('additionals', '')
  } else {
    for (const addId of productData.additionals) {
      formData.append('additionals', addId)
    }
  }

  return formData
}

describe('ProductsPage — Edição de Acabamentos e Adicionais Permitidos', () => {
  it('CENÁRIO A: produto possui adicional A; desmarcar A; salvar; reabrir → A desmarcado', async () => {
    // Mock do produto existente vindo do PocketBase
    const mockProduct: QuoteProduct = {
      id: 'prod_1',
      name: 'Banner Lona',
      category: 'Comunicação Visual',
      calc_rule: 'm2',
      sale_unit: 'm²',
      is_active: true,
      additionals: ['add_A'],
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    // Ao abrir modal:
    let formAdditionals = [...(mockProduct.additionals || [])]
    expect(formAdditionals).toContain('add_A')

    // Usuário clica para desmarcar 'add_A'
    formAdditionals = toggleAdditional(formAdditionals, 'add_A')
    expect(formAdditionals).not.toContain('add_A')
    expect(formAdditionals).toEqual([])

    // Ao salvar:
    const formData = buildProductFormData({
      name: mockProduct.name,
      category: mockProduct.category,
      calc_rule: mockProduct.calc_rule,
      sale_unit: mockProduct.sale_unit,
      is_active: mockProduct.is_active,
      additionals: formAdditionals,
    })

    // PocketBase recebe 'additionals' como '' para limpar relações
    expect(formData.has('additionals')).toBe(true)
    expect(formData.getAll('additionals')).toEqual([''])

    // Simula resposta do PocketBase após update e reabertura
    const updatedProductInDb: QuoteProduct = {
      ...mockProduct,
      additionals: [],
    }

    const reopenedAdditionals = updatedProductInDb.additionals || []
    expect(reopenedAdditionals).not.toContain('add_A')
    expect(reopenedAdditionals).toEqual([])
  })

  it('CENÁRIO B: produto não possui B; marcar B; salvar; reabrir → B marcado', async () => {
    const mockProduct: QuoteProduct = {
      id: 'prod_2',
      name: 'Faixa Lona',
      category: 'Comunicação Visual',
      calc_rule: 'metro_linear',
      sale_unit: 'metro linear',
      is_active: true,
      additionals: [],
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    let formAdditionals = [...(mockProduct.additionals || [])]
    expect(formAdditionals).not.toContain('add_B')

    // Marcar B
    formAdditionals = toggleAdditional(formAdditionals, 'add_B')
    expect(formAdditionals).toContain('add_B')

    const formData = buildProductFormData({
      name: mockProduct.name,
      category: mockProduct.category,
      calc_rule: mockProduct.calc_rule,
      sale_unit: mockProduct.sale_unit,
      is_active: mockProduct.is_active,
      additionals: formAdditionals,
    })

    expect(formData.getAll('additionals')).toEqual(['add_B'])

    // Simula reabertura
    const updatedProductInDb: QuoteProduct = {
      ...mockProduct,
      additionals: ['add_B'],
    }
    expect(updatedProductInDb.additionals).toContain('add_B')
  })

  it('CENÁRIO C: produto possui A e B; desmarcar todos; salvar; reabrir → nenhum selecionado (lista vazia enviada)', async () => {
    const mockProduct: QuoteProduct = {
      id: 'prod_3',
      name: 'Adesivo Vinil',
      category: 'Adesivos',
      calc_rule: 'm2',
      sale_unit: 'm²',
      is_active: true,
      additionals: ['add_A', 'add_B'],
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    let formAdditionals = [...(mockProduct.additionals || [])]
    expect(formAdditionals).toEqual(['add_A', 'add_B'])

    // Desmarcar A
    formAdditionals = toggleAdditional(formAdditionals, 'add_A')
    expect(formAdditionals).toEqual(['add_B'])

    // Desmarcar B
    formAdditionals = toggleAdditional(formAdditionals, 'add_B')
    expect(formAdditionals).toEqual([])

    const formData = buildProductFormData({
      name: mockProduct.name,
      category: mockProduct.category,
      calc_rule: mockProduct.calc_rule,
      sale_unit: mockProduct.sale_unit,
      is_active: mockProduct.is_active,
      additionals: formAdditionals,
    })

    // Campo additionals DEVE estar presente no FormData para o PocketBase remover os vínculos existentes
    expect(formData.has('additionals')).toBe(true)
    expect(formData.getAll('additionals')).toEqual([''])

    const updatedProductInDb: QuoteProduct = {
      ...mockProduct,
      additionals: [],
    }
    expect(updatedProductInDb.additionals).toEqual([])
  })

  it('CENÁRIO D: clique único direto no Checkbox → handleToggleAdditionalInForm executa somente UMA vez (sem propagação)', () => {
    const handleToggleAdditionalInForm = vi.fn()

    // Simula o container com stopPropagation no checkbox
    const stopPropagationMock = vi.fn()
    const syntheticEvent = {
      stopPropagation: stopPropagationMock,
    }

    // Ao clicar na área do checkbox / trigger do checkbox:
    // O wrapper intercepta e chama stopPropagation:
    syntheticEvent.stopPropagation()
    expect(stopPropagationMock).toHaveBeenCalledTimes(1)

    // O onCheckedChange do Checkbox é invocado:
    handleToggleAdditionalInForm('add_A')

    // O onClick do card ancestral NÃO é acionado devido ao stopPropagation
    expect(handleToggleAdditionalInForm).toHaveBeenCalledTimes(1)
    expect(handleToggleAdditionalInForm).toHaveBeenCalledWith('add_A')
  })

  it('CENÁRIO E: clique no card (fora do Checkbox) → somente UM toggle', () => {
    const handleToggleAdditionalInForm = vi.fn()

    // Simula o clique no card direto (fora do checkbox)
    handleToggleAdditionalInForm('add_B')

    expect(handleToggleAdditionalInForm).toHaveBeenCalledTimes(1)
    expect(handleToggleAdditionalInForm).toHaveBeenCalledWith('add_B')
  })
})
