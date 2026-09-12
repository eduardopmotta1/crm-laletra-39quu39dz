// Hook with routerAdd
routerAdd('GET', '/backend/v1/crm/run-meta-diag', (e) => {
  const metaToken = $os.getenv('WHATSAPP_ACCESS_TOKEN') || ''
  const metaPhoneId = $os.getenv('WHATSAPP_PHONE_NUMBER_ID') || ''
  const metaApiVersion = $os.getenv('WHATSAPP_GRAPH_API_VERSION') || 'v21.0'

  // 1. GET /phone_id
  const r1 = $http.send({
    url: 'https://graph.facebook.com/' + metaApiVersion + '/' + metaPhoneId,
    method: 'GET',
    headers: { Authorization: 'Bearer ' + metaToken },
    timeout: 10,
  })

  // 2. GET /debug_token?input_token=...&access_token=...
  const r2 = $http.send({
    url:
      'https://graph.facebook.com/' +
      metaApiVersion +
      '/debug_token?input_token=' +
      metaToken +
      '&access_token=' +
      metaToken,
    method: 'GET',
    timeout: 10,
  })

  // 3. GET /me?fields=id,name
  const r3 = $http.send({
    url: 'https://graph.facebook.com/' + metaApiVersion + '/me?fields=id,name',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + metaToken },
    timeout: 10,
  })

  const diagResult = {
    phone_id: metaPhoneId,
    r1: { status: r1 ? r1.statusCode : 0, data: r1 ? r1.json || r1.raw : null },
    r2: { status: r2 ? r2.statusCode : 0, data: r2 ? r2.json || r2.raw : null },
    r3: { status: r3 ? r3.statusCode : 0, data: r3 ? r3.json || r3.raw : null },
  }

  try {
    const rec = $app.findFirstRecordByData(
      'system_settings',
      'setting_key',
      'temp_meta_test_status',
    )
    if (rec) {
      rec.set('description', JSON.stringify(diagResult).substring(0, 1500))
      rec.set('setting_value', 'diag_' + Date.now())
      $app.save(rec)
    }
  } catch (err) {
    return e.json(500, { error: String(err) })
  }

  return e.json(200, diagResult)
})
