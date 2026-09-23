/**
 * Serviço de busca de locais e estabelecimentos comerciais (Places)
 * Encapsulado para suportar múltiplos provedores (OpenStreetMap Overpass + Nominatim, e Google Places quando configurado).
 * Não expõe chaves secretas no frontend.
 * Contém cache temporário para evitar requisições repetidas e limite de chamadas desnecessárias.
 */

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
}

// Cache local em memória por chave (ex: lat:lng:radius:segment) válido por 5 minutos
interface CacheEntry {
  timestamp: number
  data: ProspectingPlace[]
}

const placesCache = new Map<string, CacheEntry>()
const geocodeCache = new Map<string, GeocodingResult[]>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

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
 * Normaliza e categoriza termos em português para Overpass OSM Tags quando possível,
 * mas mantendo busca flexível por nome/tag.
 */
function buildOverpassQuery(
  lat: number,
  lng: number,
  radiusMeters: number,
  segment: string,
): string {
  const cleanSeg = segment.trim().toLowerCase()

  // Se o usuário digitou palavras comuns, podemos enriquecer os seletores do OpenStreetMap
  const clauses: string[] = []

  // Cláusulas básicas de amenidade/loja/escritório que contenham nome correspondente
  // Overpass QL regex case insensitive: [~"name"~"termo",i]
  const escaped = cleanSeg.replace(/["\\]/g, '')

  // Mapeamentos comuns para filtros de amenities/shop/craft/office
  if (cleanSeg.includes('escola') || cleanSeg.includes('colegio')) {
    clauses.push(`nwr["amenity"="school"](around:${radiusMeters},${lat},${lng});`)
    clauses.push(`nwr["amenity"="college"](around:${radiusMeters},${lat},${lng});`)
  }
  if (cleanSeg.includes('academia') || cleanSeg.includes('fitness')) {
    clauses.push(`nwr["leisure"="fitness_centre"](around:${radiusMeters},${lat},${lng});`)
    clauses.push(`nwr["leisure"="sports_centre"](around:${radiusMeters},${lat},${lng});`)
  }
  if (
    cleanSeg.includes('restaurante') ||
    cleanSeg.includes('bar') ||
    cleanSeg.includes('comida') ||
    cleanSeg.includes('pizzaria') ||
    cleanSeg.includes('lanchonete')
  ) {
    clauses.push(`nwr["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});`)
    clauses.push(`nwr["amenity"="fast_food"](around:${radiusMeters},${lat},${lng});`)
    clauses.push(`nwr["amenity"="cafe"](around:${radiusMeters},${lat},${lng});`)
  }
  if (cleanSeg.includes('dentista') || cleanSeg.includes('odont') || cleanSeg.includes('clinica')) {
    clauses.push(`nwr["amenity"="dentist"](around:${radiusMeters},${lat},${lng});`)
    clauses.push(`nwr["amenity"="clinic"](around:${radiusMeters},${lat},${lng});`)
    clauses.push(`nwr["healthcare"="clinic"](around:${radiusMeters},${lat},${lng});`)
  }
  if (cleanSeg.includes('farmacia') || cleanSeg.includes('drogaria')) {
    clauses.push(`nwr["amenity"="pharmacy"](around:${radiusMeters},${lat},${lng});`)
  }
  if (
    cleanSeg.includes('grafica') ||
    cleanSeg.includes('impressao') ||
    cleanSeg.includes('comunicacao visual')
  ) {
    clauses.push(`nwr["shop"="copyshop"](around:${radiusMeters},${lat},${lng});`)
    clauses.push(`nwr["craft"="printer"](around:${radiusMeters},${lat},${lng});`)
  }
  if (cleanSeg.includes('hotel') || cleanSeg.includes('pousada')) {
    clauses.push(`nwr["tourism"="hotel"](around:${radiusMeters},${lat},${lng});`)
    clauses.push(`nwr["tourism"="guest_house"](around:${radiusMeters},${lat},${lng});`)
  }
  if (cleanSeg.includes('imobiliaria')) {
    clauses.push(`nwr["office"="estate_agent"](around:${radiusMeters},${lat},${lng});`)
  }
  if (cleanSeg.includes('advoc') || cleanSeg.includes('advogado')) {
    clauses.push(`nwr["office"="lawyer"](around:${radiusMeters},${lat},${lng});`)
  }
  if (cleanSeg.includes('mecanic') || cleanSeg.includes('oficina') || cleanSeg.includes('auto')) {
    clauses.push(`nwr["shop"="car_repair"](around:${radiusMeters},${lat},${lng});`)
  }

  // Busca geral por nome nas categorias comerciais principais do OpenStreetMap
  clauses.push(`nwr["name"~"${escaped}",i](around:${radiusMeters},${lat},${lng});`)
  clauses.push(
    `nwr["shop"]["name"](around:${radiusMeters},${lat},${lng})[~"name|shop|amenity|description"~"${escaped}",i];`,
  )
  clauses.push(
    `nwr["amenity"]["name"](around:${radiusMeters},${lat},${lng})[~"name|amenity|description"~"${escaped}",i];`,
  )
  clauses.push(
    `nwr["office"]["name"](around:${radiusMeters},${lat},${lng})[~"name|office|description"~"${escaped}",i];`,
  )
  clauses.push(
    `nwr["craft"]["name"](around:${radiusMeters},${lat},${lng})[~"name|craft|description"~"${escaped}",i];`,
  )

  // Monta a query Overpass completa com timeout seguro e limite de resultados
  return `
[out:json][timeout:25];
(
  ${clauses.join('\n  ')}
);
out center 100;
`
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
   * Busca estabelecimentos comerciais na região especificada
   */
  async searchPlaces(options: SearchPlacesOptions): Promise<ProspectingPlace[]> {
    const { lat, lng, radiusKm, segment } = options
    const radiusMeters = Math.min(radiusKm * 1000, 50000) // Limite de 50 km para segurança de tráfego
    const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusKm}:${segment.trim().toLowerCase()}`

    // 1. Verifica cache em memória
    const cached = placesCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data
    }

    // 2. Tenta Overpass API (OpenStreetMap) padrão sem chave
    const query = buildOverpassQuery(lat, lng, radiusMeters, segment)
    const overpassEndpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ]

    let elements: any[] = []
    let fetchSuccess = false

    for (const endpoint of overpassEndpoints) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000)

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
      const name = tags.name || tags['name:pt'] || tags['brand'] || tags['operator']
      if (!name) continue // Ignorar nós sem nome legível

      // Coordenadas: nós têm .lat/.lon; ways/relations têm .center
      const itemLat = el.lat ?? el.center?.lat
      const itemLng = el.lon ?? el.center?.lon
      if (itemLat === undefined || itemLng === undefined) continue

      const placeId = `osm:${el.type}/${el.id}`
      if (seenIds.has(placeId)) continue
      seenIds.add(placeId)

      // Categoria humana
      const category =
        tags.amenity ||
        tags.shop ||
        tags.office ||
        tags.craft ||
        tags.leisure ||
        tags.healthcare ||
        tags.tourism ||
        segment

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
        category: category.replace(/_/g, ' '),
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

    // 4. Salva no cache
    placesCache.set(cacheKey, {
      timestamp: Date.now(),
      data: places,
    })

    return places
  },

  /**
   * Limpa cache de buscas de places se necessário
   */
  clearCache(): void {
    placesCache.clear()
    geocodeCache.clear()
  },
}
