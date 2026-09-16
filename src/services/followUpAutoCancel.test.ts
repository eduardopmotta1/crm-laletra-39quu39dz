import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tasksService } from './tasks'
import { dealsService } from './deals'
import { attendancesService } from './attendances'
import { productionService } from './production'
import pb from '@/lib/pocketbase/client'
import type { Task, Attendance, ProductionOrder } from '@/types/crm'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
      authStore: {
        record: { id: 'usr_mock_1', name: 'Tester', email: 'tester@test.com' },
      },
    },
  }
})

describe('Regras de Encerramento Automático de Follow-ups (tasks)', () => {
  let mockTasks: Record<string, Task>
  let mockAttendances: Record<string, Partial<Attendance>>
  let mockClients: Record<string, any>
  let mockPostSales: any[]
  let mockArchivedDeals: any[]
  let mockStageTransitions: any[]
  let mockProductionOrders: Record<string, Partial<ProductionOrder>>
  let mockProductionLogs: any[]
  let mockEvaluations: any[]

  beforeEach(() => {
    vi.clearAllMocks()

    mockTasks = {}
    mockAttendances = {}
    mockClients = {}
    mockPostSales = []
    mockArchivedDeals = []
    mockStageTransitions = []
    mockProductionOrders = {}
    mockProductionLogs = []
    mockEvaluations = []

    const mockPbCollection = (collectionName: string) => ({
      getOne: vi.fn(async (id: string) => {
        if (collectionName === 'tasks') {
          if (!mockTasks[id]) throw new Error(`Task ${id} not found`)
          return { ...mockTasks[id] }
        }
        if (collectionName === 'attendances') {
          if (!mockAttendances[id]) throw new Error(`Attendance ${id} not found`)
          return { ...mockAttendances[id] }
        }
        if (collectionName === 'clients') {
          if (!mockClients[id]) throw new Error(`Client ${id} not found`)
          return { ...mockClients[id] }
        }
        if (collectionName === 'production_orders') {
          if (!mockProductionOrders[id]) throw new Error(`Order ${id} not found`)
          return { ...mockProductionOrders[id] }
        }
        return { id }
      }),
      getList: vi.fn(async (page: number, perPage: number, options?: { filter?: string }) => {
        const filter = options?.filter || ''

        if (collectionName === 'tasks') {
          let items = Object.values(mockTasks)

          if (filter.includes('attendance_id = "')) {
            const match = filter.match(/attendance_id = "([^"]+)"/)
            if (match) {
              items = items.filter((t) => t.attendance_id === match[1])
            }
          }
          if (filter.includes('status = "pendente"')) {
            items = items.filter((t) => t.status === 'pendente')
          }
          if (filter.includes('client_id = "')) {
            const match = filter.match(/client_id = "([^"]+)"/)
            if (match) {
              items = items.filter((t) => t.client_id === match[1])
            }
          }
          return {
            page,
            perPage,
            totalItems: items.length,
            totalPages: Math.ceil(items.length / perPage) || 1,
            items: items.slice((page - 1) * perPage, page * perPage),
          }
        }

        if (collectionName === 'post_sales') {
          let items = [...mockPostSales]
          if (filter.includes('attendance_id = "')) {
            const match = filter.match(/attendance_id = "([^"]+)"/)
            if (match) {
              items = items.filter((ps) => ps.attendance_id === match[1])
            }
          }
          if (filter.includes('task_id != ""')) {
            items = items.filter((ps) => Boolean(ps.task_id))
          }
          return {
            page,
            perPage,
            totalItems: items.length,
            totalPages: Math.ceil(items.length / perPage) || 1,
            items: items.slice((page - 1) * perPage, page * perPage),
          }
        }

        if (collectionName === 'attendances') {
          let items = Object.values(mockAttendances)
          if (filter.includes('client_id = "')) {
            const match = filter.match(/client_id = "([^"]+)"/)
            if (match) {
              items = items.filter((a) => a.client_id === match[1])
            }
          }
          if (filter.includes('is_archived != true')) {
            items = items.filter((a) => !a.is_archived)
          }
          return {
            page,
            perPage,
            totalItems: items.length,
            totalPages: 1,
            items,
          }
        }

        if (collectionName === 'archived_deals') {
          return {
            page,
            perPage,
            totalItems: mockArchivedDeals.length,
            totalPages: 1,
            items: mockArchivedDeals,
          }
        }

        return { page, perPage, totalItems: 0, totalPages: 0, items: [] }
      }),
      getFullList: vi.fn(async (options?: { filter?: string }) => {
        const filter = options?.filter || ''
        if (collectionName === 'tasks') {
          return Object.values(mockTasks)
        }
        if (collectionName === 'attendances') {
          let items = Object.values(mockAttendances)
          if (filter.includes('is_archived != true && stage = "Venda fechada"')) {
            items = items.filter((a) => !a.is_archived && a.stage === 'Venda fechada')
          } else if (filter.includes('is_archived != true && stage = "Não fechou"')) {
            items = items.filter((a) => !a.is_archived && a.stage === 'Não fechou')
          }
          return items
        }
        if (collectionName === 'production_orders') {
          let items = Object.values(mockProductionOrders)
          if (filter.includes('attendance_id = "')) {
            const match = filter.match(/attendance_id = "([^"]+)"/)
            if (match) {
              items = items.filter((o) => o.attendance_id === match[1])
            }
          }
          return items
        }
        if (collectionName === 'post_sales') {
          return mockPostSales
        }
        return []
      }),
      update: vi.fn(async (id: string, data: any) => {
        if (collectionName === 'tasks') {
          if (!mockTasks[id]) throw new Error(`Task ${id} not found`)
          mockTasks[id] = { ...mockTasks[id], ...data, id, updated: new Date().toISOString() }
          return mockTasks[id]
        }
        if (collectionName === 'attendances') {
          if (!mockAttendances[id]) throw new Error(`Attendance ${id} not found`)
          mockAttendances[id] = {
            ...mockAttendances[id],
            ...data,
            id,
            updated: new Date().toISOString(),
          }
          return mockAttendances[id]
        }
        if (collectionName === 'clients') {
          if (!mockClients[id]) throw new Error(`Client ${id} not found`)
          mockClients[id] = { ...mockClients[id], ...data, id }
          return mockClients[id]
        }
        if (collectionName === 'production_orders') {
          if (!mockProductionOrders[id]) throw new Error(`Order ${id} not found`)
          mockProductionOrders[id] = { ...mockProductionOrders[id], ...data, id }
          return mockProductionOrders[id]
        }
        return { id, ...data }
      }),
      create: vi.fn(async (data: any) => {
        const id = 'rec_' + Math.random().toString(36).substring(2, 9)
        const record = {
          id,
          ...data,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        }
        if (collectionName === 'tasks') {
          mockTasks[id] = record
        } else if (collectionName === 'archived_deals') {
          mockArchivedDeals.push(record)
        } else if (collectionName === 'stage_transitions') {
          mockStageTransitions.push(record)
        } else if (collectionName === 'production_logs') {
          mockProductionLogs.push(record)
        } else if (collectionName === 'evaluations') {
          mockEvaluations.push(record)
        } else if (collectionName === 'post_sales') {
          mockPostSales.push(record)
        }
        return record
      }),
      delete: vi.fn(async (id: string) => {
        if (collectionName === 'tasks') {
          delete mockTasks[id]
          return true
        }
        return true
      }),
    })

    vi.mocked(pb.collection).mockImplementation(mockPbCollection as any)
  })

  it('Cenário 1: attendance arquivado + task vinculada àquele attendance → task vira cancelada', async () => {
    mockAttendances['att_1'] = {
      id: 'att_1',
      client_id: 'client_1',
      stage: 'Em negociação',
      is_archived: false,
    }

    mockTasks['task_1'] = {
      id: 'task_1',
      title: 'Ligar para confirmar orçamento',
      client_id: 'client_1',
      attendance_id: 'att_1',
      status: 'pendente',
      priority: 'media',
      due_date: '2026-03-30',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockClients['client_1'] = {
      id: 'client_1',
      name: 'Empresa Alfa',
      phone: '11988887777',
      stage: 'Em negociação',
    }

    // Executa arquivamento via dealsService.completeAndArchive
    await dealsService.completeAndArchive({
      attendanceId: 'att_1',
      clientId: 'client_1',
      result: 'Venda perdida',
      lossReason: 'Preço alto',
    })

    expect(mockAttendances['att_1'].is_archived).toBe(true)
    expect(mockTasks['task_1'].status).toBe('cancelada')
  })

  it('Cenário 2: attendance arquivado + task com attendance_id null/vazio → permanece pendente', async () => {
    mockAttendances['att_1'] = {
      id: 'att_1',
      client_id: 'client_1',
      stage: 'Em negociação',
      is_archived: false,
    }

    mockTasks['task_independent'] = {
      id: 'task_independent',
      title: 'Comprar tinta para impressora',
      client_id: 'client_1',
      // attendance_id explicitamente undefined / null
      attendance_id: undefined,
      status: 'pendente',
      priority: 'alta',
      due_date: '2026-03-31',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockClients['client_1'] = {
      id: 'client_1',
      name: 'Empresa Alfa',
      phone: '11988887777',
    }

    await dealsService.completeAndArchive({
      attendanceId: 'att_1',
      clientId: 'client_1',
      result: 'Venda fechada',
    })

    expect(mockAttendances['att_1'].is_archived).toBe(true)
    // A tarefa independente permanece pendente
    expect(mockTasks['task_independent'].status).toBe('pendente')
  })

  it('Cenário 3: cliente possui dois attendances; task vinculada somente ao attendance A; attendance A arquivado → task A cancelada; task vinculada ao attendance B permanece pendente', async () => {
    mockAttendances['att_A'] = {
      id: 'att_A',
      client_id: 'client_multi',
      stage: 'Em negociação',
      is_archived: false,
    }
    mockAttendances['att_B'] = {
      id: 'att_B',
      client_id: 'client_multi',
      stage: 'Em atendimento',
      is_archived: false,
    }

    mockTasks['task_A'] = {
      id: 'task_A',
      title: 'Follow-up do pedido A',
      client_id: 'client_multi',
      attendance_id: 'att_A',
      status: 'pendente',
      priority: 'media',
      due_date: '2026-04-01',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockTasks['task_B'] = {
      id: 'task_B',
      title: 'Follow-up do pedido B',
      client_id: 'client_multi',
      attendance_id: 'att_B',
      status: 'pendente',
      priority: 'media',
      due_date: '2026-04-05',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockClients['client_multi'] = {
      id: 'client_multi',
      name: 'Cliente Dois Pedidos',
      phone: '11977776666',
    }

    // Arquivar somente o attendance A
    await dealsService.completeAndArchive({
      attendanceId: 'att_A',
      clientId: 'client_multi',
      result: 'Venda fechada',
    })

    expect(mockAttendances['att_A'].is_archived).toBe(true)
    expect(mockAttendances['att_B'].is_archived).toBe(false)

    // Task A cancelada, Task B permanece pendente
    expect(mockTasks['task_A'].status).toBe('cancelada')
    expect(mockTasks['task_B'].status).toBe('pendente')
  })

  it('Cenário 4: task independente do mesmo cliente/nome → permanece pendente', async () => {
    mockAttendances['att_1'] = {
      id: 'att_1',
      client_id: 'client_1',
      stage: 'Apresentação',
      is_archived: false,
    }

    mockTasks['task_linked'] = {
      id: 'task_linked',
      title: 'Follow-up proposta',
      client_id: 'client_1',
      attendance_id: 'att_1',
      status: 'pendente',
      priority: 'media',
      due_date: '2026-03-28',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockTasks['task_indep_client'] = {
      id: 'task_indep_client',
      title: 'Mandar mensagem para Cristiano',
      client_id: 'client_1',
      attendance_id: undefined,
      status: 'pendente',
      priority: 'alta',
      due_date: '2026-03-29',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockClients['client_1'] = {
      id: 'client_1',
      name: 'Cristiano Ronaldo',
      phone: '11999998888',
    }

    await dealsService.completeAndArchive({
      attendanceId: 'att_1',
      clientId: 'client_1',
      result: 'Venda perdida',
      lossReason: 'Optou por concorrente',
    })

    // Somente a task explicitamente com attendance_id = att_1 é cancelada
    expect(mockTasks['task_linked'].status).toBe('cancelada')
    expect(mockTasks['task_indep_client'].status).toBe('pendente')
  })

  it('Cenário Adicional 1: Reabertura de deal NÃO reativa follow-ups cancelados', async () => {
    mockAttendances['att_reopen'] = {
      id: 'att_reopen',
      client_id: 'client_reopen',
      stage: 'Venda fechada',
      is_archived: true,
    }

    mockTasks['task_reopen'] = {
      id: 'task_reopen',
      title: 'Follow-up anterior',
      client_id: 'client_reopen',
      attendance_id: 'att_reopen',
      status: 'cancelada', // já cancelada
      priority: 'media',
      due_date: '2026-03-20',
      created: '2026-03-15T10:00:00Z',
      updated: '2026-03-21T10:00:00Z',
    }

    mockClients['client_reopen'] = {
      id: 'client_reopen',
      name: 'Cliente Reaberto',
      phone: '11999990000',
      is_archived: false,
    }

    await dealsService.reopenClient('client_reopen', 'Precisa responder', 'att_reopen')

    expect(mockAttendances['att_reopen'].is_archived).toBe(false)
    expect(mockAttendances['att_reopen'].stage).toBe('Precisa responder')
    // Task continua cancelada
    expect(mockTasks['task_reopen'].status).toBe('cancelada')
  })

  it('Cenário Adicional 2: Pós-venda NUNCA é cancelado mesmo que vinculado ao attendance', async () => {
    mockAttendances['att_pv'] = {
      id: 'att_pv',
      client_id: 'client_pv',
      stage: 'Em produção',
      is_archived: false,
    }

    // Task de pós-venda com prefixo e referenciada em post_sales
    mockTasks['task_pv'] = {
      id: 'task_pv',
      title: '⭐ Pós-venda [Pedido #001999]: Cliente PV',
      client_id: 'client_pv',
      attendance_id: 'att_pv',
      status: 'pendente',
      priority: 'media',
      due_date: '2026-04-10',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockPostSales.push({
      id: 'ps_1',
      attendance_id: 'att_pv',
      task_id: 'task_pv',
      status: 'pending',
    })

    const res = await tasksService.cancelPendingFollowUpsForAttendance('att_pv')

    expect(res.canceledCount).toBe(0)
    expect(mockTasks['task_pv'].status).toBe('pendente')
  })

  it('Cenário Adicional 3: Nenhuma task é deletada fisicamente (delete não é chamado)', async () => {
    mockAttendances['att_nodelete'] = {
      id: 'att_nodelete',
      client_id: 'client_nodelete',
      is_archived: false,
    }

    mockTasks['task_nodelete'] = {
      id: 'task_nodelete',
      title: 'Tarefa regular',
      client_id: 'client_nodelete',
      attendance_id: 'att_nodelete',
      status: 'pendente',
      priority: 'baixa',
      due_date: '2026-04-02',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    await tasksService.cancelPendingFollowUpsForAttendance('att_nodelete')

    // Task ainda existe em mockTasks (não foi apagada)
    expect(mockTasks['task_nodelete']).toBeDefined()
    expect(mockTasks['task_nodelete'].status).toBe('cancelada')
  })

  it('Cenário Adicional 4: updateStage grava closed_at mas NÃO arquiva -> task permanece pendente', async () => {
    mockAttendances['att_stage'] = {
      id: 'att_stage',
      client_id: 'client_stage',
      stage: 'Em negociação',
      is_archived: false,
    }

    mockTasks['task_stage'] = {
      id: 'task_stage',
      title: 'Follow-up de negociação',
      client_id: 'client_stage',
      attendance_id: 'att_stage',
      status: 'pendente',
      priority: 'media',
      due_date: '2026-04-01',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockClients['client_stage'] = {
      id: 'client_stage',
      name: 'Cliente Stage',
    }

    // updateStage para "Venda fechada" (etapa aberta sem arquivar)
    await attendancesService.updateStage('att_stage', 'Venda fechada')

    expect(mockAttendances['att_stage'].stage).toBe('Venda fechada')
    expect(mockAttendances['att_stage'].closed_at).toBeDefined()
    expect(mockAttendances['att_stage'].is_archived).toBe(false)
    // Task PERMANECE pendente porque o attendance continua aberto!
    expect(mockTasks['task_stage'].status).toBe('pendente')
  })

  it('Ponto 3: runAutoArchiveCheck arquiva atendimento de 24h -> cancela task vinculada', async () => {
    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() // 30h atrás
    mockAttendances['att_auto'] = {
      id: 'att_auto',
      client_id: 'client_auto',
      stage: 'Venda fechada',
      is_archived: false,
      closed_at: oldDate,
    }

    mockTasks['task_auto'] = {
      id: 'task_auto',
      title: 'Follow-up pendente',
      client_id: 'client_auto',
      attendance_id: 'att_auto',
      status: 'pendente',
      priority: 'media',
      due_date: '2026-04-01',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    mockClients['client_auto'] = {
      id: 'client_auto',
      name: 'Cliente Auto',
    }

    await attendancesService.runAutoArchiveCheck(24, 24, true)

    expect(mockAttendances['att_auto'].is_archived).toBe(true)
    expect(mockTasks['task_auto'].status).toBe('cancelada')
  })

  it('Ponto 4: productionService sync de conclusão arquiva atendimento -> cancela task vinculada', async () => {
    mockAttendances['att_prod'] = {
      id: 'att_prod',
      client_id: 'client_prod',
      stage: 'Em produção',
      is_archived: false,
    }

    mockProductionOrders['ord_prod'] = {
      id: 'ord_prod',
      order_number: '#002001',
      client_id: 'client_prod',
      attendance_id: 'att_prod',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }

    mockTasks['task_prod'] = {
      id: 'task_prod',
      title: 'Acompanhar produção',
      client_id: 'client_prod',
      attendance_id: 'att_prod',
      status: 'pendente',
      priority: 'media',
      due_date: '2026-04-01',
      created: '2026-03-25T10:00:00Z',
      updated: '2026-03-25T10:00:00Z',
    }

    // Mover pedido para completed
    await productionService.updateStage('ord_prod', 'completed')

    expect(mockAttendances['att_prod'].is_archived).toBe(true)
    expect(mockTasks['task_prod'].status).toBe('cancelada')
  })
})
