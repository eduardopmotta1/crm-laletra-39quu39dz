// Endpoint Admin para Execução Manual e Controlada da Etapa 1 (3 Tabelas de Preços Comerciais)
// POST /backend/v1/crm/admin/etapa1-price-tables/execute
// GET  /backend/v1/crm/admin/etapa1-price-tables/report
//
// REGRAS ABSOLUTAS:
// 1. NÃO executa automaticamente. Apenas invocável via requisição autenticada de admin ou superuser.
// 2. Criação e verificação de backup físico independente ANTES de qualquer alteração estrutural.
//    Se o backup falhar ou não puder ser confirmado no filesystem, a execução é abortada imediatamente.
// 3. Aplicação das alterações de schema e API rules:
//    - quote_products: sku (text, unique), category_id (relation -> store_categories), price_tables (json)
//    - quote_products API rules: create/update/delete restritos à equipe CRM (@request.auth.collectionName = 'users')
//    - clients: price_tier (select: preco_1 | preco_2 | preco_3)
//    - clients API rules: endurecimento para que price_tier não seja alterado por usuários comuns/compradores
// 4. Sem backfill automático de dados, 100% reversível e sem excluir registros.

routerAdd('POST', '/backend/v1/crm/admin/etapa1-price-tables/execute', (e) => {
  console.log('[ETAPA1 PRICE TABLES HOOK] Recebida solicitação de execução...')

  // Helper de gravação de relatório em system_settings
  const persistReport = function (reportData) {
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

  // 1. Autenticação Administrativa ou Superuser
  const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
  const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

  let isAuthorized = false
  let callerInfo = 'unknown'

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
      error: 'Acesso negado: apenas superuser ou administradores podem executar a Etapa 1.',
    })
  }

  console.log('[ETAPA1 PRICE TABLES HOOK] Autorizado com sucesso via:', callerInfo)

  const report = {
    etapa1_concluida: false,
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
    schema_applied: {
      quote_products_sku: false,
      quote_products_category_id: false,
      quote_products_price_tables: false,
      quote_products_sku_unique_index: false,
      quote_products_rules_hardened: false,
      clients_price_tier: false,
      clients_rules_hardened: false,
    },
    errors: [],
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
  const backupName = 'pb_backup_etapa1_price_tables_' + dateStr + '.zip'

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
        report.backup.created = true
        report.backup.method = 'http_post_api_backups'
        report.backup.key = backupName
        console.log('[ETAPA1 PRICE TABLES HOOK] Backup POST /api/backups retornou sucesso.')
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
          '[ETAPA1 PRICE TABLES HOOK] Backup confirmado no filesystem! Tamanho: ' +
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

  // PARADA IMEDIATA SE BACKUP NÃO FOR CONFIRMADO
  if (!report.backup.created || !report.backup.confirmed) {
    report.status = 'STOPPED_AT_BACKUP_FAILURE'
    report.completed_at = new Date().toISOString()
    console.error(
      '[ETAPA1 PRICE TABLES HOOK] PARANDO: Falha na criação/confirmação do backup:',
      report.backup,
    )
    persistReport(report)
    return e.json(500, {
      success: false,
      error: 'Execução interrompida: Falha ao criar ou confirmar backup obrigatório.',
      report: report,
    })
  }

  // 3. EXECUÇÃO CONTROLADA DAS ALTERAÇÕES NO SCHEMA
  try {
    // A) Alterações em quote_products
    const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
    if (quoteProdCol) {
      if (!quoteProdCol.fields.getByName('sku')) {
        quoteProdCol.fields.add(new TextField({ name: 'sku', required: false }))
        report.schema_applied.quote_products_sku = true
      }

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
          report.schema_applied.quote_products_category_id = true
        }
      }

      if (!quoteProdCol.fields.getByName('price_tables')) {
        quoteProdCol.fields.add(
          new JSONField({ name: 'price_tables', required: false, maxSize: 50000 }),
        )
        report.schema_applied.quote_products_price_tables = true
      }

      // Adicionar índice único para SKU
      const existingIndexes = quoteProdCol.indexes || []
      const skuIdxSql =
        "CREATE UNIQUE INDEX `idx_quote_products_sku_uniq` ON `quote_products` (`sku`) WHERE `sku` != ''"
      const hasSkuIdx = existingIndexes.some(
        (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
      )
      if (!hasSkuIdx) {
        existingIndexes.push(skuIdxSql)
        quoteProdCol.indexes = existingIndexes
        report.schema_applied.quote_products_sku_unique_index = true
      }

      // Endurecimento de API rules em quote_products
      quoteProdCol.listRule = "@request.auth.id != ''"
      quoteProdCol.viewRule = "@request.auth.id != ''"
      quoteProdCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      quoteProdCol.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      quoteProdCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      report.schema_applied.quote_products_rules_hardened = true

      $app.save(quoteProdCol)
      console.log('[ETAPA1 PRICE TABLES HOOK] quote_products atualizado com sucesso.')
    }

    // B) Alterações em clients
    const clientsCol = $app.findCollectionByNameOrId('clients')
    if (clientsCol) {
      if (!clientsCol.fields.getByName('price_tier')) {
        clientsCol.fields.add(
          new SelectField({
            name: 'price_tier',
            values: ['preco_1', 'preco_2', 'preco_3'],
            maxSelect: 1,
            required: false,
          }),
        )
        report.schema_applied.clients_price_tier = true
      }

      // Endurecimento de API rules em clients:
      // Apenas admin e gerente podem alterar o price_tier. Usuários comuns/compradores da loja são bloqueados.
      clientsCol.listRule = "@request.auth.id != ''"
      clientsCol.viewRule = "@request.auth.id != ''"
      clientsCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      clientsCol.updateRule =
        "@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')"
      clientsCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      report.schema_applied.clients_rules_hardened = true

      $app.save(clientsCol)
      console.log('[ETAPA1 PRICE TABLES HOOK] clients atualizado com sucesso.')
    }

    report.etapa1_concluida = true
    report.status = 'SUCCESS'
    report.completed_at = new Date().toISOString()
    persistReport(report)

    return e.json(200, {
      success: true,
      message:
        'Etapa 1 executada com sucesso. Backup gerado e verificado; schema e rules aplicados.',
      report: report,
    })
  } catch (err) {
    console.error('[ETAPA1 PRICE TABLES HOOK] Erro na execução da Etapa 1:', err)
    report.errors.push(String(err))
    report.status = 'FAILED'
    report.completed_at = new Date().toISOString()
    persistReport(report)

    return e.json(500, {
      success: false,
      error: 'Erro na execução da Etapa 1: ' + err.message,
      report: report,
    })
  }
})

// GET /backend/v1/crm/admin/etapa1-price-tables/report
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

    if (!repRecord) {
      return e.json(200, {
        success: true,
        executed: false,
        message: 'A Etapa 1 ainda não foi executada nesta instância. Migração permanece pendente.',
      })
    }

    const val = repRecord.get('setting_value')
    const parsed = typeof val === 'string' ? JSON.parse(val) : val
    return e.json(200, {
      success: true,
      executed: true,
      report: parsed,
    })
  } catch (err) {
    return e.json(500, { success: false, error: err.message })
  }
})

console.log(
  '[ETAPA1 PRICE TABLES HOOK] Endpoints registrados: POST e GET /backend/v1/crm/admin/etapa1-price-tables/*',
)
