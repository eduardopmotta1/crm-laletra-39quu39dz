import { describe, it, expect, beforeEach } from 'vitest'
import { prospectingService } from './prospectingService'
import { calculateHaversineDistance } from './placesService'
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
