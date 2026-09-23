// Endpoint Admin para Execução Controlada da Etapa 3 do CRM Laletra
// POST /backend/v1/crm/admin/etapa3/execute
// GET  /backend/v1/crm/admin/etapa3/report

routerAdd('POST', '/backend/v1/crm/admin/etapa3/execute', (e) => {
  console.log('[ETAPA3 HOOK] Iniciando requisição de execução...')

  // Helper interno de gravação de relatório (dentro do callback devido ao pool do Goja VM)
  const persistReport = function (reportData) {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData('system_settings', 'setting_key', 'etapa3_report')
      } catch (_) {}

      const jsonStr = JSON.stringify(reportData)
      if (rec) {
        rec.set('setting_value', jsonStr)
        rec.set(
          'description',
          'Relatório final da Etapa 3 - Executado em ' + new Date().toISOString(),
        )
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', 'etapa3_report')
        newRec.set('setting_value', jsonStr)
        newRec.set('description', 'Relatório final da Etapa 3')
        $app.save(newRec)
      }
      console.log('[ETAPA3 HOOK] Relatório salvo com sucesso em system_settings.etapa3_report.')
    } catch (err) {
      console.error('[ETAPA3 HOOK] Falha ao salvar relatório em system_settings:', err)
    }
  }

  // 1. Autenticação Administrativa ou Superuser
  const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
  const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

  let isAuthorized = false
  let callerInfo = 'unknown'

  // Verifica se o caller enviou o superuser token no Authorization header
  let authHeader = ''
  try {
    if (e.request && e.request.header && typeof e.request.header.get === 'function') {
      authHeader =
        e.request.header.get('Authorization') || e.request.header.get('authorization') || ''
    }
  } catch (_) {}

  if (superuserToken && authHeader && authHeader.trim() === superuserToken.trim()) {
    isAuthorized = true
    callerInfo = 'superuser_token'
  }

  // Verifica se o caller é um usuário admin autenticado via sessão PocketBase
  if (!isAuthorized) {
    const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
    if (auth && auth.get('is_active') !== false && auth.get('role_slug') === 'admin') {
      isAuthorized = true
      callerInfo = 'admin_user:' + auth.id
    }
  }

  if (!isAuthorized) {
    return e.json(403, {
      success: false,
      error: 'Acesso negado: apenas superuser ou administradores podem executar a Etapa 3.',
    })
  }

  console.log('[ETAPA3 HOOK] Autorizado com sucesso via:', callerInfo)

  const report = {
    etapa3_concluida: false,
    started_at: new Date().toISOString(),
    caller: callerInfo,
    backup: {
      attempted: true,
      created: false,
      confirmed: false,
      key: '',
      size: 0,
      modified: '',
      method: '',
      error: '',
    },
    mario: {
      client_id: '4w6eiehm4w6n2zy',
      canonical_id: 'b41gzlkj9et83ga',
      excess_ids: ['2wf4b5f68sgywej', '5m8ruq9bhhym4ps'],
      messages_moved: 0,
      transitions_moved: 0,
      duplicate_wamid_removed: 0,
      surviving_wamid_message_id: '',
      tmj_preserved: false,
      adesivo_brilhoso_preserved: false,
      todos_sao_iguais_preserved: false,
      order_1866_preserved: false,
      orc_2026_0025_preserved: false,
      archived_deal_wsbb_preserved: false,
      production_order_yaf9_preserved: false,
      excess_archived: false,
      excess_relations_cleared: false,
      errors: [],
    },
    gabriela: {
      client_id: 'nk6nttrb1syg9zy',
      canonical_id: '3y4kxldszsft54x',
      excess_id: 'qshqxm95v5920up',
      messages_moved: 0,
      transitions_moved: 0,
      order_1867_preserved: false,
      orc_2026_0024_preserved: false,
      archived_deal_mt1k_preserved: false,
      production_order_0un1_preserved: false,
      excess_archived: false,
      excess_relations_cleared: false,
      errors: [],
    },
    varredura_global: {
      duplicate_wamids: [],
      clients_multiple_active_attendances: [],
      orphan_messages: [],
      orphan_transitions: [],
      orphan_commercial_relations: [],
      attendances_without_client: [],
      client_attendance_mismatch: [],
    },
    unique_protections_ready: false,
    completed_at: '',
    status: 'IN_PROGRESS',
  }

  // 2. CRIAÇÃO E CONFIRMAÇÃO INDEPENDENTE DE BACKUP
  const now = new Date()
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  const dateStr =
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  const backupName = 'pb_backup_etapa3_' + dateStr + '.zip'

  console.log('[ETAPA3 HOOK] Solicitando criação de backup HTTP:', backupName)

  if (superuserToken) {
    try {
      const apiRes = $http.send({
        url: pbInstanceUrl + '/api/backups',
        method: 'POST',
        headers: {
          Authorization: superuserToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: backupName }),
        timeout: 60,
      })

      if (apiRes && apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
        report.backup.created = true
        report.backup.method = 'http_post_api_backups'
        report.backup.key = backupName
        console.log('[ETAPA3 HOOK] Backup POST /api/backups retornou sucesso.')
      } else {
        report.backup.error =
          'POST /api/backups retornou status ' + (apiRes ? apiRes.statusCode : 'sem resposta')
      }
    } catch (httpErr) {
      report.backup.error = 'Exceção ao chamar POST /api/backups: ' + String(httpErr)
    }
  } else {
    report.backup.error = 'PB_SUPERUSER_TOKEN não configurado no ambiente.'
  }

  // Confirmação independente do backup via Filesystem
  if (report.backup.created) {
    let fsys = null
    try {
      fsys = $app.newBackupsFilesystem()
      const exists = fsys.exists(backupName)
      if (exists) {
        report.backup.confirmed = true
        const attrs = fsys.attributes(backupName)
        if (attrs) {
          report.backup.size = typeof attrs.size === 'number' ? attrs.size : 0
          if (attrs.modTime) {
            report.backup.modified =
              typeof attrs.modTime.toISOString === 'function'
                ? attrs.modTime.toISOString()
                : String(attrs.modTime)
          }
        }
        console.log(
          '[ETAPA3 HOOK] Backup confirmado no filesystem! Tamanho: ' +
            report.backup.size +
            ' bytes',
        )
      } else {
        report.backup.confirmed = false
        report.backup.error = 'Arquivo de backup não encontrado no filesystem após criação.'
      }
    } catch (fsErr) {
      report.backup.confirmed = false
      report.backup.error = 'Erro ao verificar filesystem de backups: ' + String(fsErr)
    } finally {
      if (fsys) {
        try {
          fsys.close()
        } catch (_) {}
      }
    }
  }

  // REGRA OBRIGATÓRIA: Se backup created != true OU confirmed != true, PARAR imediatamente
  if (!report.backup.created || !report.backup.confirmed) {
    report.status = 'STOPPED_AT_BACKUP_FAILURE'
    report.completed_at = new Date().toISOString()
    console.error('[ETAPA3 HOOK] PARANDO: Falha na criação/confirmação do backup:', report.backup)
    persistReport(report)
    return e.json(500, {
      success: false,
      error: 'Execução interrompida: Falha ao criar ou confirmar backup.',
      report: report,
    })
  }

  // 3. EXECUÇÃO CONTROLADA DA CONSOLIDAÇÃO (MARIO E GABRIELA)
  try {
    $app.runInTransaction((txApp) => {
      // ----------------------------------------------------
      // A. CONSOLIDAÇÃO MARIO ANGELO (client: 4w6eiehm4w6n2zy)
      // Canônico: b41gzlkj9et83ga
      // Excedentes: 2wf4b5f68sgywej, 5m8ruq9bhhym4ps
      // ----------------------------------------------------
      console.log('[ETAPA3 HOOK] Iniciando consolidação do Mario...')
      const marioCanonical = txApp.findRecordById('attendances', 'b41gzlkj9et83ga')
      const marioExcedente1 = txApp.findRecordById('attendances', '2wf4b5f68sgywej')
      const marioExcedente2 = txApp.findRecordById('attendances', '5m8ruq9bhhym4ps')

      // 1. Mover mensagens dos excedentes para o canônico
      const marioMessagesExc1 = txApp.findRecordsByFilter(
        'messages',
        "attendance_id = '2wf4b5f68sgywej'",
        'created',
        500,
        0,
      )
      for (const msg of marioMessagesExc1) {
        msg.set('attendance_id', 'b41gzlkj9et83ga')
        txApp.save(msg)
        report.mario.messages_moved++
      }

      const marioMessagesExc2 = txApp.findRecordsByFilter(
        'messages',
        "attendance_id = '5m8ruq9bhhym4ps'",
        'created',
        500,
        0,
      )
      for (const msg of marioMessagesExc2) {
        msg.set('attendance_id', 'b41gzlkj9et83ga')
        txApp.save(msg)
        report.mario.messages_moved++
      }

      // 2. Mover stage_transitions dos excedentes para o canônico
      const marioTrans1 = txApp.findRecordsByFilter(
        'stage_transitions',
        "attendance_id = '2wf4b5f68sgywej'",
        'created',
        500,
        0,
      )
      for (const tr of marioTrans1) {
        tr.set('attendance_id', 'b41gzlkj9et83ga')
        txApp.save(tr)
        report.mario.transitions_moved++
      }

      const marioTrans2 = txApp.findRecordsByFilter(
        'stage_transitions',
        "attendance_id = '5m8ruq9bhhym4ps'",
        'created',
        500,
        0,
      )
      for (const tr of marioTrans2) {
        tr.set('attendance_id', 'b41gzlkj9et83ga')
        txApp.save(tr)
        report.mario.transitions_moved++
      }

      // 3. Tratar o WAMID triplicado: "Oi, quero fazer um novo pedido."
      // Registros identificados: u8mbbhqv5cs4mmr, zvbo45me5eox2xp, ogzp8kjibvd2mt3
      // Preferir manter u8mbbhqv5cs4mmr re-apontado ao canônico; as outras 2 cópias são duplicatas técnicas do mesmo WAMID
      const triplicateIds = ['u8mbbhqv5cs4mmr', 'zvbo45me5eox2xp', 'ogzp8kjibvd2mt3']
      let keeperMsg = null
      for (const tId of triplicateIds) {
        try {
          const rec = txApp.findRecordById('messages', tId)
          if (!keeperMsg && tId === 'u8mbbhqv5cs4mmr') {
            keeperMsg = rec
          } else if (!keeperMsg) {
            keeperMsg = rec
          } else {
            // É duplicata técnica: remover
            txApp.delete(rec)
            report.mario.duplicate_wamid_removed++
            console.log('[ETAPA3 HOOK] Duplicata técnica de WAMID removida:', rec.id)
          }
        } catch (_) {}
      }

      if (keeperMsg) {
        keeperMsg.set('attendance_id', 'b41gzlkj9et83ga')
        txApp.save(keeperMsg)
        report.mario.surviving_wamid_message_id = keeperMsg.id
      }

      // 4. Validar preservação de itens do Mario
      // "tmj", mensagens do adesivo/brilhoso, "todos sao iguais", pedido #001866, ORC-2026-0025,
      // archived_deal wsbb9hb30xqoox8, production order yaf9lw1tdwyg094.
      const canonicalMsgs = txApp.findRecordsByFilter(
        'messages',
        "attendance_id = 'b41gzlkj9et83ga'",
        'created',
        500,
        0,
      )
      for (const cm of canonicalMsgs) {
        const txt = (cm.get('message_text') || cm.get('content') || '').toLowerCase()
        if (txt.includes('tmj')) report.mario.tmj_preserved = true
        if (txt.includes('adesivo') || txt.includes('brilhoso'))
          report.mario.adesivo_brilhoso_preserved = true
        if (txt.includes('todos sao iguais') || txt.includes('todos são iguais'))
          report.mario.todos_sao_iguais_preserved = true
      }

      try {
        const ord1866 = txApp.findRecordById('production_orders', 'yaf9lw1tdwyg094')
        if (ord1866 && ord1866.get('order_number') === '001866') {
          report.mario.order_1866_preserved = true
          report.mario.production_order_yaf9_preserved = true
        }
      } catch (_) {}

      try {
        const quotesMario = txApp.findRecordsByFilter(
          'quotes',
          "client_id = '4w6eiehm4w6n2zy' && code = 'ORC-2026-0025'",
          'created',
          1,
          0,
        )
        if (quotesMario && quotesMario.length > 0) report.mario.orc_2026_0025_preserved = true
      } catch (_) {}

      try {
        const dealMario = txApp.findRecordById('archived_deals', 'wsbb9hb30xqoox8')
        if (dealMario) report.mario.archived_deal_wsbb_preserved = true
      } catch (_) {}

      // 5. Validar que excedentes estão zerados de relações e ARQUIVAR (is_archived=true), NUNCA excluir
      const remExc1Msgs = txApp.findRecordsByFilter(
        'messages',
        "attendance_id = '2wf4b5f68sgywej'",
        'created',
        1,
        0,
      )
      const remExc2Msgs = txApp.findRecordsByFilter(
        'messages',
        "attendance_id = '5m8ruq9bhhym4ps'",
        'created',
        1,
        0,
      )
      const remExc1Tr = txApp.findRecordsByFilter(
        'stage_transitions',
        "attendance_id = '2wf4b5f68sgywej'",
        'created',
        1,
        0,
      )
      const remExc2Tr = txApp.findRecordsByFilter(
        'stage_transitions',
        "attendance_id = '5m8ruq9bhhym4ps'",
        'created',
        1,
        0,
      )

      if (
        remExc1Msgs.length === 0 &&
        remExc2Msgs.length === 0 &&
        remExc1Tr.length === 0 &&
        remExc2Tr.length === 0
      ) {
        report.mario.excess_relations_cleared = true
      } else {
        report.mario.errors.push('Excedentes do Mario ainda possuem mensagens ou transações.')
      }

      marioExcedente1.set('is_archived', true)
      marioExcedente1.set('archived_at', new Date().toISOString())
      txApp.save(marioExcedente1)

      marioExcedente2.set('is_archived', true)
      marioExcedente2.set('archived_at', new Date().toISOString())
      txApp.save(marioExcedente2)

      report.mario.excess_archived = true
      console.log('[ETAPA3 HOOK] Consolidação do Mario concluída com sucesso.')

      // ----------------------------------------------------
      // B. CONSOLIDAÇÃO GABRIELA (client: nk6nttrb1syg9zy)
      // Canônico: 3y4kxldszsft54x
      // Excedente: qshqxm95v5920up
      // ----------------------------------------------------
      console.log('[ETAPA3 HOOK] Iniciando consolidação da Gabriela...')
      const gabrielaCanonical = txApp.findRecordById('attendances', '3y4kxldszsft54x')
      const gabrielaExcedente = txApp.findRecordById('attendances', 'qshqxm95v5920up')

      // 1. Mover mensagens do excedente para o canônico preservando WAMIDs, timestamps, direction, replies, media
      const gabrielaMessages = txApp.findRecordsByFilter(
        'messages',
        "attendance_id = 'qshqxm95v5920up'",
        'created',
        500,
        0,
      )
      for (const msg of gabrielaMessages) {
        msg.set('attendance_id', '3y4kxldszsft54x')
        txApp.save(msg)
        report.gabriela.messages_moved++
      }

      // 2. Mover stage_transitions
      const gabrielaTrans = txApp.findRecordsByFilter(
        'stage_transitions',
        "attendance_id = 'qshqxm95v5920up'",
        'created',
        500,
        0,
      )
      for (const tr of gabrielaTrans) {
        tr.set('attendance_id', '3y4kxldszsft54x')
        txApp.save(tr)
        report.gabriela.transitions_moved++
      }

      // 3. Validar preservação de itens da Gabriela:
      // #001867, ORC-2026-0024, archived_deal mt1kzcjv9j2qycc, production order 0un1o7qyj1ky551
      try {
        const ord1867 = txApp.findRecordById('production_orders', '0un1o7qyj1ky551')
        if (ord1867 && ord1867.get('order_number') === '001867') {
          report.gabriela.order_1867_preserved = true
          report.gabriela.production_order_0un1_preserved = true
        }
      } catch (_) {}

      try {
        const quotesGabi = txApp.findRecordsByFilter(
          'quotes',
          "client_id = 'nk6nttrb1syg9zy' && code = 'ORC-2026-0024'",
          'created',
          1,
          0,
        )
        if (quotesGabi && quotesGabi.length > 0) report.gabriela.orc_2026_0024_preserved = true
      } catch (_) {}

      try {
        const dealGabi = txApp.findRecordById('archived_deals', 'mt1kzcjv9j2qycc')
        if (dealGabi) report.gabriela.archived_deal_mt1k_preserved = true
      } catch (_) {}

      // 4. Validar excedente zerado e ARQUIVAR sem excluir
      const remGabiMsgs = txApp.findRecordsByFilter(
        'messages',
        "attendance_id = 'qshqxm95v5920up'",
        'created',
        1,
        0,
      )
      const remGabiTr = txApp.findRecordsByFilter(
        'stage_transitions',
        "attendance_id = 'qshqxm95v5920up'",
        'created',
        1,
        0,
      )

      if (remGabiMsgs.length === 0 && remGabiTr.length === 0) {
        report.gabriela.excess_relations_cleared = true
      } else {
        report.gabriela.errors.push('Excedente da Gabriela ainda possui mensagens ou transações.')
      }

      gabrielaExcedente.set('is_archived', true)
      gabrielaExcedente.set('archived_at', new Date().toISOString())
      txApp.save(gabrielaExcedente)

      report.gabriela.excess_archived = true
      console.log('[ETAPA3 HOOK] Consolidação da Gabriela concluída com sucesso.')

      // ----------------------------------------------------
      // C. VARREDURA GLOBAL A–G
      // Se encontrar outros casos: NÃO corrigir automaticamente, apenas registrar IDs
      // ----------------------------------------------------
      console.log('[ETAPA3 HOOK] Executando varredura global A-G...')

      // Varredura A: WAMIDs duplicados
      const rawWamids = []
      try {
        txApp
          .db()
          .newQuery(
            `
          SELECT whatsapp_message_id, COUNT(*) as cnt, GROUP_CONCAT(id) as ids 
          FROM messages 
          WHERE whatsapp_message_id IS NOT NULL AND whatsapp_message_id != '' 
          GROUP BY whatsapp_message_id 
          HAVING COUNT(*) > 1
        `,
          )
          .all(rawWamids)
      } catch (eSql) {
        console.warn('[ETAPA3 HOOK] Erro na query de wamids duplicados:', eSql)
      }
      report.varredura_global.duplicate_wamids = rawWamids

      // Varredura B: Clientes com >1 attendance ativo (is_archived = false)
      const rawActiveAtts = []
      try {
        txApp
          .db()
          .newQuery(
            `
          SELECT client_id, COUNT(*) as cnt, GROUP_CONCAT(id) as attendance_ids 
          FROM attendances 
          WHERE is_archived = 0 
          GROUP BY client_id 
          HAVING COUNT(*) > 1
        `,
          )
          .all(rawActiveAtts)
      } catch (eSql) {
        console.warn('[ETAPA3 HOOK] Erro na query de clientes com múltiplos ativos:', eSql)
      }
      report.varredura_global.clients_multiple_active_attendances = rawActiveAtts

      // Varredura C: Messages órfãs (attendance_id não existe em attendances)
      const rawOrphanMsgs = []
      try {
        txApp
          .db()
          .newQuery(
            `
          SELECT m.id, m.attendance_id 
          FROM messages m 
          LEFT JOIN attendances a ON m.attendance_id = a.id 
          WHERE m.attendance_id IS NOT NULL AND m.attendance_id != '' AND a.id IS NULL
        `,
          )
          .all(rawOrphanMsgs)
      } catch (_) {}
      report.varredura_global.orphan_messages = rawOrphanMsgs

      // Varredura D: Stage transitions órfãs
      const rawOrphanTrans = []
      try {
        txApp
          .db()
          .newQuery(
            `
          SELECT st.id, st.attendance_id 
          FROM stage_transitions st 
          LEFT JOIN attendances a ON st.attendance_id = a.id 
          WHERE st.attendance_id IS NOT NULL AND st.attendance_id != '' AND a.id IS NULL
        `,
          )
          .all(rawOrphanTrans)
      } catch (_) {}
      report.varredura_global.orphan_transitions = rawOrphanTrans

      // Varredura E: Relações comerciais órfãs (quotes ou production_orders ou archived_deals com attendance_id inexistente)
      const rawOrphanComm = []
      try {
        txApp
          .db()
          .newQuery(
            `
          SELECT 'quote' as type, q.id, q.attendance_id FROM quotes q 
          LEFT JOIN attendances a ON q.attendance_id = a.id 
          WHERE q.attendance_id IS NOT NULL AND q.attendance_id != '' AND a.id IS NULL
          UNION ALL
          SELECT 'production_order' as type, po.id, po.attendance_id FROM production_orders po 
          LEFT JOIN attendances a ON po.attendance_id = a.id 
          WHERE po.attendance_id IS NOT NULL AND po.attendance_id != '' AND a.id IS NULL
          UNION ALL
          SELECT 'archived_deal' as type, ad.id, ad.attendance_id FROM archived_deals ad 
          LEFT JOIN attendances a ON ad.attendance_id = a.id 
          WHERE ad.attendance_id IS NOT NULL AND ad.attendance_id != '' AND a.id IS NULL
        `,
          )
          .all(rawOrphanComm)
      } catch (_) {}
      report.varredura_global.orphan_commercial_relations = rawOrphanComm

      // Varredura F: Attendances sem client (client_id nulo ou inexistente em clients)
      const rawAttsNoClient = []
      try {
        txApp
          .db()
          .newQuery(
            `
          SELECT a.id, a.client_id 
          FROM attendances a 
          LEFT JOIN clients c ON a.client_id = c.id 
          WHERE a.client_id IS NULL OR a.client_id = '' OR c.id IS NULL
        `,
          )
          .all(rawAttsNoClient)
      } catch (_) {}
      report.varredura_global.attendances_without_client = rawAttsNoClient

      // Varredura G: Client / Attendance incompatível (messages ou quotes onde client_id != attendance.client_id)
      const rawMismatch = []
      try {
        txApp
          .db()
          .newQuery(
            `
          SELECT m.id, m.client_id as msg_client, a.client_id as att_client 
          FROM messages m 
          JOIN attendances a ON m.attendance_id = a.id 
          WHERE m.client_id != a.client_id
        `,
          )
          .all(rawMismatch)
      } catch (_) {}
      report.varredura_global.client_attendance_mismatch = rawMismatch

      // Condição de sucesso integral para autorizar a migration com índices UNIQUE
      if (
        report.backup.confirmed &&
        report.mario.excess_archived &&
        report.mario.excess_relations_cleared &&
        report.gabriela.excess_archived &&
        report.gabriela.excess_relations_cleared &&
        report.varredura_global.duplicate_wamids.length === 0 &&
        report.varredura_global.clients_multiple_active_attendances.length === 0
      ) {
        report.unique_protections_ready = true
        report.etapa3_concluida = true
        report.status = 'SUCCESS_READY_FOR_UNIQUE_INDEXES'
      } else {
        report.unique_protections_ready = false
        report.status = 'COMPLETED_WITH_INCONSISTENCIES'
      }
    })
  } catch (txErr) {
    console.error('[ETAPA3 HOOK] Erro na transação de consolidação:', txErr)
    report.status = 'TRANSACTION_FAILED'
    report.error = String(txErr)
  }

  report.completed_at = new Date().toISOString()
  persistReport(report)

  return e.json(report.etapa3_concluida ? 200 : 500, {
    success: report.etapa3_concluida,
    report: report,
  })
})

// GET /backend/v1/crm/admin/etapa3/report
routerAdd('GET', '/backend/v1/crm/admin/etapa3/report', (e) => {
  let repRecord = null
  try {
    repRecord = $app.findFirstRecordByData('system_settings', 'setting_key', 'etapa3_report')
  } catch (_) {}

  if (!repRecord) {
    return e.json(404, {
      success: false,
      error: 'Relatório da Etapa 3 ainda não gerado.',
    })
  }

  let parsed = null
  try {
    parsed = JSON.parse(repRecord.get('setting_value'))
  } catch (_) {
    parsed = repRecord.get('setting_value')
  }

  return e.json(200, {
    success: true,
    report: parsed,
  })
})

console.log('[ETAPA3 HOOK] Endpoints registrados: POST e GET /backend/v1/crm/admin/etapa3/*')
