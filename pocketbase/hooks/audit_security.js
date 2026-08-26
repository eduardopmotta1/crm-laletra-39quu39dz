// PocketBase Hook — Segurança e Auditoria CUD
// NUNCA modificar e.requestInfo().body!

// -------------------------------------------------------------
// 1. Endpoint para logs manuais do frontend (ex: login, logout, etc.)
// -------------------------------------------------------------
routerAdd('POST', '/api/crm/audit-log', (e) => {
  try {
    const authRecord = e.auth
    const body = e.requestInfo().body || {}
    const auditLogsCol = $app.findCollectionByNameOrId('audit_logs')
    const logRecord = new Record(auditLogsCol)

    let userId = ''
    let userName = ''
    let userEmail = ''

    if (authRecord) {
      userId = authRecord.id || ''
      userName = authRecord.getString('name') || ''
      userEmail = authRecord.getString('email') || ''
    }

    logRecord.set('user_id', userId)
    logRecord.set('user_name', userName)
    logRecord.set('user_email', userEmail)
    logRecord.set('action', String(body.action || 'custom_action'))
    logRecord.set('module', String(body.module || 'geral'))
    logRecord.set('record_id', String(body.record_id || ''))
    logRecord.set('record_title', String(body.record_title || ''))
    logRecord.set('details', String(body.details || ''))
    if (body.previous_value !== undefined) {
      logRecord.set('previous_value', body.previous_value)
    }
    if (body.new_value !== undefined) {
      logRecord.set('new_value', body.new_value)
    }

    const ip = e.requestInfo().remoteIP || ''
    logRecord.set('ip_address', ip)

    $app.save(logRecord)
    return e.json(200, { success: true, id: logRecord.id })
  } catch (err) {
    console.error('[AUDIT MANUAL ERROR]', err)
    return e.json(500, { error: 'Failed to record audit log' })
  }
})

// -------------------------------------------------------------
// 2. Bloqueio de não-admins para modificar 'roles' e 'users'
// -------------------------------------------------------------
// 2.1 Bloqueio em roles (CREATE)
onRecordCreateRequest((e) => {
  try {
    const auth = e.auth
    if (!auth) {
      throw new ForbiddenError('Apenas administradores podem criar cargos/perfis.')
    }
    const roleSlug = auth.getString('role_slug') || ''
    if (roleSlug !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem criar cargos/perfis.')
    }
  } catch (err) {
    if (err instanceof ForbiddenError) {
      throw err
    }
    throw new ForbiddenError('Permissão negada.')
  }
  return e.next()
}, 'roles')

// 2.2 Bloqueio em roles (UPDATE)
onRecordUpdateRequest((e) => {
  try {
    const auth = e.auth
    if (!auth) {
      throw new ForbiddenError('Apenas administradores podem alterar cargos/perfis.')
    }
    const roleSlug = auth.getString('role_slug') || ''
    if (roleSlug !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem alterar cargos/perfis.')
    }
  } catch (err) {
    if (err instanceof ForbiddenError) {
      throw err
    }
    throw new ForbiddenError('Permissão negada.')
  }
  return e.next()
}, 'roles')

// 2.3 Bloqueio em roles (DELETE)
onRecordDeleteRequest((e) => {
  try {
    const auth = e.auth
    if (!auth) {
      throw new ForbiddenError('Apenas administradores podem excluir cargos/perfis.')
    }
    const roleSlug = auth.getString('role_slug') || ''
    if (roleSlug !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem excluir cargos/perfis.')
    }
  } catch (err) {
    if (err instanceof ForbiddenError) {
      throw err
    }
    throw new ForbiddenError('Permissão negada.')
  }
  return e.next()
}, 'roles')

// 2.4 Bloqueio em users (CREATE)
onRecordCreateRequest((e) => {
  try {
    const auth = e.auth
    if (!auth) {
      throw new ForbiddenError('Apenas administradores podem criar novos usuários.')
    }
    const roleSlug = auth.getString('role_slug') || ''
    if (roleSlug !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem criar novos usuários.')
    }
  } catch (err) {
    if (err instanceof ForbiddenError) {
      throw err
    }
    throw new ForbiddenError('Permissão negada.')
  }
  return e.next()
}, 'users')

// 2.5 Bloqueio em users (UPDATE) - admin pode atualizar qualquer um; usuário pode atualizar a si próprio (ex: perfil/senha)
onRecordUpdateRequest((e) => {
  try {
    const auth = e.auth
    if (!auth) {
      throw new ForbiddenError('Não autenticado.')
    }
    const roleSlug = auth.getString('role_slug') || ''
    const targetUserId = e.record ? e.record.id : ''
    const isSelf = auth.id === targetUserId

    if (roleSlug !== 'admin' && !isSelf) {
      throw new ForbiddenError('Apenas administradores podem alterar dados de outros usuários.')
    }
  } catch (err) {
    if (err instanceof ForbiddenError) {
      throw err
    }
    throw new ForbiddenError('Permissão negada.')
  }
  return e.next()
}, 'users')

// 2.6 Bloqueio em users (DELETE)
onRecordDeleteRequest((e) => {
  try {
    const auth = e.auth
    if (!auth) {
      throw new ForbiddenError('Apenas administradores podem remover usuários.')
    }
    const roleSlug = auth.getString('role_slug') || ''
    if (roleSlug !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem remover usuários.')
    }
  } catch (err) {
    if (err instanceof ForbiddenError) {
      throw err
    }
    throw new ForbiddenError('Permissão negada.')
  }
  return e.next()
}, 'users')

// -------------------------------------------------------------
// 3. Auditoria Automática CUD para coleções do CRM
// Coleções: clients, archived_deals, production_orders, tasks, messages, production_proofs, evaluations, post_sales
// Executa APENAS após o sucesso no banco (onRecordAfterCreateSuccess, onRecordAfterUpdateSuccess, onRecordAfterDeleteSuccess)
// NUNCA modifica request body nem quebra operação principal (tudo em try/catch)
// -------------------------------------------------------------

// 3.1 Pós CREATE
onRecordAfterCreateSuccess(
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord) {
        // Sem usuário autenticado (ex: webhook ou registro público) -> pular para não poluir
        return e.next()
      }

      const record = e.record
      if (!record) {
        return e.next()
      }

      const colName =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const recordId = record.id || ''

      let recordTitle = ''
      if (colName === 'clients') {
        recordTitle = record.getString('name') || ''
      } else if (colName === 'production_orders') {
        recordTitle =
          (record.getString('order_number') || '') +
          ' - ' +
          (record.getString('client_name') || record.getString('product') || '')
      } else if (colName === 'archived_deals') {
        recordTitle =
          (record.getString('client_name') || '') + ' (' + (record.getString('result') || '') + ')'
      } else if (colName === 'tasks') {
        recordTitle = record.getString('title') || ''
      } else if (colName === 'messages') {
        recordTitle = record.getString('sender_name') || ''
      } else if (colName === 'production_proofs') {
        recordTitle = 'Prova v' + (record.getInt('version_number') || 1)
      } else if (colName === 'evaluations') {
        recordTitle = 'Avaliação nota ' + (record.getInt('overall_rating') || '')
      } else if (colName === 'post_sales') {
        recordTitle = 'Pós-venda ' + (record.getString('channel') || '')
      }

      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const log = new Record(auditCol)
      log.set('user_id', authRecord.id)
      log.set('user_name', authRecord.getString('name') || '')
      log.set('user_email', authRecord.getString('email') || '')
      log.set('action', 'create_' + colName)
      log.set('module', colName)
      log.set('record_id', recordId)
      log.set('record_title', recordTitle)
      log.set('details', 'Registro criado em ' + colName)
      log.set('new_value', record.publicExport())

      $app.save(log)
    } catch (err) {
      console.error('[AUDIT CREATE LOG ERROR]', err)
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

// 3.2 Pós UPDATE
onRecordAfterUpdateSuccess(
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord) {
        return e.next()
      }

      const record = e.record
      if (!record) {
        return e.next()
      }

      const colName =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const recordId = record.id || ''

      let recordTitle = ''
      if (colName === 'clients') {
        recordTitle = record.getString('name') || ''
      } else if (colName === 'production_orders') {
        recordTitle =
          (record.getString('order_number') || '') +
          ' - ' +
          (record.getString('client_name') || record.getString('product') || '')
      } else if (colName === 'archived_deals') {
        recordTitle =
          (record.getString('client_name') || '') + ' (' + (record.getString('result') || '') + ')'
      } else if (colName === 'tasks') {
        recordTitle = record.getString('title') || ''
      } else if (colName === 'messages') {
        recordTitle = record.getString('sender_name') || ''
      } else if (colName === 'production_proofs') {
        recordTitle = 'Prova v' + (record.getInt('version_number') || 1)
      } else if (colName === 'evaluations') {
        recordTitle = 'Avaliação nota ' + (record.getInt('overall_rating') || '')
      } else if (colName === 'post_sales') {
        recordTitle = 'Pós-venda ' + (record.getString('channel') || '')
      }

      const originalRecord = record.original()
      const previousExport = originalRecord ? originalRecord.publicExport() : null
      const newExport = record.publicExport()

      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const log = new Record(auditCol)
      log.set('user_id', authRecord.id)
      log.set('user_name', authRecord.getString('name') || '')
      log.set('user_email', authRecord.getString('email') || '')
      log.set('action', 'update_' + colName)
      log.set('module', colName)
      log.set('record_id', recordId)
      log.set('record_title', recordTitle)
      log.set('details', 'Registro atualizado em ' + colName)
      if (previousExport) {
        log.set('previous_value', previousExport)
      }
      log.set('new_value', newExport)

      $app.save(log)
    } catch (err) {
      console.error('[AUDIT UPDATE LOG ERROR]', err)
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

// 3.3 Pós DELETE
onRecordAfterDeleteSuccess(
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord) {
        return e.next()
      }

      const record = e.record
      if (!record) {
        return e.next()
      }

      const colName =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      const recordId = record.id || ''

      let recordTitle = ''
      if (colName === 'clients') {
        recordTitle = record.getString('name') || ''
      } else if (colName === 'production_orders') {
        recordTitle =
          (record.getString('order_number') || '') +
          ' - ' +
          (record.getString('client_name') || record.getString('product') || '')
      } else if (colName === 'archived_deals') {
        recordTitle =
          (record.getString('client_name') || '') + ' (' + (record.getString('result') || '') + ')'
      } else if (colName === 'tasks') {
        recordTitle = record.getString('title') || ''
      } else if (colName === 'messages') {
        recordTitle = record.getString('sender_name') || ''
      } else if (colName === 'production_proofs') {
        recordTitle = 'Prova v' + (record.getInt('version_number') || 1)
      } else if (colName === 'evaluations') {
        recordTitle = 'Avaliação nota ' + (record.getInt('overall_rating') || '')
      } else if (colName === 'post_sales') {
        recordTitle = 'Pós-venda ' + (record.getString('channel') || '')
      }

      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const log = new Record(auditCol)
      log.set('user_id', authRecord.id)
      log.set('user_name', authRecord.getString('name') || '')
      log.set('user_email', authRecord.getString('email') || '')
      log.set('action', 'delete_' + colName)
      log.set('module', colName)
      log.set('record_id', recordId)
      log.set('record_title', recordTitle)
      log.set('details', 'Registro excluído de ' + colName)
      log.set('previous_value', record.publicExport())

      $app.save(log)
    } catch (err) {
      console.error('[AUDIT DELETE LOG ERROR]', err)
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
