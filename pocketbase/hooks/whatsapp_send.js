// Hook: Send WhatsApp Message (text or official template) via Meta Cloud API or log locally
// Accessible at POST /api/crm/whatsapp-send
routerAdd('POST', '/api/crm/whatsapp-send', (e) => {
  const body = e.requestInfo().body || {}
  const clientId = body.client_id
  let messageText = body.message_text || ''
  const templateName = body.template_name || ''
  const templateLanguage = body.template_language || 'pt_BR'
  const templateVariables = body.template_variables || {} // { nome: "João", produto: "Cartões" } or array
  const changeStageTo = body.change_stage_to || '' // optional stage override e.g. "Contato iniciado"
  const isTemplateSend = Boolean(templateName)
  const userId = e.auth ? e.auth.id : null
  const userName = e.auth ? e.auth.getString('name') || e.auth.getString('email') : 'Equipe Gráfica'

  if (!clientId || (!messageText && !templateName)) {
    return e.json(400, { error: 'client_id and (message_text or template_name) are required' })
  }

  let clientRecord
  try {
    clientRecord = $app.findFirstRecordByData('clients', 'id', clientId)
  } catch (_) {
    return e.json(404, { error: 'Client not found' })
  }

  // Check 24-hour window: if sending free text outside 24h window of inbound message
  const lastMsgAt = clientRecord.getString('last_message_at')
  const lastMsgDirection = clientRecord.getString('last_message_direction')
  let isWithin24hWindow = false

  if (lastMsgAt && lastMsgDirection === 'inbound') {
    const diffMs = new Date().getTime() - new Date(lastMsgAt).getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    if (diffHours <= 24) {
      isWithin24hWindow = true
    }
  }

  // If not a template send and outside 24h window, optionally flag or restrict
  if (!isTemplateSend && !isWithin24hWindow && body.enforce_24h_window) {
    return e.json(403, {
      error:
        'Fora da janela de atendimento de 24 horas. É necessário utilizar um template aprovado da Meta.',
      within_window: false,
    })
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

  // Resolve template text if messageText is empty
  if (isTemplateSend && !messageText) {
    try {
      const tplRec = $app.findFirstRecordByData('whatsapp_templates', 'name', templateName)
      if (tplRec) {
        let rendered = tplRec.getString('body') || ''
        if (typeof templateVariables === 'object' && templateVariables !== null) {
          Object.keys(templateVariables).forEach((k) => {
            const val = String(templateVariables[k] || '')
            rendered = rendered.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), val)
          })
        }
        messageText = rendered
      }
    } catch (_) {
      messageText = '[Template: ' + templateName + ']'
    }
  }

  let whatsappMsgId = 'out_' + new Date().getTime()
  let sendStatus = 'sent'
  let apiSuccess = false
  let apiResponse = null

  // Clean phone number (e.g. +55 11 99881-2233 -> 5511998812233)
  let rawPhone = clientRecord.getString('phone') || ''
  let cleanPhone = rawPhone.replace(/[^0-9]/g, '')
  if (cleanPhone.length >= 10 && !cleanPhone.startsWith('55')) {
    cleanPhone = '55' + cleanPhone
  }

  // If credentials are valid format and not dummy demo token, try Meta Cloud API
  if (token && phoneId && !token.includes('DEMO_TOKEN') && token.length > 20 && cleanPhone) {
    try {
      let metaPayload = null
      if (isTemplateSend) {
        // Build components parameters for template
        const bodyParams = []
        if (typeof templateVariables === 'object' && templateVariables !== null) {
          Object.keys(templateVariables).forEach((k) => {
            bodyParams.push({ type: 'text', text: String(templateVariables[k] || '') })
          })
        }
        metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: bodyParams.length > 0 ? [{ type: 'body', parameters: bodyParams }] : [],
          },
        }
      } else {
        metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { preview_url: false, body: messageText },
        }
      }

      const res = $http.send({
        url: 'https://graph.facebook.com/v20.0/' + phoneId + '/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(metaPayload),
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
  const oldStage = clientRecord.getString('stage') || ''

  // Update client: update last message, and stage according to rules
  clientRecord.set('last_message_at', nowIso)
  clientRecord.set('last_message_direction', 'outbound')
  clientRecord.set('last_message_text', messageText)

  let newStage = oldStage
  if (changeStageTo) {
    newStage = changeStageTo
    clientRecord.set('stage', changeStageTo)
  } else if (isTemplateSend && (oldStage === 'Novo contato' || !oldStage)) {
    // Starting conversation changes stage to "Contato iniciado"
    newStage = 'Contato iniciado'
    clientRecord.set('stage', 'Contato iniciado')
  } else if (oldStage === 'Precisa responder') {
    newStage = 'Em atendimento'
    clientRecord.set('stage', 'Em atendimento')
  }

  $app.save(clientRecord)

  // Record stage transition if changed
  if (newStage && newStage !== oldStage) {
    try {
      const transCol = $app.findCollectionByNameOrId('stage_transitions')
      const transRec = new Record(transCol)
      transRec.set('client_id', clientRecord.id)
      transRec.set('from_stage', oldStage)
      transRec.set('to_stage', newStage)
      transRec.set('change_type', 'automatic')
      if (userId) transRec.set('user_id', userId)
      transRec.set('user_name', userName)
      transRec.set(
        'notes',
        isTemplateSend ? 'Disparo de template WhatsApp' : 'Envio de mensagem WhatsApp',
      )
      $app.save(transRec)
    } catch (_) {}
  }

  // Record message in history
  try {
    const messagesCol = $app.findCollectionByNameOrId('messages')
    const msgRecord = new Record(messagesCol)
    msgRecord.set('client_id', clientId)
    msgRecord.set('direction', 'outbound')
    msgRecord.set('message_text', messageText)
    msgRecord.set('sender_name', userName)
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
    template_used: templateName || null,
    client: {
      id: clientRecord.id,
      stage: clientRecord.getString('stage'),
      last_message_at: clientRecord.getString('last_message_at'),
    },
  })
})
