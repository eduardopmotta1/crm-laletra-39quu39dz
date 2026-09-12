import { describe, it, expect } from 'vitest'
import { calculateClientProfileCompleteness, clientsService } from './clients'
import type { Client } from '@/types/crm'
import { isWithin24HourWindow } from '@/types/crm'

describe('calculateClientProfileCompleteness', () => {
  it('retorna incompleto se o cliente for nulo ou indefinido', () => {
    const res = calculateClientProfileCompleteness(null)
    expect(res.isComplete).toBe(false)
    expect(res.totalRequired).toBe(11)
    expect(res.completedRequired).toBe(0)
    expect(res.percentage).toBe(0)
    expect(res.missingFields.length).toBe(11)
  })

  it('considera completo um cliente Pessoa Física (PF) com todos os 11 campos essenciais, mesmo sem trade_name', () => {
    const pfClient: Partial<Client> = {
      name: 'João da Silva',
      phone: '+55 11 99999-1234',
      client_type: 'pessoa_fisica',
      cpf_cnpj: '123.456.789-00',
      email: 'joao@email.com',
      address_zip: '01310-100',
      address_street: 'Avenida Paulista',
      address_number: '1000',
      address_neighborhood: 'Bela Vista',
      address_city: 'São Paulo',
      address_state: 'SP',
      // Campos não obrigatórios ausentes
      trade_name: '',
      birth_date: '',
      secondary_phone: '',
      instagram: '',
      how_found: '',
      address_complement: '',
      notes: '',
      is_vip: false,
    }

    const res = calculateClientProfileCompleteness(pfClient)
    expect(res.isComplete).toBe(true)
    expect(res.missingFields).toEqual([])
    expect(res.totalRequired).toBe(11)
    expect(res.completedRequired).toBe(11)
    expect(res.percentage).toBe(100)
  })

  it('considera incompleto um cliente Pessoa Jurídica (PJ) sem trade_name (Nome Fantasia)', () => {
    const pjClientWithoutTradeName: Partial<Client> = {
      name: 'Laletra Gráfica e Eventos Ltda',
      phone: '+55 11 98888-2222',
      client_type: 'pessoa_juridica',
      cpf_cnpj: '12.345.678/0001-90',
      email: 'contato@laletra.com.br',
      address_zip: '01310-100',
      address_street: 'Avenida Paulista',
      address_number: '1000',
      address_neighborhood: 'Bela Vista',
      address_city: 'São Paulo',
      address_state: 'SP',
      trade_name: '   ', // espaço em branco deve ser considerado faltante
    }

    const res = calculateClientProfileCompleteness(pjClientWithoutTradeName)
    expect(res.isComplete).toBe(false)
    expect(res.totalRequired).toBe(12)
    expect(res.completedRequired).toBe(11)
    expect(res.percentage).toBe(92)
    expect(res.missingFields).toContain('Nome Fantasia')
  })

  it('considera completo um cliente Pessoa Jurídica (PJ) com trade_name preenchido', () => {
    const pjClient: Partial<Client> = {
      name: 'Laletra Gráfica e Eventos Ltda',
      trade_name: 'Laletra Gráfica',
      phone: '+55 11 98888-2222',
      client_type: 'pessoa_juridica',
      cpf_cnpj: '12.345.678/0001-90',
      email: 'contato@laletra.com.br',
      address_zip: '01310-100',
      address_street: 'Avenida Paulista',
      address_number: '1000',
      address_neighborhood: 'Bela Vista',
      address_city: 'São Paulo',
      address_state: 'SP',
    }

    const res = calculateClientProfileCompleteness(pjClient)
    expect(res.isComplete).toBe(true)
    expect(res.missingFields).toHaveLength(0)
    expect(res.totalRequired).toBe(12)
    expect(res.completedRequired).toBe(12)
    expect(res.percentage).toBe(100)
  })

  it('detecta strings vazias, só espaços e null como faltantes', () => {
    const client: Partial<Client> = {
      name: 'Maria Santos',
      phone: '  ', // só espaços
      client_type: 'pessoa_fisica',
      cpf_cnpj: undefined,
      email: '',
      address_zip: null as any,
      address_street: 'Rua das Flores',
      address_number: '50',
      address_neighborhood: '',
      address_city: 'Rio de Janeiro',
      address_state: 'RJ',
    }

    const res = calculateClientProfileCompleteness(client)
    expect(res.isComplete).toBe(false)
    expect(res.missingFields).toContain('WhatsApp / Telefone')
    expect(res.missingFields).toContain('CPF / CNPJ')
    expect(res.missingFields).toContain('E-mail')
    expect(res.missingFields).toContain('CEP')
    expect(res.missingFields).toContain('Bairro')
    expect(res.missingFields.length).toBe(5)
    expect(res.completedRequired).toBe(6)
    expect(res.totalRequired).toBe(11)
    expect(res.percentage).toBe(55)
  })

  it('se client_type estiver vazio ou indefinido, considera client_type como faltante e não exige trade_name como PJ', () => {
    const client: Partial<Client> = {
      name: 'Carlos Oliveira',
      phone: '11999999999',
      client_type: undefined,
      cpf_cnpj: '12345678900',
      email: 'carlos@teste.com',
      address_zip: '01001-000',
      address_street: 'Praça da Sé',
      address_number: '1',
      address_neighborhood: 'Sé',
      address_city: 'São Paulo',
      address_state: 'SP',
    }

    const res = calculateClientProfileCompleteness(client)
    expect(res.isComplete).toBe(false)
    expect(res.missingFields).toEqual(['Tipo de Cliente'])
    expect(res.totalRequired).toBe(11)
    expect(res.completedRequired).toBe(10)
    expect(res.percentage).toBe(91)
  })
})

describe('clientsService.getPublicClientUrl', () => {
  it('gera URL pública preferencialmente com public_token', () => {
    const url = clientsService.getPublicClientUrl({
      id: 'client123',
      public_token: 'tok_abc_789',
    })
    expect(url).toContain('/cadastro/tok_abc_789')
  })

  it('usa fallback de id caso public_token não esteja presente', () => {
    const url = clientsService.getPublicClientUrl({
      id: 'client123',
    })
    expect(url).toContain('/cadastro/client123')
  })
})

describe('isWithin24HourWindow para envio do link pelo WhatsApp', () => {
  it('permite envio livre dentro da janela de 24h a partir de mensagem do cliente', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
    const within = isWithin24HourWindow(twoHoursAgo, 'inbound')
    expect(within).toBe(true)
  })

  it('bloqueia envio livre quando ultrapassar a janela de 24h', () => {
    const now = new Date()
    const thirtyHoursAgo = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString()
    const within = isWithin24HourWindow(thirtyHoursAgo, 'inbound')
    expect(within).toBe(false)
  })

  it('bloqueia envio se última mensagem foi enviada pela equipe (outbound) sem mensagem recente do cliente', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
    const within = isWithin24HourWindow(twoHoursAgo, 'outbound')
    expect(within).toBe(false)
  })

  it('permite envio se a última mensagem geral foi outbound mas existe lastCustomerMessageAt recente (<24h)', () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString()
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const within = isWithin24HourWindow(oneHourAgo, 'outbound', {
      lastCustomerMessageAt: fiveHoursAgo,
    })
    expect(within).toBe(true)
  })
})
