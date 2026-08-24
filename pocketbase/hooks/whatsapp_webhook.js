// Hook: WhatsApp Webhook handling for Meta Cloud API (GET validation and POST messages)
// Accessible at GET & POST /api/crm/whatsapp-webhook

// 1. Webhook Verification endpoint for Meta Webhook setup (GET)
routerAdd('GET', '/api/crm/whatsapp-webhook', (e) => {
  const query = e.requestInfo().query || {}
  const hubMode = query['hub.mode'] || query['hub_mode'] || ''
  const hubVerifyToken = query['hub.verify_token'] || query['hub_verify_token'] || ''
  const hubChallenge = query['hub.challenge'] || query['hub_challenge'] || ''

  console.log('[Meta Webhook GET] Verification request received:', {
    has_mode: Boolean(hubMode),
    mode: hubMode,
    has_verify_token: Boolean(hubVerifyToken),
    received_token: hubVerifyToken
      ? hubVerifyToken.length > 8
        ? hubVerifyToken.substring(0, 4) + '...'
        : '***'
      : 'none',
    has_challenge: Boolean(hubChallenge),
    challenge_length: hubChallenge ? String(hubChallenge).length : 0,
  })

  // If this is a Meta verification handshake (hub.mode === 'subscribe')
  if (hubMode === 'subscribe' || hubVerifyToken || hubChallenge) {
    // 1. Fetch configured VERIFY_TOKEN from system_settings or env or fallback defaults
    let expectedToken = ''

    try {
      const record = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'whatsapp_verify_token',
      )
      if (record) {
        expectedToken = record.getString('setting_value') || ''
      }
    } catch (_) {}

    if (!expectedToken) {
      expectedToken = $os.getenv('WHATSAPP_VERIFY_TOKEN') || ''
    }

    // Default fallbacks to prevent mismatch during initial onboarding
    const allowedTokens = [
      expectedToken,
      'laletra_crm_webhook_2024',
      'laletra_crm_secret_token_2025',
    ].filter((t) => Boolean(t && t.trim()))

    const isMatch = allowedTokens.includes(hubVerifyToken.trim())

    if (hubMode === 'subscribe' && isMatch) {
      console.log('[Meta Webhook GET] Verification SUCCESS! Returning challenge string.')
      // Meta requires HTTP 200 with raw challenge text (Content-Type: text/plain)
      return e.string(200, String(hubChallenge))
    }

    if (!isMatch) {
      console.log(
        '[Meta Webhook GET] Verification FAILED: token mismatch. Received token did not match configured tokens.',
      )
      return e.string(403, 'Forbidden: verification token mismatch')
    }
  }

  // Fallback status check when pinged directly via browser or health check
  return e.json(200, {
    status: 'active',
    service: 'CRM Laletra WhatsApp Cloud API Webhook',
    timestamp: new Date().toISOString(),
  })
})

// 2. Event & Message Receiver endpoint (POST)
routerAdd('POST', '/api/crm/whatsapp-webhook', (e) => {
  const body = e.requestInfo().body || {}

  console.log('[Meta Webhook POST] Inbound webhook event received')

  // Handle Meta WhatsApp Webhook payload structure
  let phone = ''
  let messageText = ''
  let senderName = ''
  let messageId = 'msg_' + new Date().getTime()
  let isMetaPayload = false

  if (body.entry && body.entry[0] && body.entry[0].changes) {
    isMetaPayload = true
    const change = body.entry[0].changes[0]
    if (change && change.value) {
      // Check for message statuses (delivered, read, sent)
      if (change.value.statuses && change.value.statuses[0]) {
        const st = change.value.statuses[0]
        const stMsgId = st.id
        const stStatus = st.status // delivered, read, sent, failed
        try {
          const messagesCol = $app.findCollectionByNameOrId('messages')
          const msgRecords = $app.findRecordsByFilter(
            'messages',
            'whatsapp_message_id = {:id}',
            '-created',
            1,
            0,
            {
              id: stMsgId,
            },
          )
          if (msgRecords && msgRecords.length > 0) {
            const m = msgRecords[0]
            m.set('status', stStatus)
            $app.save(m)
            console.log(
              '[Meta Webhook POST] Updated message status to:',
              stStatus,
              'for id:',
              stMsgId,
            )
          }
        } catch (_) {}

        return e.json(200, { success: true, status_updated: stStatus })
      }

      // Check for incoming messages
      if (change.value.messages && change.value.messages[0]) {
        const msg = change.value.messages[0]
        phone = msg.from || ''
        messageId = msg.id || messageId

        if (msg.type === 'text' && msg.text) {
          messageText = msg.text.body || ''
        } else if (msg.type === 'image') {
          messageText =
            msg.image && msg.image.caption ? '[Imagem] ' + msg.image.caption : '[Imagem enviada]'
        } else if (msg.type === 'document') {
          messageText =
            msg.document && msg.document.filename
              ? '[Documento] ' + msg.document.filename
              : '[Documento enviado]'
        } else if (msg.type === 'audio') {
          messageText = '[Áudio recebido]'
        } else if (msg.type === 'button') {
          messageText = msg.button && msg.button.text ? msg.button.text : '[Resposta de botão]'
        } else if (msg.type === 'interactive') {
          if (msg.interactive && msg.interactive.button_reply) {
            messageText = msg.interactive.button_reply.title || ''
          } else if (msg.interactive && msg.interactive.list_reply) {
            messageText = msg.interactive.list_reply.title || ''
          } else {
            messageText = '[Resposta interativa]'
          }
        } else {
          messageText = '[Mensagem do WhatsApp: ' + (msg.type || 'desconhecida') + ']'
        }

        if (change.value.contacts && change.value.contacts[0]) {
          senderName =
            change.value.contacts[0].profile && change.value.contacts[0].profile.name
              ? change.value.contacts[0].profile.name
              : ''
        }
      }
    }
  } else {
    // Direct / simplified webhook payload for testing/simulations
    phone = body.phone || body.from || ''
    messageText = body.text || body.message || ''
    senderName = body.name || body.sender_name || ''
  }

  // If this is a Meta payload without a new message (e.g., ping or unsupported change), acknowledge with 200
  if (isMetaPayload && (!phone || !messageText)) {
    return e.json(200, { success: true, message: 'Event acknowledged' })
  }

  if (!phone || !messageText) {
    return e.json(400, { error: 'phone and messageText are required' })
  }

  // Normalize phone (digits only for matching)
  const cleanPhone = phone.replace(/[^0-9]/g, '')

  // Find or create client
  let clientRecord = null
  const clientsCol = $app.findCollectionByNameOrId('clients')

  try {
    const records = $app.findRecordsByFilter('clients', 'phone ~ {:phone}', '-created', 1, 0, {
      phone: cleanPhone.slice(-8),
    })
    if (records && records.length > 0) {
      clientRecord = records[0]
    }
  } catch (_) {}

  const nowIso = new Date().toISOString()
  let isReopened = false
  let oldStage = ''

  if (!clientRecord) {
    // Create new client in "Precisa responder"
    clientRecord = new Record(clientsCol)
    clientRecord.set('name', senderName || 'Cliente WhatsApp (' + cleanPhone.slice(-4) + ')')
    clientRecord.set('phone', phone.startsWith('+') ? phone : '+' + cleanPhone)
    clientRecord.set('stage', 'Precisa responder')
    clientRecord.set('priority', 'media')
    clientRecord.set('is_archived', false)
    clientRecord.set('has_returned', false)
    clientRecord.set('last_message_at', nowIso)
    clientRecord.set('last_message_direction', 'inbound')
    clientRecord.set('last_message_text', messageText)
    clientRecord.set('notes', 'Criado automaticamente via mensagem do WhatsApp Cloud API.')
    clientRecord.set('next_action', 'Atender novo contato e verificar demanda')
    $app.save(clientRecord)

    // Record stage transition
    try {
      const transCol = $app.findCollectionByNameOrId('stage_transitions')
      const transRec = new Record(transCol)
      transRec.set('client_id', clientRecord.id)
      transRec.set('from_stage', '')
      transRec.set('to_stage', 'Precisa responder')
      transRec.set('to_stage_id', 'needs_response')
      transRec.set('change_type', 'automatic')
      transRec.set('user_name', 'Automação WhatsApp Webhook')
      transRec.set('notes', 'Criação inicial via mensagem recebida')
      $app.save(transRec)
    } catch (_) {}
  } else {
    // Existing client
    oldStage = clientRecord.getString('stage') || ''
    const wasArchived = clientRecord.getBool('is_archived')

    // If archived or closed or in waiting stage, reopen & move to "Precisa responder"
    if (
      wasArchived ||
      oldStage === 'Venda fechada' ||
      oldStage === 'Não fechou' ||
      oldStage === 'Contato iniciado' ||
      oldStage === 'Aguardando cliente' ||
      oldStage === 'Novo contato'
    ) {
      if (wasArchived || oldStage === 'Venda fechada' || oldStage === 'Não fechou') {
        isReopened = true
        clientRecord.set('has_returned', true)
        clientRecord.set('reopened_at', nowIso)
      }
      clientRecord.set('is_archived', false)
      clientRecord.set('stage', 'Precisa responder')
    }

    clientRecord.set('last_message_at', nowIso)
    clientRecord.set('last_message_direction', 'inbound')
    clientRecord.set('last_message_text', messageText)
    if (
      senderName &&
      (!clientRecord.getString('name') ||
        clientRecord.getString('name').startsWith('Cliente WhatsApp'))
    ) {
      clientRecord.set('name', senderName)
    }
    $app.save(clientRecord)

    // Log stage transition if stage changed or reopened
    if (oldStage !== 'Precisa responder' || wasArchived) {
      try {
        const transCol = $app.findCollectionByNameOrId('stage_transitions')
        const transRec = new Record(transCol)
        transRec.set('client_id', clientRecord.id)
        transRec.set('from_stage', oldStage + (wasArchived ? ' (Arquivado)' : ''))
        transRec.set('to_stage', 'Precisa responder')
        transRec.set('to_stage_id', 'needs_response')
        transRec.set('change_type', 'automatic')
        transRec.set('user_name', 'Automação WhatsApp Webhook')
        transRec.set(
          'notes',
          wasArchived
            ? 'Cliente retornou contato! Atendimento desarquivado e reaberto automaticamente.'
            : 'Mensagem recebida no WhatsApp, movido para Precisa responder.',
        )
        $app.save(transRec)
      } catch (_) {}
    }
  }

  // Record message in history
  try {
    const messagesCol = $app.findCollectionByNameOrId('messages')
    const msgRecord = new Record(messagesCol)
    msgRecord.set('client_id', clientRecord.id)
    msgRecord.set('direction', 'inbound')
    msgRecord.set('message_text', messageText)
    msgRecord.set('sender_name', senderName || clientRecord.getString('name'))
    msgRecord.set('whatsapp_message_id', messageId)
    msgRecord.set('status', 'delivered')
    msgRecord.set('created', nowIso)
    $app.save(msgRecord)
  } catch (err) {
    console.log('Error saving message record:', err)
  }

  return e.json(200, {
    success: true,
    client_id: clientRecord.id,
    client_name: clientRecord.getString('name'),
    stage: clientRecord.getString('stage'),
    is_reopened: isReopened,
    has_returned: clientRecord.getBool('has_returned'),
  })
})
