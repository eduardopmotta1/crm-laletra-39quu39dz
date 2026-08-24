// Hook: WhatsApp Webhook Diagnostics endpoint
// Accessible at GET /api/crm/webhook-diagnostics (Public / No auth required)

routerAdd('GET', '/api/crm/webhook-diagnostics', (e) => {
  const webhookUrl = 'https://crm-grafica-whatsapp-7b1a5.goskip.app/api/crm/whatsapp-webhook'
  const serverTime = new Date().toISOString()
  let lastMetaEventAt = null
  let lastMetaEventType = 'message'
  let totalInboundMessages = 0
  let totalMetaMessages = 0

  // 1. Check messages collection for inbound Meta events (wamid or inbound direction)
  try {
    const metaMessages = $app.findRecordsByFilter(
      'messages',
      'direction = "inbound" && (whatsapp_message_id ~ "wamid." || whatsapp_message_id ~ "msg_")',
      '-created',
      1,
      0,
    )
    if (metaMessages && metaMessages.length > 0) {
      const msg = metaMessages[0]
      lastMetaEventAt = msg.getString('created') || null
      const wamid = msg.getString('whatsapp_message_id') || ''
      lastMetaEventType = wamid.startsWith('wamid.') ? 'Meta Cloud API (wamid)' : 'Mensagem Inbound'
    }
  } catch (_) {}

  // Fallback if no specific wamid filter matched: search any inbound message
  if (!lastMetaEventAt) {
    try {
      const anyInbound = $app.findRecordsByFilter(
        'messages',
        'direction = "inbound"',
        '-created',
        1,
        0,
      )
      if (anyInbound && anyInbound.length > 0) {
        lastMetaEventAt = anyInbound[0].getString('created') || null
        lastMetaEventType = 'Inbound (Geral)'
      }
    } catch (_) {}
  }

  // Count total inbound and meta messages
  try {
    totalInboundMessages = $app.countRecords('messages', 'direction = "inbound"')
  } catch (_) {}

  try {
    totalMetaMessages = $app.countRecords(
      'messages',
      'direction = "inbound" && (whatsapp_message_id ~ "wamid." || whatsapp_message_id ~ "msg_")',
    )
  } catch (_) {}

  return e.json(200, {
    published: true,
    webhook_url: webhookUrl,
    last_meta_event_at: lastMetaEventAt,
    last_meta_event_type: lastMetaEventType,
    total_inbound_messages: totalInboundMessages,
    total_meta_messages: totalMetaMessages,
    server_time: serverTime,
  })
})
