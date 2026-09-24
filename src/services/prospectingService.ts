/**
 * Serviço de Prospecção Comercial Laletra
 * Gerencia verificação anti-duplicação e inclusão de leads prospectados no CRM.
 *
 * Regras cruciais do usuário:
 * - Anti-duplicação obrigatória em 4 níveis: 1) external_place_id; 2) telefone normalizado; 3) site/domínio; 4) nome+endereço normalizados.
 * - Adicionar ao CRM NÃO cria attendance vazio nem mensagens nem conversas fantasmas.
 * - Mantém registro de origem = "Prospecção por mapa", data de inclusão, status de prospecção e geolocalização.
 */

import pb from '@/lib/pocketbase/client'
import { normalizePhone } from '@/lib/utils'
import type { Client, ProspectingPlace, ProspectingStatus } from '@/types/crm'

export interface CheckDuplicateResult {
  isDuplicate: boolean
  matchedClient: Client | null
  matchReason?: 'place_id' | 'phone' | 'website' | 'name_address'
  matchDetails?: string
}

export interface AddPlaceToCrmOptions {
  place: ProspectingPlace
  assignedTo?: string
  initialProspectingStatus?: ProspectingStatus
  notes?: string
}

function cleanDomain(url?: string | null): string {
  if (!url) return ''
  try {
    let u = url.trim().toLowerCase()
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u
    }
    const parsed = new URL(u)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
  }
}

function normalizeStringForComparison(str?: string | null): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const prospectingService = {
  /**
   * Checa se o estabelecimento já existe na base de clientes do CRM
   * Aplicando os 4 critérios:
   * 1. ID externo do provedor (Place ID)
   * 2. Telefone normalizado
   * 3. Domínio / site
   * 4. Nome + Endereço normalizados
   */
  async checkDuplicate(
    place: ProspectingPlace,
    existingClientsList?: Client[],
  ): Promise<CheckDuplicateResult> {
    const clients =
      existingClientsList ||
      (await pb.collection('clients').getFullList<Client>({
        requestKey: null,
      }))

    // 1. Checagem por ID externo (google_place_id / external_place_id)
    const placeIdToMatch = place.googlePlaceId || place.id
    if (placeIdToMatch) {
      const matchPlace = clients.find((c) => {
        if (c.google_place_id && c.google_place_id.trim() === placeIdToMatch.trim()) {
          return true
        }
        if (c.external_place_id && c.external_place_id.trim() === placeIdToMatch.trim()) {
          return true
        }
        return false
      })
      if (matchPlace) {
        return {
          isDuplicate: true,
          matchedClient: matchPlace,
          matchReason: 'place_id',
          matchDetails: `Identificador do local já cadastrado (${matchPlace.name})`,
        }
      }
    }

    // 2. Checagem por Telefone normalizado
    const normPhone = place.normalizedPhone || (place.phone ? normalizePhone(place.phone) : '')
    if (normPhone && normPhone.length >= 8) {
      const matchPhone = clients.find((c) => {
        const cNorm = c.normalized_phone || normalizePhone(c.phone)
        return (
          cNorm &&
          cNorm.length >= 8 &&
          (cNorm === normPhone || cNorm.includes(normPhone) || normPhone.includes(cNorm))
        )
      })
      if (matchPhone) {
        return {
          isDuplicate: true,
          matchedClient: matchPhone,
          matchReason: 'phone',
          matchDetails: `Telefone coincidente com ${matchPhone.name} (${matchPhone.phone})`,
        }
      }
    }

    // 3. Checagem por Domínio / Site
    const placeDomain = cleanDomain(place.website)
    if (placeDomain && placeDomain.length > 3) {
      const matchSite = clients.find((c) => {
        const cDomain = cleanDomain(c.website)
        return cDomain && cDomain.length > 3 && cDomain === placeDomain
      })
      if (matchSite) {
        return {
          isDuplicate: true,
          matchedClient: matchSite,
          matchReason: 'website',
          matchDetails: `Website com mesmo domínio: ${placeDomain} (${matchSite.name})`,
        }
      }
    }

    // 4. Checagem por Nome + Endereço / Bairro / Cidade normalizados
    const normPlaceName = normalizeStringForComparison(place.name)
    const normPlaceCity = normalizeStringForComparison(place.city)
    const normPlaceAddress = normalizeStringForComparison(place.address)

    if (normPlaceName.length >= 4) {
      const matchName = clients.find((c) => {
        const cName = normalizeStringForComparison(c.name)
        const cTrade = normalizeStringForComparison(c.trade_name)
        const nameMatches = cName === normPlaceName || cTrade === normPlaceName
        if (!nameMatches) return false

        // Se o nome é exatamente igual, checar se a cidade ou logradouro também conferem
        if (!normPlaceCity && !normPlaceAddress) return true
        const cCity = normalizeStringForComparison(c.address_city)
        const cStreet = normalizeStringForComparison(c.address_street)
        const cAddress = normalizeStringForComparison(
          `${c.address_street || ''} ${c.address_neighborhood || ''} ${c.address_city || ''}`,
        )

        if (cCity && normPlaceCity && cCity === normPlaceCity) return true
        if (cStreet && normPlaceAddress && normPlaceAddress.includes(cStreet)) return true
        if (cAddress && normPlaceAddress && cAddress === normPlaceAddress) return true

        return true
      })

      if (matchName) {
        return {
          isDuplicate: true,
          matchedClient: matchName,
          matchReason: 'name_address',
          matchDetails: `Nome e endereço coincidentes com ${matchName.name}`,
        }
      }
    }

    return {
      isDuplicate: false,
      matchedClient: null,
    }
  },

  /**
   * Enriquecer uma lista de ProspectingPlace com informações de duplicidade do CRM
   */
  async enrichPlacesWithCrmStatus(places: ProspectingPlace[]): Promise<ProspectingPlace[]> {
    if (places.length === 0) return []

    try {
      const clients = await pb.collection('clients').getFullList<Client>({
        requestKey: null,
      })

      return places.map((place) => {
        // Testa anti-duplicação em memória para performance máxima sem N queries de rede
        const dup = this.checkDuplicateInMemory(place, clients)
        if (dup.isDuplicate && dup.matchedClient) {
          return {
            ...place,
            crmStatus: 'cadastrado',
            existingClient: dup.matchedClient,
            matchReason: dup.matchReason,
          }
        }
        return {
          ...place,
          crmStatus: 'nao_cadastrado',
          existingClient: null,
          matchReason: undefined,
        }
      })
    } catch (err) {
      console.error('Error enriching places with CRM status:', err)
      return places
    }
  },

  /**
   * Versão síncrona/em memória da verificação anti-duplicação
   */
  checkDuplicateInMemory(place: ProspectingPlace, clients: Client[]): CheckDuplicateResult {
    // 1. ID externo (google_place_id / external_place_id)
    const placeIdToMatch = place.googlePlaceId || place.id
    if (placeIdToMatch) {
      const matchPlace = clients.find((c) => {
        if (c.google_place_id && c.google_place_id.trim() === placeIdToMatch.trim()) {
          return true
        }
        if (c.external_place_id && c.external_place_id.trim() === placeIdToMatch.trim()) {
          return true
        }
        return false
      })
      if (matchPlace) {
        return {
          isDuplicate: true,
          matchedClient: matchPlace,
          matchReason: 'place_id',
          matchDetails: `Identificador já cadastrado: ${matchPlace.name}`,
        }
      }
    }

    // 2. Telefone
    const normPhone = place.normalizedPhone || (place.phone ? normalizePhone(place.phone) : '')
    if (normPhone && normPhone.length >= 8) {
      const matchPhone = clients.find((c) => {
        const cNorm = c.normalized_phone || normalizePhone(c.phone)
        return (
          cNorm &&
          cNorm.length >= 8 &&
          (cNorm === normPhone || cNorm.includes(normPhone) || normPhone.includes(cNorm))
        )
      })
      if (matchPhone) {
        return {
          isDuplicate: true,
          matchedClient: matchPhone,
          matchReason: 'phone',
          matchDetails: `Telefone coincidente: ${matchPhone.name}`,
        }
      }
    }

    // 3. Site
    const placeDomain = cleanDomain(place.website)
    if (placeDomain && placeDomain.length > 3) {
      const matchSite = clients.find((c) => {
        const cDomain = cleanDomain(c.website)
        return cDomain && cDomain.length > 3 && cDomain === placeDomain
      })
      if (matchSite) {
        return {
          isDuplicate: true,
          matchedClient: matchSite,
          matchReason: 'website',
          matchDetails: `Mesmo site: ${placeDomain}`,
        }
      }
    }

    // 4. Nome + Endereço
    const normPlaceName = normalizeStringForComparison(place.name)
    const normPlaceCity = normalizeStringForComparison(place.city)
    const normPlaceAddress = normalizeStringForComparison(place.address)

    if (normPlaceName.length >= 4) {
      const matchName = clients.find((c) => {
        const cName = normalizeStringForComparison(c.name)
        const cTrade = normalizeStringForComparison(c.trade_name)
        const nameMatches = cName === normPlaceName || cTrade === normPlaceName
        if (!nameMatches) return false

        if (!normPlaceCity && !normPlaceAddress) return true
        const cCity = normalizeStringForComparison(c.address_city)
        const cStreet = normalizeStringForComparison(c.address_street)
        if (cCity && normPlaceCity && cCity === normPlaceCity) return true
        if (cStreet && normPlaceAddress && normPlaceAddress.includes(cStreet)) return true
        return true
      })

      if (matchName) {
        return {
          isDuplicate: true,
          matchedClient: matchName,
          matchReason: 'name_address',
          matchDetails: `Nome e endereço coincidentes`,
        }
      }
    }

    return {
      isDuplicate: false,
      matchedClient: null,
    }
  },

  /**
   * Adiciona um lead prospectado ao CRM
   * Regra crítica: Adicionar ao CRM NÃO cria attendance vazio nem mensagens nem conversas fantasmas.
   */
  async addPlaceToCrm(
    options: AddPlaceToCrmOptions,
  ): Promise<{ success: boolean; client: Client; wasDuplicate: boolean }> {
    const { place, assignedTo, initialProspectingStatus = 'Nao contatado', notes } = options

    // 1. Verifica anti-duplicação antes de criar
    const dupCheck = await this.checkDuplicate(place)
    if (dupCheck.isDuplicate && dupCheck.matchedClient) {
      return {
        success: true,
        client: dupCheck.matchedClient,
        wasDuplicate: true,
      }
    }

    // 2. Prepara payload de criação de cliente no CRM
    const cleanPhone = place.phone ? place.phone.trim() : ''
    const normPhone = place.normalizedPhone || (cleanPhone ? normalizePhone(cleanPhone) : '')

    // Gera public_token para consistência cadastral
    const token =
      'ctk_' +
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15) +
      Date.now().toString(36)

    const dateToday = new Date().toISOString().split('T')[0]

    const notesParts: string[] = []
    notesParts.push(`[PROSPECÇÃO COMERCIAL - MAPA]`)
    notesParts.push(`Categoria: ${place.category}`)
    notesParts.push(`Distância da busca: ${place.distanceKm} km`)
    notesParts.push(
      `Fonte dos dados: ${place.provider === 'google_places' ? 'Google Places API' : 'OpenStreetMap'}`,
    )
    if (notes && notes.trim()) {
      notesParts.push(`Observação do operador: ${notes.trim()}`)
    }

    const isGoogle = place.provider === 'google_places'
    const targetPlaceId = place.googlePlaceId || place.id

    const payload: Partial<Client> = {
      name: place.name,
      trade_name: place.name,
      phone: cleanPhone || 'Não informado',
      normalized_phone: normPhone || '',
      email: place.email || '',
      website: place.website || '',
      business_category: place.category,
      origin: isGoogle ? 'google_places' : 'Prospecção por mapa',
      prospecting_status: initialProspectingStatus,
      prospecting_date: dateToday,
      external_place_id: targetPlaceId,
      google_place_id: isGoogle ? targetPlaceId : undefined,
      latitude: place.lat,
      longitude: place.lng,
      stage: 'Novo contato',
      priority: 'media',
      assigned_to: assignedTo || '',
      client_type: 'pessoa_juridica',
      address_street: place.street || '',
      address_neighborhood: place.neighborhood || '',
      address_city: place.city || '',
      address_state: place.state || '',
      address_zip: place.postalCode || '',
      notes: notesParts.join('\n'),
      public_token: token,
      is_archived: false,
      total_purchases: 0,
      total_purchase_value: 0,
    }

    // 3. Persistência direta no PocketBase — SEM criar attendance vazio
    try {
      const created = await pb.collection('clients').create<Client>(payload)
      return {
        success: true,
        client: created,
        wasDuplicate: false,
      }
    } catch (err: any) {
      console.error('Error creating client from prospecting:', err)
      // Se ocorreu conflito de duplicidade de concorrência:
      const retryDup = await this.checkDuplicate(place)
      if (retryDup.isDuplicate && retryDup.matchedClient) {
        return {
          success: true,
          client: retryDup.matchedClient,
          wasDuplicate: true,
        }
      }
      throw err
    }
  },

  /**
   * Adiciona múltiplos estabelecimentos selecionados em lote ao CRM
   */
  async addBatchPlacesToCrm(
    places: ProspectingPlace[],
    assignedTo?: string,
  ): Promise<{ addedCount: number; alreadyExistedCount: number; clients: Client[] }> {
    let addedCount = 0
    let alreadyExistedCount = 0
    const clients: Client[] = []

    // Carrega clientes atuais uma única vez para checagem rápida em memória
    const currentClients = await pb.collection('clients').getFullList<Client>({
      requestKey: null,
    })

    for (const place of places) {
      const dup = this.checkDuplicateInMemory(place, currentClients)
      if (dup.isDuplicate && dup.matchedClient) {
        alreadyExistedCount++
        clients.push(dup.matchedClient)
        continue
      }

      try {
        const res = await this.addPlaceToCrm({
          place,
          assignedTo,
          initialProspectingStatus: 'Nao contatado',
        })
        if (res.wasDuplicate) {
          alreadyExistedCount++
        } else {
          addedCount++
          currentClients.push(res.client)
        }
        clients.push(res.client)
      } catch (err) {
        console.warn(`Failed to add place ${place.name}:`, err)
      }
    }

    return {
      addedCount,
      alreadyExistedCount,
      clients,
    }
  },

  /**
   * Atualiza o status de prospecção do cliente
   */
  async updateProspectingStatus(clientId: string, status: ProspectingStatus): Promise<Client> {
    return await pb.collection('clients').update<Client>(clientId, {
      prospecting_status: status,
    })
  },
}
