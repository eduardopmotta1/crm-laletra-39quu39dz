// Automation Background Processor Hook
// Runs every 5 minutes to verify conditions and ensure pending_resolutions are populated

cronAdd('automation_processor', '*/5 * * * *', () => {
  const startTime = Date.now()
  console.log('[AutomationProcessor] Iniciando execução...')

  let totalProcessed = 0
  let waitingCreated = 0
  let quotesCreated = 0
  let followupsCreated = 0
  let proofsCreated = 0
  let ordersCreated = 0
  let evalsCreated = 0
  let activeAutomationsCount = 0
  let runError = null

  try {
    // 1. Load system_settings map for automation thresholds and switches
    const settingsMap = {}
    try {
      const settingsRecords = $app.findRecordsByFilter('system_settings', '', 'setting_key', 100, 0)
      for (let i = 0; i < settingsRecords.length; i++) {
        const k = settingsRecords[i].getString('setting_key')
        const v = settingsRecords[i].getString('setting_value')
        settingsMap[k] = v
      }
    } catch (err) {
      console.error('[AutomationProcessor] Error loading settings:', err)
    }

    // Config thresholds with sensible fallbacks
    const waitingAltaMin = Number(settingsMap['automation_waiting_response_alta_min']) || 15
    const waitingUrgenteMin = Number(settingsMap['automation_waiting_response_urgente_min']) || 60
    const quoteAltaDays = Number(settingsMap['automation_quote_no_return_alta_days']) || 1
    const quoteUrgenteDays = Number(settingsMap['automation_quote_no_return_urgente_days']) || 3
    const followupUrgenteDays = Number(settingsMap['automation_followup_overdue_urgente_days']) || 2
    const proofAltaDays = Number(settingsMap['automation_proof_waiting_alta_days']) || 1
    const proofUrgenteDays = Number(settingsMap['automation_proof_waiting_urgente_days']) || 2
    const orderUrgenteDays = Number(settingsMap['automation_order_overdue_urgente_days']) || 1
    const dissatisfiedUrgenteHours =
      Number(settingsMap['automation_dissatisfied_urgente_hours']) || 24

    const isWaitingEnabled = settingsMap['automation_waiting_response_enabled'] !== 'false'
    const isQuotesEnabled = settingsMap['automation_quote_no_return_enabled'] !== 'false'
    const isFollowupsEnabled = settingsMap['automation_followup_overdue_enabled'] !== 'false'
    const isProofsEnabled = settingsMap['automation_proof_waiting_enabled'] !== 'false'
    const isOrdersEnabled = settingsMap['automation_order_overdue_enabled'] !== 'false'
    const isDissatisfiedEnabled = settingsMap['automation_dissatisfied_enabled'] !== 'false'

    const switchesList = [
      isWaitingEnabled,
      isQuotesEnabled,
      isFollowupsEnabled,
      isProofsEnabled,
      isOrdersEnabled,
      isDissatisfiedEnabled,
    ]
    for (let s = 0; s < switchesList.length; s++) {
      if (switchesList[s]) activeAutomationsCount++
    }

    console.log(
      '[AutomationProcessor] Verificando ' + activeAutomationsCount + ' automações ativas',
    )

    const now = new Date()
    const nowMs = now.getTime()
    const todayDateStr = now.toISOString().split('T')[0]

    // Helper inside callback for Pending Resolution Upsert
    const upsertPendingResolution = (data) => {
      try {
        let existing = null
        try {
          existing = $app.findFirstRecordByData('pending_resolutions', 'item_id', data.itemId)
        } catch (_) {
          // Record doesn't exist
        }

        if (existing) {
          // If already marked resolved, do not recreate
          if (existing.getString('resolved_at')) {
            return false
          }
          // Update priority and time
          existing.set('initial_priority', data.priority || 'normal')
          if (data.itemTitle) existing.set('item_title', data.itemTitle)
          if (data.assignedTo) existing.set('assigned_to', data.assignedTo)
          if (data.assignedName) existing.set('assigned_name', data.assignedName)
          if (data.waitingMinutes !== undefined) {
            existing.set('resolution_time_minutes', data.waitingMinutes)
          }
          $app.save(existing)
          return true
        } else {
          // Create new record
          const pendingCol = $app.findCollectionByNameOrId('pending_resolutions')
          const rec = new Record(pendingCol)
          rec.set('category', data.category)
          rec.set('item_id', data.itemId)
          rec.set('item_title', data.itemTitle || '')
          if (data.clientId) rec.set('client_id', data.clientId)
          rec.set('client_name', data.clientName || '')
          if (data.assignedTo) rec.set('assigned_to', data.assignedTo)
          rec.set('assigned_name', data.assignedName || '')
          rec.set('item_created_at', data.itemCreatedAt || todayDateStr)
          rec.set('initial_priority', data.priority || 'normal')
          rec.set('resolution_time_minutes', data.waitingMinutes || 0)
          rec.set('action_taken', '')
          rec.set('notes', '')
          $app.save(rec)
          return true
        }
      } catch (err) {
        console.error(
          '[AutomationProcessor] Error upserting pending_resolution for ' + data.itemId + ':',
          err,
        )
        return false
      }
    }

    // Helper inside callback for auto-resolving pending items when condition is resolved
    const resolvePendingItem = (itemId, actionTaken) => {
      try {
        let existing = null
        try {
          existing = $app.findFirstRecordByData('pending_resolutions', 'item_id', itemId)
        } catch (_) {}

        if (existing && !existing.getString('resolved_at')) {
          existing.set('resolved_at', todayDateStr)
          existing.set('action_taken', actionTaken || 'Resolvido automaticamente pelo sistema')
          $app.save(existing)
          return true
        }
      } catch (err) {
        console.error('[AutomationProcessor] Error auto-resolving ' + itemId + ':', err)
      }
      return false
    }

    // A) CLIENTES AGUARDANDO RESPOSTA
    if (isWaitingEnabled) {
      try {
        const clients = $app.findRecordsByFilter(
          'clients',
          'is_archived != true && stage != "Venda fechada" && stage != "Não fechou"',
          '-last_message_at',
          200,
          0,
        )

        for (let i = 0; i < clients.length; i++) {
          const c = clients[i]
          const lastMsgAt = c.getString('last_message_at')
          const lastDir = c.getString('last_message_direction')
          const itemId = 'client_reply_' + c.id

          if (lastMsgAt && lastDir === 'inbound') {
            const msgMs = new Date(lastMsgAt).getTime()
            const diffMin = Math.max(0, Math.floor((nowMs - msgMs) / (1000 * 60)))

            if (diffMin >= waitingAltaMin) {
              const priority = diffMin >= waitingUrgenteMin ? 'urgente' : 'alta'
              const lastMsgText = c.getString('last_message_text')
              const subtitle = lastMsgText
                ? '"' + lastMsgText.substring(0, 70) + '"'
                : 'Cliente aguardando resposta no WhatsApp'

              const res = upsertPendingResolution({
                category: 'clients_waiting_response',
                itemId: itemId,
                itemTitle: c.getString('name') + ' - ' + subtitle,
                clientId: c.id,
                clientName: c.getString('name'),
                assignedTo: c.getString('assigned_to'),
                itemCreatedAt: lastMsgAt.split('T')[0],
                priority: priority,
                waitingMinutes: diffMin,
              })
              if (res) waitingCreated++
            }
          } else if (lastDir === 'outbound') {
            // Client was replied to -> Auto resolve pending item
            resolvePendingItem(itemId, 'Cliente respondido via WhatsApp')
          }
        }
      } catch (err) {
        console.error('[AutomationProcessor] Error processing Clientes Aguardando Resposta:', err)
      }
    }
    console.log(
      '[AutomationProcessor] Clientes aguardando: ' +
        waitingCreated +
        ' pendências criadas/atualizadas',
    )

    // B) ORÇAMENTO SEM RETORNO
    if (isQuotesEnabled) {
      try {
        const quoteClients = $app.findRecordsByFilter(
          'clients',
          'is_archived != true && (stage = "Orçamento enviado" || stage = "Aguardando cliente")',
          '-updated',
          200,
          0,
        )

        for (let i = 0; i < quoteClients.length; i++) {
          const c = quoteClients[i]
          const refTimeStr = c.getString('updated') || c.getString('created')
          const refMs = new Date(refTimeStr).getTime()
          const diffDays = Math.max(0, Math.floor((nowMs - refMs) / (1000 * 60 * 60 * 24)))
          const diffMin = Math.max(0, Math.floor((nowMs - refMs) / (1000 * 60)))

          if (diffDays >= quoteAltaDays) {
            const priority = diffDays >= quoteUrgenteDays ? 'urgente' : 'alta'
            const quoteVal = c.get('quote_value')
            const quoteValStr = quoteVal ? 'R$ ' + Number(quoteVal).toFixed(2) : ''
            const prod = c.getString('product_interest') || 'Orçamento'

            const res = upsertPendingResolution({
              category: 'quotes_waiting_return',
              itemId: 'client_quote_' + c.id,
              itemTitle: c.getString('name') + ' - ' + prod + ' ' + quoteValStr,
              clientId: c.id,
              clientName: c.getString('name'),
              assignedTo: c.getString('assigned_to'),
              itemCreatedAt: refTimeStr.split('T')[0],
              priority: priority,
              waitingMinutes: diffMin,
            })
            if (res) quotesCreated++
          }
        }
      } catch (err) {
        console.error('[AutomationProcessor] Error processing Orçamentos sem retorno:', err)
      }
    }
    console.log('[AutomationProcessor] Orçamentos sem retorno: ' + quotesCreated + ' pendências')

    // C) FOLLOW-UP VENCIDO
    if (isFollowupsEnabled) {
      try {
        const tasks = $app.findRecordsByFilter('tasks', 'status = "pendente"', 'due_date', 200, 0)

        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i]
          const dueDateStr = t.getString('due_date')
          const itemId = 'task_' + t.id

          if (dueDateStr && dueDateStr < todayDateStr) {
            const dueMs = new Date(dueDateStr).getTime()
            const diffDays = Math.max(0, Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24)))
            const diffMin = Math.max(0, Math.floor((nowMs - dueMs) / (1000 * 60)))
            const priority = diffDays >= followupUrgenteDays ? 'urgente' : 'alta'

            const res = upsertPendingResolution({
              category: 'overdue_followups',
              itemId: itemId,
              itemTitle: 'Follow-up vencido: ' + t.getString('title'),
              clientId: t.getString('client_id'),
              assignedTo: t.getString('assigned_to'),
              itemCreatedAt: t.getString('created').split('T')[0],
              priority: priority,
              waitingMinutes: diffMin,
            })
            if (res) followupsCreated++
          }
        }

        // Auto-resolve completed tasks
        const completedTasks = $app.findRecordsByFilter(
          'tasks',
          'status = "concluida" && updated >= "' + todayDateStr + '"',
          '-updated',
          100,
          0,
        )
        for (let j = 0; j < completedTasks.length; j++) {
          resolvePendingItem('task_' + completedTasks[j].id, 'Tarefa concluída')
        }
      } catch (err) {
        console.error('[AutomationProcessor] Error processing Follow-ups vencidos:', err)
      }
    }
    console.log('[AutomationProcessor] Follow-ups vencidos: ' + followupsCreated + ' pendências')

    // D) ARTE AGUARDANDO APROVAÇÃO
    if (isProofsEnabled) {
      try {
        const proofs = $app.findRecordsByFilter(
          'production_proofs',
          'status = "aguardando_aprovacao"',
          '-created',
          100,
          0,
        )

        for (let i = 0; i < proofs.length; i++) {
          const p = proofs[i]
          const sentAtStr = p.getString('sent_at') || p.getString('created')
          const sentMs = new Date(sentAtStr).getTime()
          const diffDays = Math.max(0, Math.floor((nowMs - sentMs) / (1000 * 60 * 60 * 24)))
          const diffMin = Math.max(0, Math.floor((nowMs - sentMs) / (1000 * 60)))

          if (diffDays >= proofAltaDays) {
            const priority = diffDays >= proofUrgenteDays ? 'urgente' : 'alta'

            const res = upsertPendingResolution({
              category: 'proofs_waiting_approval',
              itemId: 'proof_' + p.id,
              itemTitle: 'Arte aguardando aprovação v' + p.get('version_number'),
              assignedTo: p.getString('sent_by'),
              itemCreatedAt: sentAtStr.split('T')[0],
              priority: priority,
              waitingMinutes: diffMin,
            })
            if (res) proofsCreated++
          }
        }
      } catch (err) {
        console.error('[AutomationProcessor] Error processing Artes aguardando aprovação:', err)
      }
    }
    console.log('[AutomationProcessor] Artes aguardando: ' + proofsCreated + ' pendências')

    // E) PEDIDO ATRASADO NA PRODUÇÃO
    if (isOrdersEnabled) {
      try {
        const orders = $app.findRecordsByFilter(
          'production_orders',
          'is_completed != true && is_archived != true',
          'promised_deadline',
          200,
          0,
        )

        for (let i = 0; i < orders.length; i++) {
          const o = orders[i]
          const deadlineStr = o.getString('promised_deadline')
          const itemId = 'order_overdue_' + o.id

          if (deadlineStr && deadlineStr.split('T')[0] < todayDateStr) {
            const deadlineMs = new Date(deadlineStr).getTime()
            const diffDays = Math.max(0, Math.floor((nowMs - deadlineMs) / (1000 * 60 * 60 * 24)))
            const diffMin = Math.max(0, Math.floor((nowMs - deadlineMs) / (1000 * 60)))
            const priority = diffDays >= orderUrgenteDays ? 'urgente' : 'alta'

            const res = upsertPendingResolution({
              category: 'orders_overdue',
              itemId: itemId,
              itemTitle:
                'Pedido ' + o.getString('order_number') + ' ATRASADO: ' + o.getString('product'),
              clientId: o.getString('client_id'),
              clientName: o.getString('client_name'),
              assignedTo: o.getString('production_rep_id') || o.getString('sales_rep_id'),
              itemCreatedAt: o.getString('created').split('T')[0],
              priority: priority,
              waitingMinutes: diffMin,
            })
            if (res) ordersCreated++
          } else if (o.get('is_completed') === true) {
            resolvePendingItem(itemId, 'Pedido concluído na produção')
          }
        }
      } catch (err) {
        console.error('[AutomationProcessor] Error processing Pedidos atrasados:', err)
      }
    }
    console.log('[AutomationProcessor] Pedidos atrasados: ' + ordersCreated + ' pendências')

    // F) CLIENTE INSATISFEITO / RECLAMAÇÕES
    if (isDissatisfiedEnabled) {
      try {
        const evals = $app.findRecordsByFilter(
          'evaluations',
          'overall_rating > 0 && overall_rating <= 3 && resolved != true',
          '-created',
          100,
          0,
        )

        for (let i = 0; i < evals.length; i++) {
          const ev = evals[i]
          const createdStr = ev.getString('created')
          const createdMs = new Date(createdStr).getTime()
          const diffHours = Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60)))
          const diffMin = Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60)))
          const priority = diffHours >= dissatisfiedUrgenteHours ? 'urgente' : 'alta'

          const rating = ev.get('overall_rating')
          const comment = ev.getString('comment')
          const subtitle = comment
            ? '"' + comment.substring(0, 50) + '"'
            : 'Avaliação ' + rating + '★'

          const res = upsertPendingResolution({
            category: 'dissatisfied_clients',
            itemId: 'eval_' + ev.id,
            itemTitle: 'Cliente insatisfeito: ' + subtitle,
            clientId: ev.getString('client_id'),
            assignedTo: ev.getString('resolved_by'),
            itemCreatedAt: createdStr.split('T')[0],
            priority: priority,
            waitingMinutes: diffMin,
          })
          if (res) evalsCreated++
        }
      } catch (err) {
        console.error('[AutomationProcessor] Error processing Clientes insatisfeitos:', err)
      }
    }
    console.log('[AutomationProcessor] Clientes insatisfeitos: ' + evalsCreated + ' pendências')

    totalProcessed =
      waitingCreated +
      quotesCreated +
      followupsCreated +
      proofsCreated +
      ordersCreated +
      evalsCreated
  } catch (globalErr) {
    runError = globalErr && globalErr.message ? globalErr.message : String(globalErr)
    console.error('[AutomationProcessor] Global processor execution error:', globalErr)
  }

  const durationMs = Date.now() - startTime
  console.log(
    '[AutomationProcessor] Execução concluída em ' +
      durationMs +
      'ms. Total: ' +
      totalProcessed +
      ' pendências.',
  )

  // Record execution telemetry in system_settings
  const recordTelemetry = (key, val, desc) => {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData('system_settings', 'setting_key', key)
      } catch (_) {}

      if (rec) {
        rec.set('setting_value', String(val))
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', key)
        newRec.set('setting_value', String(val))
        newRec.set('description', desc || '')
        $app.save(newRec)
      }
    } catch (tErr) {
      console.error('[AutomationProcessor] Error saving telemetry key ' + key + ':', tErr)
    }
  }

  const nowIso = new Date().toISOString()
  recordTelemetry(
    'automation_processor_last_run',
    nowIso,
    'Última execução do processador de automações',
  )
  recordTelemetry(
    'automation_processor_last_duration_ms',
    String(durationMs),
    'Duração em ms da última execução do processador',
  )
  recordTelemetry(
    'automation_processor_status',
    runError ? 'error' : 'ok',
    'Status de saúde do processador de automações',
  )
  recordTelemetry(
    'automation_processor_last_error',
    runError || '',
    'Último erro reportado pelo processador de automações',
  )
  recordTelemetry(
    'automation_processor_last_total_items',
    String(totalProcessed),
    'Total de pendências processadas na última execução',
  )
})

console.log('[AUTOMATION PROCESSOR] Hook registered with 5-min cron')
