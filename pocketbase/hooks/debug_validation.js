// Debug validation hook to log request payloads for clients, archived_deals, and production_orders
onRecordCreateRequest(
  (e) => {
    try {
      const rawBody =
        e.requestInfo && e.requestInfo().body
          ? JSON.parse(JSON.stringify(e.requestInfo().body))
          : {}
      if (rawBody.phone && typeof rawBody.phone === 'string') {
        const clean = rawBody.phone.replace(/\D/g, '')
        rawBody.phone = '***' + clean.slice(-4)
      }
      if (rawBody.client_phone && typeof rawBody.client_phone === 'string') {
        const clean = rawBody.client_phone.replace(/\D/g, '')
        rawBody.client_phone = '***' + clean.slice(-4)
      }
      console.log(
        '[DEBUG_VALIDATION CREATE]',
        e.collection ? e.collection.name : 'unknown_collection',
        JSON.stringify(rawBody),
      )
    } catch (err) {
      console.log('[DEBUG_VALIDATION CREATE ERR]', err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

onRecordUpdateRequest(
  (e) => {
    try {
      const rawBody =
        e.requestInfo && e.requestInfo().body
          ? JSON.parse(JSON.stringify(e.requestInfo().body))
          : {}
      if (rawBody.phone && typeof rawBody.phone === 'string') {
        const clean = rawBody.phone.replace(/\D/g, '')
        rawBody.phone = '***' + clean.slice(-4)
      }
      if (rawBody.client_phone && typeof rawBody.client_phone === 'string') {
        const clean = rawBody.client_phone.replace(/\D/g, '')
        rawBody.client_phone = '***' + clean.slice(-4)
      }
      console.log(
        '[DEBUG_VALIDATION UPDATE]',
        e.collection ? e.collection.name : 'unknown_collection',
        'ID:',
        e.record ? e.record.id : 'unknown_id',
        JSON.stringify(rawBody),
      )
    } catch (err) {
      console.log('[DEBUG_VALIDATION UPDATE ERR]', err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)
