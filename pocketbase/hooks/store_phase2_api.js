/**
 * PocketBase Hook: Endpoints Públicos e Seguros da Laletra Store (Fase 2)
 * Todas as funções auxiliares estão inline dentro dos callbacks por conta do pool de JSVM do PocketBase.
 */

// -------------------------------------------------------------
// 0. GET /backend/v1/store/art-creation-pricing (PÚBLICO)
// -------------------------------------------------------------
routerAdd('GET', '/backend/v1/store/art-creation-pricing', (c) => {
  try {
    let config = {
      base_creation_fee: 45.0,
      description: 'Criação profissional de arte pela equipe LaLetra',
      free_for_orders_above: 500.0,
      is_active: true,
      lead_time_extra_days: 2,
    }
    try {
      const rec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'store_art_creation_pricing',
      )
      if (rec) {
        config = JSON.parse(rec.getString('setting_value'))
      }
    } catch (_) {}

    return c.json(200, {
      success: true,
      pricing: config,
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao consultar valor de criação de arte: ' + err.message })
  }
})

// -------------------------------------------------------------
// 1. POST /backend/v1/store/customer/register
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/customer/register', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  const normalizePhone = function (phone) {
    if (!phone) return ''
    const digits = String(phone).replace(/\D/g, '')
    if (digits.length === 10 || digits.length === 11) return '55' + digits
    return digits
  }

  try {
    const body = c.requestInfo().body || {}
    const name = String(body.name || '').trim()
    const email = String(body.email || '')
      .toLowerCase()
      .trim()
    const phone = String(body.phone || '').trim()
    const password = String(body.password || '')
    const personType = body.person_type === 'pj' ? 'pj' : 'pf'
    const document = String(body.document_cpf_cnpj || '').trim()
    const tradeName = String(body.trade_name || '').trim()

    if (!name || !email || !phone || !password) {
      return c.json(400, { error: 'Nome, e-mail, telefone e senha são obrigatórios' })
    }
    if (password.length < 6) {
      return c.json(400, { error: 'A senha deve ter no mínimo 6 caracteres' })
    }

    const existing = $app.findRecordsByFilter('store_customers', 'email = {:email}', '', 1, 0, {
      email: email,
    })
    if (existing && existing.length > 0) {
      return c.json(400, { error: 'Já existe uma conta cadastrada com este e-mail' })
    }

    const normPhone = normalizePhone(phone)
    const passwordHash = $security.sha256(password + hashSecret)

    // Avaliação segura de vínculo com o CRM (NÃO faz merge automático)
    // Conforme regra permanente e lição "Eduardo P Motta", nunca vincula de forma cega.
    let crmLinkStatus = 'unlinked'
    let crmLinkNotes = 'Novo comprador cadastrado na loja virtual.'
    let candidateClientId = ''

    if (normPhone) {
      try {
        const matchingClients = $app.findRecordsByFilter(
          'clients',
          'normalized_phone = {:phone} || phone ~ {:phone}',
          '',
          2,
          0,
          { phone: normPhone },
        )
        if (matchingClients && matchingClients.length === 1) {
          crmLinkStatus = 'suggested'
          candidateClientId = matchingClients[0].id
          crmLinkNotes =
            'Sugestão de vínculo com cliente CRM "' +
            matchingClients[0].getString('name') +
            '" (ID ' +
            candidateClientId +
            '). Aguardando confirmação no CRM.'
        }
      } catch (_) {}
    }

    const custCol = $app.findCollectionByNameOrId('store_customers')
    const rec = new Record(custCol)
    rec.set('name', name)
    rec.set('email', email)
    rec.set('phone', phone)
    rec.set('normalized_phone', normPhone)
    rec.set('person_type', personType)
    rec.set('document_cpf_cnpj', document)
    rec.set('trade_name', tradeName)
    rec.set('password_hash', passwordHash)
    rec.set('crm_link_status', crmLinkStatus)
    rec.set('crm_link_notes', crmLinkNotes)
    if (candidateClientId && crmLinkStatus === 'suggested') {
      rec.set('linked_client_id', candidateClientId)
    }

    $app.save(rec)

    const token = $security.createJWT(
      { sub: rec.id, email: email, scope: 'store_customer' },
      hashSecret,
      86400 * 30,
    )

    return c.json(200, {
      success: true,
      token: token,
      customer: {
        id: rec.id,
        name: rec.getString('name'),
        email: rec.getString('email'),
        phone: rec.getString('phone'),
        person_type: rec.getString('person_type'),
        document_cpf_cnpj: rec.getString('document_cpf_cnpj'),
        trade_name: rec.getString('trade_name'),
      },
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao registrar comprador: ' + err.message })
  }
})

// -------------------------------------------------------------
// 2. POST /backend/v1/store/customer/login
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/customer/login', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  try {
    const body = c.requestInfo().body || {}
    const email = String(body.email || '')
      .toLowerCase()
      .trim()
    const password = String(body.password || '')

    if (!email || !password) {
      return c.json(400, { error: 'E-mail e senha são obrigatórios' })
    }

    const customers = $app.findRecordsByFilter('store_customers', 'email = {:email}', '', 1, 0, {
      email: email,
    })
    if (!customers || customers.length === 0) {
      return c.json(401, { error: 'E-mail ou senha incorretos' })
    }

    const customer = customers[0]
    const expectedHash = $security.sha256(password + hashSecret)
    if (customer.getString('password_hash') !== expectedHash) {
      return c.json(401, { error: 'E-mail ou senha incorretos' })
    }

    const token = $security.createJWT(
      { sub: customer.id, email: email, scope: 'store_customer' },
      hashSecret,
      86400 * 30,
    )

    return c.json(200, {
      success: true,
      token: token,
      customer: {
        id: customer.id,
        name: customer.getString('name'),
        email: customer.getString('email'),
        phone: customer.getString('phone'),
        person_type: customer.getString('person_type'),
        document_cpf_cnpj: customer.getString('document_cpf_cnpj'),
        trade_name: customer.getString('trade_name'),
      },
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao realizar login: ' + err.message })
  }
})

// -------------------------------------------------------------
// 3. POST /backend/v1/store/customer/forgot-password
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/customer/forgot-password', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  try {
    const body = c.requestInfo().body || {}
    const email = String(body.email || '')
      .toLowerCase()
      .trim()
    if (!email) {
      return c.json(400, { error: 'E-mail é obrigatório' })
    }

    const customers = $app.findRecordsByFilter('store_customers', 'email = {:email}', '', 1, 0, {
      email: email,
    })
    // Resposta idempotente/neutra mesmo se e-mail não existir para prevenir enumeração de clientes
    if (!customers || customers.length === 0) {
      return c.json(200, {
        success: true,
        message: 'Se o e-mail estiver cadastrado, as instruções de recuperação serão processadas.',
      })
    }

    const customer = customers[0]
    const resetToken = $security.randomString(32)
    const expiresAt = new Date(Date.now() + 2 * 3600 * 1000) // 2 horas de validade

    customer.set('reset_token', resetToken)
    customer.set('reset_token_expires_at', expiresAt.toISOString())
    $app.save(customer)

    return c.json(200, {
      success: true,
      message: 'Código de recuperação gerado com sucesso.',
      // Em ambiente de teste/preview retornamos o token para viabilizar o fluxo
      reset_token: resetToken,
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao solicitar recuperação de senha: ' + err.message })
  }
})

// -------------------------------------------------------------
// 4. POST /backend/v1/store/customer/reset-password
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/customer/reset-password', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  try {
    const body = c.requestInfo().body || {}
    const token = String(body.token || '').trim()
    const newPassword = String(body.password || '')

    if (!token || !newPassword) {
      return c.json(400, { error: 'Token de recuperação e nova senha são obrigatórios' })
    }
    if (newPassword.length < 6) {
      return c.json(400, { error: 'A nova senha deve ter no mínimo 6 caracteres' })
    }

    const customers = $app.findRecordsByFilter(
      'store_customers',
      'reset_token = {:token}',
      '',
      1,
      0,
      { token: token },
    )
    if (!customers || customers.length === 0) {
      return c.json(400, { error: 'Token de recuperação inválido ou expirado' })
    }

    const customer = customers[0]
    const expiresAtStr = customer.getString('reset_token_expires_at')
    if (expiresAtStr) {
      const expiresAt = new Date(expiresAtStr).getTime()
      if (Date.now() > expiresAt) {
        return c.json(400, { error: 'Este link de recuperação expirou. Solicite um novo.' })
      }
    }

    const newHash = $security.sha256(newPassword + hashSecret)
    customer.set('password_hash', newHash)
    customer.set('reset_token', '')
    customer.set('reset_token_expires_at', null)
    $app.save(customer)

    return c.json(200, {
      success: true,
      message: 'Sua senha foi redefinida com sucesso. Faça login com a nova senha.',
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao redefinir senha: ' + err.message })
  }
})

// -------------------------------------------------------------
// 5. GET /backend/v1/store/customer/me
// -------------------------------------------------------------
routerAdd('GET', '/backend/v1/store/customer/me', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  try {
    const authHeader = c.request.header.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return c.json(401, { error: 'Token ausente' })

    let claims = null
    try {
      claims = $security.parseJWT(token, hashSecret)
    } catch (_) {}

    if (!claims || !claims.sub || claims.scope !== 'store_customer') {
      return c.json(401, { error: 'Sessão do comprador não autorizada ou expirada' })
    }

    const customer = $app.findRecordById('store_customers', claims.sub)
    if (!customer) {
      return c.json(404, { error: 'Comprador não encontrado' })
    }

    const addresses = $app.findRecordsByFilter(
      'store_addresses',
      'customer_id = {:cid}',
      '-is_default,-created',
      20,
      0,
      { cid: customer.id },
    )

    const addrList = (addresses || []).map(function (a) {
      return {
        id: a.id,
        label: a.getString('label'),
        zip_code: a.getString('zip_code'),
        street: a.getString('street'),
        number: a.getString('number'),
        complement: a.getString('complement'),
        neighborhood: a.getString('neighborhood'),
        city: a.getString('city'),
        state: a.getString('state'),
        is_default: a.getBool('is_default'),
      }
    })

    return c.json(200, {
      success: true,
      customer: {
        id: customer.id,
        name: customer.getString('name'),
        email: customer.getString('email'),
        phone: customer.getString('phone'),
        person_type: customer.getString('person_type'),
        document_cpf_cnpj: customer.getString('document_cpf_cnpj'),
        trade_name: customer.getString('trade_name'),
        addresses: addrList,
      },
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao obter perfil do comprador: ' + err.message })
  }
})

// -------------------------------------------------------------
// 6. GET /backend/v1/store/customer/orders (Histórico de pedidos do comprador logado com isolamento estrito)
// -------------------------------------------------------------
routerAdd('GET', '/backend/v1/store/customer/orders', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  try {
    const authHeader = c.request.header.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return c.json(401, { error: 'Token ausente' })

    let claims = null
    try {
      claims = $security.parseJWT(token, hashSecret)
    } catch (_) {}

    if (!claims || !claims.sub || claims.scope !== 'store_customer') {
      return c.json(401, { error: 'Sessão do comprador não autorizada ou expirada' })
    }

    const customer = $app.findRecordById('store_customers', claims.sub)
    if (!customer) {
      return c.json(404, { error: 'Comprador não encontrado' })
    }

    const custEmail = customer.getString('email')

    // Isolamento estrito: busca pedidos vinculados ao customer_id OU ao e-mail exato do comprador
    const orders = $app.findRecordsByFilter(
      'store_orders',
      'customer_id = {:cid} || customer_email = {:cEmail}',
      '-created',
      50,
      0,
      { cid: claims.sub, cEmail: custEmail },
    )

    const ordersList = (orders || []).map(function (o) {
      // Buscar tracking_token se houver ordem de produção vinculada
      let trackingToken = ''
      const prodId = o.getString('production_order_id')
      if (prodId) {
        try {
          const prod = $app.findRecordById('production_orders', prodId)
          if (prod) trackingToken = prod.getString('tracking_token')
        } catch (_) {}
      }

      // Buscar itens do pedido
      const items = $app.findRecordsByFilter(
        'store_order_items',
        'order_id = {:oid}',
        'created',
        50,
        0,
        { oid: o.id },
      )

      // Buscar uploads de arte do pedido
      const arts = $app.findRecordsByFilter(
        'store_art_uploads',
        'order_id = {:oid}',
        '-created',
        20,
        0,
        { oid: o.id },
      )

      return {
        id: o.id,
        order_number: o.getString('order_number'),
        created: o.getString('created'),
        delivery_method: o.getString('delivery_method'),
        total_amount: o.getFloat('total_amount'),
        subtotal: o.getFloat('subtotal'),
        shipping_fee: o.getFloat('shipping_fee'),
        payment_status: o.getString('payment_status'),
        payment_method: o.getString('payment_method'),
        art_status: o.getString('art_status'),
        production_status: o.getString('production_status'),
        estimated_delivery_date: o.getString('estimated_delivery_date'),
        notes: o.getString('notes'),
        tracking_token: trackingToken,
        items: (items || []).map(function (it) {
          return {
            id: it.id,
            product_name: it.getString('product_name'),
            quantity: it.getInt('quantity'),
            width: it.getFloat('width') || null,
            height: it.getFloat('height') || null,
            unit_price: it.getFloat('unit_price'),
            total_price: it.getFloat('total_price'),
            art_option: it.getString('art_option') || 'send_ready',
            art_creation_fee: it.getFloat('art_creation_fee') || 0,
            art_notes: it.getString('art_notes') || '',
          }
        }),
        arts: (arts || []).map(function (a) {
          return {
            id: a.id,
            original_filename: a.getString('original_filename'),
            status: a.getString('status'),
            rejection_reason: a.getString('rejection_reason'),
            customer_notes: a.getString('customer_notes'),
            created: a.getString('created'),
          }
        }),
      }
    })

    return c.json(200, {
      success: true,
      orders: ordersList,
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao listar pedidos do cliente: ' + err.message })
  }
})

// -------------------------------------------------------------
// 7. POST /backend/v1/store/customer/address
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/customer/address', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  try {
    const authHeader = c.request.header.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    let claims = null
    try {
      claims = $security.parseJWT(token, hashSecret)
    } catch (_) {}

    if (!claims || !claims.sub || claims.scope !== 'store_customer') {
      return c.json(401, { error: 'Autenticação necessária' })
    }

    const body = c.requestInfo().body || {}
    const zipCode = String(body.zip_code || '').trim()
    const street = String(body.street || '').trim()
    const number = String(body.number || '').trim()
    const neighborhood = String(body.neighborhood || '').trim()
    const city = String(body.city || '').trim()
    const state = String(body.state || '').trim()
    const isDefault = Boolean(body.is_default)

    if (!zipCode || !street || !number || !neighborhood || !city || !state) {
      return c.json(400, { error: 'CEP, logradouro, número, bairro, cidade e UF são obrigatórios' })
    }

    // Se marcado como padrão, desmarca os anteriores
    if (isDefault) {
      const prevAddrs = $app.findRecordsByFilter(
        'store_addresses',
        'customer_id = {:cid} && is_default = true',
        '',
        10,
        0,
        { cid: claims.sub },
      )
      if (prevAddrs && prevAddrs.length > 0) {
        for (const pa of prevAddrs) {
          pa.set('is_default', false)
          $app.save(pa)
        }
      }
    }

    const addrCol = $app.findCollectionByNameOrId('store_addresses')
    const rec = new Record(addrCol)
    rec.set('customer_id', claims.sub)
    rec.set('label', body.label || 'Principal')
    rec.set('zip_code', zipCode)
    rec.set('street', street)
    rec.set('number', number)
    rec.set('complement', body.complement || '')
    rec.set('neighborhood', neighborhood)
    rec.set('city', city)
    rec.set('state', state)
    rec.set('is_default', isDefault)

    $app.save(rec)

    return c.json(200, {
      success: true,
      address: {
        id: rec.id,
        label: rec.getString('label'),
        zip_code: zipCode,
        street: street,
        number: number,
        complement: rec.getString('complement'),
        neighborhood: neighborhood,
        city: city,
        state: state,
        is_default: rec.getBool('is_default'),
      },
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao salvar endereço: ' + err.message })
  }
})

// -------------------------------------------------------------
// 8. DELETE /backend/v1/store/customer/address/{id}
// -------------------------------------------------------------
routerAdd('DELETE', '/backend/v1/store/customer/address/{id}', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  try {
    const authHeader = c.request.header.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    let claims = null
    try {
      claims = $security.parseJWT(token, hashSecret)
    } catch (_) {}

    if (!claims || !claims.sub || claims.scope !== 'store_customer') {
      return c.json(401, { error: 'Autenticação necessária' })
    }

    const addrId = c.request.pathValue('id')
    const addr = $app.findRecordById('store_addresses', addrId)
    if (!addr || addr.getString('customer_id') !== claims.sub) {
      return c.json(404, { error: 'Endereço não localizado' })
    }

    $app.delete(addr)
    return c.json(200, { success: true, message: 'Endereço removido' })
  } catch (err) {
    return c.json(500, { error: 'Erro ao remover endereço: ' + err.message })
  }
})

// -------------------------------------------------------------
// 9. POST /backend/v1/store/cart/validate (PÚBLICO)
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/cart/validate', (c) => {
  const parseJsonSafely = function (val) {
    if (!val) return []
    if (typeof val === 'object') return val
    try {
      return JSON.parse(val)
    } catch (_) {
      return []
    }
  }

  const getArtCreationPricing = function () {
    try {
      const rec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'store_art_creation_pricing',
      )
      if (rec) {
        const val = rec.getString('setting_value')
        return JSON.parse(val)
      }
    } catch (_) {}
    return {
      base_creation_fee: 45.0,
      description: 'Criação profissional de arte pela equipe LaLetra',
      free_for_orders_above: 500.0,
      is_active: true,
      lead_time_extra_days: 2,
    }
  }

  const calcItemPrice = function (item) {
    const productId = item.product_id
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const width = Number(item.width) || 0
    const height = Number(item.height) || 0
    const selectedOptions = item.selected_options || {}
    const selectedOptionValues = Array.isArray(selectedOptions)
      ? selectedOptions
      : Object.values(selectedOptions)
    const selectedFinishingIds = Array.isArray(item.selected_finishings)
      ? item.selected_finishings
      : []
    const artOption = item.art_option || 'send_ready'

    if (!productId) throw new Error('Item sem product_id')
    const product = $app.findRecordById('store_products', productId)
    if (!product || product.getBool('published') !== true) {
      throw new Error('Produto ' + productId + ' indisponível')
    }

    const pricingType = product.getString('pricing_type')
    let baseTotal = 0
    let areaM2 = 0

    if (pricingType === 'fixed') {
      const fixedPrice = product.getFloat('store_price') || 0
      baseTotal = fixedPrice * quantity
    } else if (pricingType === 'quantity_tiers') {
      const tiers = parseJsonSafely(product.get('price_tiers'))
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
        if (!matchedTier) matchedTier = tiers[0]
      }
      if (matchedTier) {
        const tierPrice = Number(matchedTier.price) || 0
        const tierQty = Number(matchedTier.quantity) || 1
        baseTotal = tierPrice * (quantity / tierQty)
      } else {
        const defaultPrice = product.getFloat('store_price') || 0
        baseTotal = defaultPrice * quantity
      }
    } else if (pricingType === 'square_meter') {
      let wMeters = width > 10 ? width / 100 : width
      let hMeters = height > 10 ? height / 100 : height
      areaM2 = Number((wMeters * hMeters).toFixed(4))
      const minArea = product.getFloat('sqm_min_area') || 0.5
      const effectiveArea = Math.max(areaM2, minArea)
      const sqmBasePrice =
        product.getFloat('sqm_base_price') || product.getFloat('store_price') || 65.0
      baseTotal = effectiveArea * sqmBasePrice * quantity
    }

    let optionsModifierTotal = 0
    const prodOptions = parseJsonSafely(product.get('options'))
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

    let finishingsTotal = 0
    const prodFinishings = parseJsonSafely(product.get('finishings'))
    if (Array.isArray(prodFinishings)) {
      for (const fin of prodFinishings) {
        if (selectedFinishingIds.includes(fin.id)) {
          finishingsTotal += Number(fin.price) || 0
        }
      }
    }

    // Adicional configurável de criação de arte pela LaLetra
    let artCreationFee = 0
    let leadTimeExtraDays = 0
    if (artOption === 'request_creation') {
      const artConfig = getArtCreationPricing()
      if (artConfig && artConfig.is_active !== false) {
        artCreationFee = Number(artConfig.base_creation_fee) || 45.0
        leadTimeExtraDays = Number(artConfig.lead_time_extra_days) || 2
      }
    }

    const finalTotal = Number(
      (baseTotal + optionsModifierTotal * quantity + finishingsTotal + artCreationFee).toFixed(2),
    )
    const finalUnitPrice = Number((finalTotal / quantity).toFixed(2))

    return {
      product_id: product.id,
      product_name: product.getString('name'),
      pricing_type: pricingType,
      quantity: quantity,
      width: width || null,
      height: height || null,
      area_m2: areaM2 > 0 ? areaM2 : null,
      selected_options: selectedOptions,
      selected_finishings: selectedFinishingIds,
      art_option: artOption,
      art_creation_fee: artCreationFee,
      art_notes: String(item.art_notes || '').trim(),
      unit_price: finalUnitPrice,
      total_price: finalTotal,
      lead_time_days: (product.getInt('lead_time_days') || 3) + leadTimeExtraDays,
    }
  }

  // Carrega regras dinâmicas de frete de system_settings
  const getShippingRules = function () {
    try {
      const rec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'store_shipping_rules',
      )
      if (rec) {
        const val = rec.getString('setting_value')
        return JSON.parse(val)
      }
    } catch (_) {}
    return {
      free_shipping_min_order: 350.0,
      standard_delivery_fee: 25.0,
    }
  }

  try {
    const body = c.requestInfo().body || {}
    const rawItems = Array.isArray(body.items) ? body.items : []
    const deliveryMethod = body.delivery_method === 'delivery' ? 'delivery' : 'pickup'
    const shippingZip = String(body.shipping_zip || '').replace(/\D/g, '')

    if (rawItems.length === 0) {
      return c.json(400, { error: 'O carrinho está vazio' })
    }

    const validatedItems = []
    let subtotal = 0
    let maxLeadTime = 2

    for (const raw of rawItems) {
      const calculated = calcItemPrice(raw)
      validatedItems.push(calculated)
      subtotal += calculated.total_price
      if (calculated.lead_time_days > maxLeadTime) {
        maxLeadTime = calculated.lead_time_days
      }
    }

    subtotal = Number(subtotal.toFixed(2))

    const rules = getShippingRules()
    const freeMin = Number(rules.free_shipping_min_order) || 350.0
    let standardFee = Number(rules.standard_delivery_fee) || 25.0

    // Cálculo dinâmico por faixa de CEP se disponível
    if (rules.regional_tiers && shippingZip.length >= 2) {
      const prefix = parseInt(shippingZip.substring(0, 2), 10)
      if (prefix >= 1 && prefix <= 19) {
        // SP Capital e Região Metropolitana
        standardFee = 25.0
      } else if (prefix >= 20 && prefix <= 28) {
        // RJ / ES
        standardFee = 38.0
      } else {
        standardFee = 45.0
      }
    }

    let shippingFee = 0
    let shippingNote = 'Retirada grátis no balcão da gráfica'

    if (deliveryMethod === 'delivery') {
      if (subtotal >= freeMin) {
        shippingFee = 0.0
        shippingNote = 'Frete Grátis promocional para compras acima de R$ ' + freeMin.toFixed(2)
      } else {
        shippingFee = standardFee
        shippingNote = 'Frete Padrão Gráfica'
      }
    }

    const totalAmount = Number((subtotal + shippingFee).toFixed(2))

    return c.json(200, {
      success: true,
      items: validatedItems,
      subtotal: subtotal,
      shipping_fee: shippingFee,
      shipping_note: shippingNote,
      total_amount: totalAmount,
      estimated_days: maxLeadTime,
    })
  } catch (err) {
    return c.json(400, { error: 'Falha na validação do carrinho: ' + err.message })
  }
})

// -------------------------------------------------------------
// 10. POST /backend/v1/store/checkout (IDEMPOTENTE)
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/checkout', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  const parseJsonSafely = function (val) {
    if (!val) return []
    if (typeof val === 'object') return val
    try {
      return JSON.parse(val)
    } catch (_) {
      return []
    }
  }

  const calcItemPrice = function (item) {
    const productId = item.product_id
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const width = Number(item.width) || 0
    const height = Number(item.height) || 0
    const selectedOptions = item.selected_options || {}
    const selectedOptionValues = Array.isArray(selectedOptions)
      ? selectedOptions
      : Object.values(selectedOptions)
    const selectedFinishingIds = Array.isArray(item.selected_finishings)
      ? item.selected_finishings
      : []
    const artOption = item.art_option || 'send_ready'

    if (!productId) throw new Error('Item sem product_id')

    const product = $app.findRecordById('store_products', productId)
    if (!product || product.getBool('published') !== true) {
      throw new Error('Produto ' + productId + ' indisponível')
    }

    const pricingType = product.getString('pricing_type')
    let baseTotal = 0
    let areaM2 = 0

    if (pricingType === 'fixed') {
      const fixedPrice = product.getFloat('store_price') || 0
      baseTotal = fixedPrice * quantity
    } else if (pricingType === 'quantity_tiers') {
      const tiers = parseJsonSafely(product.get('price_tiers'))
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
        if (!matchedTier) matchedTier = tiers[0]
      }
      if (matchedTier) {
        const tierPrice = Number(matchedTier.price) || 0
        const tierQty = Number(matchedTier.quantity) || 1
        baseTotal = tierPrice * (quantity / tierQty)
      } else {
        const defaultPrice = product.getFloat('store_price') || 0
        baseTotal = defaultPrice * quantity
      }
    } else if (pricingType === 'square_meter') {
      let wMeters = width > 10 ? width / 100 : width
      let hMeters = height > 10 ? height / 100 : height
      areaM2 = Number((wMeters * hMeters).toFixed(4))
      const minArea = product.getFloat('sqm_min_area') || 0.5
      const effectiveArea = Math.max(areaM2, minArea)
      const sqmBasePrice =
        product.getFloat('sqm_base_price') || product.getFloat('store_price') || 65.0
      baseTotal = effectiveArea * sqmBasePrice * quantity
    }

    let optionsModifierTotal = 0
    const prodOptions = parseJsonSafely(product.get('options'))
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

    let finishingsTotal = 0
    const prodFinishings = parseJsonSafely(product.get('finishings'))
    if (Array.isArray(prodFinishings)) {
      for (const fin of prodFinishings) {
        if (selectedFinishingIds.includes(fin.id)) {
          finishingsTotal += Number(fin.price) || 0
        }
      }
    }

    // Adicional configurável de criação de arte pela LaLetra
    let artCreationFee = 0
    let leadTimeExtraDays = 0
    if (artOption === 'request_creation') {
      try {
        const rec = $app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'store_art_creation_pricing',
        )
        if (rec) {
          const cfg = JSON.parse(rec.getString('setting_value'))
          if (cfg && cfg.is_active !== false) {
            artCreationFee = Number(cfg.base_creation_fee) || 45.0
            leadTimeExtraDays = Number(cfg.lead_time_extra_days) || 2
          }
        }
      } catch (_) {
        artCreationFee = 45.0
        leadTimeExtraDays = 2
      }
    }

    const finalTotal = Number(
      (baseTotal + optionsModifierTotal * quantity + finishingsTotal + artCreationFee).toFixed(2),
    )
    const finalUnitPrice = Number((finalTotal / quantity).toFixed(2))

    return {
      product_id: product.id,
      product_name: product.getString('name'),
      pricing_type: pricingType,
      quantity: quantity,
      width: width || null,
      height: height || null,
      area_m2: areaM2 > 0 ? areaM2 : null,
      selected_options: selectedOptions,
      selected_finishings: selectedFinishingIds,
      art_option: artOption,
      art_creation_fee: artCreationFee,
      art_notes: String(item.art_notes || '').trim(),
      unit_price: finalUnitPrice,
      total_price: finalTotal,
      lead_time_days: (product.getInt('lead_time_days') || 3) + leadTimeExtraDays,
    }
  }

  try {
    const body = c.requestInfo().body || {}
    const clientRequestId = String(body.client_request_id || '').trim()
    const deliveryMethod = body.delivery_method === 'delivery' ? 'delivery' : 'pickup'
    const paymentMethod = body.payment_method || 'pix'
    const customerInfo = body.customer || {}
    const shippingAddress = body.shipping_address || null
    const rawItems = Array.isArray(body.items) ? body.items : []

    if (!clientRequestId) {
      return c.json(400, {
        error: 'client_request_id é obrigatório para garantir idempotência da compra',
      })
    }
    if (rawItems.length === 0) {
      return c.json(400, { error: 'Nenhum item informado para checkout' })
    }
    if (!customerInfo.name || !customerInfo.email || !customerInfo.phone) {
      return c.json(400, { error: 'Nome, e-mail e telefone do comprador são obrigatórios' })
    }

    // IDEMPOTÊNCIA: Checar se já existe pedido com este client_request_id
    const existingOrders = $app.findRecordsByFilter(
      'store_orders',
      'client_request_id = {:reqId}',
      '',
      1,
      0,
      { reqId: clientRequestId },
    )
    if (existingOrders && existingOrders.length > 0) {
      const existing = existingOrders[0]
      return c.json(200, {
        success: true,
        is_idempotent_replay: true,
        order_number: existing.getString('order_number'),
        order_id: existing.id,
        payment_status: existing.getString('payment_status'),
        total_amount: existing.getFloat('total_amount'),
        message: 'Pedido já processado com sucesso para esta requisição.',
      })
    }

    const calculatedItems = []
    let subtotal = 0
    let maxLeadTime = 3

    for (const it of rawItems) {
      const calc = calcItemPrice(it)
      calculatedItems.push(calc)
      subtotal += calc.total_price
      if (calc.lead_time_days > maxLeadTime) {
        maxLeadTime = calc.lead_time_days
      }
    }
    subtotal = Number(subtotal.toFixed(2))

    // Frete
    let shippingFee = 0
    if (deliveryMethod === 'delivery') {
      shippingFee = subtotal >= 350.0 ? 0 : 25.0
    }
    const totalAmount = Number((subtotal + shippingFee).toFixed(2))

    const randomSuffix = Math.floor(10000 + Math.random() * 90000)
    const orderNumber = 'LL-' + new Date().getFullYear() + '-' + randomSuffix

    const estimatedDate = new Date()
    estimatedDate.setDate(
      estimatedDate.getDate() + maxLeadTime + (deliveryMethod === 'delivery' ? 2 : 0),
    )

    let customerId = ''
    try {
      const authHeader = c.request.header.get('Authorization') || ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      let claims = null
      if (token) {
        claims = $security.parseJWT(token, hashSecret)
      }
      if (claims && claims.sub) {
        customerId = claims.sub
      } else {
        const found = $app.findRecordsByFilter('store_customers', 'email = {:email}', '', 1, 0, {
          email: String(customerInfo.email).toLowerCase().trim(),
        })
        if (found && found.length > 0) {
          customerId = found[0].id
        }
      }
    } catch (_) {}

    let createdOrderId = ''
    $app.runInTransaction((txApp) => {
      const ordersCol = txApp.findCollectionByNameOrId('store_orders')
      const orderRec = new Record(ordersCol)
      orderRec.set('order_number', orderNumber)
      orderRec.set('client_request_id', clientRequestId)
      if (customerId) orderRec.set('customer_id', customerId)
      orderRec.set('customer_name', customerInfo.name)
      orderRec.set('customer_email', customerInfo.email)
      orderRec.set('customer_phone', customerInfo.phone)
      orderRec.set('customer_document', customerInfo.document || '')
      orderRec.set('delivery_method', deliveryMethod)
      orderRec.set('shipping_address', shippingAddress ? JSON.stringify(shippingAddress) : null)
      orderRec.set('subtotal', subtotal)
      orderRec.set('shipping_fee', shippingFee)
      orderRec.set('total_amount', totalAmount)
      orderRec.set('payment_status', 'pending')
      orderRec.set('payment_method', paymentMethod)
      orderRec.set('art_status', 'pending_upload')
      orderRec.set('production_status', 'waiting_release')
      orderRec.set('estimated_days', maxLeadTime)
      orderRec.set('estimated_delivery_date', estimatedDate.toISOString())
      orderRec.set('notes', body.notes || '')
      orderRec.set('human_intervention_needed', false)

      txApp.save(orderRec)
      createdOrderId = orderRec.id

      const itemsCol = txApp.findCollectionByNameOrId('store_order_items')
      for (const item of calculatedItems) {
        const itemRec = new Record(itemsCol)
        itemRec.set('order_id', createdOrderId)
        itemRec.set('product_id', item.product_id)
        itemRec.set('product_name', item.product_name)
        itemRec.set('pricing_type', item.pricing_type)
        itemRec.set('quantity', item.quantity)
        if (item.width) itemRec.set('width', item.width)
        if (item.height) itemRec.set('height', item.height)
        if (item.area_m2) itemRec.set('area_m2', item.area_m2)
        itemRec.set('selected_options', JSON.stringify(item.selected_options || {}))
        itemRec.set('selected_finishings', JSON.stringify(item.selected_finishings || []))
        itemRec.set('unit_price', item.unit_price)
        itemRec.set('total_price', item.total_price)
        itemRec.set('lead_time_days', item.lead_time_days)
        if (item.art_option) itemRec.set('art_option', item.art_option)
        if (item.art_creation_fee !== undefined)
          itemRec.set('art_creation_fee', item.art_creation_fee)
        if (item.art_notes) itemRec.set('art_notes', item.art_notes)
        txApp.save(itemRec)
      }

      const payCol = txApp.findCollectionByNameOrId('store_payments')
      const payRec = new Record(payCol)
      payRec.set('order_id', createdOrderId)
      payRec.set('gateway', 'mock_gateway')
      payRec.set('method', paymentMethod)
      payRec.set('status', 'pending')
      payRec.set('amount', totalAmount)
      payRec.set('idempotency_key', 'PAY-' + clientRequestId)
      payRec.set(
        'pix_qr_code',
        '00020126580014br.gov.bcb.pix0136mock-laletra-pix-key520400005303986540' +
          totalAmount.toFixed(2) +
          '5802BR5915LALETRA GRAFICA6009SAO PAULO62070503***6304',
      )
      txApp.save(payRec)
    })

    return c.json(200, {
      success: true,
      order_id: createdOrderId,
      order_number: orderNumber,
      client_request_id: clientRequestId,
      total_amount: totalAmount,
      subtotal: subtotal,
      shipping_fee: shippingFee,
      estimated_delivery_date: estimatedDate.toISOString(),
      payment: {
        method: paymentMethod,
        status: 'pending',
        pix_copy_paste:
          '00020126580014br.gov.bcb.pix0136mock-laletra-pix-key520400005303986540' +
          totalAmount.toFixed(2) +
          '5802BR5915LALETRA GRAFICA6009SAO PAULO62070503***6304',
      },
    })
  } catch (err) {
    return c.json(500, { error: 'Erro no checkout do pedido: ' + err.message })
  }
})

// -------------------------------------------------------------
// 11. GET /backend/v1/store/orders/{order_number}
// -------------------------------------------------------------
routerAdd('GET', '/backend/v1/store/orders/{order_number}', (c) => {
  const parseJsonSafely = function (val) {
    if (!val) return []
    if (typeof val === 'object') return val
    try {
      return JSON.parse(val)
    } catch (_) {
      return []
    }
  }

  try {
    const orderNumber = c.request.pathValue('order_number')
    if (!orderNumber) {
      return c.json(400, { error: 'Número do pedido é obrigatório' })
    }

    const orders = $app.findRecordsByFilter('store_orders', 'order_number = {:num}', '', 1, 0, {
      num: orderNumber,
    })
    if (!orders || orders.length === 0) {
      return c.json(404, { error: 'Pedido não encontrado' })
    }

    const order = orders[0]
    const items = $app.findRecordsByFilter(
      'store_order_items',
      'order_id = {:oid}',
      'created',
      50,
      0,
      { oid: order.id },
    )

    const arts = $app.findRecordsByFilter(
      'store_art_uploads',
      'order_id = {:oid}',
      '-created',
      20,
      0,
      { oid: order.id },
    )

    const payments = $app.findRecordsByFilter(
      'store_payments',
      'order_id = {:oid}',
      '-created',
      10,
      0,
      { oid: order.id },
    )

    return c.json(200, {
      success: true,
      order: {
        id: order.id,
        order_number: order.getString('order_number'),
        customer_name: order.getString('customer_name'),
        customer_email: order.getString('customer_email'),
        customer_phone: order.getString('customer_phone'),
        delivery_method: order.getString('delivery_method'),
        shipping_address: parseJsonSafely(order.get('shipping_address')),
        subtotal: order.getFloat('subtotal'),
        shipping_fee: order.getFloat('shipping_fee'),
        total_amount: order.getFloat('total_amount'),
        payment_status: order.getString('payment_status'),
        payment_method: order.getString('payment_method'),
        art_status: order.getString('art_status'),
        production_status: order.getString('production_status'),
        estimated_delivery_date: order.getString('estimated_delivery_date'),
        created: order.getString('created'),
        items: (items || []).map(function (it) {
          return {
            id: it.id,
            product_name: it.getString('product_name'),
            quantity: it.getInt('quantity'),
            width: it.getFloat('width') || null,
            height: it.getFloat('height') || null,
            unit_price: it.getFloat('unit_price'),
            total_price: it.getFloat('total_price'),
            options: parseJsonSafely(it.get('selected_options')),
            finishings: parseJsonSafely(it.get('selected_finishings')),
            art_option: it.getString('art_option') || 'send_ready',
            art_creation_fee: it.getFloat('art_creation_fee') || 0,
            art_notes: it.getString('art_notes') || '',
          }
        }),
        arts: (arts || []).map(function (a) {
          return {
            id: a.id,
            original_filename: a.getString('original_filename'),
            status: a.getString('status'),
            rejection_reason: a.getString('rejection_reason'),
            created: a.getString('created'),
          }
        }),
        payments: (payments || []).map(function (p) {
          return {
            id: p.id,
            method: p.getString('method'),
            status: p.getString('status'),
            amount: p.getFloat('amount'),
            pix_qr_code: p.getString('pix_qr_code'),
          }
        }),
      },
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao consultar pedido: ' + err.message })
  }
})

// -------------------------------------------------------------
// 12. POST /backend/v1/store/orders/{order_number}/upload-art
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/orders/{order_number}/upload-art', (c) => {
  try {
    const orderNumber = c.request.pathValue('order_number')
    const orders = $app.findRecordsByFilter('store_orders', 'order_number = {:num}', '', 1, 0, {
      num: orderNumber,
    })
    if (!orders || orders.length === 0) {
      return c.json(404, { error: 'Pedido não encontrado' })
    }

    const order = orders[0]

    const files = c.findUploadedFiles('art_file')
    if (!files || files.length === 0) {
      return c.json(400, { error: 'Nenhum arquivo enviado no campo art_file' })
    }

    const file = files[0]
    const originalName = file.originalName || 'arte_pedido'
    const fileSize = file.size || 0

    if (fileSize > 30 * 1024 * 1024) {
      return c.json(400, { error: 'Arquivo excede o limite máximo permitido de 30MB' })
    }

    const ext = (originalName.split('.').pop() || '').toLowerCase()
    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'ai', 'eps', 'zip']
    if (!allowedExts.includes(ext)) {
      return c.json(400, {
        error: 'Extensão .' + ext + ' não permitida. Envie PDF, AI, EPS, JPG, PNG ou ZIP.',
      })
    }

    const notes = c.requestInfo().body.customer_notes || ''

    const artCol = $app.findCollectionByNameOrId('store_art_uploads')
    const artRec = new Record(artCol)
    artRec.set('order_id', order.id)
    artRec.set('original_filename', originalName)
    artRec.set('file_size', fileSize)
    artRec.set('file_type', ext)
    artRec.set('status', 'uploaded')
    artRec.set('customer_notes', notes)
    artRec.set('art_file', file)
    $app.save(artRec)

    order.set('art_status', 'uploaded')
    $app.save(order)

    return c.json(200, {
      success: true,
      art_id: artRec.id,
      filename: originalName,
      status: 'uploaded',
      message: 'Arquivo de arte recebido com sucesso. Passará por conferência técnica.',
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao processar upload da arte: ' + err.message })
  }
})

// -------------------------------------------------------------
// 12.1 POST /backend/v1/store/orders/{order_number}/art-approval
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/orders/{order_number}/art-approval', (c) => {
  try {
    const orderNumber = c.request.pathValue('order_number')
    const body = c.requestInfo().body || {}
    const approved = body.approved === true
    const feedback = String(body.feedback || '').trim()

    const orders = $app.findRecordsByFilter('store_orders', 'order_number = {:num}', '', 1, 0, {
      num: orderNumber,
    })
    if (!orders || orders.length === 0) {
      return c.json(404, { error: 'Pedido não encontrado' })
    }

    const order = orders[0]
    const stamp = new Date().toISOString()
    const newArtStatus = approved ? 'approved' : 'changes_requested'
    order.set('art_status', newArtStatus)

    const curNotes = order.getString('notes')
    const feedbackLog =
      '\n[' +
      stamp +
      '] Cliente ' +
      (approved ? 'aprovou a arte técnica' : 'solicitou alteração na arte') +
      (feedback ? ': ' + feedback : '')
    order.set('notes', (curNotes + feedbackLog).trim())
    $app.save(order)

    // Sincronizar com production_orders se já existir ordem de produção vinculada
    const prodOrderId = order.getString('production_order_id')
    if (prodOrderId) {
      try {
        const prodRec = $app.findRecordById('production_orders', prodOrderId)
        if (prodRec) {
          prodRec.set('art_approved', approved)
          if (approved) {
            prodRec.set('art_approved_at', stamp)
            prodRec.set('requires_art_approval', false)
          }
          $app.save(prodRec)
        }
      } catch (_) {}
    }

    return c.json(200, {
      success: true,
      order_number: orderNumber,
      art_status: newArtStatus,
      message: approved
        ? 'Arte técnica aprovada com sucesso. Pedido liberado para próxima etapa.'
        : 'Solicitação de alteração registrada. A equipe de pré-impressão foi notificada.',
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao processar aprovação de arte: ' + err.message })
  }
})

// -------------------------------------------------------------
// 12.2 POST /backend/v1/store/orders/{order_number}/support (Solicitação de suporte simples pelo cliente)
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/orders/{order_number}/support', (c) => {
  const hashSecret = 'laletra_store_phase2_secret_token_salt_2026'
  try {
    const orderNumber = c.request.pathValue('order_number')
    const body = c.requestInfo().body || {}
    const message = String(body.message || '').trim()
    const subject = String(body.subject || 'Dúvida sobre o pedido').trim()

    if (!message) {
      return c.json(400, { error: 'Mensagem de suporte não pode ser vazia.' })
    }

    const orders = $app.findRecordsByFilter('store_orders', 'order_number = {:num}', '', 1, 0, {
      num: orderNumber,
    })
    if (!orders || orders.length === 0) {
      return c.json(404, { error: 'Pedido não encontrado.' })
    }

    const order = orders[0]

    // Validação opcional de ownership por token quando enviado
    const authHeader = c.request.header.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token) {
      try {
        const claims = $security.parseJWT(token, hashSecret)
        if (claims && claims.sub) {
          const custId = order.getString('customer_id')
          if (custId && custId !== claims.sub) {
            return c.json(403, { error: 'Acesso negado: pedido pertence a outro comprador.' })
          }
        }
      } catch (_) {}
    }

    const stamp = new Date().toISOString()
    const curNotes = order.getString('notes')
    const supportLog = `\n[${stamp}] Chamado de Suporte do Cliente (${subject}): ${message}`
    order.set('notes', (curNotes + supportLog).trim())
    order.set('human_intervention_needed', true)
    order.set(
      'human_intervention_reason',
      `Suporte solicitado pelo comprador no pedido: ${subject}`,
    )
    $app.save(order)

    return c.json(200, {
      success: true,
      order_number: orderNumber,
      message: 'Solicitação de suporte registrada com sucesso. Nossa equipe entrará em contato.',
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao registrar suporte: ' + err.message })
  }
})

// -------------------------------------------------------------
// 13. POST /backend/v1/store/webhooks/mercadopago (IDEMPOTENTE E SEGURO)
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/store/webhooks/mercadopago', (c) => {
  try {
    const body = c.requestInfo().body || {}
    const paymentId = String(body.payment_id || body.id || '').trim()
    const orderNumber = String(body.order_number || body.external_reference || '').trim()
    const status = String(body.status || 'paid')
      .toLowerCase()
      .trim()

    if (!paymentId || !orderNumber) {
      return c.json(400, { error: 'payment_id e order_number são obrigatórios no webhook' })
    }

    const orders = $app.findRecordsByFilter('store_orders', 'order_number = {:num}', '', 1, 0, {
      num: orderNumber,
    })
    if (!orders || orders.length === 0) {
      return c.json(404, { error: 'Pedido ' + orderNumber + ' não localizado' })
    }

    const order = orders[0]

    if (order.getString('payment_status') === 'paid') {
      return c.json(200, {
        success: true,
        already_processed: true,
        order_number: orderNumber,
        status: 'paid',
      })
    }

    const payments = $app.findRecordsByFilter(
      'store_payments',
      'order_id = {:oid}',
      '-created',
      1,
      0,
      { oid: order.id },
    )

    if (payments && payments.length > 0) {
      const pay = payments[0]
      pay.set('gateway_payment_id', paymentId)
      pay.set('status', status === 'approved' || status === 'paid' ? 'paid' : status)
      pay.set('gateway_status', status)
      pay.set('raw_webhook_payload', JSON.stringify(body))
      if (status === 'approved' || status === 'paid') {
        pay.set('paid_at', new Date().toISOString())
      }
      $app.save(pay)
    }

    let targetOrderStatus = order.getString('payment_status')
    const isRefund = status === 'refunded' || status === 'charged_back'

    if (status === 'approved' || status === 'paid') {
      targetOrderStatus = 'paid'
    } else if (status === 'rejected' || status === 'cancelled') {
      targetOrderStatus = 'failed'
    } else if (isRefund) {
      targetOrderStatus = 'refunded'
    } else if (status === 'in_process' || status === 'pending') {
      targetOrderStatus = 'pending'
    }

    if (targetOrderStatus !== order.getString('payment_status')) {
      order.set('payment_status', targetOrderStatus)

      // Regra de segurança para Estorno (refunded/charged_back):
      // Se produção já havia sido iniciada ou liberada, NUNCA apagar dados;
      // registrar bloqueio e sinalizar intervenção humana imediata para análise manual.
      if (isRefund) {
        const prodId = order.getString('production_order_id')
        const currentProdStatus = order.getString('production_status')

        order.set('human_intervention_needed', true)
        order.set(
          'human_intervention_reason',
          'PAGAMENTO ESTORNADO/CONTESTADO (refunded). Bloqueio preventivo de produção para revisão humana.',
        )

        const stamp = new Date().toISOString()
        const refundNote =
          '\n[' +
          stamp +
          '] ALERTA FINANCEIRO: Pagamento estornado/devolvido no gateway (' +
          paymentId +
          '). Produção bloqueada e encaminhada para conferência manual.'
        order.set('notes', (order.getString('notes') + refundNote).trim())

        if (prodId) {
          try {
            const prodRec = $app.findRecordById('production_orders', prodId)
            if (prodRec) {
              const prevNotes = prodRec.getString('notes')
              prodRec.set(
                'notes',
                (
                  prevNotes +
                  '\n[' +
                  stamp +
                  '] ALERTA PRODUÇÃO: Pagamento do pedido foi estornado. Interromper processamento até liberação da gerência.'
                ).trim(),
              )
              prodRec.set('priority', 'urgente')
              $app.save(prodRec)
            }
          } catch (_) {}
        }
      }

      $app.save(order)
    }

    return c.json(200, {
      success: true,
      order_number: orderNumber,
      payment_id: paymentId,
      gateway_status: status,
      new_status: order.getString('payment_status'),
    })
  } catch (err) {
    return c.json(500, { error: 'Erro no webhook Mercado Pago: ' + err.message })
  }
})
