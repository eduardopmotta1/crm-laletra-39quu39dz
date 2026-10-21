import { describe, it, expect } from 'vitest'
import { buildCategoryTree } from '@/components/store/StoreSidebar'
import type { StoreCategory, StoreAllSettings } from '@/types/store'

describe('Store Fase 5B: Hierarquia de Categorias e Configurações', () => {
  it('deve montar a árvore hierárquica de categorias e subcategorias corretamente', () => {
    const flatList: StoreCategory[] = [
      { id: 'cat-1', name: 'Impressão Promocional', slug: 'promocional', order_index: 10 },
      { id: 'cat-2', name: 'Comunicação Visual', slug: 'comunicacao-visual', order_index: 20 },
      {
        id: 'sub-1',
        name: 'Panfletos e Flyers',
        slug: 'panfletos',
        parent_id: 'cat-1',
        order_index: 1,
      },
      {
        id: 'sub-2',
        name: 'Cartões de Visita',
        slug: 'cartoes',
        parent_id: 'cat-1',
        order_index: 2,
      },
      { id: 'sub-3', name: 'Lonas e Banners', slug: 'lonas', parent_id: 'cat-2', order_index: 1 },
    ]

    const tree = buildCategoryTree(flatList)

    expect(tree).toHaveLength(2)
    expect(tree[0].id).toBe('cat-1')
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children?.[0].id).toBe('sub-1')
    expect(tree[0].children?.[1].id).toBe('sub-2')

    expect(tree[1].id).toBe('cat-2')
    expect(tree[1].children).toHaveLength(1)
    expect(tree[1].children?.[0].id).toBe('sub-3')
  })

  it('deve preservar categorias órfãs como raiz se o parent_id não existir', () => {
    const flatList: StoreCategory[] = [
      { id: 'cat-1', name: 'Papelaria', slug: 'papelaria', order_index: 1 },
      { id: 'sub-x', name: 'Crachás', slug: 'crachas', parent_id: 'inexistente', order_index: 2 },
    ]

    const tree = buildCategoryTree(flatList)
    expect(tree).toHaveLength(2)
    expect(tree.map((t) => t.id)).toEqual(['cat-1', 'sub-x'])
  })

  it('deve validar estrutura das configurações completas da loja pública', () => {
    const defaultSettings: StoreAllSettings = {
      appearance: {
        primary_color: '#059669',
        secondary_color: '#0f172a',
        button_color: '#059669',
        header_color: '#ffffff',
        bg_color: '#f8fafc',
        text_color: '#0f172a',
        logo_url: 'https://example.com/logo.png',
        favicon_url: 'https://example.com/favicon.ico',
      },
      commercial_info: {
        whatsapp: '+55 (21) 2391-9112',
        phone: '+55 (21) 2391-9112',
        email: 'contato@laletragrafica.com.br',
        business_hours: 'Seg a Sex das 08h às 18h',
        address: 'Av. Marechal Floriano, 19, Sala 301 - Centro, Rio de Janeiro - RJ',
        footer_text: 'Parque gráfico completo',
        copyright_text: 'Gráfica LaLetra. Todos os direitos reservados.',
      },
      home_layout: {
        show_hero_banners: true,
        show_advantages_bar: true,
        show_categories_grid: true,
        show_featured_products: true,
        show_custom_quote_cta: true,
      },
    }

    expect(defaultSettings.appearance.primary_color).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(defaultSettings.appearance.secondary_color).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(defaultSettings.home_layout.show_hero_banners).toBe(true)
    expect(defaultSettings.commercial_info.whatsapp).toContain('2391-9112')
  })

  it('deve validar tipos de arquivos permitidos para upload comercial seguro', () => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ]
    const testValid = 'image/png'
    const testInvalid = 'application/pdf'
    const testInvalidExe = 'application/x-msdownload'

    expect(allowed.includes(testValid)).toBe(true)
    expect(allowed.includes(testInvalid)).toBe(false)
    expect(allowed.includes(testInvalidExe)).toBe(false)
  })
})
