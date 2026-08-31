// WhatsApp Webhook — validação GET e recebimento POST da Meta
routerAdd('GET', '/backend/v1/crm/whatsapp-webhook', (e) => {
  const hubMode = e.request.url.query().get('hub.mode')
  const hubToken = e.request.url.query().get('hub.verify_token')
  const hubChallenge = e.request.url.query().get('hub.challenge')

  const verifyToken = 'laletra_crm_webhook_2024'

  console.log(
    '[WHATSAPP WEBHOOK GET]',
    'mode:',
    hubMode,
    'token:',
    hubToken ? hubToken.substring(0, 4) + '...' : 'undefined',
  )

  if (hubMode === 'subscribe' && hubToken === verifyToken) {
    return e.string(200, String(hubChallenge))
  }
  return e.string(403, 'Forbidden')
})

routerAdd('POST', '/backend/v1/crm/whatsapp-webhook', (e) => {
  console.log('[WHATSAPP WEBHOOK POST] received')
  try {
    const body = e.requestInfo().body
    console.log('[WHATSAPP WEBHOOK POST] body:', JSON.stringify(body))
    return e.json(200, { status: 'received' })
  } catch (err) {
    console.error('[WHATSAPP WEBHOOK POST] error:', err)
    return e.json(500, { error: 'internal' })
  }
})
