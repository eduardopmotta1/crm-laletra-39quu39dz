// WhatsApp Templates Submit Hook — Criação e submissão dos templates oficiais de produção na Meta Cloud API
// Endpoint autenticado: POST /backend/v1/crm/whatsapp-submit-templates
// Submete cada um dos 8 templates oficiais com categoria UTILITY e idioma pt_BR via:
// POST https://graph.facebook.com/{version}/{WABA_ID}/message_templates
// Persiste/atualiza localmente em whatsapp_templates sem duplicar e sem apagar templates legados.

console.log('[WHATSAPP TEMPLATES SUBMIT] Hook loaded')

routerAdd('POST', '/backend/v1/crm/whatsapp-submit-templates', (e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária para submeter templates.',
    })
  }

  if (auth.get('is_active') === false) {
    return e.json(403, {
      success: false,
      error: 'Usuário inativo.',
    })
  }

  // 1. Obter credenciais Meta (sem vazar tokens nos logs nem na resposta)
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
      '[WHATSAPP TEMPLATES SUBMIT] Token da Meta não configurado no ambiente nem em system_settings.',
    )
    return e.json(503, {
      success: false,
      error:
        'Credencial WHATSAPP_ACCESS_TOKEN não configurada no servidor. Configure as variáveis de ambiente ou em Configurações > WhatsApp API.',
    })
  }

  // Origem diagnóstica do WABA ID
  let wabaOrigin = ''
  if ($os.getenv('WHATSAPP_BUSINESS_ACCOUNT_ID')) {
    wabaOrigin = 'config'
  } else if (metaWabaId) {
    wabaOrigin = 'system_settings'
  }

  // 1.1 Se o WABA ID não existir, tentar resolver automaticamente via Graph API
  // Estratégia A: debug_token
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
                  '[WHATSAPP TEMPLATES SUBMIT] WABA ID resolvido via debug_token scopes (' +
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
      console.warn('[WHATSAPP TEMPLATES SUBMIT] debug_token falhou:', debugErr)
    }
  }

  // Estratégia B: GET /me/businesses
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
            '[WHATSAPP TEMPLATES SUBMIT] WABA ID resolvido via owned_whatsapp_business_accounts: ' +
              metaWabaId,
          )
          break
        }
      }
    } catch (bizErr) {
      console.warn('[WHATSAPP TEMPLATES SUBMIT] me/businesses falhou:', bizErr)
    }
  }

  // Estratégia C: GET /{phone_number_id}
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

  // Se resolvido automaticamente, persistir em system_settings para cache
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
        console.log('[WHATSAPP TEMPLATES SUBMIT] WABA ID salvo em system_settings: ' + metaWabaId)
      }
    } catch (_) {}
  }

  // Validação estrita contra erro #100
  if (metaWabaId && metaPhoneId && metaWabaId === metaPhoneId) {
    console.error(
      '[WHATSAPP TEMPLATES SUBMIT] WABA ID (' +
        metaWabaId +
        ') é idêntico ao Phone Number ID. Isso causaria erro #100!',
    )
    return e.json(400, {
      success: false,
      error:
        'Configuração incorreta: o WABA ID fornecido é idêntico ao Phone Number ID. O endpoint /message_templates exige o ID da conta comercial (WABA ID), não o ID do telefone.',
    })
  }

  if (!metaWabaId) {
    console.warn('[WHATSAPP TEMPLATES SUBMIT] WABA ID não encontrado.')
    return e.json(400, {
      success: false,
      error:
        'WABA ID (WhatsApp Business Account ID) não configurado nem foi possível resolvê-lo automaticamente via Meta API.',
    })
  }

  // 2. Definição estrita dos 8 templates oficiais de produção
  // Ordem e textos verbatim fornecidos no escopo da tarefa
  const templatesToSubmit = [
    {
      name: 'pedido_recebido',
      category: 'UTILITY',
      language: 'pt_BR',
      text: 'Olá {{1}}! Recebemos o seu pedido {{2}} e ele já entrou em nosso fluxo de produção. Você pode acompanhar o andamento por aqui: {{3}}',
      examples: ['João', 'ORC-2026-0017', 'https://graficalaletra.com.br/rastreio/ORC-2026-0017'],
      variables: ['nome', 'pedido', 'link_acompanhamento'],
    },
    {
      name: 'aguardando_informacoes',
      category: 'UTILITY',
      language: 'pt_BR',
      text: 'Olá {{1}}! Para continuarmos o pedido {{2}}, precisamos de algumas informações ou arquivos. Assim que recebermos, seguimos com a produção.',
      examples: ['João', 'ORC-2026-0017'],
      variables: ['nome', 'pedido'],
    },
    {
      name: 'aguardando_aprovacao_arte',
      category: 'UTILITY',
      language: 'pt_BR',
      text: 'Olá {{1}}! A arte do pedido {{2}} está pronta para sua aprovação. Você pode acompanhar e aprovar por aqui: {{3}}',
      examples: ['João', 'ORC-2026-0017', 'https://graficalaletra.com.br/rastreio/ORC-2026-0017'],
      variables: ['nome', 'pedido', 'link_acompanhamento'],
    },
    {
      name: 'arte_aprovada',
      category: 'UTILITY',
      language: 'pt_BR',
      text: 'Olá {{1}}! A arte do pedido {{2}} foi aprovada e o pedido seguirá para a próxima etapa de produção.',
      examples: ['João', 'ORC-2026-0017'],
      variables: ['nome', 'pedido'],
    },
    {
      name: 'pedido_em_producao',
      category: 'UTILITY',
      language: 'pt_BR',
      text: 'Olá {{1}}! Seu pedido {{2}} entrou em produção. Assim que houver uma nova atualização, avisaremos por aqui.',
      examples: ['João', 'ORC-2026-0017'],
      variables: ['nome', 'pedido'],
    },
    {
      name: 'pedido_pronto',
      category: 'UTILITY',
      language: 'pt_BR',
      text: 'Boas notícias, {{1}}! O pedido {{2}} está pronto. Consulte os detalhes e o acompanhamento aqui: {{3}}',
      examples: ['João', 'ORC-2026-0017', 'https://graficalaletra.com.br/rastreio/ORC-2026-0017'],
      variables: ['nome', 'pedido', 'link_acompanhamento'],
    },
    {
      name: 'pedido_enviado_retirada',
      category: 'UTILITY',
      language: 'pt_BR',
      text: 'Olá {{1}}! O pedido {{2}} foi atualizado para enviado/aguardando retirada. Código de rastreio ou referência: {{3}} Acompanhe aqui: {{4}}',
      examples: [
        'João',
        'ORC-2026-0017',
        'BR123456789',
        'https://graficalaletra.com.br/rastreio/ORC-2026-0017',
      ],
      variables: ['nome', 'pedido', 'codigo_rastreio', 'link_acompanhamento'],
    },
    {
      name: 'pedido_concluido',
      category: 'UTILITY',
      language: 'pt_BR',
      text: 'Olá {{1}}! O pedido {{2}} foi concluído. Agradecemos pela preferência!',
      examples: ['João', 'ORC-2026-0017'],
      variables: ['nome', 'pedido'],
    },
  ]

  // Normalizador de status para os enums locais: APPROVED | PENDING | REJECTED
  const normalizeLocalStatus = function (metaStatus) {
    const s = String(metaStatus || '').toUpperCase()
    if (s === 'APPROVED') return 'APPROVED'
    if (s === 'REJECTED' || s === 'PAUSED' || s === 'DISABLED') return 'REJECTED'
    return 'PENDING'
  }

  // Carregar templates locais existentes para reutilizar lógica de match e evitar duplicidade
  let localTemplates = []
  try {
    localTemplates = $app.findRecordsByFilter('whatsapp_templates', '1=1', 'name', 500, 0)
  } catch (findErr) {
    console.error('[WHATSAPP TEMPLATES SUBMIT] Erro ao carregar templates locais:', findErr)
  }

  const tplCollection = $app.findCollectionByNameOrId('whatsapp_templates')

  // Helper para buscar template existente na Meta pelo nome
  const fetchMetaTemplateByName = function (tName) {
    try {
      const lookupUrl =
        'https://graph.facebook.com/' +
        metaApiVersion +
        '/' +
        metaWabaId +
        '/message_templates?name=' +
        encodeURIComponent(tName) +
        '&limit=5'
      const lookupRes = $http.send({
        url: lookupUrl,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + metaToken,
          'Content-Type': 'application/json',
        },
        timeout: 15,
      })
      if (lookupRes && lookupRes.statusCode === 200) {
        const lData = lookupRes.json || JSON.parse(lookupRes.raw)
        if (lData && Array.isArray(lData.data) && lData.data.length > 0) {
          for (let k = 0; k < lData.data.length; k++) {
            if (String(lData.data[k].name).toLowerCase() === tName.toLowerCase()) {
              return lData.data[k]
            }
          }
          return lData.data[0]
        }
      }
    } catch (lErr) {
      console.warn(
        '[WHATSAPP TEMPLATES SUBMIT] Falha ao consultar template por nome na Meta:',
        lErr,
      )
    }
    return null
  }

  const results = []
  let submittedCount = 0
  let alreadyExistedCount = 0
  let errorCount = 0

  const postUrl =
    'https://graph.facebook.com/' + metaApiVersion + '/' + metaWabaId + '/message_templates'

  for (let idx = 0; idx < templatesToSubmit.length; idx++) {
    const tDef = templatesToSubmit[idx]
    const templateName = tDef.name

    // Montar o componente BODY com example.body_text
    const bodyComponent = {
      type: 'BODY',
      text: tDef.text,
      example: {
        body_text: [tDef.examples],
      },
    }

    const payload = {
      name: templateName,
      language: tDef.language,
      category: tDef.category,
      components: [bodyComponent],
    }

    console.log('[WHATSAPP TEMPLATES SUBMIT] Submetendo template na Meta:', {
      name: templateName,
      category: tDef.category,
      language: tDef.language,
      waba_id: metaWabaId,
    })

    let apiRes = null
    let netErr = null

    try {
      apiRes = $http.send({
        url: postUrl,
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + metaToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: 25,
      })
    } catch (err) {
      netErr = err
      console.error(
        '[WHATSAPP TEMPLATES SUBMIT] Erro de rede ao submeter template ' + templateName + ':',
        err,
      )
    }

    const statusCode = apiRes ? apiRes.statusCode : 0
    let respData = null
    try {
      if (apiRes && apiRes.json) {
        respData = apiRes.json
      } else if (apiRes && apiRes.raw) {
        respData = JSON.parse(apiRes.raw)
      }
    } catch (_) {}

    let metaTemplateId = ''
    let metaStatusRaw = 'PENDING'
    let metaCategory = tDef.category
    let action = ''
    let errorMessage = ''
    let errorSubcode = ''
    let errorCode = 0

    if (statusCode >= 200 && statusCode < 300 && respData) {
      // Sucesso na submissão
      metaTemplateId = String(respData.id || '').trim()
      metaStatusRaw = String(respData.status || 'PENDING').toUpperCase()
      metaCategory = String(respData.category || tDef.category).toUpperCase()
      action = 'created'
      submittedCount++
      console.log('[WHATSAPP TEMPLATES SUBMIT] Template submetido com sucesso:', {
        name: templateName,
        meta_id: metaTemplateId,
        status: metaStatusRaw,
      })
    } else {
      // Tratar resposta de erro
      const errObj = (respData && respData.error) || {}
      errorCode = errObj.code || statusCode
      errorSubcode = String(errObj.error_subcode || '')
      errorMessage =
        errObj.message ||
        (netErr
          ? 'Falha de conexão com a Meta API'
          : 'Erro HTTP ' + statusCode + ' retornado pela Meta')

      // Verificar se a Meta rejeitou porque o template já existe (Idempotência)
      // Mensagens comuns: "template name already exists", subcodes específicos ou code 100/2388040
      const isAlreadyExists =
        errorMessage.toLowerCase().includes('already exists') ||
        errorMessage.toLowerCase().includes('duplicate') ||
        errorSubcode === '2388040'

      if (isAlreadyExists) {
        console.log(
          '[WHATSAPP TEMPLATES SUBMIT] Template já existe na Meta (' +
            templateName +
            '). Buscando ID oficial...',
        )
        const existingMetaTpl = fetchMetaTemplateByName(templateName)
        if (existingMetaTpl) {
          metaTemplateId = String(existingMetaTpl.id || '').trim()
          metaStatusRaw = String(existingMetaTpl.status || 'PENDING').toUpperCase()
          metaCategory = String(existingMetaTpl.category || tDef.category).toUpperCase()
          action = 'already_exists'
          alreadyExistedCount++
          errorMessage = '' // Limpar erro já que recuperamos com sucesso
          console.log('[WHATSAPP TEMPLATES SUBMIT] Template recuperado com sucesso da Meta:', {
            name: templateName,
            meta_id: metaTemplateId,
            status: metaStatusRaw,
          })
        } else {
          action = 'already_exists_lookup_failed'
          alreadyExistedCount++
        }
      } else {
        action = 'error'
        errorCount++
        const serializedTplError = JSON.stringify({
          httpCode: statusCode,
          code: errorCode,
          subcode: errorSubcode,
          type: errObj.type || '',
          message: errorMessage,
          error_user_title: errObj.error_user_title || '',
          error_user_msg: errObj.error_user_msg || '',
          fbtrace_id: errObj.fbtrace_id || '',
          raw: apiRes ? String(apiRes.raw || '').substring(0, 1000) : '',
        })
        console.error(
          '[WHATSAPP TEMPLATES SUBMIT] Erro da Meta para o template ' +
            templateName +
            ': ' +
            serializedTplError,
        )
      }
    }

    // 3. Sincronização Local do template após tentativa/sucesso
    // Se temos metaTemplateId ou se o template foi submetido / já existia, salvar em whatsapp_templates
    let localSaved = false
    let localRecordId = ''
    const localStatus = normalizeLocalStatus(metaStatusRaw)

    if (action === 'created' || action === 'already_exists') {
      // Prioridade de identificação do registro local:
      // 1) Por meta_template_id
      // 2) Por name + language (ou só name)
      let matchedRecord = null

      for (let l = 0; l < localTemplates.length; l++) {
        const rec = localTemplates[l]
        const recMetaId = String(rec.get('meta_template_id') || '').trim()
        const recName = String(rec.get('name') || '')
          .trim()
          .toLowerCase()
        const recLang = String(rec.get('language') || '').trim()

        if (metaTemplateId && recMetaId && metaTemplateId === recMetaId) {
          matchedRecord = rec
          break
        }

        if (recName === templateName.toLowerCase() && (!recLang || recLang === tDef.language)) {
          matchedRecord = rec
          break
        }
      }

      if (matchedRecord) {
        // Atualizar registro existente
        matchedRecord.set('meta_template_id', metaTemplateId)
        matchedRecord.set('status', localStatus)
        matchedRecord.set('category', metaCategory === 'MARKETING' ? 'MARKETING' : 'UTILITY')
        matchedRecord.set('language', tDef.language)
        matchedRecord.set('body', tDef.text)
        matchedRecord.set('variables', tDef.variables)

        try {
          $app.save(matchedRecord)
          localSaved = true
          localRecordId = matchedRecord.id
          console.log(
            '[WHATSAPP TEMPLATES SUBMIT] Registro local atualizado: ' +
              templateName +
              ' (ID: ' +
              matchedRecord.id +
              ')',
          )
        } catch (saveErr) {
          console.error(
            '[WHATSAPP TEMPLATES SUBMIT] Falha ao atualizar registro local ' + templateName + ':',
            saveErr,
          )
        }
      } else {
        // Criar novo registro local
        const newRec = new Record(tplCollection)
        newRec.set('name', templateName)
        newRec.set('category', metaCategory === 'MARKETING' ? 'MARKETING' : 'UTILITY')
        newRec.set('language', tDef.language)
        newRec.set('status', localStatus)
        newRec.set('body', tDef.text)
        newRec.set('variables', tDef.variables)
        newRec.set('meta_template_id', metaTemplateId)

        try {
          $app.save(newRec)
          localSaved = true
          localRecordId = newRec.id
          // Adicionar à lista local para evitar duplicação em iterações seguintes
          localTemplates.push(newRec)
          console.log(
            '[WHATSAPP TEMPLATES SUBMIT] Novo registro local criado: ' +
              templateName +
              ' (ID: ' +
              newRec.id +
              ')',
          )
        } catch (createErr) {
          console.error(
            '[WHATSAPP TEMPLATES SUBMIT] Falha ao criar registro local ' + templateName + ':',
            createErr,
          )
        }
      }
    }

    results.push({
      name: templateName,
      category: metaCategory,
      language: tDef.language,
      action: action,
      meta_template_id: metaTemplateId,
      meta_status: metaStatusRaw,
      local_status: localStatus,
      local_saved: localSaved,
      local_id: localRecordId,
      error: errorMessage || undefined,
      error_code: errorCode || undefined,
      error_subcode: errorSubcode || undefined,
    })
  }

  const successOverall = errorCount === 0

  return e.json(200, {
    success: successOverall,
    submitted_count: submittedCount,
    already_existed_count: alreadyExistedCount,
    error_count: errorCount,
    total: templatesToSubmit.length,
    diagnostic: {
      waba_origin: wabaOrigin,
      waba_id: metaWabaId,
      api_version: metaApiVersion,
    },
    results: results,
  })
})

console.log(
  '[WHATSAPP TEMPLATES SUBMIT] Hook registered route: POST /backend/v1/crm/whatsapp-submit-templates',
)
