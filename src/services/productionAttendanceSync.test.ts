import { describe, it, expect, vi, beforeEach } from 'vitest'
import { productionService } from './production'
import pb from '@/lib/pocketbase/client'
import type { ProductionOrder, Attendance } from '@/types/crm'

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

describe('updateStage - Conclusão de pedido e sincronização do Attendance', () => {
  let mockAttendances: Record<string, Partial<Attendance>>
  let mockOrders: Record<string, Partial<ProductionOrder>>
  let mockCreatedLogs: any[]
  let mockCreatedPostSales: any[]
  let mockCreatedEvaluations: any[]
  let mockCreatedDeals: any[]

  beforeEach(() => {
    vi.clearAllMocks()

    mockAttendances = {}
    mockOrders = {}
    mockCreatedLogs = []
    mockCreatedPostSales = []
    mockCreatedEvaluations = []
    mockCreatedDeals = []

    const mockPbCollection = (collectionName: string) => {
      return {
        getOne: vi.fn(async (id: string) => {
          if (collectionName === 'production_orders') {
            if (!mockOrders[id]) throw new Error(`Order ${id} not found`)
            return { ...mockOrders[id] }
          }
          if (collectionName === 'attendances') {
            if (!mockAttendances[id]) throw new Error(`Attendance ${id} not found`)
            return { ...mockAttendances[id] }
          }
          return { id }
        }),
        getFullList: vi.fn(async (options?: { filter?: string }) => {
          if (collectionName === 'production_orders') {
            const filter = options?.filter || ''
            return Object.values(mockOrders).filter((order) => {
              if (filter.includes('attendance_id = "')) {
                const match = filter.match(/attendance_id = "([^"]+)"/)
                if (match && order.attendance_id !== match[1]) return false
              }
              return true
            })
          }
          if (collectionName === 'post_sales') {
            return []
          }
          return []
        }),
        update: vi.fn(async (id: string, data: any) => {
          if (collectionName === 'production_orders') {
            mockOrders[id] = { ...mockOrders[id], ...data, id }
            return { ...mockOrders[id] }
          }
          if (collectionName === 'attendances') {
            mockAttendances[id] = { ...mockAttendances[id], ...data, id }
            return { ...mockAttendances[id] }
          }
          return { id, ...data }
        }),
        create: vi.fn(async (data: any) => {
          const id = 'id_' + Math.random().toString(36).substring(2, 9)
          const record = { id, ...data }
          if (collectionName === 'production_logs') {
            mockCreatedLogs.push(record)
          } else if (collectionName === 'post_sales') {
            mockCreatedPostSales.push(record)
          } else if (collectionName === 'evaluations') {
            mockCreatedEvaluations.push(record)
          } else if (collectionName === 'archived_deals') {
            mockCreatedDeals.push(record)
          }
          return record
        }),
      }
    }

    vi.mocked(pb.collection).mockImplementation(mockPbCollection as any)
  })

  it('TESTE A: 1 attendance -> 1 pedido: concluir -> attendance is_archived=true, closed_at preenchido, stage "Em produção"', async () => {
    mockAttendances['att_1'] = {
      id: 'att_1',
      client_id: 'client_1',
      stage: 'Em produção',
      is_archived: false,
    }

    mockOrders['po_1'] = {
      id: 'po_1',
      order_number: 'PO-001',
      client_id: 'client_1',
      client_name: 'Cliente A',
      client_phone: '11999999999',
      attendance_id: 'att_1',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }

    const updatedOrder = await productionService.updateStage('po_1', 'completed')

    expect(updatedOrder.is_completed).toBe(true)
    expect(updatedOrder.stage_internal_id).toBe('completed')

    // Attendance deve estar arquivado com closed_at e manter stage 'Em produção'
    const att = mockAttendances['att_1']
    expect(att.is_archived).toBe(true)
    expect(att.closed_at).toBeDefined()
    expect(att.stage).toBe('Em produção')

    // Nenhum archived_deal criado
    expect(mockCreatedDeals).toHaveLength(0)
    // Production log criado
    expect(mockCreatedLogs.length).toBeGreaterThan(0)
  })

  it('TESTE B: 1 attendance -> 2 pedidos: concluir o primeiro -> attendance continua is_archived=false', async () => {
    mockAttendances['att_2'] = {
      id: 'att_2',
      client_id: 'client_2',
      stage: 'Em produção',
      is_archived: false,
    }

    mockOrders['po_2a'] = {
      id: 'po_2a',
      order_number: 'PO-002A',
      client_id: 'client_2',
      client_name: 'Cliente B',
      client_phone: '11999999999',
      attendance_id: 'att_2',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }

    mockOrders['po_2b'] = {
      id: 'po_2b',
      order_number: 'PO-002B',
      client_id: 'client_2',
      client_name: 'Cliente B',
      client_phone: '11999999999',
      attendance_id: 'att_2',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }

    await productionService.updateStage('po_2a', 'completed')

    // O pedido 2a está concluído
    expect(mockOrders['po_2a'].is_completed).toBe(true)

    // Como po_2b ainda está pendente, o attendance NÃO pode ser arquivado
    const att = mockAttendances['att_2']
    expect(att.is_archived).toBe(false)
    expect(att.closed_at).toBeUndefined()
    expect(att.stage).toBe('Em produção')
  })

  it('TESTE C: Concluir o último pedido -> attendance arquivado com stage "Em produção" e closed_at', async () => {
    // Configura attendance e po_2a já concluído anteriormente
    mockAttendances['att_2'] = {
      id: 'att_2',
      client_id: 'client_2',
      stage: 'Em produção',
      is_archived: false,
    }

    mockOrders['po_2a'] = {
      id: 'po_2a',
      order_number: 'PO-002A',
      client_id: 'client_2',
      client_name: 'Cliente B',
      client_phone: '11999999999',
      attendance_id: 'att_2',
      stage_internal_id: 'completed',
      stage_name: 'Concluído',
      is_completed: true,
      is_archived: false,
    }

    mockOrders['po_2b'] = {
      id: 'po_2b',
      order_number: 'PO-002B',
      client_id: 'client_2',
      client_name: 'Cliente B',
      client_phone: '11999999999',
      attendance_id: 'att_2',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }

    await productionService.updateStage('po_2b', 'completed')

    // Agora todos os pedidos do attendance estão concluídos
    expect(mockOrders['po_2b'].is_completed).toBe(true)
    const att = mockAttendances['att_2']
    expect(att.is_archived).toBe(true)
    expect(att.closed_at).toBeDefined()
    expect(att.stage).toBe('Em produção')
  })

  it('TESTE D: Pedido sem attendance_id -> nada muda no funil de atendimento', async () => {
    mockOrders['po_no_att'] = {
      id: 'po_no_att',
      order_number: 'PO-NO-ATT',
      client_id: 'client_3',
      client_name: 'Cliente Sem Attendance',
      client_phone: '11999999999',
      // attendance_id undefined
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }

    const updated = await productionService.updateStage('po_no_att', 'completed')
    expect(updated.is_completed).toBe(true)

    // Nenhuma chamada a attendances
    expect(Object.keys(mockAttendances)).toHaveLength(0)
    expect(mockCreatedDeals).toHaveLength(0)
  })

  it('TESTE E: Attendance já arquivado -> idempotente, nenhuma duplicação ou nova gravação', async () => {
    const existingClosedAt = '2026-03-01T10:00:00.000Z'
    mockAttendances['att_already_archived'] = {
      id: 'att_already_archived',
      client_id: 'client_4',
      stage: 'Em produção',
      is_archived: true,
      closed_at: existingClosedAt,
    }

    mockOrders['po_archived_att'] = {
      id: 'po_archived_att',
      order_number: 'PO-ARCH',
      client_id: 'client_4',
      client_name: 'Cliente Já Arquivado',
      client_phone: '11999999999',
      attendance_id: 'att_already_archived',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }

    await productionService.updateStage('po_archived_att', 'completed')

    const att = mockAttendances['att_already_archived']
    expect(att.is_archived).toBe(true)
    // closed_at intocado
    expect(att.closed_at).toBe(existingClosedAt)
    expect(mockCreatedDeals).toHaveLength(0)
  })

  it('TESTE F: Nenhum novo archived_deal, nenhuma métrica duplicada; pós-venda e avaliação preservados', async () => {
    mockAttendances['att_f'] = {
      id: 'att_f',
      client_id: 'client_5',
      stage: 'Em produção',
      is_archived: false,
    }

    mockOrders['po_f'] = {
      id: 'po_f',
      order_number: 'PO-F',
      client_id: 'client_5',
      client_name: 'Cliente F',
      client_phone: '11999999999',
      attendance_id: 'att_f',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Banner Lona',
      is_completed: false,
      is_archived: false,
    }

    await productionService.updateStage('po_f', 'completed')

    // 1. Não cria archived_deal
    expect(mockCreatedDeals).toHaveLength(0)

    // 2. Attendance arquivado corretamente
    expect(mockAttendances['att_f'].is_archived).toBe(true)
    expect(mockAttendances['att_f'].stage).toBe('Em produção')

    // 3. Pós-venda e avaliação disparados e preservados
    expect(mockCreatedEvaluations).toHaveLength(1)
    expect(mockCreatedEvaluations[0].order_number).toBe('PO-F')
    expect(mockCreatedPostSales).toHaveLength(1)
    expect(mockCreatedPostSales[0].order_number).toBe('PO-F')

    // 4. Log de auditoria da produção preservado
    expect(mockCreatedLogs).toHaveLength(1)
    expect(mockCreatedLogs[0].order_id).toBe('po_f')
    expect(mockCreatedLogs[0].to_stage_id).toBe('completed')
  })
})
