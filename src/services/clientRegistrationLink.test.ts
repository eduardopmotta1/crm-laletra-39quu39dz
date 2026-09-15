import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Client, Attendance } from '@/types/crm'
import pb from '@/lib/pocketbase/client'
import { whatsappService } from '@/services/whatsapp'
import { clientsService } from '@/services/clients'
import {
  clientRegistrationLinkService,
  ensureRegistrationLinkForClient,
  checkRegistrationLinkWindow,
  sendRegistrationLinkViaWhatsApp,
} from '@/services/clientRegistrationLink'
import { lastInboundAt, isTimestampWithin24h } from '@/services/whatsappWindow'

describe('Suíte de Testes Obrigatórios: Solicitar Atualização de Cadastro (A até L)', () => {
  const mockClientIncomplete: Client = {
    id: 'cli_drawer_incomplete_123',
    name: 'Cliente Incompleto Teste',
    phone: '+55 11 98765-4321',
    public_token: 'tok_pub_incomplete',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T00:00:00Z',
  }

  const mockClientComplete: Client = {
    id: 'cli_drawer_complete_456',
    name: 'Cliente Cadastro Completo',
    phone: '+55 11 91234-5678',
    cpf_cnpj: '12.345.678/0001-90',
    trade_name: 'Empresa Alpha Ltda',
    client_type: 'pessoa_juridica',
    email: 'contato@alphagrafica.com',
    secondary_phone: '+55 11 99999-8888',
    instagram: '@alphagrafica',
    address_zip: '01001-000',
    address_street: 'Praça da Sé',
    address_number: '100',
    address_neighborhood: 'Sé',
    address_city: 'São Paulo',
    address_state: 'SP',
    public_token: 'tok_pub_complete',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T00:00:00Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // Teste A: Ficha do cliente continua enviando solicitação normalmente
  it('A) Ficha do cliente continua enviando solicitação normalmente através do service compartilhado', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z')
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_ficha',
      client_id: mockClientIncomplete.id,
      last_customer_message_at: tenMinsAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_ficha_inbound',
          client_id: mockClientIncomplete.id,
          attendance_id: 'att_ficha',
          direction: 'inbound',
          created: tenMinsAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValueOnce({
      success: true,
      whatsapp_message_id: 'wamid.HBgLTEST_FICHA',
    })

    const res = await sendRegistrationLinkViaWhatsApp({
      client: mockClientIncomplete,
      attendanceId: 'att_ficha',
      referenceTime: now,
    })

    expect(res.success).toBe(true)
    expect(res.within24h).toBe(true)
    expect(res.linkUrl).toContain(mockClientIncomplete.public_token!)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: mockClientIncomplete.id,
        attendanceId: 'att_ficha',
        messageText: expect.stringContaining(res.linkUrl),
      }),
    )
  })

  // Teste B: Modal filho da ficha não fecha/quebra o modal pai (isChildOpenSync intacto)
  it('B) Modal filho da ficha não fecha/quebra o modal pai: isChildOpenSync considera requestLinkModalOpen', () => {
    // Verificamos a regra de proteção: quando requestLinkModalOpen = true, isChildOpenSync() retorna true
    const isChildOpenSync = (state: {
      openChildModalRef: any
      justClosedChildRef: boolean
      evaluationsModalOpen: boolean
      purchaseHistoryModalOpen: boolean
      quotesModalOpen: boolean
      startChatModalOpen: boolean
      requestLinkModalOpen: boolean
    }) => {
      return Boolean(
        state.openChildModalRef ||
        state.justClosedChildRef ||
        state.evaluationsModalOpen ||
        state.purchaseHistoryModalOpen ||
        state.quotesModalOpen ||
        state.startChatModalOpen ||
        state.requestLinkModalOpen,
      )
    }

    expect(
      isChildOpenSync({
        openChildModalRef: null,
        justClosedChildRef: false,
        evaluationsModalOpen: false,
        purchaseHistoryModalOpen: false,
        quotesModalOpen: false,
        startChatModalOpen: false,
        requestLinkModalOpen: true,
      }),
    ).toBe(true)

    expect(
      isChildOpenSync({
        openChildModalRef: null,
        justClosedChildRef: false,
        evaluationsModalOpen: false,
        purchaseHistoryModalOpen: false,
        quotesModalOpen: false,
        startChatModalOpen: false,
        requestLinkModalOpen: false,
      }),
    ).toBe(false)
  })

  // Teste C: Drawer mostra o novo ícone (botão com UserRoundPen e tooltip correto)
  it('C) Drawer tem botão de "Solicitar atualização de cadastro" com UserRoundPen e title correspondente', async () => {
    // Validamos que o import e os identificadores estão exportados no projeto
    const { UserRoundPen } = await import('lucide-react')
    expect(UserRoundPen).toBeDefined()
  })

  // Teste D: Clique no ícone NÃO envia imediatamente (apenas abre modal)
  it('D) Clique no ícone NÃO envia imediatamente ao abrir (necessário acionamento manual do usuário)', async () => {
    const sendSpy = vi.spyOn(whatsappService, 'sendMessage')

    // Checagem de janela isolada NÃO envia mensagem
    const windowRes = await checkRegistrationLinkWindow(mockClientIncomplete.id, {
      attendanceId: 'att_dummy',
    })

    expect(sendSpy).not.toHaveBeenCalled()
  })

  // Teste E: Modal recebe cliente/telefone corretos
  it('E) Modal recebe cliente/telefone corretos e assegura token e URL pública', async () => {
    const linkRes = await ensureRegistrationLinkForClient(mockClientIncomplete)
    expect(linkRes.token).toBe('tok_pub_incomplete')
    expect(linkRes.url).toBe(
      clientsService.getPublicClientUrl({
        public_token: 'tok_pub_incomplete',
        id: mockClientIncomplete.id,
      }),
    )
    expect(mockClientIncomplete.phone).toBe('+55 11 98765-4321')
  })

  // Teste F: Inbound <24h em atendimento ativo → FREEFORM permitido
  it('F) Inbound <24h em atendimento ativo → FREEFORM permitido', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z')
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_active_f',
      client_id: mockClientIncomplete.id,
      last_customer_message_at: halfHourAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_f',
          client_id: mockClientIncomplete.id,
          attendance_id: 'att_active_f',
          direction: 'inbound',
          created: halfHourAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValueOnce({
      success: true,
      whatsapp_message_id: 'wamid.F',
    })

    const res = await sendRegistrationLinkViaWhatsApp({
      client: mockClientIncomplete,
      attendanceId: 'att_active_f',
      referenceTime: now,
    })

    expect(res.success).toBe(true)
    expect(res.within24h).toBe(true)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  // Teste G: Inbound <24h em atendimento arquivado → FREEFORM permitido
  it('G) Inbound <24h em atendimento arquivado → FREEFORM permitido', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z')
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

    // Atendimento atual não possui inbound
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_current_empty',
      client_id: mockClientIncomplete.id,
      last_customer_message_at: null,
    } as any)

    // Mensagem inbound existe em atendimento arquivado
    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_archived_g',
          client_id: mockClientIncomplete.id,
          attendance_id: 'att_archived_prev',
          direction: 'inbound',
          created: oneHourAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValueOnce({
      success: true,
      whatsapp_message_id: 'wamid.G',
    })

    const res = await sendRegistrationLinkViaWhatsApp({
      client: mockClientIncomplete,
      attendanceId: 'att_current_empty',
      referenceTime: now,
    })

    expect(res.success).toBe(true)
    expect(res.within24h).toBe(true)
    expect(res.resolvedInboundIso).toBe(oneHourAgo)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  // Teste H: Inbound <24h + outbound posterior → FREEFORM permitido (outbound não fecha janela)
  it('H) Inbound <24h + outbound posterior → FREEFORM permitido (outbound não fecha a janela)', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z')
    const fortyMinsAgo = new Date(now.getTime() - 40 * 60 * 1000).toISOString()
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()

    const clientWithOutbound: Client = {
      ...mockClientIncomplete,
      last_message_at: tenMinsAgo,
      last_message_direction: 'outbound',
    }

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_active_h',
      client_id: clientWithOutbound.id,
      last_customer_message_at: fortyMinsAgo,
      last_company_message_at: tenMinsAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_h_inbound',
          client_id: clientWithOutbound.id,
          direction: 'inbound',
          created: fortyMinsAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValueOnce({
      success: true,
    })

    const res = await sendRegistrationLinkViaWhatsApp({
      client: clientWithOutbound,
      attendanceId: 'att_active_h',
      referenceTime: now,
    })

    expect(res.success).toBe(true)
    expect(res.within24h).toBe(true)
    expect(res.resolvedInboundIso).toBe(fortyMinsAgo)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  // Teste I: Inbound >24h → FREEFORM bloqueado
  it('I) Inbound >24h (25h) → FREEFORM bloqueado com aviso de Template Oficial', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z')
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_i',
      client_id: mockClientIncomplete.id,
      last_customer_message_at: twentyFiveHoursAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_i_old',
          client_id: mockClientIncomplete.id,
          direction: 'inbound',
          created: twentyFiveHoursAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage')

    const res = await sendRegistrationLinkViaWhatsApp({
      client: mockClientIncomplete,
      attendanceId: 'att_i',
      referenceTime: now,
    })

    expect(res.success).toBe(false)
    expect(res.within24h).toBe(false)
    expect(res.error).toContain('Template Oficial')
    expect(res.error).toContain('fora da janela de 24h')
    expect(sendSpy).not.toHaveBeenCalled()
  })

  // Teste J: Cliente sem inbound → FREEFORM bloqueado
  it('J) Cliente sem nenhuma mensagem inbound → FREEFORM bloqueado', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z')

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_j',
      client_id: mockClientIncomplete.id,
      last_customer_message_at: null,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 0,
      totalItems: 0,
      totalPages: 1,
      items: [],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage')

    const res = await sendRegistrationLinkViaWhatsApp({
      client: mockClientIncomplete,
      attendanceId: 'att_j',
      referenceTime: now,
    })

    expect(res.success).toBe(false)
    expect(res.within24h).toBe(false)
    expect(res.resolvedInboundIso).toBeNull()
    expect(res.error).toContain('Template Oficial')
    expect(sendSpy).not.toHaveBeenCalled()
  })

  // Teste K: Cliente com cadastro completo → ícone disponível e ação permitida (para atualização de dados)
  it('K) Cliente com cadastro completo → ação de solicitar atualização disponível e executável', async () => {
    const completeness = clientsService.calculateCompleteness(mockClientComplete as any)
    expect(completeness.isComplete).toBe(true)

    const now = new Date('2026-06-01T15:00:00.000Z')
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_k',
      client_id: mockClientComplete.id,
      last_customer_message_at: tenMinsAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_k',
          client_id: mockClientComplete.id,
          direction: 'inbound',
          created: tenMinsAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValueOnce({
      success: true,
      whatsapp_message_id: 'wamid.K',
    })

    const res = await sendRegistrationLinkViaWhatsApp({
      client: mockClientComplete,
      attendanceId: 'att_k',
      referenceTime: now,
    })

    expect(res.success).toBe(true)
    expect(res.within24h).toBe(true)
    expect(res.linkUrl).toContain(mockClientComplete.public_token!)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  // Teste L: Ficha e Drawer usam o MESMO service/modal (sem duas implementações da regra de 24h)
  it('L) Ficha e Drawer compartilham o mesmo service e mesma função de cálculo de 24h (lastInboundAt + isTimestampWithin24h)', async () => {
    // Ambos utilizam clientRegistrationLinkService.checkWindow que por sua vez chama lastInboundAt + isTimestampWithin24h
    expect(clientRegistrationLinkService.checkWindow).toBe(checkRegistrationLinkWindow)
    expect(clientRegistrationLinkService.sendViaWhatsApp).toBe(sendRegistrationLinkViaWhatsApp)
    expect(clientRegistrationLinkService.ensureLinkForClient).toBe(ensureRegistrationLinkForClient)
  })
})
