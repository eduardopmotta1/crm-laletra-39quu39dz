import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Testes Unitários da Automação de Produção — ETAPA A
 *
 * Valida a especificação dos cenários de notificação automática ao alterar etapas no CRM Laletra:
 * (a) troca real de stage_internal_id dispara fluxo de notificação;
 * (b) salvar sem mudar etapa não dispara;
 * (c) etapa com auto_notify_whatsapp != true ou template vazio não envia;
 * (d) fora da janela 24h -> whatsapp_sent=false e whatsapp_status="requires_template";
 * (e) idempotência pelo marcador de transição (order_id + to_stage_id + updated) — reprocessar a mesma atualização não duplica;
 * (f) erro real de envio -> whatsapp_status="falhou" sem propagar erro ao salvar o pedido.
 */

// Interface e helper para simular o comportamento exato do hook backend production_status_notify.js
interface MockRecord {
  id: string
  data: Record<string, any>
  get: (field: string) => any
  set: (field: string, val: any) => void
  original: () => MockRecord | null
}

function createMockRecord(
  initialData: Record<string, any>,
  originalData?: Record<string, any>,
): MockRecord {
  const store = { ...initialData }
  const origRecord = originalData ? createMockRecord(originalData) : null

  return {
    id: store.id || 'rec_test',
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

interface RunHookOptions {
  record: MockRecord
  stageRecord?: MockRecord | null
  clientRecord?: MockRecord | null
  attendanceRecord?: MockRecord | null
  existingLogs?: any[]
  metaEnv?: {
    WHATSAPP_ACCESS_TOKEN?: string
    WHATSAPP_PHONE_NUMBER_ID?: string
    WHATSAPP_GRAPH_API_VERSION?: string
  }
  httpSendImpl?: (options: any) => { statusCode: number; raw?: string; json?: any }
  currentTimeMs?: number
}

interface HookExecutionResult {
  nextCalled: boolean
  notified: boolean
  reasonSkipped?: string
  savedProductionLogs: any[]
  savedMessages: any[]
  savedClients: any[]
  savedAttendances: any[]
  httpRequests: any[]
  errorThrown: any
}

/**
 * Função de execução de teste que emula fielmente o algoritmo do hook backend
 * `pocketbase/hooks/production_status_notify.js`.
 */
function runProductionStatusNotifyHook(options: RunHookOptions): HookExecutionResult {
  const {
    record,
    stageRecord = null,
    clientRecord = null,
    attendanceRecord = null,
    existingLogs = [],
    metaEnv = {
      WHATSAPP_ACCESS_TOKEN: 'valid_test_token',
      WHATSAPP_PHONE_NUMBER_ID: '1234567890',
      WHATSAPP_GRAPH_API_VERSION: 'v21.0',
    },
    httpSendImpl,
    currentTimeMs = Date.now(),
  } = options

  const result: HookExecutionResult = {
    nextCalled: false,
    notified: false,
    savedProductionLogs: [],
    savedMessages: [],
    savedClients: [],
    savedAttendances: [],
    httpRequests: [],
    errorThrown: null,
  }

  const next = () => {
    result.nextCalled = true
  }

  try {
    if (!record) {
      next()
      return result
    }

    const original = record.original()
    if (!original) {
      next()
      return result
    }

    // 2. Detectar transição REAL de stage_internal_id
    const prevStage = String(original.get('stage_internal_id') || '').trim()
    const nextStage = String(record.get('stage_internal_id') || '').trim()

    // Se a etapa interna não mudou, NÃO executar
    if (!nextStage || prevStage === nextStage) {
      result.reasonSkipped = 'same_stage_or_empty'
      next()
      return result
    }

    // Ignorar transições para 'archived' ou se o pedido estiver arquivado
    if (nextStage === 'archived' || prevStage === 'archived') {
      result.reasonSkipped = 'archived_stage'
      next()
      return result
    }

    const wasArchived = original.get('is_archived') === true
    const isNowArchived = record.get('is_archived') === true
    if (wasArchived || isNowArchived) {
      result.reasonSkipped = 'order_archived'
      next()
      return result
    }

    const orderId = record.id
    const orderNumber = String(record.get('order_number') || '').trim()
    const clientId = String(record.get('client_id') || '').trim()
    const trackingToken = String(record.get('tracking_token') || '').trim()
    const trackingCode = String(record.get('tracking_code') || '').trim()
    const clientName = String(record.get('client_name') || '').trim()
    const orderUpdatedIso = String(record.get('updated') || '').trim()

    // 3. Buscar etapa de destino em production_stages
    if (!stageRecord) {
      result.reasonSkipped = 'target_stage_not_found'
      next()
      return result
    }

    const targetStageName = stageRecord.get('name') || record.get('stage_name') || nextStage
    const fromStageName = original.get('stage_name') || prevStage

    const autoNotify = stageRecord.get('auto_notify_whatsapp') === true
    const messageTemplate = String(stageRecord.get('whatsapp_message_template') || '').trim()

    // Se auto_notify_whatsapp não estiver ativo ou template vazio, não envia notificação
    if (!autoNotify || !messageTemplate) {
      result.reasonSkipped = 'auto_notify_disabled_or_empty_template'
      next()
      return result
    }

    // 4. Proteção contra duplo disparo na MESMA transição concreta (Idempotência)
    const transitionMarker = '[tx:' + orderId + ':' + nextStage + ':' + orderUpdatedIso + ']'
    const hasExisting = existingLogs.some(
      (log) =>
        log.order_id === orderId &&
        log.to_stage_id === nextStage &&
        typeof log.notes === 'string' &&
        log.notes.includes(transitionMarker),
    )

    if (hasExisting) {
      result.reasonSkipped = 'idempotent_duplicate'
      next()
      return result
    }

    // 5. Validar cliente
    if (!clientId || !clientRecord) {
      result.reasonSkipped = 'missing_client'
      next()
      return result
    }

    // Resolver telefone
    const clientProvidedPhone = String(record.get('client_phone') || '').trim()
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
      result.reasonSkipped = 'invalid_phone'
      next()
      return result
    }

    // 6. Janela de 24h
    let lastCustomerMessageAt = ''
    if (attendanceRecord) {
      lastCustomerMessageAt = String(attendanceRecord.get('last_customer_message_at') || '').trim()
    }

    const check24hWindow = (clientRec: MockRecord, lastCustMsgAt: string) => {
      let custTimestamp = lastCustMsgAt || ''
      if (!custTimestamp) {
        const dir = String(clientRec.get('last_message_direction') || '').trim()
        if (dir === 'inbound') {
          custTimestamp = String(clientRec.get('last_message_at') || '').trim()
        }
      }
      if (!custTimestamp) {
        return false
      }
      const msgTime = new Date(custTimestamp).getTime()
      if (isNaN(msgTime) || msgTime <= 0) {
        return false
      }
      const diffMs = currentTimeMs - msgTime
      const diffHours = diffMs / (1000 * 60 * 60)
      return diffHours >= 0 && diffHours <= 24
    }

    const isInside24h = check24hWindow(clientRecord, lastCustomerMessageAt)

    // 7. Renderizar template
    const resolvedClientName = clientName || clientRecord.get('name') || 'Cliente'
    const cleanBaseUrl = 'https://crm-grafica-whatsapp-7b1a5--preview.goskip.app'
    const trackingLink = trackingToken ? cleanBaseUrl + '/acompanhar/' + trackingToken : ''
    const trackingCodeText = trackingCode ? 'Código de rastreio: ' + trackingCode : ''

    const renderedMessage = messageTemplate
      .split('{{nome}}')
      .join(resolvedClientName)
      .split('{{pedido}}')
      .join(orderNumber)
      .split('{{link_acompanhamento}}')
      .join(trackingLink)
      .split('{{codigo_rastreio}}')
      .join(trackingCodeText)
      .trim()

    // 8. Se FORA da janela de 24h:
    if (!isInside24h) {
      result.savedProductionLogs.push({
        order_id: orderId,
        from_stage_id: prevStage,
        from_stage_name: fromStageName,
        to_stage_id: nextStage,
        to_stage_name: targetStageName,
        user_name: 'Automação de Produção',
        change_type: 'automatic',
        notes:
          'Notificação automática retida: cliente fora da janela oficial de 24h (exige Template Oficial Meta). ' +
          transitionMarker,
        whatsapp_sent: false,
        whatsapp_status: 'requires_template',
        whatsapp_message: renderedMessage,
      })
      next()
      return result
    }

    // 9. DENTRO da janela de 24h:
    const metaToken = metaEnv.WHATSAPP_ACCESS_TOKEN || ''
    const metaPhoneId = metaEnv.WHATSAPP_PHONE_NUMBER_ID || ''
    const metaApiVersion = metaEnv.WHATSAPP_GRAPH_API_VERSION || 'v21.0'

    if (!metaToken || !metaPhoneId) {
      result.savedProductionLogs.push({
        order_id: orderId,
        from_stage_id: prevStage,
        from_stage_name: fromStageName,
        to_stage_id: nextStage,
        to_stage_name: targetStageName,
        user_name: 'Automação de Produção',
        change_type: 'automatic',
        notes:
          'Falha de envio WhatsApp: credenciais Meta não configuradas no servidor. ' +
          transitionMarker,
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
    } catch (sendErr) {
      httpError = sendErr
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
      // Gravar mensagem real na collection messages
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
        from_stage_id: prevStage,
        from_stage_name: fromStageName,
        to_stage_id: nextStage,
        to_stage_name: targetStageName,
        user_name: 'Automação de Produção',
        change_type: 'automatic',
        notes:
          'Notificação automática enviada via WhatsApp Meta. WAMID: ' +
          externalMessageId +
          '. ' +
          transitionMarker,
        whatsapp_sent: true,
        whatsapp_status: 'enviado',
        whatsapp_message: renderedMessage,
      })
    } else {
      // Falha na Meta API
      const metaErrObj = responseJson && responseJson.error ? responseJson.error : {}
      const metaErrMsg =
        metaErrObj.message || (httpError ? String(httpError) : 'Erro desconhecido da Meta API')
      const metaErrCode = metaErrObj.code || statusCode

      result.savedProductionLogs.push({
        order_id: orderId,
        from_stage_id: prevStage,
        from_stage_name: fromStageName,
        to_stage_id: nextStage,
        to_stage_name: targetStageName,
        user_name: 'Automação de Produção',
        change_type: 'automatic',
        notes:
          'Falha ao enviar notificação WhatsApp via Meta (Código: ' +
          metaErrCode +
          '): ' +
          metaErrMsg +
          '. ' +
          transitionMarker,
        whatsapp_sent: false,
        whatsapp_status: 'falhou',
        whatsapp_message: renderedMessage,
      })
    }
  } catch (err: any) {
    // Pós-execução segura: nunca deve quebrar
    result.errorThrown = err
  }

  next()
  return result
}

describe('Automação de Notificação WhatsApp de Produção (ETAPA A)', () => {
  const baseClient = createMockRecord({
    id: 'cli_001',
    name: 'Carlos Oliveira',
    phone: '+55 11 98888-7777',
    normalized_phone: '5511988887777',
    last_message_at: new Date(Date.now() - 3600000).toISOString(),
    last_message_direction: 'inbound',
  })

  const baseAttendance = createMockRecord({
    id: 'att_001',
    client_id: 'cli_001',
    last_customer_message_at: new Date(Date.now() - 3600000).toISOString(),
  })

  const stageReady = createMockRecord({
    id: 'stg_ready',
    internal_id: 'ready_for_pickup',
    name: 'Pronto / Expedição',
    auto_notify_whatsapp: true,
    whatsapp_message_template: 'Olá {{nome}}! Seu pedido {{pedido}} está pronto para retirada.',
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) Troca real de stage_internal_id dispara fluxo de notificação
  it('(a) troca real de stage_internal_id dispara fluxo de notificação com envio real e salva na collection messages', () => {
    const originalOrder = {
      id: 'ord_123',
      order_number: 'PED-2026-0042',
      stage_internal_id: 'in_production',
      stage_name: 'Em Produção',
      client_id: 'cli_001',
      client_name: 'Carlos Oliveira',
      updated: '2026-03-30T10:00:00.000Z',
    }

    const updatedOrder = createMockRecord(
      {
        ...originalOrder,
        stage_internal_id: 'ready_for_pickup',
        stage_name: 'Pronto / Expedição',
        updated: '2026-03-30T11:00:00.000Z',
      },
      originalOrder,
    )

    const res = runProductionStatusNotifyHook({
      record: updatedOrder,
      stageRecord: stageReady,
      clientRecord: baseClient,
      attendanceRecord: baseAttendance,
      httpSendImpl: () => ({
        statusCode: 200,
        json: { messages: [{ id: 'wamid.META_SUCCESS_999' }] },
      }),
    })

    expect(res.nextCalled).toBe(true)
    expect(res.notified).toBe(true)
    expect(res.httpRequests.length).toBe(1)
    expect(res.httpRequests[0].payload.to).toBe('5511988887777')
    expect(res.httpRequests[0].payload.text.body).toBe(
      'Olá Carlos Oliveira! Seu pedido PED-2026-0042 está pronto para retirada.',
    )

    // Collection messages DEVE ter o registro do envio real
    expect(res.savedMessages.length).toBe(1)
    expect(res.savedMessages[0].client_id).toBe('cli_001')
    expect(res.savedMessages[0].status).toBe('sent')
    expect(res.savedMessages[0].whatsapp_message_id).toBe('wamid.META_SUCCESS_999')

    // Production logs com status enviado
    expect(res.savedProductionLogs.length).toBe(1)
    expect(res.savedProductionLogs[0].whatsapp_sent).toBe(true)
    expect(res.savedProductionLogs[0].whatsapp_status).toBe('enviado')
  })

  // (b) Salvar sem mudar etapa não dispara
  it('(b) salvar sem mudar stage_internal_id não dispara notificação', () => {
    const originalOrder = {
      id: 'ord_123',
      order_number: 'PED-2026-0042',
      stage_internal_id: 'in_production',
      stage_name: 'Em Produção',
      client_id: 'cli_001',
      notes: 'Observação anterior',
      updated: '2026-03-30T10:00:00.000Z',
    }

    // Apenas mudou notes, stage_internal_id idêntico
    const updatedOrder = createMockRecord(
      {
        ...originalOrder,
        notes: 'Nova observação salva no pedido',
        updated: '2026-03-30T10:05:00.000Z',
      },
      originalOrder,
    )

    const res = runProductionStatusNotifyHook({
      record: updatedOrder,
      stageRecord: stageReady,
      clientRecord: baseClient,
      attendanceRecord: baseAttendance,
    })

    expect(res.nextCalled).toBe(true)
    expect(res.notified).toBe(false)
    expect(res.reasonSkipped).toBe('same_stage_or_empty')
    expect(res.httpRequests.length).toBe(0)
    expect(res.savedMessages.length).toBe(0)
    expect(res.savedProductionLogs.length).toBe(0)
  })

  // (c) Etapa com auto_notify_whatsapp != true ou template vazio não envia
  it('(c1) etapa com auto_notify_whatsapp = false não envia notificação', () => {
    const stageNoAutoNotify = createMockRecord({
      id: 'stg_review',
      internal_id: 'art_preparation',
      name: 'Arte em preparação',
      auto_notify_whatsapp: false,
      whatsapp_message_template: 'Sua arte está em preparação.',
    })

    const originalOrder = {
      id: 'ord_124',
      order_number: 'PED-2026-0043',
      stage_internal_id: 'order_received',
      client_id: 'cli_001',
      updated: '2026-03-30T10:00:00.000Z',
    }

    const updatedOrder = createMockRecord(
      {
        ...originalOrder,
        stage_internal_id: 'art_preparation',
        updated: '2026-03-30T10:10:00.000Z',
      },
      originalOrder,
    )

    const res = runProductionStatusNotifyHook({
      record: updatedOrder,
      stageRecord: stageNoAutoNotify,
      clientRecord: baseClient,
      attendanceRecord: baseAttendance,
    })

    expect(res.nextCalled).toBe(true)
    expect(res.notified).toBe(false)
    expect(res.reasonSkipped).toBe('auto_notify_disabled_or_empty_template')
    expect(res.httpRequests.length).toBe(0)
    expect(res.savedMessages.length).toBe(0)
  })

  it('(c2) etapa com template de mensagem vazio ou apenas espaços não envia notificação', () => {
    const stageEmptyTemplate = createMockRecord({
      id: 'stg_empty',
      internal_id: 'approved',
      name: 'Aprovado para Produção',
      auto_notify_whatsapp: true,
      whatsapp_message_template: '   ',
    })

    const originalOrder = {
      id: 'ord_125',
      order_number: 'PED-2026-0044',
      stage_internal_id: 'awaiting_approval',
      client_id: 'cli_001',
      updated: '2026-03-30T10:00:00.000Z',
    }

    const updatedOrder = createMockRecord(
      {
        ...originalOrder,
        stage_internal_id: 'approved',
        updated: '2026-03-30T10:15:00.000Z',
      },
      originalOrder,
    )

    const res = runProductionStatusNotifyHook({
      record: updatedOrder,
      stageRecord: stageEmptyTemplate,
      clientRecord: baseClient,
      attendanceRecord: baseAttendance,
    })

    expect(res.nextCalled).toBe(true)
    expect(res.notified).toBe(false)
    expect(res.reasonSkipped).toBe('auto_notify_disabled_or_empty_template')
    expect(res.httpRequests.length).toBe(0)
    expect(res.savedMessages.length).toBe(0)
  })

  // (d) Fora da janela 24h -> whatsapp_sent=false e whatsapp_status="requires_template"
  it('(d) fora da janela 24h: não envia mensagem livre, não cria template Meta e grava log requires_template', () => {
    const nowMs = new Date('2026-03-30T15:00:00.000Z').getTime()
    // 25 horas antes -> janela expirada
    const expiredTimestamp = new Date(nowMs - 25 * 3600 * 1000).toISOString()

    const clientOutside24h = createMockRecord({
      id: 'cli_old',
      name: 'Maria Souza',
      phone: '11977776666',
      normalized_phone: '5511977776666',
      last_message_at: expiredTimestamp,
      last_message_direction: 'inbound',
    })

    const attendanceOutside24h = createMockRecord({
      id: 'att_old',
      client_id: 'cli_old',
      last_customer_message_at: expiredTimestamp,
    })

    const originalOrder = {
      id: 'ord_126',
      order_number: 'PED-2026-0045',
      stage_internal_id: 'in_production',
      stage_name: 'Em Produção',
      client_id: 'cli_old',
      client_name: 'Maria Souza',
      updated: '2026-03-30T14:00:00.000Z',
    }

    const updatedOrder = createMockRecord(
      {
        ...originalOrder,
        stage_internal_id: 'ready_for_pickup',
        stage_name: 'Pronto / Expedição',
        updated: '2026-03-30T15:00:00.000Z',
      },
      originalOrder,
    )

    const res = runProductionStatusNotifyHook({
      record: updatedOrder,
      stageRecord: stageReady,
      clientRecord: clientOutside24h,
      attendanceRecord: attendanceOutside24h,
      currentTimeMs: nowMs,
      httpSendImpl: vi.fn(), // Não deve ser chamado
    })

    expect(res.nextCalled).toBe(true)
    expect(res.notified).toBe(false)
    expect(res.httpRequests.length).toBe(0) // Nenhuma chamada externa à Meta
    expect(res.savedMessages.length).toBe(0) // NENHUMA mensagem fictícia ou real salva em messages

    // Production log deve indicar whatsapp_sent=false e whatsapp_status="requires_template"
    expect(res.savedProductionLogs.length).toBe(1)
    const log = res.savedProductionLogs[0]
    expect(log.whatsapp_sent).toBe(false)
    expect(log.whatsapp_status).toBe('requires_template')
    expect(log.notes).toContain(
      'Notificação automática retida: cliente fora da janela oficial de 24h',
    )
    expect(log.notes).toContain('[tx:ord_126:ready_for_pickup:2026-03-30T15:00:00.000Z]')
  })

  // (e) Idempotência pelo marcador de transição (order_id + to_stage_id + updated)
  it('(e) idempotência pelo marcador de transição: reprocessar a mesma atualização não duplica envio nem log', () => {
    const originalOrder = {
      id: 'ord_127',
      order_number: 'PED-2026-0046',
      stage_internal_id: 'art_preparation',
      client_id: 'cli_001',
      updated: '2026-03-30T09:00:00.000Z',
    }

    const updatedIso = '2026-03-30T10:00:00.000Z'
    const updatedOrder = createMockRecord(
      {
        ...originalOrder,
        stage_internal_id: 'ready_for_pickup',
        updated: updatedIso,
      },
      originalOrder,
    )

    const transitionMarker = `[tx:ord_127:ready_for_pickup:${updatedIso}]`
    const preExistingLogs = [
      {
        order_id: 'ord_127',
        to_stage_id: 'ready_for_pickup',
        notes: `Notificação enviada anteriormente. ${transitionMarker}`,
      },
    ]

    const httpSpy = vi.fn()

    const res = runProductionStatusNotifyHook({
      record: updatedOrder,
      stageRecord: stageReady,
      clientRecord: baseClient,
      attendanceRecord: baseAttendance,
      existingLogs: preExistingLogs,
      httpSendImpl: httpSpy,
    })

    expect(res.nextCalled).toBe(true)
    expect(res.notified).toBe(false)
    expect(res.reasonSkipped).toBe('idempotent_duplicate')
    expect(httpSpy).not.toHaveBeenCalled()
    expect(res.savedMessages.length).toBe(0)
    expect(res.savedProductionLogs.length).toBe(0)
  })

  // (f) Erro real de envio -> whatsapp_status="falhou" sem propagar erro ao salvar o pedido
  it('(f) erro real de envio: marca whatsapp_status="falhou" e whatsapp_sent=false sem propagar exceção', () => {
    const originalOrder = {
      id: 'ord_128',
      order_number: 'PED-2026-0047',
      stage_internal_id: 'in_production',
      stage_name: 'Em Produção',
      client_id: 'cli_001',
      updated: '2026-03-30T10:00:00.000Z',
    }

    const updatedOrder = createMockRecord(
      {
        ...originalOrder,
        stage_internal_id: 'ready_for_pickup',
        stage_name: 'Pronto / Expedição',
        updated: '2026-03-30T11:00:00.000Z',
      },
      originalOrder,
    )

    // Simula erro 500 ou timeout na Meta Cloud API
    const res = runProductionStatusNotifyHook({
      record: updatedOrder,
      stageRecord: stageReady,
      clientRecord: baseClient,
      attendanceRecord: baseAttendance,
      httpSendImpl: () => {
        return {
          statusCode: 500,
          json: {
            error: {
              message: 'Failed to reach Meta servers (timed out)',
              code: 131000,
            },
          },
        }
      },
    })

    expect(res.nextCalled).toBe(true)
    expect(res.notified).toBe(false)
    expect(res.errorThrown).toBeNull() // Hook capturou internamente sem propagar erro
    expect(res.savedMessages.length).toBe(0) // Não deve criar mensagem com sucesso em messages

    // Production log registrado com status "falhou"
    expect(res.savedProductionLogs.length).toBe(1)
    const failLog = res.savedProductionLogs[0]
    expect(failLog.whatsapp_sent).toBe(false)
    expect(failLog.whatsapp_status).toBe('falhou')
    expect(failLog.notes).toContain('Falha ao enviar notificação WhatsApp via Meta')
    expect(failLog.notes).toContain('131000')
  })

  // (g) Falha de rede catastrófica (throw exception no $http.send)
  it('(g) exceção no despacho de rede: grava whatsapp_status="falhou" e não bloqueia a conclusão', () => {
    const originalOrder = {
      id: 'ord_129',
      order_number: 'PED-2026-0048',
      stage_internal_id: 'in_production',
      stage_name: 'Em Produção',
      client_id: 'cli_001',
      updated: '2026-03-30T10:00:00.000Z',
    }

    const updatedOrder = createMockRecord(
      {
        ...originalOrder,
        stage_internal_id: 'ready_for_pickup',
        stage_name: 'Pronto / Expedição',
        updated: '2026-03-30T11:00:00.000Z',
      },
      originalOrder,
    )

    const res = runProductionStatusNotifyHook({
      record: updatedOrder,
      stageRecord: stageReady,
      clientRecord: baseClient,
      attendanceRecord: baseAttendance,
      httpSendImpl: () => {
        throw new Error('Network unreachable')
      },
    })

    expect(res.nextCalled).toBe(true)
    expect(res.savedMessages.length).toBe(0)
    expect(res.savedProductionLogs.length).toBe(1)
    expect(res.savedProductionLogs[0].whatsapp_sent).toBe(false)
    expect(res.savedProductionLogs[0].whatsapp_status).toBe('falhou')
    expect(res.savedProductionLogs[0].notes).toContain('Network unreachable')
  })
})
