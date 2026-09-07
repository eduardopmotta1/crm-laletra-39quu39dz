console.log('[WHATSAPP HEALTH] hook loaded')

routerAdd('GET', '/backend/v1/crm/whatsapp-health', (e) => {
  console.log('[WHATSAPP HEALTH] endpoint called')
  return e.json(200, {
    ok: true,
    service: 'whatsapp-backend',
    runtime: 'pocketbase',
    version: 'health-v1',
  })
})
