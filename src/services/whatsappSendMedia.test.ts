import { describe, it, expect, vi, beforeEach } from 'vitest'
import { whatsappService } from './whatsapp'
import pb from '../lib/pocketbase/client'

describe('whatsappService.sendMessage with media', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deve chamar /backend/v1/crm/whatsapp/send-media via pb.send com FormData e NÃO criar direto em messages quando houver arquivo', async () => {
    const createSpy = vi.spyOn(pb.collection('messages'), 'create')
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.TEST_MEDIA_123',
      public_url:
        'https://media.example.com/backend/v1/crm/public-whatsapp-media/tok12345678901234567890123456789012',
      message: {
        id: 'msg_123',
        client_id: 'c_test',
        direction: 'outbound',
        status: 'sent',
        whatsapp_message_id: 'wamid.TEST_MEDIA_123',
        file_name: 'arte.png',
        file_type: 'image/png',
        public_media_token: 'tok12345678901234567890123456789012',
      } as any,
    })

    const dummyFile = new File(['dummy content'], 'arte.png', { type: 'image/png' })

    const result = await whatsappService.sendMessage({
      clientId: 'c_test',
      attendanceId: 'att_test',
      messageText: 'Segue a arte aprovada',
      file: dummyFile,
    })

    // 1. pb.collection('messages').create NÃO deve ter sido chamado no frontend
    expect(createSpy).not.toHaveBeenCalled()

    // 2. pb.send DEVE ter sido chamado no endpoint de send-media
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(
      '/backend/v1/crm/whatsapp/send-media',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    )

    // 3. Resultado de sucesso
    expect(result.success).toBe(true)
    expect(result.api_dispatched).toBe(true)
    expect(result.message?.whatsapp_message_id).toBe('wamid.TEST_MEDIA_123')

    const formDataSent = sendSpy.mock.calls[0][1]?.body as FormData
    expect(formDataSent.get('file_type')).toBe('image/png')
    expect(formDataSent.get('file_name')).toBe('arte.png')
  })

  it('deve inferir e corrigir file_type quando File vier com application/octet-stream ou vazio', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.TEST_OCTET_CORRECTED',
      message: {
        id: 'msg_999',
        file_name: 'foto.PNG',
        file_type: 'image/png',
      } as any,
    })

    const octetPngFile = new File(['png-data'], 'foto.PNG', { type: 'application/octet-stream' })

    const result = await whatsappService.sendMessage({
      clientId: 'c_test',
      file: octetPngFile,
    })

    expect(result.success).toBe(true)
    const formDataSent = sendSpy.mock.calls[0][1]?.body as FormData
    expect(formDataSent.get('file_type')).toBe('image/png')
    const sentFile = formDataSent.get('file') as File
    expect(sentFile.type).toBe('image/png')
  })

  it('deve preservar mime application/pdf para documentos PDF mesmo se o browser mandar octet-stream', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.TEST_PDF_CORRECTED',
      message: {
        id: 'msg_pdf',
        file_name: 'contrato.pdf',
        file_type: 'application/pdf',
      } as any,
    })

    const octetPdfFile = new File(['pdf-data'], 'contrato.pdf', { type: '' })

    const result = await whatsappService.sendMessage({
      clientId: 'c_test',
      file: octetPdfFile,
    })

    expect(result.success).toBe(true)
    const formDataSent = sendSpy.mock.calls[0][1]?.body as FormData
    expect(formDataSent.get('file_type')).toBe('application/pdf')
    const sentFile = formDataSent.get('file') as File
    expect(sentFile.type).toBe('application/pdf')
  })

  it('deve retornar erro controlado e não propagar mensagem se o backend send-media falhar', async () => {
    const createSpy = vi.spyOn(pb.collection('messages'), 'create')
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: false,
      error:
        'A janela de 24h para envio de mensagens livres e mídias está fechada para este cliente.',
    })

    const dummyPdf = new File(['%PDF-1.4 dummy'], 'proposta.pdf', { type: 'application/pdf' })

    const result = await whatsappService.sendMessage({
      clientId: 'c_test',
      file: dummyPdf,
    })

    expect(createSpy).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toContain('janela de 24h')
  })

  it('deve continuar chamando /backend/v1/crm/whatsapp/send para mensagens de texto sem arquivo', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      status: 'sent',
      whatsapp_message_id: 'wamid.TEST_TEXT_456',
      message: {
        id: 'msg_text_456',
        client_id: 'c_test',
        direction: 'outbound',
        message_text: 'Olá mundo',
      } as any,
    })

    const result = await whatsappService.sendMessage({
      clientId: 'c_test',
      attendanceId: 'att_123',
      messageText: 'Olá mundo',
    })

    expect(sendSpy).toHaveBeenCalledWith(
      '/backend/v1/crm/whatsapp/send',
      expect.objectContaining({
        method: 'POST',
        body: {
          client_id: 'c_test',
          attendance_id: 'att_123',
          message_text: 'Olá mundo',
        },
      }),
    )
    expect(result.success).toBe(true)
  })
})
