// Migração transitória 0108 para executar os testes funcionais especificados na tarefa:
// Chamada ao endpoint público do backend: https://crm-grafica-whatsapp-7b1a5.shrd00.internal.goskip.dev/backend/v1/crm/prospecting/places:search

migrate(
  (app) => {
    const settingsCol = app.findCollectionByNameOrId('system_settings')

    const backendUrl = 'https://crm-grafica-whatsapp-7b1a5.shrd00.internal.goskip.dev'

    // Obter contadores antes do teste
    let searchBefore = 0
    let cacheHitsBefore = 0
    try {
      const sRec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'google_search_requests',
      )
      searchBefore = parseInt(sRec.getString('setting_value') || '0', 10) || 0
    } catch (_) {}
    try {
      const cRec = app.findFirstRecordByData('system_settings', 'setting_key', 'google_cache_hits')
      cacheHitsBefore = parseInt(cRec.getString('setting_value') || '0', 10) || 0
    } catch (_) {}

    const payload = {
      segment: 'Escolas',
      lat: -22.4633,
      lng: -42.6536,
      radiusKm: 20,
      location: 'Cachoeiras de Macacu - RJ',
      refresh: false,
    }

    // 1. Primeira busca
    let res1 = null
    let err1 = null
    try {
      res1 = $http.send({
        url: backendUrl + '/backend/v1/crm/prospecting/places:search',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 30,
      })
    } catch (e) {
      err1 = e && e.message ? e.message : String(e)
    }

    let parsed1 = null
    try {
      if (res1 && res1.json) parsed1 = res1.json
      else if (res1 && res1.body) parsed1 = JSON.parse(res1.body)
    } catch (pe) {
      parsed1 = { parseError: pe && pe.message }
    }

    // Obter contadores após primeira busca
    let searchAfter1 = 0
    let cacheHitsAfter1 = 0
    try {
      const sRec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'google_search_requests',
      )
      searchAfter1 = parseInt(sRec.getString('setting_value') || '0', 10) || 0
    } catch (_) {}
    try {
      const cRec = app.findFirstRecordByData('system_settings', 'setting_key', 'google_cache_hits')
      cacheHitsAfter1 = parseInt(cRec.getString('setting_value') || '0', 10) || 0
    } catch (_) {}

    // 2. Segunda busca (repetir exatamente a mesma pesquisa)
    let res2 = null
    let err2 = null
    try {
      res2 = $http.send({
        url: backendUrl + '/backend/v1/crm/prospecting/places:search',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 30,
      })
    } catch (e) {
      err2 = e && e.message ? e.message : String(e)
    }

    let parsed2 = null
    try {
      if (res2 && res2.json) parsed2 = res2.json
      else if (res2 && res2.body) parsed2 = JSON.parse(res2.body)
    } catch (pe) {
      parsed2 = { parseError: pe && pe.message }
    }

    // Obter contadores após segunda busca
    let searchAfter2 = 0
    let cacheHitsAfter2 = 0
    try {
      const sRec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'google_search_requests',
      )
      searchAfter2 = parseInt(sRec.getString('setting_value') || '0', 10) || 0
    } catch (_) {}
    try {
      const cRec = app.findFirstRecordByData('system_settings', 'setting_key', 'google_cache_hits')
      cacheHitsAfter2 = parseInt(cRec.getString('setting_value') || '0', 10) || 0
    } catch (_) {}

    // Extrair primeiros estabelecimentos sem segredos
    const samplePlaces = []
    if (parsed1 && parsed1.places && Array.isArray(parsed1.places)) {
      for (let i = 0; i < Math.min(parsed1.places.length, 5); i++) {
        const p = parsed1.places[i]
        samplePlaces.push({
          name: p.name,
          category: p.category,
          address: p.address,
          distanceKm: p.distanceKm,
        })
      }
    }

    const testReport = {
      test1: {
        httpStatus: res1 ? res1.statusCode : 0,
        error: err1,
        success: parsed1 ? parsed1.success : false,
        source: parsed1 ? parsed1.source : null,
        cached: parsed1 ? parsed1.cached : null,
        totalReturned: parsed1 && parsed1.places ? parsed1.places.length : 0,
        firstNames: samplePlaces.map((p) => p.name),
        searchRequestsBefore: searchBefore,
        searchRequestsAfter: searchAfter1,
      },
      test2: {
        httpStatus: res2 ? res2.statusCode : 0,
        error: err2,
        success: parsed2 ? parsed2.success : false,
        source: parsed2 ? parsed2.source : null,
        cached: parsed2 ? parsed2.cached : null,
        totalReturned: parsed2 && parsed2.places ? parsed2.places.length : 0,
        searchRequestsAfter1: searchAfter1,
        searchRequestsAfter2: searchAfter2,
        cacheHitsBefore: cacheHitsBefore,
        cacheHitsAfter2: cacheHitsAfter2,
        calledGoogleAgain: searchAfter2 > searchAfter1,
        cacheHit: Boolean(parsed2 && (parsed2.source === 'cache' || parsed2.cached === true)),
      },
    }

    // Grava em system_settings
    let reportRec = null
    try {
      reportRec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'google_places_task_verification',
      )
    } catch (_) {}

    if (!reportRec) {
      reportRec = new Record(settingsCol)
      reportRec.set('setting_key', 'google_places_task_verification')
      reportRec.set('description', 'Relatório dos testes pós-correção do requestInfo')
    }
    reportRec.set('setting_value', JSON.stringify(testReport))
    app.save(reportRec)
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'google_places_task_verification',
      )
      app.delete(rec)
    } catch (_) {}
  },
)
