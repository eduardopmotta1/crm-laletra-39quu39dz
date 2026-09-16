import { describe, it, expect, vi, beforeEach } from 'vitest'
import { productionService } from './production'
import pb from '@/lib/pocketbase/client'
import type { ProductionOrder } from '@/types/crm'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
      authStore: {
        record: { id: 'user_1', name: 'Tester', email: 'test@laletra.com.br' },
      },
    },
  }
})

describe('OrdersListPage and productionService paginated orders (Requisitos A até N)', () => {
  let mockOrders: ProductionOrder[]
  let getListCalls: Array<{ collection: string; page: number; perPage: number; options: any }>
  let updateCalls: Array<{ collection: string; id: string; data: any }>
  let createCalls: Array<{ collection: string; data: any }>

  beforeEach(() => {
    vi.clearAllMocks()
    getListCalls = []
    updateCalls = []
    createCalls = []

    mockOrders = [
      {
        id: 'ord_1',
        order_number: '#001865',
        client_name: 'Lorrayny Sander',
        client_phone: '5521964195429',
        product: 'Adesivo Brilho 0,10',
        quantity: 1,
        dimensions: '1,00x1,00m',
        total_value: 80,
        sales_rep_id: 'user_sales_1',
        production_rep_id: 'user_prod_1',
        promised_deadline: '2026-09-18T00:00:00.000Z',
        stage_internal_id: 'completed',
        stage_name: 'Concluído',
        is_completed: true,
        is_archived: true,
        created: '2026-09-15T23:49:32.788Z',
        updated: '2026-09-16T00:08:17.167Z',
        completed_at: '2026-09-16T00:00:00.000Z',
        expand: {
          sales_rep_id: { id: 'user_sales_1', name: 'Eduardo Motta' },
          production_rep_id: { id: 'user_prod_1', name: 'Carlos Produção' },
        },
      } as unknown as ProductionOrder,
      {
        id: 'ord_2',
        order_number: '#001864',
        client_name: 'Roseni Santos',
        client_phone: '5522981426280',
        product: 'Adesivo Brilho 0,10',
        quantity: 1,
        dimensions: '1,00x3,00m',
        total_value: 176.64,
        sales_rep_id: 'user_sales_1',
        production_rep_id: '',
        promised_deadline: '2026-09-16T00:00:00.000Z',
        stage_internal_id: 'shipped',
        stage_name: 'Enviado / Aguardando retirada',
        is_completed: false,
        is_archived: false,
        created: '2026-09-15T18:52:57.623Z',
        updated: '2026-09-15T18:53:41.508Z',
        completed_at: '',
        expand: {
          sales_rep_id: { id: 'user_sales_1', name: 'Eduardo Motta' },
        },
      } as unknown as ProductionOrder,
      {
        id: 'ord_3',
        order_number: '#001863',
        client_name: 'RILLARY DA SILVA',
        client_phone: '5521967612135',
        product: 'kit Painel + Saias',
        quantity: 1,
        dimensions: '1,00x1,50m',
        total_value: 149.9,
        sales_rep_id: '',
        production_rep_id: '',
        promised_deadline: '2026-09-17T00:00:00.000Z',
        stage_internal_id: 'in_production',
        stage_name: 'Em produção',
        is_completed: false,
        is_archived: false,
        created: '2026-09-15T16:07:27.100Z',
        updated: '2026-09-15T18:54:02.593Z',
        completed_at: '',
      } as unknown as ProductionOrder,
    ]

    const mockPbCollection = (collectionName: string) => ({
      getList: vi.fn(async (page: number, perPage: number, options?: any) => {
        getListCalls.push({ collection: collectionName, page, perPage, options })

        let filtered = [...mockOrders]
        const filterStr = options?.filter || ''

        // Simulated filter parsing for tests
        if (filterStr.includes('is_completed = false && is_archived = false')) {
          filtered = filtered.filter((o) => !o.is_completed && !o.is_archived)
        }
        if (filterStr.includes('is_completed = true')) {
          filtered = filtered.filter((o) => o.is_completed)
        }
        if (filterStr.includes('is_archived = true')) {
          filtered = filtered.filter((o) => o.is_archived)
        }
        if (filterStr.includes('stage_internal_id = "in_production"')) {
          filtered = filtered.filter((o) => o.stage_internal_id === 'in_production')
        }
        if (filterStr.includes('stage_internal_id = "ready" || stage_internal_id = "shipped"')) {
          filtered = filtered.filter(
            (o) => o.stage_internal_id === 'ready' || o.stage_internal_id === 'shipped',
          )
        }
        if (filterStr.includes('sales_rep_id = "user_sales_1"')) {
          filtered = filtered.filter((o) => o.sales_rep_id === 'user_sales_1')
        }

        const totalItems = filtered.length
        const totalPages = Math.max(1, Math.ceil(totalItems / perPage))
        const start = (page - 1) * perPage
        const items = filtered.slice(start, start + perPage)

        return {
          page,
          perPage,
          totalItems,
          totalPages,
          items,
        }
      }),
      update: vi.fn(async (id: string, data: any) => {
        updateCalls.push({ collection: collectionName, id, data })
        return { id, ...data }
      }),
      create: vi.fn(async (data: any) => {
        createCalls.push({ collection: collectionName, data })
        return { id: 'created_1', ...data }
      }),
    })

    vi.mocked(pb.collection).mockImplementation(mockPbCollection as any)
  })

  it('TESTE A: /pedidos usa ordenação padrão -created (mais recente primeiro)', async () => {
    const res = await productionService.getOrdersPaginated(1, 50, {}, '-created')
    expect(res).toBeDefined()
    const lastCall = getListCalls[getListCalls.length - 1]
    expect(lastCall.options.sort).toBe('-created')
  })

  it('TESTE B: paginação server-side real 50 por página, sem getFullList', async () => {
    const res = await productionService.getOrdersPaginated(1, 50, {})
    expect(res.perPage).toBe(50)
    expect(res.page).toBe(1)
    expect(res.totalItems).toBe(3)
    expect(res.totalPages).toBe(1)

    // Confirma que a chamada foi getList e não getFullList
    const lastCall = getListCalls[getListCalls.length - 1]
    expect(lastCall.page).toBe(1)
    expect(lastCall.perPage).toBe(50)
  })

  it('TESTE C/D/E: busca por order_number, cliente e telefone gera filtro OR server-side', () => {
    const filter = productionService.buildOrdersFilter({ search: '1865' })
    expect(filter).toContain('order_number ~ "1865"')
    expect(filter).toContain('client_name ~ "1865"')
    expect(filter).toContain('client_phone ~ "1865"')
  })

  it('TESTE F: filtro Em produção filtra apenas a etapa correta (stage_internal_id = "in_production")', async () => {
    const filter = productionService.buildOrdersFilter({ stageInternalId: 'in_production' })
    expect(filter).toBe('stage_internal_id = "in_production"')

    const res = await productionService.getOrdersPaginated(1, 50, {
      stageInternalId: 'in_production',
    })
    expect(res.items.every((i) => i.stage_internal_id === 'in_production')).toBe(true)
  })

  it('TESTE G: filtro Ativos filtra is_completed = false && is_archived = false', async () => {
    const filter = productionService.buildOrdersFilter({ situation: 'active' })
    expect(filter).toBe('is_completed = false && is_archived = false')

    const res = await productionService.getOrdersPaginated(1, 50, { situation: 'active' })
    expect(res.items.every((i) => !i.is_completed && !i.is_archived)).toBe(true)
  })

  it('TESTE H: filtro Concluídos filtra is_completed = true', async () => {
    const filter = productionService.buildOrdersFilter({ situation: 'completed' })
    expect(filter).toBe('is_completed = true')

    const res = await productionService.getOrdersPaginated(1, 50, { situation: 'completed' })
    expect(res.items.every((i) => i.is_completed)).toBe(true)
  })

  it('TESTE I: filtro Período Hoje filtra por intervalo de created do dia atual', () => {
    const filter = productionService.buildOrdersFilter({ period: 'today' })
    expect(filter).toContain('created >=')
    expect(filter).toContain('created <=')
  })

  it('TESTE J: filtro vendedor filtra por sales_rep_id', async () => {
    const filter = productionService.buildOrdersFilter({ salesRepId: 'user_sales_1' })
    expect(filter).toBe('sales_rep_id = "user_sales_1"')

    const res = await productionService.getOrdersPaginated(1, 50, { salesRepId: 'user_sales_1' })
    expect(res.items.every((i) => i.sales_rep_id === 'user_sales_1')).toBe(true)
  })

  it('TESTE M: indicadores representam a collection INTEIRA via queries server-side leves e NÃO dependem da página atual', async () => {
    const summary = await productionService.getOrdersIndicatorsSummary()
    expect(summary).toBeDefined()
    expect(typeof summary.ordersToday).toBe('number')
    expect(typeof summary.inProduction).toBe('number')
    expect(typeof summary.readyOrAwaitingPickup).toBe('number')
    expect(typeof summary.completedToday).toBe('number')

    // Confirma que foram feitas 4 chamadas getList(1, 1) leves
    const indicatorCalls = getListCalls.filter((c) => c.perPage === 1)
    expect(indicatorCalls.length).toBe(4)
  })

  it('TESTE N: nenhuma escrita no banco pela tela de listagem de pedidos', async () => {
    // Carregar página e indicadores apenas executa leitura
    await productionService.getOrdersPaginated(1, 50, { situation: 'active' })
    await productionService.getOrdersIndicatorsSummary()

    expect(updateCalls).toHaveLength(0)
    expect(createCalls).toHaveLength(0)
  })
})
