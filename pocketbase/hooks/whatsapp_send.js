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
  const clientId = String(body.client_id || body.clientId || '').trim()
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

  // 6. Helper interno reutilizável para despacho Meta Cloud API, gravação de mensagem e atualização de registros
  const executeMetaWhatsAppSend = function (params) {
    const targetPhone = params.phoneNormalized
    const textBody = params.textBody
    const token = params.token
    const phoneId = params.phoneId
    const apiVersion = params.apiVersion || 'v21.0'
    const targetClient = params.clientRecord
    const targetAttendanceId = params.attendanceId || ''
    const sender = params.senderName || 'Atendente'
    const userSenderId = params.userId || ''

    const url = 'https://graph.facebook.com/' + apiVersion + '/' + phoneId + '/messages'
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: targetPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: textBody,
      },
    }

    console.log('[WHATSAPP SEND] Enviando mensagem para ' + targetPhone + ' via ' + url)

    let response = null
    let errorNetwork = null

    try {
      response = $http.send({
        url: url,
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: 20,
      })
    } catch (errNet) {
      errorNetwork = errNet
      console.error('[WHATSAPP SEND] Exceção de rede ao chamar Meta:', errNet)
    }

    const httpCode = response ? response.statusCode : 0
    const bodyRaw = response ? response.raw : ''
    let respJson = null

    try {
      if (response && response.json) {
        respJson = response.json
      } else if (bodyRaw) {
        respJson = JSON.parse(bodyRaw)
      }
    } catch (_) {}

    const isSuccess =
      httpCode >= 200 &&
      httpCode < 300 &&
      respJson &&
      respJson.messages &&
      respJson.messages.length > 0
    const wamid = isSuccess ? respJson.messages[0].id : ''

    const msgCol = $app.findCollectionByNameOrId('messages')
    const msgRec = new Record(msgCol)

    msgRec.set('client_id', targetClient.id)
    if (targetAttendanceId) {
      msgRec.set('attendance_id', targetAttendanceId)
    }
    msgRec.set('direction', 'outbound')
    msgRec.set('message_text', textBody)
    msgRec.set('sender_name', sender)
    if (userSenderId) {
      msgRec.set('sent_by_user', userSenderId)
    }

    const timestampIso = new Date().toISOString()

    if (isSuccess) {
      msgRec.set('status', 'sent')
      msgRec.set('whatsapp_message_id', wamid)
      $app.save(msgRec)

      try {
        targetClient.set('last_message_at', timestampIso)
        targetClient.set('last_message_direction', 'outbound')
        targetClient.set('last_message_text', textBody.substring(0, 100))
        $app.save(targetClient)
      } catch (cErr) {
        console.warn('[WHATSAPP SEND] Erro ao atualizar client:', cErr)
      }

      if (targetAttendanceId) {
        try {
          const att = $app.findRecordById('attendances', targetAttendanceId)
          if (att) {
            att.set('last_company_message_at', timestampIso)
            $app.save(att)
          }
        } catch (aErr) {
          console.warn('[WHATSAPP SEND] Erro ao atualizar attendance:', aErr)
        }
      }

      console.log('[WHATSAPP SEND] Mensagem enviada com sucesso pela Meta. WAMID:', wamid)

      return {
        success: true,
        statusCode: 200,
        status: 'sent',
        whatsapp_message_id: wamid,
        messageRecord: msgRec,
        clientRecord: targetClient,
      }
    }

    // Falha na chamada da Meta:
    msgRec.set('status', 'failed')
    try {
      $app.save(msgRec)
    } catch (saveFailedErr) {
      console.error('[WHATSAPP SEND] Erro ao salvar mensagem com status failed:', saveFailedErr)
    }

    const errObj = respJson && respJson.error ? respJson.error : {}
    const errMessage =
      errObj.message || (errorNetwork ? String(errorNetwork) : 'Erro desconhecido da Meta')
    const errCode = errObj.code || httpCode
    const errSubcode = errObj.error_subcode || ''
    const errType = errObj.type || ''
    const traceId = errObj.fbtrace_id || ''

    console.error('[WHATSAPP SEND] Falha da Meta Cloud API:', {
      httpStatus: httpCode,
      errorCode: errCode,
      errorSubcode: errSubcode,
      errorType: errType,
      errorMessage: errMessage,
      fbtraceId: traceId,
    })

    return {
      success: false,
      statusCode: httpCode >= 400 && httpCode < 600 ? httpCode : 502,
      status: 'failed',
      error: 'Não foi possível enviar a mensagem pelo WhatsApp.',
      messageRecord: msgRec,
      meta_error: {
        code: errCode,
        subcode: errSubcode,
        type: errType,
      },
    }
  }

  // 7. Executar envio através do helper
  const sendResult = executeMetaWhatsAppSend({
    phoneNormalized: phoneNormalized,
    textBody: rawText,
    token: metaToken,
    phoneId: metaPhoneId,
    apiVersion: metaApiVersion,
    clientRecord: clientRecord,
    attendanceId: attendanceId,
    senderName: senderName,
    userId: userId,
  })

  if (sendResult.success) {
    return e.json(200, {
      success: true,
      status: 'sent',
      whatsapp_message_id: sendResult.whatsapp_message_id,
      message: sendResult.messageRecord.publicExport(),
      client: sendResult.clientRecord.publicExport(),
    })
  }

  return e.json(sendResult.statusCode, {
    success: false,
    status: 'failed',
    error: sendResult.error,
    message: sendResult.messageRecord ? sendResult.messageRecord.publicExport() : null,
    meta_error: sendResult.meta_error,
  })
})

console.log('[WHATSAPP SEND] Hook registered route: POST /backend/v1/crm/whatsapp/send')
