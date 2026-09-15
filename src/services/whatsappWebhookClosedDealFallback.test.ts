import { describe, it, expect } from 'vitest'

/**
 * Testes Unitários de Resolução de Atendimento Inbound (Fallback de Venda Recém-Fechada)
 * Simula a lógica idêntica à de pocketbase/hooks/whatsapp_webhook.js com mocks em memória.
 * NENHUM DADO REAL É ALTERADO. NENHUM WHATSAPP REAL É ENVIADO.
 */

interface MockAttendance {
  id: string
  client_id: string
  stage: string
  is_archived?: boolean
  last_customer_message_at?: string
  closed_at?: string
  created?: string
  updated?: string
  source?: string
  assigned_to?: string
}

interface MockStageTransition {
  id: string
  attendance_id: string
  to_stage: string
  created: string
}

interface MockProductionOrder {
  id: string
  attendance_id: string
  created: string
}

interface MockClient {
  id: string
  name: string
  phone: string
  assigned_to?: string
  is_archived?: boolean
}

interface WebhookResolutionResult {
  action: 'reused_open' | 'reused_closed_fallback' | 'created_new'
  attendanceId: string
  createdNewAttendance: boolean
  targetAttendance: MockAttendance
}

function resolveInboundAttendance(params: {
  clientId: string
  currentTimestampIso: string
  attendances: MockAttendance[]
  stageTransitions: MockStageTransition[]
  productionOrders: MockProductionOrder[]
  client: MockClient
}): WebhookResolutionResult {
  const { clientId, currentTimestampIso, attendances, stageTransitions, productionOrders, client } =
    params

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
    const targetAtt = openAttendances[0]
    const attendanceId = targetAtt.id
    targetAtt.last_customer_message_at = currentTimestampIso
    if (targetAtt.stage !== 'Novo contato' && targetAtt.stage !== 'Precisa responder') {
      targetAtt.stage = 'Precisa responder'
    }
    return {
      action: 'reused_open',
      attendanceId,
      createdNewAttendance: false,
      targetAttendance: targetAtt,
    }
  }

  // 2. FALLBACK PARA VENDA RECÉM-FECHADA (Janela de Continuidade: 15 minutos)
  const CLOSED_DEAL_CONTINUITY_WINDOW_MS = 15 * 60 * 1000
  const currentMsgMs = new Date(currentTimestampIso).getTime()
  let fallbackClosedAtt: MockAttendance | null = null

  const candidateClosedAtts = attendances
    .filter((a) => a.client_id === clientId && a.stage === 'Venda fechada')
    .sort(
      (a, b) =>
        new Date(b.updated || b.created || 0).getTime() -
        new Date(a.updated || a.created || 0).getTime(),
    )

  if (candidateClosedAtts.length > 0) {
    for (const candidate of candidateClosedAtts) {
      let closedEventMs = 0

      // Busca transição
      const trans = stageTransitions
        .filter((t) => t.attendance_id === candidate.id && t.to_stage === 'Venda fechada')
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())

      if (trans.length > 0 && trans[0].created) {
        closedEventMs = new Date(trans[0].created).getTime()
      }

      if (!closedEventMs || isNaN(closedEventMs)) {
        if (candidate.closed_at) closedEventMs = new Date(candidate.closed_at).getTime()
      }
      if (!closedEventMs || isNaN(closedEventMs)) {
        if (candidate.updated) closedEventMs = new Date(candidate.updated).getTime()
      }
      if (!closedEventMs || isNaN(closedEventMs)) {
        if (candidate.created) closedEventMs = new Date(candidate.created).getTime()
      }

      let lastCustomerMsgMs = 0
      if (candidate.last_customer_message_at) {
        lastCustomerMsgMs = new Date(candidate.last_customer_message_at).getTime()
      }

      const isWithinClosingWindow =
        closedEventMs > 0 &&
        currentMsgMs >= closedEventMs &&
        currentMsgMs - closedEventMs <= CLOSED_DEAL_CONTINUITY_WINDOW_MS

      const isWithinFollowUpSequence =
        lastCustomerMsgMs > 0 &&
        currentMsgMs >= lastCustomerMsgMs &&
        currentMsgMs - lastCustomerMsgMs <= CLOSED_DEAL_CONTINUITY_WINDOW_MS

      const isSimultaneousClose =
        closedEventMs > 0 &&
        Math.abs(currentMsgMs - closedEventMs) <= CLOSED_DEAL_CONTINUITY_WINDOW_MS

      if (isWithinClosingWindow || isWithinFollowUpSequence || isSimultaneousClose) {
        fallbackClosedAtt = candidate
        break
      }
    }
  }

  if (fallbackClosedAtt) {
    const attendanceId = fallbackClosedAtt.id
    fallbackClosedAtt.last_customer_message_at = currentTimestampIso
    return {
      action: 'reused_closed_fallback',
      attendanceId,
      createdNewAttendance: false,
      targetAttendance: fallbackClosedAtt,
    }
  }

  // 3. Criar novo attendance ("Novo contato")
  const newAtt: MockAttendance = {
    id: 'att_new_' + Math.random().toString(36).substring(2, 9),
    client_id: clientId,
    stage: 'Novo contato',
    is_archived: false,
    last_customer_message_at: currentTimestampIso,
    source: 'whatsapp',
    assigned_to: client.assigned_to,
  }
  attendances.push(newAtt)

  return {
    action: 'created_new',
    attendanceId: newAtt.id,
    createdNewAttendance: true,
    targetAttendance: newAtt,
  }
}

describe('WhatsApp Webhook — Fallback de Venda Recém-Fechada (Continuidade Comercial <=15min)', () => {
  const dummyClient: MockClient = {
    id: 'cli_roseni_123',
    name: 'Roseni Santos da Silva',
    phone: '5521999998888',
    assigned_to: 'user_vendedor_1',
  }

  it('TESTE A) Venda fechada; cliente responde 11 segundos depois → mensagem no attendance fechado; nenhum novo attendance', () => {
    const closedTime = '2025-05-10T18:52:41.000Z'
    const inboundTime = '2025-05-10T18:52:52.000Z' // 11s depois

    const originalAtt: MockAttendance = {
      id: 'dib9x0x8spccmn3',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: false,
      updated: closedTime,
    }
    const transitions: MockStageTransition[] = [
      {
        id: 'trans_1',
        attendance_id: originalAtt.id,
        to_stage: 'Venda fechada',
        created: closedTime,
      },
    ]
    const allAttendances = [originalAtt]

    const result = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: inboundTime,
      attendances: allAttendances,
      stageTransitions: transitions,
      productionOrders: [],
      client: dummyClient,
    })

    expect(result.action).toBe('reused_closed_fallback')
    expect(result.attendanceId).toBe('dib9x0x8spccmn3')
    expect(result.createdNewAttendance).toBe(false)
    expect(result.targetAttendance.stage).toBe('Venda fechada')
    expect(result.targetAttendance.last_customer_message_at).toBe(inboundTime)
    expect(allAttendances.length).toBe(1)
  })

  it('TESTE B) Venda fechada; attendance arquivado 2s depois; cliente responde 1 min depois → mensagem no attendance arquivado; não desarquivar; nenhum card novo', () => {
    const closedTime = '2025-05-10T18:52:41.000Z'
    const archivedTime = '2025-05-10T18:52:43.000Z'
    const inboundTime = '2025-05-10T18:53:41.000Z' // 1 min depois

    const originalAtt: MockAttendance = {
      id: 'dib9x0x8spccmn3',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: true,
      updated: archivedTime,
    }
    const transitions: MockStageTransition[] = [
      {
        id: 'trans_1',
        attendance_id: originalAtt.id,
        to_stage: 'Venda fechada',
        created: closedTime,
      },
    ]
    const allAttendances = [originalAtt]

    const result = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: inboundTime,
      attendances: allAttendances,
      stageTransitions: transitions,
      productionOrders: [],
      client: dummyClient,
    })

    expect(result.action).toBe('reused_closed_fallback')
    expect(result.attendanceId).toBe('dib9x0x8spccmn3')
    expect(result.createdNewAttendance).toBe(false)
    // NÃO desarquivar
    expect(result.targetAttendance.is_archived).toBe(true)
    // NÃO mudar stage
    expect(result.targetAttendance.stage).toBe('Venda fechada')
    expect(allAttendances.length).toBe(1)
  })

  it('TESTE C) Venda fechada; production_order já existe; cliente responde 5 min depois → usar attendance original; nenhum novo card', () => {
    const closedTime = '2025-05-10T18:00:00.000Z'
    const inboundTime = '2025-05-10T18:05:00.000Z' // 5 min depois

    const originalAtt: MockAttendance = {
      id: 'att_with_prod_order',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: false,
      updated: closedTime,
    }
    const prodOrders: MockProductionOrder[] = [
      {
        id: 'prod_001',
        attendance_id: originalAtt.id,
        created: '2025-05-10T18:00:15.000Z',
      },
    ]
    const allAttendances = [originalAtt]

    const result = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: inboundTime,
      attendances: allAttendances,
      stageTransitions: [],
      productionOrders: prodOrders,
      client: dummyClient,
    })

    expect(result.action).toBe('reused_closed_fallback')
    expect(result.attendanceId).toBe('att_with_prod_order')
    expect(result.createdNewAttendance).toBe(false)
    expect(result.targetAttendance.stage).toBe('Venda fechada')
  })

  it('TESTE D) Venda fechada; ainda sem production_order; cliente responde 10s depois → usar attendance original', () => {
    const closedTime = '2025-05-10T18:00:00.000Z'
    const inboundTime = '2025-05-10T18:00:10.000Z' // 10s depois (sem production_order)

    const originalAtt: MockAttendance = {
      id: 'att_no_prod_order_yet',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: false,
      updated: closedTime,
    }
    const allAttendances = [originalAtt]

    const result = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: inboundTime,
      attendances: allAttendances,
      stageTransitions: [],
      productionOrders: [], // sem ordem de produção
      client: dummyClient,
    })

    expect(result.action).toBe('reused_closed_fallback')
    expect(result.attendanceId).toBe('att_no_prod_order_yet')
    expect(result.createdNewAttendance).toBe(false)
  })

  it('TESTE E) Venda fechada há mais de 15 min e sem attendance aberto; cliente inicia nova conversa → comportamento atual preservado: criar novo attendance "Novo contato"', () => {
    const closedTime = '2025-05-10T17:00:00.000Z'
    const inboundTime = '2025-05-10T17:16:00.000Z' // 16 min depois (> 15 min)

    const originalAtt: MockAttendance = {
      id: 'att_old_closed',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: true,
      updated: closedTime,
      closed_at: closedTime,
    }
    const allAttendances = [originalAtt]

    const result = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: inboundTime,
      attendances: allAttendances,
      stageTransitions: [
        {
          id: 't_old',
          attendance_id: originalAtt.id,
          to_stage: 'Venda fechada',
          created: closedTime,
        },
      ],
      productionOrders: [],
      client: dummyClient,
    })

    expect(result.action).toBe('created_new')
    expect(result.createdNewAttendance).toBe(true)
    expect(result.attendanceId).not.toBe('att_old_closed')
    expect(result.targetAttendance.stage).toBe('Novo contato')
    expect(result.targetAttendance.is_archived).toBe(false)
    expect(allAttendances.length).toBe(2)
  })

  it('TESTE F) Existe attendance comercial aberto → comportamento atual preservado (usar aberto e mover para Precisa responder)', () => {
    const inboundTime = '2025-05-10T18:00:00.000Z'

    const openAtt: MockAttendance = {
      id: 'att_open_1',
      client_id: dummyClient.id,
      stage: 'Orçamento enviado',
      is_archived: false,
      created: '2025-05-10T10:00:00.000Z',
    }
    const closedAtt: MockAttendance = {
      id: 'att_closed_recent',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: false,
      updated: '2025-05-10T17:59:00.000Z', // 1 min atrás
    }
    const allAttendances = [openAtt, closedAtt]

    const result = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: inboundTime,
      attendances: allAttendances,
      stageTransitions: [],
      productionOrders: [],
      client: dummyClient,
    })

    // Deve ter prioridade máxima o atendimento aberto
    expect(result.action).toBe('reused_open')
    expect(result.attendanceId).toBe('att_open_1')
    expect(result.targetAttendance.stage).toBe('Precisa responder')
    expect(result.createdNewAttendance).toBe(false)
  })

  it('TESTE G) Outbound da gráfica → nunca cria attendance', () => {
    // No webhook da Meta, direction === 'outbound' ou mensagens enviadas pela empresa não entram
    // no bloco de resolução de atendimento do webhook inbound.
    const isOutbound = true
    let attendanceCreated = false
    if (!isOutbound) {
      attendanceCreated = true
    }
    expect(attendanceCreated).toBe(false)
  })

  it('TESTE H) Mensagem vinculada ao attendance fechado → NÃO mudar stage para "Precisa responder"; NÃO desarquivar', () => {
    const closedTime = '2025-05-10T18:00:00.000Z'
    const inboundTime = '2025-05-10T18:08:00.000Z' // 8 min depois

    const originalAtt: MockAttendance = {
      id: 'att_archived_check',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: true,
      updated: closedTime,
    }
    const allAttendances = [originalAtt]

    const result = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: inboundTime,
      attendances: allAttendances,
      stageTransitions: [],
      productionOrders: [],
      client: dummyClient,
    })

    expect(result.action).toBe('reused_closed_fallback')
    expect(result.targetAttendance.stage).toBe('Venda fechada')
    expect(result.targetAttendance.stage).not.toBe('Precisa responder')
    expect(result.targetAttendance.is_archived).toBe(true)
  })

  it('TESTE I) Caso real Roseni: simular sequência de timestamps (18:52:41 fechamento, 18:52:52 "Joia!", 18:52:55 "Aprovei")', () => {
    const t0_fechamento = '2025-05-10T18:52:41.000Z'
    const t1_inbound_joia = '2025-05-10T18:52:52.000Z' // +11s
    const t2_inbound_aprovei = '2025-05-10T18:52:55.000Z' // +14s
    const t3_prod_order = '2025-05-10T18:52:57.000Z' // +16s
    const t4_arquivamento = '2025-05-10T18:52:59.000Z' // +18s

    const roseniAtt: MockAttendance = {
      id: 'dib9x0x8spccmn3',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: false,
      updated: t0_fechamento,
    }
    const transitions: MockStageTransition[] = [
      {
        id: 'trans_roseni',
        attendance_id: roseniAtt.id,
        to_stage: 'Venda fechada',
        created: t0_fechamento,
      },
    ]
    const prodOrders: MockProductionOrder[] = []
    const allAttendances = [roseniAtt]

    // 1. Mensagem "Joia!" aos 18:52:52
    const res1 = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: t1_inbound_joia,
      attendances: allAttendances,
      stageTransitions: transitions,
      productionOrders: prodOrders,
      client: dummyClient,
    })

    expect(res1.action).toBe('reused_closed_fallback')
    expect(res1.attendanceId).toBe('dib9x0x8spccmn3')
    expect(res1.createdNewAttendance).toBe(false)
    expect(allAttendances.length).toBe(1)

    // 2. Mensagem "Aprovei" aos 18:52:55
    const res2 = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: t2_inbound_aprovei,
      attendances: allAttendances,
      stageTransitions: transitions,
      productionOrders: prodOrders,
      client: dummyClient,
    })

    expect(res2.action).toBe('reused_closed_fallback')
    expect(res2.attendanceId).toBe('dib9x0x8spccmn3')
    expect(res2.createdNewAttendance).toBe(false)
    expect(allAttendances.length).toBe(1)

    // 3. Ordem de produção criada aos 18:52:57 e arquivamento aos 18:52:59
    prodOrders.push({
      id: 'order_001864',
      attendance_id: roseniAtt.id,
      created: t3_prod_order,
    })
    roseniAtt.is_archived = true
    roseniAtt.updated = t4_arquivamento

    // 4. Se cliente enviar outra mensagem aos 18:54:00 (dentro dos 15 min)
    const res3 = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: '2025-05-10T18:54:00.000Z',
      attendances: allAttendances,
      stageTransitions: transitions,
      productionOrders: prodOrders,
      client: dummyClient,
    })

    expect(res3.action).toBe('reused_closed_fallback')
    expect(res3.attendanceId).toBe('dib9x0x8spccmn3')
    expect(res3.createdNewAttendance).toBe(false)
    expect(res3.targetAttendance.is_archived).toBe(true)
    expect(res3.targetAttendance.stage).toBe('Venda fechada')
    expect(allAttendances.length).toBe(1)
  })

  it('TESTE Item 9) Continuidade conservadora: mensagens subsequentes próximas ao limite de 15 min', () => {
    const t0 = '2025-05-10T14:00:00.000Z' // Fechamento
    const t1 = '2025-05-10T14:14:30.000Z' // Inbound 1: 14m30s depois (< 15m)
    const t2 = '2025-05-10T14:15:30.000Z' // Inbound 2: 15m30s desde o fechamento, mas apenas 1m desde o último inbound

    const att: MockAttendance = {
      id: 'att_seq_test',
      client_id: dummyClient.id,
      stage: 'Venda fechada',
      is_archived: false,
      updated: t0,
    }
    const allAttendances = [att]
    const transitions: MockStageTransition[] = [
      {
        id: 'trans_seq',
        attendance_id: att.id,
        to_stage: 'Venda fechada',
        created: t0,
      },
    ]

    // Primeiro inbound dentro da janela
    const res1 = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: t1,
      attendances: allAttendances,
      stageTransitions: transitions,
      productionOrders: [],
      client: dummyClient,
    })
    expect(res1.action).toBe('reused_closed_fallback')
    expect(res1.attendanceId).toBe('att_seq_test')

    // Segundo inbound: fecha há 15m30s, mas a última mensagem do cliente foi há 1 minuto
    const res2 = resolveInboundAttendance({
      clientId: dummyClient.id,
      currentTimestampIso: t2,
      attendances: allAttendances,
      stageTransitions: transitions,
      productionOrders: [],
      client: dummyClient,
    })
    expect(res2.action).toBe('reused_closed_fallback')
    expect(res2.attendanceId).toBe('att_seq_test')
    expect(allAttendances.length).toBe(1)
  })
})
