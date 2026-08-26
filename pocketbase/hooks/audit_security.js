// Audit & Security Hook — v2 segura
// NUNCA intercepta nem modifica request body

// ===== CONTROLE DE ACESSO =====
// Bloquear não-admins de modificar roles
onRecordCreateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth || !auth.get('role_slug')) {
    throw new ForbiddenError('Apenas administradores podem criar funções')
  }
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem criar funções')
  }
  return e.next()
}, 'roles')

onRecordUpdateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth || !auth.get('role_slug')) {
    throw new ForbiddenError('Apenas administradores podem editar funções')
  }
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem editar funções')
  }
  return e.next()
}, 'roles')

onRecordDeleteRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth || !auth.get('role_slug')) {
    throw new ForbiddenError('Apenas administradores podem excluir funções')
  }
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem excluir funções')
  }
  return e.next()
}, 'roles')

// Bloquear não-admins de modificar usuários (exceto a si mesmo)
onRecordUpdateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }
  // Se for o próprio usuário se atualizando, permite
  if (e.record && auth.id === e.record.id) {
    return e.next()
  }
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem editar outros usuários')
  }
  return e.next()
}, 'users')

onRecordDeleteRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth || auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem excluir usuários')
  }
  return e.next()
}, 'users')

// ===== ENDPOINT AUDIT-LOG MANUAL (para logins e ações manuais do app) =====
routerAdd('POST', '/api/crm/audit-log', (e) => {
  try {
    const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
    const body = e.requestInfo().body || {}
    const coll = $app.findCollectionByNameOrId('audit_logs')
    const rec = new Record(coll)
    rec.set('user_id', auth ? auth.id : null)
    rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
    rec.set('user_email', auth ? auth.get('email') || '' : '')
    rec.set('action', String(body.action || 'custom_action'))
    rec.set('module', String(body.module || 'geral'))
    rec.set('record_id', String(body.record_id || ''))
    rec.set('record_title', String(body.record_title || ''))
    rec.set('details', String(body.details || ''))
    if (body.previous_value !== undefined) {
      rec.set('previous_value', body.previous_value)
    }
    if (body.new_value !== undefined) {
      rec.set('new_value', body.new_value)
    }
    const ip = e.requestInfo().remoteIP || ''
    rec.set('ip_address', ip)
    $app.save(rec)
    return e.json(200, { success: true, id: rec.id })
  } catch (err) {
    return e.json(500, { error: 'Failed to record audit log' })
  }
})

// ===== AUDITORIA (pós-execução, nunca bloqueia) =====
// Registrar CREATES
onRecordAfterCreateSuccess(
  (e) => {
    try {
      const record = e.record
      if (!record) return e.next()
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      const col =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      let title = record.id || ''
      if (col === 'clients') title = record.get('name') || record.id
      else if (col === 'archived_deals') title = record.get('client_name') || record.id
      else if (col === 'production_orders') title = record.get('order_number') || record.id
      else if (col === 'tasks') title = record.get('title') || record.id
      else if (col === 'messages') title = (record.get('message_text') || '').substring(0, 50)
      else if (col === 'production_proofs') title = 'Prova #' + (record.get('version_number') || '')
      else if (col === 'evaluations') title = 'Avaliação ' + record.id
      else if (col === 'post_sales') title = 'Pós-venda ' + record.id

      const coll = $app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(coll)
      rec.set('user_id', auth ? auth.id : null)
      rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
      rec.set('user_email', auth ? auth.get('email') || '' : '')
      rec.set('action', 'create')
      rec.set('module', col)
      rec.set('record_id', record.id || '')
      rec.set('record_title', title || '')
      rec.set('details', 'Registro criado')
      rec.set('previous_value', null)
      rec.set('new_value', record.publicExport())
      rec.set('ip_address', '')
      $app.save(rec)
    } catch (err) {
      console.error('[AUDIT] Failed to log create:', err && err.message ? err.message : err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'tasks',
  'messages',
  'production_proofs',
  'evaluations',
  'post_sales',
)

// Registrar UPDATES (com previous/new)
onRecordAfterUpdateSuccess(
  (e) => {
    try {
      const record = e.record
      if (!record) return e.next()
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      const col =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      let title = record.id || ''
      if (col === 'clients') title = record.get('name') || record.id
      else if (col === 'archived_deals') title = record.get('client_name') || record.id
      else if (col === 'production_orders') title = record.get('order_number') || record.id
      else if (col === 'tasks') title = record.get('title') || record.id
      else if (col === 'messages') title = (record.get('message_text') || '').substring(0, 50)
      else if (col === 'production_proofs') title = 'Prova #' + (record.get('version_number') || '')
      else if (col === 'evaluations') title = 'Avaliação ' + record.id
      else if (col === 'post_sales') title = 'Pós-venda ' + record.id

      const prev = record.original() ? record.original().publicExport() : null
      const curr = record.publicExport()

      const coll = $app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(coll)
      rec.set('user_id', auth ? auth.id : null)
      rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
      rec.set('user_email', auth ? auth.get('email') || '' : '')
      rec.set('action', 'update')
      rec.set('module', col)
      rec.set('record_id', record.id || '')
      rec.set('record_title', title || '')
      rec.set('details', 'Registro atualizado')
      rec.set('previous_value', prev)
      rec.set('new_value', curr)
      rec.set('ip_address', '')
      $app.save(rec)
    } catch (err) {
      console.error('[AUDIT] Failed to log update:', err && err.message ? err.message : err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'tasks',
  'messages',
  'production_proofs',
  'evaluations',
  'post_sales',
)

// Registrar DELETES
onRecordAfterDeleteSuccess(
  (e) => {
    try {
      const record = e.record
      if (!record) return e.next()
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      const col =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      let title = record.id || ''
      if (col === 'clients') title = record.get('name') || record.id
      else if (col === 'archived_deals') title = record.get('client_name') || record.id
      else if (col === 'production_orders') title = record.get('order_number') || record.id
      else if (col === 'tasks') title = record.get('title') || record.id
      else if (col === 'messages') title = (record.get('message_text') || '').substring(0, 50)
      else if (col === 'production_proofs') title = 'Prova #' + (record.get('version_number') || '')
      else if (col === 'evaluations') title = 'Avaliação ' + record.id
      else if (col === 'post_sales') title = 'Pós-venda ' + record.id

      const coll = $app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(coll)
      rec.set('user_id', auth ? auth.id : null)
      rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
      rec.set('user_email', auth ? auth.get('email') || '' : '')
      rec.set('action', 'delete')
      rec.set('module', col)
      rec.set('record_id', record.id || '')
      rec.set('record_title', title || '')
      rec.set('details', 'Registro excluído')
      rec.set('previous_value', record.publicExport())
      rec.set('new_value', null)
      rec.set('ip_address', '')
      $app.save(rec)
    } catch (err) {
      console.error('[AUDIT] Failed to log delete:', err && err.message ? err.message : err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'tasks',
  'messages',
  'production_proofs',
  'evaluations',
  'post_sales',
)

console.log('[AUDIT SECURITY] v2 loaded — safe mode')
