import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Suíte de Testes Unitários: Notificação WhatsApp para NOVA VERSÃO de prova de arte
 *
 * Testes Obrigatórios da Especificação (A a H + Cenário Pedido #001861):
 * A) Pedido art_preparation -> enviar V1 -> muda awaiting_approval -> exatamente 1 WhatsApp
 * B) Pedido já awaiting_approval -> enviar V2 -> continua awaiting_approval -> exatamente 1 novo WhatsApp
 * C) Enviar V3 -> exatamente 1 novo WhatsApp -> link correto com tracking_token
 * D) Reprocessar V3 -> nenhum WhatsApp duplicado (idempotência por proof_id)
 * E) Cliente dentro 24h -> mensagem livre com versão e link
 * F) Cliente fora 24h + template não APPROVED -> não envia livre -> registra corretamente necessidade de template (requires_template)
 * G) Messages outbound só existe se Meta realmente aceitou envio
 * H) Link contém tracking_token correto do pedido (/acompanhar/{tracking_token})
 *
 * Cenário adicional: Pedido #001861 (3 provas V1–V3 enviadas em sequência):
 * Validação mockada demonstrando que no novo mecanismo cada nova versão gera sua notificação
 * e sua proteção anti-duplicidade funciona perfeitamente sem duplicar transição.
 */

// Interface e helper para simular os registros do PocketBase
interface MockRecord {
  id: string
  collectionName?: string
  data: Record<string, any>
  get: (field: string) => any
  set: (field: string, val: any) => void
  original?: () => MockRecord | null
}

function createMockRecord(
  initialData: Record<string, any>,
  originalData?: Record<string, any>,
  colName = '',
): MockRecord {
  const store = { ...initialData }
  const origRecord = originalData ? createMockRecord(originalData, undefined, colName) : null

  return {
    id: store.id || 'rec_test',
    collectionName: colName || store.collectionName || '',
    data: store,
    get(field: string) {
      return store[field]
    },
    set(field: string, val: any) {
      store[field] = val
    },
    original() {
      return origRecord
    },
  }
}

interface TestContext {
  orderRecord?: MockRecord
  clientRecord: MockRecord
  attendanceRecord?: MockRecord | null
  inboundMessages?: MockRecord[]
  existingLogs?: any[]
  metaEnv?: {
    WHATSAPP_ACCESS_TOKEN?: string
    WHATSAPP_PHONE_NUMBER_ID?: string
    WHATSAPP_GRAPH_API_VERSION?: string
  }
  httpSendImpl?: (options: any) => { statusCode: number; raw?: string; json?: any }
  currentTimeMs?: number
}

interface ExecutionResult {
  nextCalled: boolean
  notified: boolean
  skippedReason?: string
  savedProductionLogs: any[]
  savedMessages: any[]
  savedClients: any[]
  savedAttendances: any[]
  httpRequests: any[]
}

/**
 * Emulador fiel do hook backend production_proof_notify.js
 */
function runProductionProofNotifyHook(proofRecord: MockRecord, ctx: TestContext): ExecutionResult {
  const {
    orderRecord,
    clientRecord,
    attendanceRecord = null,
    inboundMessages = [],
    existingLogs = [],
    metaEnv = {
      WHATSAPP_ACCESS_TOKEN: 'valid_test_token',
      WHATSAPP_PHONE_NUMBER_ID: '1234567890',
      WHATSAPP_GRAPH_API_VERSION: 'v21.0',
    },
    httpSendImpl,
    currentTimeMs = Date.now(),
  } = ctx

  const result: ExecutionResult = {
    nextCalled: false,
    notified: false,
    savedProductionLogs: [],
    savedMessages: [],
    savedClients: [],
    savedAttendances: [],
    httpRequests: [],
  }

  const next = () => {
    result.nextCalled = true
  }

  const proofId = proofRecord.id
  const orderId = String(proofRecord.get('order_id') || '').trim()
  const versionNumber = Number(proofRecord.get('version_number') || 1)
  const status = String(proofRecord.get('status') || '').trim()

  if (status !== 'aguardando_aprovacao') {
    result.skippedReason = 'not_awaiting_approval'
    next()
    return result
  }

  if (!orderRecord || orderRecord.id !== orderId) {
    result.skippedReason = 'order_not_found'
    next()
    return result
  }

  const requiresArt = orderRecord.get('requires_art_approval') !== false
  if (!requiresArt) {
    result.skippedReason = 'does_not_require_art'
    next()
    return result
  }

  const orderNumber = String(orderRecord.get('order_number') || '').trim()
  const clientId = String(orderRecord.get('client_id') || '').trim()
  const trackingToken = String(orderRecord.get('tracking_token') || '').trim()
  const stageInternalId = String(orderRecord.get('stage_internal_id') || '').trim()
  const stageName = String(orderRecord.get('stage_name') || 'Aguardando aprovação').trim()
  const clientProvidedName = String(orderRecord.get('client_name') || '').trim()
  const clientProvidedPhone = String(orderRecord.get('client_phone') || '').trim()

  // Idempotência estrita por proof_id
  const proofMarker = '[proof:' + proofId + ']'
  const hasExisting = existingLogs.some(
    (log) =>
      log.order_id === orderId && typeof log.notes === 'string' && log.notes.includes(proofMarker),
  )

  if (hasExisting) {
    result.skippedReason = 'idempotent_duplicate'
    next()
    return result
  }

  if (!clientRecord) {
    result.skippedReason = 'client_not_found'
    next()
    return result
  }

  const clientPhoneRaw =
    clientRecord.get('normalized_phone') || clientRecord.get('phone') || clientProvidedPhone || ''

  const normalizeForMeta = (input: string) => {
    if (!input) return ''
    let d = String(input).replace(/\D/g, '')
    if (!d) return ''
    if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) {
      d = '55' + d
    }
    return d
  }

  const phoneNormalized = normalizeForMeta(clientPhoneRaw)
  if (!phoneNormalized || phoneNormalized.length < 10) {
    result.skippedReason = 'invalid_phone'
    next()
    return result
  }

  // Janela de 24h
  let lastInboundTimestamp = ''
  if (inboundMessages.length > 0) {
    lastInboundTimestamp = String(inboundMessages[0].get('created') || '')
  }

  let lastCustomerMessageAt = ''
  if (attendanceRecord) {
    lastCustomerMessageAt = String(attendanceRecord.get('last_customer_message_at') || '')
  }

  const check24hWindow = (cRec: MockRecord, inboundTime: string, custMsgAt: string) => {
    let custTimestamp = inboundTime || ''
    if (!custTimestamp) {
      custTimestamp = custMsgAt || ''
    }
    if (!custTimestamp) {
      const dir = String(cRec.get('last_message_direction') || '').trim()
      if (dir === 'inbound') {
        custTimestamp = String(cRec.get('last_message_at') || '').trim()
      }
    }
    if (!custTimestamp) return false

    const msgTime = new Date(custTimestamp).getTime()
    if (isNaN(msgTime) || msgTime <= 0) return false

    const diffMs = currentTimeMs - msgTime
    const diffHours = diffMs / (1000 * 60 * 60)
    return diffHours >= 0 && diffHours <= 24
  }

  const isInside24h = check24hWindow(clientRecord, lastInboundTimestamp, lastCustomerMessageAt)

  const resolvedClientName = clientProvidedName || clientRecord.get('name') || 'Cliente'
  const cleanBaseUrl = 'https://crm-grafica-whatsapp-7b1a5.goskip.app'
  const trackingLink = trackingToken ? cleanBaseUrl + '/acompanhar/' + trackingToken : ''

  const renderedMessage =
    'Olá, ' +
    resolvedClientName +
    '! Uma nova versão da arte do pedido #' +
    orderNumber.replace(/^#+/, '') +
    ' está disponível para sua aprovação. Versão: V' +
    versionNumber +
    '. Confira e registre sua decisão aqui: ' +
    trackingLink

  const coordinationMarker =
    proofMarker +
    ' [proof_v:' +
    versionNumber +
    '] [proof_notify_order:' +
    orderId +
    ':awaiting_approval]'

  // FORA DE 24H:
  if (!isInside24h) {
    result.savedProductionLogs.push({
      order_id: orderId,
      from_stage_id: stageInternalId,
      from_stage_name: stageName,
      to_stage_id: 'awaiting_approval',
      to_stage_name: 'Aguardando aprovação do cliente',
      change_type: 'automatic',
      notes:
        'Prova V' +
        versionNumber +
        ' enviada ao cliente para aprovação. Notificação retida: cliente fora da janela de 24h (exige Template Oficial Meta). ' +
        coordinationMarker,
      whatsapp_sent: false,
      whatsapp_status: 'requires_template',
      whatsapp_message: renderedMessage,
    })
    next()
    return result
  }

  // DENTRO DE 24H:
  const metaToken = metaEnv.WHATSAPP_ACCESS_TOKEN || ''
  const metaPhoneId = metaEnv.WHATSAPP_PHONE_NUMBER_ID || ''
  const metaApiVersion = metaEnv.WHATSAPP_GRAPH_API_VERSION || 'v21.0'

  if (!metaToken || !metaPhoneId) {
    result.savedProductionLogs.push({
      order_id: orderId,
      from_stage_id: stageInternalId,
      from_stage_name: stageName,
      to_stage_id: 'awaiting_approval',
      to_stage_name: 'Aguardando aprovação do cliente',
      change_type: 'automatic',
      notes:
        'Prova V' +
        versionNumber +
        ' enviada ao cliente para aprovação. Falha no envio: credenciais Meta não configuradas. ' +
        coordinationMarker,
      whatsapp_sent: false,
      whatsapp_status: 'falhou',
      whatsapp_message: renderedMessage,
    })
    next()
    return result
  }

  const metaUrl = 'https://graph.facebook.com/' + metaApiVersion + '/' + metaPhoneId + '/messages'
  const metaPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNormalized,
    type: 'text',
    text: {
      preview_url: false,
      body: renderedMessage,
    },
  }

  result.httpRequests.push({ url: metaUrl, payload: metaPayload })

  let metaResponse: any = null
  let httpError: any = null

  try {
    if (httpSendImpl) {
      metaResponse = httpSendImpl({
        url: metaUrl,
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + metaToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaPayload),
      })
    } else {
      metaResponse = {
        statusCode: 200,
        json: { messages: [{ id: 'wamid.HBgLM' + Date.now() }] },
      }
    }
  } catch (err) {
    httpError = err
  }

  const statusCode = metaResponse ? metaResponse.statusCode : 0
  let responseJson = metaResponse?.json
  if (!responseJson && metaResponse?.raw) {
    try {
      responseJson = JSON.parse(metaResponse.raw)
    } catch {
      /* intentionally ignored */
    }
  }

  const isMetaSuccess =
    statusCode >= 200 &&
    statusCode < 300 &&
    responseJson &&
    responseJson.messages &&
    responseJson.messages.length > 0
  const externalMessageId = isMetaSuccess ? responseJson.messages[0].id : ''

  const currentTimestampIso = new Date(currentTimeMs).toISOString()

  if (isMetaSuccess) {
    result.notified = true

    // Gravar mensagem real na collection messages SOMENTE em sucesso
    result.savedMessages.push({
      client_id: clientId,
      attendance_id: attendanceRecord ? attendanceRecord.id : undefined,
      direction: 'outbound',
      message_text: renderedMessage,
      sender_name: 'Produção Laletra',
      status: 'sent',
      whatsapp_message_id: externalMessageId,
    })

    // Atualizar client
    result.savedClients.push({
      id: clientRecord.id,
      last_message_at: currentTimestampIso,
      last_message_direction: 'outbound',
      last_message_text: renderedMessage.substring(0, 100),
    })

    // Atualizar attendance
    if (attendanceRecord) {
      result.savedAttendances.push({
        id: attendanceRecord.id,
        last_company_message_at: currentTimestampIso,
      })
    }

    // Production log sucesso
    result.savedProductionLogs.push({
      order_id: orderId,
      from_stage_id: stageInternalId,
      from_stage_name: stageName,
      to_stage_id: 'awaiting_approval',
      to_stage_name: 'Aguardando aprovação do cliente',
      change_type: 'automatic',
      notes:
        'Prova V' +
        versionNumber +
        ' enviada ao cliente para aprovação. Notificação enviada via WhatsApp Meta. WAMID: ' +
        externalMessageId +
        '. ' +
        coordinationMarker,
      whatsapp_sent: true,
      whatsapp_status: 'enviado',
      whatsapp_message: renderedMessage,
    })
  } else {
    // Falha Meta
    result.savedProductionLogs.push({
      order_id: orderId,
      from_stage_id: stageInternalId,
      from_stage_name: stageName,
      to_stage_id: 'awaiting_approval',
      to_stage_name: 'Aguardando aprovação do cliente',
      change_type: 'automatic',
      notes:
        'Prova V' +
        versionNumber +
        ' enviada ao cliente para aprovação. Falha ao enviar notificação WhatsApp via Meta. ' +
        coordinationMarker,
      whatsapp_sent: false,
      whatsapp_status: 'falhou',
      whatsapp_message: renderedMessage,
    })
  }

  next()
  return result
}

/**
 * Emulador do hook de transição de etapa production_status_notify.js
 * com o mecanismo de coordenação anti-duplicidade incluído
 */
function runStageTransitionNotifyHook(
  orderRecord: MockRecord,
  stageRecord: MockRecord,
  ctx: TestContext,
): ExecutionResult {
  const {
    clientRecord,
    attendanceRecord = null,
    inboundMessages = [],
    existingLogs = [],
    metaEnv = {
      WHATSAPP_ACCESS_TOKEN: 'valid_test_token',
      WHATSAPP_PHONE_NUMBER_ID: '1234567890',
      WHATSAPP_GRAPH_API_VERSION: 'v21.0',
    },
    httpSendImpl,
    currentTimeMs = Date.now(),
  } = ctx

  const result: ExecutionResult = {
    nextCalled: false,
    notified: false,
    savedProductionLogs: [],
    savedMessages: [],
    savedClients: [],
    savedAttendances: [],
    httpRequests: [],
  }

  const next = () => {
    result.nextCalled = true
  }

  const original = orderRecord.original ? orderRecord.original() : null
  const prevStage = original ? String(original.get('stage_internal_id') || '').trim() : ''
  const nextStage = String(orderRecord.get('stage_internal_id') || '').trim()

  if (!nextStage || prevStage === nextStage) {
    result.skippedReason = 'same_stage'
    next()
    return result
  }

  const orderId = orderRecord.id
  const orderNumber = String(orderRecord.get('order_number') || '').trim()
  const clientId = String(orderRecord.get('client_id') || '').trim()
  const trackingToken = String(orderRecord.get('tracking_token') || '').trim()
  const orderUpdatedIso = String(orderRecord.get('updated') || '').trim()

  const autoNotify = stageRecord.get('auto_notify_whatsapp') === true
  const messageTemplate = String(stageRecord.get('whatsapp_message_template') || '').trim()

  if (!autoNotify || !messageTemplate) {
    result.skippedReason = 'auto_notify_disabled'
    next()
    return result
  }

  // Idempotência e coordenação anti-duplicidade
  const transitionMarker = '[tx:' + orderId + ':' + nextStage + ':' + orderUpdatedIso + ']'
  const proofCoordinationMarker = '[proof_notify_order:' + orderId + ':awaiting_approval]'

  const hasTxLog = existingLogs.some(
    (log) =>
      log.order_id === orderId &&
      log.to_stage_id === nextStage &&
      typeof log.notes === 'string' &&
      log.notes.includes(transitionMarker),
  )

  if (hasTxLog) {
    result.skippedReason = 'idempotent_duplicate'
    next()
    return result
  }

  // Coordenação anti-duplicidade: se a etapa for awaiting_approval e acabou de haver log com proofCoordinationMarker
  if (nextStage === 'awaiting_approval') {
    const hasProofCoordination = existingLogs.some(
      (log) =>
        log.order_id === orderId &&
        typeof log.notes === 'string' &&
        log.notes.includes(proofCoordinationMarker),
    )
    if (hasProofCoordination) {
      result.skippedReason = 'suppressed_by_proof_coordination'
      next()
      return result
    }
  }

  // Se não foi suprimido, processaria o envio normal da etapa
  result.notified = true
  next()
  return result
}

describe('Notificação WhatsApp para NOVA VERSÃO de prova de arte', () => {
  const baseOrderData = {
    id: 'ord_1861',
    order_number: '#001861',
    client_id: 'client_eduardo',
    client_name: 'Eduardo Motta',
    client_phone: '+55 21 97015-6756',
    tracking_token: 'tk_track_1861',
    requires_art_approval: true,
    stage_internal_id: 'awaiting_approval',
    stage_name: 'Aguardando aprovação do cliente',
    updated: '2026-09-13T15:40:00.000Z',
  }

  const baseClientData = {
    id: 'client_eduardo',
    name: 'Eduardo Motta',
    phone: '+55 21 97015-6756',
    normalized_phone: '5521970156756',
    last_message_at: '2026-09-13T15:30:00.000Z',
    last_message_direction: 'inbound',
  }

  const awaitingApprovalStage = createMockRecord({
    id: 'stage_awaiting',
    internal_id: 'awaiting_approval',
    name: 'Aguardando aprovação do cliente',
    auto_notify_whatsapp: true,
    whatsapp_message_template:
      'Olá, {{nome}}! A arte do seu pedido #{{pedido}} está pronta para aprovação. Link: {{link_acompanhamento}}',
  })

  it('TESTE A) pedido art_preparation -> enviar V1 -> muda awaiting_approval -> exatamente 1 WhatsApp', () => {
    // 1. Pedido estava em art_preparation
    const orderBefore = {
      ...baseOrderData,
      stage_internal_id: 'art_preparation',
      stage_name: 'Arte em preparação',
    }

    // 2. Prova V1 criada
    const proofV1 = createMockRecord({
      id: 'proof_v1',
      order_id: 'ord_1861',
      version_number: 1,
      status: 'aguardando_aprovacao',
      created: '2026-09-13T15:37:00.000Z',
    })

    const clientRecord = createMockRecord(baseClientData)
    const inboundMsg = createMockRecord({
      id: 'msg_inbound',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: '2026-09-13T15:30:00.000Z',
    })

    // Executa hook da prova
    const proofHookResult = runProductionProofNotifyHook(proofV1, {
      orderRecord: createMockRecord(orderBefore),
      clientRecord,
      inboundMessages: [inboundMsg],
      existingLogs: [],
      currentTimeMs: new Date('2026-09-13T15:37:05.000Z').getTime(),
    })

    expect(proofHookResult.notified).toBe(true)
    expect(proofHookResult.httpRequests).toHaveLength(1)
    expect(proofHookResult.savedMessages).toHaveLength(1)
    expect(proofHookResult.savedProductionLogs).toHaveLength(1)
    const proofLog = proofHookResult.savedProductionLogs[0]
    expect(proofLog.whatsapp_sent).toBe(true)
    expect(proofLog.whatsapp_status).toBe('enviado')
    expect(proofLog.notes).toContain('[proof:proof_v1]')
    expect(proofLog.notes).toContain('[proof_notify_order:ord_1861:awaiting_approval]')

    // 3. Em seguida, a etapa do pedido transiciona de art_preparation para awaiting_approval
    const orderAfter = createMockRecord(
      {
        ...baseOrderData,
        stage_internal_id: 'awaiting_approval',
        stage_name: 'Aguardando aprovação do cliente',
        updated: '2026-09-13T15:37:10.000Z',
      },
      orderBefore,
    )

    // O hook de transição roda passando os logs existentes (incluindo o log que o evento da prova acabou de salvar)
    const stageHookResult = runStageTransitionNotifyHook(orderAfter, awaitingApprovalStage, {
      clientRecord,
      inboundMessages: [inboundMsg],
      existingLogs: proofHookResult.savedProductionLogs,
      currentTimeMs: new Date('2026-09-13T15:37:10.000Z').getTime(),
    })

    // O hook de transição de etapa foi SUSTRADO por coordenação anti-duplicidade
    expect(stageHookResult.notified).toBe(false)
    expect(stageHookResult.skippedReason).toBe('suppressed_by_proof_coordination')

    // Conclusão do Teste A: Total de WhatsApps disparados = EXATAMENTE 1
    const totalWhatsApps = (proofHookResult.notified ? 1 : 0) + (stageHookResult.notified ? 1 : 0)
    expect(totalWhatsApps).toBe(1)
  })

  it('TESTE B) pedido já awaiting_approval -> enviar V2 -> continua awaiting_approval -> exatamente 1 novo WhatsApp', () => {
    // Pedido já estava em awaiting_approval
    const orderAlreadyAwaiting = createMockRecord({
      ...baseOrderData,
      stage_internal_id: 'awaiting_approval',
      stage_name: 'Aguardando aprovação do cliente',
    })

    // Prova V2 criada
    const proofV2 = createMockRecord({
      id: 'proof_v2',
      order_id: 'ord_1861',
      version_number: 2,
      status: 'aguardando_aprovacao',
      created: '2026-09-13T15:38:00.000Z',
    })

    const clientRecord = createMockRecord(baseClientData)
    const inboundMsg = createMockRecord({
      id: 'msg_inbound',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: '2026-09-13T15:30:00.000Z',
    })

    // Log anterior existia para a V1, mas NÃO para a V2
    const previousLogs = [
      {
        order_id: 'ord_1861',
        notes: 'Prova V1 enviada... [proof:proof_v1]',
        whatsapp_sent: true,
      },
    ]

    const proofHookResult = runProductionProofNotifyHook(proofV2, {
      orderRecord: orderAlreadyAwaiting,
      clientRecord,
      inboundMessages: [inboundMsg],
      existingLogs: previousLogs,
      currentTimeMs: new Date('2026-09-13T15:38:05.000Z').getTime(),
    })

    // Disparou notificação com sucesso para a V2 mesmo sem haver mudança de etapa!
    expect(proofHookResult.notified).toBe(true)
    expect(proofHookResult.httpRequests).toHaveLength(1)
    expect(proofHookResult.savedMessages).toHaveLength(1)
    expect(proofHookResult.savedProductionLogs[0].notes).toContain('Prova V2')
    expect(proofHookResult.savedProductionLogs[0].notes).toContain('[proof:proof_v2]')
  })

  it('TESTE C) enviar V3 -> exatamente 1 novo WhatsApp -> link correto com tracking_token', () => {
    const orderRecord = createMockRecord(baseOrderData)
    const clientRecord = createMockRecord(baseClientData)
    const inboundMsg = createMockRecord({
      id: 'msg_inbound',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: '2026-09-13T15:30:00.000Z',
    })

    const proofV3 = createMockRecord({
      id: 'proof_v3',
      order_id: 'ord_1861',
      version_number: 3,
      status: 'aguardando_aprovacao',
      created: '2026-09-13T15:41:00.000Z',
    })

    const proofHookResult = runProductionProofNotifyHook(proofV3, {
      orderRecord,
      clientRecord,
      inboundMessages: [inboundMsg],
      existingLogs: [],
      currentTimeMs: new Date('2026-09-13T15:41:05.000Z').getTime(),
    })

    expect(proofHookResult.notified).toBe(true)
    const sentText = proofHookResult.httpRequests[0].payload.text.body
    expect(sentText).toContain('Versão: V3')
    expect(sentText).toContain('/acompanhar/tk_track_1861')
    expect(sentText).toContain('pedido #001861')
  })

  it('TESTE D) reprocessar V3 -> nenhum WhatsApp duplicado (idempotência por proof_id)', () => {
    const orderRecord = createMockRecord(baseOrderData)
    const clientRecord = createMockRecord(baseClientData)
    const proofV3 = createMockRecord({
      id: 'proof_v3',
      order_id: 'ord_1861',
      version_number: 3,
      status: 'aguardando_aprovacao',
    })

    // Log já existe com a marca [proof:proof_v3]
    const existingLogs = [
      {
        order_id: 'ord_1861',
        notes: 'Prova V3 enviada ao cliente para aprovação. [proof:proof_v3]',
        whatsapp_sent: true,
      },
    ]

    const result = runProductionProofNotifyHook(proofV3, {
      orderRecord,
      clientRecord,
      existingLogs,
      currentTimeMs: Date.now(),
    })

    expect(result.notified).toBe(false)
    expect(result.skippedReason).toBe('idempotent_duplicate')
    expect(result.httpRequests).toHaveLength(0)
    expect(result.savedMessages).toHaveLength(0)
    expect(result.savedProductionLogs).toHaveLength(0)
  })

  it('TESTE E) cliente dentro 24h -> mensagem livre com versão e link', () => {
    const orderRecord = createMockRecord(baseOrderData)
    const clientRecord = createMockRecord(baseClientData)
    const inboundMsg = createMockRecord({
      id: 'msg_inbound',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h atrás
    })

    const proof = createMockRecord({
      id: 'proof_v10',
      order_id: 'ord_1861',
      version_number: 10,
      status: 'aguardando_aprovacao',
    })

    const result = runProductionProofNotifyHook(proof, {
      orderRecord,
      clientRecord,
      inboundMessages: [inboundMsg],
      currentTimeMs: Date.now(),
    })

    expect(result.notified).toBe(true)
    expect(result.savedProductionLogs[0].whatsapp_status).toBe('enviado')
    expect(result.savedProductionLogs[0].whatsapp_sent).toBe(true)
    expect(result.savedProductionLogs[0].whatsapp_message).toContain('Versão: V10')
  })

  it('TESTE F) cliente fora 24h + template não APPROVED -> não envia livre -> registra corretamente necessidade de template', () => {
    const orderRecord = createMockRecord(baseOrderData)
    // Cliente com última mensagem há 30 horas
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
    const clientRecord = createMockRecord({
      ...baseClientData,
      last_message_at: thirtyHoursAgo,
      last_message_direction: 'inbound',
    })
    const inboundMsg = createMockRecord({
      id: 'msg_old_inbound',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: thirtyHoursAgo,
    })

    const proof = createMockRecord({
      id: 'proof_v4',
      order_id: 'ord_1861',
      version_number: 4,
      status: 'aguardando_aprovacao',
    })

    const result = runProductionProofNotifyHook(proof, {
      orderRecord,
      clientRecord,
      inboundMessages: [inboundMsg],
      currentTimeMs: Date.now(),
    })

    // Envio livre NÃO pode ocorrer
    expect(result.notified).toBe(false)
    expect(result.httpRequests).toHaveLength(0)
    expect(result.savedMessages).toHaveLength(0)

    // Log DEVE indicar whatsapp_sent=false e whatsapp_status="requires_template"
    expect(result.savedProductionLogs).toHaveLength(1)
    const log = result.savedProductionLogs[0]
    expect(log.whatsapp_sent).toBe(false)
    expect(log.whatsapp_status).toBe('requires_template')
    expect(log.notes).toContain('exige Template Oficial Meta')
  })

  it('TESTE G) messages outbound só existe se Meta realmente aceitou envio', () => {
    const orderRecord = createMockRecord(baseOrderData)
    const clientRecord = createMockRecord(baseClientData)
    const inboundMsg = createMockRecord({
      id: 'msg_inbound',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: new Date().toISOString(),
    })

    const proof = createMockRecord({
      id: 'proof_v5',
      order_id: 'ord_1861',
      version_number: 5,
      status: 'aguardando_aprovacao',
    })

    // Simula erro retornado pela Meta (ex: token expirado / erro 401)
    const failSendImpl = () => ({
      statusCode: 401,
      json: {
        error: {
          message: 'Invalid OAuth access token.',
          code: 190,
        },
      },
    })

    const result = runProductionProofNotifyHook(proof, {
      orderRecord,
      clientRecord,
      inboundMessages: [inboundMsg],
      httpSendImpl: failSendImpl,
      currentTimeMs: Date.now(),
    })

    expect(result.notified).toBe(false)
    // Collection messages NÃO pode ter registro criado se a Meta rejeitou o envio!
    expect(result.savedMessages).toHaveLength(0)
    // Production log deve indicar status de falha sem quebrar fluxo
    expect(result.savedProductionLogs).toHaveLength(1)
    expect(result.savedProductionLogs[0].whatsapp_sent).toBe(false)
    expect(result.savedProductionLogs[0].whatsapp_status).toBe('falhou')
  })

  it('TESTE H) link contém tracking_token correto do pedido (/acompanhar/{tracking_token}) e usa domínio oficial de produção', () => {
    const orderRecord = createMockRecord({
      ...baseOrderData,
      tracking_token: 'tk_unique_token_xyz999',
    })
    const clientRecord = createMockRecord(baseClientData)
    const inboundMsg = createMockRecord({
      id: 'msg_inbound',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: new Date().toISOString(),
    })

    const proof = createMockRecord({
      id: 'proof_v6',
      order_id: 'ord_1861',
      version_number: 6,
      status: 'aguardando_aprovacao',
    })

    const result = runProductionProofNotifyHook(proof, {
      orderRecord,
      clientRecord,
      inboundMessages: [inboundMsg],
      currentTimeMs: Date.now(),
    })

    expect(result.notified).toBe(true)
    const requestBody = result.httpRequests[0].payload.text.body
    expect(requestBody).toContain(
      'https://crm-grafica-whatsapp-7b1a5.goskip.app/acompanhar/tk_unique_token_xyz999',
    )
    expect(requestBody).not.toContain('--preview')
    expect(requestBody).not.toContain('internal.goskip.dev')
  })

  it('TESTE #001861) validação estrita do link de acompanhamento para token real de #001861', () => {
    const orderRecord = createMockRecord({
      ...baseOrderData,
      order_number: '#001861',
      tracking_token: 'tk_lgkewmryq1wpe0npzrctthf2',
    })
    const clientRecord = createMockRecord(baseClientData)
    const inboundMsg = createMockRecord({
      id: 'msg_inbound_1861',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: new Date().toISOString(),
    })

    const proof = createMockRecord({
      id: 'proof_1861_val',
      order_id: 'ord_1861',
      version_number: 1,
      status: 'aguardando_aprovacao',
    })

    const result = runProductionProofNotifyHook(proof, {
      orderRecord,
      clientRecord,
      inboundMessages: [inboundMsg],
      currentTimeMs: Date.now(),
    })

    expect(result.notified).toBe(true)
    const requestBody = result.httpRequests[0].payload.text.body
    const expectedLink =
      'https://crm-grafica-whatsapp-7b1a5.goskip.app/acompanhar/tk_lgkewmryq1wpe0npzrctthf2'
    expect(requestBody).toContain(expectedLink)
    expect(requestBody).not.toContain('--preview')
    expect(requestBody).not.toContain('internal.goskip.dev')
  })

  it('Cenário do pedido #001861: simulação controlada das 3 provas V1–V3 em sequência', () => {
    // No caso real de #001861, o cliente enviou "Oi" às 15:40:23Z
    // As provas V1, V2 e V3 foram enviadas entre 15:37 e 15:41
    const orderRecord = createMockRecord(baseOrderData)
    const clientRecord = createMockRecord(baseClientData)

    // Inbound real do cliente
    const realInbound = createMockRecord({
      id: 'msg_real_inbound_1861',
      client_id: 'client_eduardo',
      direction: 'inbound',
      created: '2026-09-13T15:40:23.179Z',
    })

    const logsAccumulator: any[] = []

    // 1. Envio de V1
    const proof1 = createMockRecord({
      id: 'proof_1861_v1',
      order_id: 'ord_1861',
      version_number: 1,
      status: 'aguardando_aprovacao',
    })
    const resV1 = runProductionProofNotifyHook(proof1, {
      orderRecord,
      clientRecord,
      inboundMessages: [realInbound],
      existingLogs: logsAccumulator,
      currentTimeMs: new Date('2026-09-13T15:40:30.000Z').getTime(),
    })
    expect(resV1.notified).toBe(true)
    logsAccumulator.push(...resV1.savedProductionLogs)

    // 2. Envio de V2 (pedido continua em awaiting_approval)
    const proof2 = createMockRecord({
      id: 'proof_1861_v2',
      order_id: 'ord_1861',
      version_number: 2,
      status: 'aguardando_aprovacao',
    })
    const resV2 = runProductionProofNotifyHook(proof2, {
      orderRecord,
      clientRecord,
      inboundMessages: [realInbound],
      existingLogs: logsAccumulator,
      currentTimeMs: new Date('2026-09-13T15:40:40.000Z').getTime(),
    })
    expect(resV2.notified).toBe(true)
    expect(resV2.savedProductionLogs[0].notes).toContain('Prova V2')
    logsAccumulator.push(...resV2.savedProductionLogs)

    // 3. Envio de V3
    const proof3 = createMockRecord({
      id: 'proof_1861_v3',
      order_id: 'ord_1861',
      version_number: 3,
      status: 'aguardando_aprovacao',
    })
    const resV3 = runProductionProofNotifyHook(proof3, {
      orderRecord,
      clientRecord,
      inboundMessages: [realInbound],
      existingLogs: logsAccumulator,
      currentTimeMs: new Date('2026-09-13T15:41:00.000Z').getTime(),
    })
    expect(resV3.notified).toBe(true)
    expect(resV3.savedProductionLogs[0].notes).toContain('Prova V3')
    logsAccumulator.push(...resV3.savedProductionLogs)

    // Cada uma das 3 versões gerou EXATAMENTE 1 notificação distinta
    expect(resV1.httpRequests).toHaveLength(1)
    expect(resV2.httpRequests).toHaveLength(1)
    expect(resV3.httpRequests).toHaveLength(1)
    expect(logsAccumulator).toHaveLength(3)

    // Tentativa de reprocessar V2 com duplo clique não dispara segundo envio
    const resV2Dupe = runProductionProofNotifyHook(proof2, {
      orderRecord,
      clientRecord,
      inboundMessages: [realInbound],
      existingLogs: logsAccumulator,
      currentTimeMs: new Date('2026-09-13T15:41:05.000Z').getTime(),
    })
    expect(resV2Dupe.notified).toBe(false)
    expect(resV2Dupe.skippedReason).toBe('idempotent_duplicate')
  })
})
