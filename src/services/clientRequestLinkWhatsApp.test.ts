import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { whatsappService } from './whatsapp'
import { clientsService } from './clients'
import { lastInboundAt, isTimestampWithin24h } from './whatsappWindow'
import type { Client } from '@/types/crm'

/**
 * Função de teste que replica com exatidão o fluxo de envio do link
 * de Solicitar Cadastro via WhatsApp de ClientFormModal.tsx:
 * 1. Resolve url pública do cadastro (clientsService.getPublicClientUrl);
 * 2. Verifica a janela de 24h usando a REGRA GLOBAL COMPLETA:
 *    lastInboundAt(clientId, attendanceId?, options?) + isTimestampWithin24h(resolvedInbound);
 * 3. Se fora de 24h: bloqueia o envio freeform e retorna aviso de Template Oficial;
 * 4. Se dentro de 24h: envia a mensagem freeform com whatsappService.sendMessage;
 * 5. Não altera banco/migrations e não faz chamadas reais externas.
 */
export async function executeSendRequestLinkWhatsApp(params: {
  client: Client
  attendanceId?: string | null
  activeAttendanceLastCustomerMessageAt?: string | null
  messageDraft?: string
  referenceTime?: string | number | Date
}): Promise<{
  allowed: boolean
  sent: boolean
  blockedReason?: string
  resolvedInboundIso?: string | null
  payloadSent?: any
}> {
  const {
    client,
    attendanceId,
    activeAttendanceLastCustomerMessageAt,
    messageDraft,
    referenceTime,
  } = params

  const token = client.public_token || 'test_token_123'
  const url = clientsService.getPublicClientUrl({ public_token: token, id: client.id })
  if (!url) {
    return {
      allowed: false,
      sent: false,
      blockedReason: 'Link de cadastro não gerado',
    }
  }

  // 1. Verificação da regra GLOBAL da janela Meta
  const resolvedInboundIso = await lastInboundAt(client.id, attendanceId || null, {
    attendanceLastCustomerMessageAt:
      activeAttendanceLastCustomerMessageAt || (client as any).last_customer_message_at || null,
  })

  const within24h = isTimestampWithin24h(resolvedInboundIso, referenceTime)

  if (!within24h) {
    return {
      allowed: false,
      sent: false,
      resolvedInboundIso,
      blockedReason:
        'Não é possível enviar mensagem livre fora da janela de 24h. Utilize um Template Oficial aprovado pela Meta para iniciar uma nova conversa.',
    }
  }

  // 2. Dentro das 24h: envio freeform
  const defaultText = `Olá! Para mantermos seu cadastro atualizado, por favor preencha seus dados neste link:\n\n${url}\n\nÉ rapidinho e ajuda a agilizar seus próximos pedidos.`
  const textToSend = messageDraft?.trim() || defaultText

  const res = await whatsappService.sendMessage({
    clientId: client.id,
    attendanceId: attendanceId || undefined,
    messageText: textToSend,
  })

  return {
    allowed: true,
    sent: Boolean(res.success),
    resolvedInboundIso,
    payloadSent: {
      clientId: client.id,
      attendanceId: attendanceId || undefined,
      messageText: textToSend,
    },
  }
}

describe('Solicitar Cadastro — Validação da Janela de 24h Meta e Envio Freeform', () => {
  const mockClient: Client = {
    id: 'cli_solicitar_123',
    name: 'Gráfica Cliente Teste',
    phone: '+55 11 98765-4321',
    public_token: 'tok_pub_abc123',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T00:00:00Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // A) Inbound há 20 min em atendimento ativo → freeform permitido
  it('Cenário A: inbound há 20 min em atendimento ativo → freeform permitido', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString()

    // Atendimento ativo com inbound de 20 min atrás
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_active',
      client_id: mockClient.id,
      last_customer_message_at: twentyMinsAgo,
      is_archived: false,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_recent_active',
          client_id: mockClient.id,
          attendance_id: 'att_active',
          direction: 'inbound',
          created: twentyMinsAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValueOnce({
      success: true,
      whatsapp_message_id: 'wamid.HBgLMDU1MTE5ODc2NTQzMjEFUAMR',
    })

    const res = await executeSendRequestLinkWhatsApp({
      client: mockClient,
      attendanceId: 'att_active',
      activeAttendanceLastCustomerMessageAt: twentyMinsAgo,
      referenceTime: now,
    })

    expect(res.allowed).toBe(true)
    expect(res.sent).toBe(true)
    expect(res.resolvedInboundIso).toBe(twentyMinsAgo)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: mockClient.id,
        attendanceId: 'att_active',
        messageText: expect.stringContaining(
          'https://crm-grafica-whatsapp-7b1a5.goskip.app/cadastro/tok_pub_abc123',
        ),
      }),
    )
  })

  // B) Inbound há 20 min em atendimento ARQUIVADO → freeform permitido
  it('Cenário B: inbound há 20 min em atendimento ARQUIVADO → freeform permitido', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString()

    // Atendimento atual não possui inbound
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_new_empty',
      client_id: mockClient.id,
      last_customer_message_at: null,
    } as any)

    // Collection messages possui inbound de 20 min atrás de um atendimento arquivado
    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_archived_inbound',
          client_id: mockClient.id,
          attendance_id: 'att_archived_old',
          direction: 'inbound',
          created: twentyMinsAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValueOnce({
      success: true,
      whatsapp_message_id: 'wamid.HBgLMDU1MTE5ODc2NTQzMjEFUAMR_ARCHIVED',
    })

    const res = await executeSendRequestLinkWhatsApp({
      client: mockClient,
      attendanceId: 'att_new_empty',
      activeAttendanceLastCustomerMessageAt: null,
      referenceTime: now,
    })

    expect(res.allowed).toBe(true)
    expect(res.sent).toBe(true)
    expect(res.resolvedInboundIso).toBe(twentyMinsAgo)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  // C) Inbound há 20 min + outbound da gráfica há 5 min → freeform permitido (outbound não fecha a janela)
  it('Cenário C: inbound há 20 min + outbound há 5 min → freeform permitido', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString()
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

    const clientWithOutbound: Client = {
      ...mockClient,
      last_message_at: fiveMinsAgo,
      last_message_direction: 'outbound',
    }

    // Attendance tem last_customer_message_at de 20 min atrás
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_active',
      client_id: clientWithOutbound.id,
      last_customer_message_at: twentyMinsAgo,
      last_company_message_at: fiveMinsAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_inbound_20m',
          client_id: clientWithOutbound.id,
          direction: 'inbound',
          created: twentyMinsAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValueOnce({
      success: true,
    })

    const res = await executeSendRequestLinkWhatsApp({
      client: clientWithOutbound,
      attendanceId: 'att_active',
      activeAttendanceLastCustomerMessageAt: twentyMinsAgo,
      referenceTime: now,
    })

    expect(res.allowed).toBe(true)
    expect(res.sent).toBe(true)
    expect(res.resolvedInboundIso).toBe(twentyMinsAgo)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  // D) Última inbound > 24h → bloqueado + aviso de template oficial
  it('Cenário D: última inbound > 24h (26h) → bloqueado + aviso de template', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const twentySixHoursAgo = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_expired',
      client_id: mockClient.id,
      last_customer_message_at: twentySixHoursAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_expired',
          client_id: mockClient.id,
          direction: 'inbound',
          created: twentySixHoursAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage')

    const res = await executeSendRequestLinkWhatsApp({
      client: mockClient,
      attendanceId: 'att_expired',
      activeAttendanceLastCustomerMessageAt: twentySixHoursAgo,
      referenceTime: now,
    })

    expect(res.allowed).toBe(false)
    expect(res.sent).toBe(false)
    expect(res.blockedReason).toContain('Template Oficial')
    expect(res.blockedReason).toContain('fora da janela de 24h')
    expect(sendSpy).not.toHaveBeenCalled()
  })

  // E) Nenhuma inbound → bloqueado
  it('Cenário E: nenhuma inbound existente → bloqueado', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_no_msg',
      client_id: mockClient.id,
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

    const res = await executeSendRequestLinkWhatsApp({
      client: mockClient,
      attendanceId: 'att_no_msg',
      activeAttendanceLastCustomerMessageAt: null,
      referenceTime: now,
    })

    expect(res.allowed).toBe(false)
    expect(res.sent).toBe(false)
    expect(res.resolvedInboundIso).toBeNull()
    expect(res.blockedReason).toContain('Template Oficial')
    expect(sendSpy).not.toHaveBeenCalled()
  })

  // F) lastInboundAt considera messages, não só o attendance atual
  it('Cenário F: lastInboundAt busca na collection messages além do attendance atual', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()

    // O attendance atual tem inbound de 5 horas atrás
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValueOnce({
      id: 'att_current',
      client_id: mockClient.id,
      last_customer_message_at: fiveHoursAgo,
    } as any)

    // A collection messages tem uma mensagem inbound mais recente de 10 min atrás
    const messagesGetListSpy = vi
      .spyOn(pb.collection('messages'), 'getList')
      .mockResolvedValueOnce({
        page: 1,
        perPage: 1,
        totalItems: 1,
        totalPages: 1,
        items: [
          {
            id: 'msg_from_another_att',
            client_id: mockClient.id,
            attendance_id: 'att_other',
            direction: 'inbound',
            created: tenMinsAgo,
          },
        ],
      } as any)

    const resolvedIso = await lastInboundAt(mockClient.id, 'att_current')

    // Deve ter chamado a collection messages sem filtrar por attendance_id
    expect(messagesGetListSpy).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({
        filter: `client_id = "${mockClient.id}" && direction = "inbound"`,
        sort: '-created',
      }),
    )

    // Deve selecionar o timestamp mais recente (10 min vs 5 horas -> 10 min)
    expect(resolvedIso).toBe(tenMinsAgo)
    expect(isTimestampWithin24h(resolvedIso, now)).toBe(true)
  })
})
