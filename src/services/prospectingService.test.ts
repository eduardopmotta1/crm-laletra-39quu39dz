import { describe, it, expect, beforeEach } from 'vitest'
import { prospectingService } from './prospectingService'
import {
  calculateHaversineDistance,
  normalizeSearchTerm,
  mapPortugueseToOsmSelectors,
  buildOverpassQuery,
} from './placesService'
import type { ProspectingPlace, Client } from '@/types/crm'

describe('prospectingService & placesService', () => {
  it('calculateHaversineDistance calculates correct distances in km', () => {
    // Distância aproximada entre dois pontos conhecidos (ex: ~111 km por grau de latitude)
    const dist = calculateHaversineDistance(0, 0, 1, 0)
    expect(dist).toBeGreaterThan(110)
    expect(dist).toBeLessThan(112)

    // Mesmas coordenadas -> 0 km
    expect(calculateHaversineDistance(-22.4633, -42.6536, -22.4633, -42.6536)).toBe(0)
  })

  describe('Mapeamento de intenção em português para tags OSM', () => {
    it('normaliza acentos e maiúsculas corretamente', () => {
      expect(normalizeSearchTerm('Escolas')).toBe('escolas')
      expect(normalizeSearchTerm('Farmácias')).toBe('farmacias')
      expect(normalizeSearchTerm('Colégios')).toBe('colegios')
      expect(normalizeSearchTerm('Salão de Beleza')).toBe('salao de beleza')
    })

    it('mapeia todas as categorias exigidas pelo usuário', () => {
      // escola/escolas/colegio/colégios → amenity=school
      expect(mapPortugueseToOsmSelectors('Escolas').selectors).toContain('nwr["amenity"="school"]')
      expect(mapPortugueseToOsmSelectors('escola').selectors).toContain('nwr["amenity"="school"]')
      expect(mapPortugueseToOsmSelectors('Colégios').selectors).toContain('nwr["amenity"="school"]')

      // creche/creches → amenity=kindergarten
      expect(mapPortugueseToOsmSelectors('Creches').selectors).toContain(
        'nwr["amenity"="kindergarten"]',
      )

      // universidade/faculdade → amenity=university / college
      const univ = mapPortugueseToOsmSelectors('faculdades')
      expect(univ.selectors).toContain('nwr["amenity"="university"]')
      expect(univ.selectors).toContain('nwr["amenity"="college"]')

      // restaurante/restaurantes → amenity=restaurant
      expect(mapPortugueseToOsmSelectors('Restaurantes').selectors).toContain(
        'nwr["amenity"="restaurant"]',
      )

      // pizzaria/pizzarias → amenity=restaurant + pizza
      const pizza = mapPortugueseToOsmSelectors('Pizzarias')
      expect(pizza.selectors.some((s) => s.includes('pizza'))).toBe(true)

      // academia/academias → leisure=fitness_centre
      expect(mapPortugueseToOsmSelectors('Academias').selectors).toContain(
        'nwr["leisure"="fitness_centre"]',
      )

      // farmácia/farmácias → amenity=pharmacy
      expect(mapPortugueseToOsmSelectors('Farmácias').selectors).toContain(
        'nwr["amenity"="pharmacy"]',
      )

      // clínica/clínicas → amenity=clinic
      expect(mapPortugueseToOsmSelectors('Clínicas').selectors).toContain('nwr["amenity"="clinic"]')

      // dentista/dentistas → amenity=dentist
      expect(mapPortugueseToOsmSelectors('Dentistas').selectors).toContain(
        'nwr["amenity"="dentist"]',
      )

      // hospital/hospitais → amenity=hospital
      expect(mapPortugueseToOsmSelectors('Hospitais').selectors).toContain(
        'nwr["amenity"="hospital"]',
      )

      // bar/bares → amenity=bar
      expect(mapPortugueseToOsmSelectors('Bares').selectors).toContain('nwr["amenity"="bar"]')

      // café/cafeteria → amenity=cafe
      expect(mapPortugueseToOsmSelectors('Cafeterias').selectors).toContain('nwr["amenity"="cafe"]')

      // hotel/hotéis → tourism=hotel
      expect(mapPortugueseToOsmSelectors('Hotéis').selectors).toContain('nwr["tourism"="hotel"]')

      // pousada/pousadas → tourism=guest_house
      expect(mapPortugueseToOsmSelectors('Pousadas').selectors).toContain(
        'nwr["tourism"="guest_house"]',
      )

      // supermercado/mercado → shop=supermarket / convenience
      const mercado = mapPortugueseToOsmSelectors('Supermercados')
      expect(mercado.selectors).toContain('nwr["shop"="supermarket"]')
      expect(mercado.selectors).toContain('nwr["shop"="convenience"]')

      // pet shop → shop=pet
      expect(mapPortugueseToOsmSelectors('Pet Shop').selectors).toContain('nwr["shop"="pet"]')

      // salão de beleza → shop=hairdresser / beauty
      const salao = mapPortugueseToOsmSelectors('Salão de Beleza')
      expect(salao.selectors).toContain('nwr["shop"="hairdresser"]')
      expect(salao.selectors).toContain('nwr["shop"="beauty"]')

      // oficina → shop=car_repair
      expect(mapPortugueseToOsmSelectors('Oficinas').selectors).toContain(
        'nwr["shop"="car_repair"]',
      )
    })

    it('gera consulta Overpass segura e otimizada (sem regex global pesada)', () => {
      const qEscola = buildOverpassQuery(-22.4633, -42.6536, 20000, 'Escolas')
      expect(qEscola).toContain('out tags center')
      expect(qEscola).toContain('["amenity"="school"]')
      expect(qEscola).not.toContain('~"name|shop|amenity')

      const qTermoLivre = buildOverpassQuery(-22.4633, -42.6536, 20000, 'Ferragens Souza')
      expect(qTermoLivre).toContain('nwr["name"~"Ferragens Souza",i]')
    })
  })

  describe('Anti-duplicação de estabelecimentos comerciais', () => {
    const mockExistingClients: Client[] = [
      {
        id: 'client_1',
        name: 'Colégio Alpha Macacu',
        trade_name: 'Colégio Alpha',
        phone: '+55 21 99888-7766',
        normalized_phone: '21998887766',
        email: 'contato@colegioalpha.com.br',
        website: 'https://www.colegioalpha.com.br',
        external_place_id: 'osm:node/1001',
        address_street: 'Rua Principal, 100',
        address_neighborhood: 'Centro',
        address_city: 'Cachoeiras de Macacu',
        stage: 'Novo contato',
        priority: 'media',
        is_archived: false,
        created: '2026-01-01',
        updated: '2026-01-01',
      },
      {
        id: 'client_2',
        name: 'Academia Fit Life',
        phone: '+55 21 2779-1234',
        normalized_phone: '2127791234',
        website: 'fitlife.com',
        stage: 'Venda fechada',
        priority: 'alta',
        is_archived: false,
        created: '2026-01-01',
        updated: '2026-01-01',
      },
    ]

    it('identifica duplicata pelo Place ID externo', () => {
      const place: ProspectingPlace = {
        id: 'osm:node/1001',
        name: 'Escola Alpha Unidade 2',
        category: 'school',
        address: 'Rua Diferente',
        lat: -22.46,
        lng: -42.65,
        distanceKm: 1.2,
        whatsappAvailable: false,
        provider: 'openstreetmap',
      }

      const res = prospectingService.checkDuplicateInMemory(place, mockExistingClients)
      expect(res.isDuplicate).toBe(true)
      expect(res.matchReason).toBe('place_id')
      expect(res.matchedClient?.id).toBe('client_1')
    })

    it('identifica duplicata de Google Place via google_place_id', () => {
      const clientsWithGoogle: Client[] = [
        ...mockExistingClients,
        {
          id: 'client_google_1',
          name: 'Colégio Estadual Teste',
          phone: '21999990000',
          google_place_id: 'ChIJabcdef123456',
          stage: 'Novo contato',
          priority: 'media',
          is_archived: false,
          created: '2026-01-01',
          updated: '2026-01-01',
        } as unknown as Client,
      ]

      const place: ProspectingPlace = {
        id: 'ChIJabcdef123456',
        googlePlaceId: 'ChIJabcdef123456',
        name: 'Colégio Estadual Outro Nome',
        category: 'school',
        address: 'Outro endereço',
        lat: -22.46,
        lng: -42.65,
        distanceKm: 2.0,
        whatsappAvailable: false,
        provider: 'google_places',
      }

      const res = prospectingService.checkDuplicateInMemory(place, clientsWithGoogle)
      expect(res.isDuplicate).toBe(true)
      expect(res.matchReason).toBe('place_id')
      expect(res.matchedClient?.id).toBe('client_google_1')
    })

    it('identifica duplicata pelo Telefone normalizado', () => {
      const place: ProspectingPlace = {
        id: 'osm:node/9999',
        name: 'Colégio Novo Sem PlaceID',
        category: 'school',
        address: 'Qualquer rua',
        phone: '(21) 99888-7766',
        normalizedPhone: '21998887766',
        lat: -22.46,
        lng: -42.65,
        distanceKm: 0.5,
        whatsappAvailable: true,
        provider: 'openstreetmap',
      }

      const res = prospectingService.checkDuplicateInMemory(place, mockExistingClients)
      expect(res.isDuplicate).toBe(true)
      expect(res.matchReason).toBe('phone')
      expect(res.matchedClient?.id).toBe('client_1')
    })

    it('identifica duplicata pelo Domínio do website', () => {
      const place: ProspectingPlace = {
        id: 'osm:node/8888',
        name: 'Alpha Cursos',
        category: 'school',
        address: 'Outro local',
        website: 'http://colegioalpha.com.br/contato',
        lat: -22.46,
        lng: -42.65,
        distanceKm: 2,
        whatsappAvailable: false,
        provider: 'openstreetmap',
      }

      const res = prospectingService.checkDuplicateInMemory(place, mockExistingClients)
      expect(res.isDuplicate).toBe(true)
      expect(res.matchReason).toBe('website')
      expect(res.matchedClient?.id).toBe('client_1')
    })

    it('identifica duplicata pelo Nome e Endereço', () => {
      const place: ProspectingPlace = {
        id: 'osm:node/7777',
        name: 'Academia Fit Life',
        category: 'gym',
        address: 'Centro, Cachoeiras de Macacu',
        lat: -22.46,
        lng: -42.65,
        distanceKm: 3.5,
        whatsappAvailable: false,
        provider: 'openstreetmap',
      }

      const res = prospectingService.checkDuplicateInMemory(place, mockExistingClients)
      expect(res.isDuplicate).toBe(true)
      expect(res.matchReason).toBe('name_address')
      expect(res.matchedClient?.id).toBe('client_2')
    })

    it('permite novo cadastro quando a empresa não existe na base', () => {
      const place: ProspectingPlace = {
        id: 'osm:node/5555',
        name: 'Restaurante Sabor das Serras',
        category: 'restaurant',
        address: 'Estrada Rio-Friburgo km 15',
        phone: '(21) 97777-1111',
        normalizedPhone: '21977771111',
        website: 'https://sabordasserras.com.br',
        lat: -22.4,
        lng: -42.6,
        distanceKm: 8,
        whatsappAvailable: true,
        provider: 'openstreetmap',
      }

      const res = prospectingService.checkDuplicateInMemory(place, mockExistingClients)
      expect(res.isDuplicate).toBe(false)
      expect(res.matchedClient).toBeNull()
    })
  })
})
