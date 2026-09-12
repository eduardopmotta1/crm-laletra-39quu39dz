// WhatsApp Templates Sync Hook — Sincronização real dos templates oficiais da Meta WABA com PocketBase
// Endpoint autenticado: POST /backend/v1/crm/whatsapp-sync-templates
// Busca templates da Meta Graph API (GET https://graph.facebook.com/{version}/{waba_id}/message_templates)
// e atualiza ou insere na collection whatsapp_templates sem duplicar.

console.log('[WHATSAPP TEMPLATES SYNC] Hook loaded')

routerAdd('POST', '/backend/v1/crm/whatsapp-sync-templates', (e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      synced: false,
      error: 'Autenticação necessária para sincronizar templates.',
    })
  }

  if (auth.get('is_active') === false) {
    return e.json(403, {
      success: false,
      synced: false,
      error: 'Usuário inativo.',
    })
  }

  // 1. Obter credenciais Meta (sem vazar tokens nos logs)
  let metaToken = $os.getenv('WHATSAPP_ACCESS_TOKEN') || ''
  let metaPhoneId = $os.getenv('WHATSAPP_PHONE_NUMBER_ID') || ''
  let metaWabaId = $os.getenv('WHATSAPP_BUSINESS_ACCOUNT_ID') || ''
  let metaApiVersion = $os.getenv('WHATSAPP_GRAPH_API_VERSION') || 'v21.0'

  // Fallbacks em system_settings se não encontrados no ambiente
  try {
    if (!metaToken) {
      const tokenRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'whatsapp_access_token',
      )
      const val = tokenRec ? tokenRec.get('setting_value') : ''
      if (val && !val.includes('DEMO_TOKEN') && !val.startsWith('demo_')) {
        metaToken = val
      }
    }
  } catch (_) {}

  try {
    if (!metaWabaId) {
      const wabaRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'whatsapp_business_account_id',
      )
      const val = wabaRec ? wabaRec.get('setting_value') : ''
      if (val && !val.includes('DEMO')) {
        metaWabaId = String(val).trim()
      }
    }
  } catch (_) {}

  try {
    if (!metaPhoneId) {
      const phoneRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'whatsapp_phone_number_id',
      )
      const val = phoneRec ? phoneRec.get('setting_value') : ''
      if (val && val !== '109283746592019' && !val.includes('DEMO')) {
        metaPhoneId = val
      }
    }
  } catch (_) {}

  if (!metaToken) {
    console.warn(
      '[WHATSAPP TEMPLATES SYNC] Token da Meta não configurado no ambiente nem em system_settings.',
    )
    return e.json(503, {
      success: false,
      synced: false,
      error:
        'Credencial WHATSAPP_ACCESS_TOKEN não configurada no servidor. Configure as variáveis de ambiente ou em Configurações > WhatsApp API.',
    })
  }

  // Diagnóstico seguro: rastrear origem do WABA ID
  let wabaOrigin = ''
  if ($os.getenv('WHATSAPP_BUSINESS_ACCOUNT_ID')) {
    wabaOrigin = 'config' // veio de WHATSAPP_BUSINESS_ACCOUNT_ID
  } else if (metaWabaId) {
    wabaOrigin = 'system_settings'
  }

  // 1.1 Se o WABA ID não existir, tentar resolver automaticamente via Graph API
  // Estratégia A: debug_token (retorna granular_scopes com target_ids = [WABA_ID])
  if (!metaWabaId) {
    try {
      const debugUrl =
        'https://graph.facebook.com/' +
        metaApiVersion +
        '/debug_token?input_token=' +
        metaToken +
        '&access_token=' +
        metaToken
      const debugRes = $http.send({
        url: debugUrl,
        method: 'GET',
        timeout: 15,
      })

      let debugData = null
      if (debugRes && debugRes.statusCode === 200) {
        try {
          debugData = debugRes.json || JSON.parse(debugRes.raw)
        } catch (_) {}
      }

      if (debugData && debugData.data) {
        const scopes = debugData.data.granular_scopes || []
        for (let sc = 0; sc < scopes.length; sc++) {
          const sObj = scopes[sc]
          if (
            sObj &&
            (sObj.scope === 'whatsapp_business_management' ||
              sObj.scope === 'whatsapp_business_messaging') &&
            Array.isArray(sObj.target_ids) &&
            sObj.target_ids.length > 0
          ) {
            for (let tid = 0; tid < sObj.target_ids.length; tid++) {
              const candId = String(sObj.target_ids[tid]).trim()
              if (candId && candId !== metaPhoneId && /^\d+$/.test(candId)) {
                metaWabaId = candId
                wabaOrigin = 'resolved_from_debug_token'
                console.log(
                  '[WHATSAPP TEMPLATES SYNC] [DIAGNOSTIC] WABA ID resolvido via debug_token scopes (' +
                    sObj.scope +
                    '): ' +
                    metaWabaId,
                )
                break
              }
            }
          }
          if (metaWabaId) break
        }
      }
    } catch (debugErr) {
      console.warn(
        '[WHATSAPP TEMPLATES SYNC] [DIAGNOSTIC] debug_token falhou na resolução:',
        debugErr,
      )
    }
  }

  // Estratégia B: GET /me/businesses (retorna businesses, depois /owned_whatsapp_business_accounts ou /client_whatsapp_business_accounts)
  if (!metaWabaId) {
    try {
      const bizRes = $http.send({
        url: 'https://graph.facebook.com/' + metaApiVersion + '/me/businesses',
        method: 'GET',
        headers: { Authorization: 'Bearer ' + metaToken },
        timeout: 15,
      })
      let bizData = null
      if (bizRes && bizRes.statusCode === 200) {
        try {
          bizData = bizRes.json || JSON.parse(bizRes.raw)
        } catch (_) {}
      }
      const bizList = bizData && Array.isArray(bizData.data) ? bizData.data : []
      for (let b = 0; b < bizList.length; b++) {
        const bizId = bizList[b].id
        if (!bizId) continue
        const wabaReq = $http.send({
          url:
            'https://graph.facebook.com/' +
            metaApiVersion +
            '/' +
            bizId +
            '/owned_whatsapp_business_accounts',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + metaToken },
          timeout: 15,
        })
        let wabaList = null
        if (wabaReq && wabaReq.statusCode === 200) {
          try {
            wabaList = wabaReq.json || JSON.parse(wabaReq.raw)
          } catch (_) {}
        }
        if (wabaList && Array.isArray(wabaList.data) && wabaList.data.length > 0) {
          metaWabaId = String(wabaList.data[0].id).trim()
          wabaOrigin = 'resolved_from_business_accounts'
          console.log(
            '[WHATSAPP TEMPLATES SYNC] [DIAGNOSTIC] WABA ID resolvido via owned_whatsapp_business_accounts: ' +
              metaWabaId,
          )
          break
        }
      }
    } catch (bizErr) {
      console.warn('[WHATSAPP TEMPLATES SYNC] [DIAGNOSTIC] me/businesses falhou:', bizErr)
    }
  }

  // Estratégia C: consulta em GET /{phone_number_id}
  if (!metaWabaId && metaPhoneId) {
    try {
      const phoneLookupUrl =
        'https://graph.facebook.com/' +
        metaApiVersion +
        '/' +
        metaPhoneId +
        '?fields=id,whatsapp_business_account'
      const phoneRes = $http.send({
        url: phoneLookupUrl,
        method: 'GET',
        headers: { Authorization: 'Bearer ' + metaToken },
        timeout: 15,
      })
      let phoneData = null
      if (phoneRes && phoneRes.statusCode === 200) {
        try {
          phoneData = phoneRes.json || JSON.parse(phoneRes.raw)
        } catch (_) {}
      }
      if (
        phoneData &&
        phoneData.whatsapp_business_account &&
        phoneData.whatsapp_business_account.id
      ) {
        const cand = String(phoneData.whatsapp_business_account.id).trim()
        if (cand && cand !== metaPhoneId && /^\d+$/.test(cand)) {
          metaWabaId = cand
          wabaOrigin = 'resolved_from_phone'
        }
      }
    } catch (_) {}
  }

  // Se resolvido automaticamente, persistir em system_settings para cache de alta performance
  if (metaWabaId && (wabaOrigin.startsWith('resolved_') || wabaOrigin === 'config')) {
    try {
      const wabaRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'whatsapp_business_account_id',
      )
      if (wabaRec && wabaRec.get('setting_value') !== metaWabaId) {
        wabaRec.set('setting_value', metaWabaId)
        $app.save(wabaRec)
        console.log('[WHATSAPP TEMPLATES SYNC] WABA ID salvo em system_settings: ' + metaWabaId)
      }
    } catch (_) {}
  }

  // Validação estrita: metaWabaId NÃO pode ser igual ao metaPhoneId (pois causaria erro #100)
  if (metaWabaId && metaPhoneId && metaWabaId === metaPhoneId) {
    console.error(
      '[WHATSAPP TEMPLATES SYNC] [DIAGNOSTIC] ERRO CRÍTICO: WABA ID (' +
        metaWabaId +
        ') é idêntico ao Phone Number ID. Isso causaria erro #100!',
    )
    return e.json(400, {
      success: false,
      synced: false,
      error:
        'Configuração incorreta: o WABA ID fornecido é idêntico ao Phone Number ID. O endpoint /message_templates exige o ID da conta comercial (WABA ID), não o ID do telefone.',
      diagnostic: {
        api_version: metaApiVersion,
        waba_origin: wabaOrigin,
        waba_id: metaWabaId,
        phone_number_id: metaPhoneId,
        endpoint_called: 'GET /' + metaWabaId + '/message_templates',
      },
    })
  }

  if (!metaWabaId) {
    console.warn('[WHATSAPP TEMPLATES SYNC] WABA ID (WhatsApp Business Account ID) não encontrado.')
    return e.json(400, {
      success: false,
      synced: false,
      error:
        'WABA ID (WhatsApp Business Account ID) não configurado nem foi possível resolvê-lo automaticamente via Meta API. Adicione o WABA ID em Configurações > WhatsApp API ou defina WHATSAPP_BUSINESS_ACCOUNT_ID.',
      diagnostic: {
        api_version: metaApiVersion,
        waba_origin: 'none',
        waba_id: '',
        endpoint_called: 'none',
      },
    })
  }

  // 2. Buscar templates na Meta Graph API
  // GET https://graph.facebook.com/{apiVersion}/{waba_id}/message_templates?limit=100
  const logicalEndpoint = 'GET /' + metaWabaId + '/message_templates?limit=100'
  const metaTemplatesUrl =
    'https://graph.facebook.com/' +
    metaApiVersion +
    '/' +
    metaWabaId +
    '/message_templates?limit=100'

  console.log('[WHATSAPP TEMPLATES SYNC] [DIAGNOSTIC] Executando chamada segura:', {
    api_version: metaApiVersion,
    waba_origin: wabaOrigin,
    waba_id: metaWabaId,
    endpoint: logicalEndpoint,
  })

  let apiResponse = null
  let networkErr = null

  try {
    apiResponse = $http.send({
      url: metaTemplatesUrl,
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + metaToken,
        'Content-Type': 'application/json',
      },
      timeout: 25,
    })
  } catch (errNet) {
    networkErr = errNet
    console.error('[WHATSAPP TEMPLATES SYNC] Exceção de rede ao chamar Meta Graph API:', errNet)
  }

  const httpCode = apiResponse ? apiResponse.statusCode : 0
  let respData = null

  try {
    if (apiResponse && apiResponse.json) {
      respData = apiResponse.json
    } else if (apiResponse && apiResponse.raw) {
      respData = JSON.parse(apiResponse.raw)
    }
  } catch (_) {}

  // Se a Meta retornou erro
  if (httpCode < 200 || httpCode >= 300 || !respData) {
    const errObj = (respData && respData.error) || {}
    const safeErrorMsg =
      errObj.message ||
      (networkErr
        ? 'Falha de conexão com a Meta'
        : 'Erro retornado pela Meta (HTTP ' + httpCode + ')')
    const errCode = errObj.code || httpCode
    const errSubcode = errObj.error_subcode || ''
    const errUserTitle = errObj.error_user_title || ''
    const errUserMsg = errObj.error_user_msg || ''
    const errType = errObj.type || ''
    const fbtraceId = errObj.fbtrace_id || ''

    const serializedError = JSON.stringify({
      httpCode: httpCode,
      code: errCode,
      subcode: errSubcode,
      type: errType,
      message: safeErrorMsg,
      error_user_title: errUserTitle,
      error_user_msg: errUserMsg,
      fbtrace_id: fbtraceId,
      raw: apiResponse ? String(apiResponse.raw || '').substring(0, 1000) : '',
    })

    console.error(
      '[WHATSAPP TEMPLATES SYNC] Erro retornado pela Meta Graph API: ' + serializedError,
    )

    // REGRA DE SEGURANÇA E TESTE 6: não apagar templates locais, retornar erro seguro
    return e.json(502, {
      success: false,
      synced: false,
      error: safeErrorMsg,
      meta_error: {
        http_code: httpCode,
        code: errCode,
        subcode: errSubcode,
        type: errType,
        message: safeErrorMsg,
        error_user_title: errUserTitle,
        error_user_msg: errUserMsg,
      },
      diagnostic: {
        api_version: metaApiVersion,
        waba_origin: wabaOrigin,
        waba_id: metaWabaId,
        endpoint_called: logicalEndpoint,
      },
    })
  }

  // 3. Processar lista de templates retornados pela Meta
  // A Meta retorna { data: [ { id, name, status, category, language, components: [...] } ] }
  const metaTemplatesList = Array.isArray(respData.data) ? respData.data : []
  console.log('[WHATSAPP TEMPLATES SYNC] Templates retornados pela Meta:', metaTemplatesList.length)

  // Helpers internos para processamento do corpo e variáveis dos componentes da Meta
  const extractMetaBodyAndVariables = function (components) {
    let bodyText = ''
    let variables = []

    if (Array.isArray(components)) {
      for (let i = 0; i < components.length; i++) {
        const comp = components[i]
        if (comp && comp.type === 'BODY' && comp.text) {
          bodyText = comp.text
          break
        }
      }
    }

    if (bodyText) {
      // Extrai {{1}}, {{2}} ou {{nome}}, etc
      const matches = bodyText.match(/\{\{([a-zA-Z0-9_]+|[0-9]+)\}\}/g) || []
      for (let j = 0; j < matches.length; j++) {
        const v = matches[j].replace(/[{}]/g, '').trim()
        if (variables.indexOf(v) === -1) {
          variables.push(v)
        }
      }
    }

    return {
      body: bodyText,
      variables: variables,
    }
  }

  // Normalizador de categoria para o enum permitido no schema: MARKETING | UTILITY | AUTHENTICATION
  const normalizeCategory = function (metaCategory) {
    const cat = String(metaCategory || '').toUpperCase()
    if (cat === 'MARKETING') return 'MARKETING'
    if (cat === 'AUTHENTICATION') return 'AUTHENTICATION'
    return 'UTILITY'
  }

  // Normalizador de status para o enum permitido no schema: APPROVED | PENDING | REJECTED
  // Meta statuses: APPROVED, PENDING, REJECTED, PAUSED, DISABLED, IN_APPEAL, DELETED
  // Schema local aceita apenas: APPROVED | PENDING | REJECTED
  const normalizeStatus = function (metaStatus) {
    const s = String(metaStatus || '').toUpperCase()
    if (s === 'APPROVED') return 'APPROVED'
    if (s === 'REJECTED' || s === 'PAUSED' || s === 'DISABLED') return 'REJECTED'
    return 'PENDING'
  }

  // Carregar todos os templates locais existentes
  let localTemplates = []
  try {
    localTemplates = $app.findRecordsByFilter('whatsapp_templates', '1=1', 'name', 500, 0)
  } catch (findErr) {
    console.error('[WHATSAPP TEMPLATES SYNC] Erro ao carregar templates locais:', findErr)
  }

  const tplCollection = $app.findCollectionByNameOrId('whatsapp_templates')

  let updatedCount = 0
  let createdCount = 0
  let matchedLocalIds = {}

  // 4. Mapear e sincronizar templates da Meta para o PocketBase
  for (let m = 0; m < metaTemplatesList.length; m++) {
    const metaTpl = metaTemplatesList[m]
    const metaId = String(metaTpl.id || '').trim()
    const metaName = String(metaTpl.name || '')
      .trim()
      .toLowerCase()
    const metaLang = String(metaTpl.language || 'pt_BR').trim()
    const metaStatusRaw = String(metaTpl.status || '').toUpperCase()
    const localStatus = normalizeStatus(metaStatusRaw)
    const localCategory = normalizeCategory(metaTpl.category)
    const parsed = extractMetaBodyAndVariables(metaTpl.components)

    if (!metaName) continue

    // Prioridade de identificação do registro local:
    // 1) Por meta_template_id
    // 2) Por name + language (ou só name caso a language seja equivalente)
    let matchedRecord = null

    for (let l = 0; l < localTemplates.length; l++) {
      const rec = localTemplates[l]
      const recMetaId = String(rec.get('meta_template_id') || '').trim()
      const recName = String(rec.get('name') || '')
        .trim()
        .toLowerCase()
      const recLang = String(rec.get('language') || '').trim()

      if (metaId && recMetaId && metaId === recMetaId) {
        matchedRecord = rec
        break
      }

      if (recName === metaName && (!recLang || recLang === metaLang)) {
        matchedRecord = rec
        break
      }
    }

    if (matchedRecord) {
      // Atualizar registro existente
      matchedLocalIds[matchedRecord.id] = true
      matchedRecord.set('meta_template_id', metaId)
      matchedRecord.set('status', localStatus)
      matchedRecord.set('category', localCategory)
      matchedRecord.set('language', metaLang)

      if (parsed.body) {
        matchedRecord.set('body', parsed.body)
        matchedRecord.set('variables', parsed.variables)
      }

      try {
        $app.save(matchedRecord)
        updatedCount++
        console.log('[WHATSAPP TEMPLATES SYNC] Template local atualizado com sucesso:', {
          id: matchedRecord.id,
          name: metaName,
          meta_id: metaId,
          status: localStatus,
          meta_status: metaStatusRaw,
        })
      } catch (saveErr) {
        console.error(
          '[WHATSAPP TEMPLATES SYNC] Falha ao atualizar template local ' + metaName + ':',
          saveErr,
        )
      }
    } else {
      // Criar novo registro no banco local vindo da Meta
      const newRec = new Record(tplCollection)
      newRec.set('name', metaName)
      newRec.set('category', localCategory)
      newRec.set('language', metaLang)
      newRec.set('status', localStatus)
      newRec.set('body', parsed.body || '{{1}}')
      newRec.set('variables', parsed.variables || [])
      newRec.set('meta_template_id', metaId)

      try {
        $app.save(newRec)
        matchedLocalIds[newRec.id] = true
        createdCount++
        console.log('[WHATSAPP TEMPLATES SYNC] Novo template criado a partir da Meta:', {
          id: newRec.id,
          name: metaName,
          meta_id: metaId,
          status: localStatus,
        })
      } catch (createErr) {
        console.error(
          '[WHATSAPP TEMPLATES SYNC] Falha ao criar template ' + metaName + ':',
          createErr,
        )
      }
    }
  }

  // 5. REGRA DO TESTE 4: Registros locais SEM correspondente na Meta
  // Se a sincronização com a Meta foi bem sucedida e a Meta retornou seus templates oficiais:
  // qualquer registro local que não tenha correspondente na Meta NÃO deve fingir que está aprovado oficialmente.
  // Mudar status para 'PENDING' ou 'REJECTED' e garantir que meta_template_id fique vazio ou nulo.
  let unmarkedCount = 0
  for (let l = 0; l < localTemplates.length; l++) {
    const rec = localTemplates[l]
    if (!matchedLocalIds[rec.id]) {
      const currentMetaId = rec.get('meta_template_id')
      const currentStatus = rec.get('status')

      // Se estava com APPROVED ou fingindo ter ID da Meta que não veio na resposta
      if (currentStatus === 'APPROVED' || currentMetaId) {
        rec.set('status', 'PENDING') // Não finge mais aprovação oficial
        rec.set('meta_template_id', '') // Limpa ID falso se houver
        try {
          $app.save(rec)
          unmarkedCount++
          console.log(
            '[WHATSAPP TEMPLATES SYNC] Template local sem correspondente Meta desmarcado de APPROVED:',
            {
              id: rec.id,
              name: rec.get('name'),
              new_status: 'PENDING',
            },
          )
        } catch (unmarkErr) {
          console.warn('[WHATSAPP TEMPLATES SYNC] Erro ao desmarcar template local:', unmarkErr)
        }
      }
    }
  }

  const summaryMessage =
    metaTemplatesList.length > 0
      ? 'Sincronização concluída com sucesso! ' +
        metaTemplatesList.length +
        ' templates obtidos da Meta (' +
        updatedCount +
        ' atualizados, ' +
        createdCount +
        ' adicionados, ' +
        unmarkedCount +
        ' locais não sincronizados).'
      : 'Sincronização concluída: nenhum template cadastrado na WABA Meta vinculada. Os templates locais foram mantidos como não sincronizados.'

  console.log('[WHATSAPP TEMPLATES SYNC] ' + summaryMessage)

  return e.json(200, {
    success: true,
    synced: true,
    meta_count: metaTemplatesList.length,
    updated_count: updatedCount,
    created_count: createdCount,
    unmarked_count: unmarkedCount,
    message: summaryMessage,
    diagnostic: {
      api_version: metaApiVersion,
      waba_origin: wabaOrigin,
      waba_id: metaWabaId,
      endpoint_called: logicalEndpoint,
    },
  })
})

console.log(
  '[WHATSAPP TEMPLATES SYNC] Hook registered route: POST /backend/v1/crm/whatsapp-sync-templates',
)
