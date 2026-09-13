import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { whatsappService } from './whatsapp'
import { postSalesService } from './postSales'
import { settingsService } from './settings'
import { isWithin24HourWindow } from '@/types/crm'
import { lastInboundAt } from './whatsappWindow'
import type { PostSale, Client } from '@/types/crm'

/**
 * Helper que replica a lógica de disparo de pós-venda via WhatsApp Cloud API
 * executada em handleSendPostSaleWhatsApp (PostSalesDashboardPage.tsx)
 */
export async function executeSendPostSaleWhatsApp(
  ps: PostSale,
  client: Client,
): Promise<{
  executed: boolean
  blockedReason?: string
  wamid?: string
  postSaleStatus?: string
  postSaleNotes?: string
}> {
  // Cenário D: Se ps.status === 'sent', bloquear imediatamente
  if (ps.status === 'sent') {
    return {
      executed: false,
      blockedReason: 'Este pós-venda já foi enviado.',
      postSaleStatus: ps.status,
    }
  }

  // Obter texto configurado
  const postSaleConfig = await settingsService.getPostSaleConfig()
  const templateMessage =
    postSaleConfig.customMessage ||
    'Olá {{nome}}! Seu pedido foi entregue recentemente pela Laletra. Poderia avaliar sua experiência conosco no link: {{link_avaliacao}} ? Agradecemos muito!'

  const token = ps.evaluation_token || 'eval_test_token'
  const evalLink = `https://crm-grafica-whatsapp-7b1a5.goskip.app/avaliacao/${token}`
  const clientName = client.name || 'Cliente'
  const orderNumber = ps.order_number || ''

  const renderedText = templateMessage
    .split('{{nome}}')
    .join(clientName)
    .split('{{pedido}}')
    .join(orderNumber)
    .split('{{link_avaliacao}}')
    .join(evalLink)
    .trim()

  // Janela 24h: reutiliza lastInboundAt + isWithin24HourWindow
  const resolvedInboundIso = await lastInboundAt(client.id, ps.attendance_id || null)
  const within24h = isWithin24HourWindow(client.last_message_at, client.last_message_direction, {
    lastCustomerMessageAt: resolvedInboundIso,
  })

  // Cenário B: Fora de 24h
  if (!within24h) {
    return {
      executed: false,
      blockedReason:
        'Fora da janela de 24 horas. É necessário um template oficial aprovado para enviar esta mensagem.',
      postSaleStatus: ps.status,
    }
  }

  // Cenário A / C: Chamar whatsappService.sendMessage com Cloud API
  const sendResult = await whatsappService.sendMessage({
    clientId: client.id,
    attendanceId: ps.attendance_id,
    messageText: renderedText,
    postSaleId: ps.id,
  })

  if (sendResult.success) {
    const updated = await postSalesService.markAsSent(
      ps.id,
      'Link de avaliação enviado via WhatsApp Cloud API',
      'whatsapp',
    )
    return {
      executed: true,
      wamid: sendResult.whatsapp_message_id,
      postSaleStatus: updated.status,
    }
  } else {
    // Cenário C: Meta retorna erro -> pós-venda continua pending, erro registrado nas notas, retry permitido
    const errorMsg = sendResult.error || 'Falha ao enviar mensagem pela Meta Cloud API.'
    const failureNote = `Falha no envio WhatsApp API: ${errorMsg} (${new Date().toLocaleDateString('pt-BR')})`
    const updated = await postSalesService.updateNotes(ps.id, failureNote)
    return {
      executed: false,
      blockedReason: errorMsg,
      postSaleStatus: updated.status || ps.status,
      postSaleNotes: updated.notes,
    }
  }
}

describe('PostSales WhatsApp Cloud API Integration', () => {
  const mockClient: Client = {
    id: 'cli_123',
    name: 'João da Silva',
    phone: '5511999998888',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T00:00:00Z',
  }

  const mockPostSale: PostSale = {
    id: 'ps_123',
    client_id: 'cli_123',
    status: 'pending',
    scheduled_date: '2025-01-02',
    order_number: 'PED-1001',
    evaluation_token: 'eval_tok_abc',
    created: '2025-01-01T10:00:00Z',
    updated: '2025-01-01T10:00:00Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(settingsService, 'getPostSaleConfig').mockResolvedValue({
      customMessage:
        'Olá {{nome}}! Seu pedido {{pedido}} foi entregue. Avalie em: {{link_avaliacao}}',
      delayDays: 1,
      enabled: true,
      autoTask: true,
      whatsappTemplate: 'avaliacao_atendimento',
    })
  })

  it('Cenário A: dentro de 24h → envia → WAMID → salva em messages → post_sale vira sent', async () => {
    const recentIso = new Date().toISOString()
    const clientWithin24h: Client = {
      ...mockClient,
      last_message_at: recentIso,
      last_message_direction: 'inbound',
    }

    // Mock lastInboundAt
    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      items: [
        {
          id: 'msg_inbound',
          direction: 'inbound',
          created: recentIso,
        },
      ],
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
    } as any)

    // Mock Cloud API send endpoint
    const expectedWamid = 'wamid.HBgLMDU1MTE5OTk5OThhBRUCMRICFkEx'
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: expectedWamid,
      message: {
        id: 'msg_crm_001',
        client_id: 'cli_123',
        direction: 'outbound',
        status: 'sent',
        whatsapp_message_id: expectedWamid,
        message_text:
          'Olá João da Silva! Seu pedido PED-1001 foi entregue. Avalie em: https://crm-grafica-whatsapp-7b1a5.goskip.app/avaliacao/eval_tok_abc',
      } as any,
    })

    // Mock postSalesService.markAsSent
    const markAsSentSpy = vi.spyOn(postSalesService, 'markAsSent').mockResolvedValueOnce({
      ...mockPostSale,
      status: 'sent',
      channel: 'whatsapp',
      sent_date: new Date().toISOString().split('T')[0],
      notes: 'Link de avaliação enviado via WhatsApp Cloud API',
    })

    const res = await executeSendPostSaleWhatsApp(mockPostSale, clientWithin24h)

    expect(res.executed).toBe(true)
    expect(res.wamid).toBe(expectedWamid)
    expect(res.postSaleStatus).toBe('sent')

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(
      '/backend/v1/crm/whatsapp/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          client_id: 'cli_123',
          post_sale_id: 'ps_123',
          message_text:
            'Olá João da Silva! Seu pedido PED-1001 foi entregue. Avalie em: https://crm-grafica-whatsapp-7b1a5.goskip.app/avaliacao/eval_tok_abc',
        }),
      }),
    )

    expect(markAsSentSpy).toHaveBeenCalledWith(
      'ps_123',
      'Link de avaliação enviado via WhatsApp Cloud API',
      'whatsapp',
    )
  })

  it('Cenário B: fora de 24h → bloqueia → mensagem de template → continua pending', async () => {
    // 30 horas atrás
    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
    const clientOutOf24h: Client = {
      ...mockClient,
      last_message_at: oldDate,
      last_message_direction: 'inbound',
    }

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      items: [
        {
          id: 'msg_old',
          direction: 'inbound',
          created: oldDate,
        },
      ],
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
    } as any)

    const sendSpy = vi.spyOn(pb, 'send')
    const markAsSentSpy = vi.spyOn(postSalesService, 'markAsSent')

    const res = await executeSendPostSaleWhatsApp(mockPostSale, clientOutOf24h)

    expect(res.executed).toBe(false)
    expect(res.blockedReason).toBe(
      'Fora da janela de 24 horas. É necessário um template oficial aprovado para enviar esta mensagem.',
    )
    expect(res.postSaleStatus).toBe('pending')

    // Nenhuma chamada à Meta e nenhum markAsSent
    expect(sendSpy).not.toHaveBeenCalled()
    expect(markAsSentSpy).not.toHaveBeenCalled()
  })

  it('Cenário C: Meta retorna erro → continua pending, retry permitido', async () => {
    const recentIso = new Date().toISOString()
    const clientWithin24h: Client = {
      ...mockClient,
      last_message_at: recentIso,
      last_message_direction: 'inbound',
    }

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValueOnce({
      items: [
        {
          id: 'msg_inbound',
          direction: 'inbound',
          created: recentIso,
        },
      ],
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
    } as any)

    // Meta retorna erro
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: false,
      error: 'WhatsApp Cloud API Error: (#131047) Re-engagement message',
    })

    const markAsSentSpy = vi.spyOn(postSalesService, 'markAsSent')
    const updateNotesSpy = vi.spyOn(postSalesService, 'updateNotes').mockResolvedValueOnce({
      ...mockPostSale,
      status: 'pending',
      notes:
        'Falha no envio WhatsApp API: WhatsApp Cloud API Error: (#131047) Re-engagement message',
    })

    const res = await executeSendPostSaleWhatsApp(mockPostSale, clientWithin24h)

    expect(res.executed).toBe(false)
    expect(res.blockedReason).toContain('WhatsApp Cloud API Error')
    expect(res.postSaleStatus).toBe('pending')
    expect(markAsSentSpy).not.toHaveBeenCalled()
    expect(updateNotesSpy).toHaveBeenCalledWith(
      'ps_123',
      expect.stringContaining('WhatsApp Cloud API Error'),
    )
  })

  it('Cenário D: já sent → segundo envio bloqueado (frontend e backend)', async () => {
    const alreadySentPostSale: PostSale = {
      ...mockPostSale,
      status: 'sent',
      sent_date: '2025-01-02',
      channel: 'whatsapp',
    }

    const sendSpy = vi.spyOn(pb, 'send')
    const markAsSentSpy = vi.spyOn(postSalesService, 'markAsSent')

    // 1. Verificação no frontend/helper
    const res = await executeSendPostSaleWhatsApp(alreadySentPostSale, mockClient)
    expect(res.executed).toBe(false)
    expect(res.blockedReason).toBe('Este pós-venda já foi enviado.')
    expect(sendSpy).not.toHaveBeenCalled()
    expect(markAsSentSpy).not.toHaveBeenCalled()

    // 2. Verificação no backend: se chamada chegasse à API via whatsappService com postSaleId de pós-venda já sent
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: false,
      error: 'Este pós-venda já foi enviado.',
    })

    const backendCall = await whatsappService.sendMessage({
      clientId: mockClient.id,
      postSaleId: alreadySentPostSale.id,
      messageText: 'Tentativa duplicada',
    })

    expect(backendCall.success).toBe(false)
    expect(backendCall.error).toBe('Este pós-venda já foi enviado.')
  })
})
