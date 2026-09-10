// Endpoint seguro para redefinição de senha via token de uso único
// Rota: POST /backend/v1/auth/reset-password
// Rota: POST /backend/v1/auth/validate-reset-token

routerAdd('POST', '/backend/v1/auth/validate-reset-token', (e) => {
  try {
    const body = e.requestInfo().body || {}
    const token = String(body.token || '').trim()

    if (!token || token.length < 20) {
      return e.json(400, { valid: false, error: 'Token inválido ou não fornecido.' })
    }

    // Procura em system_settings pelo token
    let settingRec = null
    try {
      settingRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'pwd_reset_' + token,
      )
    } catch (_) {
      return e.json(404, {
        valid: false,
        error: 'Token de recuperação não encontrado ou já utilizado.',
      })
    }

    let payload = {}
    try {
      payload = JSON.parse(settingRec.get('setting_value'))
    } catch (_) {
      return e.json(400, { valid: false, error: 'Dados do token corrompidos.' })
    }

    // Verifica expiração
    const now = new Date().getTime()
    if (!payload.expires_at || now > payload.expires_at) {
      try {
        $app.delete(settingRec)
      } catch (_) {}
      return e.json(400, {
        valid: false,
        error: 'Este link de redefinição expirou. Solicite um novo link.',
      })
    }

    return e.json(200, {
      valid: true,
      email: payload.email || '',
      user_name: payload.user_name || '',
    })
  } catch (err) {
    return e.json(500, {
      valid: false,
      error: 'Erro ao validar token: ' + (err && err.message ? err.message : String(err)),
    })
  }
})

routerAdd('POST', '/backend/v1/auth/reset-password', (e) => {
  try {
    const body = e.requestInfo().body || {}
    const token = String(body.token || '').trim()
    const newPassword = String(body.password || '')

    if (!token || token.length < 20) {
      return e.json(400, { success: false, error: 'Token inválido.' })
    }

    if (!newPassword || newPassword.length < 8) {
      return e.json(400, { success: false, error: 'A senha deve ter no mínimo 8 caracteres.' })
    }

    // Procura o token em system_settings
    let settingRec = null
    try {
      settingRec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'pwd_reset_' + token,
      )
    } catch (_) {
      return e.json(404, { success: false, error: 'Token inválido ou já expirado.' })
    }

    let payload = {}
    try {
      payload = JSON.parse(settingRec.get('setting_value'))
    } catch (_) {
      return e.json(400, { success: false, error: 'Dados do token corrompidos.' })
    }

    const now = new Date().getTime()
    if (!payload.expires_at || now > payload.expires_at) {
      try {
        $app.delete(settingRec)
      } catch (_) {}
      return e.json(400, {
        success: false,
        error: 'Este link expirou. Por favor solicite um novo.',
      })
    }

    // Encontra o usuário
    const userId = payload.user_id
    let userRec = null
    try {
      userRec = $app.findRecordById('_pb_users_auth_', userId)
    } catch (_) {
      return e.json(404, { success: false, error: 'Usuário não encontrado.' })
    }

    // Atualiza a senha do usuário
    userRec.setPassword(newPassword)
    $app.save(userRec)

    // Remove o token de uso único
    try {
      $app.delete(settingRec)
    } catch (_) {}

    // Registra no log de auditoria
    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(coll)
      auditRec.set('user_id', userRec.id)
      auditRec.set('user_name', userRec.get('name') || '')
      auditRec.set('user_email', userRec.get('email') || '')
      auditRec.set('action', 'password_reset')
      auditRec.set('module', 'auth')
      auditRec.set('record_id', userRec.id)
      auditRec.set('record_title', userRec.get('name') || userRec.get('email') || '')
      auditRec.set('details', 'Senha redefinida com sucesso via link de uso único.')
      auditRec.set('ip_address', e.requestInfo().remoteIP || '')
      $app.save(auditRec)
    } catch (_) {}

    return e.json(200, {
      success: true,
      message: 'Senha redefinida com sucesso! Você já pode entrar.',
    })
  } catch (err) {
    return e.json(500, {
      success: false,
      error: 'Falha ao redefinir senha: ' + (err && err.message ? err.message : String(err)),
    })
  }
})
