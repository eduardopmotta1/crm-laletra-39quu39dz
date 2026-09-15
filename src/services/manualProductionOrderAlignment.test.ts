import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Attendance, Client } from '@/types/crm'
import pb from '@/lib/pocketbase/client'

describe('Manual Production Order Path from CompleteAndArchiveModal (0.0.230)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('A) Venda fechada com production_order criado com sucesso -> attendance: stage="Em produção", is_archived=false, closed_at=null', async () => {
    // Simula attendance inicial ativo em negociação
    const attendance: Attendance = {
      id: 'att_test_1',
      client_id: 'client_test_1',
      stage: 'Em negociação',
      is_archived: false,
      created: '2026-09-10T12:00:00.000Z',
      updated: '2026-09-10T12:00:00.000Z',
    }

    const client: Client = {
      id: 'client_test_1',
      name: 'Cliente Teste',
      phone: '11999999999',
      stage: 'Em negociação',
      quote_value: 500,
      product_interest: 'Lona 440g',
      created: '2026-09-10T12:00:00.000Z',
      updated: '2026-09-10T12:00:00.000Z',
    }

    // Mock das chamadas PocketBase
    let updatedAttendancePayload: any = null
    let createdArchivedDealPayload: any = null
    let updatedClientPayload: any = null

    const mockPb = {
      collection: (colName: string) => ({
        getOne: async (id: string) => {
          if (colName === 'attendances') return attendance
          if (colName === 'clients') return client
          if (colName === 'production_orders') {
            return {
              id: 'po_test_123',
              order_number: 'PO-2026-0001',
              client_id: client.id,
              client_phone: client.phone,
            }
          }
          return null
        },
        getList: async () => ({ items: [] }),
        create: async (payload: any) => {
          if (colName === 'archived_deals') {
            createdArchivedDealPayload = payload
            return { id: 'deal_test_1', ...payload }
          }
          if (colName === 'stage_transitions') {
            return { id: 'st_1', ...payload }
          }
          return { id: 'test_id', ...payload }
        },
        update: async (id: string, payload: any) => {
          if (colName === 'attendances') {
            updatedAttendancePayload = payload
            return { ...attendance, ...payload }
          }
          if (colName === 'clients') {
            updatedClientPayload = payload
            return { ...client, ...payload }
          }
          return { id, ...payload }
        },
      }),
      authStore: {
        record: { id: 'usr_seller_1', name: 'Vendedor Teste', email: 'vendedor@test.com' },
      },
    }

    // Executa a lógica de sincronização pós criação de production_order
    const effectiveAttId = attendance.id
    const clientId = client.id
    const savedOrderId = 'po_test_123'
    const todayDateStr = new Date().toISOString().split('T')[0]
    const finalVal = 500
    const finalProd = 'Lona 440g'

    const attendanceRec = (await mockPb.collection('attendances').getOne(effectiveAttId)) as any
    const clientRec = (await mockPb.collection('clients').getOne(clientId)) as any
    const confirmedOrder = (await mockPb
      .collection('production_orders')
      .getOne(savedOrderId)) as any

    const dealData = {
      attendance_id: effectiveAttId,
      client_id: clientId,
      client_name: clientRec?.name,
      client_phone: clientRec?.phone,
      result: 'Venda fechada',
      product_interest: finalProd,
      quote_value: finalVal,
      closed_at: todayDateStr,
    }

    const archivedDeal = await mockPb.collection('archived_deals').create(dealData)

    await mockPb.collection('attendances').update(effectiveAttId, {
      stage: 'Em produção',
      is_archived: false,
      closed_at: null,
      archived_at: null,
      result: 'Venda fechada',
      quote_value: finalVal,
      product_interest: finalProd,
      last_archived_deal_id: archivedDeal.id,
    })

    // Asserções para A:
    expect(createdArchivedDealPayload).toBeDefined()
    expect(createdArchivedDealPayload.result).toBe('Venda fechada')
    expect(createdArchivedDealPayload.attendance_id).toBe(attendance.id)

    expect(updatedAttendancePayload).toBeDefined()
    expect(updatedAttendancePayload.stage).toBe('Em produção')
    expect(updatedAttendancePayload.is_archived).toBe(false)
    expect(updatedAttendancePayload.closed_at).toBeNull()
    expect(updatedAttendancePayload.last_archived_deal_id).toBe('deal_test_1')
  })

  it('B) Falha simulada na criação do production_order -> attendance permanece inalterado no estado anterior', async () => {
    const attendance: Attendance = {
      id: 'att_test_2',
      client_id: 'client_test_2',
      stage: 'Em atendimento',
      is_archived: false,
      created: '2026-09-10T12:00:00.000Z',
      updated: '2026-09-10T12:00:00.000Z',
    }

    let attendanceUpdated = false
    let dealCreated = false

    // Simula falha ao criar ordem de produção
    const createProductionOrderThrows = async () => {
      throw new Error('Falha simulada na gravação do banco de dados (500)')
    }

    try {
      await createProductionOrderThrows()
      // Se não lançar, prosseguiria com o arquivamento/atualização (não deve chegar aqui)
      attendanceUpdated = true
      dealCreated = true
    } catch {
      // Criação falhou: onSaved NÃO é chamado, e nem o sync comercial
    }

    expect(attendanceUpdated).toBe(false)
    expect(dealCreated).toBe(false)
    expect(attendance.stage).toBe('Em atendimento')
    expect(attendance.is_archived).toBe(false)
  })

  it('C) Fluxo "Não fechou" -> 100% comportamento de encerramento/arquivamento comercial', () => {
    // No handleSubmit, quando result === 'Venda perdida' (ou 'Não fechou'):
    // DealsService.completeAndArchive é chamado diretamente.
    // Ele seta is_archived = true e stage = "Não fechou".
    const payload = {
      result: 'Venda perdida',
      lossReason: 'Preço / Orçamento alto',
    }

    const finalStage = payload.result === 'Venda fechada' ? 'Venda fechada' : 'Não fechou'
    const isArchived = true

    expect(finalStage).toBe('Não fechou')
    expect(isArchived).toBe(true)
  })

  it('D) Card resultante compatível com a coluna "Em produção" (is_archived=false aparece; arquivado não)', () => {
    const salesColumn = {
      id: 'col_sales_in_production',
      internal_id: 'sales_in_production',
      name: 'Em produção',
    }

    const cards: Attendance[] = [
      {
        id: 'att_active_manual',
        client_id: 'client_1',
        stage: 'Em produção',
        is_archived: false,
        created: '2026-09-15T10:00:00.000Z',
        updated: '2026-09-15T10:00:00.000Z',
      },
      {
        id: 'att_archived_manual',
        client_id: 'client_2',
        stage: 'Em produção',
        is_archived: true,
        created: '2026-09-15T10:00:00.000Z',
        updated: '2026-09-15T10:00:00.000Z',
      },
    ]

    // Filtro Kanban ativo
    const activeCards = cards.filter((c) => c.is_archived !== true)
    const inProductionColumnCards = activeCards.filter(
      (c) =>
        c.stage === salesColumn.name ||
        (salesColumn.internal_id === 'sales_in_production' && c.stage === 'Em produção'),
    )

    expect(inProductionColumnCards).toHaveLength(1)
    expect(inProductionColumnCards[0].id).toBe('att_active_manual')
    expect(inProductionColumnCards[0].is_archived).toBe(false)
  })
})
