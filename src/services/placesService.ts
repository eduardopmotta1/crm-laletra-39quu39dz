/**
 * Serviço de busca de locais e estabelecimentos comerciais (Places)
 * Encapsulado para suportar múltiplos provedores (OpenStreetMap Overpass + Nominatim, e Google Places quando configurado).
 * Não expõe chaves secretas no frontend.
 * Contém cache temporário para evitar requisições repetidas e limite de chamadas desnecessárias.
 */

import pb from '@/lib/pocketbase/client'
import { normalizePhone } from '@/lib/utils'
import type { ProspectingPlace } from '@/types/crm'

export interface GeocodingResult {
  lat: number
  lng: number
  displayName: string
  city?: string
  state?: string
  country?: string
}

export interface SearchPlacesOptions {
  lat: number
  lng: number
  radiusKm: number
  segment: string // Termo livre (ex: "escolas", "academias", "gráficas", "restaurantes")
  location?: string
  refresh?: boolean
  pageToken?: string
  forceOsm?: boolean // Permite forçar Overpass OSM sob demanda do usuário
}

export interface SearchPlacesResult {
  places: ProspectingPlace[]
  nextPageToken?: string | null
  provider: 'google_places' | 'openstreetmap'
  source: 'google_api' | 'cache' | 'osm_fallback'
  canFallbackOsm?: boolean
  errorMessage?: string
}

// Cache local em memória para geocodificação
const geocodeCache = new Map<string, GeocodingResult[]>()
// Cache em memória de detalhes enriquecidos (Place ID -> detalhes)
const detailsCache = new Map<string, Partial<ProspectingPlace>>()

// Cálculo de distância por fórmula de Haversine em km
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371 // Raio da Terra em km
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

/**
 * Normaliza termos em português removendo acentos e pontuações para análise de intenção
 */
export function normalizeSearchTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Mapeia termos em português (singular, plural, variações) para seletores OSM formais.
 * Cobre estritamente todos os exemplos pedidos pelo usuário:
 * - escola/escolas/colegio/colégios → amenity=school
 * - creche/creches → amenity=kindergarten
 * - universidade/faculdade → amenity=university / college
 * - restaurante/restaurantes → amenity=restaurant
 * - pizzaria/pizzarias → amenity=restaurant + busca complementar por cuisine/name
 * - academia/academias → leisure=fitness_centre
 * - farmácia/farmácias → amenity=pharmacy
 * - clínica/clínicas → amenity=clinic
 * - dentista/dentistas → amenity=dentist
 * - hospital/hospitais → amenity=hospital
 * - bar/bares → amenity=bar
 * - café/cafeteria → amenity=cafe
 * - hotel/hotéis → tourism=hotel
 * - pousada/pousadas → tourism=guest_house
 * - supermercado/mercado → shop=supermarket e shop=convenience
 * - pet shop → shop=pet
 * - salão de beleza → shop=hairdresser / beauty
 * - oficina → shop=car_repair
 * + gráficas, imobiliárias, escritórios, etc.
 */
export function mapPortugueseToOsmSelectors(segment: string): {
  selectors: string[]
  isKnownCategory: boolean
} {
  const norm = normalizeSearchTerm(segment)
  const selectors: string[] = []

  // 1. Escolas / Colégios
  if (/\b(escola|escolas|colegio|colegios|ensino)\b/.test(norm)) {
    selectors.push('nwr["amenity"="school"]')
  }

  // 2. Creches
  if (/\b(creche|creches|maternal|infantil|kindergarten)\b/.test(norm)) {
    selectors.push('nwr["amenity"="kindergarten"]')
  }

  // 3. Universidade / Faculdade
  if (/\b(universidade|universidades|faculdade|faculdades)\b/.test(norm)) {
    selectors.push('nwr["amenity"="university"]')
    selectors.push('nwr["amenity"="college"]')
  }

  // 4. Restaurantes
  if (/\b(restaurante|restaurantes|gastronomia|comida)\b/.test(norm)) {
    selectors.push('nwr["amenity"="restaurant"]')
  }

  // 5. Pizzarias (amenity=restaurant + cuisine=pizza / name~pizza)
  if (/\b(pizzaria|pizzarias|pizza|pizzas)\b/.test(norm)) {
    selectors.push('nwr["amenity"="restaurant"]["cuisine"~"pizza",i]')
    selectors.push('nwr["amenity"="restaurant"]["name"~"pizza",i]')
    selectors.push('nwr["amenity"="fast_food"]["cuisine"~"pizza",i]')
    selectors.push('nwr["cuisine"="pizza"]')
  }

  // 6. Academias
  if (/\b(academia|academias|fitness|crossfit|musculacao|ginastica)\b/.test(norm)) {
    selectors.push('nwr["leisure"="fitness_centre"]')
    selectors.push('nwr["leisure"="sports_centre"]')
  }

  // 7. Farmácia / Farmácias
  if (/\b(farmacia|farmacias|drogaria|drogarias|medicamento|medicamentos)\b/.test(norm)) {
    selectors.push('nwr["amenity"="pharmacy"]')
  }

  // 8. Clínica / Clínicas
  if (/\b(clinica|clinicas|consultorio|consultorios)\b/.test(norm)) {
    selectors.push('nwr["amenity"="clinic"]')
    selectors.push('nwr["healthcare"="clinic"]')
  }

  // 9. Dentista / Dentistas
  if (/\b(dentista|dentistas|odontologia|odontologico|odonto)\b/.test(norm)) {
    selectors.push('nwr["amenity"="dentist"]')
    selectors.push('nwr["healthcare"="dentist"]')
  }

  // 10. Hospital / Hospitais
  if (/\b(hospital|hospitais|pronto socorro|upa)\b/.test(norm)) {
    selectors.push('nwr["amenity"="hospital"]')
  }

  // 11. Bar / Bares
  if (/\b(bar|bares|pub|pubs|botequim|boteco)\b/.test(norm)) {
    selectors.push('nwr["amenity"="bar"]')
    selectors.push('nwr["amenity"="pub"]')
  }

  // 12. Café / Cafeteria
  if (/\b(cafe|cafes|cafeteria|cafeterias)\b/.test(norm)) {
    selectors.push('nwr["amenity"="cafe"]')
  }

  // 13. Hotel / Hotéis
  if (/\b(hotel|hoteis)\b/.test(norm)) {
    selectors.push('nwr["tourism"="hotel"]')
  }

  // 14. Pousada / Pousadas
  if (/\b(pousada|pousadas|hospedagem)\b/.test(norm)) {
    selectors.push('nwr["tourism"="guest_house"]')
  }

  // 15. Supermercado / Mercado
  if (/\b(supermercado|supermercados|mercado|mercados|mercearia|mercearias)\b/.test(norm)) {
    selectors.push('nwr["shop"="supermarket"]')
    selectors.push('nwr["shop"="convenience"]')
    selectors.push('nwr["shop"="grocery"]')
  }

  // 16. Pet shop
  if (/\b(pet|petshop|pet shop|veterinaria|veterinario|veterinarios)\b/.test(norm)) {
    selectors.push('nwr["shop"="pet"]')
    selectors.push('nwr["amenity"="veterinary"]')
  }

  // 17. Salão de beleza / Cabeleireiro
  if (
    /\b(salao|saloes|beleza|cabeleireiro|cabeleireiros|estetica|barbearia|barbeiro)\b/.test(norm)
  ) {
    selectors.push('nwr["shop"="hairdresser"]')
    selectors.push('nwr["shop"="beauty"]')
  }

  // 18. Oficina / Mecânica
  if (/\b(oficina|oficinas|mecanica|mecanico|auto eletrica|lanternagem|borracharia)\b/.test(norm)) {
    selectors.push('nwr["shop"="car_repair"]')
  }

  // 19. Gráfica / Comunicação Visual (core do CRM Laletra)
  if (/\b(grafica|graficas|impressao|copiadora|comunicacao visual)\b/.test(norm)) {
    selectors.push('nwr["shop"="copyshop"]')
    selectors.push('nwr["craft"="printer"]')
  }

  // 20. Imobiliária
  if (/\b(imobiliaria|imobiliarias|corretor)\b/.test(norm)) {
    selectors.push('nwr["office"="estate_agent"]')
  }

  // 21. Advogado / Advocacia
  if (/\b(advogado|advogados|advocacia|juridico)\b/.test(norm)) {
    selectors.push('nwr["office"="lawyer"]')
  }

  // 22. Lanchonete / Fast food
  if (/\b(lanchonete|lanchonetes|fast food|lanche|lanches|hamburgueria)\b/.test(norm)) {
    selectors.push('nwr["amenity"="fast_food"]')
  }

  const isKnownCategory = selectors.length > 0
  return { selectors, isKnownCategory }
}

/**
 * Monta consulta Overpass QL eficiente e segura para nós, ways e relations com center.
 * Evita filtros sem índice global [~"name|..."] que causam timeout 504 no Overpass.
 */
export function buildOverpassQuery(
  lat: number,
  lng: number,
  radiusMeters: number,
  segment: string,
): string {
  const { selectors, isKnownCategory } = mapPortugueseToOsmSelectors(segment)
  const around = `(around:${radiusMeters},${lat},${lng})`
  const clauses: string[] = []

  if (isKnownCategory) {
    // 1. Categoria mapeada com sucesso: usa tags OSM diretas (indexadas e ultra-rápidas)
    for (const sel of selectors) {
      clauses.push(`${sel}${around};`)
    }
    // Adiciona busca complementar de nome se o usuário digitou mais de uma palavra
    const cleanEscaped = segment.trim().replace(/["\\]/g, '')
    if (cleanEscaped.length >= 3 && !clauses.some((c) => c.includes(cleanEscaped))) {
      clauses.push(`nwr["name"~"${cleanEscaped}",i]${around};`)
    }
  } else {
    // 2. Termo livre fora do mapeamento: fallback seguro e otimizado por nome e categorias genéricas
    const escaped = segment.trim().replace(/["\\]/g, '')
    clauses.push(`nwr["name"~"${escaped}",i]${around};`)
    clauses.push(`nwr["amenity"][~"name"~"${escaped}",i]${around};`)
    clauses.push(`nwr["shop"][~"name"~"${escaped}",i]${around};`)
    clauses.push(`nwr["craft"][~"name"~"${escaped}",i]${around};`)
    clauses.push(`nwr["office"][~"name"~"${escaped}",i]${around};`)
    clauses.push(`nwr["tourism"][~"name"~"${escaped}",i]${around};`)
    clauses.push(`nwr["leisure"][~"name"~"${escaped}",i]${around};`)
  }

  // Monta a query Overpass completa com timeout de 25s e limitação de resultados
  return `[out:json][timeout:25];
(
  ${clauses.join('\n  ')}
);
out tags center 150;`
}

export const placesService = {
  /**
   * Geocodificação de endereço (ex: "Cachoeiras de Macacu - RJ" ou "Av. Paulista, São Paulo")
   * Utiliza Nominatim OpenStreetMap (serviço público sem necessidade de chave) com cache
   */
  async geocodeAddress(query: string): Promise<GeocodingResult[]> {
    const trimmed = query.trim()
    if (!trimmed || trimmed.length < 3) return []

    const cacheKey = trimmed.toLowerCase()
    const cached = geocodeCache.get(cacheKey)
    if (cached) return cached

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        trimmed,
      )}&countrycodes=br&limit=5&addressdetails=1`

      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'pt-BR,pt;q=0.9',
          // Nominatim requer User-Agent identificador
          'User-Agent': 'LaletraCRMProspeccao/1.0 (crm-grafica)',
        },
      })

      if (!res.ok) {
        console.warn('Nominatim geocode failed with status:', res.status)
        return []
      }

      const data = await res.json()
      if (!Array.isArray(data)) return []

      const results: GeocodingResult[] = data.map((item: any) => {
        const addr = item.address || {}
        const city =
          addr.city ||
          addr.town ||
          addr.municipality ||
          addr.village ||
          addr.county ||
          addr.state_district ||
          ''
        const state = addr.state || ''
        const country = addr.country || 'Brasil'

        return {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          displayName: item.display_name,
          city,
          state,
          country,
        }
      })

      geocodeCache.set(cacheKey, results)
      return results
    } catch (err) {
      console.error('Geocoding error:', err)
      return []
    }
  },

  /**
   * Busca estabelecimentos comerciais com GOOGLE PLACES API (NEW) como provedor PRINCIPAL
   * e OPENSTREETMAP (Overpass) como fallback controlado.
   * Não expõe chaves no frontend: chama /backend/v1/crm/prospecting/places:search
   */
  async searchPlacesWithDetails(options: SearchPlacesOptions): Promise<SearchPlacesResult> {
    const { lat, lng, radiusKm, segment, location, refresh, pageToken, forceOsm } = options

    // Se o usuário selecionou explicitamente "Buscar usando fonte alternativa"
    if (forceOsm) {
      const osmPlaces = await this.searchOverpassOsm(options)
      return {
        places: osmPlaces,
        nextPageToken: null,
        provider: 'openstreetmap',
        source: 'osm_fallback',
      }
    }

    // Provedor Principal: Google Places API (New) via backend do CRM
    try {
      const res = await pb.send<{
        success: boolean
        source: 'google_api' | 'cache'
        cached: boolean
        places: ProspectingPlace[]
        nextPageToken?: string | null
        total?: number
        error?: string
        error_code?: string
        can_fallback_osm?: boolean
      }>('/backend/v1/crm/prospecting/places:search', {
        method: 'POST',
        body: {
          segment,
          lat,
          lng,
          radiusKm,
          location,
          refresh: Boolean(refresh),
          pageToken: pageToken || undefined,
        },
      })

      if (res && res.success && Array.isArray(res.places)) {
        return {
          places: res.places,
          nextPageToken: res.nextPageToken || null,
          provider: 'google_places',
          source: res.source || 'google_api',
        }
      }

      // Se retornou erro controlado da API
      const errMsg = res?.error || 'Não foi possível consultar o Google Places neste momento.'
      return {
        places: [],
        nextPageToken: null,
        provider: 'google_places',
        source: 'google_api',
        canFallbackOsm: res?.can_fallback_osm ?? true,
        errorMessage: errMsg,
      }
    } catch (err: any) {
      console.warn('[placesService] Erro ao consultar backend do Google Places:', err)
      const status = err?.status || 0
      let userMsg = 'Não foi possível consultar o Google Places neste momento.'
      if (err?.data?.error) {
        userMsg = err.data.error
      } else if (status === 400 || status === 403) {
        userMsg = 'Acesso ao Google Places negado ou credenciais inválidas.'
      } else if (status === 429) {
        userMsg = 'Limite de consultas da API atingido.'
      }

      return {
        places: [],
        nextPageToken: null,
        provider: 'google_places',
        source: 'google_api',
        canFallbackOsm: true,
        errorMessage: userMsg,
      }
    }
  },

  /**
   * Compatibilidade com chamadas simples anteriores
   */
  async searchPlaces(options: SearchPlacesOptions): Promise<ProspectingPlace[]> {
    const res = await this.searchPlacesWithDetails(options)
    return res.places
  },

  /**
   * Busca detalhes adicionais sob demanda (Place Details) do Google Places via backend
   * Chamado APENAS ao abrir detalhes, clicar em adicionar ao CRM ou iniciar WhatsApp sem telefone.
   */
  async fetchPlaceDetails(placeId: string): Promise<Partial<ProspectingPlace> | null> {
    if (!placeId) return null

    // Checar cache local em memória primeiro
    if (detailsCache.has(placeId)) {
      return detailsCache.get(placeId)!
    }

    try {
      const res = await pb.send<{
        success: boolean
        source: 'google_api' | 'cache'
        cached: boolean
        details: {
          id: string
          displayName: string
          formattedAddress: string
          phone: string | null
          normalizedPhone: string | null
          website: string | null
          googleMapsUri: string | null
          businessStatus: string
          street?: string
          neighborhood?: string
          city?: string
          state?: string
          postalCode?: string
        }
      }>('/backend/v1/crm/prospecting/places:details', {
        method: 'POST',
        body: { placeId },
      })

      if (res && res.success && res.details) {
        const d = res.details
        const enriched: Partial<ProspectingPlace> = {
          phone: d.phone,
          normalizedPhone: d.normalizedPhone,
          whatsappAvailable: Boolean(d.normalizedPhone && d.normalizedPhone.length >= 8),
          website: d.website,
          googleMapsUri: d.googleMapsUri,
          businessStatus: d.businessStatus,
          street: d.street || undefined,
          neighborhood: d.neighborhood || undefined,
          city: d.city || undefined,
          state: d.state || undefined,
          postalCode: d.postalCode || undefined,
          detailsLoaded: true,
        }
        detailsCache.set(placeId, enriched)
        return enriched
      }
      return null
    } catch (err) {
      console.warn('[placesService] Falha ao buscar detalhes do local:', err)
      return null
    }
  },

  /**
   * Fallback OpenStreetMap (Overpass) mantido intacto conforme requisitos 8 e 9
   */
  async searchOverpassOsm(options: SearchPlacesOptions): Promise<ProspectingPlace[]> {
    const { lat, lng, radiusKm, segment } = options
    const radiusMeters = Math.min(radiusKm * 1000, 50000)

    const query = buildOverpassQuery(lat, lng, radiusMeters, segment)
    const overpassEndpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ]

    let elements: any[] = []
    let fetchSuccess = false

    for (const endpoint of overpassEndpoints) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (res.ok) {
          const json = await res.json()
          if (json && Array.isArray(json.elements)) {
            elements = json.elements
            fetchSuccess = true
            break
          }
        } else {
          console.warn(`Overpass endpoint ${endpoint} returned status: ${res.status}`)
        }
      } catch (endpointErr) {
        console.warn(`Overpass endpoint ${endpoint} failed, trying next...`, endpointErr)
      }
    }

    if (!fetchSuccess) {
      console.warn('Todos os endpoints do Overpass falharam ou timeout.')
    }

    // 3. Normalização dos resultados brutos para o formato ProspectingPlace
    const seenIds = new Set<string>()
    const places: ProspectingPlace[] = []

    for (const el of elements) {
      const tags = el.tags || {}
      // Coordenadas: nós têm .lat/.lon; ways/relations têm .center
      const itemLat = el.lat ?? el.center?.lat
      const itemLng = el.lon ?? el.center?.lon
      if (itemLat === undefined || itemLng === undefined) continue

      const placeId = `osm:${el.type}/${el.id}`
      if (seenIds.has(placeId)) continue
      seenIds.add(placeId)

      // Categoria humana
      const rawCategory =
        tags.amenity ||
        tags.shop ||
        tags.office ||
        tags.craft ||
        tags.leisure ||
        tags.healthcare ||
        tags.tourism ||
        segment

      // Nome do estabelecimento: tags.name, variações, ou fallback descritivo do tipo/rua
      let name =
        tags.name || tags['name:pt'] || tags['name:en'] || tags['brand'] || tags['operator']
      if (!name) {
        const street = tags['addr:street'] || ''
        const suburb = tags['addr:suburb'] || tags['addr:neighbourhood'] || tags['addr:city'] || ''
        const typeLabel = rawCategory ? rawCategory.replace(/_/g, ' ') : 'Estabelecimento'
        const locationLabel = street ? `(${street})` : suburb ? `(${suburb})` : `(#${el.id})`
        name = `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} ${locationLabel}`
      }

      // Monta endereço público retornado
      const street = tags['addr:street'] || ''
      const number = tags['addr:housenumber'] || ''
      const neighborhood = tags['addr:suburb'] || tags['addr:neighbourhood'] || ''
      const city = tags['addr:city'] || ''
      const state = tags['addr:state'] || ''
      const postalCode = tags['addr:postcode'] || ''

      const addressParts = [
        street ? `${street}${number ? ', ' + number : ''}` : '',
        neighborhood,
        city,
        state,
      ].filter(Boolean)

      const address =
        addressParts.length > 0
          ? addressParts.join(' - ')
          : 'Endereço não informado nas fontes públicas'

      // Telefone / WhatsApp real
      const rawPhone =
        tags.phone ||
        tags['contact:phone'] ||
        tags['contact:mobile'] ||
        tags['contact:whatsapp'] ||
        null
      const cleanPhone = rawPhone ? rawPhone.trim() : null
      const normPhone = cleanPhone ? normalizePhone(cleanPhone) : null

      // WhatsApp disponível apenas se tiver telefone válido
      const whatsappAvailable = Boolean(normPhone && normPhone.length >= 10)

      // Website
      const website = tags.website || tags['contact:website'] || tags.url || null

      // E-mail
      const email = tags.email || tags['contact:email'] || null

      const distanceKm = calculateHaversineDistance(lat, lng, itemLat, itemLng)

      places.push({
        id: placeId,
        name: name.trim(),
        category: rawCategory.replace(/_/g, ' '),
        address,
        street,
        neighborhood,
        city,
        state,
        postalCode,
        lat: itemLat,
        lng: itemLng,
        distanceKm,
        phone: cleanPhone,
        normalizedPhone: normPhone,
        whatsappAvailable,
        website,
        email,
        provider: 'openstreetmap',
        rawTags: tags,
      })
    }

    // Ordenar por distância crescente
    places.sort((a, b) => a.distanceKm - b.distanceKm)

    return places
  },

  /**
   * Consulta os contadores internos diagnósticos
   */
  async getCounters(): Promise<{
    google_search_requests: number
    google_details_requests: number
    google_cache_hits: number
    has_api_key: boolean
  } | null> {
    try {
      const res = await pb.send<{
        success: boolean
        has_api_key: boolean
        counters: {
          google_search_requests: number
          google_details_requests: number
          google_cache_hits: number
        }
      }>('/backend/v1/crm/prospecting/places:counters', {
        method: 'GET',
      })
      if (res && res.success) {
        return {
          ...res.counters,
          has_api_key: res.has_api_key,
        }
      }
      return null
    } catch (err) {
      console.warn('[placesService] Erro ao consultar contadores:', err)
      return null
    }
  },

  /**
   * Limpa cache em memória
   */
  clearCache(): void {
    detailsCache.clear()
    geocodeCache.clear()
  },
}
