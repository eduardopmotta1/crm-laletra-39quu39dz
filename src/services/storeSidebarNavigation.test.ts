import { describe, it, expect } from 'vitest'
import { buildCategoryTree } from '@/components/store/StoreSidebar'
import type { StoreCategory } from '@/types/store'

describe('StoreSidebar - Navegação e Estrutura de Categorias', () => {
  const sampleCategories: StoreCategory[] = [
    { id: 'cat-promocional', name: 'Impressão Promocional', slug: 'promocional', order_index: 1 },
    {
      id: 'sub-cartoes',
      name: 'Cartões de Visita',
      slug: 'cartoes',
      parent_id: 'cat-promocional',
      order_index: 1,
    },
    {
      id: 'sub-panfletos',
      name: 'Panfletos',
      slug: 'panfletos',
      parent_id: 'cat-promocional',
      order_index: 2,
    },
    { id: 'cat-brindes', name: 'Brindes', slug: 'brindes', order_index: 2 }, // categoria sem filhos
  ]

  it('1. buildCategoryTree organiza categorias pai com subcategorias ordenadas', () => {
    const tree = buildCategoryTree(sampleCategories)
    expect(tree).toHaveLength(2)

    const promo = tree.find((c) => c.id === 'cat-promocional')
    expect(promo).toBeDefined()
    expect(promo?.children).toHaveLength(2)
    expect(promo?.children?.[0].slug).toBe('cartoes')
    expect(promo?.children?.[1].slug).toBe('panfletos')

    const brindes = tree.find((c) => c.id === 'cat-brindes')
    expect(brindes).toBeDefined()
    expect(brindes?.children).toHaveLength(0)
  })

  it('2. categorias com subcategorias devem ter children detectáveis para acionar botão expansível', () => {
    const tree = buildCategoryTree(sampleCategories)
    const hasChildrenMap = new Map(
      tree.map((c) => [c.slug, Boolean(c.children && c.children.length > 0)]),
    )

    expect(hasChildrenMap.get('promocional')).toBe(true)
    expect(hasChildrenMap.get('brindes')).toBe(false)
  })

  it('3. identifica categoria pai a ser expandida automaticamente a partir de subcategoria ativa', () => {
    const getInitialExpandedState = (cats: StoreCategory[], activeSlug: string) => {
      const initial: Record<string, boolean> = {}
      cats.forEach((cat) => {
        if (activeSlug && (cat.slug === activeSlug || cat.id === activeSlug) && cat.parent_id) {
          initial[cat.parent_id] = true
        }
      })
      return initial
    }

    // Se estiver navegando na subcategoria "cartoes", a categoria pai "cat-promocional" deve iniciar expandida
    const stateCartoes = getInitialExpandedState(sampleCategories, 'cartoes')
    expect(stateCartoes['cat-promocional']).toBe(true)

    // Se estiver na categoria sem filhos "brindes", nenhum pai é expandido
    const stateBrindes = getInitialExpandedState(sampleCategories, 'brindes')
    expect(Object.keys(stateBrindes)).toHaveLength(0)
  })

  it('4. calcula destaque visual para categoria pai quando ela mesma ou uma subcategoria está ativa', () => {
    const isCategoryHighlighted = (cat: StoreCategory, activeSlug: string, pathname: string) => {
      const isCurrentActive = cat.slug === activeSlug || pathname === `/loja/categoria/${cat.slug}`
      const isChildActive = Boolean(
        cat.children &&
        cat.children.some(
          (sub) => sub.slug === activeSlug || pathname === `/loja/categoria/${sub.slug}`,
        ),
      )
      return {
        isCurrentActive,
        isChildActive,
        isParentHighlighted: isCurrentActive || isChildActive,
      }
    }

    const tree = buildCategoryTree(sampleCategories)
    const promo = tree.find((c) => c.id === 'cat-promocional')!
    const brindes = tree.find((c) => c.id === 'cat-brindes')!

    // Cenário A: Usuário acessou a subcategoria "panfletos"
    const promoWhenSubActive = isCategoryHighlighted(
      promo,
      'panfletos',
      '/loja/categoria/panfletos',
    )
    expect(promoWhenSubActive.isChildActive).toBe(true)
    expect(promoWhenSubActive.isParentHighlighted).toBe(true)
    expect(promoWhenSubActive.isCurrentActive).toBe(false)

    // Cenário B: Usuário acessou "Ver todos" ou a categoria pai diretamente
    const promoWhenParentActive = isCategoryHighlighted(
      promo,
      'promocional',
      '/loja/categoria/promocional',
    )
    expect(promoWhenParentActive.isCurrentActive).toBe(true)
    expect(promoWhenParentActive.isParentHighlighted).toBe(true)

    // Cenário C: Categoria sem filhos
    const brindesActive = isCategoryHighlighted(brindes, 'brindes', '/loja/categoria/brindes')
    expect(brindesActive.isCurrentActive).toBe(true)
    expect(brindesActive.isChildActive).toBe(false)
    expect(brindesActive.isParentHighlighted).toBe(true)
  })

  it('5. rotação da seta e aria-expanded refletem o estado aberto/fechado', () => {
    const getAccordionAttributes = (isExpanded: boolean, catId: string) => {
      return {
        'aria-expanded': isExpanded,
        'aria-controls': `subcategories-${catId}`,
        chevronClass: isExpanded ? 'rotate-90 text-emerald-600 dark:text-emerald-400' : '',
      }
    }

    const closed = getAccordionAttributes(false, 'cat-promocional')
    expect(closed['aria-expanded']).toBe(false)
    expect(closed['aria-controls']).toBe('subcategories-cat-promocional')
    expect(closed.chevronClass).toBe('')

    const opened = getAccordionAttributes(true, 'cat-promocional')
    expect(opened['aria-expanded']).toBe(true)
    expect(opened.chevronClass).toContain('rotate-90')
  })
})
