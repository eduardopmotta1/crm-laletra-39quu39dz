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

    // Obter itens salvos no snapshot (JSON)
    let rawItems = []
    try {
      const it = q.get('items')
      if (typeof it === 'string' && it.trim() !== '') {
        rawItems = JSON.parse(it)
      } else if (Array.isArray(it)) {
        rawItems = it
      }
    } catch (_) {
      rawItems = []
    }

    // Sanitizar itens para remover custos, margens e dados internos de cálculo
    const sanitizedItems = rawItems.map((item, idx) => {
      return {
        id: item.id || `item_${idx}`,
        product_name: item.product_name || item.name || 'Item',
        material_name: item.material_name || '',
        quantity: Number(item.quantity) || 1,
        width: item.width ? Number(item.width) : undefined,
        height: item.height ? Number(item.height) : undefined,
        unit_measure: item.unit_measure || item.unit || 'un',
        calc_rule: item.calc_rule || 'unit',
        unit_price: Number(
          item.applied_unit_price ?? item.unit_price ?? item.calculated_unit_price ?? 0,
        ),
        total_sale: Number(item.total_sale ?? 0),
        additionals: Array.isArray(item.additionals)
          ? item.additionals.map((add) => ({
              name: add.name || 'Adicional',
              quantity: Number(add.quantity) || 1,
              unit_sale: Number(add.unit_sale ?? 0),
              total_sale: Number(add.total_sale ?? 0),
            }))
          : [],
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
      notes: q.getString('notes') || '', // observações públicas gerais
      valid_until: q.getString('valid_until') || '',
      approved_at: q.getString('approved_at') || '',
      rejected_at: q.getString('rejected_at') || '',
      customer_notes: q.getString('customer_notes') || '',
      created: q.getString('created') || '',
      items: sanitizedItems,
    }

    return c.json(200, { data: publicQuoteData })
  } catch (err) {
    return c.json(500, { error: 'Erro ao processar consulta do orçamento: ' + err.message })
  }
})
