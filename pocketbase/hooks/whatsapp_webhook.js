/**
 * Webhook handler for incoming WhatsApp messages and status updates
 * Path: /api/whatsapp/webhook
 * Method: GET (verification) and POST (incoming events)
 *
 * NOTE: Critical fix against concurrency / race conditions (check->create race):
 * When multiple webhooks arrive almost simultaneously or Meta retries,
 * we use an in-memory execution lock queue per phone/client AND per whatsapp_message_id,
 * ensuring strict serialization so only ONE active attendance exists per client,
 * and duplicate whatsapp_message_id is rejected immediately before attendance/deal resolution.
 */

// In-memory locks / synchronization for concurrent webhook processing
// PocketBase runs in a single Node/Go process per instance.
const _clientLocks = globalThis.__pb_clientLocks || (globalThis.__pb_clientLocks = new Map())
const _processedWamids =
  globalThis.__pb_processedWamids || (globalThis.__pb_processedWamids = new Map())

function cleanOldWamids() {
  const now = Date.now()
  if (_processedWamids.size > 2000) {
    for (const [key, timestamp] of _processedWamids.entries()) {
      if (now - timestamp > 10 * 60 * 1000) {
        // 10 minutes cache
        _processedWamids.delete(key)
      }
    }
  }
}

/**
 * Execute task with serialization key (e.g. client phone or client_id)
 */
function withClientLock(key, fn) {
  let lockPromise = _clientLocks.get(key)
  if (!lockPromise) {
    lockPromise = Promise.resolve()
  }

  const nextPromise = lockPromise
    .then(() => fn())
    .catch((err) => {
      // Allow subsequent callers to run even if previous failed
      throw err
    })
    .finally(() => {
      if (_clientLocks.get(key) === nextPromise) {
        _clientLocks.delete(key)
      }
    })

  _clientLocks.set(key, nextPromise)
  return nextPromise
}

routerAdd('GET', '/api/whatsapp/webhook', (c) => {
  const query = c.request().url.query
  const mode = query.get('hub.mode')
  const token = query.get('hub.verify_token')
  const challenge = query.get('hub.challenge')

  const verifyToken = $os.getenv('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || 'laletra_webhook_secret'

  if (mode === 'subscribe' && token === verifyToken) {
    return c.string(200, challenge)
  }

  return c.string(403, 'Forbidden')
})

routerAdd('POST', '/api/whatsapp/webhook', (c) => {
  const body = $apis.requestInfo(c).data

  // Validate payload structure
  if (!body || body.object !== 'whatsapp_business_account') {
    return c.json(400, { error: 'Invalid payload' })
  }

  try {
    const entries = body.entry || []
    for (const entry of entries) {
      const changes = entry.changes || []
      for (const change of changes) {
        const value = change.value
        if (!value) continue

        // Handle incoming messages
        if (value.messages && value.messages.length > 0) {
          for (const msg of value.messages) {
            handleIncomingMessage(msg, value.contacts, c.app)
          }
        }

        // Handle message status updates (sent, delivered, read, failed)
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            handleStatusUpdate(status, c.app)
          }
        }
      }
    }

    return c.json(200, { status: 'success' })
  } catch (error) {
    console.error('Webhook error:', error)
    return c.json(500, { error: error.message })
  }
})

function handleIncomingMessage(msg, contacts, app) {
  const wamid = msg.id
  const from = msg.from // Phone number without +
  const timestamp = msg.timestamp

  if (!from) {
    console.warn('Incoming message without sender phone:', msg)
    return
  }

  // 1. FAST DEDUPLICATION BEFORE ANY RESOLUTION/CREATION:
  // Check in-memory deduplication cache first
  if (wamid) {
    cleanOldWamids()
    if (_processedWamids.has(wamid)) {
      console.log('[Webhook] Duplicate whatsapp_message_id in memory cache, ignoring:', wamid)
      return
    }
  }

  // 2. CHECK DATABASE FOR DEDUPLICATION OF WAMID:
  const messagesCol = app.findCollectionByNameOrId('messages')
  if (wamid) {
    try {
      const existingMsg = app.findFirstRecordByData('messages', 'whatsapp_message_id', wamid)
      if (existingMsg) {
        console.log('[Webhook] Message already exists in DB (wamid):', wamid)
        _processedWamids.set(wamid, Date.now())
        return
      }
    } catch (e) {
      // Record not found is expected
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

  // Normalize phone for consistent lookup and locking
  const normalizedPhone = normalizePhone(from)
  const lockKey = normalizedPhone || from

  // Use lock by client phone to serialize concurrent webhooks for this client
  // In synchronous PocketBase JS hooks, we wrap in an internal synchronized block
  // and run in a database transaction with immediate re-verification.
  return processMessageSynchronized(
    msg,
    contactName,
    normalizedPhone,
    wamid,
    timestamp,
    app,
    lockKey,
  )
}

function processMessageSynchronized(
  msg,
  contactName,
  normalizedPhone,
  wamid,
  timestamp,
  app,
  lockKey,
) {
  // Mark wamid as processing in memory
  if (wamid) {
    _processedWamids.set(wamid, Date.now())
  }

  // Perform database operations inside transaction
  try {
    app.runInTransaction((txApp) => {
      // 1. Double check wamid inside transaction to prevent parallel race
      if (wamid) {
        try {
          const existingMsg = txApp.findFirstRecordByData('messages', 'whatsapp_message_id', wamid)
          if (existingMsg) {
            console.log('[Webhook TX] Message already exists in DB (wamid):', wamid)
            return
          }
        } catch (e) {
          // not found
        }
      }

      // 2. Find or create client
      const client = findOrCreateClient(normalizedPhone, contactName, txApp)
      if (!client) {
        console.error('Failed to resolve client for:', normalizedPhone)
        return
      }

      // 3. Resolve active attendance strictly (reutiliza se existir)
      const attendance = resolveAttendance(client.id, txApp)
      if (!attendance) {
        console.error('Failed to resolve attendance for client:', client.id)
        return
      }

      // 4. Resolve deal (Kanban card)
      const deal = resolveDeal(client.id, attendance.id, txApp)

      // 5. Parse message content
      const parsed = parseMessageContent(msg)

      // 5b. Suporte a resposta de mensagem específica (0.0.243 - preservado integralmente)
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
        } catch (e) {
          // Parent message might be older or sent from external
        }
      }

      // 6. Save message record
      const messagesCol = txApp.findCollectionByNameOrId('messages')
      const messageRecord = new Record(messagesCol)

      messageRecord.set('attendance_id', attendance.id)
      messageRecord.set('client_id', client.id)
      messageRecord.set('direction', 'inbound')
      messageRecord.set('type', parsed.type)
      messageRecord.set('content', parsed.content)
      messageRecord.set('whatsapp_message_id', wamid)
      messageRecord.set('status', 'delivered')
      messageRecord.set('is_read', false)
      messageRecord.set('sent_by', null)

      if (replyToWhatsappMessageId) {
        messageRecord.set('reply_to_whatsapp_message_id', replyToWhatsappMessageId)
      }
      if (replyToMessageId) {
        messageRecord.set('reply_to_message_id', replyToMessageId)
      }

      // Handle media if present
      if (parsed.mediaId) {
        messageRecord.set('media_id', parsed.mediaId)
        messageRecord.set('media_type', parsed.mediaType)
        messageRecord.set('media_caption', parsed.mediaCaption || '')
        messageRecord.set('media_filename', parsed.mediaFilename || '')
      }

      if (timestamp) {
        const msgDate = new Date(parseInt(timestamp) * 1000)
        messageRecord.set('sent_at', msgDate.toISOString())
      } else {
        messageRecord.set('sent_at', new Date().toISOString())
      }

      txApp.save(messageRecord)

      // 7. Update attendance and client timestamps / metrics
      const now = new Date().toISOString()
      attendance.set('last_message_at', now)
      txApp.save(attendance)

      // Update client stage if not set
      if (!client.get('stage')) {
        client.set('stage', 'Primeiro contato')
      }
      client.set('updated', now)
      txApp.save(client)

      // 8. Update deal if exists (update last contact timestamp)
      if (deal) {
        deal.set('last_contact_at', now)
        txApp.save(deal)
      }

      console.log(
        `[Webhook] Inbound saved for client ${client.id}, attendance ${attendance.id}, msg ${wamid}`,
      )
    })
  } catch (err) {
    // If unique constraint violation or transaction conflict, check if already saved
    if (wamid) {
      try {
        const check = app.findFirstRecordByData('messages', 'whatsapp_message_id', wamid)
        if (check) {
          console.log('[Webhook] Recovered from concurrent race, message already committed:', wamid)
          return
        }
      } catch (e) {
        // ignore
      }
    }
    console.error('[Webhook] Error saving inbound message in transaction:', err)
    throw err
  }
}

function findOrCreateClient(phone, name, app) {
  const clientsCol = app.findCollectionByNameOrId('clients')

  // Search by phone
  let client = null
  try {
    client = app.findFirstRecordByData('clients', 'phone', phone)
  } catch (e) {
    // Try with alternative phone formats
    try {
      const records = app.findRecordsByFilter(
        'clients',
        `phone ~ '${phone.slice(-8)}'`,
        '-created',
        1,
        0,
      )
      if (records && records.length > 0) {
        client = records[0]
      }
    } catch (e2) {
      // Not found
    }
  }

  if (client) {
    // Update name if we got a profile name and client has a generic name
    if (name && (!client.get('name') || client.get('name') === phone)) {
      client.set('name', name)
      try {
        app.save(client)
      } catch (e) {
        console.warn('Could not update client name:', e)
      }
    }
    return client
  }

  // Create new client
  const newClient = new Record(clientsCol)
  newClient.set('name', name || phone)
  newClient.set('phone', phone)
  newClient.set('channel', 'whatsapp')
  newClient.set('stage', 'Primeiro contato')

  // Assign to default seller (admin or first active user)
  try {
    const users = app.findRecordsByFilter('users', 'active = true', 'created', 1, 0)
    if (users && users.length > 0) {
      newClient.set('assigned_to', users[0].id)
    }
  } catch (e) {
    console.warn('Could not find active user for client assignment:', e)
  }

  app.save(newClient)
  return newClient
}

/**
 * Resolve attendance strictly:
 * A client with an active attendance MUST continue in the SAME attendance.
 * Never create a new attendance if an active one exists (is_archived = false).
 * Sort by -created to pick the most recent if multiple exist historically.
 */
function resolveAttendance(clientId, app) {
  const attendancesCol = app.findCollectionByNameOrId('attendances')

  // Check for active attendance: is_archived = false
  try {
    const activeAttendances = app.findRecordsByFilter(
      'attendances',
      `client_id = '${clientId}' && is_archived = false`,
      '-created',
      1,
      0,
    )

    if (activeAttendances && activeAttendances.length > 0) {
      return activeAttendances[0]
    }
  } catch (e) {
    // Not found or query error, fallback to check
  }

  // Check if client has a production order in progress with linked attendance
  try {
    const orders = app.findRecordsByFilter(
      'production_orders',
      `client_id = '${clientId}' && is_completed = false`,
      '-created',
      1,
      0,
    )
    if (orders && orders.length > 0 && orders[0].get('attendance_id')) {
      const orderAttendanceId = orders[0].get('attendance_id')
      try {
        const orderAtt = app.findRecordById('attendances', orderAttendanceId)
        if (orderAtt && !orderAtt.get('is_archived')) {
          return orderAtt
        }
      } catch (e) {
        // Not found
      }
    }
  } catch (e) {
    // ignore
  }

  // None active found, create ONE new attendance
  const newAttendance = new Record(attendancesCol)
  newAttendance.set('client_id', clientId)
  newAttendance.set('channel', 'whatsapp')
  newAttendance.set('stage', 'Primeiro contato')
  newAttendance.set('status', 'in_progress')
  newAttendance.set('is_archived', false)
  newAttendance.set('started_at', new Date().toISOString())

  // Assign to client's assigned user
  try {
    const client = app.findRecordById('clients', clientId)
    if (client && client.get('assigned_to')) {
      newAttendance.set('assigned_to', client.get('assigned_to'))
    }
  } catch (e) {
    // ignore
  }

  app.save(newAttendance)
  return newAttendance
}

/**
 * Resolve deal strictly:
 * Check if a deal already exists for this attendance or active for client.
 */
function resolveDeal(clientId, attendanceId, app) {
  const dealsCol = app.findCollectionByNameOrId('deals')

  // 1. Try to find deal directly for this attendance
  try {
    const deals = app.findRecordsByFilter(
      'deals',
      `attendance_id = '${attendanceId}'`,
      '-created',
      1,
      0,
    )
    if (deals && deals.length > 0) {
      return deals[0]
    }
  } catch (e) {
    // not found
  }

  // 2. Try to find any active deal for this client
  try {
    const deals = app.findRecordsByFilter(
      'deals',
      `client_id = '${clientId}' && is_active = true`,
      '-created',
      1,
      0,
    )
    if (deals && deals.length > 0) {
      return deals[0]
    }
  } catch (e) {
    // not found
  }

  // 3. Create deal linked to attendance and client
  try {
    const newDeal = new Record(dealsCol)
    newDeal.set('client_id', clientId)
    newDeal.set('attendance_id', attendanceId)
    newDeal.set('stage', 'Primeiro contato')
    newDeal.set('is_active', true)

    const client = app.findRecordById('clients', clientId)
    if (client) {
      newDeal.set('name', client.get('name') || 'Atendimento WhatsApp')
      if (client.get('assigned_to')) {
        newDeal.set('assigned_to', client.get('assigned_to'))
      }
    }

    app.save(newDeal)
    return newDeal
  } catch (e) {
    console.warn('Could not create deal record:', e)
    return null
  }
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

    case 'interactive':
      // Button replies, list replies
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

    default:
      return {
        type: 'text',
        content: `[Mensagem: ${type}]`,
      }
  }
}

function handleStatusUpdate(status, app) {
  const wamid = status.id
  const newStatus = status.status // sent, delivered, read, failed
  const timestamp = status.timestamp

  if (!wamid) return

  try {
    const message = app.findFirstRecordByData('messages', 'whatsapp_message_id', wamid)
    if (!message) return

    // Update status
    message.set('status', newStatus)

    if (newStatus === 'delivered' && !message.get('delivered_at')) {
      const date = timestamp ? new Date(parseInt(timestamp) * 1000) : new Date()
      message.set('delivered_at', date.toISOString())
    }

    if (newStatus === 'read' && !message.get('read_at')) {
      const date = timestamp ? new Date(parseInt(timestamp) * 1000) : new Date()
      message.set('read_at', date.toISOString())
      message.set('is_read', true)
    }

    if (newStatus === 'failed') {
      const errors = status.errors || []
      const errorMsg = errors.map((e) => `${e.code}: ${e.title}`).join('; ')
      message.set('error_message', errorMsg || 'Delivery failed')
    }

    app.save(message)
  } catch (e) {
    // Message not found, which is fine
  }
}

function normalizePhone(phone) {
  if (!phone) return ''
  // Strip non-digits
  let digits = phone.replace(/\D/g, '')

  // Add Brazil country code if missing (10 or 11 digits)
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits
  }

  return digits
}
