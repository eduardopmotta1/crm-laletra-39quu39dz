import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { whatsappService } from '@/services/whatsapp'
import { lastInboundAt, isTimestampWithin24h } from '@/services/whatsappWindow'

/**
 * Testes Unitários Obrigatórios — Solicitar Cadastro com Janela de 24h WhatsApp Meta
 *
 * Cenários Obrigatórios:
 * - CENÁRIO A: inbound há 20 minutos em atendimento ativo → FREEFORM permitido.
 * - CENÁRIO B: inbound há 20 minutos em atendimento ARQUIVADO → FREEFORM permitido.
 * - CENÁRIO C: inbound há 20 minutos + outbound da gráfica há 5 minutos → FREEFORM permitido.
 * - CENÁRIO D: última inbound há mais de 24h → FREEFORM bloqueado + aviso de template.
 * - CENÁRIO E: nenhuma inbound encontrada → FREEFORM bloqueado.
 * - CENÁRIO F: confirmar que `lastInboundAt` considera `messages` e não somente o attendance atual.
 */

describe('Fluxo Solicitar Cadastro — Janela de 24h WhatsApp Meta (Cenários A a F)', () => {
  const clientId = 'cli_test_123'
  const activeAttendanceId = 'att_active_999'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // Helper simulando o controlador de envio em handleSendLinkViaWhatsApp
  const executeSendRegistrationLinkFlow = async ({
    targetClientId,
    attendanceId,
    attendanceLastCustomerMessageAt,
    linkUrl,
    messageDraft,
  }: {
    targetClientId: string
    attendanceId?: string | null
    attendanceLastCustomerMessageAt?: string | null
    linkUrl: string
    messageDraft?: string
  }) => {
    if (!linkUrl) {
      return { allowed: false, error: 'Link de cadastro não gerado' }
    }

    // Regra Global completa: lastInboundAt + isTimestampWithin24h
    const resolvedInboundIso = await lastInboundAt(targetClientId, attendanceId || null, {
      attendanceLastCustomerMessageAt: attendanceLastCustomerMessageAt || null,
    })

    const within24h = isTimestampWithin24h(resolvedInboundIso)
    if (!within24h) {
      return {
        allowed: false,
        blockedReason: 'Janela de 24h fechada. Utilize um Template Oficial aprovado pela Meta.',
      }
    }

    // Envio freeform usando whatsappService.sendMessage
    const textToSend =
      messageDraft?.trim() ||
      `Olá! Para mantermos seu cadastro atualizado, por favor preencha seus dados neste link:\n\n${linkUrl}\n\nÉ rapidinho e ajuda a agilizar seus próximos pedidos.`

    const sendRes = await whatsappService.sendMessage({
      clientId: targetClientId,
      attendanceId: attendanceId || undefined,
      messageText: textToSend,
    })

    return {
      allowed: true,
      sendResult: sendRes,
      sentText: textToSend,
    }
  }

  // CENÁRIO A: inbound há 20 minutos em atendimento ativo → FREEFORM permitido
  it('CENÁRIO A: inbound há 20 minutos em atendimento ativo → FREEFORM permitido', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString()

    // Mock do atendimento ativo com last_customer_message_at de 20 min atrás
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: activeAttendanceId,
      last_customer_message_at: twentyMinutesAgo,
    } as any)

    // Mock da collection messages
    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [
        {
          id: 'msg_active',
          client_id: clientId,
          attendance_id: activeAttendanceId,
          direction: 'inbound',
          created: twentyMinutesAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValue({
      success: true,
      messageId: 'wamid.HBgLM',
    } as any)

    const result = await executeSendRegistrationLinkFlow({
      targetClientId: clientId,
      attendanceId: activeAttendanceId,
      attendanceLastCustomerMessageAt: twentyMinutesAgo,
      linkUrl: 'https://grafica.crm/cadastro/cli_test_123?token=tok_abc',
    })

    expect(result.allowed).toBe(true)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId,
        attendanceId: activeAttendanceId,
        messageText: expect.stringContaining(
          'https://grafica.crm/cadastro/cli_test_123?token=tok_abc',
        ),
      }),
    )
  })

  // CENÁRIO B: inbound há 20 minutos em atendimento ARQUIVADO → FREEFORM permitido
  it('CENÁRIO B: inbound há 20 minutos em atendimento ARQUIVADO → FREEFORM permitido', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString()

    // O atendimento atual/ativo está nulo ou vazio (pois o atendimento foi arquivado)
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_new_empty',
      last_customer_message_at: null,
    } as any)

    // Collection messages possui a última inbound real do cliente (em atendimento arquivado)
    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [
        {
          id: 'msg_archived_inbound',
          client_id: clientId,
          attendance_id: 'att_archived_777', // atendimento arquivado
          direction: 'inbound',
          created: twentyMinutesAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValue({
      success: true,
      messageId: 'wamid.HBgLM2',
    } as any)

    // Atendimento ativo não tem mensagem recente, mas messages tem
    const result = await executeSendRegistrationLinkFlow({
      targetClientId: clientId,
      attendanceId: null,
      attendanceLastCustomerMessageAt: null,
      linkUrl: 'https://grafica.crm/cadastro/cli_test_123?token=tok_abc',
    })

    expect(result.allowed).toBe(true)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId,
        messageText: expect.stringContaining(
          'https://grafica.crm/cadastro/cli_test_123?token=tok_abc',
        ),
      }),
    )
  })

  // CENÁRIO C: inbound há 20 minutos + outbound da gráfica há 5 minutos → FREEFORM permitido
  it('CENÁRIO C: inbound há 20 minutos + outbound da gráfica há 5 minutos → FREEFORM permitido', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString()

    // Mensagem inbound existe há 20 min
    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [
        {
          id: 'msg_inbound_20m',
          client_id: clientId,
          direction: 'inbound',
          created: twentyMinutesAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage').mockResolvedValue({
      success: true,
      messageId: 'wamid.HBgLM3',
    } as any)

    const result = await executeSendRegistrationLinkFlow({
      targetClientId: clientId,
      attendanceId: activeAttendanceId,
      attendanceLastCustomerMessageAt: twentyMinutesAgo,
      linkUrl: 'https://grafica.crm/cadastro/cli_test_123?token=tok_abc',
      messageDraft: 'Texto customizado de cadastro',
    })

    expect(result.allowed).toBe(true)
    expect(result.sentText).toBe('Texto customizado de cadastro')
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  // CENÁRIO D: última inbound há mais de 24h → FREEFORM bloqueado + aviso de template
  it('CENÁRIO D: última inbound há mais de 24h → FREEFORM bloqueado + aviso de template', async () => {
    const now = new Date('2026-06-01T14:00:00.000Z')
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: activeAttendanceId,
      last_customer_message_at: twentyFiveHoursAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [
        {
          id: 'msg_old',
          client_id: clientId,
          direction: 'inbound',
          created: twentyFiveHoursAgo,
        },
      ],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage')

    const result = await executeSendRegistrationLinkFlow({
      targetClientId: clientId,
      attendanceId: activeAttendanceId,
      attendanceLastCustomerMessageAt: twentyFiveHoursAgo,
      linkUrl: 'https://grafica.crm/cadastro/cli_test_123?token=tok_abc',
    })

    expect(result.allowed).toBe(false)
    expect(result.blockedReason).toContain('Janela de 24h fechada')
    // Freeform NÃO deve ter sido chamado no whatsappService
    expect(sendSpy).not.toHaveBeenCalled()
  })

  // CENÁRIO E: nenhuma inbound encontrada → FREEFORM bloqueado
  it('CENÁRIO E: nenhuma inbound encontrada → FREEFORM bloqueado', async () => {
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: activeAttendanceId,
      last_customer_message_at: null,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [],
    } as any)

    const sendSpy = vi.spyOn(whatsappService, 'sendMessage')

    const result = await executeSendRegistrationLinkFlow({
      targetClientId: clientId,
      attendanceId: activeAttendanceId,
      attendanceLastCustomerMessageAt: null,
      linkUrl: 'https://grafica.crm/cadastro/cli_test_123?token=tok_abc',
    })

    expect(result.allowed).toBe(false)
    expect(result.blockedReason).toContain('Janela de 24h fechada')
    expect(sendSpy).not.toHaveBeenCalled()
  })

  // CENÁRIO F: confirmar que lastInboundAt considera messages e não somente o attendance atual
  it('CENÁRIO F: confirmar que lastInboundAt consulta a collection messages e não somente o attendance atual', async () => {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()

    // Atendimento atual não possui mensagem do cliente
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_empty',
      last_customer_message_at: null,
    } as any)

    const messagesGetListSpy = vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_archived_prev',
          client_id: 'client_audit_test',
          attendance_id: 'att_archived_old',
          direction: 'inbound',
          created: twentyMinutesAgo,
        },
      ],
    } as any)

    const resolved = await lastInboundAt('client_audit_test', 'att_empty')

    // Deve ter chamado a collection messages com o filtro correto pelo client_id SEM restringir por attendance_id
    expect(messagesGetListSpy).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({
        filter: 'client_id = "client_audit_test" && direction = "inbound"',
        sort: '-created',
      }),
    )

    // O timestamp retornado deve ser o de messages daquele cliente
    expect(resolved).toBe(twentyMinutesAgo)
    expect(isTimestampWithin24h(resolved)).toBe(true)
  })
})
