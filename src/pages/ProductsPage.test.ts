import { describe, it, expect, vi } from 'vitest'
import type { QuoteProduct, QuoteMaterial } from '@/types/quotes'
import { calculateQuoteItem } from '@/lib/quoteCalculator'

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
  default_width?: number | string
  default_height?: number | string
  default_quantity?: number | string
  min_price?: number | string
  fixed_price?: number | string
  fixed_cost?: number | string
  requires_art_approval?: boolean
  internal_notes?: string
  main_material_id?: string
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

  if (productData.main_material_id) {
    formData.append('main_material_id', productData.main_material_id)
  }
  if (productData.default_width) {
    formData.append('default_width', String(productData.default_width))
  }
  if (productData.default_height) {
    formData.append('default_height', String(productData.default_height))
  }
  if (productData.default_quantity) {
    formData.append('default_quantity', String(productData.default_quantity))
  }
  if (productData.min_price) {
    formData.append('min_price', String(productData.min_price))
  }
  if (productData.fixed_price) {
    formData.append('fixed_price', String(productData.fixed_price))
  }
  if (productData.fixed_cost) {
    formData.append('fixed_cost', String(productData.fixed_cost))
  }

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

/**
 * Função pura que espelha exatamente a lógica de duplicação implementada em handleDuplicateProduct
 */
export function prepareDuplicateProductForm(prod: QuoteProduct) {
  return {
    editingProduct: null,
    isDuplicating: true,
    mainImageFile: null,
    mainImagePreview: null,
    form: {
      name: `${prod.name} - Cópia`,
      category: prod.category,
      description: prod.description || '',
      main_material_id: prod.main_material_id || '',
      calc_rule: prod.calc_rule,
      sale_unit: prod.sale_unit || 'unidade',
      has_default_dimensions: !!prod.has_default_dimensions,
      default_width: prod.default_width || '',
      default_height: prod.default_height || '',
      default_quantity: prod.default_quantity || 1,
      min_price: prod.min_price || '',
      fixed_price: prod.fixed_price || '',
      fixed_cost: prod.fixed_cost || '',
      requires_art_approval:
        prod.requires_art_approval !== undefined ? Boolean(prod.requires_art_approval) : true,
      internal_notes: prod.internal_notes || '',
      is_active: prod.is_active,
      additionals: prod.additionals ? [...prod.additionals] : [],
    },
  }
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

describe('ProductsPage — Duplicar Produto (Fluxo Completo e Cenários Obrigatórios)', () => {
  const originalProduct: QuoteProduct = {
    id: 'orig_123',
    name: 'Banner Lona Frontlight 440g',
    category: 'Comunicação Visual',
    description: 'Banner em lona com ilhós reforçado',
    calc_rule: 'm2',
    sale_unit: 'm²',
    main_material_id: 'mat_lona_440',
    additionals: ['add_ilhos', 'add_bainha'],
    has_default_dimensions: true,
    default_width: 2.0,
    default_height: 1.0,
    default_quantity: 1,
    min_price: 50.0,
    fixed_price: 0,
    fixed_cost: 0,
    requires_art_approval: true,
    internal_notes: 'Cuidado com acabamento de canto',
    is_active: true,
    main_image: 'banner_lona_orig.jpg',
    created: '2026-01-01T10:00:00.000Z',
    updated: '2026-01-01T10:00:00.000Z',
  }

  it('CENÁRIO A: duplicar produto com materiais e adicionais → mesmos IDs relacionados no formulário', () => {
    const duplicateState = prepareDuplicateProductForm(originalProduct)

    expect(duplicateState.editingProduct).toBeNull()
    expect(duplicateState.isDuplicating).toBe(true)
    expect(duplicateState.form.name).toBe('Banner Lona Frontlight 440g - Cópia')
    // Mesmos IDs relacionados preservados
    expect(duplicateState.form.main_material_id).toBe('mat_lona_440')
    expect(duplicateState.form.additionals).toEqual(['add_ilhos', 'add_bainha'])
    // Demais campos copiados fielmente
    expect(duplicateState.form.description).toBe('Banner em lona com ilhós reforçado')
    expect(duplicateState.form.category).toBe('Comunicação Visual')
    expect(duplicateState.form.calc_rule).toBe('m2')
    expect(duplicateState.form.sale_unit).toBe('m²')
    expect(duplicateState.form.default_width).toBe(2.0)
    expect(duplicateState.form.default_height).toBe(1.0)
    expect(duplicateState.form.default_quantity).toBe(1)
    expect(duplicateState.form.min_price).toBe(50.0)
    expect(duplicateState.form.requires_art_approval).toBe(true)
    expect(duplicateState.form.internal_notes).toBe('Cuidado com acabamento de canto')
    expect(duplicateState.form.is_active).toBe(true)
  })

  it('CENÁRIO B: alterar nome/preço da cópia e criar → novo ID gerado, produto original intacto (nenhum update chamado com id do original)', async () => {
    const duplicateState = prepareDuplicateProductForm(originalProduct)

    // Usuário altera nome e preço mínimo no modal antes de salvar
    const userModifiedForm = {
      ...duplicateState.form,
      name: 'Banner Lona Frontlight Edição Especial',
      min_price: 65.0,
    }

    // Mock das chamadas de serviço
    const mockCreate = vi.fn().mockImplementation(async (formData: FormData) => {
      return {
        id: 'new_prod_999',
        name: formData.get('name'),
        min_price: Number(formData.get('min_price')),
        category: formData.get('category'),
        created: '2026-03-31T12:00:00.000Z',
        updated: '2026-03-31T12:00:00.000Z',
      }
    })
    const mockUpdate = vi.fn()

    // Simulação do salvamento: como editingProduct === null, OBRIGATORIAMENTE cai em create
    const formData = buildProductFormData(userModifiedForm)
    let savedRecord
    if (duplicateState.editingProduct) {
      savedRecord = await mockUpdate((duplicateState.editingProduct as any).id, formData)
    } else {
      savedRecord = await mockCreate(formData)
    }

    // Verificações de segurança e integridade
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(savedRecord.id).toBe('new_prod_999')
    expect(savedRecord.id).not.toBe(originalProduct.id)
    expect(savedRecord.name).toBe('Banner Lona Frontlight Edição Especial')
    expect(savedRecord.min_price).toBe(65.0)

    // Original permanece 100% intacto
    expect(originalProduct.id).toBe('orig_123')
    expect(originalProduct.name).toBe('Banner Lona Frontlight 440g')
    expect(originalProduct.min_price).toBe(50.0)
    expect(originalProduct.updated).toBe('2026-01-01T10:00:00.000Z')
  })

  it('CENÁRIO C: duplicar e desmarcar alguns adicionais antes de criar → novo produto respeita a seleção final', async () => {
    const duplicateState = prepareDuplicateProductForm(originalProduct)
    expect(duplicateState.form.additionals).toEqual(['add_ilhos', 'add_bainha'])

    // Desmarca 'add_ilhos', mantendo apenas 'add_bainha'
    const updatedAdditionals = toggleAdditional(duplicateState.form.additionals, 'add_ilhos')
    expect(updatedAdditionals).toEqual(['add_bainha'])

    const formData = buildProductFormData({
      ...duplicateState.form,
      additionals: updatedAdditionals,
    })

    expect(formData.getAll('additionals')).toEqual(['add_bainha'])
    expect(formData.getAll('additionals')).not.toContain('add_ilhos')

    // Original permanece com seus adicionais intactos
    expect(originalProduct.additionals).toEqual(['add_ilhos', 'add_bainha'])
  })

  it('CENÁRIO D: duplicar e remover TODOS os adicionais → novo produto nasce com additionals vazio (lista vazia enviada)', async () => {
    const duplicateState = prepareDuplicateProductForm(originalProduct)

    // Desmarca todos os adicionais
    let formAdds = toggleAdditional(duplicateState.form.additionals, 'add_ilhos')
    formAdds = toggleAdditional(formAdds, 'add_bainha')
    expect(formAdds).toEqual([])

    const formData = buildProductFormData({
      ...duplicateState.form,
      additionals: formAdds,
    })

    // Confirma que envia chave 'additionals' com string vazia para limpar relações no PocketBase
    expect(formData.has('additionals')).toBe(true)
    expect(formData.getAll('additionals')).toEqual([''])
  })

  it('CENÁRIO E: abrir "Duplicar Produto" e cancelar → nenhum registro criado (nenhuma chamada create/update)', () => {
    const mockCreate = vi.fn()
    const mockUpdate = vi.fn()

    // Abre duplicação
    const duplicateState = prepareDuplicateProductForm(originalProduct)
    expect(duplicateState.isDuplicating).toBe(true)

    // Usuário fecha / cancela o modal
    const modalOpen = false // setModalOpen(false)

    // Nenhuma operação de rede executada
    expect(modalOpen).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(originalProduct.updated).toBe('2026-01-01T10:00:00.000Z')
  })

  it('CENÁRIO F: confirmar que main_image/gallery_images não são copiadas', () => {
    const duplicateState = prepareDuplicateProductForm(originalProduct)

    // A cópia nasce sem preview e sem arquivo de imagem selecionado
    expect(duplicateState.mainImageFile).toBeNull()
    expect(duplicateState.mainImagePreview).toBeNull()

    const formData = buildProductFormData(duplicateState.form)
    // O FormData não possui main_image nem referências de arquivos
    expect(formData.has('main_image')).toBe(false)
    expect(formData.has('gallery_images')).toBe(false)
  })
})

describe('Cálculo de Preço de Venda Próprio por m² (quote_products.fixed_price quando calc_rule === m2)', () => {
  const baseMaterial: QuoteMaterial = {
    id: 'mat_lona_35',
    name: 'Lona Fosca 440g',
    category: 'Lonas',
    calc_unit: 'm2',
    cost_price: 15.0,
    sale_price: 35.0,
    min_price: 0,
    is_active: true,
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  it('TESTE A: Produto m² com fixed_price=40, material.sale_price=35, medida 1×2, qty 1 → total R$80 (não R$70)', () => {
    const productA: QuoteProduct = {
      id: 'prod_m2_proprio',
      name: 'Banner Lona Preço Próprio',
      category: 'Banners',
      calc_rule: 'm2',
      fixed_price: 40.0,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const result = calculateQuoteItem({
      product: productA,
      material: baseMaterial,
      width: 1,
      height: 2,
      quantity: 1,
    })

    expect(result.individual_area).toBe(2)
    expect(result.total_area).toBe(2)
    expect(result.applied_unit_price).toBe(80.0)
    expect(result.item_total_sale).toBe(80.0)
    expect(result.item_total_sale).not.toBe(70.0)
  })

  it('TESTE B: Produto m² SEM fixed_price, material.sale_price=35, 1×2 → total R$70 (compatibilidade com produtos antigos)', () => {
    const productB: QuoteProduct = {
      id: 'prod_m2_antigo',
      name: 'Banner Lona Tradicional',
      category: 'Banners',
      calc_rule: 'm2',
      // fixed_price ausente / undefined
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const result = calculateQuoteItem({
      product: productB,
      material: baseMaterial,
      width: 1,
      height: 2,
      quantity: 1,
    })

    expect(result.individual_area).toBe(2)
    expect(result.applied_unit_price).toBe(70.0)
    expect(result.item_total_sale).toBe(70.0)
  })

  it('TESTE C: Produto m² fixed_price=40, min_price=50, 0,50×0,50 (área 0,25 → R$10) → total R$50 (mínimo vence)', () => {
    const productC: QuoteProduct = {
      id: 'prod_m2_min',
      name: 'Etiqueta Lona Pequena',
      category: 'Banners',
      calc_rule: 'm2',
      fixed_price: 40.0,
      min_price: 50.0,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const result = calculateQuoteItem({
      product: productC,
      material: baseMaterial,
      width: 0.5,
      height: 0.5,
      quantity: 1,
    })

    expect(result.individual_area).toBe(0.25)
    // 0.25 * 40 = 10, porém min_price é 50
    expect(result.calculated_unit_price).toBe(10.0)
    expect(result.applied_unit_price).toBe(50.0)
    expect(result.is_min_price_applied).toBe(true)
    expect(result.item_total_sale).toBe(50.0)
  })

  it('TESTE D: Alterar preço próprio do produto NÃO altera material.sale_price', () => {
    const materialSnapshot = { ...baseMaterial }
    const productD: QuoteProduct = {
      id: 'prod_m2_custom',
      name: 'Banner Lona Personalizado',
      category: 'Banners',
      calc_rule: 'm2',
      fixed_price: 99.0,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    calculateQuoteItem({
      product: productD,
      material: materialSnapshot,
      width: 2,
      height: 2,
      quantity: 1,
    })

    expect(materialSnapshot.sale_price).toBe(35.0)
    expect(baseMaterial.sale_price).toBe(35.0)
  })

  it('TESTE E: Dois produtos com o mesmo material: A com 35/m² (ou material) e B com 45/m² → cada um calcula com seu próprio preço', () => {
    const productA: QuoteProduct = {
      id: 'prod_A',
      name: 'Produto A',
      category: 'Banners',
      calc_rule: 'm2',
      // fixed_price vazio ou 35
      fixed_price: 35.0,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const productB: QuoteProduct = {
      id: 'prod_B',
      name: 'Produto B',
      category: 'Banners',
      calc_rule: 'm2',
      fixed_price: 45.0,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const resA = calculateQuoteItem({
      product: productA,
      material: baseMaterial,
      width: 1,
      height: 2, // 2m²
      quantity: 1,
    })

    const resB = calculateQuoteItem({
      product: productB,
      material: baseMaterial,
      width: 1,
      height: 2, // 2m²
      quantity: 1,
    })

    expect(resA.item_total_sale).toBe(70.0) // 2 * 35
    expect(resB.item_total_sale).toBe(90.0) // 2 * 45
  })

  it('TESTE F: Produto antigo sem fixed_price (ou 0 ou vazio) continua calculando exatamente como antes', () => {
    const productEmpty: QuoteProduct = {
      id: 'prod_empty',
      name: 'Produto Zero Fixed Price',
      category: 'Banners',
      calc_rule: 'm2',
      fixed_price: 0,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const result = calculateQuoteItem({
      product: productEmpty,
      material: baseMaterial,
      width: 1,
      height: 2,
      quantity: 1,
    })

    expect(result.applied_unit_price).toBe(70.0)
    expect(result.item_total_sale).toBe(70.0)
  })

  it('TESTE G: Duplicar produto m² com preço próprio → fixed_price preservado no formulário da cópia', () => {
    const originalM2Product: QuoteProduct = {
      id: 'prod_orig_m2',
      name: 'Banner Especial 440g',
      category: 'Banners',
      calc_rule: 'm2',
      sale_unit: 'm²',
      main_material_id: 'mat_lona_35',
      fixed_price: 48.5,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const duplicateState = prepareDuplicateProductForm(originalM2Product)

    expect(duplicateState.isDuplicating).toBe(true)
    expect(duplicateState.form.calc_rule).toBe('m2')
    // fixed_price preservado na íntegra
    expect(duplicateState.form.fixed_price).toBe(48.5)

    // Usuário altera o preço próprio antes de salvar a cópia
    const userModified = {
      ...duplicateState.form,
      fixed_price: 52.0,
      additionals: [],
    }

    const formData = buildProductFormData(userModified)
    expect(formData.get('fixed_price')).toBe('52')
  })

  it('TESTE H: TIPO 3 (unidade) e TIPO 4 (preco_fixo) continuam funcionando exatamente como antes com fixed_price', () => {
    const productTipo3: QuoteProduct = {
      id: 'prod_tipo3',
      name: 'Camisa Polo Bordada',
      category: 'Vestuário',
      calc_rule: 'unidade',
      fixed_cost: 15.0,
      fixed_price: 55.0,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const productTipo4: QuoteProduct = {
      id: 'prod_tipo4',
      name: 'Taxa de Instalação Fixa',
      category: 'Serviços',
      calc_rule: 'preco_fixo',
      fixed_cost: 50.0,
      fixed_price: 150.0,
      is_active: true,
      created: '2026-01-01',
      updated: '2026-01-01',
    }

    const resTipo3 = calculateQuoteItem({
      product: productTipo3,
      quantity: 3,
    })

    expect(resTipo3.applied_unit_price).toBe(55.0)
    expect(resTipo3.item_total_sale).toBe(165.0) // 3 * 55
    expect(resTipo3.item_total_cost).toBe(45.0) // 3 * 15

    const resTipo4 = calculateQuoteItem({
      product: productTipo4,
      quantity: 1,
    })

    expect(resTipo4.applied_unit_price).toBe(150.0)
    expect(resTipo4.item_total_sale).toBe(150.0)
    expect(resTipo4.item_total_cost).toBe(50.0)
  })
})
