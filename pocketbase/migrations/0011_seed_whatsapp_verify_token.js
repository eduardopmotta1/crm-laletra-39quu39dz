migrate(
  (app) => {
    const settingsCol = app.findCollectionByNameOrId('system_settings')
    try {
      app.findFirstRecordByData('system_settings', 'setting_key', 'whatsapp_verify_token')
    } catch (_) {
      const rec = new Record(settingsCol)
      rec.set('setting_key', 'whatsapp_verify_token')
      rec.set('setting_value', 'laletra_crm_webhook_2024')
      rec.set('description', 'Token de verificacao do Webhook Meta WhatsApp Cloud API')
      app.save(rec)
    }
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'whatsapp_verify_token',
      )
      app.delete(rec)
    } catch (_) {}
  },
)
