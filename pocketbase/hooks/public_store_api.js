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
      100,
      0,
    )

    const catCol = $app.findCollectionByNameOrId('store_categories')
    const colId = catCol ? catCol.id : 'store_categories'

    const data = cats.map((cat) => {
      const img = cat.getString('image')
      return {
        id: cat.id,
        name: cat.getString('name'),
        slug: cat.getString('slug'),
        description: cat.getString('description') || '',
        icon: cat.getString('icon') || '',
        image_url: img ? `${cleanHost}/api/files/${colId}/${cat.id}/${img}` : null,
        order_index: cat.getInt('order_index') || 0,
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
      return {
        id: b.id,
        title: b.getString('title'),
        subtitle: b.getString('subtitle') || '',
        cta_text: b.getString('cta_text') || 'Ver Mais',
        link_url: b.getString('link_url') || '/loja',
        badge: b.getString('badge') || '',
        bg_color: b.getString('bg_color') || 'from-emerald-900 to-slate-900',
        image_url: img ? `${cleanHost}/api/files/${colId}/${b.id}/${img}` : null,
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
        const cat = $app.findFirstRecordByData('store_categories', 'slug', qCategory.trim())
        if (cat) {
          filter += ` && category_id = '${cat.id}'`
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

    const products = $app.findRecordsByFilter('store_products', filter, 'order_index,name', 100, 0)

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

    if (product.getBool('quote_only') === true) {
      return c.json(200, {
        success: true,
        quote_only: true,
        message: 'Este produto requer orçamento sob medida com a equipe comercial.',
        total: 0,
        unit_price: 0,
      })
    }

    const pricingType = product.getString('pricing_type')
    let baseTotal = 0
    let unitPrice = 0
    let areaM2 = 0

    // 1. Cálculo base de acordo com pricing_type
    if (pricingType === 'fixed') {
      const fixedPrice = product.getFloat('store_price') || 0
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

    const finalTotal = Number(
      (baseTotal + optionsModifierTotal * quantity + finishingsTotal).toFixed(2),
    )
    const finalUnitPrice = Number((finalTotal / (quantity || 1)).toFixed(2))

    return c.json(200, {
      success: true,
      quote_only: false,
      product_id: productId,
      pricing_type: pricingType,
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
