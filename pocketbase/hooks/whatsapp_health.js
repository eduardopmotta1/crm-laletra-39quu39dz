// WhatsApp Health & Diagnostics Hook

routerAdd('GET', '/backend/v1/crm/whatsapp-health', (e) => {
  const records = $app.findRecordsByFilter('system_settings', "setting_key ~ 'run_'", '-created', 100, 0)
  const map = {}
  for (let i = 0; i < records.length; i++) {
    map[records[i].getString('setting_key')] = records[i].getString('setting_value')
  }

  // Also clean up all run_, diag_ and trigger_ records from system_settings right now if ?clean=true
  const isClean = e.requestInfo().query['clean'] === 'true'
  let cleanedCount = 0
  if (isClean) {
    const toClean = $app.findRecordsByFilter('system_settings', "setting_key ~ 'diag_' || setting_key ~ 'run_' || setting_key ~ 'trigger_diag'", '-created', 500, 0)
    for (let c = 0; c < toClean.length; c++) {
      try {
        $app.delete(toClean[c])
        cleanedCount++
      } catch (_) {}
    }
  }

  return e.json(200, {
    status: 'ok',
    service: 'whatsapp-backend',
    timestamp: new Date().toISOString(),
    cleanedCount: cleanedCount,
    keys: Object.keys(map),
    data: map,
  })
})
