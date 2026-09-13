// WhatsApp Health & Diagnostics Hook

routerAdd('GET', '/backend/v1/crm/whatsapp-health', (e) => {
  return e.json(200, {
    status: 'ok',
    service: 'whatsapp-backend',
    timestamp: new Date().toISOString(),
  })
})
