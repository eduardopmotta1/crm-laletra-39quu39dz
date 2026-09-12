console.log('[WHATSAPP HEALTH] hook loaded')

routerAdd('GET', '/backend/v1/crm/whatsapp-health', (e) => {
  console.log('[WHATSAPP HEALTH] endpoint called')
  return e.json(200, {
    status: 'ok',
    service: 'whatsapp-backend',
    timestamp: new Date().toISOString(),
  })
})