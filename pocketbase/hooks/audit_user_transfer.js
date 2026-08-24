// Hook: Manual Audit Logging & User Transfer Endpoint
// POST /api/crm/audit-log -> logs custom actions (e.g. login, export, permission matrices, etc.)
// POST /api/crm/transfer-user-workload -> transfers client attendances and tasks from deactivated user

routerAdd('POST', '/api/crm/audit-log', (e) => {
  const authUser = e.auth
  const body = e.requestInfo().body || {}
  const action = (body.action || '').trim()

  if (!action) {
    return e.json(400, { error: 'Campo action é obrigatório.' })
  }

  try {
    const auditCol = $app.findCollectionByNameOrId('audit_logs')
    const logRec = new Record(auditCol)

    if (authUser) {
      logRec.set('user_id', authUser.id)
      logRec.set('user_name', authUser.getString('name') || authUser.getString('email'))
      logRec.set('user_email', authUser.getString('email'))
    } else {
      logRec.set('user_name', body.user_name || 'Sistema')
    }

    logRec.set('action', action)
    logRec.set('module', body.module || 'geral')
    logRec.set('record_id', body.record_id || '')
    logRec.set('record_title', body.record_title || '')
    logRec.set('details', body.details || '')
    if (body.previous_value) logRec.set('previous_value', body.previous_value)
    if (body.new_value) logRec.set('new_value', body.new_value)
    logRec.set('ip_address', e.requestInfo().remoteIP || '')

    $app.save(logRec)

    return e.json(200, { success: true, id: logRec.id })
  } catch (err) {
    return e.json(500, { error: 'Falha ao gravar log de auditoria: ' + err.message })
  }
})

// Transfer attendances, production orders, tasks and pending items from one user to another
routerAdd(
  'POST',
  '/api/crm/transfer-user-workload',
  (e) => {
    const authUser = e.auth
    if (!authUser || authUser.getString('role_slug') !== 'admin') {
      return e.json(403, {
        error: 'Somente administradores podem transferir carteira de trabalho.',
      })
    }

    const body = e.requestInfo().body || {}
    const fromUserId = (body.from_user_id || '').trim()
    const toUserId = (body.to_user_id || '').trim()
    const deactivateFromUser = body.deactivate_from_user === true

    if (!fromUserId || !toUserId) {
      return e.json(400, { error: 'from_user_id e to_user_id são obrigatórios.' })
    }

    if (fromUserId === toUserId) {
      return e.json(400, { error: 'O usuário de destino deve ser diferente do de origem.' })
    }

    let transferredClientsCount = 0
    let transferredOrdersCount = 0
    let transferredTasksCount = 0
    let fromUserName = ''
    let toUserName = ''

    try {
      const fromUser = $app.findAuthRecordByEmail('_pb_users_auth_', fromUserId)
      fromUserName = fromUser.getString('name') || fromUser.getString('email')
    } catch (_) {
      try {
        const fromUser = $app.findRecordById('_pb_users_auth_', fromUserId)
        fromUserName = fromUser.getString('name') || fromUser.getString('email')
      } catch (_) {}
    }

    try {
      const toUser = $app.findAuthRecordByEmail('_pb_users_auth_', toUserId)
      toUserName = toUser.getString('name') || toUser.getString('email')
    } catch (_) {
      try {
        const toUser = $app.findRecordById('_pb_users_auth_', toUserId)
        toUserName = toUser.getString('name') || toUser.getString('email')
      } catch (_) {}
    }

    // 1. Transfer active clients
    try {
      const clients = $app.findRecordsByFilter(
        'clients',
        'assigned_to = "' + fromUserId + '" && is_archived = false',
        '',
        500,
        0,
      )
      for (let i = 0; i < clients.length; i++) {
        const c = clients[i]
        c.set('assigned_to', toUserId)
        $app.save(c)
        transferredClientsCount++
      }
    } catch (err) {
      console.error('Error transferring clients:', err)
    }

    // 2. Transfer pending tasks
    try {
      const tasks = $app.findRecordsByFilter(
        'tasks',
        'assigned_to = "' + fromUserId + '" && status = "pendente"',
        '',
        500,
        0,
      )
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i]
        t.set('assigned_to', toUserId)
        $app.save(t)
        transferredTasksCount++
      }
    } catch (err) {
      console.error('Error transferring tasks:', err)
    }

    // 3. Transfer open production orders (production_rep_id or sales_rep_id)
    try {
      const ordersSales = $app.findRecordsByFilter(
        'production_orders',
        'sales_rep_id = "' + fromUserId + '" && is_completed = false',
        '',
        500,
        0,
      )
      for (let i = 0; i < ordersSales.length; i++) {
        const o = ordersSales[i]
        o.set('sales_rep_id', toUserId)
        $app.save(o)
        transferredOrdersCount++
      }
    } catch (err) {
      console.error('Error transferring sales orders:', err)
    }

    try {
      const ordersProd = $app.findRecordsByFilter(
        'production_orders',
        'production_rep_id = "' + fromUserId + '" && is_completed = false',
        '',
        500,
        0,
      )
      for (let i = 0; i < ordersProd.length; i++) {
        const o = ordersProd[i]
        o.set('production_rep_id', toUserId)
        $app.save(o)
        transferredOrdersCount++
      }
    } catch (err) {
      console.error('Error transferring prod orders:', err)
    }

    // 4. Optionally deactivate the source user
    if (deactivateFromUser) {
      try {
        const uRec = $app.findRecordById('_pb_users_auth_', fromUserId)
        uRec.set('is_active', false)
        $app.save(uRec)
      } catch (err) {
        console.error('Error deactivating user:', err)
      }
    }

    // 5. Log transfer in audit_logs
    try {
      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const logRec = new Record(auditCol)
      logRec.set('user_id', authUser.id)
      logRec.set('user_name', authUser.getString('name') || authUser.getString('email'))
      logRec.set('user_email', authUser.getString('email'))
      logRec.set('action', 'user_workload_transferred')
      logRec.set('module', 'users')
      logRec.set('record_id', fromUserId)
      logRec.set('record_title', fromUserName)
      logRec.set(
        'details',
        'Transferidos ' +
          transferredClientsCount +
          ' clientes, ' +
          transferredTasksCount +
          ' tarefas e ' +
          transferredOrdersCount +
          ' pedidos para ' +
          toUserName +
          (deactivateFromUser ? ' (usuário desativado)' : ''),
      )
      $app.save(logRec)
    } catch (_) {}

    return e.json(200, {
      success: true,
      transferred_clients: transferredClientsCount,
      transferred_tasks: transferredTasksCount,
      transferred_orders: transferredOrdersCount,
      deactivated: deactivateFromUser,
      from_user: fromUserName,
      to_user: toUserName,
    })
  },
  $apis.requireAuth(),
)
