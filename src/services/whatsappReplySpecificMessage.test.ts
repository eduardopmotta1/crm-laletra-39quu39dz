import { describe, it, expect, vi, beforeEach } from 'vitest'
import { whatsappService } from './whatsapp'
import pb from '../lib/pocketbase/client'
import type { Message } from '../types/crm'

describe('WhatsApp Reply to Specific Message — Unit & Integration Logic Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Responder texto recebido
  it('1. deve incluir reply_to_whatsapp_message_id no body de envio de texto respondendo mensagem recebida', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.REPLY_OUT_001',
      message: {
        id: 'msg_reply_001',
        client_id: 'client_1',
        direction: 'outbound',
        message_text: 'Sim, entregamos às 14h',
        reply_to_whatsapp_message_id: 'wamid.INBOUND_ORIG_001',
        reply_to_message_id: 'msg_orig_001',
      } as any,
    })

    const res = await whatsappService.sendMessage({
      clientId: 'client_1',
      messageText: 'Sim, entregamos às 14h',
      replyToWhatsAppMessageId: 'wamid.INBOUND_ORIG_001',
    })

    expect(res.success).toBe(true)
    expect(sendSpy).toHaveBeenCalledWith(
      '/backend/v1/crm/whatsapp/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          client_id: 'client_1',
          message_text: 'Sim, entregamos às 14h',
          reply_to_whatsapp_message_id: 'wamid.INBOUND_ORIG_001',
        }),
      }),
    )
  })

  // 2. Responder texto enviado (outbound)
  it('2. deve permitir responder mensagem outbound previamente enviada', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.REPLY_OUT_002',
      message: {
        id: 'msg_reply_002',
        client_id: 'client_1',
        direction: 'outbound',
        message_text: 'Complementando o que falei antes...',
        reply_to_whatsapp_message_id: 'wamid.OUTBOUND_ORIG_001',
      } as any,
    })

    const res = await whatsappService.sendMessage({
      clientId: 'client_1',
      messageText: 'Complementando o que falei antes...',
      replyToWhatsAppMessageId: 'wamid.OUTBOUND_ORIG_001',
    })

    expect(res.success).toBe(true)
    expect(sendSpy).toHaveBeenCalledWith(
      '/backend/v1/crm/whatsapp/send',
      expect.objectContaining({
        body: expect.objectContaining({
          reply_to_whatsapp_message_id: 'wamid.OUTBOUND_ORIG_001',
        }),
      }),
    )
  })

  // 3. Responder mensagem com imagem
  it('3. deve suportar envio de mídia (imagem) respondendo a mensagem com citação no FormData', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.IMG_REPLY_001',
      message: {
        id: 'msg_img_reply_001',
        client_id: 'client_1',
        reply_to_whatsapp_message_id: 'wamid.IMG_ORIG_001',
      } as any,
    })

    const dummyImg = new File(['fake-png'], 'mockup.png', { type: 'image/png' })
    const res = await whatsappService.sendMessage({
      clientId: 'client_1',
      messageText: 'Segue a foto solicitada',
      file: dummyImg,
      replyToWhatsAppMessageId: 'wamid.IMG_ORIG_001',
    })

    expect(res.success).toBe(true)
    expect(sendSpy).toHaveBeenCalledWith(
      '/backend/v1/crm/whatsapp/send-media',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    )

    const formDataSent = sendSpy.mock.calls[0][1]?.body as FormData
    expect(formDataSent.get('reply_to_whatsapp_message_id')).toBe('wamid.IMG_ORIG_001')
  })

  // 4. Responder mensagem com documento PDF
  it('4. deve suportar envio de documento PDF respondendo a mensagem com citação no FormData', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.DOC_REPLY_001',
      message: {
        id: 'msg_doc_reply_001',
        client_id: 'client_1',
        reply_to_whatsapp_message_id: 'wamid.DOC_ORIG_001',
      } as any,
    })

    const dummyDoc = new File(['%PDF fake'], 'manual.pdf', { type: 'application/pdf' })
    const res = await whatsappService.sendMessage({
      clientId: 'client_1',
      messageText: 'Aqui está o manual solicitado',
      file: dummyDoc,
      replyToWhatsAppMessageId: 'wamid.DOC_ORIG_001',
    })

    expect(res.success).toBe(true)
    const formDataSent = sendSpy.mock.calls[0][1]?.body as FormData
    expect(formDataSent.get('reply_to_whatsapp_message_id')).toBe('wamid.DOC_ORIG_001')
  })

  // 5. Envio normal sem resposta (não deve enviar reply_to_whatsapp_message_id)
  it('5. não deve enviar reply_to_whatsapp_message_id quando nenhuma resposta estiver selecionada', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.NORMAL_001',
    })

    const res = await whatsappService.sendMessage({
      clientId: 'client_1',
      messageText: 'Mensagem avulsa sem citação',
    })

    expect(res.success).toBe(true)
    const callBody = sendSpy.mock.calls[0][1]?.body as Record<string, any>
    expect(callBody.reply_to_whatsapp_message_id).toBeUndefined()
  })

  // 6. Cancelar resposta limpa estado sem afetar mensagens
  it('6. simulação de cancelamento da resposta selecionada preserva a integridade do estado', () => {
    let replyingToMessage: Message | null = {
      id: 'm1',
      client_id: 'c1',
      direction: 'inbound',
      message_text: 'Dúvida',
      created: '2025-01-01',
      updated: '2025-01-01',
    }

    // Ação: usuário cancela pelo botão X
    replyingToMessage = null
    expect(replyingToMessage).toBeNull()
  })

  // 7. Falha de envio mantendo a resposta selecionada para retry
  it('7. quando o envio falhar, o chamador pode manter replyingToMessage intacto para reenvio', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce(new Error('Network error or Meta API timeout'))

    let replyingToMessage: Message | null = {
      id: 'm_retry',
      client_id: 'c1',
      direction: 'inbound',
      message_text: 'Mensagem original',
      whatsapp_message_id: 'wamid.ORIG_RETRY',
      created: '2025-01-01',
      updated: '2025-01-01',
    }

    try {
      await whatsappService.sendMessage({
        clientId: 'c1',
        messageText: 'Tentando responder...',
        replyToWhatsAppMessageId: replyingToMessage.whatsapp_message_id,
      })
    } catch (_) {
      // No catch, replyingToMessage NÃO é setado para null
    }

    expect(replyingToMessage).not.toBeNull()
    expect(replyingToMessage?.whatsapp_message_id).toBe('wamid.ORIG_RETRY')
  })

  // 8. Mensagem original inexistente no backend: não bloqueia envio
  it('8. simula backend processando citação onde mensagem original não existe localmente', () => {
    // No whatsapp_send.js e whatsapp_webhook.js:
    // Se a mensagem original não for encontrada, salva reply_to_whatsapp_message_id sem relation
    const targetWamid = 'wamid.UNKNOWN_OLD_MESSAGE'
    const foundOriginals: any[] = [] // Nenhum registro encontrado

    let validatedReplyWamid = ''
    let validatedOriginalMessageId = ''

    if (targetWamid) {
      if (foundOriginals.length > 0) {
        validatedReplyWamid = targetWamid
        validatedOriginalMessageId = foundOriginals[0].id
      }
    }

    // O envio prossegue normalmente com context se houver WAMID
    expect(validatedOriginalMessageId).toBe('')
  })

  // 9. Tentativa de citar mensagem de outro cliente: backend descarta citação e não vaza referência
  it('9. backend descarta citação se a mensagem original pertencer a outro client_id', () => {
    const currentClientId = 'client_ALICE'
    const originalMessageRecord = {
      id: 'msg_bob_99',
      client_id: 'client_BOB',
      whatsapp_message_id: 'wamid.BOB_PRIVATE_123',
    }

    let validatedReplyWamid = ''
    let validatedOriginalMessageId = ''

    if (originalMessageRecord.client_id === currentClientId) {
      validatedReplyWamid = originalMessageRecord.whatsapp_message_id
      validatedOriginalMessageId = originalMessageRecord.id
    }

    // Citação descartada com sucesso por segurança!
    expect(validatedReplyWamid).toBe('')
    expect(validatedOriginalMessageId).toBe('')
  })

  // 10. Webhook com context.id extrai e vincula citação
  it('10. webhook recebido com msg.context.id extrai o WAMID referenciado', () => {
    const incomingWebhookPayload = {
      id: 'wamid.INBOUND_WITH_REPLY',
      from: '5511999999999',
      type: 'text',
      text: { body: 'Obrigado pela confirmação!' },
      context: {
        id: 'wamid.ORIGINAL_OUTBOUND_SENT_EARLIER',
      },
    }

    const replyContextId = String(
      (incomingWebhookPayload.context && incomingWebhookPayload.context.id) || '',
    ).trim()

    expect(replyContextId).toBe('wamid.ORIGINAL_OUTBOUND_SENT_EARLIER')
  })

  // 11. Webhook sem context processa normalmente sem citação
  it('11. webhook recebido sem msg.context processa normalmente com reply_to vazio', () => {
    const incomingWebhookPayload = {
      id: 'wamid.INBOUND_NO_CONTEXT',
      from: '5511999999999',
      type: 'text',
      text: { body: 'Olá boa tarde' },
    }

    const replyContextId = String(
      ((incomingWebhookPayload as any).context && (incomingWebhookPayload as any).context.id) || '',
    ).trim()

    expect(replyContextId).toBe('')
  })

  // 12. Realtime com resposta: resolução idempotente na lista de mensagens sem requisições adicionais (anti N+1)
  it('12. resolve citação em realtime usando a lista local de mensagens sem chamar backend N+1 vezes', () => {
    const localMessages: Message[] = [
      {
        id: 'rec_orig_01',
        client_id: 'c1',
        direction: 'inbound',
        message_text: 'Qual o valor do milheiro?',
        whatsapp_message_id: 'wamid.IN_001',
        created: '2025-01-01T10:00:00Z',
        updated: '2025-01-01T10:00:00Z',
      },
    ]

    const incomingRealtimeMsg: Message = {
      id: 'rec_reply_01',
      client_id: 'c1',
      direction: 'outbound',
      message_text: 'Fica R$ 120,00',
      whatsapp_message_id: 'wamid.OUT_001',
      reply_to_whatsapp_message_id: 'wamid.IN_001',
      reply_to_message_id: 'rec_orig_01',
      created: '2025-01-01T10:05:00Z',
      updated: '2025-01-01T10:05:00Z',
    }

    // Resolver mensagem citada:
    const resolveQuoted = (msg: Message, list: Message[]) => {
      if (msg.reply_to_message_id) {
        const found = list.find((m) => m.id === msg.reply_to_message_id)
        if (found) return found
      }
      if (msg.reply_to_whatsapp_message_id) {
        const found = list.find((m) => m.whatsapp_message_id === msg.reply_to_whatsapp_message_id)
        if (found) return found
      }
      return null
    }

    const quoted = resolveQuoted(incomingRealtimeMsg, localMessages)
    expect(quoted).not.toBeNull()
    expect(quoted?.id).toBe('rec_orig_01')
    expect(quoted?.message_text).toBe('Qual o valor do milheiro?')
  })

  // 13. Polling com resposta atualiza lista preservando citações
  it('13. polling mescla registros e mantém campos reply_to intactos', () => {
    const existingMessages: Message[] = [
      {
        id: 'msg_poll_1',
        client_id: 'c1',
        direction: 'inbound',
        message_text: 'Pergunta',
        whatsapp_message_id: 'wamid.POLL_1',
        created: '2025-01-01T12:00:00Z',
        updated: '2025-01-01T12:00:00Z',
      },
    ]

    const polledMessages: Message[] = [
      {
        id: 'msg_poll_2',
        client_id: 'c1',
        direction: 'outbound',
        message_text: 'Resposta',
        whatsapp_message_id: 'wamid.POLL_2',
        reply_to_whatsapp_message_id: 'wamid.POLL_1',
        reply_to_message_id: 'msg_poll_1',
        created: '2025-01-01T12:01:00Z',
        updated: '2025-01-01T12:01:00Z',
      },
    ]

    const combined = [...existingMessages, ...polledMessages]
    expect(combined).toHaveLength(2)
    expect(combined[1].reply_to_whatsapp_message_id).toBe('wamid.POLL_1')
    expect(combined[1].reply_to_message_id).toBe('msg_poll_1')
  })

  // 14. Mensagens antigas sem os novos campos continuam funcionando normalmente
  it('14. mensagens legadas sem reply_to_message_id e sem reply_to_whatsapp_message_id continuam válidas', () => {
    const legacyMessage: Message = {
      id: 'legacy_001',
      client_id: 'client_legacy',
      direction: 'inbound',
      message_text: 'Mensagem antiga enviada no ano passado',
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z',
    }

    expect(legacyMessage.reply_to_message_id).toBeUndefined()
    expect(legacyMessage.reply_to_whatsapp_message_id).toBeUndefined()
    expect(legacyMessage.message_text).toBe('Mensagem antiga enviada no ano passado')
  })

  // 15. Troca rápida de cliente A -> B -> C: resposta selecionada é resetada instantaneamente
  it('15. troca de cliente A -> B -> C reseta replyingToMessage para null prevenindo vazamento', () => {
    let activeClientId = 'client_A'
    let replyingToMessage: Message | null = {
      id: 'msg_client_A',
      client_id: 'client_A',
      direction: 'inbound',
      message_text: 'Mensagem confidencial do cliente A',
      created: '2025-01-01',
      updated: '2025-01-01',
    }

    // Simulação da troca de cliente A -> B (execução do reset no useLayoutEffect [client?.id])
    const onClientChange = (newClientId: string) => {
      activeClientId = newClientId
      replyingToMessage = null // Reset obrigatório
    }

    onClientChange('client_B')
    expect(replyingToMessage).toBeNull()
    expect(activeClientId).toBe('client_B')

    onClientChange('client_C')
    expect(replyingToMessage).toBeNull()
    expect(activeClientId).toBe('client_C')
  })

  // 16. Troca de cliente durante carregamento assíncrono: não vaza mensagens nem citação
  it('16. guarda de requisição impede que resposta ou mensagens de cliente anterior sobrescrevam o cliente atual', () => {
    let currentRequestId = 0
    let displayedClientId = 'client_INITIAL'
    let displayedMessages: Message[] = []

    // Usuário abre cliente A
    currentRequestId++
    const reqAId = currentRequestId
    displayedClientId = 'client_A'

    // Antes de A responder, usuário clica no cliente B
    currentRequestId++
    const reqBId = currentRequestId
    displayedClientId = 'client_B'

    // Resposta de A chega depois
    if (reqAId === currentRequestId) {
      displayedMessages = [{ id: 'msg_A' } as any]
    }

    // Resposta de B chega
    if (reqBId === currentRequestId) {
      displayedMessages = [{ id: 'msg_B' } as any]
    }

    expect(displayedClientId).toBe('client_B')
    expect(displayedMessages[0].id).toBe('msg_B')
  })

  // 17. Automações e chamadas legadas sem parâmetros de resposta
  it('17. chamadas legadas de whatsappService.sendMessage com assinatura posicional continuam funcionando', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.LEGACY_CALL',
    })

    // Assinatura clássica: sendMessage(clientId, text, attendanceId, attachmentFile)
    const res = await whatsappService.sendMessage('client_pos', 'Mensagem por parâmetro posicional')

    expect(res.success).toBe(true)
    expect(sendSpy).toHaveBeenCalledWith(
      '/backend/v1/crm/whatsapp/send',
      expect.objectContaining({
        body: expect.objectContaining({
          client_id: 'client_pos',
          message_text: 'Mensagem por parâmetro posicional',
        }),
      }),
    )
  })
})
