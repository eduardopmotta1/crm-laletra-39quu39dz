// Hook: Sync WhatsApp Message Templates from Meta Graph API
// Accessible at POST /api/crm/whatsapp-sync-templates
routerAdd(
  'POST',
  '/api/crm/whatsapp-sync-templates',
  (e) => {
    let token = ''
    let wabaId = ''
    try {
      const tokenRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'whatsapp_access_token',
      )
      token = tokenRec ? tokenRec.getString('setting_value') : ''
    } catch (_) {}
    try {
      const wabaRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'whatsapp_business_account_id',
      )
      wabaId = wabaRec ? wabaRec.getString('setting_value') : ''
    } catch (_) {}

    const templatesCol = $app.findCollectionByNameOrId('whatsapp_templates')

    // If no Meta credentials configured or DEMO_TOKEN, return local templates
    if (!token || !wabaId || token.includes('DEMO_TOKEN') || token.length < 20) {
      const localTemplates = $app.findRecordsByFilter('whatsapp_templates', '', '-created', 100, 0)
      return e.json(200, {
        synced: false,
        message:
          'Credenciais Meta WABA não configuradas ou em modo de demonstração. Exibindo templates locais.',
        count: localTemplates.length,
      })
    }

    try {
      const res = $http.send({
        url: 'https://graph.facebook.com/v20.0/' + wabaId + '/message_templates?limit=100',
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + token,
        },
        timeout: 15,
      })

      if (res.statusCode !== 200 || !res.json || !res.json.data) {
        return e.json(400, {
          synced: false,
          error:
            res.json && res.json.error
              ? res.json.error.message
              : 'Falha ao buscar templates na Meta',
        })
      }

      const metaList = res.json.data || []
      let updatedCount = 0

      for (let i = 0; i < metaList.length; i++) {
        const t = metaList[i]
        const name = t.name
        const status = t.status || 'APPROVED'
        const category = t.category || 'UTILITY'
        const language = t.language || 'pt_BR'

        // Extract body text from components
        let bodyText = ''
        if (t.components && Array.isArray(t.components)) {
          for (let j = 0; j < t.components.length; j++) {
            if (t.components[j].type === 'BODY') {
              bodyText = t.components[j].text || ''
              break
            }
          }
        }

        if (!bodyText) continue

        // Extract {{variables}} from body text
        const matches = bodyText.match(/\{\{([a-zA-Z0-9_]+|[0-9]+)\}\}/g) || []
        const varList = []
        for (let k = 0; k < matches.length; k++) {
          const cleaned = matches[k].replace(/[\{\}]/g, '').trim()
          if (varList.indexOf(cleaned) === -1) {
            varList.push(cleaned)
          }
        }

        let existingRec = null
        try {
          existingRec = $app.findFirstRecordByData('whatsapp_templates', 'name', name)
        } catch (_) {}

        if (existingRec) {
          existingRec.set('category', category)
          existingRec.set('language', language)
          existingRec.set('status', status)
          existingRec.set('body', bodyText)
          existingRec.set('variables', varList)
          existingRec.set('meta_template_id', t.id || '')
          $app.save(existingRec)
        } else {
          const newRec = new Record(templatesCol)
          newRec.set('name', name)
          newRec.set('category', category)
          newRec.set('language', language)
          newRec.set('status', status)
          newRec.set('body', bodyText)
          newRec.set('variables', varList)
          newRec.set('meta_template_id', t.id || '')
          $app.save(newRec)
        }
        updatedCount++
      }

      return e.json(200, {
        synced: true,
        count: updatedCount,
        message: updatedCount + ' templates sincronizados com a API oficial da Meta.',
      })
    } catch (err) {
      return e.json(500, { error: 'Erro de comunicação ao sincronizar: ' + err })
    }
  },
  $apis.requireAuth(),
)
