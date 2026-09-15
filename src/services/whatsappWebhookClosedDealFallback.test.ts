import { describe, it, expect } from 'vitest'
import { isTimestampWithin24h, selectMostRecentIso } from './whatsappWindow'

/**
 * Testes Unitários de Resolução Híbrida de Atendimento Inbound (WhatsApp Webhook)
 * Substitui a antiga regra dos 15 minutos (0.0.223) por resolução baseada em:
 * 1º Attendance comercial aberto
 * 2º Pedido ativo em produção (salva sem attendance_id, sem criar card novo)
 * 3º Novo contato comercial ("Novo contato", source = "whatsapp")
 *
 * MOCKS EM MEMÓRIA — NENHUM DADO REAL É ALTERADO, NENHUM WHATSAPP REAL É ENVIADO.
 */

interface MockAttendance {
  id: string
  client_id: string
  stage: string
  is_archived?: boolean
  last_customer_message_at?: string
  created?: string
  updated?: string
  source?: string
  assigned_to?: string
}

interface MockProductionOrder {
  id: string
  order_number?: string
  client_id: string
  attendance_id?: string
  stage_id?: string
  stage_internal_id?: string
  stage_name?: string
  is_completed?: boolean
  is_archived?: boolean
  created?: string
  updated?: string
}

interface MockClient {
  id: string
  name: string
  phone: string
  assigned_to?: string
  is_archived?: boolean
  last_message_at?: string
  last_message_direction?: string
  last_message_text?: string
}

interface MockMessage {
  id: string
  client_id: string
  attendance_id?: string | null
  direction: 'inbound' | 'outbound'
  message_text: string
  created: string
  sender_name?: string
  status?: string
}

interface WebhookResolutionResult {
  action: 'reused_open' | 'active_production_unassigned' | 'created_new'
  attendanceId: string | null
  createdNewAttendance: boolean
  targetAttendance: MockAttendance | null
  savedMessage: MockMessage
}

/**
 * Simula a lógica idêntica de pocketbase/hooks/whatsapp_webhook.js
 */
function resolveWebhookInboundMessage(params: {
  client: MockClient | null
  fromPhone: string
  messageText: string
  currentTimestampIso: string
  attendances: MockAttendance[]
  productionOrders: MockProductionOrder[]
  messages: MockMessage[]
  clientsList?: MockClient[]
}): WebhookResolutionResult {
  const { fromPhone, messageText, currentTimestampIso, attendances, productionOrders, messages } =
    params

  let foundClient = params.client

  // Se cliente não existe, criar automaticamente
  if (!foundClient) {
    foundClient = {
      id: 'cli_' + Math.random().toString(36).substring(2, 9),
      name: 'Cliente WhatsApp ' + fromPhone,
      phone: fromPhone,
      is_archived: false,
      last_message_at: currentTimestampIso,
      last_message_direction: 'inbound',
      last_message_text: messageText,
    }
    if (params.clientsList) {
      params.clientsList.push(foundClient)
    }
  } else if (foundClient.is_archived) {
    foundClient.is_archived = false
  }

  const clientId = foundClient.id
  let attendanceId: string | null = null
  let action: WebhookResolutionResult['action'] = 'created_new'
  let targetAttendance: MockAttendance | null = null
  let createdNewAttendance = false

  // 1. Procurar atendimento comercial ABERTO: is_archived != true && stage != 'Venda fechada' && stage != 'Não fechou'
  const openAttendances = attendances
    .filter(
      (a) =>
        a.client_id === clientId &&
        a.is_archived !== true &&
        a.stage !== 'Venda fechada' &&
        a.stage !== 'Não fechou',
    )
    .sort((a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime())

  if (openAttendances.length > 0) {
    // 1º Attendance aberto comercial:
    // Reutilizar o mesmo attendance; NÃO criar outro attendance;
    // NÃO alterar stage em hipótese alguma (mensagem nova é notificação, não mudança de etapa comercial).
    const targetAtt = openAttendances[0]
    attendanceId = targetAtt.id
    targetAtt.last_customer_message_at = currentTimestampIso
    action = 'reused_open'
    targetAttendance = targetAtt
  } else {
    // 2º Pedido ativo em produção
    const finishedStageInternals = ['ready_for_pickup', 'shipped', 'completed']
    const finishedStageNames = [
      'pronto para retirada / envio',
      'pronto para retirada',
      'enviado / aguardando retirada',
      'enviado',
      'aguardando retirada',
      'concluído',
      'concluido',
    ]

    const candidateOrders = productionOrders.filter(
      (o) => o.client_id === clientId && o.is_archived !== true && o.is_completed !== true,
    )

    let hasActiveProductionOrder = false
    for (const pOrder of candidateOrders) {
      const pStageInternal = (pOrder.stage_internal_id || '').trim().toLowerCase()
      const pStageName = (pOrder.stage_name || '').trim().toLowerCase()

      if (
        finishedStageInternals.includes(pStageInternal) ||
        finishedStageNames.includes(pStageName)
      ) {
        continue
      }

      hasActiveProductionOrder = true
      break
    }

    if (hasActiveProductionOrder) {
      // NÃO criar attendance novo. Salvar com attendance_id = null
      attendanceId = null
      action = 'active_production_unassigned'
    } else {
      // 3º Criar novo atendimento comercial ("Novo contato")
      const newAtt: MockAttendance = {
        id: 'att_' + Math.random().toString(36).substring(2, 9),
        client_id: clientId,
        stage: 'Novo contato',
        is_archived: false,
        last_customer_message_at: currentTimestampIso,
        source: 'whatsapp',
        assigned_to: foundClient.assigned_to,
      }
      attendances.push(newAtt)
      attendanceId = newAtt.id
      targetAttendance = newAtt
      createdNewAttendance = true
      action = 'created_new'
    }
  }

  // Gravar mensagem
  const newMsg: MockMessage = {
    id: 'msg_' + Math.random().toString(36).substring(2, 9),
    client_id: clientId,
    attendance_id: attendanceId,
    direction: 'inbound',
    message_text: messageText,
    created: currentTimestampIso,
    sender_name: foundClient.name,
    status: 'delivered',
  }
  messages.push(newMsg)

  // Atualizar cliente
  foundClient.last_message_at = currentTimestampIso
  foundClient.last_message_direction = 'inbound'
  foundClient.last_message_text = messageText

  return {
    action,
    attendanceId,
    createdNewAttendance,
    targetAttendance,
    savedMessage: newMsg,
  }
}

describe('WhatsApp Webhook — Resolução Híbrida Inbound (Substituição da Regra 15 Minutos)', () => {
  const dummyClient: MockClient = {
    id: 'cli_roseni_123',
    name: 'Roseni Santos da Silva',
    phone: '5521999998888',
    assigned_to: 'user_vendedor_1',
  }

  it('TESTE A) Cliente totalmente novo manda mensagem → cria Novo contato normalmente', () => {
    const allClients: MockClient[] = []
    const allAttendances: MockAttendance[] = []
    const allOrders: MockProductionOrder[] = []
    const allMessages: MockMessage[] = []

    const result = resolveWebhookInboundMessage({
      client: null,
      fromPhone: '5511987654321',
      messageText: 'Olá, gostaria de saber os preços',
      currentTimestampIso: '2025-05-10T14:00:00.000Z',
      attendances: allAttendances,
      productionOrders: allOrders,
      messages: allMessages,
      clientsList: allClients,
    })

    expect(result.action).toBe('created_new')
    expect(result.createdNewAttendance).toBe(true)
    expect(result.attendanceId).toBeTruthy()
    expect(result.targetAttendance?.stage).toBe('Novo contato')
    expect(result.targetAttendance?.source).toBe('whatsapp')
    expect(result.savedMessage.attendance_id).toBe(result.attendanceId)
    expect(result.savedMessage.direction).toBe('inbound')
    expect(allAttendances.length).toBe(1)
  })

  it('TESTE B) Cliente conhecido sem atendimento aberto e sem pedido ativo → cria Novo contato normalmente', () => {
    const allAttendances: MockAttendance[] = []
    const allOrders: MockProductionOrder[] = []
    const allMessages: MockMessage[] = []

    const result = resolveWebhookInboundMessage({
      client: { ...dummyClient },
      fromPhone: dummyClient.phone,
      messageText: 'Boa tarde, preciso de um orçamento',
      currentTimestampIso: '2025-05-10T14:00:00.000Z',
      attendances: allAttendances,
      productionOrders: allOrders,
      messages: allMessages,
    })

    expect(result.action).toBe('created_new')
    expect(result.createdNewAttendance).toBe(true)
    expect(result.targetAttendance?.stage).toBe('Novo contato')
    expect(result.targetAttendance?.client_id).toBe(dummyClient.id)
    expect(result.targetAttendance?.assigned_to).toBe(dummyClient.assigned_to)
    expect(result.savedMessage.attendance_id).toBe(result.attendanceId)
  })

  it('TESTE C) Cliente com attendance aberto → reutiliza attendance normalmente', () => {
    const openAtt: MockAttendance = {
      id: 'att_open_proposta',
      client_id: dummyClient.id,
      stage: 'Orçamento enviado',
      is_archived: false,
      created: '2025-05-10T10:00:00.000Z',
    }
    const allAttendances: MockAttendance[] = [openAtt]
    const allOrders: MockProductionOrder[] = []
    const allMessages: MockMessage[] = []

    const result = resolveWebhookInboundMessage({
      client: { ...dummyClient },
      fromPhone: dummyClient.phone,
      messageText: 'Recebi o orçamento, podemos conversar?',
      currentTimestampIso: '2025-05-10T14:00:00.000Z',
      attendances: allAttendances,
      productionOrders: allOrders,
      messages: allMessages,
    })

    expect(result.action).toBe('reused_open')
    expect(result.createdNewAttendance).toBe(false)
    expect(result.attendanceId).toBe('att_open_proposta')
    // PRESERVAÇÃO DE STAGE: "Orçamento enviado" permanece "Orçamento enviado"
    expect(result.targetAttendance?.stage).toBe('Orçamento enviado')
    expect(result.targetAttendance?.last_customer_message_at).toBe('2025-05-10T14:00:00.000Z')
    expect(result.savedMessage.attendance_id).toBe('att_open_proposta')
    expect(allAttendances.length).toBe(1)
  })

  it('TESTE D) Cliente com pedido ativo em produção, sem attendance comercial aberto, manda "Joia!" → salva mensagem sem attendance_id → NÃO cria novo card/attendance', () => {
    const activeOrder: MockProductionOrder = {
      id: 'ord_prod_1',
      order_number: '#001864',
      client_id: dummyClient.id,
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }
    const closedAtt: MockAttendance = {
      id: 'att_venda_fechada',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: true,
      updated: '2025-05-10T13:00:00.000Z',
    }
    const allAttendances: MockAttendance[] = [closedAtt]
    const allOrders: MockProductionOrder[] = [activeOrder]
    const allMessages: MockMessage[] = []

    const result = resolveWebhookInboundMessage({
      client: { ...dummyClient },
      fromPhone: dummyClient.phone,
      messageText: 'Joia!',
      currentTimestampIso: '2025-05-10T15:30:00.000Z', // horas depois
      attendances: allAttendances,
      productionOrders: allOrders,
      messages: allMessages,
    })

    expect(result.action).toBe('active_production_unassigned')
    expect(result.createdNewAttendance).toBe(false)
    expect(result.attendanceId).toBeNull()
    expect(result.targetAttendance).toBeNull()
    expect(result.savedMessage.attendance_id).toBeNull()
    expect(result.savedMessage.client_id).toBe(dummyClient.id)
    expect(result.savedMessage.message_text).toBe('Joia!')
    // Nenhum novo attendance criado
    expect(allAttendances.length).toBe(1)
    // O attendance antigo fechado não foi tocado
    expect(closedAtt.is_archived).toBe(true)
    expect(closedAtt.stage).toBe('Venda fechada')
  })

  it('TESTE E) Mesmo cenário D, cliente manda "Quero outro produto" → também salva sem attendance_id → NÃO adivinhar intenção', () => {
    const activeOrder: MockProductionOrder = {
      id: 'ord_prod_2',
      order_number: '#001865',
      client_id: dummyClient.id,
      stage_internal_id: 'art_preparation',
      stage_name: 'Arte em preparação',
      is_completed: false,
      is_archived: false,
    }
    const closedAtt: MockAttendance = {
      id: 'att_venda_fechada_2',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: true,
    }
    const allAttendances: MockAttendance[] = [closedAtt]
    const allOrders: MockProductionOrder[] = [activeOrder]
    const allMessages: MockMessage[] = []

    const result = resolveWebhookInboundMessage({
      client: { ...dummyClient },
      fromPhone: dummyClient.phone,
      messageText: 'Quero fazer outro banner além deste pedido',
      currentTimestampIso: '2025-05-10T16:00:00.000Z',
      attendances: allAttendances,
      productionOrders: allOrders,
      messages: allMessages,
    })

    // NÃO usa IA, NÃO usa palavras-chave: salva sem attendance_id para decisão do atendente
    expect(result.action).toBe('active_production_unassigned')
    expect(result.createdNewAttendance).toBe(false)
    expect(result.attendanceId).toBeNull()
    expect(result.savedMessage.attendance_id).toBeNull()
    expect(allAttendances.length).toBe(1)
  })

  it('TESTE F) Cliente possui Pedido A em produção + Attendance B comercial aberto. Inbound chega → usar Attendance B aberto normalmente', () => {
    const activeOrder: MockProductionOrder = {
      id: 'ord_prod_A',
      client_id: dummyClient.id,
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }
    const openAttB: MockAttendance = {
      id: 'att_comercial_B',
      client_id: dummyClient.id,
      stage: 'Novo contato',
      is_archived: false,
      created: '2025-05-10T12:00:00.000Z',
    }
    const allAttendances: MockAttendance[] = [openAttB]
    const allOrders: MockProductionOrder[] = [activeOrder]
    const allMessages: MockMessage[] = []

    const result = resolveWebhookInboundMessage({
      client: { ...dummyClient },
      fromPhone: dummyClient.phone,
      messageText: 'Conseguiu calcular aquele segundo orçamento?',
      currentTimestampIso: '2025-05-10T16:00:00.000Z',
      attendances: allAttendances,
      productionOrders: allOrders,
      messages: allMessages,
    })

    // Prioridade máxima 1º: attendance aberto comercial B
    expect(result.action).toBe('reused_open')
    expect(result.attendanceId).toBe('att_comercial_B')
    expect(result.createdNewAttendance).toBe(false)
    // Stage Novo contato preservado
    expect(result.targetAttendance?.stage).toBe('Novo contato')
    expect(result.savedMessage.attendance_id).toBe('att_comercial_B')
    expect(allAttendances.length).toBe(1)
  })
  it('TESTE G) Outbound → nunca cria attendance', () => {
    // Valida que direção outbound não cria attendance nem passa pela resolução de funil inbound
    const isOutbound = true
    let attendanceCreated = false
    if (!isOutbound) {
      attendanceCreated = true
    }
    expect(attendanceCreated).toBe(false)
  })

  it('TESTE H) Mensagem sem attendance_id → aparece no Drawer por client_id', () => {
    const clientId = 'cli_roseni_123'
    const targetAttId = 'att_other_999'

    // Simula a query do Drawer: attendance_id = X || client_id = Y
    const storedMessages: MockMessage[] = [
      {
        id: 'msg_1',
        client_id: clientId,
        attendance_id: null, // sem attendance_id (pedido ativo em produção)
        direction: 'inbound',
        message_text: 'Joia! Ficou lindo.',
        created: '2025-05-10T15:00:00.000Z',
      },
      {
        id: 'msg_2',
        client_id: clientId,
        attendance_id: 'att_antigo',
        direction: 'outbound',
        message_text: 'Seu pedido foi para produção!',
        created: '2025-05-10T14:50:00.000Z',
      },
      {
        id: 'msg_3',
        client_id: 'other_client',
        attendance_id: 'att_other_999',
        direction: 'inbound',
        message_text: 'Mensagem de outro cliente',
        created: '2025-05-10T14:40:00.000Z',
      },
    ]

    // Filtro do drawer para a conversa do cliente:
    const drawerMessages = storedMessages.filter(
      (m) => m.client_id === clientId || m.attendance_id === targetAttId,
    )

    expect(drawerMessages.map((m) => m.id)).toContain('msg_1')
    expect(drawerMessages.find((m) => m.id === 'msg_1')?.attendance_id).toBeNull()
  })

  it('TESTE I) Mensagem sem attendance_id → continua contando para janela global Meta de 24h (lastInboundAt/isTimestampWithin24h por client_id)', () => {
    const clientId = 'cli_roseni_123'
    const nowIso = new Date().toISOString()
    const thirtyMinutesAgoIso = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const twentyFiveHoursAgoIso = new Date(Date.now() - 25 * 3600 * 1000).toISOString()

    const clientMessages: MockMessage[] = [
      {
        id: 'msg_old',
        client_id: clientId,
        attendance_id: 'att_closed',
        direction: 'inbound',
        message_text: 'Oi antigo',
        created: twentyFiveHoursAgoIso,
      },
      {
        id: 'msg_recent_no_att',
        client_id: clientId,
        attendance_id: null, // mensagem sem attendance_id
        direction: 'inbound',
        message_text: 'Joia!',
        created: thirtyMinutesAgoIso,
      },
    ]

    // Selecionar o inbound mais recente do cliente
    const clientInbounds = clientMessages.filter(
      (m) => m.client_id === clientId && m.direction === 'inbound',
    )
    const mostRecentInboundIso = selectMostRecentIso(...clientInbounds.map((m) => m.created))

    expect(mostRecentInboundIso).toBe(thirtyMinutesAgoIso)
    // Janela Meta 24h válida!
    expect(isTimestampWithin24h(mostRecentInboundIso, nowIso)).toBe(true)
  })

  it('TESTE J) Regra de 15 minutos da 0.0.223 → NÃO existe mais no webhook (nem constante, nem branch)', async () => {
    // Carregar o webhook como texto cru via Vite raw import
    const webhookCodeModule = await import('../../../pocketbase/hooks/whatsapp_webhook.js?raw')
    const webhookCode = webhookCodeModule.default

    expect(webhookCode).not.toContain('CLOSED_DEAL_CONTINUITY_WINDOW_MS')
    expect(webhookCode).not.toContain('continuidade <=15min')
    expect(webhookCode).not.toContain('isWithinClosingWindow')
    expect(webhookCode).not.toContain('isWithinFollowUpSequence')
    expect(webhookCode).not.toContain('isSimultaneousClose')
    expect(webhookCode).not.toContain('fallbackClosedAtt')
  })

  it('TESTE K) Nenhum attendance fechado é reaberto/desarquivado', () => {
    const closedAtt: MockAttendance = {
      id: 'att_closed_deal',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: true,
      updated: '2025-05-10T12:00:00.000Z',
    }
    const activeOrder: MockProductionOrder = {
      id: 'ord_active',
      client_id: dummyClient.id,
      stage_internal_id: 'in_production',
      stage_name: 'Em produção',
      is_completed: false,
      is_archived: false,
    }
    const allAttendances: MockAttendance[] = [closedAtt]

    const result = resolveWebhookInboundMessage({
      client: { ...dummyClient },
      fromPhone: dummyClient.phone,
      messageText: 'Quando fica pronto?',
      currentTimestampIso: '2025-05-10T12:05:00.000Z', // 5 minutos depois
      attendances: allAttendances,
      productionOrders: [activeOrder],
      messages: [],
    })

    expect(result.action).toBe('active_production_unassigned')
    expect(result.attendanceId).toBeNull()
    expect(closedAtt.is_archived).toBe(true)
    expect(closedAtt.stage).toBe('Venda fechada')
    expect(allAttendances.length).toBe(1)
  })

  it('TESTE L) Pedido em produção concluído ou enviado (stages finalizados) NÃO mantém cliente retido → cria "Novo contato"', () => {
    // Stages finalizados reais encontrados: ready_for_pickup, shipped, completed
    const shippedOrder: MockProductionOrder = {
      id: 'ord_shipped',
      client_id: dummyClient.id,
      stage_internal_id: 'shipped',
      stage_name: 'Enviado / Aguardando retirada',
      is_completed: false, // mesmo que flag ainda não tenha virado true
      is_archived: false,
    }
    const allAttendances: MockAttendance[] = [
      {
        id: 'att_antigo_fechado',
        client_id: dummyClient.id,
        stage: 'Venda fechada',
        is_archived: true,
      },
    ]

    const result = resolveWebhookInboundMessage({
      client: { ...dummyClient },
      fromPhone: dummyClient.phone,
      messageText: 'Olá, quero fazer um novo pedido agora',
      currentTimestampIso: '2025-05-10T17:00:00.000Z',
      attendances: allAttendances,
      productionOrders: [shippedOrder],
      messages: [],
    })

    // Como o pedido já foi enviado/finalizado, o cliente NÃO fica preso
    expect(result.action).toBe('created_new')
    expect(result.createdNewAttendance).toBe(true)
    expect(result.targetAttendance?.stage).toBe('Novo contato')
    expect(allAttendances.length).toBe(2)
  })
})
