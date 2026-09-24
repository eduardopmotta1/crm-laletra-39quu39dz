/**
 * Hook Backend do Google Places API (New)
 * Rotas seguras:
 * 1. POST /backend/v1/crm/prospecting/places:search
 * 2. POST /backend/v1/crm/prospecting/places:details
 * 3. GET  /backend/v1/crm/prospecting/places:counters
 *
 * REGRAS CRÍTICAS:
 * - Toda chamada ao Google Places API (New) é feita EXCLUSIVAMENTE aqui no backend.
 * - GOOGLE_PLACES_API_KEY fica restrita a este arquivo via $os.getenv('GOOGLE_PLACES_API_KEY')
 * - NUNCA expor a chave no frontend, response, logs ou erros.
 * - Todas as funções auxiliares ficam DENTRO dos callbacks (goja pool scoping).
 */

// 1. Rota de Busca: POST /backend/v1/crm/prospecting/places:search
routerAdd('POST', '/backend/v1/crm/prospecting/places:search', (e) => {
  const apiKey = $os.getenv('GOOGLE_PLACES_API_KEY') || ''
  if (!apiKey) {
    console.error('[Google Places] GOOGLE_PLACES_API_KEY não configurada no backend')
    return e.json(503, {
      success: false,
      error_code: 'API_KEY_MISSING',
      error: 'Provedor Google Places não configurado no backend.',
      can_fallback_osm: true,
    })
  }

  // Funções utilitárias com escopo interno
  function calculateHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371 // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c * 10) / 10
  }

  function normalizeKey(str) {
    if (!str) return ''
    return String(str)
      .toLowerCase()
      .trim()
      .replace(/[\s\-_]+/g, '_')
  }

  function incrementCounter(counterKey) {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData('system_settings', 'setting_key', counterKey)
      } catch (_) {}

      if (rec) {
        const current = parseInt(rec.getString('setting_value') || '0', 10) || 0
        rec.set('setting_value', String(current + 1))
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', counterKey)
        newRec.set('setting_value', '1')
        newRec.set('description', 'Contador diagnóstico: ' + counterKey)
        $app.save(newRec)
      }
    } catch (err) {
      console.warn('[Google Places] Erro ao incrementar contador ' + counterKey + ':', err)
    }
  }

  function getCache(key) {
    try {
      const rec = $app.findFirstRecordByData('places_cache', 'cache_key', key)
      if (!rec) return null

      const expiresAtStr = rec.getString('expires_at')
      if (expiresAtStr) {
        const expiresAt = new Date(expiresAtStr).getTime()
        if (Date.now() > expiresAt) {
          try {
            $app.delete(rec)
          } catch (_) {}
          return null
        }
      }

      const rawData = rec.get('data')
      if (typeof rawData === 'string') {
        return JSON.parse(rawData)
      }
      return rawData
    } catch (_) {
      return null
    }
  }

  function setCache(key, type, data) {
    try {
      const ttlMs = 24 * 60 * 60 * 1000 // 24 horas
      const expiresAt = new Date(Date.now() + ttlMs).toISOString()

      let rec = null
      try {
        rec = $app.findFirstRecordByData('places_cache', 'cache_key', key)
      } catch (_) {}

      if (rec) {
        rec.set('data', data)
        rec.set('expires_at', expiresAt)
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('places_cache')
        const newRec = new Record(col)
        newRec.set('cache_key', key)
        newRec.set('cache_type', type)
        newRec.set('data', data)
        newRec.set('expires_at', expiresAt)
        $app.save(newRec)
      }
    } catch (err) {
      console.warn('[Google Places] Erro ao salvar cache para ' + key + ':', err)
    }
  }

  const reqInfo = $apis.requestInfo(e)
  const body = reqInfo.data || {}
  const segment = String(body.segment || '').trim()
  const lat = parseFloat(body.lat)
  const lng = parseFloat(body.lng)
  const radiusKm = parseFloat(body.radiusKm) || 20
  const pageToken = String(body.pageToken || '').trim()
  const forceRefresh = Boolean(body.refresh)
  const locationLabel = String(body.location || '').trim()

  if (!segment) {
    return e.json(400, {
      success: false,
      error: 'Segmento de busca é obrigatório.',
    })
  }
  if (isNaN(lat) || isNaN(lng)) {
    return e.json(400, {
      success: false,
      error: 'Coordenadas (lat, lng) são obrigatórias e devem ser números válidos.',
    })
  }

  // Chave de cache normalizada
  const cacheKey = [
    'search',
    normalizeKey(locationLabel || 'center'),
    lat.toFixed(4),
    lng.toFixed(4),
    radiusKm.toFixed(1),
    normalizeKey(segment),
    pageToken ? normalizeKey(pageToken.substring(0, 15)) : 'p1',
  ].join(':')

  // Checar cache se não for forceRefresh
  if (!forceRefresh) {
    const cachedData = getCache(cacheKey)
    if (cachedData && Array.isArray(cachedData.places)) {
      incrementCounter('google_cache_hits')
      return e.json(200, {
        success: true,
        source: 'cache',
        cached: true,
        places: cachedData.places,
        nextPageToken: cachedData.nextPageToken || null,
        total: cachedData.places.length,
      })
    }
  }

  // Prepara requisição Text Search (New)
  // POST https://places.googleapis.com/v1/places:searchText
  const radiusMeters = Math.min(Math.max(radiusKm * 1000, 1000), 50000)

  const payload = {
    textQuery: segment,
    languageCode: 'pt-BR',
    pageSize: 20,
    locationBias: {
      circle: {
        center: {
          latitude: lat,
          longitude: lng,
        },
        radius: radiusMeters,
      },
    },
  }

  if (pageToken) {
    payload.pageToken = pageToken
  }

  // FieldMask mínimo e obrigatório da API New (PROIBIDO "*")
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.types',
    'places.primaryTypeDisplayName',
    'places.businessStatus',
    'places.rating',
    'places.userRatingCount',
    'places.googleMapsUri',
    'nextPageToken',
  ].join(',')

  let googleRes = null
  let attempts = 0
  const maxAttempts = 2

  while (attempts < maxAttempts) {
    attempts++
    try {
      googleRes = $http.send({
        url: 'https://places.googleapis.com/v1/places:searchText',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(payload),
        timeout: 20,
      })

      if (googleRes && googleRes.statusCode === 200) {
        break
      }
    } catch (netErr) {
      console.warn(
        '[Google Places] Tentativa ' + attempts + ' falhou com erro de rede:',
        netErr && netErr.message ? netErr.message : netErr,
      )
    }
  }

  incrementCounter('google_search_requests')

  if (!googleRes) {
    return e.json(502, {
      success: false,
      error_code: 'NETWORK_ERROR',
      error: 'Não foi possível consultar o Google Places neste momento.',
      can_fallback_osm: true,
    })
  }

  if (googleRes.statusCode !== 200) {
    let errBody = {}
    try {
      if (googleRes.json) {
        errBody = googleRes.json
      } else if (googleRes.body) {
        errBody = JSON.parse(googleRes.body)
      }
    } catch (_) {}

    const errStatus = (errBody.error && errBody.error.status) || ''
    const errMessage = (errBody.error && errBody.error.message) || ''

    console.error(
      '[Google Places Search Error] Status HTTP: ' +
        googleRes.statusCode +
        ' | Status API: ' +
        errStatus +
        ' | Message: ' +
        errMessage,
    )

    let userMessage = 'Não foi possível consultar o Google Places neste momento.'
    let errorCode = 'REQUEST_FAILED'

    if (
      errStatus === 'API_KEY_INVALID' ||
      googleRes.statusCode === 400 ||
      googleRes.statusCode === 403
    ) {
      if (errMessage.toLowerCase().includes('api key') || errStatus === 'API_KEY_INVALID') {
        userMessage = 'Chave da API do Google Places inválida ou não autorizada.'
        errorCode = 'API_KEY_INVALID'
      } else if (errStatus === 'REQUEST_DENIED' || googleRes.statusCode === 403) {
        userMessage = 'Acesso ao Google Places negado (verifique permissões na Google Cloud).'
        errorCode = 'REQUEST_DENIED'
      }
    } else if (errStatus === 'RESOURCE_EXHAUSTED' || googleRes.statusCode === 429) {
      userMessage = 'Limite de consultas da API atingido.'
      errorCode = 'RESOURCE_EXHAUSTED'
    }

    return e.json(googleRes.statusCode >= 500 ? 502 : 400, {
      success: false,
      error_code: errorCode,
      error: userMessage,
      can_fallback_osm: true,
    })
  }

  let resData = {}
  try {
    if (googleRes.json && typeof googleRes.json === 'object') {
      resData = googleRes.json
    } else if (googleRes.body) {
      resData = JSON.parse(googleRes.body)
    }
  } catch (parseErr) {
    console.error('[Google Places] Erro ao parsear JSON da resposta:', parseErr)
    return e.json(502, {
      success: false,
      error_code: 'PARSE_ERROR',
      error: 'Resposta inválida do Google Places.',
      can_fallback_osm: true,
    })
  }

  const rawPlaces = Array.isArray(resData.places) ? resData.places : []
  const nextPageToken = resData.nextPageToken || null

  const mappedPlaces = []
  const maxAllowedDistanceKm = radiusKm * 1.15

  for (let i = 0; i < rawPlaces.length; i++) {
    const p = rawPlaces[i]
    if (!p || !p.id) continue

    const pLat = p.location ? parseFloat(p.location.latitude) : null
    const pLng = p.location ? parseFloat(p.location.longitude) : null

    let distKm = 0
    if (pLat !== null && pLng !== null) {
      distKm = calculateHaversineKm(lat, lng, pLat, pLng)
      if (distKm > maxAllowedDistanceKm) {
        continue
      }
    }

    const name = (p.displayName && p.displayName.text) || 'Estabelecimento'

    let category = segment
    if (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) {
      category = p.primaryTypeDisplayName.text
    } else if (Array.isArray(p.types) && p.types.length > 0) {
      category = p.types[0].replace(/_/g, ' ')
    }

    const formattedAddress = p.formattedAddress || 'Endereço não informado'

    mappedPlaces.push({
      id: p.id,
      googlePlaceId: p.id,
      name: name,
      category: category,
      address: formattedAddress,
      lat: pLat !== null ? pLat : lat,
      lng: pLng !== null ? pLng : lng,
      distanceKm: distKm,
      phone: null,
      normalizedPhone: null,
      whatsappAvailable: false,
      website: null,
      email: null,
      provider: 'google_places',
      businessStatus: p.businessStatus || 'OPERATIONAL',
      rating: typeof p.rating === 'number' ? p.rating : null,
      userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      googleMapsUri: p.googleMapsUri || null,
      detailsLoaded: false,
    })
  }

  mappedPlaces.sort((a, b) => a.distanceKm - b.distanceKm)

  const resultPayload = {
    places: mappedPlaces,
    nextPageToken: nextPageToken,
  }

  setCache(cacheKey, 'search', resultPayload)

  return e.json(200, {
    success: true,
    source: 'google_api',
    cached: false,
    places: mappedPlaces,
    nextPageToken: nextPageToken,
    total: mappedPlaces.length,
  })
})

// 2. Rota de Detalhes: POST /backend/v1/crm/prospecting/places:details
routerAdd('POST', '/backend/v1/crm/prospecting/places:details', (e) => {
  const apiKey = $os.getenv('GOOGLE_PLACES_API_KEY') || ''
  if (!apiKey) {
    return e.json(503, {
      success: false,
      error_code: 'API_KEY_MISSING',
      error: 'Provedor Google Places não configurado no backend.',
    })
  }

  function incrementCounter(counterKey) {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData('system_settings', 'setting_key', counterKey)
      } catch (_) {}

      if (rec) {
        const current = parseInt(rec.getString('setting_value') || '0', 10) || 0
        rec.set('setting_value', String(current + 1))
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', counterKey)
        newRec.set('setting_value', '1')
        newRec.set('description', 'Contador diagnóstico: ' + counterKey)
        $app.save(newRec)
      }
    } catch (err) {
      console.warn('[Google Places] Erro ao incrementar contador ' + counterKey + ':', err)
    }
  }

  function getCache(key) {
    try {
      const rec = $app.findFirstRecordByData('places_cache', 'cache_key', key)
      if (!rec) return null

      const expiresAtStr = rec.getString('expires_at')
      if (expiresAtStr) {
        const expiresAt = new Date(expiresAtStr).getTime()
        if (Date.now() > expiresAt) {
          try {
            $app.delete(rec)
          } catch (_) {}
          return null
        }
      }

      const rawData = rec.get('data')
      if (typeof rawData === 'string') {
        return JSON.parse(rawData)
      }
      return rawData
    } catch (_) {
      return null
    }
  }

  function setCache(key, type, data) {
    try {
      const ttlMs = 24 * 60 * 60 * 1000
      const expiresAt = new Date(Date.now() + ttlMs).toISOString()

      let rec = null
      try {
        rec = $app.findFirstRecordByData('places_cache', 'cache_key', key)
      } catch (_) {}

      if (rec) {
        rec.set('data', data)
        rec.set('expires_at', expiresAt)
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('places_cache')
        const newRec = new Record(col)
        newRec.set('cache_key', key)
        newRec.set('cache_type', type)
        newRec.set('data', data)
        newRec.set('expires_at', expiresAt)
        $app.save(newRec)
      }
    } catch (err) {
      console.warn('[Google Places] Erro ao salvar cache para ' + key + ':', err)
    }
  }

  const reqInfo = $apis.requestInfo(e)
  const body = reqInfo.data || {}
  const placeId = String(body.placeId || body.id || '').trim()

  if (!placeId) {
    return e.json(400, {
      success: false,
      error: 'placeId é obrigatório.',
    })
  }

  const cacheKey = 'details:' + placeId

  const cachedDetails = getCache(cacheKey)
  if (cachedDetails && cachedDetails.id) {
    incrementCounter('google_cache_hits')
    return e.json(200, {
      success: true,
      source: 'cache',
      cached: true,
      details: cachedDetails,
    })
  }

  // GET https://places.googleapis.com/v1/places/{PLACE_ID}
  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'websiteUri',
    'googleMapsUri',
    'businessStatus',
    'addressComponents',
  ].join(',')

  let googleRes = null
  let attempts = 0
  const maxAttempts = 2

  while (attempts < maxAttempts) {
    attempts++
    try {
      googleRes = $http.send({
        url: 'https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId),
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        timeout: 15,
      })

      if (googleRes && googleRes.statusCode === 200) {
        break
      }
    } catch (netErr) {
      console.warn(
        '[Google Places Details] Tentativa ' + attempts + ' falhou:',
        netErr && netErr.message ? netErr.message : netErr,
      )
    }
  }

  incrementCounter('google_details_requests')

  if (!googleRes) {
    return e.json(502, {
      success: false,
      error_code: 'NETWORK_ERROR',
      error: 'Não foi possível consultar os detalhes do estabelecimento no momento.',
    })
  }

  if (googleRes.statusCode !== 200) {
    let errBody = {}
    try {
      if (googleRes.json) {
        errBody = googleRes.json
      } else if (googleRes.body) {
        errBody = JSON.parse(googleRes.body)
      }
    } catch (_) {}

    console.error(
      '[Google Places Details Error] Status HTTP: ' +
        googleRes.statusCode +
        ' | Place: ' +
        placeId +
        ' | Err: ' +
        JSON.stringify(errBody),
    )

    return e.json(googleRes.statusCode >= 500 ? 502 : 400, {
      success: false,
      error_code: 'DETAILS_FAILED',
      error: 'Não foi possível recuperar os detalhes do estabelecimento.',
    })
  }

  let detailsData = {}
  try {
    if (googleRes.json && typeof googleRes.json === 'object') {
      detailsData = googleRes.json
    } else if (googleRes.body) {
      detailsData = JSON.parse(googleRes.body)
    }
  } catch (parseErr) {
    return e.json(502, {
      success: false,
      error: 'Resposta inválida do Google Places.',
    })
  }

  const rawPhone = detailsData.nationalPhoneNumber || detailsData.internationalPhoneNumber || null
  let normPhone = null
  if (rawPhone) {
    const digits = String(rawPhone).replace(/\D/g, '')
    if (digits.length >= 8) {
      normPhone = digits
    }
  }

  let street = ''
  let neighborhood = ''
  let city = ''
  let state = ''
  let postalCode = ''

  if (Array.isArray(detailsData.addressComponents)) {
    for (let c = 0; c < detailsData.addressComponents.length; c++) {
      const comp = detailsData.addressComponents[c]
      const types = comp.types || []
      if (types.includes('route')) {
        street = comp.longText || comp.shortText || ''
      } else if (
        types.includes('sublocality') ||
        types.includes('sublocality_level_1') ||
        types.includes('neighborhood')
      ) {
        neighborhood = comp.longText || comp.shortText || ''
      } else if (types.includes('administrative_area_level_2')) {
        city = comp.longText || comp.shortText || ''
      } else if (types.includes('administrative_area_level_1')) {
        state = comp.shortText || comp.longText || ''
      } else if (types.includes('postal_code')) {
        postalCode = comp.longText || comp.shortText || ''
      }
    }
  }

  const detailsResult = {
    id: detailsData.id || placeId,
    displayName: (detailsData.displayName && detailsData.displayName.text) || '',
    formattedAddress: detailsData.formattedAddress || '',
    phone: rawPhone,
    normalizedPhone: normPhone,
    website: detailsData.websiteUri || null,
    googleMapsUri: detailsData.googleMapsUri || null,
    businessStatus: detailsData.businessStatus || 'OPERATIONAL',
    street: street,
    neighborhood: neighborhood,
    city: city,
    state: state,
    postalCode: postalCode,
  }

  setCache(cacheKey, 'details', detailsResult)

  return e.json(200, {
    success: true,
    source: 'google_api',
    cached: false,
    details: detailsResult,
  })
})

// 3. Rota de Diagnóstico dos Contadores: GET /backend/v1/crm/prospecting/places:counters
routerAdd('GET', '/backend/v1/crm/prospecting/places:counters', (e) => {
  const counters = {
    google_search_requests: 0,
    google_details_requests: 0,
    google_cache_hits: 0,
  }

  try {
    const keys = ['google_search_requests', 'google_details_requests', 'google_cache_hits']
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      try {
        const rec = $app.findFirstRecordByData('system_settings', 'setting_key', key)
        if (rec) {
          counters[key] = parseInt(rec.getString('setting_value') || '0', 10) || 0
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[Google Places] Erro ao ler contadores:', err)
  }

  const hasApiKey = Boolean($os.getenv('GOOGLE_PLACES_API_KEY'))

  return e.json(200, {
    success: true,
    has_api_key: hasApiKey,
    counters: counters,
    timestamp: new Date().toISOString(),
  })
})

console.log('[GOOGLE PLACES] Hook loaded: /backend/v1/crm/prospecting/places:*')
