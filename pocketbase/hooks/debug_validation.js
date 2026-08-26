// PocketBase Hook — Debug & Validação SEGURO (Apenas Log Pós-Operação)
// REGRAS DE OURO:
// - NUNCA modificar e.requestInfo().body (PROIBIDO e.requestInfo().body = ...)
// - NUNCA sanitizar, alterar, inserir ou remover campos
// - NUNCA bloquear requisições — sempre chamar e.next()
// - Apenas LOGAR: collection, operação, record ID, campos, erro retornado
// - Usar onRecordAfterCreateSuccess, onRecordAfterUpdateSuccess, onRecordAfterDeleteSuccess
// - Usar onRecordAfterCreateError, onRecordAfterUpdateError, onRecordAfterDeleteError
// - NUNCA usar onRecordCreateRequest ou onRecordUpdateRequest (que interceptavam o body)

// -------------------------------------------------------------
// PÓS-SUCESSO
// -------------------------------------------------------------

// 1. CREATE SUCESSO
onRecordAfterCreateSuccess(
  (e) => {
    try {
      const record = e.record
      const colName =
        (record && record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const recordId = record ? record.id : 'unknown'
      const fields = record ? record.publicExport() : {}

      console.log(
        '[DEBUG] CREATE ' +
          colName +
          ' OK: {id: "' +
          recordId +
          '", fields: ' +
          JSON.stringify(fields) +
          '}',
      )
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

// 2. UPDATE SUCESSO
onRecordAfterUpdateSuccess(
  (e) => {
    try {
      const record = e.record
      const colName =
        (record && record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const recordId = record ? record.id : 'unknown'
      const fields = record ? record.publicExport() : {}

      console.log(
        '[DEBUG] UPDATE ' +
          colName +
          ' OK: {id: "' +
          recordId +
          '", fields: ' +
          JSON.stringify(fields) +
          '}',
      )
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

// 3. DELETE SUCESSO
onRecordAfterDeleteSuccess(
  (e) => {
    try {
      const record = e.record
      const colName =
        (record && record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const recordId = record ? record.id : 'unknown'

      console.log('[DEBUG] DELETE ' + colName + ' OK: {id: "' + recordId + '"}')
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

// -------------------------------------------------------------
// PÓS-ERRO
// -------------------------------------------------------------

// 4. CREATE ERRO
onRecordAfterCreateError(
  (e) => {
    try {
      const colName =
        (e.collection && e.collection.name) ||
        (e.record && e.record.collection && e.record.collection().name) ||
        'unknown'
      const errMessage = (e.error && e.error.message) || String(e.error || 'unknown_error')
      console.log('[DEBUG] CREATE ' + colName + ' ERROR: {err: "' + errMessage + '"}')
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

// 5. UPDATE ERRO
onRecordAfterUpdateError(
  (e) => {
    try {
      const colName =
        (e.collection && e.collection.name) ||
        (e.record && e.record.collection && e.record.collection().name) ||
        'unknown'
      const recordId = e.record ? e.record.id : 'unknown'
      const errMessage = (e.error && e.error.message) || String(e.error || 'unknown_error')
      console.log(
        '[DEBUG] UPDATE ' + colName + ' ERROR: {id: "' + recordId + '", err: "' + errMessage + '"}',
      )
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)

// 6. DELETE ERRO
onRecordAfterDeleteError(
  (e) => {
    try {
      const colName =
        (e.collection && e.collection.name) ||
        (e.record && e.record.collection && e.record.collection().name) ||
        'unknown'
      const recordId = e.record ? e.record.id : 'unknown'
      const errMessage = (e.error && e.error.message) || String(e.error || 'unknown_error')
      console.log(
        '[DEBUG] DELETE ' + colName + ' ERROR: {id: "' + recordId + '", err: "' + errMessage + '"}',
      )
    } catch (_) {}
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
)
