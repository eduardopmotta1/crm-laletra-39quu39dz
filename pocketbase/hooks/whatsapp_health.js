// WhatsApp Health & Diagnostics Hook

routerAdd('GET', '/backend/v1/crm/whatsapp-health', (e) => {
  let cachedData = null
  try {
    const cr = $app.findFirstRecordByData(
      'system_settings',
      'setting_key',
      'meta_credential_validation_result',
    )
    if (cr) {
      cachedData = JSON.parse(cr.getString('setting_value'))
    }
  } catch (_) {}

  return e.json(200, {
    status: 'ok',
    service: 'whatsapp-backend',
    timestamp: new Date().toISOString(),
    validation_result: cachedData,
  })
})
