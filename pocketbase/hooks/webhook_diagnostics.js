routerAdd('GET', '/api/crm/webhook-diagnostics', (e) => {
  return e.json(200, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Webhook diagnostics endpoint is operational',
  })
})
