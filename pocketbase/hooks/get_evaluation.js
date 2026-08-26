routerAdd('GET', '/api/crm/evaluation', (e) => {
  const token = e.request.url.query().get('token')
  if (!token) {
    return e.json(400, { error: 'Token is required' })
  }
  try {
    const records = $app.findRecordsByFilter('evaluations', `token='${token}'`, '', 1, 0)
    if (records.length === 0) {
      return e.json(404, { error: 'Evaluation not found' })
    }
    const record = records[0]
    return e.json(200, {
      id: record.id,
      overall_rating: record.get('overall_rating'),
      service_rating: record.get('service_rating'),
      quality_rating: record.get('quality_rating'),
      delivery_rating: record.get('delivery_rating'),
      comment: record.get('comment'),
      status: record.get('status'),
      created: record.get('created'),
    })
  } catch (err) {
    console.error('[GET EVALUATION] error:', err)
    return e.json(500, { error: 'Internal error' })
  }
})
