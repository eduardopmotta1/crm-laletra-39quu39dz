// Hook: Send WhatsApp Message via Meta Cloud API or log locally
// Accessible at POST /api/crm/whatsapp-send
routerAdd('POST', '/api/crm/whatsapp-send', (e) => {
  const body = e.requestInfo().body || {}
  const clientId = body.client_id
  const messageText = body.message_text
  const userId = e.auth ? e.auth.id : null

  if (!clientId || !messageText) {
    return e.json(400, { error: 'client_id and message_text are required' })
  }

  let clientRecord
  try {
    clientRecord = $app.findFirstRecordByData('clients', 'id', clientId)
  } catch (_) {
    return e.json(404, { error: 'Client not found' })
  }

  // Check if Meta credentials exist in settings
  let token = ''
  let phoneId = ''
  try {
    const tokenRec = $app.findFirstRecordByData(
      'system_settings',
      'setting_key',
      'whatsapp_access_token',
    )
    token = tokenRec ? tokenRec.getString('setting_value') : ''
  } catch (_) {}
  try {
    const phoneIdRec = $app.findFirstRecordByData(
      'system_settings',
      'setting_key',
      'whatsapp_phone_number_id',
    )
    phoneId = phoneIdRec ? phoneIdRec.getString('setting_value') : ''
  } catch (_) {}

  let whatsappMsgId = 'out_' + new Date().getTime()
  let sendStatus = 'sent'
  let apiSuccess = false
  let apiResponse = null

  // Clean phone number (e.g. +55 11 99881-2233 -> 5511998812233)
  let rawPhone = clientRecord.getString('phone') || ''
  let cleanPhone = rawPhone.replace(/[^0-9]/g, '')

  // If credentials are valid format and not dummy demo token, try Meta Cloud API
  if (token && phoneId && !token.includes('DEMO_TOKEN') && token.length > 20) {
    try {
      const res = $http.send({
        url: 'https://graph.facebook.com/v20.0/' + phoneId + '/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { preview_url: false, body: messageText },
        }),
        timeout: 15,
      })
      apiResponse = res.json
      if (res.statusCode === 200 && res.json && res.json.messages && res.json.messages[0]) {
        whatsappMsgId = res.json.messages[0].id
        apiSuccess = true
      }
    } catch (err) {
      console.log('Error sending via Meta Cloud API:', err)
    }
  }

  const nowIso = new Date().toISOString()

  // Update client: update last message, and if was in "Precisa responder", advance to "Em atendimento"
  clientRecord.set('last_message_at', nowIso)
  clientRecord.set('last_message_direction', 'outbound')
  clientRecord.set('last_message_text', messageText)
  if (clientRecord.getString('stage') === 'Precisa responder') {
    clientRecord.set('stage', 'Em atendimento')
  }
  $app.save(clientRecord)

  // Record message in history
  try {
    const messagesCol = $app.findCollectionByNameOrId('messages')
    const msgRecord = new Record(messagesCol)
    msgRecord.set('client_id', clientId)
    msgRecord.set('direction', 'outbound')
    msgRecord.set('message_text', messageText)
    msgRecord.set(
      'sender_name',
      e.auth ? e.auth.getString('name') || e.auth.getString('email') : 'Equipe Gráfica',
    )
    if (userId) {
      msgRecord.set('sent_by_user', userId)
    }
    msgRecord.set('whatsapp_message_id', whatsappMsgId)
    msgRecord.set('status', sendStatus)
    msgRecord.set('created', nowIso)
    $app.save(msgRecord)
  } catch (err) {
    console.log('Error saving outbound message record:', err)
  }

  return e.json(200, {
    success: true,
    message_id: whatsappMsgId,
    api_dispatched: apiSuccess,
    api_response: apiResponse,
    client: {
      id: clientRecord.id,
      stage: clientRecord.getString('stage'),
      last_message_at: clientRecord.getString('last_message_at'),
    },
  })
})
