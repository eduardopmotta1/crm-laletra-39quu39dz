// Debug Validation Hook — v2 SEGURA
// APENAS log, NUNCA modifica request body
// Usa exclusivamente hooks pós-execução

onRecordAfterCreateSuccess(
  (e) => {
    try {
      const record = e.record
      const colName =
        (record && record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const id = record ? record.id : ''
      const body = record ? record.publicExport() : null
      const safe = typeof body === 'object' ? JSON.stringify(body) : String(body || '')
      const msg = 'CREATE ' + colName + ' OK | ' + (id ? 'ID:' + id + ' | ' : '') + 'body: ' + safe
      console.log('[DEBUG]', msg.substring(0, 1000))
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

onRecordAfterUpdateSuccess(
  (e) => {
    try {
      const record = e.record
      const colName =
        (record && record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const id = record ? record.id : ''
      const body = record ? record.publicExport() : null
      const safe = typeof body === 'object' ? JSON.stringify(body) : String(body || '')
      const msg = 'UPDATE ' + colName + ' OK | ' + (id ? 'ID:' + id + ' | ' : '') + 'body: ' + safe
      console.log('[DEBUG]', msg.substring(0, 1000))
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

onRecordAfterDeleteSuccess(
  (e) => {
    try {
      const record = e.record
      const colName =
        (record && record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const id = record ? record.id : ''
      const body = record ? record.publicExport() : null
      const safe = typeof body === 'object' ? JSON.stringify(body) : String(body || '')
      const msg = 'DELETE ' + colName + ' OK | ' + (id ? 'ID:' + id + ' | ' : '') + 'body: ' + safe
      console.log('[DEBUG]', msg.substring(0, 1000))
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

onRecordAfterCreateError(
  (e) => {
    try {
      const colName =
        (e.collection && e.collection.name) ||
        (e.record && e.record.collection && e.record.collection().name) ||
        'unknown'
      const reqBody = (e.requestInfo && e.requestInfo().body) || null
      const errMsg =
        (e.response && e.response.message) ||
        (e.error && e.error.message) ||
        String(e.error || 'unknown')
      const safe = typeof reqBody === 'object' ? JSON.stringify(reqBody) : String(reqBody || '')
      const msg = 'CREATE ' + colName + ' ERROR: ' + errMsg + ' | body: ' + safe
      console.log('[DEBUG]', msg.substring(0, 1000))
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

onRecordAfterUpdateError(
  (e) => {
    try {
      const colName =
        (e.collection && e.collection.name) ||
        (e.record && e.record.collection && e.record.collection().name) ||
        'unknown'
      const reqBody = (e.requestInfo && e.requestInfo().body) || null
      const id = e.record ? e.record.id : ''
      const errMsg =
        (e.response && e.response.message) ||
        (e.error && e.error.message) ||
        String(e.error || 'unknown')
      const safe = typeof reqBody === 'object' ? JSON.stringify(reqBody) : String(reqBody || '')
      const msg =
        'UPDATE ' +
        colName +
        ' ERROR: ' +
        errMsg +
        ' | ' +
        (id ? 'ID:' + id + ' | ' : '') +
        'body: ' +
        safe
      console.log('[DEBUG]', msg.substring(0, 1000))
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

onRecordAfterDeleteError(
  (e) => {
    try {
      const colName =
        (e.collection && e.collection.name) ||
        (e.record && e.record.collection && e.record.collection().name) ||
        'unknown'
      const id = e.record ? e.record.id : ''
      const errMsg =
        (e.response && e.response.message) ||
        (e.error && e.error.message) ||
        String(e.error || 'unknown')
      const msg = 'DELETE ' + colName + ' ERROR: ' + errMsg + ' | ' + (id ? 'ID:' + id : '')
      console.log('[DEBUG]', msg.substring(0, 1000))
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

console.log('[DEBUG VALIDATION] v2 loaded — safe log-only mode')
