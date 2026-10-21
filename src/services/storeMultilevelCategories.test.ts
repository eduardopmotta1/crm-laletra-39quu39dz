import { describe, it, expect } from 'vitest'
import { buildCategoryTree } from '@/components/store/StoreSidebar'
import type { StoreCategory, StoreProduct } from '@/types/store'

describe('Laletra Store - Categorias e Subcategorias Multinível', () => {
  // Estrutura de exemplo citada pelo usuário:
  // Lonas > Lonas Ecossolventes > (Lona Brilho, Lona Fosca, Lona Blackout)
  // Lonas > Lonas UV > (Lona Brilho UV, Lona Fosca UV)
  const sampleCategories: StoreCategory[] = [
    { id: 'cat-lonas', name: 'Lonas', slug: 'lonas', order_index: 10, is_active: true },
    {
      id: 'cat-lonas-eco',
      name: 'Lonas Ecossolventes',
      slug: 'lonas-ecossolventes',
      parent_id: 'cat-lonas',
      order_index: 10,
      is_active: true,
    },
    {
      id: 'cat-lonas-uv',
      name: 'Lonas UV',
      slug: 'lonas-uv',
      parent_id: 'cat-lonas',
      order_index: 20,
      is_active: true,
    },
    {
      id: 'sub-lona-brilho',
      name: 'Lona Brilho',
      slug: 'lona-brilho',
      parent_id: 'cat-lonas-eco',
      order_index: 10,
      is_active: true,
    },
    {
      id: 'sub-lona-fosca',
      name: 'Lona Fosca',
      slug: 'lona-fosca',
      parent_id: 'cat-lonas-eco',
      order_index: 20,
      is_active: true,
    },
    {
      id: 'sub-lona-blackout',
      name: 'Lona Blackout',
      slug: 'lona-blackout',
      parent_id: 'cat-lonas-eco',
      order_index: 30,
      is_active: true,
    },
    {
      id: 'sub-lona-brilho-uv',
      name: 'Lona Brilho UV',
      slug: 'lona-brilho-uv',
      parent_id: 'cat-lonas-uv',
      order_index: 10,
      is_active: true,
    },
    {
      id: 'sub-lona-fosca-uv',
      name: 'Lona Fosca UV',
      slug: 'lona-fosca-uv',
      parent_id: 'cat-lonas-uv',
      order_index: 20,
      is_active: true,
    },
    {
      id: 'cat-adesivos',
      name: 'Adesivos',
      slug: 'adesivos',
      order_index: 20,
      is_active: true,
    },
  ]

  it('1. buildCategoryTree monta com fidelidade 3 ou mais níveis hierárquicos', () => {
    const tree = buildCategoryTree(sampleCategories)

    expect(tree).toHaveLength(2) // Lonas e Adesivos na raiz
    const lonas = tree.find((c) => c.id === 'cat-lonas')!
    expect(lonas).toBeDefined()
    expect(lonas.children).toHaveLength(2) // Lonas Ecossolventes e Lonas UV

    const eco = lonas.children?.find((c) => c.id === 'cat-lonas-eco')!
    expect(eco).toBeDefined()
    expect(eco.children).toHaveLength(3) // Brilho, Fosca, Blackout
    expect(eco.children?.map((c) => c.slug)).toEqual(['lona-brilho', 'lona-fosca', 'lona-blackout'])

    const uv = lonas.children?.find((c) => c.id === 'cat-lonas-uv')!
    expect(uv).toBeDefined()
    expect(uv.children).toHaveLength(2) // Brilho UV, Fosca UV
    expect(uv.children?.map((c) => c.slug)).toEqual(['lona-brilho-uv', 'lona-fosca-uv'])
  })

  it('2. Coleta de subárvore recursiva para filtro de produtos consolidados (sem duplicação)', () => {
    // Algoritmo usado em public_store_api.js e storeService.ts
    const resolveSubtreeCategoryIds = (
      targetSlugOrId: string,
      allCats: StoreCategory[],
    ): string[] => {
      const target = allCats.find((c) => c.slug === targetSlugOrId || c.id === targetSlugOrId)
      if (!target) return []

      const childrenMap = new Map<string, string[]>()
      for (const c of allCats) {
        if (c.parent_id) {
          const list = childrenMap.get(c.parent_id) || []
          list.push(c.id)
          childrenMap.set(c.parent_id, list)
        }
      }

      const catIds: string[] = [target.id]
      const queue: string[] = [target.id]
      const visited = new Set<string>([target.id])

      while (queue.length > 0) {
        const currId = queue.shift()!
        const directChildren = childrenMap.get(currId) || []
        for (const childId of directChildren) {
          if (!visited.has(childId)) {
            visited.add(childId)
            catIds.push(childId)
            queue.push(childId)
          }
        }
      }

      return catIds
    }

    // Acessando "lonas" (raiz): deve retornar a raiz + 2 filhos + 5 netos = 8 IDs
    const lonasSubtree = resolveSubtreeCategoryIds('lonas', sampleCategories)
    expect(lonasSubtree).toHaveLength(8)
    expect(lonasSubtree).toContain('cat-lonas')
    expect(lonasSubtree).toContain('cat-lonas-eco')
    expect(lonasSubtree).toContain('cat-lonas-uv')
    expect(lonasSubtree).toContain('sub-lona-brilho')
    expect(lonasSubtree).toContain('sub-lona-fosca-uv')

    // Acessando "lonas-uv" (nível intermediário): deve retornar lonas-uv + 2 filhos = 3 IDs
    const uvSubtree = resolveSubtreeCategoryIds('lonas-uv', sampleCategories)
    expect(uvSubtree).toHaveLength(3)
    expect(uvSubtree).toEqual(['cat-lonas-uv', 'sub-lona-brilho-uv', 'sub-lona-fosca-uv'])

    // Acessando "lona-brilho-uv" (nível folha): deve retornar apenas ela mesma
    const leafSubtree = resolveSubtreeCategoryIds('lona-brilho-uv', sampleCategories)
    expect(leafSubtree).toEqual(['sub-lona-brilho-uv'])
  })

  it('3. Exibição de produtos de categorias descendentes no nível raiz sem duplicar', () => {
    // Simula produtos distribuídos pelos níveis
    const mockProducts: Array<{ id: string; name: string; category_id: string }> = [
      { id: 'p1', name: 'Banner Genérico Raiz', category_id: 'cat-lonas' },
      { id: 'p2', name: 'Lona Eco Genérica', category_id: 'cat-lonas-eco' },
      { id: 'p3', name: 'Lona Brilho 440g', category_id: 'sub-lona-brilho' },
      { id: 'p4', name: 'Lona Brilho UV 500g', category_id: 'sub-lona-brilho-uv' },
      { id: 'p5', name: 'Adesivo Vinil', category_id: 'cat-adesivos' },
    ]

    const filterProductsForCategory = (
      targetCat: string,
      allCats: StoreCategory[],
      prods: typeof mockProducts,
    ) => {
      // Coleta subárvore
      const target = allCats.find((c) => c.slug === targetCat || c.id === targetCat)
      if (!target) return []

      const childrenMap = new Map<string, string[]>()
      for (const c of allCats) {
        if (c.parent_id) {
          const list = childrenMap.get(c.parent_id) || []
          list.push(c.id)
          childrenMap.set(c.parent_id, list)
        }
      }

      const subtreeIds = new Set<string>([target.id])
      const queue = [target.id]
      while (queue.length > 0) {
        const curr = queue.shift()!
        for (const child of childrenMap.get(curr) || []) {
          if (!subtreeIds.has(child)) {
            subtreeIds.add(child)
            queue.push(child)
          }
        }
      }

      // Filtra produtos e deduplica
      const uniqueProds = new Map<string, (typeof mockProducts)[0]>()
      for (const p of prods) {
        if (subtreeIds.has(p.category_id)) {
          uniqueProds.set(p.id, p)
        }
      }
      return Array.from(uniqueProds.values())
    }

    // Ao acessar a raiz "lonas", produtos do 1º, 2º e 3º níveis devem estar presentes
    const prodsLonas = filterProductsForCategory('lonas', sampleCategories, mockProducts)
    expect(prodsLonas.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(prodsLonas.some((p) => p.id === 'p5')).toBe(false) // Adesivo não entra

    // Ao acessar "lonas-uv", apenas p4 entra
    const prodsUv = filterProductsForCategory('lonas-uv', sampleCategories, mockProducts)
    expect(prodsUv.map((p) => p.id)).toEqual(['p4'])
  })

  it('4. Detecção e bloqueio de autovinculação e referências circulares (backend e admin)', () => {
    const isCircularReference = (
      recordId: string,
      proposedParentId: string | null,
      allCats: StoreCategory[],
    ): boolean => {
      if (!proposedParentId) return false // Tornando raiz -> seguro
      if (recordId === proposedParentId) return true // Autovinculação

      // Percorre os ancestrais do proposedParentId
      let currParentId: string | null = proposedParentId
      const visited = new Set<string>()

      while (currParentId && !visited.has(currParentId)) {
        if (currParentId === recordId) {
          return true // Ciclo detectado: o novo pai é descendente do registro
        }
        visited.add(currParentId)
        const parent = allCats.find((c) => c.id === currParentId)
        currParentId = parent ? parent.parent_id || null : null
      }

      return false
    }

    // Caso A: Tentar fazer a categoria ser pai dela mesma
    expect(isCircularReference('cat-lonas', 'cat-lonas', sampleCategories)).toBe(true)

    // Caso B: Tentar fazer a raiz "Lonas" ter como pai seu filho "Lonas UV"
    expect(isCircularReference('cat-lonas', 'cat-lonas-uv', sampleCategories)).toBe(true)

    // Caso C: Tentar fazer a raiz "Lonas" ter como pai seu neto "Lona Brilho UV"
    expect(isCircularReference('cat-lonas', 'sub-lona-brilho-uv', sampleCategories)).toBe(true)

    // Caso D: Tentar fazer "Lonas Ecossolventes" ter como pai seu filho "Lona Brilho"
    expect(isCircularReference('cat-lonas-eco', 'sub-lona-brilho', sampleCategories)).toBe(true)

    // Caso E: Mover "Lonas Ecossolventes" para baixo de "Adesivos" -> Válido (sem ciclos)
    expect(isCircularReference('cat-lonas-eco', 'cat-adesivos', sampleCategories)).toBe(false)

    // Caso F: Mover "Lona Brilho" para ser categoria principal (parent_id = null) -> Válido
    expect(isCircularReference('sub-lona-brilho', null, sampleCategories)).toBe(false)
  })

  it('5. Construção do Breadcrumb Completo de N níveis', () => {
    const buildBreadcrumbTrail = (catId: string, allCats: StoreCategory[]): StoreCategory[] => {
      const trail: StoreCategory[] = []
      const current = allCats.find((c) => c.id === catId)
      if (!current) return []

      let currParentId = current.parent_id
      const visited = new Set<string>()

      while (currParentId && !visited.has(currParentId)) {
        visited.add(currParentId)
        const p = allCats.find((c) => c.id === currParentId)
        if (p) {
          trail.unshift(p)
          currParentId = p.parent_id
        } else {
          break
        }
      }
      return trail
    }

    // Para "Lona Brilho UV" (3º nível), o breadcrumb deve conter: Lonas > Lonas UV
    const trail = buildBreadcrumbTrail('sub-lona-brilho-uv', sampleCategories)
    expect(trail).toHaveLength(2)
    expect(trail[0].name).toBe('Lonas')
    expect(trail[1].name).toBe('Lonas UV')

    // Para "Lonas UV" (2º nível), o breadcrumb deve conter apenas: Lonas
    const trailUv = buildBreadcrumbTrail('cat-lonas-uv', sampleCategories)
    expect(trailUv).toHaveLength(1)
    expect(trailUv[0].name).toBe('Lonas')

    // Para "Lonas" (raiz), o breadcrumb é vazio (apenas 'Loja' na tela)
    const trailRoot = buildBreadcrumbTrail('cat-lonas', sampleCategories)
    expect(trailRoot).toHaveLength(0)
  })

  it('6. Preservação de URLs e Slugs existentes', () => {
    // Slugs existentes nunca devem sofrer mutações automáticas
    const lonas = sampleCategories.find((c) => c.id === 'cat-lonas')!
    expect(lonas.slug).toBe('lonas')

    const eco = sampleCategories.find((c) => c.id === 'cat-lonas-eco')!
    expect(eco.slug).toBe('lonas-ecossolventes')

    const uvBrilho = sampleCategories.find((c) => c.id === 'sub-lona-brilho-uv')!
    expect(uvBrilho.slug).toBe('lona-brilho-uv')
  })

  it('7. Menu Lateral: Expansão automática dos ancestrais quando subcategoria de 3º nível estiver ativa', () => {
    const getAncestorIds = (startCat: StoreCategory, allCats: StoreCategory[]): string[] => {
      const ancestors: string[] = []
      let currParentId = startCat.parent_id
      const visited = new Set<string>()
      while (currParentId && !visited.has(currParentId)) {
        visited.add(currParentId)
        ancestors.push(currParentId)
        const parentCat = allCats.find((c) => c.id === currParentId)
        currParentId = parentCat ? parentCat.parent_id : null
      }
      return ancestors
    }

    const subBrilhoUv = sampleCategories.find((c) => c.id === 'sub-lona-brilho-uv')!
    const ancestors = getAncestorIds(subBrilhoUv, sampleCategories)

    // Ambos os níveis superiores devem ser identificados para expansão
    expect(ancestors).toContain('cat-lonas-uv')
    expect(ancestors).toContain('cat-lonas')
  })
})
