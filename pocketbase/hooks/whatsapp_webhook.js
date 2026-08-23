// Hook: receive WhatsApp webhook or process simulated inbound messages
// Accessible at POST /api/crm/whatsapp-webhook
routerAdd('POST', '/api/crm/whatsapp-webhook', (e) => {
  const body = e.requestInfo().body || {}

  // 1. Process WhatsApp webhook format or simplified CRM payload
  let phone = ''
  let messageText = ''
  let senderName = ''
  let messageId = 'msg_' + new Date().getTime()

  // Meta Cloud API Webhook payload structure
  if (body.entry && body.entry[0] && body.entry[0].changes) {
    const change = body.entry[0].changes[0]
    if (change && change.value && change.value.messages && change.value.messages[0]) {
      const msg = change.value.messages[0]
      phone = msg.from || ''
      messageText =
        (msg.text && msg.text.body) ||
        (msg.type === 'image' ? '[Imagem enviada]' : '[Mensagem do WhatsApp]')
      messageId = msg.id || messageId
      if (change.value.contacts && change.value.contacts[0]) {
        senderName = change.value.contacts[0].profile ? change.value.contacts[0].profile.name : ''
      }
    }
  } else {
    // Direct / simplified webhook payload for testing/simulations
    phone = body.phone || body.from || ''
    messageText = body.text || body.message || ''
    senderName = body.name || body.sender_name || ''
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
    clientRecord.set('phone', phone)
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

// Verification endpoint for Meta Webhook setup (hub.challenge)
routerAdd('GET', '/api/crm/whatsapp-webhook', (e) => {
  const query = e.requestInfo().query || {}
  const hubChallenge = query['hub.challenge']
  const hubVerifyToken = query['hub.verify_token']

  if (hubChallenge) {
    return e.string(200, hubChallenge)
  }
  return e.json(200, { status: 'WhatsApp Webhook endpoint is active.' })
})
