// WhatsApp Send Hook — Envio oficial de mensagens via WhatsApp Meta Cloud API
// Endpoint autenticado: POST /backend/v1/crm/whatsapp/send
// Envia mensagem de texto para a API da Meta, persiste status na collection messages e atualiza cliente e atendimento.

console.log('[WHATSAPP SEND] Hook initializing...')

routerAdd('POST', '/backend/v1/crm/whatsapp/send', (e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária para enviar mensagens.',
    })
  }

  // 1. Validar se o usuário está ativo
  if (auth.get('is_active') === false) {
    return e.json(403, {
      success: false,
      error: 'Usuário inativo.',
    })
  }

  // 2. Validar permissões: admin tem acesso total; outros precisam de whatsapp_reply ou whatsapp_start_new
  const roleSlug = auth.get('role_slug') || ''
  const isAdmin = roleSlug === 'admin'

  let customPerms = {}
  try {
    const raw = auth.get('custom_permissions')
    if (typeof raw === 'string' && raw.trim() !== '') {
      customPerms = JSON.parse(raw)
    } else if (raw && typeof raw === 'object') {
      customPerms = raw
    }
  } catch (_) {}

  let rolePerms = {}
  const roleId = auth.get('role_id')
  if (roleId) {
    try {
      const roleRec = $app.findRecordById('roles', roleId)
      if (roleRec) {
        const rawRole = roleRec.get('permissions')
        if (typeof rawRole === 'string' && rawRole.trim() !== '') {
          rolePerms = JSON.parse(rawRole)
        } else if (rawRole && typeof rawRole === 'object') {
          rolePerms = rawRole
        }
      }
    } catch (_) {}
  }

  const checkPerm = function (key) {
    if (customPerms && customPerms[key] !== undefined) {
      return customPerms[key] === true
    }
    if (rolePerms && rolePerms[key] !== undefined) {
      return rolePerms[key] === true
    }
    return false
  }

  if (!isAdmin) {
    const canReply = checkPerm('whatsapp_reply')
    const canStartNew = checkPerm('whatsapp_start_new')
    if (!canReply && !canStartNew) {
      return e.json(403, {
        success: false,
        error: 'Sem permissão para enviar mensagens (whatsapp_reply necessário).',
      })
    }
  }

  // 3. Extrair e validar dados do body
  const body = e.requestInfo().body || {}
  const rawText = String(body.message_text || body.messageText || body.text || '').trim()
  let attendanceId = String(body.attendance_id || body.attendanceId || '').trim()
  const clientProvidedPhone = String(body.phone || body.to || '').trim()

  if (!clientId) {
    return e.json(400, {
      success: false,
      error: 'client_id é obrigatório.',
    })
  }

  if (!rawText) {
    return e.json(400, {
      success: false,
      error: 'Texto da mensagem não pode ser vazio.',
    })
  }

  // 4. Buscar cliente no banco
  let clientRecord = null
  try {
    clientRecord = $app.findRecordById('clients', clientId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error: 'Cliente não encontrado.',
    })
  }

  // Resolver telefone do cliente: priorizar clients.normalized_phone, depois clients.phone, depois clientProvidedPhone
  let phoneRaw =
    clientRecord.get('normalized_phone') || clientRecord.get('phone') || clientProvidedPhone || ''

  // Função interna de normalização de telefone para formato Meta internacional (somente dígitos com DDI 55)
  // Ex: 5521999999999
  const normalizeForMeta = function (input) {
    if (!input) return ''
    let d = String(input).replace(/\D/g, '')
    if (!d) return ''
    // Se não tem prefixo de país e parece brasileiro (10 ou 11 dígitos, ex: 21999999999 ou 2133334444)
    if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) {
      d = '55' + d
    }
    return d
  }

  const phoneNormalized = normalizeForMeta(phoneRaw)
  if (!phoneNormalized || phoneNormalized.length < 10) {
    return e.json(400, {
      success: false,
      error: 'Número de telefone do cliente inválido ou não cadastrado.',
    })
  }

  // Se attendance_id não foi passado, tentar encontrar atendimento ativo do cliente
  if (!attendanceId) {
    try {
      const atts = $app.findRecordsByFilter(
        'attendances',
        "client_id = '" + clientId + "' && is_archived != true",
        '-created',
        1,
        0,
      )
      if (atts && atts.length > 0) {
        attendanceId = atts[0].id
      }
    } catch (_) {}
  }

  // Identificar nome do remetente autenticado
  const senderName = auth.get('name') || auth.get('email') || 'Atendente'
  const userId = auth.id

  // 5. Obter credenciais da Meta Cloud API
  // Prioridade 1: variáveis de ambiente / secrets ($os.getenv)
  // Prioridade 2: system_settings no banco (com proteção para ignorar valores demo 'DEMO' / 'EAAX...DEMO_TOKEN')
  let metaToken = $os.getenv('WHATSAPP_ACCESS_TOKEN') || ''
  let metaPhoneId = $os.getenv('WHATSAPP_PHONE_NUMBER_ID') || ''
  let metaApiVersion = $os.getenv('WHATSAPP_GRAPH_API_VERSION') || 'v21.0'

  // Se não estiver em env vars, verificar fallback em system_settings
  if (!metaToken || !metaPhoneId) {
    try {
      if (!metaToken) {
        const tokenRec = $app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'whatsapp_access_token',
        )
        const val = tokenRec ? tokenRec.get('setting_value') : ''
        // Ignorar tokens demo óbvios
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
          // ignorar phone_id demo inicial
          metaPhoneId = val
        }
      }
    } catch (_) {}
  }

  if (!metaToken || !metaPhoneId) {
    console.error(
      '[WHATSAPP SEND] Credenciais Meta não configuradas. WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID ausentes.',
    )
    return e.json(503, {
      success: false,
      configured: false,
      error:
        'WhatsApp Meta Cloud API não está configurada neste ambiente. Configure os secrets WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.',
    })
  }

  // 6. Preparar payload oficial da WhatsApp Cloud API da Meta
  // POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/messages
  const metaUrl = 'https://graph.facebook.com/' + metaApiVersion + '/' + metaPhoneId + '/messages'
  const metaPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNormalized,
    type: 'text',
    text: {
      preview_url: false,
      body: rawText,
    },
  }

  console.log('[WHATSAPP SEND] Enviando mensagem para ' + phoneNormalized + ' via ' + metaUrl)

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
  } catch (err) {
    httpError = err
    console.error('[WHATSAPP SEND] Exceção de rede ao chamar Meta:', err)
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

  // 7. Avaliar resposta da Meta
  // Sucesso HTTP 200/201 e existência de messages[0].id
  const isMetaSuccess =
    statusCode >= 200 &&
    statusCode < 300 &&
    responseJson &&
    responseJson.messages &&
    responseJson.messages.length > 0
  const externalMessageId = isMetaSuccess ? responseJson.messages[0].id : ''

  const messagesCol = $app.findCollectionByNameOrId('messages')
  const messageRecord = new Record(messagesCol)

  messageRecord.set('client_id', clientId)
  if (attendanceId) {
    messageRecord.set('attendance_id', attendanceId)
  }
  messageRecord.set('direction', 'outbound')
  messageRecord.set('message_text', rawText)
  messageRecord.set('sender_name', senderName)
  messageRecord.set('sent_by_user', userId)

  const todayDateStr = new Date().toISOString().split('T')[0]

  if (isMetaSuccess) {
    messageRecord.set('status', 'sent')
    messageRecord.set('whatsapp_message_id', externalMessageId)
    $app.save(messageRecord)

    // Atualizar last_message do cliente
    try {
      clientRecord.set('last_message_at', todayDateStr)
      clientRecord.set('last_message_direction', 'outbound')
      clientRecord.set('last_message_text', rawText.substring(0, 100))
      $app.save(clientRecord)
    } catch (cErr) {
      console.warn('[WHATSAPP SEND] Erro ao atualizar client:', cErr)
    }

    // Atualizar last_company_message_at no atendimento
    if (attendanceId) {
      try {
        const attRec = $app.findRecordById('attendances', attendanceId)
        if (attRec) {
          attRec.set('last_company_message_at', todayDateStr)
          $app.save(attRec)
        }
      } catch (aErr) {
        console.warn('[WHATSAPP SEND] Erro ao atualizar attendance:', aErr)
      }
    }

    console.log('[WHATSAPP SEND] Mensagem enviada com sucesso pela Meta. WAMID:', externalMessageId)

    return e.json(200, {
      success: true,
      status: 'sent',
      whatsapp_message_id: externalMessageId,
      message: messageRecord.publicExport(),
      client: clientRecord.publicExport(),
    })
  }

  // Falha na chamada da Meta:
  // Salvar mensagem como failed para auditoria do CRM
  messageRecord.set('status', 'failed')
  try {
    $app.save(messageRecord)
  } catch (saveFailedErr) {
    console.error('[WHATSAPP SEND] Erro ao salvar mensagem com status failed:', saveFailedErr)
  }

  // Extrair detalhes de erro para log técnico SEM expor token
  const metaErrObj = responseJson && responseJson.error ? responseJson.error : {}
  const metaErrMsg =
    metaErrObj.message || (httpError ? String(httpError) : 'Erro desconhecido da Meta')
  const metaErrCode = metaErrObj.code || statusCode
  const metaErrSubcode = metaErrObj.error_subcode || ''
  const metaErrType = metaErrObj.type || ''
  const fbtraceId = metaErrObj.fbtrace_id || ''

  console.error('[WHATSAPP SEND] Falha da Meta Cloud API:', {
    httpStatus: statusCode,
    errorCode: metaErrCode,
    errorSubcode: metaErrSubcode,
    errorType: metaErrType,
    errorMessage: metaErrMsg,
    fbtraceId: fbtraceId,
  })

  return e.json(statusCode >= 400 && statusCode < 600 ? statusCode : 502, {
    success: false,
    status: 'failed',
    error: 'Não foi possível enviar a mensagem pelo WhatsApp.',
    message: messageRecord.publicExport(),
    meta_error: {
      code: metaErrCode,
      subcode: metaErrSubcode,
      type: metaErrType,
    },
  })
})

console.log('[WHATSAPP SEND] Hook registered route: POST /backend/v1/crm/whatsapp/send')
