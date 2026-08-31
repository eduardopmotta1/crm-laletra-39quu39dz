routerAdd('POST', '/backend/v1/crm/submit-evaluation', (e) => {
  try {
    const body = e.requestInfo().body
    const token = body.token
    if (!token) {
      return e.json(400, { error: 'Token is required' })
    }
    const records = $app.findRecordsByFilter('evaluations', `token='${token}'`, '', 1, 0)
    if (records.length === 0) {
      return e.json(404, { error: 'Evaluation not found' })
    }
    const record = records[0]
    record.set('overall_rating', body.overall_rating || 0)
    record.set('service_rating', body.service_rating || 0)
    record.set('quality_rating', body.quality_rating || 0)
    record.set('delivery_rating', body.delivery_rating || 0)
    record.set('comment', body.comment || '')
    record.set('status', 'pending_contact')
    $app.save(record)
    return e.json(200, { status: 'submitted' })
  } catch (err) {
    console.error('[SUBMIT EVALUATION] error:', err)
    return e.json(500, { error: 'Internal error' })
  }
})
