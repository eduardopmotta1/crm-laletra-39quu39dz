// Hook: Get Evaluation Details by Public Token
// GET /api/crm/get-evaluation-token?token=...
// Returns only safe, anonymized info without exposing client phone/email
routerAdd('GET', '/api/crm/get-evaluation-token', (e) => {
  const token = (e.requestInfo().query.token || '').trim()

  if (!token) {
    return e.json(400, { error: 'Token obrigatório.' })
  }

  let evalRecord = null
  try {
    evalRecord = $app.findFirstRecordByData('evaluations', 'token', token)
  } catch (_) {
    // Check if in post_sales
    try {
      const ps = $app.findFirstRecordByData('post_sales', 'evaluation_token', token)
      return e.json(200, {
        valid: true,
        already_submitted: false,
        token: token,
      })
    } catch (_) {
      return e.json(404, { error: 'Link de avaliação não encontrado ou expirado.' })
    }
  }

  const overall = evalRecord.getInt('overall_rating')
  const alreadySubmitted = overall > 0

  return e.json(200, {
    valid: true,
    already_submitted: alreadySubmitted,
    token: token,
    overall_rating: overall || null,
    service_rating: evalRecord.getInt('service_rating') || null,
    quality_rating: evalRecord.getInt('quality_rating') || null,
    delivery_rating: evalRecord.getInt('delivery_rating') || null,
    comment: evalRecord.getString('comment') || '',
  })
})
