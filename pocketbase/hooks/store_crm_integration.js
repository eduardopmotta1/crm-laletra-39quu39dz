/**
 * Hook de Backend PocketBase: Integração de Produtos CRM <-> Laletra Store (Fase 1)
 *
 * Endpoints autenticados exclusivamente para equipe CRM (com permissão validada):
 * - POST /backend/v1/crm/products/{id}/store-link      -> Vincula produto da loja existente ao mestre CRM
 * - POST /backend/v1/crm/products/{id}/store-unlink    -> Desvincula publicação do mestre CRM
 * - POST /backend/v1/crm/products/{id}/store-draft     -> Cria rascunho de publicação na loja a partir do mestre
 * - POST /backend/v1/crm/products/{id}/store-publish   -> Publica produto na loja (exige mestre ativo, categoria e preço)
 * - POST /backend/v1/crm/products/{id}/store-unpublish -> Despublica produto da loja (published = false)
 * - GET  /backend/v1/crm/products/{id}/store-status    -> Consulta status detalhado do vínculo com a loja
 *
 * Todas as operações administrativas gravam registros em audit_logs.
 * Proteção adicional: Interceptadores onRecord*Request garantem que apenas equipe CRM altere store_products.
 * Nota de arquitetura JSVM PocketBase: Toda função/lógica deve ser inline em cada callback.
 */

// =========================================================================
// 1. POST /backend/v1/crm/products/{id}/store-link
// =========================================================================
routerAdd('POST', '/backend/v1/crm/products/{id}/store-link', (c) => {
  try {
    const auth = c.auth || (c.httpContext ? c.httpContext.get('auth') : null)
    if (!auth) {
      return c.json(401, { success: false, error: 'Autenticação necessária.' })
    }
    const colName = (auth.collection && auth.collection().name) || ''
    if (colName && colName !== 'users') {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: compradores da loja não possuem permissão administrativa.',
      })
    }
    if (auth.get('is_active') === false) {
      return c.json(403, { success: false, error: 'Usuário CRM inativo.' })
    }
    const roleSlug = auth.get('role_slug') || ''
    const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
    if (roleSlug && !allowedRoles.includes(roleSlug)) {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      })
    }

    const quoteProductId = c.request.pathValue('id')
    if (!quoteProductId) {
      return c.json(400, { success: false, error: 'ID do produto mestre CRM é obrigatório.' })
    }

    const master = $app.findRecordById('quote_products', quoteProductId)
    if (!master) {
      return c.json(404, { success: false, error: 'Produto mestre CRM não encontrado.' })
    }

    const body = c.requestInfo().body || {}
    const storeProductId = String(body.store_product_id || '').trim()
    if (!storeProductId) {
      return c.json(400, {
        success: false,
        error: 'ID da publicação da loja (store_product_id) é obrigatório.',
      })
    }

    const storeProduct = $app.findRecordById('store_products', storeProductId)
    if (!storeProduct) {
      return c.json(404, { success: false, error: 'Publicação da loja não encontrada.' })
    }

    // Regra de Integridade: Garantir unicidade 1:1
    // A) Verificar se já existe outro store_product vinculado a este quote_product
    const existingForMaster = $app.findRecordsByFilter(
      'store_products',
      'quote_product_id = {:qid} && id != {:spid}',
      '',
      1,
      0,
      { qid: quoteProductId, spid: storeProductId },
    )
    if (existingForMaster && existingForMaster.length > 0) {
      return c.json(400, {
        success: false,
        error:
          'Este produto mestre já possui outra publicação vinculada na loja ("' +
          existingForMaster[0].getString('name') +
          '", ID: ' +
          existingForMaster[0].id +
          '). Desvincule-a primeiro.',
      })
    }

    // B) Verificar se este store_product já está vinculado a outro mestre CRM
    const currentQuoteProdId = storeProduct.getString('quote_product_id')
    if (currentQuoteProdId && currentQuoteProdId !== quoteProductId) {
      return c.json(400, {
        success: false,
        error:
          'Esta publicação da loja já está vinculada a outro produto mestre CRM (ID: ' +
          currentQuoteProdId +
          '). Desvincule-a antes de reassociar.',
      })
    }

    const prevSnapshot = storeProduct.publicExport()
    storeProduct.set('quote_product_id', quoteProductId)
    $app.save(storeProduct)

    const newSnapshot = storeProduct.publicExport()
    const reqHeaders = c.requestInfo() ? c.requestInfo().headers || {} : {}
    const remoteIP = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', auth ? auth.id : null)
        rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
        rec.set('user_email', auth ? auth.get('email') || '' : '')
        rec.set('action', 'store_link')
        rec.set('module', 'store_products')
        rec.set('record_id', String(storeProduct.id || ''))
        rec.set('record_title', String(storeProduct.getString('name') || ''))
        rec.set(
          'details',
          'Vínculo manual estabelecido entre mestre CRM "' +
            master.getString('name') +
            '" (' +
            master.id +
            ') e publicação da loja "' +
            storeProduct.getString('name') +
            '" (' +
            storeProduct.id +
            ').',
        )
        rec.set('previous_value', prevSnapshot)
        rec.set('new_value', newSnapshot)
        rec.set('ip_address', String(remoteIP || ''))
        $app.save(rec)
      }
    } catch (auditErr) {
      console.warn('[STORE CRM INTEGRATION] Falha ao gravar audit_logs:', auditErr)
    }

    return c.json(200, {
      success: true,
      message: 'Produto vinculado à publicação da loja com sucesso.',
      store_product: newSnapshot,
    })
  } catch (err) {
    console.error('[STORE CRM INTEGRATION] Erro em store-link:', err)
    return c.json(500, { success: false, error: 'Erro ao vincular produto: ' + err.message })
  }
})

// =========================================================================
// 2. POST /backend/v1/crm/products/{id}/store-unlink
// =========================================================================
routerAdd('POST', '/backend/v1/crm/products/{id}/store-unlink', (c) => {
  try {
    const auth = c.auth || (c.httpContext ? c.httpContext.get('auth') : null)
    if (!auth) {
      return c.json(401, { success: false, error: 'Autenticação necessária.' })
    }
    const colName = (auth.collection && auth.collection().name) || ''
    if (colName && colName !== 'users') {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: compradores da loja não possuem permissão administrativa.',
      })
    }
    if (auth.get('is_active') === false) {
      return c.json(403, { success: false, error: 'Usuário CRM inativo.' })
    }
    const roleSlug = auth.get('role_slug') || ''
    const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
    if (roleSlug && !allowedRoles.includes(roleSlug)) {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      })
    }

    const quoteProductId = c.request.pathValue('id')
    if (!quoteProductId) {
      return c.json(400, { success: false, error: 'ID do produto mestre CRM é obrigatório.' })
    }

    const master = $app.findRecordById('quote_products', quoteProductId)
    const masterName = master ? master.getString('name') : quoteProductId

    // Localizar store_product vinculado
    const body = c.requestInfo().body || {}
    const requestedStoreProductId = String(body.store_product_id || '').trim()

    let storeProduct = null
    if (requestedStoreProductId) {
      try {
        storeProduct = $app.findRecordById('store_products', requestedStoreProductId)
      } catch (_) {}
    }

    if (!storeProduct) {
      const found = $app.findRecordsByFilter(
        'store_products',
        'quote_product_id = {:qid}',
        '',
        1,
        0,
        { qid: quoteProductId },
      )
      if (found && found.length > 0) {
        storeProduct = found[0]
      }
    }

    if (!storeProduct) {
      return c.json(404, {
        success: false,
        error: 'Nenhuma publicação da loja está vinculada a este produto mestre.',
      })
    }

    // TRAVA CRÍTICA DE INTEGRIDADE: store_product deve pertencer de fato a este mestre
    const currentBoundMasterId = storeProduct.getString('quote_product_id')
    if (currentBoundMasterId && currentBoundMasterId !== quoteProductId) {
      return c.json(400, {
        success: false,
        error:
          'A publicação informada (' +
          storeProduct.id +
          ') pertence a outro produto mestre CRM e não pode ser desvinculada por este mestre.',
      })
    }

    const prevSnapshot = storeProduct.publicExport()
    // Preservar publicação, preços, slugs, fotos e histórico. Apenas limpa quote_product_id
    storeProduct.set('quote_product_id', '')
    $app.save(storeProduct)

    const newSnapshot = storeProduct.publicExport()
    const reqHeaders = c.requestInfo() ? c.requestInfo().headers || {} : {}
    const remoteIP = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', auth ? auth.id : null)
        rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
        rec.set('user_email', auth ? auth.get('email') || '' : '')
        rec.set('action', 'store_unlink')
        rec.set('module', 'store_products')
        rec.set('record_id', String(storeProduct.id || ''))
        rec.set('record_title', String(storeProduct.getString('name') || ''))
        rec.set(
          'details',
          'Vínculo removido entre publicação da loja "' +
            storeProduct.getString('name') +
            '" (' +
            storeProduct.id +
            ') e mestre CRM "' +
            masterName +
            '" (' +
            quoteProductId +
            '). A publicação na loja foi preservada.',
        )
        rec.set('previous_value', prevSnapshot)
        rec.set('new_value', newSnapshot)
        rec.set('ip_address', String(remoteIP || ''))
        $app.save(rec)
      }
    } catch (auditErr) {
      console.warn('[STORE CRM INTEGRATION] Falha ao gravar audit_logs:', auditErr)
    }

    return c.json(200, {
      success: true,
      message: 'Vínculo removido com sucesso. A publicação na loja permanece intacta.',
      store_product: newSnapshot,
    })
  } catch (err) {
    console.error('[STORE CRM INTEGRATION] Erro em store-unlink:', err)
    return c.json(500, { success: false, error: 'Erro ao desvincular produto: ' + err.message })
  }
})

// =========================================================================
// 3. POST /backend/v1/crm/products/{id}/store-draft
// =========================================================================
routerAdd('POST', '/backend/v1/crm/products/{id}/store-draft', (c) => {
  try {
    const auth = c.auth || (c.httpContext ? c.httpContext.get('auth') : null)
    if (!auth) {
      return c.json(401, { success: false, error: 'Autenticação necessária.' })
    }
    const colName = (auth.collection && auth.collection().name) || ''
    if (colName && colName !== 'users') {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: compradores da loja não possuem permissão administrativa.',
      })
    }
    if (auth.get('is_active') === false) {
      return c.json(403, { success: false, error: 'Usuário CRM inativo.' })
    }
    const roleSlug = auth.get('role_slug') || ''
    const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
    if (roleSlug && !allowedRoles.includes(roleSlug)) {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      })
    }

    const quoteProductId = c.request.pathValue('id')
    if (!quoteProductId) {
      return c.json(400, { success: false, error: 'ID do produto mestre CRM é obrigatório.' })
    }

    const master = $app.findRecordById('quote_products', quoteProductId)
    if (!master) {
      return c.json(404, { success: false, error: 'Produto mestre CRM não encontrado.' })
    }

    // Regra de Integridade: Garantir que não haja publicação já vinculada
    const existing = $app.findRecordsByFilter(
      'store_products',
      'quote_product_id = {:qid}',
      '',
      1,
      0,
      { qid: quoteProductId },
    )
    if (existing && existing.length > 0) {
      return c.json(400, {
        success: false,
        error:
          'Este produto mestre já possui uma publicação vinculada ("' +
          existing[0].getString('name') +
          '", ID: ' +
          existing[0].id +
          '). Edite o rascunho existente ou desvincule.',
      })
    }

    const body = c.requestInfo().body || {}
    const categoryId = String(body.category_id || '').trim()

    // Validação de categoria obrigatória da loja
    if (!categoryId) {
      return c.json(400, {
        success: false,
        error: 'É obrigatório selecionar uma categoria válida da loja para criar o rascunho.',
      })
    }

    const category = $app.findRecordById('store_categories', categoryId)
    if (!category) {
      return c.json(400, { success: false, error: 'A categoria informada não existe na loja.' })
    }

    // Definição de Preço Inicial
    let storePrice = 0
    if (typeof body.store_price === 'number' && body.store_price > 0) {
      storePrice = body.store_price
    } else {
      const masterFixed = master.getFloat('fixed_price')
      const masterMin = master.getFloat('min_price')
      if (masterFixed > 0) storePrice = masterFixed
      else if (masterMin > 0) storePrice = masterMin
    }

    // Determinar tipo de precificação padrão coerente com o cálculo do mestre
    const masterCalcRule = master.getString('calc_rule')
    let pricingType = 'quantity_tiers'
    let sqmBasePrice = 0
    if (masterCalcRule === 'm2') {
      pricingType = 'square_meter'
      sqmBasePrice = storePrice > 0 ? storePrice : 50
    } else if (masterCalcRule === 'preco_fixo') {
      pricingType = 'fixed'
    }

    const masterName = master.getString('name') || 'Novo Produto'

    // Gerar slug único inline
    let baseSlug = String(masterName || 'produto')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    if (!baseSlug) baseSlug = 'produto-' + Date.now()
    let generatedSlug = baseSlug
    let counter = 1
    while (true) {
      const existingSlug = $app.findRecordsByFilter('store_products', 'slug = {:slug}', '', 1, 0, {
        slug: generatedSlug,
      })
      if (!existingSlug || existingSlug.length === 0) {
        break
      }
      counter++
      generatedSlug = baseSlug + '-' + counter
    }

    // Copiar foto principal do mestre se existir
    let mainImageUrl = ''
    try {
      const masterImg = master.getString('image_url')
      if (masterImg) mainImageUrl = masterImg
    } catch (_) {}

    const storeProdCol = $app.findCollectionByNameOrId('store_products')
    const draftRecord = new Record(storeProdCol)

    draftRecord.set('quote_product_id', quoteProductId)
    draftRecord.set('name', masterName)
    draftRecord.set('slug', generatedSlug)
    draftRecord.set('category_id', categoryId)
    draftRecord.set('subtitle', String(body.subtitle || master.getString('description') || ''))
    draftRecord.set(
      'description_public',
      String(body.description_public || master.getString('description') || ''),
    )
    draftRecord.set('pricing_type', pricingType)
    draftRecord.set('store_price', storePrice)
    draftRecord.set('sqm_base_price', sqmBasePrice)
    draftRecord.set('sqm_min_area', 0.5)
    draftRecord.set('published', false) // Sempre RASCUNHO inicialmente
    draftRecord.set('featured', false)
    draftRecord.set('quote_only', false)
    draftRecord.set('main_image_url', mainImageUrl)
    draftRecord.set('price_tiers', '[]')
    draftRecord.set('options', '[]')
    draftRecord.set('finishings', '[]')

    $app.save(draftRecord)

    const createdSnapshot = draftRecord.publicExport()
    const reqHeaders = c.requestInfo() ? c.requestInfo().headers || {} : {}
    const remoteIP = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', auth ? auth.id : null)
        rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
        rec.set('user_email', auth ? auth.get('email') || '' : '')
        rec.set('action', 'store_draft')
        rec.set('module', 'store_products')
        rec.set('record_id', String(draftRecord.id || ''))
        rec.set('record_title', String(draftRecord.getString('name') || ''))
        rec.set(
          'details',
          'Rascunho de publicação criado na loja para o produto mestre "' +
            masterName +
            '" (' +
            quoteProductId +
            '). Categoria: "' +
            category.getString('name') +
            '". Status inicial: Rascunho (published = false).',
        )
        rec.set('previous_value', null)
        rec.set('new_value', createdSnapshot)
        rec.set('ip_address', String(remoteIP || ''))
        $app.save(rec)
      }
    } catch (auditErr) {
      console.warn('[STORE CRM INTEGRATION] Falha ao gravar audit_logs:', auditErr)
    }

    return c.json(201, {
      success: true,
      message: 'Rascunho criado com sucesso na Laletra Store.',
      store_product: createdSnapshot,
    })
  } catch (err) {
    console.error('[STORE CRM INTEGRATION] Erro em store-draft:', err)
    return c.json(500, { success: false, error: 'Erro ao criar rascunho: ' + err.message })
  }
})

// =========================================================================
// 4. POST /backend/v1/crm/products/{id}/store-publish
// =========================================================================
routerAdd('POST', '/backend/v1/crm/products/{id}/store-publish', (c) => {
  try {
    const auth = c.auth || (c.httpContext ? c.httpContext.get('auth') : null)
    if (!auth) {
      return c.json(401, { success: false, error: 'Autenticação necessária.' })
    }
    const colName = (auth.collection && auth.collection().name) || ''
    if (colName && colName !== 'users') {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: compradores da loja não possuem permissão administrativa.',
      })
    }
    if (auth.get('is_active') === false) {
      return c.json(403, { success: false, error: 'Usuário CRM inativo.' })
    }
    const roleSlug = auth.get('role_slug') || ''
    const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
    if (roleSlug && !allowedRoles.includes(roleSlug)) {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      })
    }

    const quoteProductId = c.request.pathValue('id')
    if (!quoteProductId) {
      return c.json(400, { success: false, error: 'ID do produto mestre CRM é obrigatório.' })
    }

    const master = $app.findRecordById('quote_products', quoteProductId)
    if (!master) {
      return c.json(404, { success: false, error: 'Produto mestre CRM não encontrado.' })
    }

    // TRAVA 1: Não permitir publicação se o mestre no CRM estiver inativo
    if (master.get('is_active') === false) {
      return c.json(400, {
        success: false,
        error:
          'Não é permitido publicar na loja um produto inativo no CRM. Ative o produto mestre primeiro.',
      })
    }

    // Localizar store_product vinculado
    const body = c.requestInfo().body || {}
    const requestedStoreProductId = String(body.store_product_id || '').trim()

    let storeProduct = null
    if (requestedStoreProductId) {
      try {
        storeProduct = $app.findRecordById('store_products', requestedStoreProductId)
      } catch (_) {}
    }

    if (!storeProduct) {
      const found = $app.findRecordsByFilter(
        'store_products',
        'quote_product_id = {:qid}',
        '',
        1,
        0,
        { qid: quoteProductId },
      )
      if (found && found.length > 0) {
        storeProduct = found[0]
      }
    }

    if (!storeProduct) {
      return c.json(404, {
        success: false,
        error: 'Nenhuma publicação vinculada encontrada para este produto mestre.',
      })
    }

    // TRAVA CRÍTICA DE INTEGRIDADE: store_product deve pertencer de fato a este mestre
    const currentBoundMasterId = storeProduct.getString('quote_product_id')
    if (currentBoundMasterId && currentBoundMasterId !== quoteProductId) {
      return c.json(400, {
        success: false,
        error:
          'A publicação informada (' +
          storeProduct.id +
          ') pertence a outro produto mestre CRM e não pode ser publicada por este mestre.',
      })
    }

    // TRAVA 2: Validação obrigatória de Categoria válida
    const catId = storeProduct.getString('category_id')
    if (!catId) {
      return c.json(400, {
        success: false,
        error: 'Publicação bloqueada: o produto precisa ter uma categoria da loja vinculada.',
      })
    }
    try {
      const catRec = $app.findRecordById('store_categories', catId)
      if (!catRec) {
        return c.json(400, {
          success: false,
          error: 'Publicação bloqueada: a categoria vinculada não existe na loja.',
        })
      }
    } catch (_) {
      return c.json(400, {
        success: false,
        error: 'Publicação bloqueada: a categoria vinculada é inválida.',
      })
    }

    // TRAVA 3: Validação obrigatória de Preço configurado
    const pType = storeProduct.getString('pricing_type') || 'quantity_tiers'
    const storePrice = storeProduct.getFloat('store_price')
    const sqmPrice = storeProduct.getFloat('sqm_base_price')

    let hasValidPrice = false
    if (pType === 'square_meter') {
      hasValidPrice = sqmPrice > 0 || storePrice > 0
    } else {
      hasValidPrice = storePrice > 0
    }

    if (!hasValidPrice && pType === 'quantity_tiers') {
      try {
        const tiersRaw = storeProduct.get('price_tiers')
        const tiers = typeof tiersRaw === 'string' ? JSON.parse(tiersRaw) : tiersRaw
        if (Array.isArray(tiers) && tiers.length > 0 && tiers[0].price > 0) {
          hasValidPrice = true
        }
      } catch (_) {}
    }

    if (!hasValidPrice) {
      return c.json(400, {
        success: false,
        error:
          'Publicação bloqueada: o produto deve ter um preço de venda base configurado (> R$ 0,00).',
      })
    }

    // TRAVA 4: Nome e Slug obrigatórios
    if (!storeProduct.getString('name').trim()) {
      return c.json(400, {
        success: false,
        error: 'Publicação bloqueada: o produto deve ter um nome preenchido.',
      })
    }

    const prevSnapshot = storeProduct.publicExport()
    storeProduct.set('published', true)
    $app.save(storeProduct)

    const newSnapshot = storeProduct.publicExport()
    const reqHeaders = c.requestInfo() ? c.requestInfo().headers || {} : {}
    const remoteIP = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', auth ? auth.id : null)
        rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
        rec.set('user_email', auth ? auth.get('email') || '' : '')
        rec.set('action', 'store_publish')
        rec.set('module', 'store_products')
        rec.set('record_id', String(storeProduct.id || ''))
        rec.set('record_title', String(storeProduct.getString('name') || ''))
        rec.set(
          'details',
          'Publicação ativada na loja para "' +
            storeProduct.getString('name') +
            '" (Mestre CRM: ' +
            master.getString('name') +
            '). Status: Publicado (published = true).',
        )
        rec.set('previous_value', prevSnapshot)
        rec.set('new_value', newSnapshot)
        rec.set('ip_address', String(remoteIP || ''))
        $app.save(rec)
      }
    } catch (auditErr) {
      console.warn('[STORE CRM INTEGRATION] Falha ao gravar audit_logs:', auditErr)
    }

    return c.json(200, {
      success: true,
      message: 'Produto publicado com sucesso na Laletra Store.',
      store_product: newSnapshot,
    })
  } catch (err) {
    console.error('[STORE CRM INTEGRATION] Erro em store-publish:', err)
    return c.json(500, { success: false, error: 'Erro ao publicar produto: ' + err.message })
  }
})

// =========================================================================
// 5. POST /backend/v1/crm/products/{id}/store-unpublish
// =========================================================================
routerAdd('POST', '/backend/v1/crm/products/{id}/store-unpublish', (c) => {
  try {
    const auth = c.auth || (c.httpContext ? c.httpContext.get('auth') : null)
    if (!auth) {
      return c.json(401, { success: false, error: 'Autenticação necessária.' })
    }
    const colName = (auth.collection && auth.collection().name) || ''
    if (colName && colName !== 'users') {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: compradores da loja não possuem permissão administrativa.',
      })
    }
    if (auth.get('is_active') === false) {
      return c.json(403, { success: false, error: 'Usuário CRM inativo.' })
    }
    const roleSlug = auth.get('role_slug') || ''
    const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
    if (roleSlug && !allowedRoles.includes(roleSlug)) {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      })
    }

    const quoteProductId = c.request.pathValue('id')
    if (!quoteProductId) {
      return c.json(400, { success: false, error: 'ID do produto mestre CRM é obrigatório.' })
    }

    // Localizar store_product vinculado
    const body = c.requestInfo().body || {}
    const requestedStoreProductId = String(body.store_product_id || '').trim()

    let storeProduct = null
    if (requestedStoreProductId) {
      try {
        storeProduct = $app.findRecordById('store_products', requestedStoreProductId)
      } catch (_) {}
    }

    if (!storeProduct) {
      const found = $app.findRecordsByFilter(
        'store_products',
        'quote_product_id = {:qid}',
        '',
        1,
        0,
        { qid: quoteProductId },
      )
      if (found && found.length > 0) {
        storeProduct = found[0]
      }
    }

    if (!storeProduct) {
      return c.json(404, {
        success: false,
        error: 'Nenhuma publicação vinculada encontrada para este produto mestre.',
      })
    }

    // TRAVA CRÍTICA DE INTEGRIDADE: store_product deve pertencer de fato a este mestre
    const currentBoundMasterId = storeProduct.getString('quote_product_id')
    if (currentBoundMasterId && currentBoundMasterId !== quoteProductId) {
      return c.json(400, {
        success: false,
        error:
          'A publicação informada (' +
          storeProduct.id +
          ') pertence a outro produto mestre CRM e não pode ser despublicada por este mestre.',
      })
    }

    const prevSnapshot = storeProduct.publicExport()
    storeProduct.set('published', false)
    $app.save(storeProduct)

    const newSnapshot = storeProduct.publicExport()
    const reqHeaders = c.requestInfo() ? c.requestInfo().headers || {} : {}
    const remoteIP = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', auth ? auth.id : null)
        rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
        rec.set('user_email', auth ? auth.get('email') || '' : '')
        rec.set('action', 'store_unpublish')
        rec.set('module', 'store_products')
        rec.set('record_id', String(storeProduct.id || ''))
        rec.set('record_title', String(storeProduct.getString('name') || ''))
        rec.set(
          'details',
          'Publicação recolhida da loja (despublicada) para "' +
            storeProduct.getString('name') +
            '". Permanece como rascunho vinculado no CRM. Pedidos anteriores permanecem intactos.',
        )
        rec.set('previous_value', prevSnapshot)
        rec.set('new_value', newSnapshot)
        rec.set('ip_address', String(remoteIP || ''))
        $app.save(rec)
      }
    } catch (auditErr) {
      console.warn('[STORE CRM INTEGRATION] Falha ao gravar audit_logs:', auditErr)
    }

    return c.json(200, {
      success: true,
      message: 'Produto despublicado da loja com sucesso (retornado a rascunho).',
      store_product: newSnapshot,
    })
  } catch (err) {
    console.error('[STORE CRM INTEGRATION] Erro em store-unpublish:', err)
    return c.json(500, { success: false, error: 'Erro ao despublicar produto: ' + err.message })
  }
})

// =========================================================================
// 6. GET /backend/v1/crm/products/{id}/store-status
// =========================================================================
routerAdd('GET', '/backend/v1/crm/products/{id}/store-status', (c) => {
  try {
    const auth = c.auth || (c.httpContext ? c.httpContext.get('auth') : null)
    if (!auth) {
      return c.json(401, { success: false, error: 'Autenticação necessária.' })
    }
    const colName = (auth.collection && auth.collection().name) || ''
    if (colName && colName !== 'users') {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: compradores da loja não possuem permissão administrativa.',
      })
    }
    if (auth.get('is_active') === false) {
      return c.json(403, { success: false, error: 'Usuário CRM inativo.' })
    }
    const roleSlug = auth.get('role_slug') || ''
    const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
    if (roleSlug && !allowedRoles.includes(roleSlug)) {
      return c.json(403, {
        success: false,
        error: 'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      })
    }

    const quoteProductId = c.request.pathValue('id')
    if (!quoteProductId) {
      return c.json(400, { success: false, error: 'ID do produto mestre CRM é obrigatório.' })
    }

    const master = $app.findRecordById('quote_products', quoteProductId)
    if (!master) {
      return c.json(404, { success: false, error: 'Produto mestre CRM não encontrado.' })
    }

    const found = $app.findRecordsByFilter(
      'store_products',
      'quote_product_id = {:qid}',
      '',
      1,
      0,
      { qid: quoteProductId },
    )
    const storeProduct = found && found.length > 0 ? found[0] : null

    let category = null
    if (storeProduct && storeProduct.getString('category_id')) {
      try {
        category = $app.findRecordById('store_categories', storeProduct.getString('category_id'))
      } catch (_) {}
    }

    const isMasterActive = master.get('is_active') !== false
    let publicationState = 'not_linked'

    if (!storeProduct) {
      publicationState = 'not_linked'
    } else if (storeProduct.getBool('published') === true) {
      publicationState = isMasterActive ? 'published' : 'unavailable'
    } else {
      publicationState = 'draft'
    }

    return c.json(200, {
      success: true,
      master_id: master.id,
      master_name: master.getString('name'),
      master_is_active: isMasterActive,
      publication_state: publicationState,
      store_product: storeProduct ? storeProduct.publicExport() : null,
      category: category ? category.publicExport() : null,
    })
  } catch (err) {
    console.error('[STORE CRM INTEGRATION] Erro em store-status:', err)
    return c.json(500, { success: false, error: 'Erro ao obter status da loja: ' + err.message })
  }
})

// =========================================================================
// 7. SEGURANÇA E ENDURECIMENTO DAS OPERAÇÕES DIRETAS EM STORE_PRODUCTS
// Garante que requisições CREATE/UPDATE/DELETE em store_products venham
// estritamente de membros autenticados da equipe CRM (coleção 'users').
// =========================================================================
onRecordCreateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Operação administrativa em store_products exige login CRM.')
  }
  const colName = (auth.collection && auth.collection().name) || ''
  if (colName !== 'users') {
    throw new ForbiddenError('Apenas membros da equipe CRM podem cadastrar produtos na loja.')
  }
  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário CRM inativo.')
  }
  const roleSlug = auth.get('role_slug') || ''
  const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
  if (roleSlug && !allowedRoles.includes(roleSlug)) {
    throw new ForbiddenError('Perfil de usuário sem permissão para gerenciar produtos na loja.')
  }
  return e.next()
}, 'store_products')

onRecordUpdateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Operação administrativa em store_products exige login CRM.')
  }
  const colName = (auth.collection && auth.collection().name) || ''
  if (colName !== 'users') {
    throw new ForbiddenError('Apenas membros da equipe CRM podem editar produtos na loja.')
  }
  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário CRM inativo.')
  }
  const roleSlug = auth.get('role_slug') || ''
  const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
  if (roleSlug && !allowedRoles.includes(roleSlug)) {
    throw new ForbiddenError('Perfil de usuário sem permissão para gerenciar produtos na loja.')
  }
  return e.next()
}, 'store_products')

onRecordDeleteRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Operação administrativa em store_products exige login CRM.')
  }
  const colName = (auth.collection && auth.collection().name) || ''
  if (colName !== 'users') {
    throw new ForbiddenError('Apenas membros da equipe CRM podem excluir produtos da loja.')
  }
  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário CRM inativo.')
  }
  const roleSlug = auth.get('role_slug') || ''
  const allowedRoles = ['admin', 'gerente', 'vendedor', 'atendente']
  if (roleSlug && !allowedRoles.includes(roleSlug)) {
    throw new ForbiddenError('Perfil de usuário sem permissão para gerenciar produtos na loja.')
  }
  return e.next()
}, 'store_products')
