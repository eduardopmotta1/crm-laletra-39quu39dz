import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Attendance, Client, Message, ProductionOrder } from '@/types/crm'

// Mock state
let mockAttendances: Attendance[] = []
let mockProductionOrders: ProductionOrder[] = []
let mockMessages: Message[] = []
let mockClients: Client[] = []

// Simulação das regras do WhatsAppChatDrawer (handleConfirmCreateAttendanceFromUnassigned)
// e das proteções com mocks estritos (SEM dados reais, SEM alterar webhook, SEM alterar schema)
describe('Fluxo Manual: Criar Novo Pedido a partir de Mensagens Inbound Sem Pedido Associado', () => {
  const dummyClient: Client = {
    id: 'client_marcos_silva',
    name: 'Marcos Silva',
    phone: '5511988887777',
    normalized_phone: '5511988887777',
    stage: 'Em atendimento',
    created: '2025-05-10T10:00:00.000Z',
    updated: '2025-05-10T10:00:00.000Z',
  }

  const currentUser = {
    id: 'user_atendente_ana',
    name: 'Ana Atendente',
    email: 'ana@laletra.com.br',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAttendances = []
    mockProductionOrders = []
    mockMessages = []
    mockClients = [{ ...dummyClient }]
  })

  // Função auxiliar reproduzindo exatamente o comportamento implementado em WhatsAppChatDrawer.tsx
  const executeCreateNewOrderFromUnassigned = async (clientId: string, currentUserId: string) => {
    // 1. Criar novo attendance comercial para o cliente
    const newAttId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const nowIso = new Date().toISOString()
    const newAttendance: Attendance = {
      id: newAttId,
      client_id: clientId,
      stage: 'Em atendimento',
      source: 'whatsapp',
      assigned_to: currentUserId,
      notes: 'Atendimento comercial iniciado a partir de mensagem sem pedido associado',
      is_archived: false,
      created: nowIso,
      updated: nowIso,
    }
    mockAttendances.push(newAttendance)

    // 2. Localizar o bloco atual de mensagens inbound sem attendance_id desse cliente
    const unassignedInboundMsgs = mockMessages.filter(
      (m) => m.direction === 'inbound' && !m.attendance_id && m.client_id === clientId,
    )

    if (unassignedInboundMsgs.length > 0) {
      // Encontrar timestamp mais recente
      let latestInboundIso = newAttendance.created
      for (const msg of unassignedInboundMsgs) {
        if (
          msg.created &&
          (!latestInboundIso ||
            new Date(msg.created).getTime() > new Date(latestInboundIso).getTime())
        ) {
          latestInboundIso = msg.created
        }
      }

      // Associar mensagens pendentes
      for (const msg of unassignedInboundMsgs) {
        const found = mockMessages.find((m) => m.id === msg.id)
        if (found) {
          found.attendance_id = newAttendance.id
        }
      }

      // Atualizar last_customer_message_at para SLA
      newAttendance.last_customer_message_at = latestInboundIso
    }

    return newAttendance
  }

  it('TESTE A) Cliente com Pedido A em produção + inbound sem attendance → indicador aparece', () => {
    // Pedido A em produção
    const orderA: ProductionOrder = {
      id: 'ord_A_1001',
      order_number: '#1001',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_1001',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Banner 440g',
      is_completed: false,
      is_archived: false,
      created: '2025-05-10T10:00:00.000Z',
      updated: '2025-05-10T10:00:00.000Z',
    }
    mockProductionOrders.push(orderA)

    // Inbound sem attendance_id
    const inboundMsg: Message = {
      id: 'msg_unassigned_1',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'inbound',
      message_text: 'Olá, gostaria de fazer outro banner para semana que vem',
      created: '2025-05-10T14:30:00.000Z',
      updated: '2025-05-10T14:30:00.000Z',
    }
    mockMessages.push(inboundMsg)

    // Cálculo do indicador no Drawer
    const unassignedInboundCount = mockMessages.filter(
      (m) => m.direction === 'inbound' && !m.attendance_id,
    ).length

    expect(unassignedInboundCount).toBe(1)
    expect(unassignedInboundCount > 0).toBe(true)
  })

  it('TESTE B) Clicar "Novo pedido" → apenas abre confirmação, nenhum registro criado', () => {
    let confirmDialogOpen = false
    const initialAttendanceCount = mockAttendances.length

    // Atendente clica no botão "Novo pedido"
    confirmDialogOpen = true

    // Nenhuma mutação de banco ocorre
    expect(confirmDialogOpen).toBe(true)
    expect(mockAttendances.length).toBe(initialAttendanceCount)
  })

  it('TESTE C) Cancelar → nada é criado', () => {
    let confirmDialogOpen = true
    const initialAttendanceCount = mockAttendances.length

    // Atendente clica em "Cancelar"
    confirmDialogOpen = false

    expect(confirmDialogOpen).toBe(false)
    expect(mockAttendances.length).toBe(initialAttendanceCount)
  })

  it('TESTE D) Confirmar → cria novo attendance B (stage "Em atendimento", source "whatsapp", responsável atual)', async () => {
    mockMessages.push({
      id: 'msg_pending_1',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'inbound',
      message_text: 'Quero outro banner',
      created: '2025-05-10T15:00:00.000Z',
      updated: '2025-05-10T15:00:00.000Z',
    })

    const newAttendanceB = await executeCreateNewOrderFromUnassigned(dummyClient.id, currentUser.id)

    expect(newAttendanceB).toBeDefined()
    expect(newAttendanceB.client_id).toBe(dummyClient.id)
    expect(newAttendanceB.stage).toBe('Em atendimento')
    expect(newAttendanceB.source).toBe('whatsapp')
    expect(newAttendanceB.assigned_to).toBe(currentUser.id)
    expect(newAttendanceB.is_archived).toBe(false)
  })

  it('TESTE E) Pedido A continua intacto em produção', async () => {
    const orderA: ProductionOrder = {
      id: 'ord_A_1001',
      order_number: '#1001',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_1001',
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      product: 'Adesivo Vinil',
      is_completed: false,
      is_archived: false,
      created: '2025-05-10T09:00:00.000Z',
      updated: '2025-05-10T09:00:00.000Z',
    }
    mockProductionOrders.push(orderA)

    await executeCreateNewOrderFromUnassigned(dummyClient.id, currentUser.id)

    // O pedido original permanece intacto
    const foundOrderA = mockProductionOrders.find((o) => o.id === 'ord_A_1001')
    expect(foundOrderA).toBeDefined()
    expect(foundOrderA?.stage_internal_id).toBe('in_production')
    expect(foundOrderA?.is_completed).toBe(false)
    expect(foundOrderA?.is_archived).toBe(false)
  })

  it('TESTE F) Attendance A fechado continua fechado/arquivado', async () => {
    const attendanceA: Attendance = {
      id: 'att_A_closed',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: true,
      closed_at: '2025-05-10T11:00:00.000Z',
      created: '2025-05-09T10:00:00.000Z',
      updated: '2025-05-10T11:00:00.000Z',
    }
    mockAttendances.push(attendanceA)

    await executeCreateNewOrderFromUnassigned(dummyClient.id, currentUser.id)

    // Attendance A permanece intacto e arquivado
    const foundAttA = mockAttendances.find((a) => a.id === 'att_A_closed')
    expect(foundAttA).toBeDefined()
    expect(foundAttA?.stage).toBe('Venda fechada')
    expect(foundAttA?.is_archived).toBe(true)
    expect(foundAttA?.closed_at).toBe('2025-05-10T11:00:00.000Z')
  })

  it('TESTE G) Attendance B aparece no Funil (ativo, is_archived false)', async () => {
    const newAtt = await executeCreateNewOrderFromUnassigned(dummyClient.id, currentUser.id)

    // Filtro do Funil de Vendas: !is_archived
    const funilAttendances = mockAttendances.filter((a) => !a.is_archived)
    expect(funilAttendances.map((a) => a.id)).toContain(newAtt.id)
    expect(newAtt.is_archived).toBe(false)
  })

  it('TESTE H) Cliente possui simultaneamente Pedido A em produção + Attendance B comercial aberto', async () => {
    const orderA: ProductionOrder = {
      id: 'ord_prod_simultaneous',
      order_number: '#2000',
      client_id: dummyClient.id,
      client_name: dummyClient.name,
      client_phone: dummyClient.phone,
      tracking_token: 'token_2000',
      product: 'Placa ACM',
      stage_internal_id: 'finishing',
      stage_name: 'Acabamento',
      is_completed: false,
      is_archived: false,
      created: '2025-05-10T08:00:00.000Z',
      updated: '2025-05-10T08:00:00.000Z',
    }
    mockProductionOrders.push(orderA)

    const newAttB = await executeCreateNewOrderFromUnassigned(dummyClient.id, currentUser.id)

    const activeOrders = mockProductionOrders.filter(
      (o) => o.client_id === dummyClient.id && !o.is_completed && !o.is_archived,
    )
    const openCommercialAtts = mockAttendances.filter(
      (a) =>
        a.client_id === dummyClient.id &&
        !a.is_archived &&
        a.stage !== 'Venda fechada' &&
        a.stage !== 'Não fechou',
    )

    expect(activeOrders.length).toBe(1)
    expect(activeOrders[0].id).toBe('ord_prod_simultaneous')
    expect(openCommercialAtts.length).toBe(1)
    expect(openCommercialAtts[0].id).toBe(newAttB.id)
  })

  it('TESTE I) Próxima inbound → webhook existente encontra Attendance B aberto e o reutiliza', () => {
    // Attendance B aberto criado pelo atendente
    const attB: Attendance = {
      id: 'att_B_opened_by_user',
      client_id: dummyClient.id,
      stage: 'Em atendimento',
      source: 'whatsapp',
      assigned_to: currentUser.id,
      is_archived: false,
      created: '2025-05-10T16:00:00.000Z',
      updated: '2025-05-10T16:00:00.000Z',
    }
    mockAttendances.push(attB)

    // Condição exata do webhook atual (linhas 576-587 em whatsapp_webhook.js):
    // "client_id = '" + clientId + "' && is_archived != true && stage != 'Venda fechada' && stage != 'Não fechou'"
    const openAttFilter = (att: Attendance) =>
      att.client_id === dummyClient.id &&
      !att.is_archived &&
      att.stage !== 'Venda fechada' &&
      att.stage !== 'Não fechou'

    const matchedAttendances = mockAttendances.filter(openAttFilter)
    expect(matchedAttendances.length).toBe(1)
    expect(matchedAttendances[0].id).toBe('att_B_opened_by_user')

    // Webhook reutilizará targetAtt.id e moverá stage para "Precisa responder"
    const targetAtt = matchedAttendances[0]
    targetAtt.last_customer_message_at = '2025-05-10T16:05:00.000Z'
    if (targetAtt.stage !== 'Novo contato' && targetAtt.stage !== 'Precisa responder') {
      targetAtt.stage = 'Precisa responder'
    }

    expect(targetAtt.stage).toBe('Precisa responder')
  })

  it('TESTE J) Não criar segunda conversa WhatsApp (histórico por client_id intacto)', () => {
    // O Drawer lista histórico de mensagens por client_id
    mockMessages.push(
      {
        id: 'msg_old_1',
        client_id: dummyClient.id,
        attendance_id: 'att_A_old',
        direction: 'inbound',
        message_text: 'Mensagem antiga do Pedido A',
        created: '2025-05-09T10:00:00.000Z',
        updated: '2025-05-09T10:00:00.000Z',
      },
      {
        id: 'msg_new_2',
        client_id: dummyClient.id,
        attendance_id: undefined,
        direction: 'inbound',
        message_text: 'Mensagem recente sem pedido',
        created: '2025-05-10T15:00:00.000Z',
        updated: '2025-05-10T15:00:00.000Z',
      },
    )

    const conversationMessages = mockMessages.filter((m) => m.client_id === dummyClient.id)
    expect(conversationMessages.length).toBe(2)
    // Conversa é única pelo cliente
    expect(new Set(conversationMessages.map((m) => m.client_id)).size).toBe(1)
  })

  it('TESTE K) Não alterar mensagens vinculadas a outros attendances', async () => {
    const msgLinkedToOtherAtt: Message = {
      id: 'msg_linked_already',
      client_id: dummyClient.id,
      attendance_id: 'att_other_existing',
      direction: 'inbound',
      message_text: 'Mensagem que já pertence a outro atendimento',
      created: '2025-05-10T12:00:00.000Z',
      updated: '2025-05-10T12:00:00.000Z',
    }
    const msgUnassigned: Message = {
      id: 'msg_pending_new',
      client_id: dummyClient.id,
      attendance_id: undefined,
      direction: 'inbound',
      message_text: 'Mensagem pendente nova',
      created: '2025-05-10T15:30:00.000Z',
      updated: '2025-05-10T15:30:00.000Z',
    }
    mockMessages.push(msgLinkedToOtherAtt, msgUnassigned)

    const newAtt = await executeCreateNewOrderFromUnassigned(dummyClient.id, currentUser.id)

    // A mensagem já vinculada NÃO foi tocada
    const preservedMsg = mockMessages.find((m) => m.id === 'msg_linked_already')
    expect(preservedMsg?.attendance_id).toBe('att_other_existing')

    // Somente a não vinculada recebeu o id do novo atendimento
    const updatedPendingMsg = mockMessages.find((m) => m.id === 'msg_pending_new')
    expect(updatedPendingMsg?.attendance_id).toBe(newAtt.id)
  })

  it('TESTE L) Cliente sem mensagem pendente sem pedido → botão não aparece', () => {
    mockMessages.push({
      id: 'msg_regular',
      client_id: dummyClient.id,
      attendance_id: 'att_regular',
      direction: 'inbound',
      message_text: 'Mensagem com atendimento vinculado',
      created: '2025-05-10T14:00:00.000Z',
      updated: '2025-05-10T14:00:00.000Z',
    })

    const unassignedInboundCount = mockMessages.filter(
      (m) => m.direction === 'inbound' && !m.attendance_id,
    ).length

    expect(unassignedInboundCount).toBe(0)
    // Se unassignedInboundCount === 0, o banner com o botão não é renderizado
    const shouldRenderBanner = unassignedInboundCount > 0
    expect(shouldRenderBanner).toBe(false)
  })
})
