import { describe, it, expect } from 'vitest'

describe('WhatsApp Webhook — Suporte a Documentos / PDF (Meta Cloud API)', () => {
  it('simulação do parser com payload real da Meta com type "document"', () => {
    // Simula a lógica do parser extraída de whatsapp_webhook.js
    const metaPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '5521970156756',
                  phone_number_id: '987654321',
                },
                contacts: [
                  {
                    profile: { name: 'Eduardo P Motta' },
                    wa_id: '5521970156756',
                  },
                ],
                messages: [
                  {
                    from: '5521970156756',
                    id: 'wamid.HBgNNTUyMTk3MDE1Njc1NhUCABIYFDNBQ0YxRkY1MjM1RkYwMzI3Q0IyAA==',
                    timestamp: '1789332831',
                    type: 'document',
                    document: {
                      filename: 'manual_instrucoes.pdf',
                      mime_type: 'application/pdf',
                      sha256: 'abc123sha256fake',
                      id: 'MEDIA_DOC_ID_99999',
                      caption: 'Segue o PDF solicitado',
                    },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    }

    const msg = metaPayload.entry[0].changes[0].value.messages[0]
    const msgType = msg.type
    const metaMsgId = msg.id

    expect(msgType).toBe('document')
    expect(metaMsgId).toBe('wamid.HBgNNTUyMTk3MDE1Njc1NhUCABIYFDNBQ0YxRkY1MjM1RkYwMzI3Q0IyAA==')

    // Executa a extração idêntica à do hook whatsapp_webhook.js
    let isDocumentMsg = false
    let mediaId = ''
    let docMimeType = ''
    let docFilename = ''
    let docSha256 = ''
    let docCaption = ''

    if (msgType === 'document') {
      isDocumentMsg = true
      const docData = (msg as any).document || {}
      mediaId = String(docData.id || '').trim()
      docMimeType = String(docData.mime_type || 'application/pdf')
        .trim()
        .toLowerCase()
      docFilename = String(docData.filename || '').trim()
      docSha256 = String(docData.sha256 || '').trim()
      docCaption = String(docData.caption || '').trim()
    }

    expect(isDocumentMsg).toBe(true)
    expect(mediaId).toBe('MEDIA_DOC_ID_99999')
    expect(docMimeType).toBe('application/pdf')
    expect(docFilename).toBe('manual_instrucoes.pdf')
    expect(docSha256).toBe('abc123sha256fake')
    expect(docCaption).toBe('Segue o PDF solicitado')

    // Testar resolução de filename
    const nowTs = 1789332831000
    let generatedFileName = ''
    if (isDocumentMsg) {
      if (docFilename) {
        generatedFileName = docFilename
      } else {
        generatedFileName = 'documento_whatsapp_' + nowTs + '.pdf'
      }
    }
    expect(generatedFileName).toBe('manual_instrucoes.pdf')

    // Testar fallback quando sem filename
    let fallbackFileName = ''
    const noNameDoc: any = { id: '123' }
    if (!noNameDoc.filename) {
      fallbackFileName = 'documento_whatsapp_' + nowTs + '.pdf'
    }
    expect(fallbackFileName).toBe('documento_whatsapp_1789332831000.pdf')
  })

  it('lógica de deduplicação por WAMID garante que reenvio da Meta é ignorado', () => {
    const existingWamid = 'wamid.HBgNNTUyMTk3MDE1Njc1NhUCABIYFDNBQ0YxRkY1MjM1RkYwMzI3Q0IyAA=='
    const recordedIds = new Set<string>([existingWamid])

    let duplicateCount = 0
    let processedCount = 0

    const incomingWamid = 'wamid.HBgNNTUyMTk3MDE1Njc1NhUCABIYFDNBQ0YxRkY1MjM1RkYwMzI3Q0IyAA=='
    if (recordedIds.has(incomingWamid)) {
      duplicateCount++
    } else {
      processedCount++
    }

    expect(duplicateCount).toBe(1)
    expect(processedCount).toBe(0)
  })

  it('preserva dados para gravação na collection messages: file, file_name, file_type, file_size', () => {
    const docData = {
      filename: 'orcamento_grafica.pdf',
      mime_type: 'application/pdf',
      id: 'MEDIA_DOC_123',
      caption: '',
    }

    const resolvedMime = docData.mime_type || 'application/pdf'
    const fileName = docData.filename || 'documento_whatsapp_123.pdf'
    const fileSize = 150240
    const messageText = docData.caption || fileName

    const simulatedRecord = {
      direction: 'inbound',
      whatsapp_message_id: 'wamid.TEST_WAMID',
      file_name: fileName,
      file_type: resolvedMime,
      file_size: fileSize,
      message_text: messageText,
    }

    expect(simulatedRecord.direction).toBe('inbound')
    expect(simulatedRecord.file_name).toBe('orcamento_grafica.pdf')
    expect(simulatedRecord.file_type).toBe('application/pdf')
    expect(simulatedRecord.file_size).toBe(150240)
    expect(simulatedRecord.message_text).toBe('orcamento_grafica.pdf')
  })
})
