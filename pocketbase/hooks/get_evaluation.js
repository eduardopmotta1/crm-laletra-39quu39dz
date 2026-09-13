/**
 * Hook para consulta pública de avaliação por token.
 * NÃO requer autenticação.
 * Endpoint: GET /backend/v1/crm/evaluation?token=...
 *
 * Busca avaliação em 'evaluations' e complementa com dados de 'post_sales', 'production_orders' e 'clients'
 * se ainda não estiver pré-criada em 'evaluations'.
 */
routerAdd('GET', '/backend/v1/crm/evaluation', (e) => {
  const token = e.request.url.query().get('token')
  if (!token || !token.trim()) {
    return e.json(400, { error: 'Token é obrigatório.' })
  }

  const cleanToken = token.trim()

  try {
    // 1. Tentar buscar em evaluations
    let evaluationRecord = null
    const evalRecords = $app.findRecordsByFilter('evaluations', 'token = {:token}', '', 1, 0, {
      token: cleanToken,
    })
    if (evalRecords && evalRecords.length > 0) {
      evaluationRecord = evalRecords[0]
    }

    // 2. Se não encontrar em evaluations, buscar em post_sales por evaluation_token
    let postSaleRecord = null
    if (!evaluationRecord) {
      const psRecords = $app.findRecordsByFilter(
        'post_sales',
        'evaluation_token = {:token}',
        '',
        1,
        0,
        { token: cleanToken },
      )
      if (psRecords && psRecords.length > 0) {
        postSaleRecord = psRecords[0]
      }
    }

    // Se não encontrou nem em evaluations nem em post_sales, token é inválido/inexistente
    if (!evaluationRecord && !postSaleRecord) {
      return e.json(404, { error: 'Link de avaliação inválido ou expirado.' })
    }

    // Identificar order_id, client_id, order_number
    let orderId = ''
    let clientId = ''
    let orderNumber = ''

    if (evaluationRecord) {
      orderId = evaluationRecord.getString('order_id') || ''
      clientId = evaluationRecord.getString('client_id') || ''
      orderNumber = evaluationRecord.getString('order_number') || ''
    } else if (postSaleRecord) {
      orderId = postSaleRecord.getString('order_id') || ''
      clientId = postSaleRecord.getString('client_id') || ''
      orderNumber = postSaleRecord.getString('order_number') || ''
    }

    // Se temos orderId, buscar dados do pedido de produção (order_number, product, client_name, client_id)
    let productName = ''
    let clientName = ''
    if (orderId) {
      try {
        const orderRec = $app.findRecordById('production_orders', orderId)
        if (orderRec) {
          if (!orderNumber) {
            orderNumber = orderRec.getString('order_number') || ''
          }
          productName = orderRec.getString('product') || ''
          clientName = orderRec.getString('client_name') || ''
          if (!clientId) {
            clientId = orderRec.getString('client_id') || ''
          }
        }
      } catch (_) {}
    }

    // Se ainda não temos clientName e temos clientId, buscar nome do cliente
    if (!clientName && clientId) {
      try {
        const clientRec = $app.findRecordById('clients', clientId)
        if (clientRec) {
          clientName = clientRec.getString('name') || ''
        }
      } catch (_) {}
    }

    // Checar se já foi avaliado (already_submitted)
    // Uma avaliação é considerada já submetida se overall_rating > 0 ou status != 'pending_contact'
    let overallRating = 0
    let serviceRating = 0
    let qualityRating = 0
    let deliveryRating = 0
    let comment = ''
    let evaluationId = ''
    let alreadySubmitted = false

    if (evaluationRecord) {
      evaluationId = evaluationRecord.id
      overallRating = evaluationRecord.getInt('overall_rating') || 0
      serviceRating = evaluationRecord.getInt('service_rating') || 0
      qualityRating = evaluationRecord.getInt('quality_rating') || 0
      deliveryRating = evaluationRecord.getInt('delivery_rating') || 0
      comment = evaluationRecord.getString('comment') || ''

      const status = evaluationRecord.getString('status') || ''
      if (overallRating > 0 || (status && status !== 'pending_contact')) {
        alreadySubmitted = true
      }
    }

    return e.json(200, {
      valid: true,
      token: cleanToken,
      evaluation_id: evaluationId || null,
      client_name: clientName || null,
      order_number: orderNumber || null,
      product_name: productName || null,
      already_submitted: alreadySubmitted,
      overall_rating: overallRating || null,
      service_rating: serviceRating || null,
      quality_rating: qualityRating || null,
      delivery_rating: deliveryRating || null,
      comment: comment || null,
    })
  } catch (err) {
    console.error('[GET EVALUATION] error:', err)
    return e.json(500, { error: 'Erro ao carregar link de avaliação.' })
  }
})

// Rota alias mantida para compatibilidade: GET /backend/v1/crm/get-evaluation-token?token=...
routerAdd('GET', '/backend/v1/crm/get-evaluation-token', (e) => {
  const token = e.request.url.query().get('token')
  if (!token || !token.trim()) {
    return e.json(400, { error: 'Token é obrigatório.' })
  }

  const cleanToken = token.trim()

  try {
    let evaluationRecord = null
    const evalRecords = $app.findRecordsByFilter('evaluations', 'token = {:token}', '', 1, 0, {
      token: cleanToken,
    })
    if (evalRecords && evalRecords.length > 0) {
      evaluationRecord = evalRecords[0]
    }

    let postSaleRecord = null
    if (!evaluationRecord) {
      const psRecords = $app.findRecordsByFilter(
        'post_sales',
        'evaluation_token = {:token}',
        '',
        1,
        0,
        { token: cleanToken },
      )
      if (psRecords && psRecords.length > 0) {
        postSaleRecord = psRecords[0]
      }
    }

    if (!evaluationRecord && !postSaleRecord) {
      return e.json(404, { error: 'Link de avaliação inválido ou expirado.' })
    }

    let orderId = ''
    let clientId = ''
    let orderNumber = ''

    if (evaluationRecord) {
      orderId = evaluationRecord.getString('order_id') || ''
      clientId = evaluationRecord.getString('client_id') || ''
      orderNumber = evaluationRecord.getString('order_number') || ''
    } else if (postSaleRecord) {
      orderId = postSaleRecord.getString('order_id') || ''
      clientId = postSaleRecord.getString('client_id') || ''
      orderNumber = postSaleRecord.getString('order_number') || ''
    }

    let productName = ''
    let clientName = ''
    if (orderId) {
      try {
        const orderRec = $app.findRecordById('production_orders', orderId)
        if (orderRec) {
          if (!orderNumber) {
            orderNumber = orderRec.getString('order_number') || ''
          }
          productName = orderRec.getString('product') || ''
          clientName = orderRec.getString('client_name') || ''
          if (!clientId) {
            clientId = orderRec.getString('client_id') || ''
          }
        }
      } catch (_) {}
    }

    if (!clientName && clientId) {
      try {
        const clientRec = $app.findRecordById('clients', clientId)
        if (clientRec) {
          clientName = clientRec.getString('name') || ''
        }
      } catch (_) {}
    }

    let overallRating = 0
    let serviceRating = 0
    let qualityRating = 0
    let deliveryRating = 0
    let comment = ''
    let evaluationId = ''
    let alreadySubmitted = false

    if (evaluationRecord) {
      evaluationId = evaluationRecord.id
      overallRating = evaluationRecord.getInt('overall_rating') || 0
      serviceRating = evaluationRecord.getInt('service_rating') || 0
      qualityRating = evaluationRecord.getInt('quality_rating') || 0
      deliveryRating = evaluationRecord.getInt('delivery_rating') || 0
      comment = evaluationRecord.getString('comment') || ''

      const status = evaluationRecord.getString('status') || ''
      if (overallRating > 0 || (status && status !== 'pending_contact')) {
        alreadySubmitted = true
      }
    }

    return e.json(200, {
      valid: true,
      token: cleanToken,
      evaluation_id: evaluationId || null,
      client_name: clientName || null,
      order_number: orderNumber || null,
      product_name: productName || null,
      already_submitted: alreadySubmitted,
      overall_rating: overallRating || null,
      service_rating: serviceRating || null,
      quality_rating: qualityRating || null,
      delivery_rating: deliveryRating || null,
      comment: comment || null,
    })
  } catch (err) {
    console.error('[GET EVALUATION TOKEN] error:', err)
    return e.json(500, { error: 'Erro ao carregar link de avaliação.' })
  }
})
