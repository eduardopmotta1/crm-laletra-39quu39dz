/**
 * Hook para Endpoints Públicos da Laletra Store sob /backend/v1/store/
 * Fornece catálogo seguro: apenas dados publicados, SEM nenhum custo interno (custos ficam em quote_products).
 * Todas as funções auxiliares ficam estritamente inline dentro de cada callback para compatibilidade goja/PocketBase.
 */

/**
 * GET /backend/v1/store/categories
 * Retorna categorias ativas ordenadas por order_index
 */
routerAdd('GET', '/backend/v1/store/categories', (c) => {
  try {
    let pbHost = $os.getenv('PB_INSTANCE_URL') || ''
    if (!pbHost) {
      try {
        const settings = $app.settings()
        if (settings && settings.meta && settings.meta.appUrl) {
          pbHost = settings.meta.appUrl
        }
      } catch (_) {}
    }
    if (!pbHost) {
      pbHost = 'https://crm-grafica-whatsapp-7b1a5.shrd00.internal.goskip.dev'
    }
    const cleanHost = pbHost.replace(/\/+$/, '')

    const cats = $app.findRecordsByFilter(
      'store_categories',
      'is_active = true',
      'order_index,name',
      200,
      0,
    )

    const catCol = $app.findCollectionByNameOrId('store_categories')
    const colId = catCol ? catCol.id : 'store_categories'

    const data = cats.map((cat) => {
      const img = cat.getString('image')
      let parentId = ''
      try {
        parentId = cat.getString('parent_id') || ''
      } catch (_) {}

      return {
        id: cat.id,
        name: cat.getString('name'),
        slug: cat.getString('slug'),
        description: cat.getString('description') || '',
        icon: cat.getString('icon') || '',
        image_url: img ? `${cleanHost}/api/files/${colId}/${cat.id}/${img}` : null,
        order_index: cat.getInt('order_index') || 0,
        parent_id: parentId || null,
      }
    })

    return c.json(200, { success: true, data })
  } catch (err) {
    return c.json(500, { error: 'Erro ao listar categorias da loja: ' + err.message })
  }
})

/**
 * GET /backend/v1/store/banners
 * Retorna banners promocionais ativos da loja
 */
routerAdd('GET', '/backend/v1/store/banners', (c) => {
  try {
    let pbHost = $os.getenv('PB_INSTANCE_URL') || ''
    if (!pbHost) {
      try {
        const settings = $app.settings()
        if (settings && settings.meta && settings.meta.appUrl) {
          pbHost = settings.meta.appUrl
        }
      } catch (_) {}
    }
    if (!pbHost) {
      pbHost = 'https://crm-grafica-whatsapp-7b1a5.shrd00.internal.goskip.dev'
    }
    const cleanHost = pbHost.replace(/\/+$/, '')

    const banners = $app.findRecordsByFilter(
      'store_banners',
      'is_active = true',
      'order_index,created',
      50,
      0,
    )

    const bCol = $app.findCollectionByNameOrId('store_banners')
    const colId = bCol ? bCol.id : 'store_banners'

    const data = banners.map((b) => {
      const img = b.getString('image')
      let mobImg = ''
      try {
        mobImg = b.getString('mobile_image') || ''
      } catch (_) {}

      let desc = ''
      try {
        desc = b.getString('description') || ''
      } catch (_) {}

      return {
        id: b.id,
        title: b.getString('title'),
        subtitle: b.getString('subtitle') || '',
        description: desc,
        cta_text: b.getString('cta_text') || 'Ver Mais',
        link_url: b.getString('link_url') || '/loja',
        badge: b.getString('badge') || '',
        bg_color: b.getString('bg_color') || 'from-emerald-900 to-slate-900',
        image_url: img ? `${cleanHost}/api/files/${colId}/${b.id}/${img}` : null,
        mobile_image_url: mobImg ? `${cleanHost}/api/files/${colId}/${b.id}/${mobImg}` : null,
        order_index: b.getInt('order_index') || 0,
      }
    })

    return c.json(200, { success: true, data })
  } catch (err) {
    return c.json(500, { error: 'Erro ao listar banners da loja: ' + err.message })
  }
})

/**
 * GET /backend/v1/store/products
 * Lista produtos publicados com suporte a filtro por category_slug, featured, busca textual
 */
routerAdd('GET', '/backend/v1/store/products', (c) => {
  try {
    let pbHost = $os.getenv('PB_INSTANCE_URL') || ''
    if (!pbHost) {
      try {
        const settings = $app.settings()
        if (settings && settings.meta && settings.meta.appUrl) {
          pbHost = settings.meta.appUrl
        }
      } catch (_) {}
    }
    if (!pbHost) {
      pbHost = 'https://crm-grafica-whatsapp-7b1a5.shrd00.internal.goskip.dev'
    }
    const cleanHost = pbHost.replace(/\/+$/, '')

    const parseJson = function (val) {
      if (!val) return []
      if (typeof val === 'object') return val
      try {
        return JSON.parse(val)
      } catch (_) {
        return []
      }
    }

    const qCategory = c.request.url.query().get('category') || ''
    const qFeatured = c.request.url.query().get('featured') || ''
    const qSearch = c.request.url.query().get('search') || ''

    let filter = 'published = true'

    if (qCategory) {
      try {
        const rawCat = qCategory.trim()
        let cat = null
        try {
          cat = $app.findFirstRecordByData('store_categories', 'slug', rawCat)
        } catch (_) {}

        // Fallback por ID caso a chamada envie o ID antigo da categoria
        if (!cat) {
          try {
            cat = $app.findRecordById('store_categories', rawCat)
          } catch (_) {}
        }

        if (cat) {
          // Coleta recursiva de toda a subárvore ativa (proteção contra ciclos, única consulta para todos os nós)
          const catIds = [cat.id]
          try {
            const allActiveCats = $app.findRecordsByFilter(
              'store_categories',
              'is_active = true',
              'order_index',
              500,
              0,
            )

            // Mapa parent_id -> lista de filhos ativos
            const childrenMap = {}
            for (let i = 0; i < allActiveCats.length; i++) {
              const cRec = allActiveCats[i]
              let pId = ''
              try {
                pId = (cRec.getString('parent_id') || '').trim()
              } catch (_) {}
              if (pId) {
                if (!childrenMap[pId]) childrenMap[pId] = []
                childrenMap[pId].push(cRec.id)
              }
            }

            // BFS com Set para evitar duplicações e ciclos
            const queue = [cat.id]
            const visited = {}
            visited[cat.id] = true

            while (queue.length > 0) {
              const currentId = queue.shift()
              const directChildren = childrenMap[currentId] || []
              for (let k = 0; k < directChildren.length; k++) {
                const childId = directChildren[k]
                if (!visited[childId]) {
                  visited[childId] = true
                  catIds.push(childId)
                  queue.push(childId)
                }
              }
            }
          } catch (_) {}

          if (catIds.length === 1) {
            filter += ` && category_id = '${cat.id}'`
          } else {
            const orConditions = catIds.map((id) => `category_id = '${id}'`).join(' || ')
            filter += ` && (${orConditions})`
          }
        } else {
          return c.json(200, { success: true, data: [] })
        }
      } catch (_) {
        return c.json(200, { success: true, data: [] })
      }
    }

    if (qFeatured === 'true') {
      filter += ' && featured = true'
    }

    if (qSearch) {
      const term = qSearch.trim().replace(/'/g, "\\'")
      filter += ` && (name ~ '${term}' || subtitle ~ '${term}')`
    }

    const rawProducts = $app.findRecordsByFilter(
      'store_products',
      filter,
      'order_index,name',
      100,
      0,
    )

    // Filtrar produtos cujo produto mestre no CRM (quote_products) esteja com is_active = false
    let inactiveMasterMap = {}
    try {
      const inactives = $app.findRecordsByFilter('quote_products', 'is_active = false', '', 0, 0)
      if (inactives && inactives.length > 0) {
        for (const inact of inactives) {
          inactiveMasterMap[inact.id] = true
        }
      }
    } catch (_) {}

    const products = (rawProducts || []).filter((p) => {
      const qid = p.getString('quote_product_id')
      if (!qid) return true
      return !inactiveMasterMap[qid]
    })

    const prodCol = $app.findCollectionByNameOrId('store_products')
    const colId = prodCol ? prodCol.id : 'store_products'

    const data = products.map((p) => {
      const mainImg = p.getString('main_image')
      const catId = p.getString('category_id')
      let catSlug = ''
      let catName = ''
      if (catId) {
        try {
          const cRec = $app.findRecordById('store_categories', catId)
          if (cRec) {
            catSlug = cRec.getString('slug')
            catName = cRec.getString('name')
          }
        } catch (_) {}
      }

      return {
        id: p.id,
        name: p.getString('name'),
        seo_slug: p.getString('seo_slug'),
        subtitle: p.getString('subtitle') || '',
        category_id: catId,
        category_slug: catSlug,
        category_name: catName,
        pricing_type: p.getString('pricing_type'),
        store_price: p.getFloat('store_price') || 0,
        price_tiers: parseJson(p.get('price_tiers')),
        sqm_min_area: p.getFloat('sqm_min_area') || 0,
        sqm_base_price: p.getFloat('sqm_base_price') || 0,
        lead_time_days: p.getInt('lead_time_days') || 3,
        quote_only: p.getBool('quote_only') === true,
        featured: p.getBool('featured') === true,
        badge_label: p.getString('badge_label') || null,
        unit_label: p.getString('unit_label') || null,
        main_image_url: mainImg ? `${cleanHost}/api/files/${colId}/${p.id}/${mainImg}` : null,
        order_index: p.getInt('order_index') || 0,
      }
    })

    return c.json(200, { success: true, data })
  } catch (err) {
    return c.json(500, { error: 'Erro ao listar produtos da loja: ' + err.message })
  }
})

/**
 * GET /backend/v1/store/product/{slug}
 * Retorna detalhe completo de um produto publicado e produtos relacionados
 */
routerAdd('GET', '/backend/v1/store/product/{slug}', (c) => {
  try {
    const slug = c.request.pathValue('slug')
    if (!slug || slug.trim() === '') {
      return c.json(400, { error: 'Slug do produto não fornecido' })
    }

    let pbHost = $os.getenv('PB_INSTANCE_URL') || ''
    if (!pbHost) {
      try {
        const settings = $app.settings()
        if (settings && settings.meta && settings.meta.appUrl) {
          pbHost = settings.meta.appUrl
        }
      } catch (_) {}
    }
    if (!pbHost) {
      pbHost = 'https://crm-grafica-whatsapp-7b1a5.shrd00.internal.goskip.dev'
    }
    const cleanHost = pbHost.replace(/\/+$/, '')

    const parseJson = function (val) {
      if (!val) return []
      if (typeof val === 'object') return val
      try {
        return JSON.parse(val)
      } catch (_) {
        return []
      }
    }

    const prods = $app.findRecordsByFilter(
      'store_products',
      'seo_slug = {:slug} && published = true',
      '-created',
      1,
      0,
      { slug: slug.trim() },
    )

    if (!prods || prods.length === 0) {
      return c.json(404, { error: 'Produto não encontrado na loja' })
    }

    const p = prods[0]

    // Validação de mestre CRM ativo: se estiver inativo, retornar 404 (indisponível)
    const masterQuoteId = p.getString('quote_product_id')
    if (masterQuoteId) {
      try {
        const masterRec = $app.findRecordById('quote_products', masterQuoteId)
        if (masterRec && masterRec.get('is_active') === false) {
          return c.json(404, { error: 'Produto temporariamente indisponível na loja' })
        }
      } catch (_) {}
    }
    const prodCol = $app.findCollectionByNameOrId('store_products')
    const colId = prodCol ? prodCol.id : 'store_products'

    const catId = p.getString('category_id')
    let category = null
    if (catId) {
      try {
        const cRec = $app.findRecordById('store_categories', catId)
        if (cRec) {
          category = {
            id: cRec.id,
            name: cRec.getString('name'),
            slug: cRec.getString('slug'),
          }
        }
      } catch (_) {}
    }

    const mainImg = p.getString('main_image')
    let galleryList = []
    try {
      const rawGallery = p.get('gallery_images')
      if (Array.isArray(rawGallery)) {
        galleryList = rawGallery.map((f) => `${cleanHost}/api/files/${colId}/${p.id}/${f}`)
      } else if (typeof rawGallery === 'string' && rawGallery) {
        galleryList = [`${cleanHost}/api/files/${colId}/${p.id}/${rawGallery}`]
      }
    } catch (_) {}

    // Produtos relacionados da mesma categoria (até 4)
    let related = []
    if (catId) {
      try {
        const relRecords = $app.findRecordsByFilter(
          'store_products',
          `category_id = '${catId}' && published = true && id != '${p.id}'`,
          'order_index,name',
          4,
          0,
        )
        related = relRecords.map((r) => {
          const rImg = r.getString('main_image')
          return {
            id: r.id,
            name: r.getString('name'),
            seo_slug: r.getString('seo_slug'),
            subtitle: r.getString('subtitle') || '',
            pricing_type: r.getString('pricing_type'),
            store_price: r.getFloat('store_price') || 0,
            quote_only: r.getBool('quote_only') === true,
            badge_label: r.getString('badge_label') || null,
            unit_label: r.getString('unit_label') || null,
            main_image_url: rImg ? `${cleanHost}/api/files/${colId}/${r.id}/${rImg}` : null,
          }
        })
      } catch (_) {}
    }

    const productData = {
      id: p.id,
      name: p.getString('name'),
      seo_slug: p.getString('seo_slug'),
      subtitle: p.getString('subtitle') || '',
      description_public: p.getString('description_public') || '',
      category_id: catId,
      category: category,
      pricing_type: p.getString('pricing_type'),
      store_price: p.getFloat('store_price') || 0,
      price_tiers: parseJson(p.get('price_tiers')),
      sqm_min_area: p.getFloat('sqm_min_area') || 0,
      sqm_base_price: p.getFloat('sqm_base_price') || 0,
      options: parseJson(p.get('options')),
      finishings: parseJson(p.get('finishings')),
      lead_time_days: p.getInt('lead_time_days') || 3,
      quote_only: p.getBool('quote_only') === true,
      featured: p.getBool('featured') === true,
      badge_label: p.getString('badge_label') || null,
      unit_label: p.getString('unit_label') || null,
      main_image_url: mainImg ? `${cleanHost}/api/files/${colId}/${p.id}/${mainImg}` : null,
      gallery_image_urls: galleryList,
      order_index: p.getInt('order_index') || 0,
    }

    return c.json(200, {
      success: true,
      data: productData,
      related,
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao carregar detalhes do produto: ' + err.message })
  }
})

/**
 * POST /backend/v1/store/calculate-price
 * Endpoint server-side de simulação e cálculo rigoroso de preço da loja
 * Suporta: fixed, quantity_tiers, square_meter, somando variações (options) e acabamentos (finishings)
 */
routerAdd('POST', '/backend/v1/store/calculate-price', (c) => {
  try {
    const parseJson = function (val) {
      if (!val) return []
      if (typeof val === 'object') return val
      try {
        return JSON.parse(val)
      } catch (_) {
        return []
      }
    }

    const body = c.requestInfo().body || {}
    const productId = body.product_id
    const quantity = Number(body.quantity) || 1
    const width = Number(body.width) || 0
    const height = Number(body.height) || 0
    const selectedOptionValues = Array.isArray(body.option_value_ids) ? body.option_value_ids : []
    const selectedFinishingIds = Array.isArray(body.finishing_ids) ? body.finishing_ids : []

    if (!productId) {
      return c.json(400, { error: 'product_id é obrigatório' })
    }

    const product = $app.findRecordById('store_products', productId)
    if (!product || product.getBool('published') !== true) {
      return c.json(404, { error: 'Produto não disponível para cálculo' })
    }

    // Validação de mestre CRM ativo
    const calcMasterId = product.getString('quote_product_id')
    if (calcMasterId) {
      try {
        const masterRec = $app.findRecordById('quote_products', calcMasterId)
        if (masterRec && masterRec.get('is_active') === false) {
          return c.json(400, {
            error:
              'O produto "' + product.getString('name') + '" está temporariamente indisponível.',
          })
        }
      } catch (_) {}
    }

    if (product.getBool('quote_only') === true) {
      return c.json(200, {
        success: true,
        quote_only: true,
        message: 'Este produto requer orçamento sob medida com a equipe comercial.',
        total: 0,
        unit_price: 0,
      })
    }

    // BLOCO 4: Resolver Tabela de Preço do Comprador no Servidor (Preço 1 / Preço 2 / Preço 3)
    // store_customers.linked_client_id com vínculo VERIFICADO (crm_link_status === 'verified_linked')
    // -> price_tier do cliente vinculado.
    // Visitante ou vínculo não verificado -> sempre Preço 1 (preco_1). O navegador NÃO influencia.
    let buyerTier = 'preco_1'
    try {
      const authHeader = c.request.header.get('Authorization') || ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      let customerId = ''
      if (token) {
        try {
          const claims = $security.parseJWT(token, 'laletra_store_phase2_secret_token_salt_2026')
          if (claims && claims.sub) customerId = claims.sub
        } catch (_) {}
      }
      if (customerId) {
        const cust = $app.findRecordById('store_customers', customerId)
        if (cust && cust.getString('crm_link_status') === 'verified_linked') {
          const linkedCid = cust.getString('linked_client_id')
          if (linkedCid) {
            const clientRec = $app.findRecordById('clients', linkedCid)
            if (clientRec) {
              const tier = clientRec.getString('price_tier')
              if (tier === 'preco_2' || tier === 'preco_3') {
                buyerTier = tier
              }
            }
          }
        }
      }
    } catch (_) {}

    // Resolução de preços da tabela específica do produto mestre
    let masterTierPrice = null
    let masterMinPrice = null
    if (calcMasterId) {
      try {
        const masterRec = $app.findRecordById('quote_products', calcMasterId)
        if (masterRec) {
          const ptRaw = masterRec.get('price_tables')
          if (ptRaw) {
            const pt = typeof ptRaw === 'string' ? JSON.parse(ptRaw) : ptRaw
            if (pt && pt[buyerTier] && typeof pt[buyerTier].fixed_price === 'number') {
              masterTierPrice = pt[buyerTier].fixed_price
            }
            if (pt && pt[buyerTier] && typeof pt[buyerTier].min_price === 'number') {
              masterMinPrice = pt[buyerTier].min_price
            }
          }
        }
      } catch (_) {}
    }

    const pricingType = product.getString('pricing_type')
    let baseTotal = 0
    let unitPrice = 0
    let areaM2 = 0

    // 1. Cálculo base de acordo com pricing_type e tabela resolvida
    if (pricingType === 'fixed') {
      const defaultFixed = product.getFloat('store_price') || 0
      const fixedPrice = masterTierPrice !== null ? masterTierPrice : defaultFixed
      unitPrice = fixedPrice
      baseTotal = fixedPrice * quantity
    } else if (pricingType === 'quantity_tiers') {
      const tiers = parseJson(product.get('price_tiers'))
      let matchedTier = null
      if (Array.isArray(tiers) && tiers.length > 0) {
        tiers.sort(function (a, b) {
          return (Number(a.quantity) || 0) - (Number(b.quantity) || 0)
        })
        for (let i = 0; i < tiers.length; i++) {
          if (quantity >= Number(tiers[i].quantity)) {
            matchedTier = tiers[i]
          }
        }
        if (!matchedTier) {
          matchedTier = tiers[0]
        }
      }

      if (matchedTier) {
        const tierPrice = Number(matchedTier.price) || 0
        const tierQty = Number(matchedTier.quantity) || 1
        baseTotal = tierPrice * (quantity / tierQty)
        unitPrice = baseTotal / (quantity || 1)
      } else {
        const defaultPrice = product.getFloat('store_price') || 0
        baseTotal = defaultPrice * quantity
        unitPrice = defaultPrice
      }
    } else if (pricingType === 'square_meter') {
      let wMeters = width > 10 ? width / 100 : width
      let hMeters = height > 10 ? height / 100 : height
      areaM2 = Number((wMeters * hMeters).toFixed(4))

      const minArea = product.getFloat('sqm_min_area') || 0.5
      const effectiveArea = Math.max(areaM2, minArea)
      const sqmBasePrice =
        product.getFloat('sqm_base_price') || product.getFloat('store_price') || 65.0

      const unitSqmTotal = effectiveArea * sqmBasePrice
      baseTotal = unitSqmTotal * quantity
      unitPrice = baseTotal / (quantity || 1)
    }

    // 2. Modificadores de Variações (options)
    let optionsModifierTotal = 0
    const prodOptions = parseJson(product.get('options'))
    if (Array.isArray(prodOptions)) {
      for (const opt of prodOptions) {
        if (Array.isArray(opt.values)) {
          for (const val of opt.values) {
            if (selectedOptionValues.includes(val.id) || selectedOptionValues.includes(val.label)) {
              optionsModifierTotal += Number(val.price_modifier) || 0
            }
          }
        }
      }
    }

    // 3. Adicionais de Acabamento (finishings)
    let finishingsTotal = 0
    const prodFinishings = parseJson(product.get('finishings'))
    if (Array.isArray(prodFinishings)) {
      for (const fin of prodFinishings) {
        if (selectedFinishingIds.includes(fin.id)) {
          finishingsTotal += Number(fin.price) || 0
        }
      }
    }

    let finalTotal = Number(
      (baseTotal + optionsModifierTotal * quantity + finishingsTotal).toFixed(2),
    )
    if (masterMinPrice !== null && finalTotal < masterMinPrice) {
      finalTotal = Number(masterMinPrice.toFixed(2))
    }
    const finalUnitPrice = Number((finalTotal / (quantity || 1)).toFixed(2))

    return c.json(200, {
      success: true,
      quote_only: false,
      product_id: productId,
      pricing_type: pricingType,
      price_tier_applied: buyerTier,
      quantity,
      area_m2: areaM2 > 0 ? areaM2 : null,
      base_total: Number(baseTotal.toFixed(2)),
      options_total: Number((optionsModifierTotal * quantity).toFixed(2)),
      finishings_total: Number(finishingsTotal.toFixed(2)),
      total: finalTotal,
      unit_price: finalUnitPrice,
      lead_time_days: product.getInt('lead_time_days') || 3,
    })
  } catch (err) {
    return c.json(500, { error: 'Erro no cálculo do preço: ' + err.message })
  }
})

/**
 * GET /backend/v1/store/settings
 * Retorna configurações públicas consolidadas da loja: appearance, commercial_info, home_layout
 */
routerAdd('GET', '/backend/v1/store/settings', (c) => {
  try {
    const parseJson = function (val) {
      if (!val) return {}
      if (typeof val === 'object') return val
      try {
        return JSON.parse(val)
      } catch (_) {
        return {}
      }
    }

    const records = $app.findRecordsByFilter('store_settings', '', 'setting_key', 50, 0)
    const result = {
      appearance: {
        primary_color: '#059669',
        secondary_color: '#0f172a',
        button_color: '#059669',
        header_color: '#ffffff',
        bg_color: '#f8fafc',
        text_color: '#0f172a',
        logo_url: '',
        favicon_url: '',
      },
      commercial_info: {
        whatsapp: '+55 (21) 2391-9112',
        phone: '+55 (21) 2391-9112',
        email: 'contato@laletragrafica.com.br',
        business_hours: 'Seg a Sex das 08h às 18h',
        address: 'Av. Marechal Floriano, 19, Sala 301 - Centro, Rio de Janeiro - RJ, 20080-003',
        footer_text:
          'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
        copyright_text: 'Gráfica LaLetra. Todos os direitos reservados.',
      },
      home_layout: {
        show_hero_banners: true,
        show_advantages_bar: true,
        show_categories_grid: true,
        show_featured_products: true,
        show_custom_quote_cta: true,
        hero_title: '',
        hero_subtitle: '',
        featured_product_ids: [],
        custom_quote_title: 'Precisa de um projeto gráfico personalizado ou grandes tiragens?',
        custom_quote_subtitle:
          'Nossa equipe comercial elabora cotações exclusivas com descontos por volume, corte especial e visitas técnicas para comunicação visual corporativa.',
      },
      footer: {
        version: 1,
        logo_url: '',
        company_name: 'Gráfica LaLetra',
        description:
          'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
        phone: '+55 (21) 2391-9112',
        whatsapp: '+55 (21) 2391-9112',
        email: 'contato@laletragrafica.com.br',
        address: 'Av. Marechal Floriano, 19, Sala 301 - Centro, Rio de Janeiro - RJ, 20080-003',
        business_hours: 'Seg a Sex das 08h às 18h',
        columns: [
          {
            id: 'col-about',
            title: 'Sobre a Laletra',
            type: 'text',
            order_index: 10,
            is_visible: true,
            text_content:
              'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
          },
          {
            id: 'col-categories',
            title: 'Categorias Populares',
            type: 'categories',
            order_index: 20,
            is_visible: true,
            links: [],
          },
          {
            id: 'col-differentials',
            title: 'Diferenciais',
            type: 'links',
            order_index: 30,
            is_visible: true,
            links: [
              {
                id: 'link-truck',
                label: 'Entrega rápida ou retirada balcão',
                href: '/loja',
                icon: 'truck',
              },
              {
                id: 'link-shield',
                label: 'Conferência técnica de arquivos gratuita',
                href: '/loja',
                icon: 'shield',
              },
              {
                id: 'link-card',
                label: 'Condições especiais para empresas',
                href: '/orcamentos/novo',
                icon: 'card',
              },
            ],
          },
          {
            id: 'col-contact',
            title: 'Atendimento Laletra',
            type: 'contact',
            order_index: 40,
            is_visible: true,
            links: [
              {
                id: 'link-admin',
                label: 'Gerenciar Loja (Admin)',
                href: '/loja-admin',
                icon: 'shield',
              },
              {
                id: 'link-account',
                label: 'Área do Comprador',
                href: '/loja/conta',
                icon: 'user',
              },
            ],
          },
        ],
        social_links: [
          {
            id: 'soc-instagram',
            platform: 'instagram',
            label: 'Instagram',
            url: 'https://instagram.com/laletragrafica',
            is_visible: true,
          },
          {
            id: 'soc-whatsapp',
            platform: 'whatsapp',
            label: 'WhatsApp',
            url: 'https://wa.me/552123919112',
            is_visible: true,
          },
        ],
        copyright: 'Gráfica LaLetra. Todos os direitos reservados.',
        terms_label: 'Termos de Uso',
        terms_url: '/loja',
        privacy_label: 'Política de Privacidade',
        privacy_url: '/loja',
        colors: {
          bg_color: '#0f172a',
          text_color: '#94a3b8',
          title_color: '#ffffff',
          link_color: '#94a3b8',
          link_hover_color: '#34d399',
          border_color: '#1e293b',
        },
        visibility: {
          show_logo: true,
          show_company_name: true,
          show_description: true,
          show_columns: true,
          show_social_links: true,
          show_copyright: true,
          show_legal_links: true,
        },
      },
    }

    for (const rec of records) {
      const k = rec.getString('setting_key')
      const val = parseJson(rec.get('setting_value'))
      if (k === 'appearance') {
        result.appearance = { ...result.appearance, ...val }
      } else if (k === 'commercial_info') {
        result.commercial_info = { ...result.commercial_info, ...val }
      } else if (k === 'home_layout') {
        result.home_layout = { ...result.home_layout, ...val }
      } else if (k === 'footer') {
        result.footer = { ...result.footer, ...val }
      }
    }

    return c.json(200, { success: true, data: result })
  } catch (err) {
    console.error(
      '[PUBLIC STORE API] Erro na rota GET /backend/v1/store/settings:',
      err && err.message ? err.message : err,
    )
    return c.json(500, { error: 'Erro ao carregar configurações da loja: ' + err.message })
  }
})

/**
 * POST /backend/v1/store/admin/settings
 * Atualiza configuração específica (requer admin autenticado)
 */
routerAdd('POST', '/backend/v1/store/admin/settings', (c) => {
  try {
    const authRecord = c.auth
    if (!authRecord) {
      return c.json(401, { error: 'Acesso restrito a administradores autenticados' })
    }

    const body = c.requestInfo().body || {}
    const settingKey = body.setting_key
    let settingValue = body.setting_value

    if (!settingKey) {
      return c.json(400, { error: 'setting_key é obrigatório' })
    }

    // Validação estrita do servidor para configuração do rodapé
    if (settingKey === 'footer') {
      if (!settingValue || typeof settingValue !== 'object') {
        return c.json(400, { error: 'Valor da configuração de rodapé inválido' })
      }

      // Higienizar URLs de links e redes sociais contra esquemas maliciosos (javascript:, vbscript:, data:)
      const sanitizeUrl = function (u) {
        if (!u || typeof u !== 'string') return '#'
        const trimmed = u.trim()
        const lower = trimmed.toLowerCase()
        if (
          lower.indexOf('javascript:') === 0 ||
          lower.indexOf('data:') === 0 ||
          lower.indexOf('vbscript:') === 0 ||
          lower.indexOf('file:') === 0
        ) {
          return '#'
        }
        return trimmed
      }

      if (Array.isArray(settingValue.columns)) {
        settingValue.columns = settingValue.columns.map((col) => {
          if (Array.isArray(col.links)) {
            col.links = col.links.map((lnk) => ({
              ...lnk,
              href: sanitizeUrl(lnk.href),
            }))
          }
          return col
        })
      }

      if (Array.isArray(settingValue.social_links)) {
        settingValue.social_links = settingValue.social_links.map((soc) => ({
          ...soc,
          url: sanitizeUrl(soc.url),
        }))
      }

      if (settingValue.terms_url) {
        settingValue.terms_url = sanitizeUrl(settingValue.terms_url)
      }
      if (settingValue.privacy_url) {
        settingValue.privacy_url = sanitizeUrl(settingValue.privacy_url)
      }
    }

    let rec
    try {
      rec = $app.findFirstRecordByData('store_settings', 'setting_key', settingKey)
    } catch (_) {
      const col = $app.findCollectionByNameOrId('store_settings')
      rec = new Record(col)
      rec.set('setting_key', settingKey)
    }

    rec.set('setting_value', JSON.stringify(settingValue))
    $app.save(rec)

    return c.json(200, { success: true, message: 'Configuração salva com sucesso' })
  } catch (err) {
    return c.json(500, { error: 'Erro ao salvar configuração: ' + err.message })
  }
})
