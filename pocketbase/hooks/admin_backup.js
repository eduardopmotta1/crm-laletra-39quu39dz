// Admin Backup Hook — Gestão segura de Backups Nativos do PocketBase
// Endpoints autenticados exclusivamente para administradores:
// - GET  /backend/v1/crm/admin/backups          -> Lista backups nativos existentes
// - POST /backend/v1/crm/admin/backups          -> Gera novo snapshot ZIP nativo do pb_data
// - GET  /backend/v1/crm/admin/backups/{key}     -> Download do arquivo ZIP original

console.log('[ADMIN BACKUP] Hook initializing...')

// Helper de autenticação admin reutilizado dentro de cada rota (goja VM pool isolation)
// 1. GET /backend/v1/crm/admin/backups
routerAdd('GET', '/backend/v1/crm/admin/backups', (e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária.',
    })
  }

  if (auth.get('is_active') === false) {
    return e.json(403, {
      success: false,
      error: 'Usuário inativo.',
    })
  }

  const roleSlug = auth.get('role_slug') || ''
  if (roleSlug !== 'admin') {
    return e.json(403, {
      success: false,
      error: 'Acesso negado: apenas administradores podem visualizar e gerenciar backups.',
    })
  }

  // Abordagem Primária e Nativa: chamar GET /api/backups nativo com PB_SUPERUSER_TOKEN no servidor
  // Fallback: $app.newBackupsFilesystem()
  const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
  const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

  if (superuserToken) {
    try {
      const apiRes = $http.send({
        url: pbInstanceUrl + '/api/backups',
        method: 'GET',
        headers: {
          Authorization: superuserToken,
        },
        timeout: 20,
      })

      if (apiRes && apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
        let listData = []
        try {
          if (apiRes.json && Array.isArray(apiRes.json)) {
            listData = apiRes.json
          } else if (apiRes.body) {
            listData = JSON.parse(apiRes.body)
          }
        } catch (_) {}

        const items = listData.map((item) => ({
          key: item.key,
          size: typeof item.size === 'number' ? item.size : 0,
          modified: item.modified || '',
          status: 'ready',
        }))

        items.sort((a, b) => {
          if (a.modified && b.modified) {
            return b.modified.localeCompare(a.modified)
          }
          return b.key.localeCompare(a.key)
        })

        return e.json(200, {
          success: true,
          items: items,
          source: 'native_api',
        })
      }
    } catch (httpErr) {
      console.warn(
        '[ADMIN BACKUP] Falha na chamada HTTP para /api/backups, tentando fallback interno:',
        httpErr,
      )
    }
  }

  // Fallback para $app.newBackupsFilesystem()
  let fsys = null
  try {
    fsys = $app.newBackupsFilesystem()
    const files = fsys.list('') || []

    const backups = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (f && !f.isDir && f.key && f.key.endsWith('.zip')) {
        let modIso = ''
        try {
          if (f.modTime) {
            if (typeof f.modTime.toISOString === 'function') {
              modIso = f.modTime.toISOString()
            } else if (typeof f.modTime.String === 'function') {
              modIso = f.modTime.String()
            } else {
              modIso = String(f.modTime)
            }
          }
        } catch (_) {
          modIso = ''
        }

        backups.push({
          key: f.key,
          size: typeof f.size === 'number' ? f.size : 0,
          modified: modIso,
          status: 'ready',
        })
      }
    }

    backups.sort((a, b) => {
      if (a.modified && b.modified) {
        return b.modified.localeCompare(a.modified)
      }
      return b.key.localeCompare(a.key)
    })

    return e.json(200, {
      success: true,
      items: backups,
      source: 'filesystem',
    })
  } catch (err) {
    console.error('[ADMIN BACKUP] Erro ao listar backups:', err && err.message ? err.message : err)
    return e.json(500, {
      success: false,
      error: 'Falha interna ao listar backups do sistema.',
    })
  } finally {
    if (fsys) {
      try {
        fsys.close()
      } catch (_) {}
    }
  }
})

// 2. POST /backend/v1/crm/admin/backups -> Cria snapshot nativo
routerAdd('POST', '/backend/v1/crm/admin/backups', (e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária.',
    })
  }

  if (auth.get('is_active') === false) {
    return e.json(403, {
      success: false,
      error: 'Usuário inativo.',
    })
  }

  const roleSlug = auth.get('role_slug') || ''
  if (roleSlug !== 'admin') {
    return e.json(403, {
      success: false,
      error: 'Acesso negado: apenas administradores podem criar backups.',
    })
  }

  // Gera nome formatado padrão PB: pb_backup_YYYYMMDDHHmmss.zip ou customizado seguro
  const now = new Date()
  const pad = function (n) {
    return n < 10 ? '0' + n : String(n)
  }
  const dateStr =
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  const backupName = 'pb_backup_' + dateStr + '.zip'

  console.log('[ADMIN BACKUP] Iniciando criação de backup nativo: ' + backupName)

  const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
  const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

  let createdSuccessfully = false
  let creationMethod = ''

  // Tentativa 1: API nativa POST /api/backups com PB_SUPERUSER_TOKEN
  if (superuserToken) {
    try {
      const apiRes = $http.send({
        url: pbInstanceUrl + '/api/backups',
        method: 'POST',
        headers: {
          Authorization: superuserToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: backupName }),
        timeout: 60,
      })

      if (apiRes && apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
        createdSuccessfully = true
        creationMethod = 'native_api'
        console.log(
          '[ADMIN BACKUP] Backup nativo criado com sucesso via POST /api/backups: ' + backupName,
        )
      } else {
        console.warn(
          '[ADMIN BACKUP] POST /api/backups retornou status ' +
            (apiRes ? apiRes.statusCode : 'sem resposta'),
        )
      }
    } catch (httpErr) {
      console.warn(
        '[ADMIN BACKUP] Exceção ao chamar POST /api/backups, tentando fallback Goja:',
        httpErr,
      )
    }
  }

  // Tentativa 2: fallback para $app.createBackup
  if (!createdSuccessfully) {
    try {
      let ctx = null
      try {
        if (e.request && typeof e.request.context === 'function') {
          ctx = e.request.context()
        }
      } catch (_) {}
      $app.createBackup(ctx, backupName)
      createdSuccessfully = true
      creationMethod = 'goja_core'
      console.log(
        '[ADMIN BACKUP] Backup nativo criado com sucesso via $app.createBackup: ' + backupName,
      )
    } catch (gojaErr) {
      console.error('[ADMIN BACKUP] Falha também em $app.createBackup:', gojaErr)
      const rawMsg = gojaErr && gojaErr.message ? String(gojaErr.message) : ''
      let clientMsg = 'Falha interna ao criar backup do sistema.'
      if (rawMsg.toLowerCase().includes('already been started')) {
        clientMsg = 'Já existe um processo de backup em andamento. Aguarde alguns instantes.'
      }
      return e.json(500, {
        success: false,
        error: clientMsg,
      })
    }
  }

  // Obter atributos e confirmar existência do arquivo
  let fsys = null
  let fileSize = 0
  let modIso = now.toISOString()
  try {
    fsys = $app.newBackupsFilesystem()
    const attrs = fsys.attributes(backupName)
    if (attrs && typeof attrs.size === 'number') {
      fileSize = attrs.size
    }
    if (attrs && attrs.modTime) {
      if (typeof attrs.modTime.toISOString === 'function') {
        modIso = attrs.modTime.toISOString()
      } else if (typeof attrs.modTime.String === 'function') {
        modIso = attrs.modTime.String()
      }
    }
  } catch (attrErr) {
    console.warn('[ADMIN BACKUP] Atributos não recuperados de imediato:', attrErr)
  } finally {
    if (fsys) {
      try {
        fsys.close()
      } catch (_) {}
    }
  }

  // Registrar auditoria
  try {
    const auditCol = $app.findCollectionByNameOrId('audit_logs')
    if (auditCol) {
      const rec = new Record(auditCol)
      rec.set('user_id', auth.id)
      rec.set('user_name', auth.get('name') || auth.get('email') || '')
      rec.set('user_email', auth.get('email') || '')
      rec.set('action', 'backup_create')
      rec.set('module', 'settings')
      rec.set('record_id', backupName)
      rec.set('record_title', backupName)
      rec.set(
        'details',
        'Backup manual nativo completo criado pelo administrador (' +
          fileSize +
          ' bytes). Método: ' +
          creationMethod,
      )
      rec.set('ip_address', e.requestInfo ? e.requestInfo().remoteIP || '' : '')
      $app.save(rec)
    }
  } catch (audErr) {
    console.warn('[ADMIN BACKUP] Não foi possível registrar log de auditoria:', audErr)
  }

  return e.json(200, {
    success: true,
    backup: {
      key: backupName,
      size: fileSize,
      modified: modIso,
      status: 'ready',
    },
  })
})

// 3. GET /backend/v1/crm/admin/backups/{key} -> Proxy seguro para download
routerAdd('GET', '/backend/v1/crm/admin/backups/{key}', (e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária.',
    })
  }

  if (auth.get('is_active') === false) {
    return e.json(403, {
      success: false,
      error: 'Usuário inativo.',
    })
  }

  const roleSlug = auth.get('role_slug') || ''
  if (roleSlug !== 'admin') {
    return e.json(403, {
      success: false,
      error: 'Acesso negado: apenas administradores podem baixar backups.',
    })
  }

  const rawKey = e.request ? e.request.pathValue('key') : ''
  const key = String(rawKey || '').trim()

  // Validação estrita do nome do arquivo para prevenir path traversal ou injeção
  if (!key || !/^[a-zA-Z0-9_\-\.]+\.zip$/.test(key) || key.includes('..') || key.includes('/')) {
    return e.json(400, {
      success: false,
      error: 'Nome de arquivo de backup inválido.',
    })
  }

  let fsys = null
  try {
    fsys = $app.newBackupsFilesystem()
    const exists = fsys.exists(key)
    if (!exists) {
      return e.json(404, {
        success: false,
        error: 'Arquivo de backup não encontrado.',
      })
    }

    // Serve diretamente o arquivo ao response stream via filesystem.System.serve
    // Definindo headers de download attachment
    if (e.response && typeof e.response.header === 'function') {
      const h = e.response.header()
      if (h && typeof h.set === 'function') {
        h.set('Content-Disposition', 'attachment; filename="' + key + '"')
        h.set('Content-Type', 'application/zip')
      }
    }

    fsys.serve(e.response, e.request, key, key)
    return
  } catch (err) {
    console.error(
      '[ADMIN BACKUP] Erro no download do backup:',
      err && err.message ? err.message : err,
    )
    return e.json(500, {
      success: false,
      error: 'Falha ao processar o download do backup.',
    })
  } finally {
    if (fsys) {
      try {
        fsys.close()
      } catch (_) {}
    }
  }
})

console.log('[ADMIN BACKUP] Hook registered routes: /backend/v1/crm/admin/backups')
