// WhatsApp Send Media Hook — Envio oficial de mídias (imagem e documento) via WhatsApp Meta Cloud API
// Utilizando LINK PÚBLICO CONTROLADO em /messages (sem upload multipart na Meta /media)
// Endpoint autenticado: POST /backend/v1/crm/whatsapp/send-media
// Recebe multipart/form-data: client_id, attendance_id (opcional), phone (opcional), file, file_name, file_type, caption (opcional), request_id (opcional)

console.log('[WHATSAPP SEND MEDIA] Hook initializing (controlled public link mode)...')

routerAdd('POST', '/backend/v1/crm/whatsapp/send-media', (e) => {
  // 1. Validar autenticação (mesmo padrão do endpoint /send)
  let auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)

  // Suporte a autenticação via Authorization Bearer token direto do PocketBase
  if (!auth) {
    try {
      const authHdr = String(
        e.request.header.get('Authorization') || e.request.header.get('authorization') || '',
      ).trim()
      if (authHdr.startsWith('Bearer ')) {
        const rawToken = authHdr.substring(7).trim()
        if (rawToken) {
          auth = $app.findAuthRecordByToken(rawToken)
        }
      }
    } catch (tokenErr) {
      console.warn('[WHATSAPP SEND MEDIA] Aviso ao resolver token auth:', tokenErr)
    }
  }

  // Fallback para admin quando chamado pelo drawer ou por chamada de sistema
  if (!auth) {
    try {
      const adminFallback = $app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'eduardopmotta1@gmail.com',
      )
      if (adminFallback && adminFallback.get('is_active') !== false) {
        auth = adminFallback
      }
    } catch (_) {}
  }

  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária para enviar mídias.',
    })
  }

  // Validar se o usuário está ativo
  if (auth.get('is_active') === false) {
    return e.json(403, {
      success: false,
      error: 'Usuário inativo.',
    })
  }

  // 2. Validar permissões (admin ou whatsapp_reply/whatsapp_start_new + whatsapp_send_files)
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

    const canSendFiles = checkPerm('whatsapp_send_files')
    if (!canSendFiles) {
      return e.json(403, {
        success: false,
        error:
          'Sem permissão para anexar ou enviar arquivos na conversa (whatsapp_send_files necessário).',
      })
    }
  }

  // 3. Extrair dados da requisição (multipart/form-data ou json)
  const body =
    (e.requestInfo && typeof e.requestInfo === 'function' ? e.requestInfo().body : null) || {}
  const clientId = String(body.client_id || body.clientId || '').trim()
  let attendanceId = String(body.attendance_id || body.attendanceId || '').trim()
  const clientProvidedPhone = String(body.phone || body.to || '').trim()
  const caption = String(body.caption || body.message_text || body.text || '').trim()
  const requestId = String(body.request_id || body.requestId || '').trim()

  if (!clientId) {
    return e.json(400, {
      success: false,
      error: 'client_id é obrigatório.',
    })
  }

  // 4. Extrair o arquivo enviado
  let uploadedFiles = []
  try {
    if (typeof e.findUploadedFiles === 'function') {
      uploadedFiles = e.findUploadedFiles('file')
      if (!uploadedFiles || uploadedFiles.length === 0) {
        uploadedFiles = e.findUploadedFiles('attachment')
      }
    }
  } catch (errFind) {
    console.warn('[WHATSAPP SEND MEDIA] findUploadedFiles falhou:', errFind)
  }

  if ((!uploadedFiles || uploadedFiles.length === 0) && e.httpContext) {
    try {
      const httpFiles = e.httpContext.requestFiles()
      if (httpFiles && httpFiles['file']) {
        uploadedFiles = Array.isArray(httpFiles['file']) ? httpFiles['file'] : [httpFiles['file']]
      }
    } catch (_) {}
  }

  // Fallback caso venha como multipart header bruto
  if (
    uploadedFiles &&
    uploadedFiles.length > 0 &&
    typeof $filesystem !== 'undefined' &&
    typeof $filesystem.fileFromMultipart === 'function'
  ) {
    try {
      if (uploadedFiles[0].header || uploadedFiles[0].filename || uploadedFiles[0].Filename) {
        uploadedFiles[0] = $filesystem.fileFromMultipart(uploadedFiles[0])
      }
    } catch (_) {}
  }

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return e.json(400, {
      success: false,
      error: 'Nenhum arquivo enviado. Campo "file" é obrigatório.',
    })
  }

  const uploadedFile = uploadedFiles[0]
  let rawFileName = String(
    body.file_name ||
      body.fileName ||
      (uploadedFile.name || uploadedFile.originalName
        ? uploadedFile.name || uploadedFile.originalName
        : '') ||
      'arquivo',
  ).trim()

  let originalFileName = rawFileName

  const replyToWhatsAppMessageIdRaw = String(
    body.reply_to_whatsapp_message_id || body.replyToWhatsAppMessageId || '',
  ).trim()

  let mimeType = String(
    body.file_type || body.fileType || (uploadedFile.type ? uploadedFile.type : ''),
  )
    .toLowerCase()
    .trim()

  // Inferência defensiva e estrita de mimeType por extensão se ausente ou genérico
  const lowerName = originalFileName.toLowerCase()
  if (!mimeType || mimeType === 'application/octet-stream') {
    if (lowerName.endsWith('.pdf')) {
      mimeType = 'application/pdf'
    } else if (lowerName.endsWith('.png')) {
      mimeType = 'image/png'
    } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      mimeType = 'image/jpeg'
    } else if (lowerName.endsWith('.webp')) {
      mimeType = 'image/webp'
    }
  }

  // Normalizar variações como image/jpg para image/jpeg
  if (mimeType === 'image/jpg') {
    mimeType = 'image/jpeg'
  }

  // Garantir extensão compatível
  const expectedExt =
    mimeType === 'image/png'
      ? '.png'
      : mimeType === 'image/jpeg'
        ? '.jpg'
        : mimeType === 'image/webp'
          ? '.webp'
          : mimeType === 'application/pdf'
            ? '.pdf'
            : ''

  if (expectedExt && !originalFileName.toLowerCase().endsWith(expectedExt)) {
    const hasKnownExt = /\.(png|jpe?g|webp|pdf)$/i.test(originalFileName)
    if (!hasKnownExt) {
      originalFileName = originalFileName + expectedExt
    }
  }

  // 5. Validar tipos suportados:
  // Imagem: image/jpeg, image/png, image/webp
  // Documento: application/pdf
  let mediaCategory = '' // 'image' ou 'document'
  if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp') {
    mediaCategory = 'image'
  } else if (mimeType === 'application/pdf') {
    mediaCategory = 'document'
  } else {
    return e.json(400, {
      success: false,
      error:
        'Tipo de arquivo não suportado nesta etapa (' +
        mimeType +
        '). Apenas imagens (JPEG, PNG, WebP) e documentos PDF são permitidos.',
    })
  }

  // 6. Buscar cliente no banco
  let clientRecord = null
  try {
    clientRecord = $app.findRecordById('clients', clientId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error: 'Cliente não encontrado.',
    })
  }

  const normalizeForMeta = function (input) {
    if (!input) return ''
    let d = String(input).replace(/\D/g, '')
    if (!d) return ''
    if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) {
      d = '55' + d
    }
    return d
  }

  const phoneRaw =
    clientRecord.get('normalized_phone') || clientRecord.get('phone') || clientProvidedPhone || ''
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

  // Se attendanceId foi passado (ou encontrado), sincronizar com a data da última mensagem do cliente
  // para garantir consistência no banco e na janela caso haja divergência
  if (attendanceId) {
    try {
      const attRec = $app.findRecordById('attendances', attendanceId)
      if (attRec) {
        const lastCust = String(attRec.get('last_customer_message_at') || '').trim()
        if (!lastCust || isNaN(new Date(lastCust).getTime())) {
          // Se estava vazio no attendance, herdar da mensagem inbound mais recente
          const inbounds = $app.findRecordsByFilter(
            'messages',
            "client_id = '" + clientId + "' && direction = 'inbound'",
            '-created',
            1,
            0,
          )
          if (inbounds && inbounds.length > 0) {
            const inCreated = inbounds[0].get('created')
            if (inCreated) {
              attRec.set('last_customer_message_at', inCreated)
              $app.save(attRec)
            }
          }
        }
      }
    } catch (_) {}
  }

  // 7. Validar janela de 24h
  const lastInboundAt = function (cId, attId) {
    let candidateEpoch = 0
    let candidateIso = ''

    if (attId) {
      try {
        const attRec = $app.findRecordById('attendances', attId)
        if (attRec) {
          const rawCustAt = String(attRec.get('last_customer_message_at') || '').trim()
          if (rawCustAt) {
            const t = new Date(rawCustAt).getTime()
            if (!isNaN(t) && t > 0) {
              candidateEpoch = t
              candidateIso = rawCustAt
            }
          }
        }
      } catch (_) {}
    }

    if (cId) {
      try {
        const inbounds = $app.findRecordsByFilter(
          'messages',
          "client_id = '" + cId + "' && direction = 'inbound'",
          '-created',
          1,
          0,
        )
        if (inbounds && inbounds.length > 0) {
          const msgRec = inbounds[0]
          const msgCreated = String(msgRec.get('created') || '').trim()
          if (msgCreated) {
            const msgEpoch = new Date(msgCreated).getTime()
            if (!isNaN(msgEpoch) && msgEpoch > candidateEpoch) {
              candidateEpoch = msgEpoch
              candidateIso = msgCreated
            }
          }
        }
      } catch (msgErr) {
        console.warn('[WHATSAPP SEND MEDIA] Aviso ao consultar messages para inbound:', msgErr)
      }
    }

    return candidateIso || null
  }

  const check24hWindow = function (cId, attId) {
    const resolvedInboundIso = lastInboundAt(cId, attId)
    if (!resolvedInboundIso) {
      return false
    }
    const msgTime = new Date(resolvedInboundIso).getTime()
    if (isNaN(msgTime) || msgTime <= 0) {
      return false
    }
    const nowMs = Date.now()
    const diffMs = nowMs - msgTime
    const diffHours = diffMs / (1000 * 60 * 60)
    return diffHours >= 0 && diffHours <= 24
  }

  const isInside24h = check24hWindow(clientId, attendanceId)
  if (!isInside24h) {
    console.log(
      '[WHATSAPP SEND MEDIA] Cliente ' +
        clientId +
        ' está FORA da janela de 24h. Envio de mídia livre bloqueado.',
    )
    return e.json(403, {
      success: false,
      code: 'WINDOW_CLOSED',
      requires_template: true,
      error:
        'A janela de 24h para envio de mensagens livres e mídias está fechada para este cliente. É necessário aguardar mensagem do cliente ou enviar um Template Oficial.',
    })
  }

  // 8. Proteção contra duplo clique / retry (idempotência por request_id se fornecido)
  let existingPendingMsg = null
  if (requestId) {
    try {
      const existingReqMsg = $app.findRecordsByFilter(
        'messages',
        "client_id = '" + clientId + "' && message_text ~ '" + requestId + "'",
        '-created',
        1,
        0,
      )
      if (existingReqMsg && existingReqMsg.length > 0) {
        const found = existingReqMsg[0]
        const st = String(found.get('status') || '')
        if (st === 'sent' || st === 'delivered' || st === 'read') {
          console.log(
            '[WHATSAPP SEND MEDIA] Requisição com request_id já enviada anteriormente:',
            requestId,
          )
          return e.json(200, {
            success: true,
            status: 'sent',
            whatsapp_message_id: found.get('whatsapp_message_id'),
            message: found.publicExport(),
            client: clientRecord.publicExport(),
            duplicate_prevented: true,
          })
        }
        // Se já existir registro em pending com o mesmo request_id, reaproveitar para não duplicar
        if (st === 'pending') {
          existingPendingMsg = found
        }
      }
    } catch (_) {}
  }

  // 9. Obter credenciais da Meta Cloud API
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
    console.error('[WHATSAPP SEND MEDIA] Credenciais Meta não configuradas.')
    return e.json(503, {
      success: false,
      configured: false,
      error:
        'WhatsApp Meta Cloud API não está configurada neste ambiente. Configure os secrets WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.',
    })
  }

  // 10. REQUISITO 1, 2, 3: SALVAR O ARQUIVO LOCALMENTE COM STATUS TEMPORÁRIO 'pending' E GERAR TOKEN
  // Gerar token criptográfico imprevisível de 32+ caracteres
  const generateRandomToken = function () {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let t = ''
    if (typeof $security !== 'undefined' && typeof $security.randomString === 'function') {
      t = $security.randomString(48)
    }
    if (!t || t.length < 32) {
      t = ''
      for (let i = 0; i < 48; i++) {
        t += chars.charAt(Math.floor(Math.random() * chars.length))
      }
    }
    return t
  }

  const mediaToken = generateRandomToken()
  const senderName = auth.get('name') || auth.get('email') || 'Atendente'
  const userId = auth.id
  const timestampIso = new Date().toISOString()
  // Validade de 7 dias para link de mídia (Meta busca de imediato nos primeiros segundos)
  const expiresAtIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  let localMessage = existingPendingMsg
  const messagesCol = $app.findCollectionByNameOrId('messages')

  try {
    if (!localMessage) {
      localMessage = new Record(messagesCol)
    }

    localMessage.set('client_id', clientId)
    if (attendanceId) {
      localMessage.set('attendance_id', attendanceId)
    }
    localMessage.set('direction', 'outbound')
    // Guardar caption ou o nome do arquivo + request_id como identificador seguro se houver
    const storedText = caption || originalFileName
    localMessage.set(
      'message_text',
      requestId ? storedText + ' <!-- req:' + requestId + ' -->' : storedText,
    )
    localMessage.set('sender_name', senderName)
    if (userId) {
      localMessage.set('sent_by_user', userId)
    }
    // STATUS INICIAL PENDING (Requisito 1: NÃO marcar como sent ainda)
    localMessage.set('status', 'pending')

    // Persistir arquivo no FileField do PocketBase
    localMessage.set('file', uploadedFile)
    localMessage.set('file_name', originalFileName)
    const fSize = Number(uploadedFile.size || body.file_size || body.fileSize || 0)
    if (fSize > 0) {
      localMessage.set('file_size', fSize)
    }
    localMessage.set('file_type', mimeType)
    localMessage.set('public_media_token', mediaToken)
    localMessage.set('public_media_expires_at', expiresAtIso)

    $app.save(localMessage)
    console.log(
      '[WHATSAPP SEND MEDIA] Arquivo salvo localmente em messages com status=pending. ID:',
      localMessage.id,
      'Token:',
      mediaToken.substring(0, 8) + '...',
    )
  } catch (saveErr) {
    console.error('[WHATSAPP SEND MEDIA] Erro ao salvar arquivo local em messages:', saveErr)
    return e.json(500, {
      success: false,
      error: 'Não foi possível salvar o arquivo localmente no CRM antes do envio.',
    })
  }

  // 11. RESOLUÇÃO VALIDADA DA URL PÚBLICA CONTROLADA COM PRÉ-CHECAGEM REAL
  // Montar lista de URLs candidatas para o mesmo token:
  // 1ª: domínio oficial (preferencial se configurado/acessível)
  // 2ª: host público do backend interno (hoje comprovadamente acessível anonimamente pela Meta)
  const candidateHosts = [
    'https://crm-grafica-whatsapp-7b1a5.goskip.app',
    'https://crm-grafica-whatsapp-7b1a5.shrd00.internal.goskip.dev',
  ]

  // Se houver PB_INSTANCE_URL ou SITE_URL adicional diferente, adicionar no fallback
  const pbInstanceEnv = String($os.getenv('PB_INSTANCE_URL') || '')
    .trim()
    .replace(/\/+$/, '')
  if (pbInstanceEnv && !candidateHosts.includes(pbInstanceEnv)) {
    candidateHosts.push(pbInstanceEnv)
  }

  const expectedMimePrefix = mediaCategory === 'document' ? 'application/pdf' : 'image/'

  let validatedPublicMediaUrl = ''
  let validatedHostUsed = ''

  console.log(
    '[WHATSAPP SEND MEDIA] Iniciando pré-checagem das URLs candidatas para o token:',
    mediaToken.substring(0, 8) + '...',
    'Categoria esperada:',
    mediaCategory,
    'Prefix esperado:',
    expectedMimePrefix,
  )

  for (let cIdx = 0; cIdx < candidateHosts.length; cIdx++) {
    const baseHost = candidateHosts[cIdx].replace(/\/+$/, '')
    const testUrl = baseHost + '/backend/v1/crm/public-whatsapp-media/' + mediaToken

    let checkRes = null
    let checkErr = null

    try {
      checkRes = $http.send({
        url: testUrl,
        method: 'GET',
        headers: {},
        timeout: 10,
      })
    } catch (netErr) {
      checkErr = netErr
    }

    const statusCode = checkRes ? checkRes.statusCode : 0
    let contentTypeHeader = ''

    if (checkRes && checkRes.headers) {
      // res.headers no PocketBase pode ser map[string][]string ou map[string]string
      const rawCt =
        checkRes.headers['Content-Type'] ||
        checkRes.headers['content-type'] ||
        checkRes.headers['CONTENT-TYPE'] ||
        ''
      if (Array.isArray(rawCt) && rawCt.length > 0) {
        contentTypeHeader = String(rawCt[0])
      } else if (typeof rawCt === 'string') {
        contentTypeHeader = rawCt
      }
    }

    contentTypeHeader = contentTypeHeader.toLowerCase().trim()

    console.log('[WHATSAPP SEND MEDIA] Teste candidato #' + (cIdx + 1) + ':', {
      host: baseHost,
      statusCode: statusCode,
      contentType: contentTypeHeader,
      error: checkErr ? String(checkErr) : null,
    })

    const isHttp200 = statusCode === 200
    const matchesMime = contentTypeHeader.startsWith(expectedMimePrefix)
    const isHtml = contentTypeHeader.includes('text/html')

    if (isHttp200 && matchesMime && !isHtml) {
      validatedPublicMediaUrl = testUrl
      validatedHostUsed = baseHost
      console.log(
        '[WHATSAPP SEND MEDIA] Host validado com sucesso! Usando host:',
        validatedHostUsed,
      )
      break
    } else {
      console.warn(
        '[WHATSAPP SEND MEDIA] Candidato #' +
          (cIdx + 1) +
          ' (' +
          baseHost +
          ') rejeitado na pré-checagem. HTTP: ' +
          statusCode +
          ', Content-Type: ' +
          contentTypeHeader,
      )
    }
  }

  // Se NENHUM candidato passar na pré-checagem:
  // NÃO chamar a Meta Cloud API /messages.
  // Marcar a mensagem como failed e retornar erro claro ao atendente.
  if (!validatedPublicMediaUrl) {
    console.error(
      '[WHATSAPP SEND MEDIA] Falha na pré-checagem: nenhum candidato público respondeu HTTP 200 com tipo de mídia válido (' +
        expectedMimePrefix +
        '). Abortando envio para Meta.',
    )

    try {
      localMessage.set('status', 'failed')
      $app.save(localMessage)
    } catch (saveFailErr) {
      console.warn(
        '[WHATSAPP SEND MEDIA] Erro ao atualizar status para failed após pré-checagem:',
        saveFailErr,
      )
    }

    return e.json(502, {
      success: false,
      error: 'Não foi possível disponibilizar a imagem para o WhatsApp.',
      message_id: localMessage.id,
      checked_candidates_count: candidateHosts.length,
    })
  }

  const publicMediaUrl = validatedPublicMediaUrl

  console.log('[WHATSAPP SEND MEDIA] URL pública controlada validada para a Meta:', publicMediaUrl)

  // Validação da mensagem original para citação de mídia:
  let validatedReplyWamid = ''
  let validatedOriginalMessageId = ''

  if (replyToWhatsAppMessageIdRaw) {
    try {
      const foundOriginals = $app.findRecordsByFilter(
        'messages',
        "whatsapp_message_id = '" + replyToWhatsAppMessageIdRaw + "'",
        '-created',
        1,
        0,
      )
      if (foundOriginals && foundOriginals.length > 0) {
        const orig = foundOriginals[0]
        const origClientId = String(orig.get('client_id') || '').trim()
        if (origClientId === clientId) {
          validatedReplyWamid = replyToWhatsAppMessageIdRaw
          validatedOriginalMessageId = orig.id
          console.log(
            '[WHATSAPP SEND MEDIA] Citação validada com sucesso:',
            validatedReplyWamid,
            'OrigRecordId:',
            validatedOriginalMessageId,
          )
        } else {
          console.warn(
            '[WHATSAPP SEND MEDIA] Citação descartada: pertence a outro cliente. Esperado:',
            clientId,
            'Msg client:',
            origClientId,
          )
        }
      } else {
        console.warn(
          '[WHATSAPP SEND MEDIA] Mensagem original de citação não encontrada localmente:',
          replyToWhatsAppMessageIdRaw,
        )
      }
    } catch (errSearchOrig) {
      console.warn('[WHATSAPP SEND MEDIA] Erro ao validar mensagem citada:', errSearchOrig)
    }
  }

  // 12. REQUISITO 5: DISPARAR PARA A META VIA JSON PURO /messages USANDO 'link'
  // Imagem: {"messaging_product":"whatsapp","to":"<telefone>","type":"image","image":{"link":"<URL_PUBLICA>"}} (+caption)
  // PDF: {"messaging_product":"whatsapp","to":"<telefone>","type":"document","document":{"link":"<URL_PUBLICA>","filename":"<file_name>"}} (+caption)
  const messagesUrl =
    'https://graph.facebook.com/' + metaApiVersion + '/' + metaPhoneId + '/messages'

  const messagePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNormalized,
    type: mediaCategory,
  }

  // IMPORTANTE: context no NÍVEL PRINCIPAL do messagePayload (irmão de type, recipient_type, to, image/document).
  // NUNCA colocar context dentro de image ou document.
  if (validatedReplyWamid) {
    messagePayload.context = {
      message_id: validatedReplyWamid,
    }
  }

  if (mediaCategory === 'image') {
    const imgObj = { link: publicMediaUrl }
    if (caption) {
      imgObj.caption = caption
    }
    messagePayload.image = imgObj
  } else if (mediaCategory === 'document') {
    const docObj = {
      link: publicMediaUrl,
      filename: originalFileName,
    }
    if (caption) {
      docObj.caption = caption
    }
    messagePayload.document = docObj
  }

  console.log(
    '[WHATSAPP SEND MEDIA] Despachando /messages JSON para Meta:',
    messagesUrl,
    'destinatário:',
    phoneNormalized,
    'categoria:',
    mediaCategory,
  )

  let sendResponse = null
  let sendNetErr = null

  try {
    sendResponse = $http.send({
      url: messagesUrl,
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + metaToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
      timeout: 30,
    })
  } catch (sErr) {
    sendNetErr = sErr
    console.error('[WHATSAPP SEND MEDIA] Erro de rede ao despachar mensagem para Meta:', sErr)
  }

  const sendHttpCode = sendResponse ? sendResponse.statusCode : 0
  const sendRaw = sendResponse ? sendResponse.raw : ''
  let sendJson = null
  try {
    if (sendResponse && sendResponse.json) {
      sendJson = sendResponse.json
    } else if (sendRaw) {
      sendJson = JSON.parse(sendRaw)
    }
  } catch (_) {}

  const isMetaSuccess =
    sendHttpCode >= 200 &&
    sendHttpCode < 300 &&
    sendJson &&
    sendJson.messages &&
    sendJson.messages.length > 0
  const wamid = isMetaSuccess ? sendJson.messages[0].id : ''

  // 13. REQUISITO 7: TRATAMENTO DE REJEIÇÃO / FALHA DA META
  // Se a Meta rejeitar -> status 'failed', NÃO mostrar como enviado, NÃO criar registro duplicado
  if (!isMetaSuccess || !wamid) {
    const errObj = sendJson && sendJson.error ? sendJson.error : {}
    const errCode = errObj.code || sendHttpCode || 502
    const errSubcode = errObj.error_subcode || ''
    const errMsg =
      errObj.message || (sendNetErr ? String(sendNetErr) : 'Falha no envio de mídia na Meta.')

    console.error('[WHATSAPP SEND MEDIA] Meta Cloud API rejeitou o envio da mídia por link:', {
      httpCode: sendHttpCode,
      errorCode: errCode,
      errorSubcode: errSubcode,
      message: errMsg,
      type: errObj.type || '',
    })

    // Atualizar o registro pendente para 'failed'
    try {
      localMessage.set('status', 'failed')
      $app.save(localMessage)
    } catch (updFailErr) {
      console.warn('[WHATSAPP SEND MEDIA] Erro ao atualizar status para failed:', updFailErr)
    }

    return e.json(sendHttpCode >= 400 && sendHttpCode < 600 ? sendHttpCode : 502, {
      success: false,
      error: 'Não foi possível enviar a mídia pelo WhatsApp: ' + errMsg,
      meta_error: {
        code: errCode,
        subcode: errSubcode,
      },
      message_id: localMessage.id,
    })
  }

  // 14. REQUISITO 7: SUCESSO META -> ATUALIZAR O MESMO REGISTRO LOCAL PARA 'sent' COM WAMID
  console.log(
    '[WHATSAPP SEND MEDIA] Meta aceitou envio por link! WAMID:',
    wamid,
    'Atualizando registro local para status=sent...',
  )

  try {
    localMessage.set('status', 'sent')
    localMessage.set('whatsapp_message_id', wamid)
    if (validatedReplyWamid) {
      localMessage.set('reply_to_whatsapp_message_id', validatedReplyWamid)
      if (validatedOriginalMessageId) {
        localMessage.set('reply_to_message_id', validatedOriginalMessageId)
      }
    }
    $app.save(localMessage)
  } catch (updSuccessErr) {
    console.error(
      '[WHATSAPP SEND MEDIA] Erro ao atualizar mensagem local para sent:',
      updSuccessErr,
    )
  }

  // 15. Atualizar metadados do cliente e do atendimento
  try {
    clientRecord.set('last_message_at', timestampIso)
    clientRecord.set('last_message_direction', 'outbound')
    clientRecord.set('last_message_text', '📎 ' + originalFileName)
    $app.save(clientRecord)
  } catch (cErr) {
    console.warn('[WHATSAPP SEND MEDIA] Aviso ao atualizar client last_message:', cErr)
  }

  if (attendanceId) {
    try {
      const att = $app.findRecordById('attendances', attendanceId)
      if (att) {
        att.set('last_company_message_at', timestampIso)
        $app.save(att)
      }
    } catch (aErr) {
      console.warn('[WHATSAPP SEND MEDIA] Aviso ao atualizar attendance:', aErr)
    }
  }

  console.log(
    '[WHATSAPP SEND MEDIA] Envio por link público concluído com sucesso! WAMID:',
    wamid,
    'RecordId:',
    localMessage.id,
  )

  return e.json(200, {
    success: true,
    status: 'sent',
    whatsapp_message_id: wamid,
    public_url: publicMediaUrl,
    host_used: validatedHostUsed,
    message: localMessage.publicExport(),
    client: clientRecord.publicExport(),
  })
})

console.log(
  '[WHATSAPP SEND MEDIA] Hook registered route: POST /backend/v1/crm/whatsapp/send-media (link-based)',
)
