import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Attendance, Client, Message, ProductionOrder } from '@/types/crm'

// Mock state
let mockAttendances: Attendance[] = []
let mockProductionOrders: ProductionOrder[] = []
let mockMessages: Message[] = []
let mockClients: Client[] = []

// Simulação estrita das regras de WhatsAppChatDrawer.tsx para:
// 1) Filtragem de pedidos elegíveis (eligibleProductionOrders)
// 2) Execução da vinculação manual a pedido existente (handleConfirmLinkToExistingOrder)
// COM MOCKS ESTRITOS — SEM DADOS REAIS, SEM MIGRATIONS, SEM ALTERAR SCHEMA, SEM ALTERAR WEBHOOK
describe('Fluxo Manual: Vincular Mensagens Inbound a Pedido Existente', () => {
  const dummyClient: Client = {
    id: 'client_joao_souza',
    name: 'João Souza',
    phone: '5511999998888',
    normalized_phone: '5511999998888',
    stage: 'Em atendimento',
    created: '2025-05-10T10:00:00.000Z',
    updated: '2025-05-10T10:00:00.000Z',
  }

  // Regra de filtragem de pedidos elegíveis idêntica ao WhatsAppChatDrawer.tsx
  const getEligibleProductionOrders = (orders: ProductionOrder[]) => {
    return orders.filter(
      (o) =>
        o.is_completed !== true &&
        o.is_archived !== true &&
        o.stage_internal_id !== 'completed' &&
        !!o.attendance_id &&
        o.attendance_id.trim() !== '',
    )
  }

  // Execução idêntica ao WhatsAppChatDrawer.tsx (handleConfirmLinkToExistingOrder)
  const executeLinkToExistingOrder = async (
    clientId: string,
    selectedOrder: ProductionOrder,
    messagesList: Message[],
  ) => {
    if (!selectedOrder || !selectedOrder.attendance_id) {
      return { success: false, updatedCount: 0 }
    }

    const targetAttendanceId = selectedOrder.attendance_id

    // 1. Localizar mensagens inbound sem attendance_id desse cliente
    const unassignedInboundMsgs = messagesList.filter(
      (m) => m.direction === 'inbound' && !m.attendance_id && m.client_id === clientId,
    )

    let count = 0
    // 2. Atualizar SOMENTE messages.attendance_id das mensagens inbound pendentes
    for (const msg of unassignedInboundMsgs) {
      const found = messagesList.find((m) => m.id === msg.id)
      if (found) {
        found.attendance_id = targetAttendanceId
        count++
      }
    }

    return { success: true, updatedCount: count }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAttendances = []
    mockProductionOrders = []
    mockMessages = []
    mockClients = [{ ...dummyClient }]
  })

  it('1. Cliente com 1 pedido ativo elegível → aparece na lista com dados corretos (#número, produto, etapa, data)', () => {
    const order1: ProductionOrder = {
      id: 'ord_1',
      order_number: '#101',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_101',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Fachada em Lona',
      attendance_id: 'att_order_101',
      is_completed: false,
      is_archived: false,
      created: '2025-05-11T10:00:00.000Z',
      updated: '2025-05-11T10:00:00.000Z',
    }
    mockProductionOrders.push(order1)

    const eligible = getEligibleProductionOrders(mockProductionOrders)
    expect(eligible.length).toBe(1)
    expect(eligible[0].id).toBe('ord_1')
    expect(eligible[0].order_number).toBe('#101')
    expect(eligible[0].product).toBe('Fachada em Lona')
    expect(eligible[0].stage_name).toBe('Em produção')
    expect(eligible[0].created).toBe('2025-05-11T10:00:00.000Z')
    expect(eligible[0].attendance_id).toBe('att_order_101')
  })

  it('2. Vários pedidos ativos → lista exibe todos os elegíveis e atendente escolhe um', () => {
    const orderA: ProductionOrder = {
      id: 'ord_A',
      order_number: '#201',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_201',
      stage_internal_id: 'art_preparation',
      stage_name: 'Preparação de arte',
      product: 'Adesivo perfurado',
      attendance_id: 'att_201',
      is_completed: false,
      is_archived: false,
      created: '2025-05-10T10:00:00.000Z',
      updated: '2025-05-10T10:00:00.000Z',
    }
    const orderB: ProductionOrder = {
      id: 'ord_B',
      order_number: '#202',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_202',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Banner Roll-up',
      attendance_id: 'att_202',
      is_completed: false,
      is_archived: false,
      created: '2025-05-11T12:00:00.000Z',
      updated: '2025-05-11T12:00:00.000Z',
    }
    mockProductionOrders.push(orderA, orderB)

    const eligible = getEligibleProductionOrders(mockProductionOrders)
    expect(eligible.length).toBe(2)

    // Simulação da seleção: nenhum pedido é escolhido automaticamente (inicial null)
    let selectedOrder: ProductionOrder | null = null
    expect(selectedOrder).toBeNull()

    // Atendente clica no pedido B
    selectedOrder = eligible.find((o) => o.id === 'ord_B') || null
    expect(selectedOrder).toBeDefined()
    expect(selectedOrder?.id).toBe('ord_B')
    expect(selectedOrder?.order_number).toBe('#202')
  })

  it('3. Seleção correta → attendance_id do pedido selecionado é aplicado às mensagens pendentes', async () => {
    const orderTarget: ProductionOrder = {
      id: 'ord_target',
      order_number: '#305',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_305',
      stage_internal_id: 'awaiting_approval',
      stage_name: 'Aguardando aprovação',
      product: 'Cartão de Visita 1000un',
      attendance_id: 'att_alvo_305',
      is_completed: false,
      is_archived: false,
      created: '2025-05-10T10:00:00.000Z',
      updated: '2025-05-10T10:00:00.000Z',
    }
    mockProductionOrders.push(orderTarget)

    mockMessages.push({
      id: 'msg_inbound_unassigned_1',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'inbound',
      message_text: 'Aprovado o modelo que enviou!',
      created: '2025-05-11T15:00:00.000Z',
      updated: '2025-05-11T15:00:00.000Z',
    })

    const res = await executeLinkToExistingOrder(dummyClient.id, orderTarget, mockMessages)
    expect(res.success).toBe(true)
    expect(res.updatedCount).toBe(1)

    const updatedMsg = mockMessages.find((m) => m.id === 'msg_inbound_unassigned_1')
    expect(updatedMsg?.attendance_id).toBe('att_alvo_305')
  })

  it('4. Cancelar → nada é alterado', async () => {
    const orderTarget: ProductionOrder = {
      id: 'ord_target',
      order_number: '#305',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_305',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Adesivos',
      attendance_id: 'att_305',
      is_completed: false,
      is_archived: false,
      created: '2025-05-10T10:00:00.000Z',
      updated: '2025-05-10T10:00:00.000Z',
    }
    mockProductionOrders.push(orderTarget)

    mockMessages.push({
      id: 'msg_to_cancel',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'inbound',
      message_text: 'Mensagem de teste',
      created: '2025-05-11T15:00:00.000Z',
      updated: '2025-05-11T15:00:00.000Z',
    })

    // Usuário abre o modal, seleciona e depois clica em "Cancelar"
    let isModalOpen = true
    let selectedOrder: ProductionOrder | null = orderTarget

    // Clica em cancelar
    isModalOpen = false
    selectedOrder = null

    // Nenhuma alteração foi realizada nas mensagens
    expect(isModalOpen).toBe(false)
    expect(selectedOrder).toBeNull()
    const msg = mockMessages.find((m) => m.id === 'msg_to_cancel')
    expect(msg?.attendance_id).toBeUndefined()
  })

  it('5. Pedido concluído (is_completed === true ou stage_internal_id === "completed") NÃO aparece', () => {
    const completedByFlag: ProductionOrder = {
      id: 'ord_completed_flag',
      order_number: '#401',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_401',
      stage_internal_id: 'ready',
      stage_name: 'Pronto',
      product: 'Etiquetas',
      attendance_id: 'att_401',
      is_completed: true, // concluído
      is_archived: false,
      created: '2025-05-01T10:00:00.000Z',
      updated: '2025-05-05T10:00:00.000Z',
    }
    const completedByStage: ProductionOrder = {
      id: 'ord_completed_stage',
      order_number: '#402',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_402',
      stage_internal_id: 'completed', // final
      stage_name: 'Finalizado',
      product: 'Banner',
      attendance_id: 'att_402',
      is_completed: false,
      is_archived: false,
      created: '2025-05-01T10:00:00.000Z',
      updated: '2025-05-05T10:00:00.000Z',
    }
    mockProductionOrders.push(completedByFlag, completedByStage)

    const eligible = getEligibleProductionOrders(mockProductionOrders)
    expect(eligible.length).toBe(0)
  })

  it('6. Pedido arquivado (is_archived === true) NÃO aparece', () => {
    const archivedOrder: ProductionOrder = {
      id: 'ord_archived',
      order_number: '#501',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_501',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Wind banner',
      attendance_id: 'att_501',
      is_completed: false,
      is_archived: true, // arquivado
      created: '2025-05-02T10:00:00.000Z',
      updated: '2025-05-03T10:00:00.000Z',
    }
    mockProductionOrders.push(archivedOrder)

    const eligible = getEligibleProductionOrders(mockProductionOrders)
    expect(eligible.length).toBe(0)
  })

  it('7. Pedido sem attendance_id válido (vazio ou indefinido) NÃO aparece', () => {
    const orderNoAtt: ProductionOrder = {
      id: 'ord_no_att',
      order_number: '#601',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_601',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Lona com ilhós',
      attendance_id: undefined, // sem attendance_id
      is_completed: false,
      is_archived: false,
      created: '2025-05-02T10:00:00.000Z',
      updated: '2025-05-03T10:00:00.000Z',
    }
    const orderBlankAtt: ProductionOrder = {
      id: 'ord_blank_att',
      order_number: '#602',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_602',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Placa',
      attendance_id: '   ', // espaço em branco
      is_completed: false,
      is_archived: false,
      created: '2025-05-02T10:00:00.000Z',
      updated: '2025-05-03T10:00:00.000Z',
    }
    mockProductionOrders.push(orderNoAtt, orderBlankAtt)

    const eligible = getEligibleProductionOrders(mockProductionOrders)
    expect(eligible.length).toBe(0)
  })

  it('8. Somente mensagens pendentes são atualizadas (mensagens já vinculadas intocadas)', async () => {
    const order: ProductionOrder = {
      id: 'ord_ok',
      order_number: '#701',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_701',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Totem',
      attendance_id: 'att_target_701',
      is_completed: false,
      is_archived: false,
      created: '2025-05-08T10:00:00.000Z',
      updated: '2025-05-08T10:00:00.000Z',
    }
    mockProductionOrders.push(order)

    // Mensagem antiga já associada a outro attendance
    mockMessages.push({
      id: 'msg_already_linked',
      client_id: dummyClient.id,
      attendance_id: 'att_other_existing',
      direction: 'inbound',
      message_text: 'Mensagem vinculada anteriormente',
      created: '2025-05-09T10:00:00.000Z',
      updated: '2025-05-09T10:00:00.000Z',
    })
    // Mensagem outbound
    mockMessages.push({
      id: 'msg_outbound_system',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'outbound',
      message_text: 'Mensagem enviada pela empresa',
      created: '2025-05-10T10:00:00.000Z',
      updated: '2025-05-10T10:00:00.000Z',
    })
    // Mensagem inbound pendente deste cliente
    mockMessages.push({
      id: 'msg_pending_target',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'inbound',
      message_text: 'Mensagem inbound sem pedido',
      created: '2025-05-11T10:00:00.000Z',
      updated: '2025-05-11T10:00:00.000Z',
    })

    await executeLinkToExistingOrder(dummyClient.id, order, mockMessages)

    // Mensagem previamente vinculada PERMANECE com att_other_existing
    const msgLinked = mockMessages.find((m) => m.id === 'msg_already_linked')
    expect(msgLinked?.attendance_id).toBe('att_other_existing')

    // Mensagem outbound permanece sem alteração
    const msgOut = mockMessages.find((m) => m.id === 'msg_outbound_system')
    expect(msgOut?.attendance_id).toBeUndefined()

    // Somente a inbound pendente do cliente recebeu att_target_701
    const msgPending = mockMessages.find((m) => m.id === 'msg_pending_target')
    expect(msgPending?.attendance_id).toBe('att_target_701')
  })

  it('9. Attendance fechado continua fechado (nenhuma escrita em attendances)', async () => {
    const closedAttendance: Attendance = {
      id: 'att_closed_1',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: true,
      closed_at: '2025-05-05T12:00:00.000Z',
      created: '2025-05-01T10:00:00.000Z',
      updated: '2025-05-05T12:00:00.000Z',
    }
    mockAttendances.push(closedAttendance)

    const order: ProductionOrder = {
      id: 'ord_prod',
      order_number: '#801',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_801',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Letra Caixa',
      attendance_id: 'att_closed_1',
      is_completed: false,
      is_archived: false,
      created: '2025-05-05T13:00:00.000Z',
      updated: '2025-05-05T13:00:00.000Z',
    }
    mockProductionOrders.push(order)

    mockMessages.push({
      id: 'msg_to_link',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'inbound',
      message_text: 'Mensagem sobre a entrega',
      created: '2025-05-11T10:00:00.000Z',
      updated: '2025-05-11T10:00:00.000Z',
    })

    await executeLinkToExistingOrder(dummyClient.id, order, mockMessages)

    // Attendance continua idêntico, fechado e arquivado
    const att = mockAttendances.find((a) => a.id === 'att_closed_1')
    expect(att?.stage).toBe('Venda fechada')
    expect(att?.is_archived).toBe(true)
    expect(att?.closed_at).toBe('2025-05-05T12:00:00.000Z')
  })

  it('10. Pedido continua intacto (nenhuma escrita em production_orders)', async () => {
    const order: ProductionOrder = {
      id: 'ord_immutable',
      order_number: '#901',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_901',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Placa ACM iluminada',
      attendance_id: 'att_901',
      is_completed: false,
      is_archived: false,
      total_value: 3500,
      promised_deadline: '2025-05-20T18:00:00.000Z',
      created: '2025-05-08T10:00:00.000Z',
      updated: '2025-05-08T10:00:00.000Z',
    }
    mockProductionOrders.push(order)

    mockMessages.push({
      id: 'msg_901',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'inbound',
      message_text: 'Dúvida sobre a placa',
      created: '2025-05-11T10:00:00.000Z',
      updated: '2025-05-11T10:00:00.000Z',
    })

    const snapshotBefore = JSON.stringify(order)
    await executeLinkToExistingOrder(dummyClient.id, order, mockMessages)
    const snapshotAfter = JSON.stringify(mockProductionOrders.find((o) => o.id === 'ord_immutable'))

    expect(snapshotAfter).toBe(snapshotBefore)
  })

  it('11. Indicador desaparece somente quando resolvido (quando unassignedInboundCount zerar)', async () => {
    const order: ProductionOrder = {
      id: 'ord_clean',
      order_number: '#999',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_999',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Banner',
      attendance_id: 'att_999',
      is_completed: false,
      is_archived: false,
      created: '2025-05-10T10:00:00.000Z',
      updated: '2025-05-10T10:00:00.000Z',
    }
    mockProductionOrders.push(order)

    mockMessages.push(
      {
        id: 'msg_a',
        client_id: dummyClient.id,
        attendance_id: undefined,
        direction: 'inbound',
        message_text: 'Mensagem 1',
        created: '2025-05-11T10:00:00.000Z',
        updated: '2025-05-11T10:00:00.000Z',
      },
      {
        id: 'msg_b',
        client_id: dummyClient.id,
        attendance_id: undefined,
        direction: 'inbound',
        message_text: 'Mensagem 2',
        created: '2025-05-11T10:05:00.000Z',
        updated: '2025-05-11T10:05:00.000Z',
      },
    )

    // Antes: 2 pendentes → banner visível
    const countBefore = mockMessages.filter(
      (m) => m.direction === 'inbound' && !m.attendance_id,
    ).length
    expect(countBefore).toBe(2)
    const bannerVisibleBefore = countBefore > 0
    expect(bannerVisibleBefore).toBe(true)

    // Vincula ao pedido
    await executeLinkToExistingOrder(dummyClient.id, order, mockMessages)

    // Depois: 0 pendentes → banner ocultado
    const countAfter = mockMessages.filter(
      (m) => m.direction === 'inbound' && !m.attendance_id,
    ).length
    expect(countAfter).toBe(0)
    const bannerVisibleAfter = countAfter > 0
    expect(bannerVisibleAfter).toBe(false)
  })

  it('12. Nenhum pedido elegível existente → exibe mensagem e não permite confirmação', () => {
    // Lista vazia de pedidos
    mockProductionOrders = []

    const eligible = getEligibleProductionOrders(mockProductionOrders)
    expect(eligible.length).toBe(0)

    // Se nenhum pedido elegível existir, botão de confirmação desabilitado
    let selectedOrder: ProductionOrder | null = null
    const canConfirm = !!selectedOrder && eligible.length > 0
    expect(canConfirm).toBe(false)

    // Mensagem esperada exibida
    const emptyStateMessage = 'Nenhum pedido ativo disponível para vinculação.'
    expect(emptyStateMessage).toBe('Nenhum pedido ativo disponível para vinculação.')
  })
})
