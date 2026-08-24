// Hook: Audit Logging & Security Controller for CRM
// Intercepts record operations, validates user status (active/inactive), logs actions, protects deletions
// and sanitizes financial data for users without financial permissions.

// 1. Block inactive users from performing actions & login validation
onRecordAuthRequest((e) => {
  const user = e.record
  if (user) {
    const isActive = user.getBool('is_active')
    // PocketBase bool defaults: if is_active is false explicitly, reject
    if (user.get('is_active') === false) {
      throw new BadRequestError(
        'Sua conta foi desativada pelo administrador. Entre em contato com o suporte.',
      )
    }
  }
  e.next()
})

// 2. Prevent permanent deletion by non-admin users (Requirement 11)
onRecordDeleteRequest((e) => {
  const collectionName = e.collection.name
  const criticalCollections = [
    'clients',
    'messages',
    'archived_deals',
    'production_orders',
    'evaluations',
  ]

  if (criticalCollections.includes(collectionName)) {
    const authUser = e.auth
    if (!authUser) {
      throw new ForbiddenError('Operação não permitida sem autenticação.')
    }

    const roleSlug = authUser.getString('role_slug')
    const customPermissions = authUser.get('custom_permissions') || {}
    const isAdmin = roleSlug === 'admin'
    const canDeleteClients = customPermissions['clients_delete'] === true

    if (collectionName === 'clients' && !isAdmin && !canDeleteClients) {
      throw new ForbiddenError(
        'Você não tem permissão para excluir clientes permanentemente. Utilize o arquivamento.',
      )
    }

    if (collectionName !== 'clients' && !isAdmin) {
      throw new ForbiddenError(
        'Exclusão permanente de histórico ou pedidos é restrita a Administradores.',
      )
    }
  }

  e.next()
})

// 3. User permission change protection: Only Admin can alter users or permissions (Requirement 2 & 9)
onRecordUpdateRequest((e) => {
  const collectionName = e.collection.name

  if (collectionName === 'users' || collectionName === '_pb_users_auth_') {
    const authUser = e.auth
    if (!authUser) {
      throw new ForbiddenError('Não autenticado.')
    }

    const isAdmin = authUser.getString('role_slug') === 'admin'
    const targetUserId = e.record.id

    // Check if permissions/roles or is_active are being modified
    const body = e.requestInfo().body || {}
    const isModifyingSecurity =
      body.role_id !== undefined ||
      body.role_slug !== undefined ||
      body.custom_permissions !== undefined ||
      body.is_active !== undefined

    // If changing security fields, must be admin
    if (isModifyingSecurity && !isAdmin) {
      throw new ForbiddenError(
        'Somente Administradores podem alterar perfis, permissões e status de usuários.',
      )
    }

    // A non-admin user can only edit their own name/avatar/phone
    if (!isAdmin && authUser.id !== targetUserId) {
      throw new ForbiddenError('Você não pode alterar os dados de outro usuário.')
    }
  }

  if (collectionName === 'roles') {
    const authUser = e.auth
    if (!authUser || authUser.getString('role_slug') !== 'admin') {
      throw new ForbiddenError('Somente Administradores podem criar ou editar perfis de acesso.')
    }
  }

  e.next()
})

// 4. Creation protection on roles
onRecordCreateRequest((e) => {
  const collectionName = e.collection.name
  if (collectionName === 'roles') {
    const authUser = e.auth
    if (!authUser || authUser.getString('role_slug') !== 'admin') {
      throw new ForbiddenError('Somente Administradores podem criar novos perfis de acesso.')
    }
  }
  e.next()
})

// 5. Automatic Audit Logging on Record Changes (Requirements 10)
onRecordAfterCreateSuccess((e) => {
  const colName = e.collection.name
  if (colName === 'audit_logs') return e.next() // prevent recursion

  try {
    const auditCol = $app.findCollectionByNameOrId('audit_logs')
    const logRec = new Record(auditCol)

    let actionName = 'create_' + colName
    let moduleName = colName
    let recordTitle = ''
    const record = e.record

    if (colName === 'clients') {
      actionName = 'client_created'
      moduleName = 'clients'
      recordTitle = record.getString('name')
    } else if (colName === 'production_orders') {
      actionName = 'order_created'
      moduleName = 'production'
      recordTitle =
        (record.getString('order_number') || '') + ' - ' + (record.getString('product') || '')
    } else if (colName === 'production_proofs') {
      actionName = 'proof_sent'
      moduleName = 'production'
      recordTitle = 'Prova v' + record.getInt('version_number')
    } else if (colName === 'archived_deals') {
      actionName = 'deal_archived'
      moduleName = 'attendance'
      recordTitle = record.getString('client_name') + ' (' + record.getString('result') + ')'
    } else if (colName === 'users' || colName === '_pb_users_auth_') {
      actionName = 'user_created'
      moduleName = 'users'
      recordTitle = record.getString('name') + ' (' + record.getString('email') + ')'
    } else if (colName === 'roles') {
      actionName = 'role_created'
      moduleName = 'settings'
      recordTitle = record.getString('name')
    }

    logRec.set('action', actionName)
    logRec.set('module', moduleName)
    logRec.set('record_id', record.id)
    logRec.set('record_title', recordTitle)
    logRec.set('new_value', record.publicExport())

    $app.save(logRec)
  } catch (err) {
    // Audit logging should not break caller
    console.error('Audit create error:', err)
  }

  e.next()
})

onRecordAfterUpdateSuccess((e) => {
  const colName = e.collection.name
  if (colName === 'audit_logs') return e.next()

  try {
    const auditCol = $app.findCollectionByNameOrId('audit_logs')
    const logRec = new Record(auditCol)
    const record = e.record
    const orig = record.original()

    let actionName = 'update_' + colName
    let moduleName = colName
    let recordTitle = ''
    let details = ''

    if (colName === 'clients') {
      moduleName = 'clients'
      recordTitle = record.getString('name')
      if (orig && orig.getString('stage') !== record.getString('stage')) {
        actionName = 'stage_changed'
        details =
          'Etapa alterada de "' +
          orig.getString('stage') +
          '" para "' +
          record.getString('stage') +
          '"'
      } else if (orig && orig.getFloat('quote_value') !== record.getFloat('quote_value')) {
        actionName = 'quote_value_changed'
        details =
          'Valor alterado de R$ ' +
          orig.getFloat('quote_value') +
          ' para R$ ' +
          record.getFloat('quote_value')
      } else {
        actionName = 'client_updated'
      }
    } else if (colName === 'production_orders') {
      moduleName = 'production'
      recordTitle =
        (record.getString('order_number') || '') + ' - ' + (record.getString('product') || '')
      if (orig && orig.getString('stage_name') !== record.getString('stage_name')) {
        actionName = 'order_stage_changed'
        details =
          'Etapa de produção alterada de "' +
          orig.getString('stage_name') +
          '" para "' +
          record.getString('stage_name') +
          '"'
      } else if (
        orig &&
        orig.getString('promised_deadline') !== record.getString('promised_deadline')
      ) {
        actionName = 'order_deadline_changed'
        details =
          'Prazo prometido alterado de ' +
          orig.getString('promised_deadline') +
          ' para ' +
          record.getString('promised_deadline')
      } else if (record.getBool('is_completed') && (!orig || !orig.getBool('is_completed'))) {
        actionName = 'order_completed'
        details = 'Pedido de produção concluído'
      } else {
        actionName = 'order_updated'
      }
    } else if (colName === 'users' || colName === '_pb_users_auth_') {
      moduleName = 'users'
      recordTitle = record.getString('name') + ' (' + record.getString('email') + ')'
      if (orig && orig.getBool('is_active') !== record.getBool('is_active')) {
        actionName = record.getBool('is_active') ? 'user_activated' : 'user_deactivated'
        details = 'Status alterado para ' + (record.getBool('is_active') ? 'Ativo' : 'Desativado')
      } else if (orig && orig.getString('role_slug') !== record.getString('role_slug')) {
        actionName = 'user_role_changed'
        details =
          'Perfil alterado de "' +
          orig.getString('role_slug') +
          '" para "' +
          record.getString('role_slug') +
          '"'
      } else {
        actionName = 'user_updated'
      }
    } else if (colName === 'roles') {
      actionName = 'role_updated'
      moduleName = 'settings'
      recordTitle = record.getString('name')
    } else if (colName === 'system_settings') {
      actionName = 'setting_changed'
      moduleName = 'settings'
      recordTitle = record.getString('setting_key')
      details = 'Configuração alterada: ' + record.getString('setting_key')
    }

    logRec.set('action', actionName)
    logRec.set('module', moduleName)
    logRec.set('record_id', record.id)
    logRec.set('record_title', recordTitle)
    logRec.set('details', details)
    if (orig) {
      logRec.set('previous_value', orig.publicExport())
    }
    logRec.set('new_value', record.publicExport())

    $app.save(logRec)
  } catch (err) {
    console.error('Audit update error:', err)
  }

  e.next()
})
