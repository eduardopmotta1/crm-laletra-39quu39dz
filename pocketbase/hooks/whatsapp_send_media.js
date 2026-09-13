// WhatsApp Send Media Hook — Envio oficial de mídias (imagem e documento) via WhatsApp Meta Cloud API
// Endpoint autenticado: POST /backend/v1/crm/whatsapp/send-media
// Recebe multipart/form-data: client_id, attendance_id (opcional), phone (opcional), file, file_name, file_type, caption (opcional), request_id (opcional)

console.log('[WHATSAPP SEND MEDIA] Hook initializing...')

routerAdd('POST', '/backend/v1/crm/whatsapp/send-media', (e) => {
  // 1. Validar autenticação (mesmo padrão do endpoint /send)
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
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

  // 3. Extrair dados da requisição (multipart/form-data)
  // No PocketBase v0.23+ routerAdd, e.requestInfo().body contém campos de formulário multipart
  const reqInfo = e.requestInfo()
  const body = reqInfo.body || {}

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
  // No PocketBase JSVM (v0.23+), e.findUploadedFiles('file') retorna um slice []*filesystem.File
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
  // uploadedFile é um filesystem.File do PocketBase
  // Priorizar body.file_name enviado pelo cliente, caso contrário usar name do arquivo
  let rawFileName = String(
    body.file_name ||
      body.fileName ||
      (uploadedFile.name || uploadedFile.originalName
        ? uploadedFile.name || uploadedFile.originalName
        : '') ||
      'arquivo',
  ).trim()

  // Se veio gerado do PocketBase como ex: "captura_de_tela_2026_01_23_145058_dppqren75n.png" ou sem extensão
  let originalFileName = rawFileName

  let mimeType = String(
    body.file_type || body.fileType || (uploadedFile.type ? uploadedFile.type : ''),
  )
    .toLowerCase()
    .trim()

  // Inspecionar leitor e cabeçalhos do uploadedFile
  try {
    let readerType = 'unknown'
    let mhHeader = null
    if (uploadedFile.reader) {
      readerType = typeof uploadedFile.reader
      if (uploadedFile.reader.header) {
        mhHeader = uploadedFile.reader.header
      }
    }
    console.log(
      '[WHATSAPP SEND MEDIA] uploadedFile initial inspect:',
      JSON.stringify({
        name: uploadedFile.name,
        originalName: uploadedFile.originalName,
        size: uploadedFile.size,
        readerType: readerType,
        hasMhHeader: !!mhHeader,
        mhHeaderContentType:
          mhHeader && mhHeader.header ? mhHeader.header.get('Content-Type') : null,
        mhFilename: mhHeader ? mhHeader.filename : null,
      }),
    )
  } catch (initErr) {
    console.log('[WHATSAPP SEND MEDIA] Initial inspect error:', initErr)
  }

  // Inferência defensiva e estrita de mimeType por extensão se ausente ou genérico (ex: application/octet-stream)
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

  // Garantir que a extensão do originalFileName corresponda ao mimeType
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
    // Se não tem a extensão certa, anexar ou corrigir extensão
    const hasKnownExt = /\.(png|jpe?g|webp|pdf)$/i.test(originalFileName)
    if (!hasKnownExt) {
      originalFileName = originalFileName + expectedExt
    }
  }

  // 5. Validar tipos suportados nesta etapa:
  // Imagem: image/jpeg, image/png, image/webp
  // Documento: application/pdf
  // Bloquear áudio, vídeo, sticker e outros
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

  // Resolver telefone do cliente: priorizar clients.normalized_phone, depois clients.phone, depois clientProvidedPhone
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

  // 7. Validar janela de 24h
  // Mesma fonte de verdade: última inbound real do cliente em messages ou attendance.last_customer_message_at
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
        console.log(
          '[WHATSAPP SEND MEDIA] Requisição com request_id duplicado já processada:',
          requestId,
        )
        return e.json(200, {
          success: true,
          status: 'sent',
          whatsapp_message_id: existingReqMsg[0].get('whatsapp_message_id'),
          message: existingReqMsg[0].publicExport(),
          client: clientRecord.publicExport(),
          duplicate_prevented: true,
        })
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

  // 10. UPLOAD PARA META: POST https://graph.facebook.com/{VERSION}/{PHONE_NUMBER_ID}/media
  // multipart/form-data com messaging_product=whatsapp, file=<arquivo>, type=<mime_type>
  // Authorization: Bearer WHATSAPP_ACCESS_TOKEN
  const mediaUploadUrl =
    'https://graph.facebook.com/' + metaApiVersion + '/' + metaPhoneId + '/media'

  console.log(
    '[WHATSAPP SEND MEDIA] Fazendo upload de mídia para Meta:',
    mediaUploadUrl,
    'Arquivo:',
    originalFileName,
    'Mime:',
    mimeType,
  )

  // Inspecionar uploadedFile e garantir nome e reader
  let fileToMeta = uploadedFile
  try {
    console.log(
      '[WHATSAPP SEND MEDIA] uploadedFile details:',
      JSON.stringify({
        name: uploadedFile.name,
        originalName: uploadedFile.originalName,
        size: uploadedFile.size,
      }),
    )

    // Forçar originalName no arquivo para garantir extensão e nome corretos
    try {
      uploadedFile.originalName = originalFileName
    } catch (_) {}
  } catch (inspErr) {
    console.log('[WHATSAPP SEND MEDIA] Inspecao err:', inspErr)
  }

  // Tentar extrair os bytes do arquivo para criar um NewFileFromBytes garantindo que NewFileFromBytes calcule o MIME e extension corretos
  if (typeof $filesystem !== 'undefined' && typeof $filesystem.fileFromBytes === 'function') {
    try {
      let fileBytes = null
      if (typeof toBytes === 'function') {
        let r = null
        if (uploadedFile.reader && typeof uploadedFile.reader.open === 'function') {
          r = uploadedFile.reader.open()
        } else if (typeof uploadedFile.open === 'function') {
          r = uploadedFile.open()
        }
        if (r) {
          try {
            fileBytes = toBytes(r, 0)
          } finally {
            if (r && typeof r.close === 'function') {
              try {
                r.close()
              } catch (_) {}
            }
          }
        }
      }
      if (fileBytes && fileBytes.length > 0) {
        console.log('[WHATSAPP SEND MEDIA] Bytes extraídos com sucesso! Tamanho:', fileBytes.length)
        const reconstructedFile = $filesystem.fileFromBytes(fileBytes, originalFileName)
        fileToMeta = reconstructedFile
      }
    } catch (reconstructErr) {
      console.warn('[WHATSAPP SEND MEDIA] Reconstrução com fileFromBytes falhou:', reconstructErr)
    }
  }

  // Construir FormData com messaging_product, type e file
  const metaFormData = new FormData()
  metaFormData.append('messaging_product', 'whatsapp')
  metaFormData.append('type', mimeType)
  metaFormData.append('file', fileToMeta)

  let uploadResponse = null
  let uploadNetErr = null

  try {
    uploadResponse = $http.send({
      url: mediaUploadUrl,
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + metaToken,
      },
      body: metaFormData,
      timeout: 60,
    })
  } catch (netErr) {
    uploadNetErr = netErr
    console.error('[WHATSAPP SEND MEDIA] Erro de rede ao fazer upload para Meta:', netErr)
  }

  const uploadHttpCode = uploadResponse ? uploadResponse.statusCode : 0
  const uploadRaw = uploadResponse ? uploadResponse.raw : ''
  let uploadJson = null
  try {
    if (uploadResponse && uploadResponse.json) {
      uploadJson = uploadResponse.json
    } else if (uploadRaw) {
      uploadJson = JSON.parse(uploadRaw)
    }
  } catch (_) {}

  const mediaId =
    uploadHttpCode >= 200 && uploadHttpCode < 300 && uploadJson && uploadJson.id
      ? String(uploadJson.id).trim()
      : ''

  if (!mediaId) {
    const errObj = uploadJson && uploadJson.error ? uploadJson.error : {}
    const errCode = errObj.code || uploadHttpCode || 502
    const errSubcode = errObj.error_subcode || ''
    const errMsg =
      errObj.message || (uploadNetErr ? String(uploadNetErr) : 'Falha no upload de mídia na Meta.')

    // Diagnóstico seguro (nunca expor token)
    console.error('[WHATSAPP SEND MEDIA] Falha no upload de mídia na Meta Cloud API:', {
      httpCode: uploadHttpCode,
      errorCode: errCode,
      errorSubcode: errSubcode,
      message: errMsg,
      type: errObj.type || '',
    })

    return e.json(uploadHttpCode >= 400 && uploadHttpCode < 600 ? uploadHttpCode : 502, {
      success: false,
      error:
        'Não foi possível enviar o arquivo: falha ao registrar mídia na Meta Cloud API (' +
        errMsg +
        ').',
      meta_error: {
        code: errCode,
        subcode: errSubcode,
      },
    })
  }

  console.log('[WHATSAPP SEND MEDIA] Upload realizado com sucesso! Media ID:', mediaId)

  // 11. ENVIAR MENSAGEM: POST https://graph.facebook.com/{VERSION}/{PHONE_NUMBER_ID}/messages
  // Para imagem: {"messaging_product":"whatsapp","recipient_type":"individual","to":"<telefone>","type":"image","image":{"id":"<media_id>","caption":"..."}}
  // Para documento: {"messaging_product":"whatsapp","recipient_type":"individual","to":"<telefone>","type":"document","document":{"id":"<media_id>","filename":"<file_name>","caption":"..."}}
  const messagesUrl =
    'https://graph.facebook.com/' + metaApiVersion + '/' + metaPhoneId + '/messages'

  const messagePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNormalized,
    type: mediaCategory,
  }

  if (mediaCategory === 'image') {
    const imgObj = { id: mediaId }
    if (caption) {
      imgObj.caption = caption
    }
    messagePayload.image = imgObj
  } else if (mediaCategory === 'document') {
    const docObj = {
      id: mediaId,
      filename: originalFileName,
    }
    if (caption) {
      docObj.caption = caption
    }
    messagePayload.document = docObj
  }

  console.log(
    '[WHATSAPP SEND MEDIA] Enviando mensagem de mídia para ' +
      phoneNormalized +
      ' tipo ' +
      mediaCategory +
      ' via ' +
      messagesUrl,
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

  // 12. Se Meta rejeitar envio: NÃO criar mensagem local como sent
  if (!isMetaSuccess || !wamid) {
    const errObj = sendJson && sendJson.error ? sendJson.error : {}
    const errCode = errObj.code || sendHttpCode || 502
    const errSubcode = errObj.error_subcode || ''
    const errMsg =
      errObj.message || (sendNetErr ? String(sendNetErr) : 'Falha no envio de mensagem na Meta.')

    console.error('[WHATSAPP SEND MEDIA] Meta Cloud API rejeitou o envio da mídia:', {
      httpCode: sendHttpCode,
      errorCode: errCode,
      errorSubcode: errSubcode,
      message: errMsg,
      type: errObj.type || '',
    })

    return e.json(sendHttpCode >= 400 && sendHttpCode < 600 ? sendHttpCode : 502, {
      success: false,
      error: 'Não foi possível enviar a mídia pelo WhatsApp: ' + errMsg,
      meta_error: {
        code: errCode,
        subcode: errSubcode,
      },
    })
  }

  // 13. PERSISTÊNCIA LOCAL: Criar o registro em messages SOMENTE DEPOIS que a Meta aceitou o envio e retornou WAMID
  console.log(
    '[WHATSAPP SEND MEDIA] Meta aceitou envio! WAMID:',
    wamid,
    'Persistindo no PocketBase...',
  )

  const senderName = auth.get('name') || auth.get('email') || 'Atendente'
  const userId = auth.id
  const timestampIso = new Date().toISOString()

  let savedMessage = null
  try {
    const messagesCol = $app.findCollectionByNameOrId('messages')
    const msgRec = new Record(messagesCol)

    msgRec.set('client_id', clientId)
    if (attendanceId) {
      msgRec.set('attendance_id', attendanceId)
    }
    msgRec.set('direction', 'outbound')
    msgRec.set('message_text', caption || originalFileName)
    msgRec.set('sender_name', senderName)
    if (userId) {
      msgRec.set('sent_by_user', userId)
    }
    msgRec.set('status', 'sent')
    msgRec.set('whatsapp_message_id', wamid)

    // Salvar o arquivo no registro do PocketBase para continuar disponível visualmente no CRM
    // PocketBase v0.23+ espera 'file' ou 'file+' para FileField.
    // Usamos uploadedFile diretamente.
    msgRec.set('file', uploadedFile)
    msgRec.set('file_name', originalFileName)
    const fSize = Number(uploadedFile.size || body.file_size || body.fileSize || 0)
    if (fSize > 0) {
      msgRec.set('file_size', fSize)
    }
    msgRec.set('file_type', mimeType)

    $app.save(msgRec)
    savedMessage = msgRec
  } catch (saveErr) {
    console.error('[WHATSAPP SEND MEDIA] Erro ao persistir registro em messages:', saveErr)
    return e.json(500, {
      success: false,
      error:
        'Mídia enviada para a Meta (WAMID: ' +
        wamid +
        '), mas ocorreu um erro ao salvar registro local.',
      whatsapp_message_id: wamid,
    })
  }

  // 14. Atualizar metadados do cliente e do atendimento
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

  console.log('[WHATSAPP SEND MEDIA] Sucesso completo! WAMID:', wamid, 'RecordId:', savedMessage.id)

  return e.json(200, {
    success: true,
    status: 'sent',
    whatsapp_message_id: wamid,
    media_id: mediaId,
    message: savedMessage.publicExport(),
    client: clientRecord.publicExport(),
  })
})

console.log('[WHATSAPP SEND MEDIA] Hook registered route: POST /backend/v1/crm/whatsapp/send-media')
