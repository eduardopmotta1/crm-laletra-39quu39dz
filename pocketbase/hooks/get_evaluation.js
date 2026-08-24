// Hook: Get Evaluation Details by Public Token
// GET /api/crm/get-evaluation-token?token=...
// Returns only safe, anonymized info without exposing client phone/email/personal data
routerAdd('GET', '/api/crm/get-evaluation-token', (e) => {
  const token = (e.requestInfo().query.token || '').trim()

  if (!token) {
    return e.json(400, { error: 'Token obrigatório.' })
  }

  let evalRecord = null
  let orderNumber = ''
  let productName = ''

  try {
    evalRecord = $app.findFirstRecordByData('evaluations', 'token', token)
  } catch (_) {
    // Check if in post_sales
    try {
      const ps = $app.findFirstRecordByData('post_sales', 'evaluation_token', token)
      const orderId = ps.getString('order_id')
      if (orderId) {
        try {
          const ord = $app.findFirstRecordByData('production_orders', 'id', orderId)
          orderNumber = ord.getString('order_number')
          productName = ord.getString('product')
        } catch (_) {}
      }
      return e.json(200, {
        valid: true,
        already_submitted: false,
        token: token,
        order_number: orderNumber || ps.getString('order_number') || null,
        product_name: productName || null,
      })
    } catch (_) {
      return e.json(404, { error: 'Link de avaliação não encontrado ou expirado.' })
    }
  }

  const overall = evalRecord.getInt('overall_rating')
  const alreadySubmitted = overall > 0

  // Retrieve sanitized order details if linked
  const orderId = evalRecord.getString('order_id')
  orderNumber = evalRecord.getString('order_number')
  if (orderId) {
    try {
      const ord = $app.findFirstRecordByData('production_orders', 'id', orderId)
      if (!orderNumber) orderNumber = ord.getString('order_number')
      productName = ord.getString('product')
    } catch (_) {}
  }

  return e.json(200, {
    valid: true,
    already_submitted: alreadySubmitted,
    token: token,
    order_number: orderNumber || null,
    product_name: productName || null,
    overall_rating: overall || null,
    service_rating: evalRecord.getInt('service_rating') || null,
    quality_rating: evalRecord.getInt('quality_rating') || null,
    delivery_rating: evalRecord.getInt('delivery_rating') || null,
    comment: evalRecord.getString('comment') || '',
  })
})
