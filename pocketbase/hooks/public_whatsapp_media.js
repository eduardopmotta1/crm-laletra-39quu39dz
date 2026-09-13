// Public WhatsApp Media Hook — Servir mídia enviada por link público controlado
// Endpoint público: GET /backend/v1/crm/public-whatsapp-media/{token}
// NÃO requer autenticação (a Meta busca o arquivo anonimamente via GET).
// NÃO expõe client_id, attendance_id ou dados arbitrários.
// Valida token, expiração e integridade do arquivo.
// Serve os bytes com Content-Type real e headers seguros de cache e Content-Disposition.

routerAdd('GET', '/backend/v1/crm/public-whatsapp-media/{token}', (c) => {
  let token = ''
  try {
    token = c.request.pathValue('token')
  } catch (_) {}

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return c.json(400, {
      success: false,
      error: 'Token de mídia inválido ou ausente.',
    })
  }

  const cleanToken = token.trim()

  // 1. Localizar o registro em messages exclusivamente pelo public_media_token
  let messageRecord = null
  try {
    const list = $app.findRecordsByFilter(
      'messages',
      'public_media_token = {:token}',
      '-created',
      1,
      0,
      { token: cleanToken },
    )
    if (list && list.length > 0) {
      messageRecord = list[0]
    }
  } catch (errFilter) {
    console.error('[PUBLIC WHATSAPP MEDIA] Erro ao buscar mensagem por token:', errFilter)
    return c.json(500, {
      success: false,
      error: 'Erro interno ao consultar arquivo.',
    })
  }

  if (!messageRecord) {
    return c.json(404, {
      success: false,
      error: 'Arquivo não encontrado ou link expirado.',
    })
  }

  // 2. Validar expiração (se configurada)
  const expiresAtStr = messageRecord.getString('public_media_expires_at') || ''
  if (expiresAtStr) {
    try {
      const expMs = new Date(expiresAtStr).getTime()
      if (!isNaN(expMs) && expMs > 0 && Date.now() > expMs) {
        console.warn('[PUBLIC WHATSAPP MEDIA] Tentativa de acesso a mídia expirada:', cleanToken)
        return c.json(410, {
          success: false,
          error: 'Este link de mídia expirou.',
        })
      }
    } catch (_) {}
  }

  // 3. Obter o arquivo salvo no PocketBase
  const storedFileName = messageRecord.getString('file') || ''
  if (!storedFileName) {
    return c.json(404, {
      success: false,
      error: 'Registro sem arquivo anexado.',
    })
  }

  let originalName = messageRecord.getString('file_name') || storedFileName
  let mimeType = (messageRecord.getString('file_type') || '').toLowerCase().trim()

  // Inferência defensiva e estrita de MIME type
  const lowerName = originalName.toLowerCase()
  if (!mimeType || mimeType === 'application/octet-stream') {
    if (lowerName.endsWith('.pdf')) {
      mimeType = 'application/pdf'
    } else if (lowerName.endsWith('.png')) {
      mimeType = 'image/png'
    } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      mimeType = 'image/jpeg'
    } else if (lowerName.endsWith('.webp')) {
      mimeType = 'image/webp'
    } else {
      mimeType = 'application/octet-stream'
    }
  }

  if (mimeType === 'image/jpg') {
    mimeType = 'image/jpeg'
  }

  // Sanitizar nome do arquivo para Content-Disposition
  const safeFilename = originalName.replace(/["\r\n\\]/g, '_')

  // 4. Abrir arquivo do storage PocketBase via $app.newFilesystem()
  const storagePath = messageRecord.baseFilesPath() + '/' + storedFileName
  let fsys = null
  let reader = null

  try {
    fsys = $app.newFilesystem()
    // PocketBase v0.23+ suporta fsys.getReader ou fsys.getFile
    if (typeof fsys.getReader === 'function') {
      reader = fsys.getReader(storagePath)
    } else if (typeof fsys.getFile === 'function') {
      reader = fsys.getFile(storagePath)
    }

    if (!reader) {
      console.error(
        '[PUBLIC WHATSAPP MEDIA] Storage reader não pôde ser aberto para path:',
        storagePath,
      )
      if (fsys && typeof fsys.close === 'function') {
        try {
          fsys.close()
        } catch (_) {}
      }
      return c.json(404, {
        success: false,
        error: 'Arquivo físico não encontrado no servidor de arquivos.',
      })
    }

    // Configurar cabeçalhos HTTP adequados
    c.response.header().set('Content-Type', mimeType)
    c.response.header().set('Content-Disposition', 'inline; filename="' + safeFilename + '"')
    c.response.header().set('Cache-Control', 'public, max-age=604800, immutable')
    c.response.header().set('X-Content-Type-Options', 'nosniff')

    // e.stream serve o reader do Go diretamente sem carregar o arquivo todo em memória e sem corrupção UTF-8
    return c.stream(200, mimeType, reader)
  } catch (errStream) {
    console.error('[PUBLIC WHATSAPP MEDIA] Erro ao servir stream do arquivo:', errStream)
    return c.json(500, {
      success: false,
      error: 'Erro ao transmitir arquivo binário.',
    })
  } finally {
    // Nota: e.stream no PocketBase lê o reader de forma síncrona/streaming antes de fechar a requisição.
    // O fechamento do fsys pode ser realizado após a leitura se reader não fecha fsys.
    if (fsys && typeof fsys.close === 'function') {
      try {
        fsys.close()
      } catch (_) {}
    }
  }
})

console.log(
  '[PUBLIC WHATSAPP MEDIA] Hook loaded: GET /backend/v1/crm/public-whatsapp-media/{token} registered.',
)
