// Automation Background Processor Hook
// Runs every 5 minutes to verify conditions and ensure pending_resolutions are populated

cronAdd('automation_processor', '* * * * *', () => {
  const startTime = Date.now()
  console.log('[AutomationProcessor] Iniciando execução...')

  // Submissão real única e segura dos 8 templates oficiais na Meta
  try {
    let alreadyDone = false
    try {
      const checkRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'meta_submission_result_real',
      )
      if (checkRec) {
        alreadyDone = true
      }
    } catch (_) {}

    if (!alreadyDone) {
      let metaToken = $os.getenv('WHATSAPP_ACCESS_TOKEN') || ''
      let metaWabaId = $os.getenv('WHATSAPP_BUSINESS_ACCOUNT_ID') || ''
      const metaApiVersion = $os.getenv('WHATSAPP_GRAPH_API_VERSION') || 'v21.0'

      if (!metaToken) {
        try {
          const tokenRec = $app.findFirstRecordByData(
            'system_settings',
            'setting_key',
            'whatsapp_access_token',
          )
          const val = tokenRec ? tokenRec.get('setting_value') : ''
          if (val && !val.includes('DEMO')) metaToken = val
        } catch (_) {}
      }

      if (!metaWabaId) {
        try {
          const wabaRec = $app.findFirstRecordByData(
            'system_settings',
            'setting_key',
            'whatsapp_business_account_id',
          )
          const val = wabaRec ? wabaRec.get('setting_value') : ''
          if (val && !val.includes('DEMO')) metaWabaId = String(val).trim()
        } catch (_) {}
      }

      const templatesToSubmit = [
        {
          name: 'pedido_recebido',
          category: 'UTILITY',
          language: 'pt_BR',
          text: 'Olá {{1}}! Recebemos o seu pedido {{2}} e ele já entrou em nosso fluxo de produção. Você pode acompanhar o andamento por aqui: {{3}}',
          examples: [
            'João',
            'ORC-2026-0017',
            'https://graficalaletra.com.br/rastreio/ORC-2026-0017',
          ],
          variables: ['nome', 'pedido', 'link_acompanhamento'],
        },
        {
          name: 'aguardando_informacoes',
          category: 'UTILITY',
          language: 'pt_BR',
          text: 'Olá {{1}}! Para continuarmos o pedido {{2}}, precisamos de algumas informações ou arquivos. Assim que recebermos, seguimos com a produção.',
          examples: ['João', 'ORC-2026-0017'],
          variables: ['nome', 'pedido'],
        },
        {
          name: 'aguardando_aprovacao_arte',
          category: 'UTILITY',
          language: 'pt_BR',
          text: 'Olá {{1}}! A arte do pedido {{2}} está pronta para sua aprovação. Você pode acompanhar e aprovar por aqui: {{3}}',
          examples: [
            'João',
            'ORC-2026-0017',
            'https://graficalaletra.com.br/rastreio/ORC-2026-0017',
          ],
          variables: ['nome', 'pedido', 'link_acompanhamento'],
        },
        {
          name: 'arte_aprovada',
          category: 'UTILITY',
          language: 'pt_BR',
          text: 'Olá {{1}}! A arte do pedido {{2}} foi aprovada e o pedido seguirá para a próxima etapa de produção.',
          examples: ['João', 'ORC-2026-0017'],
          variables: ['nome', 'pedido'],
        },
        {
          name: 'pedido_em_producao',
          category: 'UTILITY',
          language: 'pt_BR',
          text: 'Olá {{1}}! Seu pedido {{2}} entrou em produção. Assim que houver uma nova atualização, avisaremos por aqui.',
          examples: ['João', 'ORC-2026-0017'],
          variables: ['nome', 'pedido'],
        },
        {
          name: 'pedido_pronto',
          category: 'UTILITY',
          language: 'pt_BR',
          text: 'Boas notícias, {{1}}! O pedido {{2}} está pronto. Consulte os detalhes e o acompanhamento aqui: {{3}}',
          examples: [
            'João',
            'ORC-2026-0017',
            'https://graficalaletra.com.br/rastreio/ORC-2026-0017',
          ],
          variables: ['nome', 'pedido', 'link_acompanhamento'],
        },
        {
          name: 'pedido_enviado_retirada',
          category: 'UTILITY',
          language: 'pt_BR',
          text: 'Olá {{1}}! O pedido {{2}} foi atualizado para enviado/aguardando retirada. Código de rastreio ou referência: {{3}} Acompanhe aqui: {{4}}',
          examples: [
            'João',
            'ORC-2026-0017',
            'BR123456789',
            'https://graficalaletra.com.br/rastreio/ORC-2026-0017',
          ],
          variables: ['nome', 'pedido', 'codigo_rastreio', 'link_acompanhamento'],
        },
        {
          name: 'pedido_concluido',
          category: 'UTILITY',
          language: 'pt_BR',
          text: 'Olá {{1}}! O pedido {{2}} foi concluído. Agradecemos pela preferência!',
          examples: ['João', 'ORC-2026-0017'],
          variables: ['nome', 'pedido'],
        },
      ]

      let localTemplates = []
      try {
        localTemplates = $app.findRecordsByFilter('whatsapp_templates', '1=1', 'name', 500, 0)
      } catch (_) {}

      const tplCollection = $app.findCollectionByNameOrId('whatsapp_templates')

      const fetchMetaTemplateByName = function (tName) {
        try {
          const lookupUrl =
            'https://graph.facebook.com/' +
            metaApiVersion +
            '/' +
            metaWabaId +
            '/message_templates?name=' +
            encodeURIComponent(tName) +
            '&limit=5'
          const lookupRes = $http.send({
            url: lookupUrl,
            method: 'GET',
            headers: {
              Authorization: 'Bearer ' + metaToken,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })
          if (lookupRes && lookupRes.statusCode === 200) {
            const lData = lookupRes.json || JSON.parse(lookupRes.raw)
            if (lData && Array.isArray(lData.data) && lData.data.length > 0) {
              for (let k = 0; k < lData.data.length; k++) {
                if (String(lData.data[k].name).toLowerCase() === tName.toLowerCase()) {
                  return lData.data[k]
                }
              }
              return lData.data[0]
            }
          }
        } catch (_) {}
        return null
      }

      const postUrl =
        'https://graph.facebook.com/' + metaApiVersion + '/' + metaWabaId + '/message_templates'
      const results = []

      for (let idx = 0; idx < templatesToSubmit.length; idx++) {
        const tDef = templatesToSubmit[idx]
        const templateName = tDef.name

        const bodyComponent = {
          type: 'BODY',
          text: tDef.text,
          example: {
            body_text: [tDef.examples],
          },
        }

        const payload = {
          name: templateName,
          language: tDef.language,
          category: tDef.category,
          components: [bodyComponent],
        }

        let apiRes = null
        let netErr = null
        try {
          apiRes = $http.send({
            url: postUrl,
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + metaToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            timeout: 25,
          })
        } catch (err) {
          netErr = err
        }

        const statusCode = apiRes ? apiRes.statusCode : 0
        let respData = null
        try {
          if (apiRes && apiRes.json) {
            respData = apiRes.json
          } else if (apiRes && apiRes.raw) {
            respData = JSON.parse(apiRes.raw)
          }
        } catch (_) {}

        let metaTemplateId = ''
        let metaStatusRaw = 'PENDING'
        let action = ''
        let errorMessage = ''
        let errorDetails = null

        if (statusCode >= 200 && statusCode < 300 && respData) {
          metaTemplateId = String(respData.id || '').trim()
          metaStatusRaw = String(respData.status || 'PENDING').toUpperCase()
          action = 'created'
        } else {
          const errObj = (respData && respData.error) || {}
          errorMessage = errObj.message || (netErr ? String(netErr) : 'HTTP ' + statusCode)
          errorDetails = {
            httpCode: statusCode,
            code: errObj.code || statusCode,
            subcode: errObj.error_subcode || '',
            type: errObj.type || '',
            message: errorMessage,
            error_user_title: errObj.error_user_title || '',
            error_user_msg: errObj.error_user_msg || '',
            fbtrace_id: errObj.fbtrace_id || '',
          }

          const isAlreadyExists =
            errorMessage.toLowerCase().includes('already exists') ||
            errorMessage.toLowerCase().includes('duplicate') ||
            String(errObj.error_subcode || '') === '2388040'

          if (isAlreadyExists) {
            const existingMetaTpl = fetchMetaTemplateByName(templateName)
            if (existingMetaTpl) {
              metaTemplateId = String(existingMetaTpl.id || '').trim()
              metaStatusRaw = String(existingMetaTpl.status || 'PENDING').toUpperCase()
              action = 'already_exists'
              errorMessage = ''
            } else {
              action = 'already_exists_lookup_failed'
            }
          } else {
            action = 'error'
          }
        }

        let localSaved = false
        let localRecordId = ''
        if (action === 'created' || action === 'already_exists') {
          let matchedRecord = null
          for (let l = 0; l < localTemplates.length; l++) {
            const rec = localTemplates[l]
            const recMetaId = String(rec.get('meta_template_id') || '').trim()
            const recName = String(rec.get('name') || '')
              .trim()
              .toLowerCase()
            if (metaTemplateId && recMetaId && metaTemplateId === recMetaId) {
              matchedRecord = rec
              break
            }
            if (recName === templateName.toLowerCase()) {
              matchedRecord = rec
              break
            }
          }

          const localStatus =
            metaStatusRaw === 'APPROVED'
              ? 'APPROVED'
              : metaStatusRaw === 'REJECTED'
                ? 'REJECTED'
                : 'PENDING'

          if (matchedRecord) {
            matchedRecord.set('meta_template_id', metaTemplateId)
            matchedRecord.set('status', localStatus)
            matchedRecord.set('category', 'UTILITY')
            matchedRecord.set('language', tDef.language)
            matchedRecord.set('body', tDef.text)
            matchedRecord.set('variables', tDef.variables)
            try {
              $app.save(matchedRecord)
              localSaved = true
              localRecordId = matchedRecord.id
            } catch (_) {}
          } else {
            const newRec = new Record(tplCollection)
            newRec.set('name', templateName)
            newRec.set('category', 'UTILITY')
            newRec.set('language', tDef.language)
            newRec.set('status', localStatus)
            newRec.set('body', tDef.text)
            newRec.set('variables', tDef.variables)
            newRec.set('meta_template_id', metaTemplateId)
            try {
              $app.save(newRec)
              localSaved = true
              localRecordId = newRec.id
              localTemplates.push(newRec)
            } catch (_) {}
          }
        }

        results.push({
          name: templateName,
          action: action,
          meta_template_id: metaTemplateId,
          meta_status: metaStatusRaw,
          local_saved: localSaved,
          local_id: localRecordId,
          error: errorMessage || undefined,
          error_details: errorDetails || undefined,
        })
      }

      // Salvar em system_settings para auditoria
      try {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', 'meta_submission_result_real')
        newRec.set('setting_value', JSON.stringify({ timestamp: Date.now(), results: results }))
        newRec.set('description', 'Submissao real oficial executada')
        $app.save(newRec)
      } catch (_) {}
    }
  } catch (submitErr) {
    console.error('[AutomationProcessor] Submission execution error:', submitErr)
  }

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
          // If already marked resolved, do not recreate this exact event
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
          if (data.attendanceId) rec.set('attendance_id', data.attendanceId)
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

    // A) ATENDIMENTOS / CLIENTES AGUARDANDO RESPOSTA (consultando attendances)
    if (isWaitingEnabled) {
      try {
        const attendances = $app.findRecordsByFilter(
          'attendances',
          'is_archived != true && stage != "Venda fechada" && stage != "Não fechou"',
          '-updated',
          200,
          0,
        )

        for (let i = 0; i < attendances.length; i++) {
          const att = attendances[i]
          const clientId = att.getString('client_id')
          let clientRec = null
          if (clientId) {
            try {
              clientRec = $app.findFirstRecordByData('clients', 'id', clientId)
            } catch (_) {}
          }

          const clientName = clientRec ? clientRec.getString('name') : 'Cliente'
          const lastMsgAt =
            (clientRec ? clientRec.getString('last_message_at') : '') ||
            att.getString('last_customer_message_at') ||
            att.getString('updated') ||
            att.getString('created')
          const lastDir = clientRec ? clientRec.getString('last_message_direction') : 'inbound'
          const msgMs = lastMsgAt ? new Date(lastMsgAt).getTime() : 0
          const eventTimeKey = Math.floor(msgMs / 1000)
          const itemId = 'client_reply_' + att.id + '_' + eventTimeKey
          const legacyItemId = 'client_reply_' + att.id

          if (lastMsgAt && (lastDir === 'inbound' || !lastDir)) {
            const diffMin = Math.max(0, Math.floor((nowMs - msgMs) / (1000 * 60)))

            if (diffMin >= waitingAltaMin) {
              const priority = diffMin >= waitingUrgenteMin ? 'urgente' : 'alta'
              const lastMsgText = clientRec ? clientRec.getString('last_message_text') : ''
              const subtitle = lastMsgText
                ? '"' + lastMsgText.substring(0, 70) + '"'
                : 'Cliente aguardando resposta no WhatsApp'

              const res = upsertPendingResolution({
                category: 'clients_waiting_response',
                itemId: itemId,
                itemTitle: clientName + ' - ' + subtitle,
                clientId: clientId,
                attendanceId: att.id,
                clientName: clientName,
                assignedTo:
                  att.getString('assigned_to') ||
                  (clientRec ? clientRec.getString('assigned_to') : ''),
                itemCreatedAt: lastMsgAt.split('T')[0],
                priority: priority,
                waitingMinutes: diffMin,
              })
              if (res) waitingCreated++
            }
          } else if (lastDir === 'outbound') {
            // Client was replied to -> Auto resolve pending item
            resolvePendingItem(itemId, 'Cliente respondido via WhatsApp')
            resolvePendingItem(legacyItemId, 'Cliente respondido via WhatsApp')
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

    // B) ORÇAMENTO SEM RETORNO (consultando attendances)
    if (isQuotesEnabled) {
      try {
        const quoteAttendances = $app.findRecordsByFilter(
          'attendances',
          'is_archived != true && (stage = "Orçamento enviado" || stage = "Aguardando cliente")',
          '-updated',
          200,
          0,
        )

        for (let i = 0; i < quoteAttendances.length; i++) {
          const att = quoteAttendances[i]
          const clientId = att.getString('client_id')
          let clientRec = null
          if (clientId) {
            try {
              clientRec = $app.findFirstRecordByData('clients', 'id', clientId)
            } catch (_) {}
          }

          const clientName = clientRec ? clientRec.getString('name') : 'Cliente'
          const refTimeStr = att.getString('updated') || att.getString('created')
          const refMs = new Date(refTimeStr).getTime()
          const eventTimeKey = Math.floor(refMs / 1000)
          const diffDays = Math.max(0, Math.floor((nowMs - refMs) / (1000 * 60 * 60 * 24)))
          const diffMin = Math.max(0, Math.floor((nowMs - refMs) / (1000 * 60)))

          if (diffDays >= quoteAltaDays) {
            const priority = diffDays >= quoteUrgenteDays ? 'urgente' : 'alta'
            const quoteVal =
              att.get('quote_value') !== undefined
                ? att.get('quote_value')
                : clientRec
                  ? clientRec.get('quote_value')
                  : 0
            const quoteValStr = quoteVal ? 'R$ ' + Number(quoteVal).toFixed(2) : ''
            const prod =
              att.getString('product_interest') ||
              (clientRec ? clientRec.getString('product_interest') : '') ||
              'Orçamento'

            const res = upsertPendingResolution({
              category: 'quotes_waiting_return',
              itemId: 'client_quote_' + att.id + '_' + eventTimeKey,
              itemTitle: clientName + ' - ' + prod + ' ' + quoteValStr,
              clientId: clientId,
              attendanceId: att.id,
              clientName: clientName,
              assignedTo:
                att.getString('assigned_to') ||
                (clientRec ? clientRec.getString('assigned_to') : ''),
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
              attendanceId: t.getString('attendance_id'),
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
