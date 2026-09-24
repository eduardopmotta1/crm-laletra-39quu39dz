/**
 * Backend Centralizado de Resolução de Atendimento por Client ID
 * Rota: POST /backend/v1/crm/attendances/resolve
 *
 * REGRA CENTRAL: 1 CLIENTE = NO MÁXIMO 1 ATTENDANCE ATIVO (is_archived = false).
 * Executa dentro de transação atômica SQLite (runInTransaction) protegida por
 * lock transacional persistido em system_settings (lock_client_<clientId> / lock_client_<phone>).
 *
 * Comportamento estrito:
 * 1. Recebe client_id (e metadados opcionais como stage, assigned_to, notes, source, etc.).
 * 2. Procura attendance ativo existente (is_archived = false).
 * 3. Se existir exatamente 1 -> retorna-o (reutiliza, status 200).
 * 4. Se não existir -> cria de forma protegida dentro da transação atômica.
 * 5. Se outra execução concorrente criar simultaneamente -> re-checa e recupera o attendance da outra (nunca duplica).
 * 6. Se encontrar > 1 ativos por inconsistência histórica -> NÃO escolhe arbitrariamente,
 *    registra warning estruturado no log, resolve deterministicamente pelo mais recente por created (-created),
 *    e preserva todos os dados intactos sem criar outro attendance.
 * 7. Jamais usa clientAtts[0] como decisão de negócio arbitrária.
 *
 * Compatível com chamadas públicas/autenticadas (ex: webhook e chamadas do CRM autenticado).
 */

routerAdd('POST', '/backend/v1/crm/attendances/resolve', (c) => {
  let body = {}
  try {
    if (typeof c.requestInfo === 'function') {
      const reqInfo = c.requestInfo()
      body = reqInfo ? reqInfo.data || reqInfo.body || {} : {}
    } else if (typeof $apis !== 'undefined' && typeof $apis.requestInfo === 'function') {
      const reqInfo = $apis.requestInfo(c)
      body = reqInfo ? reqInfo.data || reqInfo.body || {} : {}
    }
  } catch (_) {}
  const clientId = String(body.client_id || body.clientId || '').trim()

  if (!clientId) {
    return c.json(400, {
      success: false,
      error: 'client_id é obrigatório.',
    })
  }

  const appInstance = c.app || $app

  // Funções utilitárias no escopo do handler (goja VM pool)
  function acquireLock(key, txApp) {
    try {
      const lockKey = 'lock_client_' + key
      let lockRecord = null
      try {
        lockRecord = txApp.findFirstRecordByData('system_settings', 'setting_key', lockKey)
      } catch (_) {}

      const now = new Date().toISOString()
      if (lockRecord) {
        lockRecord.set('setting_value', now)
        txApp.save(lockRecord)
      } else {
        const settingsCol = txApp.findCollectionByNameOrId('system_settings')
        const newLock = new Record(settingsCol)
        newLock.set('setting_key', lockKey)
        newLock.set('setting_value', now)
        newLock.set('description', 'Concurrency lock for client: ' + key)
        txApp.save(newLock)
      }
    } catch (err) {
      console.warn('[resolveAttendance Lock] Advisory notice for ' + key + ':', err)
    }
  }

  function resolveCanonicalClientId(txApp, rawClientId) {
    try {
      const client = txApp.findRecordById('clients', rawClientId)
      const notes = client.get('notes') || ''
      const match = notes.match(/\[DUPLICADO_CONSOLIDADO\s*->\s*([a-zA-Z0-9_-]+)\]/i)
      if (match && match[1]) {
        return { client, canonicalId: match[1], phone: client.get('phone') || '' }
      }
      return { client, canonicalId: rawClientId, phone: client.get('phone') || '' }
    } catch (_) {
      return { client: null, canonicalId: rawClientId, phone: '' }
    }
  }

  let resolvedAttendanceRecord = null
  let resolutionAction = 'reused' // 'reused' | 'created' | 'historical_inconsistency_resolved'

  try {
    appInstance.runInTransaction((txApp) => {
      // 1. Resolver id canônico (se consolidado) e obter telefone
      const { client, canonicalId, phone } = resolveCanonicalClientId(txApp, clientId)

      // 2. Adquirir lock transacional por client_id e por telefone
      acquireLock(canonicalId, txApp)
      if (phone) {
        let cleanPhone = String(phone).replace(/\D/g, '')
        if (cleanPhone.length === 10 || cleanPhone.length === 11) {
          cleanPhone = '55' + cleanPhone
        }
        if (cleanPhone) {
          acquireLock(cleanPhone, txApp)
        }
      }

      // 3. Buscar atendimentos ativos para esse cliente: is_archived = false
      const attendancesCol = txApp.findCollectionByNameOrId('attendances')
      let activeAttendances = []
      try {
        activeAttendances = txApp.findRecordsByFilter(
          'attendances',
          `client_id = '${canonicalId}' && is_archived = false`,
          '-created',
          20,
          0,
        )
      } catch (errFilter) {
        console.warn('[resolveAttendance] Erro ao buscar ativos:', errFilter)
      }

      // 4. Analisar contagem de ativos
      if (activeAttendances && activeAttendances.length === 1) {
        // Exatamente 1 ativo: retorna-o diretamente
        resolvedAttendanceRecord = activeAttendances[0]
        resolutionAction = 'reused'
        return
      }

      if (activeAttendances && activeAttendances.length > 1) {
        // INCONSISTÊNCIA HISTÓRICA DETECTADA:
        // NÃO escolher arbitrariamente (nunca clientAtts[0] acidental).
        // Registrar log estruturado com IDs e determinismo escolhido: o mais recente por created (-created).
        const allIds = activeAttendances.map((a) => a.id).join(', ')
        console.warn(
          `[INCONSISTENCIA_HISTORICA_ATTENDANCE] Cliente ${canonicalId} possui ${activeAttendances.length} atendimentos ativos: [${allIds}]. ` +
            `Resolução determinística selecionada: mais recente por created (${activeAttendances[0].id}). NENHUM novo attendance foi criado e nenhum dado foi alterado.`,
        )
        resolvedAttendanceRecord = activeAttendances[0]
        resolutionAction = 'historical_inconsistency_resolved'
        return
      }

      // 5. Regra 2C: Se nenhum atendimento ativo com is_archived = false foi encontrado,
      // verificar se cliente possui ordem de produção em andamento (is_completed = false)
      // ou fechamento ganho recente que manteve o atendimento ativo (caso Gabriela: venda em produção).
      try {
        const activeOrders = txApp.findRecordsByFilter(
          'production_orders',
          `client_id = '${canonicalId}' && is_completed = false && is_archived = false`,
          '-created',
          5,
          0,
        )
        for (const ord of activeOrders) {
          const linkedAttId = ord.get('attendance_id')
          if (linkedAttId) {
            try {
              const linkedAtt = txApp.findRecordById('attendances', linkedAttId)
              if (linkedAtt && !linkedAtt.get('is_archived')) {
                resolvedAttendanceRecord = linkedAtt
                resolutionAction = 'reused'
                return
              }
            } catch (_) {}
          }
        }
      } catch (orderCheckErr) {
        console.warn(
          '[resolveAttendance] Erro ao checar ordens de produção vinculadas:',
          orderCheckErr,
        )
      }

      try {
        const recentArchivedDeals = txApp.findRecordsByFilter(
          'archived_deals',
          `client_id = '${canonicalId}' && reason = 'won'`,
          '-created',
          1,
          0,
        )
        if (recentArchivedDeals && recentArchivedDeals.length > 0) {
          const originalAttendanceId = recentArchivedDeals[0].get('original_attendance_id')
          if (originalAttendanceId) {
            try {
              const prevAtt = txApp.findRecordById('attendances', originalAttendanceId)
              if (prevAtt && !prevAtt.get('is_archived')) {
                resolvedAttendanceRecord = prevAtt
                resolutionAction = 'reused'
                return
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      // 6. RE-CHECK atômico antes de criar para garantir idempotência contra concorrência
      try {
        const recheck = txApp.findRecordsByFilter(
          'attendances',
          `client_id = '${canonicalId}' && is_archived = false`,
          '-created',
          1,
          0,
        )
        if (recheck && recheck.length > 0) {
          resolvedAttendanceRecord = recheck[0]
          resolutionAction = 'reused'
          return
        }
      } catch (_) {}

      // 7. Não existe attendance ativo: criar exatamente UM de forma atômica
      const newAttendance = new Record(attendancesCol)
      newAttendance.set('client_id', canonicalId)
      newAttendance.set('channel', body.channel || 'whatsapp')
      newAttendance.set('stage', body.stage || 'Novo contato')
      newAttendance.set('status', body.status || 'in_progress')
      newAttendance.set('is_archived', false)
      newAttendance.set('started_at', new Date().toISOString())
      newAttendance.set('source', body.source || 'sistema')
      if (body.product_interest) {
        newAttendance.set('product_interest', body.product_interest)
      }
      if (body.quote_value !== undefined) {
        newAttendance.set('quote_value', body.quote_value)
      }
      if (body.notes) {
        newAttendance.set('notes', body.notes)
      }

      // Herdar assigned_to do cliente ou do payload ou deixar vago
      let assignedTo = body.assigned_to || ''
      if (!assignedTo && client && client.get('assigned_to')) {
        assignedTo = client.get('assigned_to')
      }
      if (assignedTo) {
        newAttendance.set('assigned_to', assignedTo)
      }

      txApp.save(newAttendance)
      resolvedAttendanceRecord = newAttendance
      resolutionAction = 'created'

      // Se cliente estiver arquivado ou precisar de sincronia de etapa, atualizar suavemente
      if (client) {
        try {
          if (client.get('is_archived')) {
            client.set('is_archived', false)
          }
          if (body.stage) {
            client.set('stage', body.stage)
          }
          client.set('updated', new Date().toISOString())
          txApp.save(client)
        } catch (_) {}
      }
    })
  } catch (err) {
    console.error(
      '[resolveAttendance] Falha ao resolver attendance para client ' + clientId + ':',
      err,
    )
    return c.json(500, {
      success: false,
      error: 'Erro interno ao resolver atendimento: ' + (err.message || String(err)),
    })
  }

  if (!resolvedAttendanceRecord) {
    return c.json(500, {
      success: false,
      error: 'Não foi possível resolver nem criar o atendimento para este cliente.',
    })
  }

  // Obter campos serializáveis do Record
  const attendanceData = {
    id: resolvedAttendanceRecord.id,
    client_id: resolvedAttendanceRecord.get('client_id'),
    stage: resolvedAttendanceRecord.get('stage'),
    status: resolvedAttendanceRecord.get('status'),
    channel: resolvedAttendanceRecord.get('channel'),
    is_archived: resolvedAttendanceRecord.get('is_archived'),
    assigned_to: resolvedAttendanceRecord.get('assigned_to') || '',
    product_interest: resolvedAttendanceRecord.get('product_interest') || '',
    quote_value: resolvedAttendanceRecord.get('quote_value') || 0,
    notes: resolvedAttendanceRecord.get('notes') || '',
    source: resolvedAttendanceRecord.get('source') || '',
    started_at: resolvedAttendanceRecord.get('started_at') || '',
    closed_at: resolvedAttendanceRecord.get('closed_at') || '',
    created: resolvedAttendanceRecord.get('created') || '',
    updated: resolvedAttendanceRecord.get('updated') || '',
  }

  return c.json(200, {
    success: true,
    action: resolutionAction,
    attendance: attendanceData,
    attendance_id: resolvedAttendanceRecord.id,
  })
})
