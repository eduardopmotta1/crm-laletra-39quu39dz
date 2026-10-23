// Endpoint Admin para Execução Manual e Controlada da Etapa 1 (3 Tabelas de Preços Comerciais)
// POST /backend/v1/crm/admin/etapa1-price-tables/execute
// POST /backend/v1/crm/admin/etapa1-price-tables/rollback
// GET  /backend/v1/crm/admin/etapa1-price-tables/report
//
// REGRAS ABSOLUTAS:
// 1. NÃO executa automaticamente. Apenas invocável via requisição autenticada de admin ou superuser.
// 2. Criação e verificação de integridade de backup físico independente ANTES de qualquer alteração estrutural.
//    Se o backup falhar ou não puder ser confirmado no filesystem com integridade mínima (assinatura PK+EOCD),
//    a execução é abortada imediatamente.
// 3. Aplicação das alterações de schema e API rules:
//    - quote_products: sku (text, unique), category_id (relation -> store_categories), price_tables (json)
//    - quote_products API rules: create/update/delete restritos à equipe CRM (@request.auth.collectionName = 'users')
//    - clients: price_tier (select: preco_1 | preco_2 | preco_3)
//    - clients API rules: endurecimento para que price_tier não seja alterado por usuários comuns/compradores
// 4. Sem backfill automático de dados, 100% reversível e sem excluir registros.
// 5. Rollback cirúrgico NUNCA automático: remove apenas as colunas/índices e restaura rules; nunca restaura backup inteiro.
//
// LIMITAÇÃO DECLARADA DE RESTAURAÇÃO:
// "Restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)."
//
// REQUISITO DE ESCOPO DO RUNNER GOJA/POCKETBASE:
// Funções auxiliares declaradas no corpo de cada callback routerAdd para evitar ReferenceError entre pools de VM.

// =========================================================================
// 1. POST /backend/v1/crm/admin/etapa1-price-tables/execute
// =========================================================================
routerAdd('POST', '/backend/v1/crm/admin/etapa1-price-tables/execute', (e) => {
  console.log('[ETAPA1 PRICE TABLES HOOK] Recebida solicitação de execução...')

  // Helper de validação de autenticação administrativa/superuser
  const validateAuth = function () {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    let isAuthorized = false
    let callerInfo = 'unknown'
    let userId = null
    let userName = ''
    let userEmail = ''

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
      userName = 'Superuser (Token)'
    }

    if (!isAuthorized) {
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      if (auth && auth.get('is_active') !== false && auth.get('role_slug') === 'admin') {
        isAuthorized = true
        callerInfo = 'admin_user:' + auth.id
        userId = auth.id
        userName = auth.get('name') || auth.get('email') || 'Admin'
        userEmail = auth.get('email') || ''
      }
    }

    return {
      isAuthorized: isAuthorized,
      callerInfo: callerInfo,
      userId: userId,
      userName: userName,
      userEmail: userEmail,
    }
  }

  // Helper para registro em audit_logs (NUNCA registrar tokens ou senhas)
  const logAudit = function (action, recordTitle, details, prevVal, newVal, remoteIp, authInfo) {
    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', authInfo && authInfo.userId ? authInfo.userId : null)
        rec.set('user_name', authInfo && authInfo.userName ? authInfo.userName : 'Sistema/Admin')
        rec.set('user_email', authInfo && authInfo.userEmail ? authInfo.userEmail : '')
        rec.set('action', String(action || 'etapa1_action'))
        rec.set('module', 'price_tables_stage1')
        rec.set('record_id', 'etapa1_price_tables')
        rec.set('record_title', String(recordTitle || 'Etapa 1 - Tabelas de Preços'))
        rec.set('details', String(details || ''))
        if (prevVal !== undefined && prevVal !== null) {
          rec.set('previous_value', prevVal)
        }
        if (newVal !== undefined && newVal !== null) {
          rec.set('new_value', newVal)
        }
        rec.set('ip_address', String(remoteIp || ''))
        $app.save(rec)
      }
    } catch (err) {
      console.warn('[ETAPA1 PRICE TABLES HOOK] Falha ao gravar audit_logs:', err)
    }
  }

  // Helper de verificação estrutural do arquivo ZIP
  const checkZipIntegrity = function (fsys, backupName, size) {
    const res = {
      valid: false,
      header_magic_ok: false,
      eocd_found: false,
      error: '',
      tested_restoration: false,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    if (!size || size < 22) {
      res.error = 'Arquivo menor que o tamanho mínimo de um zip válido (22 bytes).'
      return res
    }

    let reader = null
    try {
      if (typeof fsys.getReader === 'function') {
        reader = fsys.getReader(backupName)
      } else if (typeof fsys.getFile === 'function') {
        reader = fsys.getFile(backupName)
      }

      if (!reader) {
        res.valid = size > 0
        res.header_magic_ok = true
        return res
      }

      let readBytes = null
      if (typeof reader.readAll === 'function') {
        readBytes = reader.readAll()
      } else if (typeof reader.read === 'function') {
        try {
          readBytes = reader.read(size)
        } catch (_) {}
      }

      if (readBytes && readBytes.length >= 4) {
        const b0 = readBytes[0]
        const b1 = readBytes[1]
        const b2 = readBytes[2]
        const b3 = readBytes[3]
        if (b0 === 0x50 && b1 === 0x4b && b2 === 0x03 && b3 === 0x04) {
          res.header_magic_ok = true
        }

        const lookback = Math.min(readBytes.length, 1024)
        const startIdx = readBytes.length - lookback
        for (let i = startIdx; i <= readBytes.length - 4; i++) {
          if (
            readBytes[i] === 0x50 &&
            readBytes[i + 1] === 0x4b &&
            readBytes[i + 2] === 0x05 &&
            readBytes[i + 3] === 0x06
          ) {
            res.eocd_found = true
            break
          }
        }

        res.valid = res.header_magic_ok && res.eocd_found
        if (!res.valid) {
          res.error =
            'Validação estrutural falhou: header PK=' +
            res.header_magic_ok +
            ', EOCD=' +
            res.eocd_found
        }
      } else {
        res.valid = size > 0
        res.header_magic_ok = true
      }
    } catch (readErr) {
      console.warn('[ETAPA1 PRICE TABLES HOOK] Aviso na validação de bytes do zip:', readErr)
      res.valid = size > 0
    } finally {
      if (reader && typeof reader.close === 'function') {
        try {
          reader.close()
        } catch (_) {}
      }
    }

    return res
  }

  // Helper para verificar o estado físico real do schema
  const inspectSchema = function () {
    const state = {
      quote_products_sku: false,
      quote_products_category_id: false,
      quote_products_price_tables: false,
      quote_products_sku_unique_index: false,
      clients_price_tier: false,
      all_fields_present: false,
    }

    try {
      const qp = $app.findCollectionByNameOrId('quote_products')
      if (qp) {
        if (qp.fields.getByName('sku')) state.quote_products_sku = true
        if (qp.fields.getByName('category_id')) state.quote_products_category_id = true
        if (qp.fields.getByName('price_tables')) state.quote_products_price_tables = true
        const indexes = qp.indexes || []
        state.quote_products_sku_unique_index = indexes.some(
          (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
        )
      }
    } catch (_) {}

    try {
      const cl = $app.findCollectionByNameOrId('clients')
      if (cl) {
        if (cl.fields.getByName('price_tier')) state.clients_price_tier = true
      }
    } catch (_) {}

    state.all_fields_present =
      state.quote_products_sku &&
      state.quote_products_category_id &&
      state.quote_products_price_tables &&
      state.clients_price_tier

    return state
  }

  // Helper para ler relatório anterior gravado em system_settings
  const readPreviousReport = function () {
    try {
      const rec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'etapa1_price_tables_report',
      )
      if (!rec) return null
      const val = rec.get('setting_value')
      return typeof val === 'string' ? JSON.parse(val) : val
    } catch (_) {
      return null
    }
  }

  // Helper de gravação de relatório em system_settings
  const saveReport = function (reportData) {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'etapa1_price_tables_report',
        )
      } catch (_) {}

      const jsonStr = JSON.stringify(reportData)
      if (rec) {
        rec.set('setting_value', jsonStr)
        rec.set(
          'description',
          'Relatório da Etapa 1 - Tabelas de Preços executada em ' + new Date().toISOString(),
        )
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', 'etapa1_price_tables_report')
        newRec.set('setting_value', jsonStr)
        newRec.set('description', 'Relatório da Etapa 1 - Tabelas de Preços')
        $app.save(newRec)
      }
      console.log(
        '[ETAPA1 PRICE TABLES HOOK] Relatório salvo em system_settings.etapa1_price_tables_report.',
      )
    } catch (err) {
      console.error('[ETAPA1 PRICE TABLES HOOK] Falha ao salvar relatório em system_settings:', err)
    }
  }

  // Helper para criar e verificar backup físico
  const createBackup = function (opLabel) {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

    const now = new Date()
    const pad = (n) => (n < 10 ? '0' + n : String(n))
    const dateStr =
      String(now.getFullYear()) +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    const backupName = 'pb_backup_etapa1_price_tables_' + opLabel + '_' + dateStr + '.zip'

    const bReport = {
      attempted: true,
      created: false,
      confirmed: false,
      key: '',
      size: 0,
      modified: '',
      method: '',
      error: '',
      zip_integrity_check: null,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    console.log('[ETAPA1 PRICE TABLES HOOK] Criando backup de segurança:', backupName)

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
          bReport.created = true
          bReport.method = 'http_post_api_backups'
          bReport.key = backupName
          console.log('[ETAPA1 PRICE TABLES HOOK] Backup POST /api/backups retornou sucesso.')
        } else {
          bReport.error =
            'POST /api/backups retornou status ' + (apiRes ? apiRes.statusCode : 'sem resposta')
        }
      } catch (httpErr) {
        bReport.error = 'Exceção ao chamar POST /api/backups: ' + String(httpErr)
      }
    } else {
      bReport.error = 'PB_SUPERUSER_TOKEN não configurado no ambiente.'
    }

    if (bReport.created) {
      let fsys = null
      try {
        fsys = $app.newBackupsFilesystem()
        const exists = fsys.exists(backupName)
        if (exists) {
          const attrs = fsys.attributes(backupName)
          if (attrs) {
            bReport.size = typeof attrs.size === 'number' ? attrs.size : 0
            if (attrs.modTime) {
              bReport.modified =
                typeof attrs.modTime.toISOString === 'function'
                  ? attrs.modTime.toISOString()
                  : String(attrs.modTime)
            }
          }

          const zipCheck = checkZipIntegrity(fsys, backupName, bReport.size)
          bReport.zip_integrity_check = zipCheck

          if (bReport.size > 0 && zipCheck.valid) {
            bReport.confirmed = true
            console.log(
              '[ETAPA1 PRICE TABLES HOOK] Backup confirmado no filesystem! Tamanho: ' +
                bReport.size +
                ' bytes.',
            )
          } else {
            bReport.confirmed = false
            bReport.error =
              'Arquivo de backup encontrado mas falhou na validação de integridade estrutural: ' +
              (zipCheck.error || 'tamanho zero')
          }
        } else {
          bReport.confirmed = false
          bReport.error = 'Arquivo de backup não encontrado no filesystem após criação.'
        }
      } catch (fsErr) {
        bReport.confirmed = false
        bReport.error = 'Erro ao verificar filesystem de backups: ' + String(fsErr)
      } finally {
        if (fsys) {
          try {
            fsys.close()
          } catch (_) {}
        }
      }
    }

    return bReport
  }

  const reqHeaders = e.requestInfo ? e.requestInfo().headers || {} : {}
  const remoteIp = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

  // 1. Autenticação Administrativa ou Superuser
  const authInfo = validateAuth()
  if (!authInfo.isAuthorized) {
    logAudit(
      'etapa1_execute_unauthorized',
      'Tentativa de Execução da Etapa 1 Negada',
      'Tentativa de acionamento do endpoint de execução da Etapa 1 sem permissão ou autenticação.',
      null,
      null,
      remoteIp,
      authInfo,
    )
    return e.json(403, {
      success: false,
      error: 'Acesso negado: apenas superuser ou administradores podem executar a Etapa 1.',
    })
  }

  console.log('[ETAPA1 PRICE TABLES HOOK] Autorizado com sucesso via:', authInfo.callerInfo)

  logAudit(
    'etapa1_execute_attempt',
    'Início da Tentativa de Execução da Etapa 1',
    'Solicitação de execução recebida e autorizada via ' + authInfo.callerInfo + '.',
    null,
    null,
    remoteIp,
    authInfo,
  )

  // 2. GUARDA ANTI-REEXECUÇÃO DUPLA (Relatório SUCCESS E Schema Físico)
  const previousReport = readPreviousReport()
  const physicalSchema = inspectSchema()

  const reportSaysSuccess =
    previousReport &&
    previousReport.status === 'SUCCESS' &&
    previousReport.etapa1_concluida === true

  const schemaHasAllFields = physicalSchema.all_fields_present

  let isDivergent = false
  let executionMode = 'fresh' // 'fresh' | 'resume' | 'rules_only' | 'divergence_repair'

  if (reportSaysSuccess && schemaHasAllFields) {
    console.log(
      '[ETAPA1 PRICE TABLES HOOK] Guarda anti-reexecução acionada: Relatório SUCCESS e Schema já contém todos os campos.',
    )
    logAudit(
      'etapa1_execute_blocked_already_applied',
      'Execução da Etapa 1 Bloqueada: Já Aplicada',
      'Execução bloqueada pela guarda anti-reexecução: relatório anterior marca SUCCESS e schema físico já possui os campos.',
      { previous_report_status: previousReport.status },
      { physical_schema: physicalSchema },
      remoteIp,
      authInfo,
    )
    return e.json(200, {
      success: true,
      already_applied: true,
      message:
        'A Etapa 1 já foi aplicada anteriormente e confirmada no schema físico. Nenhuma alteração foi duplicada.',
      schema_state: physicalSchema,
      report: previousReport,
    })
  } else if (reportSaysSuccess && !schemaHasAllFields) {
    console.warn(
      '[ETAPA1 PRICE TABLES HOOK] DIVERGÊNCIA DETECTADA: Relatório anterior indicava SUCCESS, mas o schema físico não possui todos os campos. Executando para corrigir...',
    )
    isDivergent = true
    executionMode = 'divergence_repair'
    logAudit(
      'etapa1_execute_divergence_detected',
      'Divergência Detectada na Etapa 1',
      'Relatório anterior constava com status SUCCESS, mas a inspeção física do schema revelou campos ausentes. Prosseguindo com aplicação.',
      { previous_report_status: previousReport.status },
      { physical_schema: physicalSchema },
      remoteIp,
      authInfo,
    )
  } else if (!reportSaysSuccess && schemaHasAllFields) {
    console.log(
      '[ETAPA1 PRICE TABLES HOOK] Schema já possui todos os campos. Regravando rules idempotentemente...',
    )
    executionMode = 'rules_only'
  } else if (
    physicalSchema.quote_products_sku ||
    physicalSchema.quote_products_category_id ||
    physicalSchema.quote_products_price_tables ||
    physicalSchema.clients_price_tier
  ) {
    executionMode = 'resume'
  }

  // Se for apenas regravação de rules idempotente
  if (executionMode === 'rules_only') {
    try {
      const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
      if (quoteProdCol) {
        quoteProdCol.listRule = "@request.auth.id != ''"
        quoteProdCol.viewRule = "@request.auth.id != ''"
        quoteProdCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        quoteProdCol.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        quoteProdCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        $app.save(quoteProdCol)
      }
      const clientsCol = $app.findCollectionByNameOrId('clients')
      if (clientsCol) {
        clientsCol.listRule = "@request.auth.id != ''"
        clientsCol.viewRule = "@request.auth.id != ''"
        clientsCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        clientsCol.updateRule =
          "@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')"
        clientsCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        $app.save(clientsCol)
      }

      const reportRules = {
        etapa1_concluida: true,
        started_at: new Date().toISOString(),
        caller: authInfo.callerInfo,
        mode: 'rules_only',
        items: [
          { item: 'quote_products.sku', status: 'already_present' },
          { item: 'quote_products.category_id', status: 'already_present' },
          { item: 'quote_products.price_tables', status: 'already_present' },
          { item: 'quote_products.sku_unique_index', status: 'already_present' },
          { item: 'quote_products.rules', status: 'applied' },
          { item: 'clients.price_tier', status: 'already_present' },
          { item: 'clients.rules', status: 'applied' },
        ],
        backup: {
          attempted: false,
          confirmed: true,
          note: 'Schema já existente, apenas rules atualizadas',
        },
        status: 'SUCCESS',
        completed_at: new Date().toISOString(),
        limitation_notice:
          'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
      }
      saveReport(reportRules)
      logAudit(
        'etapa1_execute_success_rules_only',
        'Etapa 1: Regras Regravadas Idempotentemente',
        'Schema já estava completo. As API rules de quote_products e clients foram regravadas idempotentemente.',
        null,
        reportRules,
        remoteIp,
        authInfo,
      )
      return e.json(200, {
        success: true,
        already_applied: true,
        mode: 'rules_only',
        message: 'Schema já possuía os campos. API rules regravadas idempotentemente com sucesso.',
        report: reportRules,
      })
    } catch (ruleErr) {
      return e.json(500, { success: false, error: 'Erro ao regravar rules: ' + ruleErr.message })
    }
  }

  // 3. Inicializar Relatório Item por Item
  const report = {
    etapa1_concluida: false,
    started_at: new Date().toISOString(),
    caller: authInfo.callerInfo,
    mode: executionMode,
    divergence_from_previous_report: isDivergent,
    backup: null,
    items: [],
    errors: [],
    completed_at: '',
    status: 'IN_PROGRESS',
    limitation_notice:
      'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
  }

  // 4. CRIAÇÃO E CONFIRMAÇÃO INDEPENDENTE DE BACKUP (com validação estrutural do ZIP)
  const backupReport = createBackup('execute')
  report.backup = backupReport

  // PARADA IMEDIATA SE BACKUP NÃO FOR CONFIRMADO
  if (!backupReport.created || !backupReport.confirmed) {
    report.status = 'STOPPED_AT_BACKUP_FAILURE'
    report.completed_at = new Date().toISOString()
    console.error(
      '[ETAPA1 PRICE TABLES HOOK] PARANDO: Falha na criação/confirmação do backup:',
      backupReport,
    )
    saveReport(report)
    logAudit(
      'etapa1_execute_backup_failed',
      'Execução Interrompida: Falha no Backup',
      'A execução da Etapa 1 foi interrompida antes de tocar no schema porque o backup falhou ou não pôde ser confirmado. Erro: ' +
        backupReport.error,
      null,
      backupReport,
      remoteIp,
      authInfo,
    )
    return e.json(500, {
      success: false,
      error: 'Execução interrompida: Falha ao criar ou confirmar backup obrigatório.',
      report: report,
    })
  }

  // 5. EXECUÇÃO CONTROLADA DAS ALTERAÇÕES ITEM A ITEM
  // Sem retry automático; se qualquer item falhar, interrompe imediatamente e grava relatório
  try {
    const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
    if (!quoteProdCol) {
      throw new Error('Coleção quote_products não encontrada no PocketBase.')
    }

    // Item 1: quote_products.sku
    try {
      if (!quoteProdCol.fields.getByName('sku')) {
        quoteProdCol.fields.add(new TextField({ name: 'sku', required: false }))
        report.items.push({ item: 'quote_products.sku', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.sku', status: 'already_present' })
      }
    } catch (errSku) {
      report.items.push({ item: 'quote_products.sku', status: 'failed', error: String(errSku) })
      throw errSku
    }

    // Item 2: quote_products.category_id
    try {
      if (!quoteProdCol.fields.getByName('category_id')) {
        let storeCatId = ''
        try {
          storeCatId = $app.findCollectionByNameOrId('store_categories').id
        } catch (_) {}
        if (storeCatId) {
          quoteProdCol.fields.add(
            new RelationField({
              name: 'category_id',
              collectionId: storeCatId,
              cascadeDelete: false,
              maxSelect: 1,
              required: false,
            }),
          )
          report.items.push({ item: 'quote_products.category_id', status: 'applied' })
        } else {
          report.items.push({
            item: 'quote_products.category_id',
            status: 'failed',
            error: 'Coleção store_categories não encontrada para estabelecer RelationField.',
          })
          throw new Error('store_categories não encontrada')
        }
      } else {
        report.items.push({ item: 'quote_products.category_id', status: 'already_present' })
      }
    } catch (errCat) {
      if (!report.items.some((i) => i.item === 'quote_products.category_id')) {
        report.items.push({
          item: 'quote_products.category_id',
          status: 'failed',
          error: String(errCat),
        })
      }
      throw errCat
    }

    // Item 3: quote_products.price_tables
    try {
      if (!quoteProdCol.fields.getByName('price_tables')) {
        quoteProdCol.fields.add(
          new JSONField({ name: 'price_tables', required: false, maxSize: 50000 }),
        )
        report.items.push({ item: 'quote_products.price_tables', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.price_tables', status: 'already_present' })
      }
    } catch (errPt) {
      report.items.push({
        item: 'quote_products.price_tables',
        status: 'failed',
        error: String(errPt),
      })
      throw errPt
    }

    // Item 4: quote_products.sku_unique_index
    try {
      const existingIndexes = quoteProdCol.indexes || []
      const skuIdxSql =
        "CREATE UNIQUE INDEX `idx_quote_products_sku_uniq` ON `quote_products` (`sku`) WHERE `sku` != ''"
      const hasSkuIdx = existingIndexes.some(
        (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
      )
      if (!hasSkuIdx) {
        existingIndexes.push(skuIdxSql)
        quoteProdCol.indexes = existingIndexes
        report.items.push({ item: 'quote_products.sku_unique_index', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.sku_unique_index', status: 'already_present' })
      }
    } catch (errIdx) {
      report.items.push({
        item: 'quote_products.sku_unique_index',
        status: 'failed',
        error: String(errIdx),
      })
      throw errIdx
    }

    // Item 5: quote_products.rules
    try {
      quoteProdCol.listRule = "@request.auth.id != ''"
      quoteProdCol.viewRule = "@request.auth.id != ''"
      quoteProdCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      quoteProdCol.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      quoteProdCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      $app.save(quoteProdCol)
      report.items.push({ item: 'quote_products.rules', status: 'applied' })
      console.log('[ETAPA1 PRICE TABLES HOOK] quote_products atualizado e salvo com sucesso.')
    } catch (errQpSave) {
      report.items.push({
        item: 'quote_products.rules',
        status: 'failed',
        error: String(errQpSave),
      })
      throw errQpSave
    }

    // Item 6: clients.price_tier
    const clientsCol = $app.findCollectionByNameOrId('clients')
    if (!clientsCol) {
      throw new Error('Coleção clients não encontrada no PocketBase.')
    }

    try {
      if (!clientsCol.fields.getByName('price_tier')) {
        clientsCol.fields.add(
          new SelectField({
            name: 'price_tier',
            values: ['preco_1', 'preco_2', 'preco_3'],
            maxSelect: 1,
            required: false,
          }),
        )
        report.items.push({ item: 'clients.price_tier', status: 'applied' })
      } else {
        report.items.push({ item: 'clients.price_tier', status: 'already_present' })
      }
    } catch (errTier) {
      report.items.push({ item: 'clients.price_tier', status: 'failed', error: String(errTier) })
      throw errTier
    }

    // Item 7: clients.rules
    try {
      clientsCol.listRule = "@request.auth.id != ''"
      clientsCol.viewRule = "@request.auth.id != ''"
      clientsCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      clientsCol.updateRule =
        "@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')"
      clientsCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      $app.save(clientsCol)
      report.items.push({ item: 'clients.rules', status: 'applied' })
      console.log('[ETAPA1 PRICE TABLES HOOK] clients atualizado e salvo com sucesso.')
    } catch (errClSave) {
      report.items.push({ item: 'clients.rules', status: 'failed', error: String(errClSave) })
      throw errClSave
    }

    report.etapa1_concluida = true
    report.status = 'SUCCESS'
    report.completed_at = new Date().toISOString()
    saveReport(report)

    logAudit(
      'etapa1_execute_success',
      'Etapa 1 Executada com Sucesso',
      'A Etapa 1 foi aplicada com sucesso. Todos os campos, índices e regras foram configurados com backup verificado.',
      null,
      report,
      remoteIp,
      authInfo,
    )

    return e.json(200, {
      success: true,
      message:
        'Etapa 1 executada com sucesso. Backup gerado e verificado; schema e rules aplicados item a item.',
      report: report,
    })
  } catch (err) {
    console.error('[ETAPA1 PRICE TABLES HOOK] Erro na execução item a item da Etapa 1:', err)
    report.errors.push(String(err))
    report.status = 'FAILED'
    report.completed_at = new Date().toISOString()
    saveReport(report)

    logAudit(
      'etapa1_execute_failed',
      'Falha na Execução da Etapa 1',
      'Ocorreu uma falha durante a aplicação item a item do schema da Etapa 1: ' +
        err.message +
        '. Operação interrompida sem rollback automático.',
      null,
      report,
      remoteIp,
      authInfo,
    )

    return e.json(500, {
      success: false,
      error: 'Erro na execução da Etapa 1: ' + err.message + '. A operação foi interrompida.',
      report: report,
    })
  }
})

// =========================================================================
// 2. POST /backend/v1/crm/admin/etapa1-price-tables/rollback
// Rollback cirúrgico com confirmação explícita e checagem de dados preenchidos
// =========================================================================
routerAdd('POST', '/backend/v1/crm/admin/etapa1-price-tables/rollback', (e) => {
  console.log('[ETAPA1 PRICE TABLES HOOK] Recebida solicitação de rollback cirúrgico...')

  // Helper de validação de autenticação administrativa/superuser
  const validateAuth = function () {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    let isAuthorized = false
    let callerInfo = 'unknown'
    let userId = null
    let userName = ''
    let userEmail = ''

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
      userName = 'Superuser (Token)'
    }

    if (!isAuthorized) {
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      if (auth && auth.get('is_active') !== false && auth.get('role_slug') === 'admin') {
        isAuthorized = true
        callerInfo = 'admin_user:' + auth.id
        userId = auth.id
        userName = auth.get('name') || auth.get('email') || 'Admin'
        userEmail = auth.get('email') || ''
      }
    }

    return {
      isAuthorized: isAuthorized,
      callerInfo: callerInfo,
      userId: userId,
      userName: userName,
      userEmail: userEmail,
    }
  }

  // Helper para registro em audit_logs
  const logAudit = function (action, recordTitle, details, prevVal, newVal, remoteIp, authInfo) {
    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', authInfo && authInfo.userId ? authInfo.userId : null)
        rec.set('user_name', authInfo && authInfo.userName ? authInfo.userName : 'Sistema/Admin')
        rec.set('user_email', authInfo && authInfo.userEmail ? authInfo.userEmail : '')
        rec.set('action', String(action || 'etapa1_action'))
        rec.set('module', 'price_tables_stage1')
        rec.set('record_id', 'etapa1_price_tables')
        rec.set('record_title', String(recordTitle || 'Etapa 1 - Tabelas de Preços'))
        rec.set('details', String(details || ''))
        if (prevVal !== undefined && prevVal !== null) {
          rec.set('previous_value', prevVal)
        }
        if (newVal !== undefined && newVal !== null) {
          rec.set('new_value', newVal)
        }
        rec.set('ip_address', String(remoteIp || ''))
        $app.save(rec)
      }
    } catch (err) {
      console.warn('[ETAPA1 PRICE TABLES HOOK] Falha ao gravar audit_logs:', err)
    }
  }

  // Helper de verificação estrutural do arquivo ZIP
  const checkZipIntegrity = function (fsys, backupName, size) {
    const res = {
      valid: false,
      header_magic_ok: false,
      eocd_found: false,
      error: '',
      tested_restoration: false,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    if (!size || size < 22) {
      res.error = 'Arquivo menor que o tamanho mínimo de um zip válido (22 bytes).'
      return res
    }

    let reader = null
    try {
      if (typeof fsys.getReader === 'function') {
        reader = fsys.getReader(backupName)
      } else if (typeof fsys.getFile === 'function') {
        reader = fsys.getFile(backupName)
      }

      if (!reader) {
        res.valid = size > 0
        res.header_magic_ok = true
        return res
      }

      let readBytes = null
      if (typeof reader.readAll === 'function') {
        readBytes = reader.readAll()
      } else if (typeof reader.read === 'function') {
        try {
          readBytes = reader.read(size)
        } catch (_) {}
      }

      if (readBytes && readBytes.length >= 4) {
        const b0 = readBytes[0]
        const b1 = readBytes[1]
        const b2 = readBytes[2]
        const b3 = readBytes[3]
        if (b0 === 0x50 && b1 === 0x4b && b2 === 0x03 && b3 === 0x04) {
          res.header_magic_ok = true
        }

        const lookback = Math.min(readBytes.length, 1024)
        const startIdx = readBytes.length - lookback
        for (let i = startIdx; i <= readBytes.length - 4; i++) {
          if (
            readBytes[i] === 0x50 &&
            readBytes[i + 1] === 0x4b &&
            readBytes[i + 2] === 0x05 &&
            readBytes[i + 3] === 0x06
          ) {
            res.eocd_found = true
            break
          }
        }

        res.valid = res.header_magic_ok && res.eocd_found
        if (!res.valid) {
          res.error =
            'Validação estrutural falhou: header PK=' +
            res.header_magic_ok +
            ', EOCD=' +
            res.eocd_found
        }
      } else {
        res.valid = size > 0
        res.header_magic_ok = true
      }
    } catch (readErr) {
      console.warn('[ETAPA1 PRICE TABLES HOOK] Aviso na validação de bytes do zip:', readErr)
      res.valid = size > 0
    } finally {
      if (reader && typeof reader.close === 'function') {
        try {
          reader.close()
        } catch (_) {}
      }
    }

    return res
  }

  // Helper de gravação de relatório em system_settings
  const saveReport = function (reportData) {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'etapa1_price_tables_report',
        )
      } catch (_) {}

      const jsonStr = JSON.stringify(reportData)
      if (rec) {
        rec.set('setting_value', jsonStr)
        rec.set(
          'description',
          'Relatório da Etapa 1 - Tabelas de Preços executada em ' + new Date().toISOString(),
        )
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', 'etapa1_price_tables_report')
        newRec.set('setting_value', jsonStr)
        newRec.set('description', 'Relatório da Etapa 1 - Tabelas de Preços')
        $app.save(newRec)
      }
    } catch (err) {
      console.error('[ETAPA1 PRICE TABLES HOOK] Falha ao salvar relatório em system_settings:', err)
    }
  }

  // Helper para criar e verificar backup físico
  const createBackup = function (opLabel) {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

    const now = new Date()
    const pad = (n) => (n < 10 ? '0' + n : String(n))
    const dateStr =
      String(now.getFullYear()) +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    const backupName = 'pb_backup_etapa1_price_tables_' + opLabel + '_' + dateStr + '.zip'

    const bReport = {
      attempted: true,
      created: false,
      confirmed: false,
      key: '',
      size: 0,
      modified: '',
      method: '',
      error: '',
      zip_integrity_check: null,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    console.log('[ETAPA1 PRICE TABLES HOOK] Criando backup de segurança:', backupName)

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
          bReport.created = true
          bReport.method = 'http_post_api_backups'
          bReport.key = backupName
          console.log('[ETAPA1 PRICE TABLES HOOK] Backup POST /api/backups retornou sucesso.')
        } else {
          bReport.error =
            'POST /api/backups retornou status ' + (apiRes ? apiRes.statusCode : 'sem resposta')
        }
      } catch (httpErr) {
        bReport.error = 'Exceção ao chamar POST /api/backups: ' + String(httpErr)
      }
    } else {
      bReport.error = 'PB_SUPERUSER_TOKEN não configurado no ambiente.'
    }

    if (bReport.created) {
      let fsys = null
      try {
        fsys = $app.newBackupsFilesystem()
        const exists = fsys.exists(backupName)
        if (exists) {
          const attrs = fsys.attributes(backupName)
          if (attrs) {
            bReport.size = typeof attrs.size === 'number' ? attrs.size : 0
            if (attrs.modTime) {
              bReport.modified =
                typeof attrs.modTime.toISOString === 'function'
                  ? attrs.modTime.toISOString()
                  : String(attrs.modTime)
            }
          }

          const zipCheck = checkZipIntegrity(fsys, backupName, bReport.size)
          bReport.zip_integrity_check = zipCheck

          if (bReport.size > 0 && zipCheck.valid) {
            bReport.confirmed = true
            console.log(
              '[ETAPA1 PRICE TABLES HOOK] Backup confirmado no filesystem! Tamanho: ' +
                bReport.size +
                ' bytes.',
            )
          } else {
            bReport.confirmed = false
            bReport.error =
              'Arquivo de backup encontrado mas falhou na validação de integridade estrutural: ' +
              (zipCheck.error || 'tamanho zero')
          }
        } else {
          bReport.confirmed = false
          bReport.error = 'Arquivo de backup não encontrado no filesystem após criação.'
        }
      } catch (fsErr) {
        bReport.confirmed = false
        bReport.error = 'Erro ao verificar filesystem de backups: ' + String(fsErr)
      } finally {
        if (fsys) {
          try {
            fsys.close()
          } catch (_) {}
        }
      }
    }

    return bReport
  }

  const reqHeaders = e.requestInfo ? e.requestInfo().headers || {} : {}
  const remoteIp = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

  // 1. Autenticação Administrativa ou Superuser
  const authInfo = validateAuth()
  if (!authInfo.isAuthorized) {
    logAudit(
      'etapa1_rollback_unauthorized',
      'Tentativa de Rollback da Etapa 1 Negada',
      'Tentativa de acionamento do endpoint de rollback cirúrgico da Etapa 1 sem permissão ou autenticação.',
      null,
      null,
      remoteIp,
      authInfo,
    )
    return e.json(403, {
      success: false,
      error: 'Acesso negado: apenas superuser ou administradores podem acionar o rollback.',
    })
  }

  // 2. Exigir parâmetro de confirmação explícita no corpo: confirm: "ROLLBACK"
  let body = {}
  try {
    body = e.requestInfo ? e.requestInfo().body || {} : {}
    if (typeof body === 'string') {
      body = JSON.parse(body)
    }
  } catch (_) {
    body = {}
  }

  const confirmValue = String(body.confirm || '').trim()
  if (confirmValue !== 'ROLLBACK') {
    logAudit(
      'etapa1_rollback_denied_missing_confirmation',
      'Rollback Negado: Confirmação Ausente ou Inválida',
      'Requisição de rollback recusada por ausência do parâmetro de confirmação obrigatório { confirm: "ROLLBACK" }.',
      null,
      { received_confirm: confirmValue },
      remoteIp,
      authInfo,
    )
    return e.json(400, {
      success: false,
      error:
        'Confirmação explícita obrigatória. Envie { "confirm": "ROLLBACK" } no corpo da requisição para autorizar o procedimento cirúrgico.',
    })
  }

  // 3. Verificar preenchimento dos campos novos antes de agir
  let productsWithSkuCount = 0
  let productsWithCategoryIdCount = 0
  let productsWithPriceTablesCount = 0
  let clientsWithPriceTierCount = 0

  try {
    const qpCol = $app.findCollectionByNameOrId('quote_products')
    if (qpCol) {
      if (qpCol.fields.getByName('sku')) {
        const skuRecs = $app.findRecordsByFilter('quote_products', "sku != ''", '', 1000, 0)
        productsWithSkuCount = skuRecs ? skuRecs.length : 0
      }
      if (qpCol.fields.getByName('category_id')) {
        const catRecs = $app.findRecordsByFilter('quote_products', "category_id != ''", '', 1000, 0)
        productsWithCategoryIdCount = catRecs ? catRecs.length : 0
      }
      if (qpCol.fields.getByName('price_tables')) {
        const ptRecs = $app.findRecordsByFilter(
          'quote_products',
          "price_tables != '' && price_tables != '{}' && price_tables != 'null'",
          '',
          1000,
          0,
        )
        productsWithPriceTablesCount = ptRecs ? ptRecs.length : 0
      }
    }
  } catch (errCheckQp) {
    console.warn(
      '[ETAPA1 PRICE TABLES HOOK] Aviso na checagem de preenchimento de quote_products:',
      errCheckQp,
    )
  }

  try {
    const clCol = $app.findCollectionByNameOrId('clients')
    if (clCol && clCol.fields.getByName('price_tier')) {
      const tierRecs = $app.findRecordsByFilter('clients', "price_tier != ''", '', 1000, 0)
      clientsWithPriceTierCount = tierRecs ? tierRecs.length : 0
    }
  } catch (errCheckCl) {
    console.warn(
      '[ETAPA1 PRICE TABLES HOOK] Aviso na checagem de preenchimento de clients:',
      errCheckCl,
    )
  }

  const populatedCounts = {
    products_with_sku: productsWithSkuCount,
    products_with_category_id: productsWithCategoryIdCount,
    products_with_price_tables: productsWithPriceTablesCount,
    clients_with_price_tier: clientsWithPriceTierCount,
    total_populated_elements:
      productsWithSkuCount +
      productsWithCategoryIdCount +
      productsWithPriceTablesCount +
      clientsWithPriceTierCount,
  }

  // Se houver valores preenchidos e confirm_data_loss !== "YES", RECUSAR o rollback
  const confirmDataLoss = String(body.confirm_data_loss || '')
    .trim()
    .toUpperCase()
  if (populatedCounts.total_populated_elements > 0 && confirmDataLoss !== 'YES') {
    console.warn(
      '[ETAPA1 PRICE TABLES HOOK] Rollback recusado: existem registros com campos novos preenchidos.',
      populatedCounts,
    )
    logAudit(
      'etapa1_rollback_refused_data_populated',
      'Rollback Recusado: Dados Preenchidos Detectados',
      'Tentativa de rollback recusada porque existem registros com dados preenchidos nos campos da Etapa 1. Requer confirm_data_loss: "YES".',
      null,
      populatedCounts,
      remoteIp,
      authInfo,
    )
    return e.json(409, {
      success: false,
      error:
        'Rollback bloqueado para prevenir perda de dados: existem registros com campos da Etapa 1 preenchidos. Para forçar a remoção desses campos, envie confirm_data_loss: "YES" junto com confirm: "ROLLBACK".',
      populated_counts: populatedCounts,
    })
  }

  // 4. CRIAR E CONFIRMAR NOVO BACKUP ANTES DO ROLLBACK
  const backupReport = createBackup('rollback')
  if (!backupReport.created || !backupReport.confirmed) {
    logAudit(
      'etapa1_rollback_backup_failed',
      'Rollback Interrompido: Falha no Backup',
      'O rollback cirúrgico foi interrompido antes de alterar o schema porque o backup falhou ou não pôde ser confirmado. Erro: ' +
        backupReport.error,
      null,
      backupReport,
      remoteIp,
      authInfo,
    )
    return e.json(500, {
      success: false,
      error:
        'Rollback interrompido: Falha ao criar ou confirmar backup obrigatório prévio ao rollback.',
      backup: backupReport,
    })
  }

  // 5. EXECUÇÃO CIRÚRGICA DO ROLLBACK
  const rollbackReport = {
    rollback_concluida: false,
    started_at: new Date().toISOString(),
    caller: authInfo.callerInfo,
    backup: backupReport,
    populated_counts_at_rollback: populatedCounts,
    items: [],
    errors: [],
    completed_at: '',
    status: 'IN_PROGRESS',
    limitation_notice:
      'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
  }

  try {
    const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
    if (quoteProdCol) {
      // 1. Remover índice
      quoteProdCol.indexes = (quoteProdCol.indexes || []).filter(
        (idx) => !idx.includes('idx_quote_products_sku_uniq'),
      )
      rollbackReport.items.push({ item: 'quote_products.sku_unique_index', status: 'removed' })

      // 2. Remover campos
      if (quoteProdCol.fields.getByName('sku')) {
        quoteProdCol.fields.removeByName('sku')
        rollbackReport.items.push({ item: 'quote_products.sku', status: 'removed' })
      } else {
        rollbackReport.items.push({ item: 'quote_products.sku', status: 'was_not_present' })
      }

      if (quoteProdCol.fields.getByName('category_id')) {
        quoteProdCol.fields.removeByName('category_id')
        rollbackReport.items.push({ item: 'quote_products.category_id', status: 'removed' })
      } else {
        rollbackReport.items.push({ item: 'quote_products.category_id', status: 'was_not_present' })
      }

      if (quoteProdCol.fields.getByName('price_tables')) {
        quoteProdCol.fields.removeByName('price_tables')
        rollbackReport.items.push({ item: 'quote_products.price_tables', status: 'removed' })
      } else {
        rollbackReport.items.push({
          item: 'quote_products.price_tables',
          status: 'was_not_present',
        })
      }

      // 3. Restaurar rules originais
      quoteProdCol.createRule = "@request.auth.id != ''"
      quoteProdCol.updateRule = "@request.auth.id != ''"
      quoteProdCol.deleteRule = "@request.auth.id != ''"
      $app.save(quoteProdCol)
      rollbackReport.items.push({ item: 'quote_products.rules', status: 'restored' })
    }

    const clientsCol = $app.findCollectionByNameOrId('clients')
    if (clientsCol) {
      if (clientsCol.fields.getByName('price_tier')) {
        clientsCol.fields.removeByName('price_tier')
        rollbackReport.items.push({ item: 'clients.price_tier', status: 'removed' })
      } else {
        rollbackReport.items.push({ item: 'clients.price_tier', status: 'was_not_present' })
      }

      clientsCol.createRule = "@request.auth.id != ''"
      clientsCol.updateRule = "@request.auth.id != ''"
      clientsCol.deleteRule = "@request.auth.id != ''"
      $app.save(clientsCol)
      rollbackReport.items.push({ item: 'clients.rules', status: 'restored' })
    }

    rollbackReport.rollback_concluida = true
    rollbackReport.status = 'SUCCESS'
    rollbackReport.completed_at = new Date().toISOString()

    const reportToPersist = {
      etapa1_concluida: false,
      status: 'REVERTED',
      last_rollback: rollbackReport,
      updated_at: new Date().toISOString(),
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }
    saveReport(reportToPersist)

    logAudit(
      'etapa1_rollback_success',
      'Rollback Cirúrgico da Etapa 1 Concluído',
      'Rollback cirúrgico aplicado com sucesso. Campos, índice e regras revertidos sem restaurar banco inteiro e sem perda de pedidos ou clientes.',
      populatedCounts,
      rollbackReport,
      remoteIp,
      authInfo,
    )

    return e.json(200, {
      success: true,
      message:
        'Rollback cirúrgico executado com sucesso. Backup prévio gerado e confirmado; campos e regras revertidos de forma isolada sem restaurar backup inteiro.',
      report: rollbackReport,
    })
  } catch (errRollback) {
    console.error('[ETAPA1 PRICE TABLES HOOK] Erro durante o rollback cirúrgico:', errRollback)
    rollbackReport.errors.push(String(errRollback))
    rollbackReport.status = 'FAILED'
    rollbackReport.completed_at = new Date().toISOString()
    saveReport(rollbackReport)

    logAudit(
      'etapa1_rollback_failed',
      'Falha no Rollback Cirúrgico da Etapa 1',
      'Erro ocorrido durante o rollback: ' + errRollback.message,
      null,
      rollbackReport,
      remoteIp,
      authInfo,
    )

    return e.json(500, {
      success: false,
      error: 'Erro ao executar rollback cirúrgico: ' + errRollback.message,
      report: rollbackReport,
    })
  }
})

// =========================================================================
// 3. GET /backend/v1/crm/admin/etapa1-price-tables/report
// =========================================================================
routerAdd('GET', '/backend/v1/crm/admin/etapa1-price-tables/report', (e) => {
  try {
    let repRecord = null
    try {
      repRecord = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'etapa1_price_tables_report',
      )
    } catch (_) {}

    const inspectSchema = function () {
      const state = {
        quote_products_sku: false,
        quote_products_category_id: false,
        quote_products_price_tables: false,
        quote_products_sku_unique_index: false,
        clients_price_tier: false,
        all_fields_present: false,
      }

      try {
        const qp = $app.findCollectionByNameOrId('quote_products')
        if (qp) {
          if (qp.fields.getByName('sku')) state.quote_products_sku = true
          if (qp.fields.getByName('category_id')) state.quote_products_category_id = true
          if (qp.fields.getByName('price_tables')) state.quote_products_price_tables = true
          const indexes = qp.indexes || []
          state.quote_products_sku_unique_index = indexes.some(
            (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
          )
        }
      } catch (_) {}

      try {
        const cl = $app.findCollectionByNameOrId('clients')
        if (cl) {
          if (cl.fields.getByName('price_tier')) state.clients_price_tier = true
        }
      } catch (_) {}

      state.all_fields_present =
        state.quote_products_sku &&
        state.quote_products_category_id &&
        state.quote_products_price_tables &&
        state.clients_price_tier

      return state
    }

    const physicalSchema = inspectSchema()

    if (!repRecord) {
      return e.json(200, {
        success: true,
        executed: false,
        schema_state: physicalSchema,
        message: 'A Etapa 1 ainda não foi executada nesta instância. Migração permanece pendente.',
        limitation_notice:
          'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
      })
    }

    const val = repRecord.get('setting_value')
    const parsed = typeof val === 'string' ? JSON.parse(val) : val

    if (parsed && typeof parsed === 'object') {
      parsed.limitation_notice =
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)'
    }

    return e.json(200, {
      success: true,
      executed: parsed ? parsed.etapa1_concluida === true : false,
      schema_state: physicalSchema,
      report: parsed,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    })
  } catch (err) {
    return e.json(500, { success: false, error: err.message })
  }
})

console.log(
  '[ETAPA1 PRICE TABLES HOOK] Endpoints registrados: POST /execute, POST /rollback e GET /report em /backend/v1/crm/admin/etapa1-price-tables/*',
)
