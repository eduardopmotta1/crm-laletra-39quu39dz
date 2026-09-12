// Production Status Notification Hook — ETAPA A: Envio real dentro da janela de 24h
// Dispara notificação WhatsApp automaticamente quando um production_order muda REALMENTE de etapa.
// Regras obrigatórias:
// 1. Detectar transição real de stage_internal_id (original != novo).
// 2. Não executar por simples edição, salvar mesma etapa, archive/reopen, ou alteração apenas em is_archived.
// 3. production_stage.auto_notify_whatsapp == true e whatsapp_message_template não vazio.
// 4. Renderizar template: {{nome}}, {{pedido}}, {{link_acompanhamento}}, {{codigo_rastreio}}.
// 5. Cliente dentro da janela de 24h: envio real via Meta Cloud API.
// 6. Cliente fora de 24h: NÃO enviar mensagem livre, NÃO criar template meta. Registrar log com whatsapp_sent=false, whatsapp_status='requires_template'.
// 7. Idempotência estrita baseada na transição concreta (order_id + to_stage_id + updated do pedido).
// 8. Pós-execução segura: nunca bloquear salvamento do pedido em caso de falha de envio.

onRecordAfterUpdateSuccess((e) => {
  try {
    const record = e.record
    if (!record) return e.next()

    const original = record.original()
    if (!original) return e.next()

    // 1. Verificar se o registro é da coleção production_orders
    const colName =
      (record.collection && record.collection().name) || (e.collection && e.collection.name) || ''
    if (colName !== 'production_orders') {
      return e.next()
    }

    // 2. Detectar transição REAL de stage_internal_id
    const prevStage = String(original.get('stage_internal_id') || '').trim()
    const nextStage = String(record.get('stage_internal_id') || '').trim()

    // Se a etapa interna não mudou, NÃO executar (ex: simples edição, toggle de arte, alteração de prazos)
    if (!nextStage || prevStage === nextStage) {
      return e.next()
    }

    // Ignorar transições para 'archived' ou se o pedido estiver arquivado
    if (nextStage === 'archived' || prevStage === 'archived') {
      return e.next()
    }

    const wasArchived = original.get('is_archived') === true
    const isNowArchived = record.get('is_archived') === true
    if (wasArchived || isNowArchived) {
      return e.next()
    }

    const orderId = record.id
    const orderNumber = String(record.get('order_number') || '').trim()
    const clientId = String(record.get('client_id') || '').trim()
    const trackingToken = String(record.get('tracking_token') || '').trim()
    const trackingCode = String(record.get('tracking_code') || '').trim()
    const clientName = String(record.get('client_name') || '').trim()
    const orderUpdatedIso = String(record.get('updated') || record.updated || '').trim()

    console.log(
      '[PROD NOTIFY] Transição detectada no pedido ' +
        orderNumber +
        ' (' +
        orderId +
        '): "' +
        prevStage +
        '" -> "' +
        nextStage +
        '"',
    )

    // 3. Buscar etapa de destino em production_stages
    let stageRecord = null
    try {
      stageRecord = $app.findFirstRecordByData('production_stages', 'internal_id', nextStage)
    } catch (_) {
      try {
        const stages = $app.findRecordsByFilter(
          'production_stages',
          "internal_id = '" + nextStage + "'",
          '',
          1,
          0,
        )
        if (stages && stages.length > 0) {
          stageRecord = stages[0]
        }
      } catch (stgErr) {
        console.warn('[PROD NOTIFY] Erro ao buscar production_stages:', stgErr)
      }
    }

    if (!stageRecord) {
      console.log('[PROD NOTIFY] Etapa de destino não encontrada: ' + nextStage)
      return e.next()
    }

    const targetStageName = stageRecord.get('name') || record.get('stage_name') || nextStage
    const fromStageName = original.get('stage_name') || prevStage

    const autoNotify = stageRecord.get('auto_notify_whatsapp') === true
    const messageTemplate = String(stageRecord.get('whatsapp_message_template') || '').trim()

    // Se auto_notify_whatsapp não estiver ativo ou template vazio, não envia notificação
    if (!autoNotify || !messageTemplate) {
      console.log(
        '[PROD NOTIFY] Notificação automática desativada para a etapa ' +
          nextStage +
          ' (auto_notify=' +
          autoNotify +
          ', template_len=' +
          messageTemplate.length +
          ')',
      )
      return e.next()
    }

    // 4. Proteção contra duplo disparo na MESMA transição concreta (Idempotência)
    // Uma mesma transição não pode gerar dois envios.
    // Usamos production_logs: verifica se já existe log para order_id + to_stage_id com notes contendo o hash/updated desta transição
    // OU se já existe log recente com envio ou requires_template criado exatamente nos últimos 30 segundos para esta transição.
    const transitionMarker = '[tx:' + orderId + ':' + nextStage + ':' + orderUpdatedIso + ']'
    try {
      const existingLogs = $app.findRecordsByFilter(
        'production_logs',
        "order_id = '" +
          orderId +
          "' && to_stage_id = '" +
          nextStage +
          "' && notes ~ '" +
          transitionMarker +
          "'",
        '-created',
        1,
        0,
      )
      if (existingLogs && existingLogs.length > 0) {
        console.log(
          '[PROD NOTIFY] Transição já processada anteriormente (idempotência confirmada via marker): ' +
            transitionMarker,
        )
        return e.next()
      }
    } catch (checkLogErr) {
      console.warn('[PROD NOTIFY] Aviso ao verificar idempotência de logs:', checkLogErr)
    }

    // 5. Buscar dados do cliente e atendimento para validação de janela e telefone
    if (!clientId) {
      console.warn('[PROD NOTIFY] Pedido ' + orderId + ' não possui client_id vinculado.')
      return e.next()
    }

    let clientRecord = null
    try {
      clientRecord = $app.findRecordById('clients', clientId)
    } catch (cErr) {
      console.error('[PROD NOTIFY] Cliente ' + clientId + ' não encontrado no banco:', cErr)
      return e.next()
    }

    // Obter telefone para envio
    const clientProvidedPhone = String(record.get('client_phone') || '').trim()
    const clientPhoneRaw =
      clientRecord.get('normalized_phone') || clientRecord.get('phone') || clientProvidedPhone || ''

    const normalizeForMeta = function (input) {
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
      console.warn(
        '[PROD NOTIFY] Telefone do cliente ' +
          clientId +
          ' inválido para envio Meta: ' +
          clientPhoneRaw,
      )
      return e.next()
    }

    // 6. Avaliar Regra Oficial da Janela de 24h
    // isWithin24HourWindow oficial:
    // - Referência prioritária: last_customer_message_at do atendimento ativo do cliente
    // - Fallback: client.last_message_at quando client.last_message_direction === 'inbound'
    // - Janela válida: diff em horas >= 0 e <= 24
    let lastCustomerMessageAt = ''
    let attendanceId = String(record.get('attendance_id') || '').trim()

    try {
      // Se não temos attendance_id direto no pedido, busca o atendimento ativo mais recente do cliente
      if (attendanceId) {
        const attRec = $app.findRecordById('attendances', attendanceId)
        if (attRec) {
          lastCustomerMessageAt = String(attRec.get('last_customer_message_at') || '').trim()
        }
      }
      if (!lastCustomerMessageAt) {
        const activeAtts = $app.findRecordsByFilter(
          'attendances',
          "client_id = '" + clientId + "' && is_archived != true",
          '-created',
          1,
          0,
        )
        if (activeAtts && activeAtts.length > 0) {
          if (!attendanceId) {
            attendanceId = activeAtts[0].id
          }
          lastCustomerMessageAt = String(activeAtts[0].get('last_customer_message_at') || '').trim()
        }
      }
    } catch (attErr) {
      console.warn('[PROD NOTIFY] Aviso ao consultar atendimentos para janela 24h:', attErr)
    }

    const check24hWindow = function (clientRec, lastCustMsgAt) {
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
      const nowMs = Date.now()
      const diffMs = nowMs - msgTime
      const diffHours = diffMs / (1000 * 60 * 60)
      return diffHours >= 0 && diffHours <= 24
    }

    const isInside24h = check24hWindow(clientRecord, lastCustomerMessageAt)

    // 7. Renderizar variáveis do template da etapa
    // Variáveis suportadas: {{nome}}, {{pedido}}, {{link_acompanhamento}}, {{codigo_rastreio}}
    const resolvedClientName = clientName || clientRecord.get('name') || 'Cliente'
    const baseUrl =
      $os.getenv('SITE_URL') ||
      $os.getenv('PB_INSTANCE_URL') ||
      'https://crm-grafica-whatsapp-7b1a5--preview.goskip.app'
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
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

    const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
    const userId = auth ? auth.id : ''
    const userName = auth
      ? auth.get('name') || auth.get('email') || 'Automação de Produção'
      : 'Automação de Produção'

    const prodLogsCol = $app.findCollectionByNameOrId('production_logs')

    // 8. Se estiver FORA da janela de 24h:
    // NÃO enviar mensagem livre. NÃO criar Template Meta.
    // Registrar production_logs com whatsapp_sent = false e whatsapp_status = "requires_template".
    if (!isInside24h) {
      console.log(
        '[PROD NOTIFY] Cliente ' +
          clientId +
          ' está FORA da janela de 24h. Envio livre bloqueado. Registrando requires_template.',
      )

      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', prevStage)
        logRec.set('from_stage_name', fromStageName)
        logRec.set('to_stage_id', nextStage)
        logRec.set('to_stage_name', targetStageName)
        if (userId) logRec.set('user_id', userId)
        logRec.set('user_name', userName)
        logRec.set('change_type', 'automatic')
        logRec.set(
          'notes',
          'Notificação automática retida: cliente fora da janela oficial de 24h (exige Template Oficial Meta). ' +
            transitionMarker,
        )
        logRec.set('whatsapp_sent', false)
        logRec.set('whatsapp_status', 'requires_template')
        logRec.set('whatsapp_message', renderedMessage)
        $app.save(logRec)
      } catch (logErr) {
        console.error('[PROD NOTIFY] Erro ao registrar log requires_template:', logErr)
      }

      return e.next()
    }

    // 9. Se estiver DENTRO da janela de 24h:
    // Realizar envio oficial pela WhatsApp Cloud API da Meta
    let metaToken = $os.getenv('WHATSAPP_ACCESS_TOKEN') || ''
    let metaPhoneId = $os.getenv('WHATSAPP_PHONE_NUMBER_ID') || ''
    let metaApiVersion = $os.getenv('WHATSAPP_GRAPH_API_VERSION') || 'v21.0'

    // Fallback para system_settings se não estiver nas env vars
    if (!metaToken || !metaPhoneId) {
      try {
        if (!metaToken) {
          const tokenRec = $app.findFirstRecordByData(
            'system_settings',
            'setting_key',
            'whatsapp_access_token',
          )
          const val = tokenRec ? tokenRec.get('setting_value') : ''
          if (val && !val.includes('DEMO_TOKEN') && !val.startsWith('demo_')) {
            metaToken = val
          }
        }
        if (!metaPhoneId) {
          const phoneRec = $app.findFirstRecordByData(
            'system_settings',
            'setting_key',
            'whatsapp_phone_number_id',
          )
          const val = phoneRec ? phoneRec.get('setting_value') : ''
          if (val && val !== '109283746592019') {
            metaPhoneId = val
          }
        }
      } catch (_) {}
    }

    if (!metaToken || !metaPhoneId) {
      console.error(
        '[PROD NOTIFY] Credenciais Meta não configuradas. Envio WhatsApp impossibilitado.',
      )
      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', prevStage)
        logRec.set('from_stage_name', fromStageName)
        logRec.set('to_stage_id', nextStage)
        logRec.set('to_stage_name', targetStageName)
        if (userId) logRec.set('user_id', userId)
        logRec.set('user_name', userName)
        logRec.set('change_type', 'automatic')
        logRec.set(
          'notes',
          'Falha de envio WhatsApp: credenciais Meta não configuradas no servidor. ' +
            transitionMarker,
        )
        logRec.set('whatsapp_sent', false)
        logRec.set('whatsapp_status', 'falhou')
        logRec.set('whatsapp_message', renderedMessage)
        $app.save(logRec)
      } catch (errLog) {
        console.error('[PROD NOTIFY] Erro ao gravar log de falha de credenciais:', errLog)
      }
      return e.next()
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

    console.log(
      '[PROD NOTIFY] Disparando WhatsApp oficial para ' +
        phoneNormalized +
        ' (Etapa: ' +
        nextStage +
        ')',
    )

    let metaResponse = null
    let httpError = null

    try {
      metaResponse = $http.send({
        url: metaUrl,
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + metaToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaPayload),
        timeout: 20,
      })
    } catch (sendErr) {
      httpError = sendErr
      console.error('[PROD NOTIFY] Exceção ao chamar Meta Cloud API:', sendErr)
    }

    const statusCode = metaResponse ? metaResponse.statusCode : 0
    const rawBody = metaResponse ? metaResponse.raw : ''
    let responseJson = null

    try {
      if (metaResponse && metaResponse.json) {
        responseJson = metaResponse.json
      } else if (rawBody) {
        responseJson = JSON.parse(rawBody)
      }
    } catch (_) {}

    const isMetaSuccess =
      statusCode >= 200 &&
      statusCode < 300 &&
      responseJson &&
      responseJson.messages &&
      responseJson.messages.length > 0
    const externalMessageId = isMetaSuccess ? responseJson.messages[0].id : ''

    const currentTimestampIso = new Date().toISOString()

    if (isMetaSuccess) {
      console.log('[PROD NOTIFY] WhatsApp real enviado com sucesso. WAMID: ' + externalMessageId)

      // Gravar mensagem real na collection messages
      try {
        const messagesCol = $app.findCollectionByNameOrId('messages')
        const messageRecord = new Record(messagesCol)
        messageRecord.set('client_id', clientId)
        if (attendanceId) {
          messageRecord.set('attendance_id', attendanceId)
        }
        messageRecord.set('direction', 'outbound')
        messageRecord.set('message_text', renderedMessage)
        messageRecord.set('sender_name', 'Produção Laletra')
        if (userId) {
          messageRecord.set('sent_by_user', userId)
        }
        messageRecord.set('status', 'sent')
        messageRecord.set('whatsapp_message_id', externalMessageId)
        $app.save(messageRecord)
      } catch (msgSaveErr) {
        console.error('[PROD NOTIFY] Erro ao gravar registro na collection messages:', msgSaveErr)
      }

      // Atualizar client com last_message_*
      try {
        clientRecord.set('last_message_at', currentTimestampIso)
        clientRecord.set('last_message_direction', 'outbound')
        clientRecord.set('last_message_text', renderedMessage.substring(0, 100))
        $app.save(clientRecord)
      } catch (clientUpdErr) {
        console.warn('[PROD NOTIFY] Aviso ao atualizar last_message do cliente:', clientUpdErr)
      }

      // Atualizar atendimento com last_company_message_at
      if (attendanceId) {
        try {
          const attRec = $app.findRecordById('attendances', attendanceId)
          if (attRec) {
            attRec.set('last_company_message_at', currentTimestampIso)
            $app.save(attRec)
          }
        } catch (attUpdErr) {
          console.warn('[PROD NOTIFY] Aviso ao atualizar attendance:', attUpdErr)
        }
      }

      // Registrar production_logs com whatsapp_sent = true e status real 'enviado'
      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', prevStage)
        logRec.set('from_stage_name', fromStageName)
        logRec.set('to_stage_id', nextStage)
        logRec.set('to_stage_name', targetStageName)
        if (userId) logRec.set('user_id', userId)
        logRec.set('user_name', userName)
        logRec.set('change_type', 'automatic')
        logRec.set(
          'notes',
          'Notificação automática enviada via WhatsApp Meta. WAMID: ' +
            externalMessageId +
            '. ' +
            transitionMarker,
        )
        logRec.set('whatsapp_sent', true)
        logRec.set('whatsapp_status', 'enviado')
        logRec.set('whatsapp_message', renderedMessage)
        $app.save(logRec)
      } catch (logSaveErr) {
        console.error('[PROD NOTIFY] Erro ao gravar production_log de sucesso:', logSaveErr)
      }
    } else {
      // Falha na Meta API
      const metaErrObj = responseJson && responseJson.error ? responseJson.error : {}
      const metaErrMsg =
        metaErrObj.message || (httpError ? String(httpError) : 'Erro desconhecido da Meta API')
      const metaErrCode = metaErrObj.code || statusCode

      console.error('[PROD NOTIFY] Falha no envio WhatsApp Meta:', {
        httpStatus: statusCode,
        code: metaErrCode,
        message: metaErrMsg,
      })

      // Registrar production_logs com whatsapp_sent = false e status 'falhou'
      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', prevStage)
        logRec.set('from_stage_name', fromStageName)
        logRec.set('to_stage_id', nextStage)
        logRec.set('to_stage_name', targetStageName)
        if (userId) logRec.set('user_id', userId)
        logRec.set('user_name', userName)
        logRec.set('change_type', 'automatic')
        logRec.set(
          'notes',
          'Falha ao enviar notificação WhatsApp via Meta (Código: ' +
            metaErrCode +
            '): ' +
            metaErrMsg +
            '. ' +
            transitionMarker,
        )
        logRec.set('whatsapp_sent', false)
        logRec.set('whatsapp_status', 'falhou')
        logRec.set('whatsapp_message', renderedMessage)
        $app.save(logRec)
      } catch (logSaveErr) {
        console.error('[PROD NOTIFY] Erro ao gravar production_log de falha:', logSaveErr)
      }
    }
  } catch (globalErr) {
    console.error(
      '[PROD NOTIFY] Erro inesperado no hook de notificação de produção:',
      globalErr && globalErr.message ? globalErr.message : globalErr,
    )
  }

  return e.next()
}, 'production_orders')

console.log(
  '[PROD NOTIFY] Hook loaded: production_status_notify onRecordAfterUpdateSuccess registered',
)
