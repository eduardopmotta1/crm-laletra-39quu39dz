// Server-side date sanitizer and debug validation hook
// Intercepts create/update requests on clients, archived_deals, production_orders and other collections,
// sanitizes any date/datetime strings to standard YYYY-MM-DD format before PocketBase validation,
// logs request payloads, and catches & logs exact PocketBase validation errors.

onRecordCreateRequest(
  (e) => {
    try {
      const colName = e.collection ? e.collection.name : 'unknown_collection'
      const reqInfo = e.requestInfo ? e.requestInfo() : null
      const rawBody = reqInfo && reqInfo.body ? reqInfo.body : null

      if (rawBody && typeof rawBody === 'object') {
        const dateFieldsByCollection = {
          clients: [
            'closed_at',
            'next_action_date',
            'reopened_at',
            'first_purchase_date',
            'last_purchase_date',
            'last_message_at',
          ],
          archived_deals: ['closed_at'],
          production_orders: [
            'sale_date',
            'promised_deadline',
            'estimated_delivery_date',
            'completed_at',
            'art_approved_at',
          ],
          production_proofs: ['sent_at', 'approved_at'],
          post_sales: ['scheduled_date', 'sent_date'],
          evaluations: ['resolved_at'],
          tasks: ['due_date'],
          pending_resolutions: ['item_created_at', 'resolved_at'],
        }

        const targetFields = dateFieldsByCollection[colName] || []
        const body = JSON.parse(JSON.stringify(rawBody))

        for (const field of targetFields) {
          if (field in body && body[field] !== undefined && body[field] !== null) {
            const rawVal = body[field]
            if (typeof rawVal === 'string' && rawVal.trim() !== '') {
              const trimmed = rawVal.trim()
              // Extract YYYY-MM-DD from any format: "YYYY-MM-DD HH:MM:SS.sssZ", "YYYY-MM-DDTHH:MM:SS", etc.
              const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
              if (match) {
                const cleaned = match[1]
                if (cleaned !== trimmed) {
                  console.log(
                    `[DATE_SANITIZER CREATE] Sanitized ${colName}.${field}: "${trimmed}" -> "${cleaned}"`,
                  )
                  body[field] = cleaned
                }
              }
            }
          }
        }

        // Reassign back to requestInfo and event
        if (reqInfo) {
          reqInfo.body = body
        }
        if (e.requestInfo && e.requestInfo()) {
          e.requestInfo().body = body
        }

        // Mask phone numbers for logging
        const logCopy = JSON.parse(JSON.stringify(body))
        if (logCopy.phone && typeof logCopy.phone === 'string') {
          const clean = logCopy.phone.replace(/\D/g, '')
          logCopy.phone = '***' + clean.slice(-4)
        }
        if (logCopy.client_phone && typeof logCopy.client_phone === 'string') {
          const clean = logCopy.client_phone.replace(/\D/g, '')
          logCopy.client_phone = '***' + clean.slice(-4)
        }

        console.log('[DEBUG_VALIDATION CREATE]', colName, JSON.stringify(logCopy))
      }
    } catch (err) {
      console.log('[DEBUG_VALIDATION CREATE ERR]', err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'production_proofs',
  'post_sales',
  'evaluations',
  'tasks',
  'pending_resolutions',
)

onRecordUpdateRequest(
  (e) => {
    try {
      const colName = e.collection ? e.collection.name : 'unknown_collection'
      const recordId = e.record ? e.record.id : 'unknown_id'
      const reqInfo = e.requestInfo ? e.requestInfo() : null
      const rawBody = reqInfo && reqInfo.body ? reqInfo.body : null

      if (rawBody && typeof rawBody === 'object') {
        const dateFieldsByCollection = {
          clients: [
            'closed_at',
            'next_action_date',
            'reopened_at',
            'first_purchase_date',
            'last_purchase_date',
            'last_message_at',
          ],
          archived_deals: ['closed_at'],
          production_orders: [
            'sale_date',
            'promised_deadline',
            'estimated_delivery_date',
            'completed_at',
            'art_approved_at',
          ],
          production_proofs: ['sent_at', 'approved_at'],
          post_sales: ['scheduled_date', 'sent_date'],
          evaluations: ['resolved_at'],
          tasks: ['due_date'],
          pending_resolutions: ['item_created_at', 'resolved_at'],
        }

        const targetFields = dateFieldsByCollection[colName] || []
        const body = JSON.parse(JSON.stringify(rawBody))

        for (const field of targetFields) {
          if (field in body && body[field] !== undefined && body[field] !== null) {
            const rawVal = body[field]
            if (typeof rawVal === 'string' && rawVal.trim() !== '') {
              const trimmed = rawVal.trim()
              const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
              if (match) {
                const cleaned = match[1]
                if (cleaned !== trimmed) {
                  console.log(
                    `[DATE_SANITIZER UPDATE] Sanitized ${colName}.${field} on ${recordId}: "${trimmed}" -> "${cleaned}"`,
                  )
                  body[field] = cleaned
                }
              }
            }
          }
        }

        // Reassign back to requestInfo and event
        if (reqInfo) {
          reqInfo.body = body
        }
        if (e.requestInfo && e.requestInfo()) {
          e.requestInfo().body = body
        }

        // Mask phone numbers for logging
        const logCopy = JSON.parse(JSON.stringify(body))
        if (logCopy.phone && typeof logCopy.phone === 'string') {
          const clean = logCopy.phone.replace(/\D/g, '')
          logCopy.phone = '***' + clean.slice(-4)
        }
        if (logCopy.client_phone && typeof logCopy.client_phone === 'string') {
          const clean = logCopy.client_phone.replace(/\D/g, '')
          logCopy.client_phone = '***' + clean.slice(-4)
        }

        console.log('[DEBUG_VALIDATION UPDATE]', colName, 'ID:', recordId, JSON.stringify(logCopy))
      }
    } catch (err) {
      console.log('[DEBUG_VALIDATION UPDATE ERR]', err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'production_proofs',
  'post_sales',
  'evaluations',
  'tasks',
  'pending_resolutions',
)

onRecordAfterCreateError(
  (e) => {
    try {
      console.log(
        '[CREATE ERROR]',
        e.collection ? e.collection.name : 'unknown_collection',
        'Error:',
        JSON.stringify({
          message: e.error ? e.error.message : undefined,
          status: e.error ? e.error.status : undefined,
          data: e.error ? e.error.data : undefined,
          raw: e.error ? String(e.error) : undefined,
        }),
      )
    } catch (err) {
      console.log('[CREATE ERROR LOGGING ERR]', err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'production_proofs',
  'post_sales',
  'evaluations',
  'tasks',
  'pending_resolutions',
)

onRecordAfterUpdateError(
  (e) => {
    try {
      console.log(
        '[UPDATE ERROR]',
        e.collection ? e.collection.name : 'unknown_collection',
        'Record:',
        e.record ? e.record.id : 'unknown_id',
        'Error:',
        JSON.stringify({
          message: e.error ? e.error.message : undefined,
          status: e.error ? e.error.status : undefined,
          data: e.error ? e.error.data : undefined,
          raw: e.error ? String(e.error) : undefined,
        }),
      )
    } catch (err) {
      console.log('[UPDATE ERROR LOGGING ERR]', err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'production_proofs',
  'post_sales',
  'evaluations',
  'tasks',
  'pending_resolutions',
)
