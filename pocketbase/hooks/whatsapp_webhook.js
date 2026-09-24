/**
 * Webhook handler for incoming WhatsApp messages and status updates
 * Path: /backend/v1/whatsapp/webhook
 * Method: GET (verification) and POST (incoming events)
 *
 * NOTE: Critical fix against concurrency / race conditions (check->create race):
 * When multiple webhooks arrive almost simultaneously or Meta retries,
 * we use:
 * 1. Fast in-memory deduplication of WAMIDs in globalThis.__pb_processedWamids
 * 2. SQLite single-writer atomic transaction ($app.runInTransaction / c.app.runInTransaction)
 * 3. Atomic advisory lock row in SQLite (_concurrency_locks / system_settings)
 * 4. In-transaction re-check of WAMID in messages collection
 * 5. In-transaction resolution and reuse of active attendance for the client
 * 6. In-transaction deal resolution and message persistence
 * 7. Support for reply-to quote context (0.0.243 preserved)
 */

;['/backend/v1/whatsapp/webhook', '/backend/v1/crm/whatsapp-webhook'].forEach((routePath) => {
  routerAdd('GET', routePath, (c) => {
    let mode = ''
    let token = ''
    let challenge = ''

    try {
      if (typeof c.queryParam === 'function') {
        mode = c.queryParam('hub.mode') || ''
        token = c.queryParam('hub.verify_token') || ''
        challenge = c.queryParam('hub.challenge') || ''
      }
    } catch (_) {}

    if (!mode && !token && !challenge) {
      try {
        if (typeof c.requestInfo === 'function') {
          const reqInfo = c.requestInfo()
          const query = (reqInfo && reqInfo.query) || {}
          mode = query['hub.mode'] || ''
          token = query['hub.verify_token'] || ''
          challenge = query['hub.challenge'] || ''
        }
      } catch (_) {}
    }

    let verifyToken = $os.getenv('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || ''
    if (!verifyToken) {
      try {
        const tokenRec = $app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'whatsapp_verify_token',
        )
        if (tokenRec) {
          verifyToken = tokenRec.get('setting_value') || ''
        }
      } catch (_) {}
    }
    if (!verifyToken) {
      verifyToken = 'laletra_webhook_secret'
    }

    if (
      mode === 'subscribe' &&
      (token === verifyToken ||
        token === 'laletra_crm_webhook_2024' ||
        token === 'laletra_webhook_secret')
    ) {
      return c.string(200, challenge)
    }

    return c.string(403, 'Forbidden')
  })

  routerAdd('POST', routePath, (c) => {
    // Global cache on globalThis
    const _processedWamids =
      globalThis.__pb_processedWamids || (globalThis.__pb_processedWamids = new Map())

    function cleanOldWamids() {
      const now = Date.now()
      if (_processedWamids.size > 2000) {
        for (const [key, timestamp] of _processedWamids.entries()) {
          if (now - timestamp > 15 * 60 * 1000) {
            // 15 minutes TTL
            _processedWamids.delete(key)
          }
        }
      }
    }

    function normalizePhone(phone) {
      if (!phone) return ''
      let digits = String(phone).replace(/\D/g, '')
      if (digits.length === 10 || digits.length === 11) {
        digits = '55' + digits
      }
      return digits
    }

    function parseMessageContent(msg) {
      const type = msg.type || 'text'
      switch (type) {
        case 'text':
          return {
            type: 'text',
            content: msg.text ? msg.text.body || '' : '',
          }
        case 'image':
          return {
            type: 'image',
            content: msg.image ? msg.image.caption || '[Imagem]' : '[Imagem]',
            mediaId: msg.image ? msg.image.id : null,
            mediaType: msg.image ? msg.image.mime_type : 'image/jpeg',
            mediaCaption: msg.image ? msg.image.caption || '' : '',
          }
        case 'audio':
          return {
            type: 'audio',
            content: '[Áudio]',
            mediaId: msg.audio ? msg.audio.id : null,
            mediaType: msg.audio ? msg.audio.mime_type : 'audio/ogg',
          }
        case 'document':
          return {
            type: 'document',
            content: msg.document
              ? msg.document.caption || msg.document.filename || '[Documento]'
              : '[Documento]',
            mediaId: msg.document ? msg.document.id : null,
            mediaType: msg.document ? msg.document.mime_type : 'application/pdf',
            mediaCaption: msg.document ? msg.document.caption || '' : '',
            mediaFilename: msg.document ? msg.document.filename || '' : '',
          }
        case 'video':
          return {
            type: 'video',
            content: msg.video ? msg.video.caption || '[Vídeo]' : '[Vídeo]',
            mediaId: msg.video ? msg.video.id : null,
            mediaType: msg.video ? msg.video.mime_type : 'video/mp4',
            mediaCaption: msg.video ? msg.video.caption || '' : '',
          }
        case 'location':
          return {
            type: 'location',
            content: msg.location
              ? `[Localização: ${msg.location.latitude}, ${msg.location.longitude}]`
              : '[Localização]',
          }
        case 'contacts':
          return {
            type: 'contacts',
            content: '[Contato compartilhado]',
          }
        case 'interactive': {
          let interactiveContent = '[Interativo]'
          if (msg.interactive) {
            if (msg.interactive.button_reply) {
              interactiveContent = msg.interactive.button_reply.title || ''
            } else if (msg.interactive.list_reply) {
              interactiveContent = msg.interactive.list_reply.title || ''
            }
          }
          return {
            type: 'interactive',
            content: interactiveContent,
          }
        }
        default:
          return {
            type: 'text',
            content: `[Mensagem: ${type}]`,
          }
      }
    }

    function handleStatusUpdate(status, app) {
      const wamid = status.id
      const newStatus = status.status
      if (!wamid) return

      try {
        const message = app.findFirstRecordByData('messages', 'whatsapp_message_id', wamid)
        if (!message) return

        const validStatuses = ['pending', 'sent', 'delivered', 'read', 'failed']
        if (validStatuses.indexOf(newStatus) !== -1) {
          message.set('status', newStatus)
          app.save(message)
        }
      } catch (_) {
        // not found
      }
    }

    function findOrCreateClient(phone, name, txApp) {
      let client = null
      try {
        client = txApp.findFirstRecordByData('clients', 'phone', phone)
      } catch (_) {
        try {
          const records = txApp.findRecordsByFilter(
            'clients',
            `phone ~ '${phone.slice(-8)}'`,
            '-created',
            1,
            0,
          )
          if (records && records.length > 0) {
            client = records[0]
          }
        } catch (_) {}
      }

      if (client) {
        if (name && (!client.get('name') || client.get('name') === phone)) {
          client.set('name', name)
          try {
            txApp.save(client)
          } catch (_) {}
        }
        return client
      }

      // Create client inside tx
      const clientsCol = txApp.findCollectionByNameOrId('clients')
      const newClient = new Record(clientsCol)
      newClient.set('name', name || phone)
      newClient.set('phone', phone)
      newClient.set('normalized_phone', normalizePhone(phone))
      newClient.set('stage', 'Novo contato')
      newClient.set('priority', 'media')
      newClient.set('is_archived', false)

      try {
        const users = txApp.findRecordsByFilter('users', 'is_active = true', 'created', 1, 0)
        if (users && users.length > 0) {
          newClient.set('assigned_to', users[0].id)
        }
      } catch (_) {}

      txApp.save(newClient)
      return newClient
    }

    function resolveAttendance(clientId, txApp) {
      const attendancesCol = txApp.findCollectionByNameOrId('attendances')

      // 1. Re-check for ANY active attendance for this client: is_archived = false
      let activeAttendances = []
      try {
        activeAttendances = txApp.findRecordsByFilter(
          'attendances',
          `client_id = '${clientId}' && is_archived = false`,
          '-created',
          20,
          0,
        )
      } catch (_) {}

      if (activeAttendances && activeAttendances.length === 1) {
        return activeAttendances[0]
      }

      if (activeAttendances && activeAttendances.length > 1) {
        // Regra 2A.6: Inconsistência histórica detectada. Registrar e resolver deterministicamente pelo mais recente
        const ids = activeAttendances.map((a) => a.id).join(', ')
        console.warn(
          `[Webhook resolveAttendance] Inconsistência histórica: cliente ${clientId} possui ${activeAttendances.length} atendimentos ativos: [${ids}]. Determinismo: mais recente (${activeAttendances[0].id}).`,
        )
        return activeAttendances[0]
      }

      // 2. Regra 2C: Caso de fechamento/produção (ex: caso Gabriela)
      // Se cliente possui ordem de produção em andamento ou recentemente fechada vinculada a um attendance existente:
      // se esse attendance ainda está com is_archived=false (venda em produção), o MESMO attendance continua ativo do cliente!
      try {
        const orders = txApp.findRecordsByFilter(
          'production_orders',
          `client_id = '${clientId}' && is_completed = false && is_archived = false`,
          '-created',
          5,
          0,
        )
        for (const ord of orders) {
          const orderAttendanceId = ord.get('attendance_id')
          if (orderAttendanceId) {
            try {
              const orderAtt = txApp.findRecordById('attendances', orderAttendanceId)
              if (orderAtt && !orderAtt.get('is_archived')) {
                console.log(
                  `[Webhook resolveAttendance] Reutilizando attendance ${orderAtt.id} vinculado à ordem de produção ${ord.id} em andamento.`,
                )
                return orderAtt
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      // 2.1 Também checar archived_deals recentes com continue_attendance = true
      try {
        const recentArchivedDeals = txApp.findRecordsByFilter(
          'archived_deals',
          `client_id = '${clientId}' && reason = 'won'`,
          '-created',
          1,
          0,
        )
        if (recentArchivedDeals && recentArchivedDeals.length > 0) {
          const originalAttendanceId = recentArchivedDeals[0].get('original_attendance_id')
          if (originalAttendanceId) {
            try {
              const prevAtt = txApp.findRecordById('attendances', originalAttendanceId)
              if (prevAtt && !prevAtt.get('is_archived')) {
                console.log(
                  `[Webhook resolveAttendance] Reutilizando attendance ${prevAtt.id} mantido ativo por fechamento ganho com continuação.`,
                )
                return prevAtt
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      // 3. No active attendance found, create ONE new attendance atomically inside tx
      const newAttendance = new Record(attendancesCol)
      newAttendance.set('client_id', clientId)
      newAttendance.set('stage', 'Novo contato')
      newAttendance.set('is_archived', false)
      newAttendance.set('source', 'whatsapp')

      try {
        const client = txApp.findRecordById('clients', clientId)
        if (client && client.get('assigned_to')) {
          newAttendance.set('assigned_to', client.get('assigned_to'))
        }
      } catch (_) {}

      txApp.save(newAttendance)
      return newAttendance
    }

    function resolveDeal(clientId, attendanceId, txApp) {
      if (!txApp) return null

      let dealsCol = null
      try {
        dealsCol = txApp.findCollectionByNameOrId('deals')
      } catch (_) {
        return null
      }
      if (!dealsCol) return null

      // 1. Try to find deal directly for this attendance
      try {
        const deals = txApp.findRecordsByFilter(
          'deals',
          `attendance_id = '${attendanceId}'`,
          '-created',
          1,
          0,
        )
        if (deals && deals.length > 0) {
          return deals[0]
        }
      } catch (_) {}

      // 2. Try to find any active deal for this client
      try {
        const deals = txApp.findRecordsByFilter(
          'deals',
          `client_id = '${clientId}' && is_active = true`,
          '-created',
          1,
          0,
        )
        if (deals && deals.length > 0) {
          return deals[0]
        }
      } catch (_) {}

      // 3. Create deal linked to attendance and client
      try {
        const newDeal = new Record(dealsCol)
        newDeal.set('client_id', clientId)
        newDeal.set('attendance_id', attendanceId)
        newDeal.set('stage', 'Primeiro contato')
        newDeal.set('is_active', true)

        const client = txApp.findRecordById('clients', clientId)
        if (client) {
          newDeal.set('name', client.get('name') || 'Atendimento WhatsApp')
          if (client.get('assigned_to')) {
            newDeal.set('assigned_to', client.get('assigned_to'))
          }
        }

        txApp.save(newDeal)
        return newDeal
      } catch (e) {
        console.warn('Could not create deal record:', e)
        return null
      }
    }

    function acquireClientLock(phone, txApp) {
      // Acquire a per-client mutex row in system_settings inside the transaction.
      // If multiple transactions try to write or update this row, SQLite will serialize them
      // and wait for the busy handler.
      try {
        const lockKey = 'lock_client_' + phone
        let lockRecord = null
        try {
          lockRecord = txApp.findFirstRecordByData('system_settings', 'setting_key', lockKey)
        } catch (_) {}

        const now = new Date().toISOString()
        if (lockRecord) {
          lockRecord.set('setting_value', now)
          txApp.save(lockRecord)
        } else {
          const settingsCol = txApp.findCollectionByNameOrId('system_settings')
          const newLock = new Record(settingsCol)
          newLock.set('setting_key', lockKey)
          newLock.set('setting_value', now)
          newLock.set('description', 'Concurrency lock for client phone: ' + phone)
          txApp.save(newLock)
        }
      } catch (err) {
        // non-fatal if table doesn't support or error, transaction itself ensures SQLite single writer
        console.warn('[Webhook Lock] Advisory lock notice for phone ' + phone + ':', err)
      }
    }

    function handleIncomingMessage(msg, contacts, appInstance) {
      const wamid = msg.id
      const from = msg.from
      const timestamp = msg.timestamp

      if (!from) {
        console.warn('Incoming message without sender phone:', msg)
        return
      }

      // 1. FAST DEDUPLICATION BEFORE ANY RESOLUTION/CREATION:
      // Check in-memory cache
      if (wamid) {
        cleanOldWamids()
        if (_processedWamids.has(wamid)) {
          console.log('[Webhook] Duplicate whatsapp_message_id in memory cache, ignoring:', wamid)
          return
        }
      }

      // 2. CHECK DATABASE FOR DEDUPLICATION OF WAMID BEFORE TRANSACTION:
      if (wamid) {
        try {
          const existingMsg = appInstance.findFirstRecordByData(
            'messages',
            'whatsapp_message_id',
            wamid,
          )
          if (existingMsg) {
            console.log('[Webhook] Message already exists in DB (wamid):', wamid)
            _processedWamids.set(wamid, Date.now())
            return
          }
        } catch (_) {
          // Not found is expected
        }
      }

      // Extract contact name if available
      let contactName = ''
      if (contacts && contacts.length > 0) {
        const contact = contacts.find((ct) => ct.wa_id === from)
        if (contact && contact.profile) {
          contactName = contact.profile.name || ''
        }
      }

      const normalizedPhone = normalizePhone(from)

      // Mark in memory cache immediately
      if (wamid) {
        _processedWamids.set(wamid, Date.now())
      }

      // 3. EXECUTE CRITICAL SECTION INSIDE SQLITE TRANSACTION
      // PocketBase runInTransaction executes an exclusive write transaction.
      // Inside txApp, all operations are serialized.
      try {
        appInstance.runInTransaction((txApp) => {
          // 3.1. Advisory client lock
          if (normalizedPhone) {
            acquireClientLock(normalizedPhone, txApp)
          }

          // 3.2. RE-CHECK WAMID inside transaction to guarantee idempotence against concurrent race
          if (wamid) {
            try {
              const existingMsgInTx = txApp.findFirstRecordByData(
                'messages',
                'whatsapp_message_id',
                wamid,
              )
              if (existingMsgInTx) {
                console.log('[Webhook TX] Message already persisted by concurrent worker:', wamid)
                return
              }
            } catch (_) {
              // Not found
            }
          }

          // 3.3. Find or create client
          const client = findOrCreateClient(normalizedPhone, contactName, txApp)
          if (!client) {
            console.error('Failed to resolve client for:', normalizedPhone)
            return
          }

          // 3.4. Resolve active attendance strictly (reutiliza se existir)
          const attendance = resolveAttendance(client.id, txApp)
          if (!attendance) {
            console.error('Failed to resolve attendance for client:', client.id)
            return
          }

          // 3.5. Resolve deal (Kanban card)
          const deal = resolveDeal(client.id, attendance.id, txApp)

          // 3.6. Parse message content
          const parsed = parseMessageContent(msg)

          // 3.7. Suporte a resposta de mensagem específica (0.0.243 - preservado integralmente)
          let replyToWhatsappMessageId = ''
          let replyToMessageId = ''
          if (msg.context && msg.context.id) {
            replyToWhatsappMessageId = msg.context.id
            try {
              const parentMsg = txApp.findFirstRecordByData(
                'messages',
                'whatsapp_message_id',
                replyToWhatsappMessageId,
              )
              if (parentMsg) {
                replyToMessageId = parentMsg.id
              }
            } catch (_) {}
          }

          // 3.8. Save message record (respeitando o schema estrito da collection messages)
          const messagesCol = txApp.findCollectionByNameOrId('messages')
          const messageRecord = new Record(messagesCol)

          messageRecord.set('attendance_id', attendance.id)
          messageRecord.set('client_id', client.id)
          messageRecord.set('direction', 'inbound')
          messageRecord.set(
            'message_text',
            parsed.content || (parsed.type ? `[${parsed.type}]` : '[Mensagem]'),
          )
          messageRecord.set('sender_name', contactName || client.get('name') || from)
          messageRecord.set('whatsapp_message_id', wamid)
          messageRecord.set('status', 'delivered')

          if (replyToWhatsappMessageId) {
            messageRecord.set('reply_to_whatsapp_message_id', replyToWhatsappMessageId)
          }
          if (replyToMessageId) {
            messageRecord.set('reply_to_message_id', replyToMessageId)
          }

          if (parsed.mediaType) {
            messageRecord.set('file_type', parsed.mediaType)
          }
          if (parsed.mediaFilename) {
            messageRecord.set('file_name', parsed.mediaFilename)
          }

          txApp.save(messageRecord)

          // 3.9. Update attendance and client timestamps / metrics
          const now = new Date().toISOString()
          attendance.set('last_customer_message_at', now)
          txApp.save(attendance)

          client.set('last_message_at', now)
          client.set('last_message_direction', 'inbound')
          client.set('last_message_text', (parsed.content || '').substring(0, 100))
          if (!client.get('stage')) {
            client.set('stage', 'Novo contato')
          }
          client.set('updated', now)
          txApp.save(client)

          if (deal) {
            deal.set('last_contact_at', now)
            txApp.save(deal)
          }

          console.log(
            `[Webhook] Inbound saved for client ${client.id}, attendance ${attendance.id}, msg ${wamid}`,
          )
        })
      } catch (err) {
        // If error occurred, check if message was already committed concurrently
        if (wamid) {
          try {
            const check = appInstance.findFirstRecordByData(
              'messages',
              'whatsapp_message_id',
              wamid,
            )
            if (check) {
              console.log(
                '[Webhook] Recovered from concurrent race, message already committed:',
                wamid,
              )
              return
            }
          } catch (_) {}
        }
        console.error('[Webhook] Error saving inbound message in transaction:', err)
        throw err
      }
    }

    // Parse body safely (PocketBase request context)
    let body = null
    try {
      if (typeof c.requestInfo === 'function') {
        const reqInfo = c.requestInfo()
        body = reqInfo ? reqInfo.data || reqInfo.body : null
      } else if (typeof $apis !== 'undefined' && typeof $apis.requestInfo === 'function') {
        const reqInfo = $apis.requestInfo(c)
        body = reqInfo ? reqInfo.data || reqInfo.body : null
      }
    } catch (_) {}

    if (!body || body.object !== 'whatsapp_business_account') {
      return c.json(400, { error: 'Invalid payload' })
    }

    try {
      const entries = body.entry || []
      const appInstance = c.app || $app

      for (const entry of entries) {
        const changes = entry.changes || []
        for (const change of changes) {
          const value = change.value
          if (!value) continue

          // Handle incoming messages
          if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              handleIncomingMessage(msg, value.contacts, appInstance)
            }
          }

          // Handle message status updates (sent, delivered, read, failed)
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              handleStatusUpdate(status, appInstance)
            }
          }
        }
      }

      return c.json(200, { status: 'success' })
    } catch (error) {
      console.error('Webhook processing error:', error)
      return c.json(500, { error: error.message })
    }
  })
})
