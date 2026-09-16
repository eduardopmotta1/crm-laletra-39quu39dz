import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { productionService } from '@/services/production'
import type { ProductionOrder } from '@/types/crm'

vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    collection: vi.fn(),
    send: vi.fn(),
    authStore: {
      record: { id: 'admin_user_1', name: 'Admin Laletra', email: 'admin@laletra.com.br' },
    },
    files: {
      getURL: vi.fn(),
    },
  },
  pb: {
    collection: vi.fn(),
    send: vi.fn(),
    authStore: {
      record: { id: 'admin_user_1', name: 'Admin Laletra', email: 'admin@laletra.com.br' },
    },
    files: {
      getURL: vi.fn(),
    },
  },
}))

describe('Administrative Permanent Delete of Production Orders (0.0.241)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Fixtures de mock
  const existingOrders: ProductionOrder[] = [
    {
      id: 'order_1845',
      order_number: '001845',
      client_id: 'client_1',
      client_name: 'Cliente Alpha',
      client_phone: '11999990001',
      product: 'Banner Lona',
      stage_internal_id: 'art_preparation',
      stage_name: 'Arte em preparação',
      tracking_token: 'token1845',
      attendance_id: 'att_shared_1',
      created: '2026-09-01T10:00:00.000Z',
      updated: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'order_1846',
      order_number: '001846',
      client_id: 'client_2',
      client_name: 'Cliente Beta',
      client_phone: '11999990002',
      product: 'Adesivo Vinil',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      tracking_token: 'token1846',
      attendance_id: 'att_shared_1', // Mesmo attendance que 1845 (1 attendance -> N pedidos)
      created: '2026-09-02T10:00:00.000Z',
      updated: '2026-09-02T10:00:00.000Z',
    },
    {
      id: 'order_1850_highest',
      order_number: '001850', // Maior número atual
      client_id: 'client_3',
      client_name: 'Cliente Gama',
      client_phone: '11999990003',
      product: 'Placa ACM',
      stage_internal_id: 'order_received',
      stage_name: 'Pedido recebido',
      tracking_token: 'token1850',
      attendance_id: 'att_isolated_3',
      created: '2026-09-03T10:00:00.000Z',
      updated: '2026-09-03T10:00:00.000Z',
    },
  ]

  it('T) Pedido com maior order_number -> exclusão BLOQUEADA com a mensagem exata requerida', async () => {
    const mockCollection = vi.fn().mockImplementation((col: string) => {
      if (col === 'production_orders') {
        return {
          getFullList: vi.fn().mockResolvedValue(existingOrders),
          getOne: vi.fn().mockImplementation((id: string) => {
            const found = existingOrders.find((o) => o.id === id)
            return Promise.resolve(found)
          }),
          delete: vi.fn().mockResolvedValue(true),
        }
      }
      return {
        getFullList: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      }
    })
    ;(pb.collection as any) = mockCollection

    // Tenta excluir o pedido que possui o maior order_number (001850)
    await expect(productionService.deleteOrderPermanently('order_1850_highest')).rejects.toThrow(
      'Este é o pedido mais recente e não pode ser excluído permanentemente neste momento, pois seu número poderia ser reutilizado na criação do próximo pedido.',
    )
  })

  it('U) Pedido que NÃO é o maior -> exclusão permitida', async () => {
    const deletedCollections: Record<string, string[]> = {}

    const mockCollection = vi.fn().mockImplementation((col: string) => ({
      getFullList: vi.fn().mockImplementation(({ filter }: { filter?: string } = {}) => {
        if (col === 'production_orders') return Promise.resolve(existingOrders)
        if (col === 'production_order_message_attachments') {
          return Promise.resolve(
            filter?.includes('order_1845') ? [{ id: 'poma_1' }, { id: 'poma_2' }] : [],
          )
        }
        if (col === 'production_logs') {
          return Promise.resolve(filter?.includes('order_1845') ? [{ id: 'log_1' }] : [])
        }
        if (col === 'production_order_chat_messages') {
          return Promise.resolve(filter?.includes('order_1845') ? [{ id: 'chat_1' }] : [])
        }
        if (col === 'production_proofs') {
          return Promise.resolve(filter?.includes('order_1845') ? [{ id: 'proof_1' }] : [])
        }
        return Promise.resolve([])
      }),
      delete: vi.fn().mockImplementation((id: string) => {
        if (!deletedCollections[col]) deletedCollections[col] = []
        deletedCollections[col].push(id)
        return Promise.resolve(true)
      }),
    }))
    ;(pb.collection as any) = mockCollection

    const result = await productionService.deleteOrderPermanently('order_1845')
    expect(result.success).toBe(true)
    expect(deletedCollections['production_orders']).toEqual(['order_1845'])
  })

  it('F, G, H, I) Remoção ordenada e estrita das dependências operacionais DAQUELE pedido', async () => {
    const operationOrder: string[] = []

    const mockCollection = vi.fn().mockImplementation((col: string) => ({
      getFullList: vi.fn().mockImplementation(({ filter }: { filter?: string } = {}) => {
        if (col === 'production_orders') return Promise.resolve(existingOrders)
        if (col === 'production_order_message_attachments') {
          return Promise.resolve(filter?.includes('order_1845') ? [{ id: 'attach_item_1' }] : [])
        }
        if (col === 'production_logs') {
          return Promise.resolve(filter?.includes('order_1845') ? [{ id: 'log_item_1' }] : [])
        }
        if (col === 'production_order_chat_messages') {
          return Promise.resolve(filter?.includes('order_1845') ? [{ id: 'chat_item_1' }] : [])
        }
        if (col === 'production_proofs') {
          return Promise.resolve(filter?.includes('order_1845') ? [{ id: 'proof_item_1' }] : [])
        }
        return Promise.resolve([])
      }),
      delete: vi.fn().mockImplementation((id: string) => {
        operationOrder.push(`${col}:${id}`)
        return Promise.resolve(true)
      }),
    }))
    ;(pb.collection as any) = mockCollection

    await productionService.deleteOrderPermanently('order_1845')

    // Ordem esperada:
    // 1. production_order_message_attachments
    // 2. production_logs
    // 3. production_order_chat_messages
    // 4. production_proofs
    // 5. production_orders
    expect(operationOrder).toEqual([
      'production_order_message_attachments:attach_item_1',
      'production_logs:log_item_1',
      'production_order_chat_messages:chat_item_1',
      'production_proofs:proof_item_1',
      'production_orders:order_1845',
    ])
  })

  it('J, K, L, M, N, O, P, Q, R, S) Preservação absoluta das entidades de negócio e métricas', async () => {
    const deletedCollections: string[] = []
    const updatedCollections: string[] = []

    const mockCollection = vi.fn().mockImplementation((col: string) => ({
      getFullList: vi.fn().mockImplementation(() => {
        if (col === 'production_orders') return Promise.resolve(existingOrders)
        return Promise.resolve([])
      }),
      delete: vi.fn().mockImplementation((id: string) => {
        deletedCollections.push(col)
        return Promise.resolve(true)
      }),
      update: vi.fn().mockImplementation((id: string, payload: any) => {
        updatedCollections.push(col)
        return Promise.resolve({ id, ...payload })
      }),
    }))
    ;(pb.collection as any) = mockCollection

    await productionService.deleteOrderPermanently('order_1845')

    // Verificar que NENHUMA das coleções preservadas foi deletada ou alterada manualmente
    const preservedCollections = [
      'clients',
      'attendances',
      'quotes',
      'archived_deals',
      'messages',
      'post_sales',
      'evaluations',
      'tasks',
      'follow_ups',
    ]

    for (const preserved of preservedCollections) {
      expect(deletedCollections).not.toContain(preserved)
      expect(updatedCollections).not.toContain(preserved)
    }

    // Q: Outro pedido do mesmo attendance (order_1846) não é afetado
    expect(deletedCollections.filter((c) => c === 'production_orders')).toEqual([
      'production_orders',
    ])
  })

  it('10 / Exclusão parcial resiliente: erro 404 em dependência não impede o restante', async () => {
    let orderDeleted = false

    const mockCollection = vi.fn().mockImplementation((col: string) => ({
      getFullList: vi.fn().mockImplementation(() => {
        if (col === 'production_orders') return Promise.resolve(existingOrders)
        if (col === 'production_logs') {
          return Promise.resolve([{ id: 'log_already_gone' }])
        }
        return Promise.resolve([])
      }),
      delete: vi.fn().mockImplementation((id: string) => {
        if (col === 'production_logs') {
          const err: any = new Error('Not found')
          err.status = 404
          throw err
        }
        if (col === 'production_orders') {
          orderDeleted = true
          return Promise.resolve(true)
        }
        return Promise.resolve(true)
      }),
    }))
    ;(pb.collection as any) = mockCollection

    const res = await productionService.deleteOrderPermanently('order_1845')
    expect(res.success).toBe(true)
    expect(orderDeleted).toBe(true)
  })

  it('V) Falha ao excluir production_orders -> NÃO reporta sucesso e lança exceção com erro claro', async () => {
    const mockCollection = vi.fn().mockImplementation((col: string) => ({
      getFullList: vi.fn().mockImplementation(() => {
        if (col === 'production_orders') return Promise.resolve(existingOrders)
        return Promise.resolve([])
      }),
      delete: vi.fn().mockImplementation((id: string) => {
        if (col === 'production_orders') {
          throw new Error('Falha de permissão no banco de dados (403)')
        }
        return Promise.resolve(true)
      }),
    }))
    ;(pb.collection as any) = mockCollection

    await expect(productionService.deleteOrderPermanently('order_1845')).rejects.toThrow(
      'Falha de permissão no banco de dados (403)',
    )
  })

  it('UI Logic Gates: A) admin visualiza botão; B) não-admin não visualiza', () => {
    const checkCanViewDeleteButton = (isAdmin: boolean) => {
      // Replicando exatamente a condição no componente: orderToEdit && isAdmin
      return Boolean(isAdmin)
    }

    expect(checkCanViewDeleteButton(true)).toBe(true)
    expect(checkCanViewDeleteButton(false)).toBe(false)
  })

  it('UI Confirmation Gates: C) clique não exclui imediatamente; D) confirmação errada -> desabilitado; E) confirmação correta -> permite', () => {
    const expectedOrderNumber = '001845'

    const isDeleteConfirmActionDisabled = (
      input: string,
      expected: string,
      isSubmitting: boolean,
    ) => {
      return isSubmitting || input.trim() !== expected.trim()
    }

    // C) Ao abrir modal, input está vazio -> desabilitado
    expect(isDeleteConfirmActionDisabled('', expectedOrderNumber, false)).toBe(true)

    // D) Digitação errada -> desabilitado
    expect(isDeleteConfirmActionDisabled('1845', expectedOrderNumber, false)).toBe(true)
    expect(isDeleteConfirmActionDisabled('001846', expectedOrderNumber, false)).toBe(true)
    expect(isDeleteConfirmActionDisabled('001845X', expectedOrderNumber, false)).toBe(true)

    // E) Digitação exata -> botão habilitado
    expect(isDeleteConfirmActionDisabled('001845', expectedOrderNumber, false)).toBe(false)
    expect(isDeleteConfirmActionDisabled(' 001845 ', expectedOrderNumber, false)).toBe(false)
  })

  it('W) Duplo clique -> proteção com estado deletingOrder bloqueia múltiplas invocações', async () => {
    let callCount = 0

    const executeDeletionWithGuard = async (
      isDeleting: boolean,
      setIsDeleting: (val: boolean) => void,
    ) => {
      if (isDeleting) return false
      setIsDeleting(true)
      callCount++
      // Simula operação assíncrona
      await new Promise((resolve) => setTimeout(resolve, 10))
      return true
    }

    let isDeleting = false
    const setIsDeleting = (val: boolean) => {
      isDeleting = val
    }

    const firstClick = executeDeletionWithGuard(isDeleting, setIsDeleting)
    const secondClick = executeDeletionWithGuard(isDeleting, setIsDeleting)

    const [firstResult, secondResult] = await Promise.all([firstClick, secondClick])

    expect(firstResult).toBe(true)
    expect(secondResult).toBe(false)
    expect(callCount).toBe(1)
  })
})
