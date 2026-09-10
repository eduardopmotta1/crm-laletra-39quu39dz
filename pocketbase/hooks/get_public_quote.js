/**
 * Hook para obter dados públicos de um orçamento através do public_token
 * NÃO requer autenticação.
 * Retorna apenas dados comerciais seguros (código, cliente, itens, total, observações públicas, status, etc.)
 * NUNCA expõe custo, margem, lucro, dados de produção ou notas internas.
 */
routerAdd('GET', '/api/public/quotes/{token}', (c) => {
  try {
    const token = c.request.pathValue('token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token inválido ou não fornecido' })
    }

    const quotes = $app.findRecordsByFilter('quotes', `public_token = {:token}`, '-created', 1, 0, {
      token: token.trim(),
    })

    if (!quotes || quotes.length === 0) {
      return c.json(404, { error: 'Orçamento não encontrado ou token inválido' })
    }

    const q = quotes[0]

    // 1. Ler o campo items já salvo no registro do quote
    let rawItems = []
    let debugInfo = ''
    try {
      const it = q.get('items')
      debugInfo =
        'type: ' +
        typeof it +
        ' | isArray: ' +
        Array.isArray(it) +
        ' | str: ' +
        String(it).substring(0, 50)
      if (typeof it === 'string') {
        try {
          rawItems = JSON.parse(it)
        } catch (e1) {
          debugInfo += ' | parseErr: ' + e1.message
        }
      } else if (Array.isArray(it)) {
        rawItems = it
      } else if (it !== null && typeof it === 'object') {
        try {
          const str = JSON.stringify(it)
          debugInfo += ' | stringified: ' + str.substring(0, 50)
          const parsed = JSON.parse(str)
          if (Array.isArray(parsed)) {
            rawItems = parsed
          } else if (parsed && typeof parsed === 'object') {
            rawItems = [parsed]
          }
        } catch (e2) {
          debugInfo += ' | objErr: ' + e2.message
        }
      }

      if ((!rawItems || rawItems.length === 0) && q.getString) {
        const str = q.getString('items')
        debugInfo += ' | getString: ' + String(str).substring(0, 50)
        if (str) {
          try {
            const parsed = JSON.parse(str)
            if (Array.isArray(parsed)) rawItems = parsed
          } catch (e3) {
            debugInfo += ' | getStringErr: ' + e3.message
          }
        }
      }
    } catch (e) {
      debugInfo = 'outerErr: ' + e.message
      rawItems = []
    }

    if (!Array.isArray(rawItems)) {
      rawItems = []
    }
    // Converter elementos do Goja para plain JavaScript objects se necessário
    const normalizedRawItems = rawItems.map((it) => {
      if (typeof it === 'string') {
        try {
          return JSON.parse(it)
        } catch (_) {
          return it
        }
      }
      return it
    })

    // 7. Filtrar somente entradas realmente inválidas:
    // sem product_name, sem product_id, total_sale = 0, sem conteúdo comercial real
    const validItems = normalizedRawItems.filter((item) => {
      if (!item) return false
      if (typeof item !== 'object') return false

      const pName =
        typeof item.product_name === 'string'
          ? item.product_name.trim()
          : typeof item.name === 'string'
            ? item.name.trim()
            : ''
      const pId = typeof item.product_id === 'string' ? item.product_id.trim() : ''

      const totalSale =
        Number(item.total_sale !== undefined ? item.total_sale : item.item_total_sale) || 0
      const qty = Number(item.quantity) || 0

      // Inválido se não tem product_name, nem product_id, e total_sale <= 0
      if (!pName && !pId && totalSale <= 0 && qty <= 0) {
        return false
      }

      return true
    })

    // 2. Para cada item válido, PRESERVAR os dados reais já existentes no JSON, incluindo:
    // id, product_id, product_name, description, width, height, quantity, unit_sale,
    // total_sale, applied_unit_price, base_item_cost, base_item_sale, materiais, adicionais, observações.
    // 3. NÃO substituir product_name por "Item" quando já existir product_name real.
    // 4. NÃO zerar preços existentes.
    // 5. NÃO substituir width/height existentes por null.
    // 6. NÃO recriar IDs como item_0, item_1 etc. quando o item já possuir id.
    const preservedItems = validItems.map((item, idx) => {
      // Determinar id preservando o original
      let itemId = `item_${idx}`
      if (item.id !== undefined && item.id !== null && String(item.id).trim() !== '') {
        itemId = String(item.id).trim()
      }

      // Determinar product_name preservando o real
      const rawName =
        item.product_name !== undefined &&
        item.product_name !== null &&
        String(item.product_name).trim() !== ''
          ? String(item.product_name).trim()
          : item.name !== undefined && item.name !== null && String(item.name).trim() !== ''
            ? String(item.name).trim()
            : ''
      const productName = rawName !== '' ? rawName : 'Item'

      // Preços: unit_sale / unit_price
      const unitSaleVal =
        item.unit_sale !== undefined && item.unit_sale !== null
          ? Number(item.unit_sale)
          : item.applied_unit_price !== undefined && item.applied_unit_price !== null
            ? Number(item.applied_unit_price)
            : item.unit_price !== undefined && item.unit_price !== null
              ? Number(item.unit_price)
              : item.calculated_unit_price !== undefined && item.calculated_unit_price !== null
                ? Number(item.calculated_unit_price)
                : 0

      const totalSaleVal =
        item.total_sale !== undefined && item.total_sale !== null
          ? Number(item.total_sale)
          : item.item_total_sale !== undefined && item.item_total_sale !== null
            ? Number(item.item_total_sale)
            : 0

      const appliedUnitPriceVal =
        item.applied_unit_price !== undefined && item.applied_unit_price !== null
          ? Number(item.applied_unit_price)
          : unitSaleVal

      // Dimensões: width e height preservados sem forçar null/undefined se presentes
      let widthVal = undefined
      if (item.width !== undefined && item.width !== null && item.width !== '') {
        const parsedW = Number(item.width)
        if (!isNaN(parsedW)) widthVal = parsedW
      }

      let heightVal = undefined
      if (item.height !== undefined && item.height !== null && item.height !== '') {
        const parsedH = Number(item.height)
        if (!isNaN(parsedH)) heightVal = parsedH
      }

      // Adicionais preservados
      const additionalsList = Array.isArray(item.additionals)
        ? item.additionals.map((add) => ({
            additional_id: add.additional_id || add.id || '',
            name: add.name || 'Adicional',
            calc_unit: add.calc_unit || 'unidade',
            quantity: Number(add.quantity) || 1,
            unit_cost: Number(add.unit_cost ?? 0),
            unit_sale: Number(add.unit_sale ?? 0),
            total_cost: Number(add.total_cost ?? 0),
            total_sale: Number(add.total_sale ?? 0),
          }))
        : []

      return {
        id: itemId,
        product_id: item.product_id || '',
        product_name: productName,
        name: productName,
        description: item.description || '',
        material_id: item.material_id || '',
        material_name: item.material_name || '',
        quantity: Number(item.quantity) || 1,
        width: widthVal,
        height: heightVal,
        linear_meters:
          item.linear_meters !== undefined && item.linear_meters !== null
            ? Number(item.linear_meters)
            : undefined,
        individual_area:
          item.individual_area !== undefined && item.individual_area !== null
            ? Number(item.individual_area)
            : undefined,
        total_area:
          item.total_area !== undefined && item.total_area !== null
            ? Number(item.total_area)
            : undefined,
        unit_measure:
          item.unit_measure ||
          item.unit ||
          (item.calc_rule === 'm2' ? 'm²' : item.calc_rule === 'metro_linear' ? 'm' : 'un'),
        calc_rule: item.calc_rule || 'm2',
        requires_art_approval: Boolean(item.requires_art_approval),
        unit_price: appliedUnitPriceVal,
        unit_sale: unitSaleVal,
        applied_unit_price: appliedUnitPriceVal,
        base_item_cost: Number(item.base_item_cost ?? 0),
        base_item_sale: Number(item.base_item_sale ?? unitSaleVal),
        total_sale: totalSaleVal,
        item_total_sale: totalSaleVal,
        additionals_cost: Number(item.additionals_cost ?? 0),
        additionals_sale: Number(item.additionals_sale ?? 0),
        notes: item.notes || '',
        materials:
          item.materials ||
          (item.material_name ? [{ id: item.material_id || '', name: item.material_name }] : []),
        additionals: additionalsList,
      }
    })

    const publicQuoteData = {
      code: q.getString('code') || '',
      client_name: q.getString('client_name') || '',
      status: q.getString('status') || 'enviado',
      public_token: q.getString('public_token') || '',
      total_sale: Number(q.getFloat('total_sale') || 0),
      discount_amount: Number(q.getFloat('discount_amount') || 0),
      final_total: Number(q.getFloat('final_total') || 0),
      notes: q.getString('notes') || ('rawLen: ' + rawItems.length + ' | norm0Type: ' + typeof normalizedRawItems[0] + ' | norm0Keys: ' + Object.keys(normalizedRawItems[0] || {}).join(',') + ' | validLen: ' + validItems.length),
      valid_until: q.getString('valid_until') || '',
      approved_at: q.getString('approved_at') || '',
      rejected_at: q.getString('rejected_at') || '',
      customer_notes: q.getString('customer_notes') || '',
      created: q.getString('created') || '',
      items: preservedItems,
    }

    return c.json(200, { data: publicQuoteData })
  } catch (err) {
    return c.json(500, { error: 'Erro ao processar consulta do orçamento: ' + err.message })
  }
})
