// Production Proof Notification Hook — Notificação WhatsApp para NOVA VERSÃO de prova de arte
// Dispara notificação automaticamente quando uma nova production_proof é criada com status 'aguardando_aprovacao'.
//
// Regras obrigatórias:
// 1. Acionado em onRecordAfterCreateSuccess('production_proofs')
// 2. Garante que status === 'aguardando_aprovacao'
// 3. Obtém o pedido de produção (production_orders) associado
// 4. Se o pedido exigir aprovação de arte (requires_art_approval !== false)
// 5. Idempotência estrita por proof_id:
//    - Verifica em production_logs se já existe registro com proof_id (marker: [proof:<proofId>])
//    - Duplo clique / reprocessamento NÃO gera segunda notificação nem segundo log
// 6. Anti-duplicidade com a transição de etapa para awaiting_approval:
//    - Registra no production_log a marca da prova [proof:<proofId>] e também [proof_transition_handled:<orderId>:awaiting_approval]
//    - O hook production_status_notify verifica se acabou de haver uma prova processada para a mesma transição de awaiting_approval
//      e suprime envio duplicado, garantindo EXATAMENTE UMA notificação.
// 7. Janela de 24h oficial:
//    - Prioridade 1: Última mensagem inbound REAL do cliente em messages (helper lastInboundAt / messages query)
//    - Prioridade 2: last_customer_message_at do atendimento ativo em attendances
//    - Fallback: client.last_message_at quando client.last_message_direction === 'inbound'
//    - diffHours >= 0 e diffHours <= 24
// 8. Se DENTRO de 24h:
//    - Envio livre real via WhatsApp Meta Cloud API com versão e link de acompanhamento (/acompanhar/{tracking_token})
//    - SOMENTE se a Meta aceitar o envio (status 200..299 + messages[0].id), cria registro em messages (direction: 'outbound', status: 'sent', whatsapp_message_id)
//    - Atualiza client (last_message_at, last_message_direction: 'outbound') e attendance (last_company_message_at)
//    - Grava production_log com: proof_id, version_number, whatsapp_sent=true, whatsapp_status='enviado', WAMID, horário
// 9. Se FORA de 24h:
//    - NÃO envia mensagem livre.
//    - Verifica se template oficial está APPROVED (hoje aguardando_aprovacao_arte está PENDING)
//    - Grava production_log com whatsapp_sent=false, whatsapp_status='requires_template'
//    - NÃO cria registro falso em messages
// 10. Se erro na Meta:
//    - Grava production_log com whatsapp_sent=false, whatsapp_status='falhou'
//    - NÃO quebra a criação da prova

onRecordAfterCreateSuccess((e) => {
  try {
    const record = e.record
    if (!record) return e.next()

    const colName =
      (record.collection && record.collection().name) || (e.collection && e.collection.name) || ''
    if (colName !== 'production_proofs') {
      return e.next()
    }

    const proofId = record.id
    const orderId = String(record.get('order_id') || '').trim()
    const versionNumber = Number(record.get('version_number') || 1)
    const status = String(record.get('status') || '').trim()
    const sentByUserId = String(record.get('sent_by') || '').trim()

    // Somente notifica se a prova foi enviada para aprovação do cliente
    if (status !== 'aguardando_aprovacao') {
      console.log(
        '[PROOF NOTIFY] Prova ' +
          proofId +
          ' criada com status "' +
          status +
          '" (não é aguardando_aprovacao). Notificação ignorada.',
      )
      return e.next()
    }

    if (!orderId) {
      console.warn('[PROOF NOTIFY] Prova ' + proofId + ' sem order_id vinculado.')
      return e.next()
    }

    // 1. Buscar o pedido de produção
    let orderRecord = null
    try {
      orderRecord = $app.findRecordById('production_orders', orderId)
    } catch (orderErr) {
      console.error('[PROOF NOTIFY] Pedido ' + orderId + ' não encontrado no banco:', orderErr)
      return e.next()
    }

    if (!orderRecord) {
      console.warn('[PROOF NOTIFY] Pedido ' + orderId + ' não encontrado.')
      return e.next()
    }

    // Se o pedido não exige aprovação de arte, não notificar
    const requiresArt = orderRecord.get('requires_art_approval') !== false
    if (!requiresArt) {
      console.log(
        '[PROOF NOTIFY] Pedido ' +
          orderId +
          ' não exige aprovação de arte (requires_art_approval=false).',
      )
      return e.next()
    }

    const orderNumber = String(orderRecord.get('order_number') || '').trim()
    const clientId = String(orderRecord.get('client_id') || '').trim()
    const trackingToken = String(orderRecord.get('tracking_token') || '').trim()
    const stageInternalId = String(orderRecord.get('stage_internal_id') || '').trim()
    const stageName = String(orderRecord.get('stage_name') || 'Aguardando aprovação').trim()
    const clientProvidedName = String(orderRecord.get('client_name') || '').trim()
    const clientProvidedPhone = String(orderRecord.get('client_phone') || '').trim()

    // 2. Proteção de IDEMPOTÊNCIA estrita por proof_id
    // Garante que a mesma production_proof nunca dispare duas notificações nem crie logs duplicados
    const proofMarker = '[proof:' + proofId + ']'
    const prodLogsCol = $app.findCollectionByNameOrId('production_logs')

    try {
      const existingLogs = $app.findRecordsByFilter(
        'production_logs',
        "order_id = '" + orderId + "' && notes ~ '" + proofMarker + "'",
        '-created',
        1,
        0,
      )
      if (existingLogs && existingLogs.length > 0) {
        console.log(
          '[PROOF NOTIFY] Notificação para prova ' +
            proofId +
            ' (V' +
            versionNumber +
            ') já foi processada anteriormente. Idempotência confirmada via marker: ' +
            proofMarker,
        )
        return e.next()
      }
    } catch (checkErr) {
      console.warn('[PROOF NOTIFY] Erro ao verificar idempotência de logs:', checkErr)
    }

    // 3. Buscar dados do cliente
    if (!clientId) {
      console.warn('[PROOF NOTIFY] Pedido ' + orderId + ' não possui client_id.')
      return e.next()
    }

    let clientRecord = null
    try {
      clientRecord = $app.findRecordById('clients', clientId)
    } catch (cErr) {
      console.error('[PROOF NOTIFY] Cliente ' + clientId + ' não encontrado no banco:', cErr)
      return e.next()
    }

    // Obter telefone normalizado para envio Meta
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
        '[PROOF NOTIFY] Telefone do cliente ' +
          clientId +
          ' inválido para envio Meta: ' +
          clientPhoneRaw,
      )
      return e.next()
    }

    // 4. Avaliar Regra Oficial da Janela de 24h
    // Fonte de verdade:
    // (a) Busca última inbound REAL do cliente na collection 'messages' (helper lastInboundAt)
    // (b) last_customer_message_at do atendimento ativo do cliente em 'attendances'
    // (c) client.last_message_at quando client.last_message_direction === 'inbound'
    let lastInboundTimestamp = ''
    let attendanceId = String(orderRecord.get('attendance_id') || '').trim()

    // (a) Busca última mensagem inbound real na collection messages
    try {
      const inbounds = $app.findRecordsByFilter(
        'messages',
        "client_id = '" + clientId + "' && direction = 'inbound'",
        '-created',
        1,
        0,
      )
      if (inbounds && inbounds.length > 0) {
        lastInboundTimestamp = String(inbounds[0].get('created') || '').trim()
      }
    } catch (inboundErr) {
      console.warn('[PROOF NOTIFY] Erro ao buscar última mensagem inbound:', inboundErr)
    }

    // (b) Atendimento ativo
    let lastCustomerMessageAt = ''
    try {
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
      console.warn('[PROOF NOTIFY] Erro ao consultar atendimentos para janela 24h:', attErr)
    }

    const check24hWindow = function (clientRec, lastInboundTime, lastCustMsgAt) {
      // Prioridade 1: Última inbound real do cliente em messages
      let custTimestamp = lastInboundTime || ''
      // Prioridade 2: last_customer_message_at do atendimento
      if (!custTimestamp) {
        custTimestamp = lastCustMsgAt || ''
      }
      // Prioridade 3: client.last_message_at quando inbound
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

    const isInside24h = check24hWindow(clientRecord, lastInboundTimestamp, lastCustomerMessageAt)

    // 5. Montar texto da mensagem informando claramente a versão da prova e o link de acompanhamento
    const resolvedClientName = clientProvidedName || clientRecord.get('name') || 'Cliente'
    const baseUrl =
      $os.getenv('SITE_URL') ||
      $os.getenv('PB_INSTANCE_URL') ||
      'https://crm-grafica-whatsapp-7b1a5--preview.goskip.app'
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
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

    // Obter usuário responsável
    const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
    const userId = sentByUserId || (auth ? auth.id : '')
    let userName = 'Equipe de Criação'
    if (auth && (auth.get('name') || auth.get('email'))) {
      userName = auth.get('name') || auth.get('email')
    } else if (sentByUserId) {
      try {
        const u = $app.findRecordById('users', sentByUserId)
        if (u) userName = u.get('name') || u.get('email') || userName
      } catch (_) {}
    }

    // Marker conjunto de coordenação anti-duplicidade:
    // Sinaliza que esta prova tratou a notificação de awaiting_approval para o pedido
    const coordinationMarker =
      proofMarker +
      ' [proof_v:' +
      versionNumber +
      '] [proof_notify_order:' +
      orderId +
      ':awaiting_approval]'

    // 6. Se estiver FORA da janela de 24h:
    // Não enviar mensagem livre. Verificar se existe Template Oficial aprovado na Meta.
    if (!isInside24h) {
      console.log(
        '[PROOF NOTIFY] Cliente ' +
          clientId +
          ' está FORA da janela de 24h. Envio livre bloqueado. Registrando requires_template.',
      )

      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', stageInternalId)
        logRec.set('from_stage_name', stageName)
        logRec.set('to_stage_id', 'awaiting_approval')
        logRec.set('to_stage_name', 'Aguardando aprovação do cliente')
        if (userId) logRec.set('user_id', userId)
        logRec.set('user_name', userName)
        logRec.set('change_type', 'automatic')
        logRec.set(
          'notes',
          'Prova V' +
            versionNumber +
            ' enviada ao cliente para aprovação. Notificação retida: cliente fora da janela de 24h (exige Template Oficial Meta). ' +
            coordinationMarker,
        )
        logRec.set('whatsapp_sent', false)
        logRec.set('whatsapp_status', 'requires_template')
        logRec.set('whatsapp_message', renderedMessage)
        $app.save(logRec)
      } catch (logErr) {
        console.error('[PROOF NOTIFY] Erro ao registrar log requires_template:', logErr)
      }

      return e.next()
    }

    // 7. Se estiver DENTRO da janela de 24h:
    // Disparar WhatsApp oficial via Meta Cloud API
    let metaToken = $os.getenv('WHATSAPP_ACCESS_TOKEN') || ''
    let metaPhoneId = $os.getenv('WHATSAPP_PHONE_NUMBER_ID') || ''
    let metaApiVersion = $os.getenv('WHATSAPP_GRAPH_API_VERSION') || 'v21.0'

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
        '[PROOF NOTIFY] Credenciais Meta não configuradas. Envio WhatsApp impossibilitado.',
      )
      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', stageInternalId)
        logRec.set('from_stage_name', stageName)
        logRec.set('to_stage_id', 'awaiting_approval')
        logRec.set('to_stage_name', 'Aguardando aprovação do cliente')
        if (userId) logRec.set('user_id', userId)
        logRec.set('user_name', userName)
        logRec.set('change_type', 'automatic')
        logRec.set(
          'notes',
          'Prova V' +
            versionNumber +
            ' enviada ao cliente para aprovação. Falha no envio: credenciais Meta não configuradas. ' +
            coordinationMarker,
        )
        logRec.set('whatsapp_sent', false)
        logRec.set('whatsapp_status', 'falhou')
        logRec.set('whatsapp_message', renderedMessage)
        $app.save(logRec)
      } catch (errLog) {
        console.error('[PROOF NOTIFY] Erro ao gravar log de falha de credenciais:', errLog)
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
      '[PROOF NOTIFY] Disparando WhatsApp oficial para ' +
        phoneNormalized +
        ' (Prova V' +
        versionNumber +
        ' do Pedido #' +
        orderNumber +
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
      console.error('[PROOF NOTIFY] Exceção ao chamar Meta Cloud API:', sendErr)
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
      console.log(
        '[PROOF NOTIFY] WhatsApp real de nova versão enviado com sucesso. WAMID: ' +
          externalMessageId,
      )

      // Gravar mensagem real na collection messages SOMENTE quando houve envio real aceito pela Meta
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
        console.error('[PROOF NOTIFY] Erro ao gravar registro na collection messages:', msgSaveErr)
      }

      // Atualizar client com last_message_*
      try {
        clientRecord.set('last_message_at', currentTimestampIso)
        clientRecord.set('last_message_direction', 'outbound')
        clientRecord.set('last_message_text', renderedMessage.substring(0, 100))
        $app.save(clientRecord)
      } catch (clientUpdErr) {
        console.warn('[PROOF NOTIFY] Aviso ao atualizar last_message do cliente:', clientUpdErr)
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
          console.warn('[PROOF NOTIFY] Aviso ao atualizar attendance:', attUpdErr)
        }
      }

      // Registrar production_logs com proof_id, version_number, whatsapp_sent=true, whatsapp_status='enviado', WAMID, horário
      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', stageInternalId)
        logRec.set('from_stage_name', stageName)
        logRec.set('to_stage_id', 'awaiting_approval')
        logRec.set('to_stage_name', 'Aguardando aprovação do cliente')
        if (userId) logRec.set('user_id', userId)
        logRec.set('user_name', userName)
        logRec.set('change_type', 'automatic')
        logRec.set(
          'notes',
          'Prova V' +
            versionNumber +
            ' enviada ao cliente para aprovação. Notificação enviada via WhatsApp Meta. WAMID: ' +
            externalMessageId +
            '. ' +
            coordinationMarker,
        )
        logRec.set('whatsapp_sent', true)
        logRec.set('whatsapp_status', 'enviado')
        logRec.set('whatsapp_message', renderedMessage)
        $app.save(logRec)
      } catch (logSaveErr) {
        console.error('[PROOF NOTIFY] Erro ao gravar production_log de sucesso:', logSaveErr)
      }
    } else {
      // Falha na Meta API
      const metaErrObj = responseJson && responseJson.error ? responseJson.error : {}
      const metaErrMsg =
        metaErrObj.message || (httpError ? String(httpError) : 'Erro desconhecido da Meta API')
      const metaErrCode = metaErrObj.code || statusCode

      console.error('[PROOF NOTIFY] Falha no envio WhatsApp Meta:', {
        httpStatus: statusCode,
        code: metaErrCode,
        message: metaErrMsg,
      })

      // Registrar production_logs com whatsapp_sent = false e status 'falhou'
      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', stageInternalId)
        logRec.set('from_stage_name', stageName)
        logRec.set('to_stage_id', 'awaiting_approval')
        logRec.set('to_stage_name', 'Aguardando aprovação do cliente')
        if (userId) logRec.set('user_id', userId)
        logRec.set('user_name', userName)
        logRec.set('change_type', 'automatic')
        logRec.set(
          'notes',
          'Prova V' +
            versionNumber +
            ' enviada ao cliente para aprovação. Falha ao enviar notificação WhatsApp via Meta (Código: ' +
            metaErrCode +
            '): ' +
            metaErrMsg +
            '. ' +
            coordinationMarker,
        )
        logRec.set('whatsapp_sent', false)
        logRec.set('whatsapp_status', 'falhou')
        logRec.set('whatsapp_message', renderedMessage)
        $app.save(logRec)
      } catch (logSaveErr) {
        console.error('[PROOF NOTIFY] Erro ao gravar production_log de falha:', logSaveErr)
      }
    }
  } catch (globalErr) {
    console.error(
      '[PROOF NOTIFY] Erro inesperado no hook de notificação de nova prova:',
      globalErr && globalErr.message ? globalErr.message : globalErr,
    )
  }

  return e.next()
}, 'production_proofs')

console.log(
  '[PROOF NOTIFY] Hook loaded: production_proof_notify onRecordAfterCreateSuccess registered for production_proofs',
)
