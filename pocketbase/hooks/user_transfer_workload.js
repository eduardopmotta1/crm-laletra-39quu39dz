// Endpoint: POST /backend/v1/crm/transfer-user-workload
// Desativa usuário preservando integridade histórica e transfere carteira/responsabilidades abertas.

console.log('[USER WORKLOAD TRANSFER] Initializing hook...')

routerAdd('POST', '/backend/v1/crm/transfer-user-workload', (e) => {
  try {
    // 1. AUTORIZAÇÃO: Apenas admin autenticado e ativo
    const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
    if (!auth) {
      return e.json(401, {
        success: false,
        error: 'Autenticação necessária.',
      })
    }

    if (auth.get('is_active') === false) {
      return e.json(403, {
        success: false,
        error: 'Usuário inativo.',
      })
    }

    const roleSlug = auth.get('role_slug') || ''
    if (roleSlug !== 'admin') {
      return e.json(403, {
        success: false,
        error:
          'Acesso restrito: apenas administradores podem transferir carteira ou desativar colaboradores.',
      })
    }

    // 2. PARSE BODY
    const body = e.requestInfo().body || {}
    const fromUserId = String(body.from_user_id || body.source_user_id || '').trim()
    const toUserId = String(body.to_user_id || body.target_user_id || '').trim()
    const deactivateFromUser =
      body.deactivate_from_user !== false && body.deactivateFromUser !== false

    if (!fromUserId) {
      return e.json(400, {
        success: false,
        error: 'Identificador do usuário de origem (from_user_id) não informado.',
      })
    }

    // 3. VALIDAR USUÁRIO DE ORIGEM
    let sourceUser = null
    try {
      sourceUser = $app.findFirstRecordByData('users', 'id', fromUserId)
    } catch (_) {
      return e.json(404, {
        success: false,
        error: 'Usuário de origem não encontrado.',
      })
    }

    // Validar se source == target
    if (toUserId && fromUserId === toUserId) {
      return e.json(400, {
        success: false,
        error: 'O usuário de destino não pode ser o mesmo usuário de origem.',
      })
    }

    // Validar que não é o próprio usuário logado se desativar
    if (deactivateFromUser && fromUserId === auth.id) {
      return e.json(400, {
        success: false,
        error: 'Você não pode desativar seu próprio usuário conectado.',
      })
    }

    // Validar que permaneça pelo menos um admin ativo
    if (deactivateFromUser && sourceUser.get('role_slug') === 'admin') {
      try {
        const activeAdmins = $app.findRecordsByFilter(
          'users',
          'role_slug = "admin" && is_active = true && id != "' + fromUserId + '"',
          'created',
          10,
          0,
        )
        if (!activeAdmins || activeAdmins.length === 0) {
          return e.json(400, {
            success: false,
            error: 'Operação cancelada: o sistema precisa manter ao menos um administrador ativo.',
          })
        }
      } catch (errAdmin) {
        console.error('[USER WORKLOAD TRANSFER] Erro ao checar admins ativos:', errAdmin)
      }
    }

    // 4. VALIDAR USUÁRIO DESTINO (QUANDO INFORMADO)
    let targetUser = null
    if (toUserId) {
      try {
        targetUser = $app.findFirstRecordByData('users', 'id', toUserId)
      } catch (_) {
        return e.json(404, {
          success: false,
          error: 'Usuário de destino não encontrado.',
        })
      }

      if (targetUser.get('is_active') === false) {
        return e.json(400, {
          success: false,
          error: 'O usuário de destino está inativo e não pode receber atendimentos ou tarefas.',
        })
      }
    }

    // 5. SE NÃO HOUVER DESTINO: VERIFICAR RESPONSABILIDADES ABERTAS
    if (!toUserId) {
      // Verificar se existem pendências/atendimentos abertos
      const openClients = $app.findRecordsByFilter(
        'clients',
        'assigned_to = "' + fromUserId + '" && is_archived = false',
        'created',
        1,
        0,
      )
      const openTasks = $app.findRecordsByFilter(
        'tasks',
        'assigned_to = "' + fromUserId + '" && status != "concluida" && status != "cancelada"',
        'created',
        1,
        0,
      )
      const openAttendances = $app.findRecordsByFilter(
        'attendances',
        'assigned_to = "' + fromUserId + '" && is_archived = false',
        'created',
        1,
        0,
      )
      const openOrders = $app.findRecordsByFilter(
        'production_orders',
        '(sales_rep_id = "' +
          fromUserId +
          '" || production_rep_id = "' +
          fromUserId +
          '") && is_completed = false && is_archived = false',
        'created',
        1,
        0,
      )
      const openPendingRes = $app.findRecordsByFilter(
        'pending_resolutions',
        'assigned_to = "' + fromUserId + '" && (resolved_at = "" || resolved_at = null)',
        'created',
        1,
        0,
      )

      const hasOpenResponsibilities =
        (openClients && openClients.length > 0) ||
        (openTasks && openTasks.length > 0) ||
        (openAttendances && openAttendances.length > 0) ||
        (openOrders && openOrders.length > 0) ||
        (openPendingRes && openPendingRes.length > 0)

      if (hasOpenResponsibilities) {
        return e.json(400, {
          success: false,
          error:
            'O colaborador possui atendimentos, pedidos ou tarefas em aberto. Selecione um colaborador destino para transferir a carteira antes de desativar.',
        })
      }

      // Se não há responsabilidades abertas e deve apenas desativar
      if (deactivateFromUser) {
        sourceUser.set('is_active', false)
        $app.save(sourceUser)

        // Registrar auditoria
        try {
          const auditCol = $app.findCollectionByNameOrId('audit_logs')
          if (auditCol) {
            const auditRec = new Record(auditCol)
            auditRec.set('user_id', auth.id)
            auditRec.set('user_name', auth.get('name') || auth.get('email') || '')
            auditRec.set('user_email', auth.get('email') || '')
            auditRec.set('action', 'user_deactivate')
            auditRec.set('module', 'users')
            auditRec.set('record_id', fromUserId)
            auditRec.set(
              'record_title',
              sourceUser.get('name') || sourceUser.get('email') || fromUserId,
            )
            auditRec.set(
              'details',
              'Usuário desativado sem necessidade de transferência (nenhuma responsabilidade ativa aberta).',
            )
            auditRec.set('ip_address', e.requestInfo().remoteIP || '')
            $app.save(auditRec)
          }
        } catch (audErr) {
          console.warn('[USER WORKLOAD TRANSFER] Falha ao registrar log de auditoria:', audErr)
        }

        return e.json(200, {
          success: true,
          transferred_clients: 0,
          transferred_tasks: 0,
          transferred_orders: 0,
          transferred_attendances: 0,
          transferred_pending_resolutions: 0,
          deactivated: true,
          message: 'Usuário desativado com sucesso (sem registros abertos para transferir).',
        })
      }

      return e.json(200, {
        success: true,
        transferred_clients: 0,
        transferred_tasks: 0,
        transferred_orders: 0,
        transferred_attendances: 0,
        transferred_pending_resolutions: 0,
        deactivated: false,
      })
    }

    // 6. EXECUÇÃO ATÔMICA DA TRANSFERÊNCIA
    let countClients = 0
    let countTasks = 0
    let countOrders = 0
    let countAttendances = 0
    let countPending = 0
    let countProcedures = 0

    $app.runInTransaction((txApp) => {
      // 6.1 Clients abertos / ativos
      const clients = txApp.findRecordsByFilter(
        'clients',
        'assigned_to = "' + fromUserId + '" && is_archived = false',
        'created',
        5000,
        0,
      )
      if (clients && clients.length > 0) {
        for (let i = 0; i < clients.length; i++) {
          clients[i].set('assigned_to', toUserId)
          txApp.save(clients[i])
          countClients++
        }
      }

      // 6.2 Tasks pendentes (não concluídas e não canceladas)
      const tasks = txApp.findRecordsByFilter(
        'tasks',
        'assigned_to = "' + fromUserId + '" && status != "concluida" && status != "cancelada"',
        'created',
        5000,
        0,
      )
      if (tasks && tasks.length > 0) {
        for (let i = 0; i < tasks.length; i++) {
          tasks[i].set('assigned_to', toUserId)
          txApp.save(tasks[i])
          countTasks++
        }
      }

      // 6.3 Attendances abertos
      const attendances = txApp.findRecordsByFilter(
        'attendances',
        'assigned_to = "' + fromUserId + '" && is_archived = false',
        'created',
        5000,
        0,
      )
      if (attendances && attendances.length > 0) {
        for (let i = 0; i < attendances.length; i++) {
          attendances[i].set('assigned_to', toUserId)
          txApp.save(attendances[i])
          countAttendances++
        }
      }

      // 6.4 Production Orders ativas (sales_rep_id ou production_rep_id)
      const orders = txApp.findRecordsByFilter(
        'production_orders',
        '(sales_rep_id = "' +
          fromUserId +
          '" || production_rep_id = "' +
          fromUserId +
          '") && is_completed = false && is_archived = false',
        'created',
        5000,
        0,
      )
      if (orders && orders.length > 0) {
        for (let i = 0; i < orders.length; i++) {
          let orderChanged = false
          if (orders[i].get('sales_rep_id') === fromUserId) {
            orders[i].set('sales_rep_id', toUserId)
            orderChanged = true
          }
          if (orders[i].get('production_rep_id') === fromUserId) {
            orders[i].set('production_rep_id', toUserId)
            orderChanged = true
          }
          if (orderChanged) {
            txApp.save(orders[i])
            countOrders++
          }
        }
      }

      // 6.5 Pending Resolutions não resolvidas
      const pendingRes = txApp.findRecordsByFilter(
        'pending_resolutions',
        'assigned_to = "' + fromUserId + '" && (resolved_at = "" || resolved_at = null)',
        'created',
        5000,
        0,
      )
      if (pendingRes && pendingRes.length > 0) {
        const targetName = targetUser.get('name') || targetUser.get('email') || ''
        for (let i = 0; i < pendingRes.length; i++) {
          pendingRes[i].set('assigned_to', toUserId)
          if (targetName) {
            pendingRes[i].set('assigned_name', targetName)
          }
          txApp.save(pendingRes[i])
          countPending++
        }
      }

      // 6.6 Procedure Executions pendentes (assigned_to_user_id)
      try {
        const procExecs = txApp.findRecordsByFilter(
          'procedure_executions',
          'assigned_to_user_id = "' + fromUserId + '" && status = "Pendente"',
          'created',
          5000,
          0,
        )
        if (procExecs && procExecs.length > 0) {
          for (let i = 0; i < procExecs.length; i++) {
            procExecs[i].set('assigned_to_user_id', toUserId)
            txApp.save(procExecs[i])
            countProcedures++
          }
        }
      } catch (_) {}

      // 6.7 Desativação do usuário de origem no final da transação
      if (deactivateFromUser) {
        const sourceRecordInTx = txApp.findFirstRecordByData('users', 'id', fromUserId)
        sourceRecordInTx.set('is_active', false)
        txApp.save(sourceRecordInTx)
      }

      // 6.8 Registro de Auditoria dentro ou logo após a transação
      const auditCol = txApp.findCollectionByNameOrId('audit_logs')
      if (auditCol) {
        const auditRec = new Record(auditCol)
        auditRec.set('user_id', auth.id)
        auditRec.set('user_name', auth.get('name') || auth.get('email') || '')
        auditRec.set('user_email', auth.get('email') || '')
        auditRec.set('action', 'user_workload_transfer')
        auditRec.set('module', 'users')
        auditRec.set('record_id', fromUserId)
        auditRec.set(
          'record_title',
          (sourceUser.get('name') || sourceUser.get('email') || fromUserId) +
            ' -> ' +
            (targetUser.get('name') || targetUser.get('email') || toUserId),
        )
        auditRec.set(
          'details',
          'Transferência de carteira concluída com sucesso. ' +
            'Destino: ' +
            (targetUser.get('name') || targetUser.get('email') || toUserId) +
            '. Clientes: ' +
            countClients +
            ', Tarefas: ' +
            countTasks +
            ', Pedidos: ' +
            countOrders +
            ', Atendimentos: ' +
            countAttendances +
            ', Pendências: ' +
            countPending +
            (countProcedures > 0 ? ', Rotinas: ' + countProcedures : '') +
            '. Origem desativado: ' +
            (deactivateFromUser ? 'SIM' : 'NÃO') +
            '.',
        )
        auditRec.set('previous_value', {
          source_user_id: fromUserId,
          source_user_name: sourceUser.get('name') || '',
          source_is_active: true,
        })
        auditRec.set('new_value', {
          target_user_id: toUserId,
          target_user_name: targetUser.get('name') || '',
          source_is_active: !deactivateFromUser,
          transferred_counts: {
            clients: countClients,
            tasks: countTasks,
            orders: countOrders,
            attendances: countAttendances,
            pending_resolutions: countPending,
            procedure_executions: countProcedures,
          },
        })
        auditRec.set('ip_address', e.requestInfo().remoteIP || '')
        txApp.save(auditRec)
      }
    })

    console.log(
      '[USER WORKLOAD TRANSFER] Concluído com sucesso de ' +
        fromUserId +
        ' para ' +
        toUserId +
        ': ' +
        countClients +
        ' clientes, ' +
        countTasks +
        ' tarefas, ' +
        countOrders +
        ' pedidos.',
    )

    return e.json(200, {
      success: true,
      transferred_clients: countClients,
      transferred_tasks: countTasks,
      transferred_orders: countOrders,
      transferred_attendances: countAttendances,
      transferred_pending_resolutions: countPending,
      transferred_procedures: countProcedures,
      deactivated: deactivateFromUser,
      message: 'Carteira transferida e colaborador desativado com sucesso.',
    })
  } catch (err) {
    console.error('[USER WORKLOAD TRANSFER] Erro crítico:', err && err.message ? err.message : err)
    return e.json(500, {
      success: false,
      error:
        'Falha interna ao transferir carteira: ' + (err && err.message ? err.message : String(err)),
    })
  }
})

console.log('[USER WORKLOAD TRANSFER] Hook registered successfully')
