// Minimal ping hook — isolamento de diagnóstico
onRecordUpdateRequest(
  (e) => {
    try {
      const colName = e.collection ? e.collection.name : 'unknown'
      const body = e.requestInfo ? e.requestInfo().body : null
      console.log(
        '[PING UPDATE]',
        colName,
        'ID:',
        e.record ? e.record.id : '?',
        JSON.stringify(body),
      )
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

onRecordCreateRequest(
  (e) => {
    try {
      const colName = e.collection ? e.collection.name : 'unknown'
      const body = e.requestInfo ? e.requestInfo().body : null
      console.log('[PING CREATE]', colName, JSON.stringify(body))
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)
