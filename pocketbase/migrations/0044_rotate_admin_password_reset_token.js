/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const adminEmail = 'eduardopmotta1@gmail.com'
    let adminUser = null
    try {
      adminUser = app.findAuthRecordByEmail('_pb_users_auth_', adminEmail)
    } catch (_) {
      return
    }

    const settingsCol = app.findCollectionByNameOrId('system_settings')

    // 1. INVALIDAÇÃO IMEDIATA DO TOKEN ANTERIOR
    // Busca o token ativo registrado anteriormente
    let previousToken = null
    try {
      const activeRef = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'active_admin_pwd_reset_token',
      )
      previousToken = activeRef.get('setting_value')
    } catch (_) {}

    if (previousToken) {
      try {
        const oldTokenRec = app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'pwd_reset_' + previousToken,
        )
        app.delete(oldTokenRec)
      } catch (_) {}
    }

    // Limpeza defensiva de quaisquer tokens pendentes antigos do admin em system_settings
    try {
      const allOldTokens = app.findRecordsByFilter(
        'system_settings',
        "setting_key ~ 'pwd_reset_'",
        '-created',
        50,
        0,
      )
      for (let i = 0; i < allOldTokens.length; i++) {
        const rec = allOldTokens[i]
        try {
          const payload = JSON.parse(rec.get('setting_value'))
          if (payload.user_id === adminUser.id || payload.email === adminEmail) {
            app.delete(rec)
          }
        } catch (_) {}
      }
    } catch (_) {}

    // 2. GERAÇÃO DO NOVO TOKEN CRIPTOGRAFICAMENTE SEGURO (USO ÚNICO)
    const newToken = $security.randomString(48)
    const expiresAt = new Date().getTime() + 72 * 60 * 60 * 1000 // 72 horas

    const newPayload = {
      token: newToken,
      user_id: adminUser.id,
      email: adminEmail,
      user_name: adminUser.get('name') || 'Eduardo Motta',
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    }

    const newRec = new Record(settingsCol)
    newRec.set('setting_key', 'pwd_reset_' + newToken)
    newRec.set('setting_value', JSON.stringify(newPayload))
    newRec.set('description', 'Token de redefinição de senha para ' + adminEmail)
    app.save(newRec)

    // Atualiza a referência ativa do admin
    try {
      const activeRef = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'active_admin_pwd_reset_token',
      )
      activeRef.set('setting_value', newToken)
      app.save(activeRef)
    } catch (_) {
      const activeRef = new Record(settingsCol)
      activeRef.set('setting_key', 'active_admin_pwd_reset_token')
      activeRef.set('setting_value', newToken)
      activeRef.set('description', 'Token ativo de redefinição de senha do administrador')
      app.save(activeRef)
    }

    // Registra auditoria de revogação e emissão de novo token
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(auditCol)
      auditRec.set('user_id', adminUser.id)
      auditRec.set('user_name', adminUser.get('name') || '')
      auditRec.set('user_email', adminUser.get('email') || '')
      auditRec.set('action', 'password_reset_token_regenerated')
      auditRec.set('module', 'auth')
      auditRec.set('record_id', adminUser.id)
      auditRec.set('record_title', adminUser.get('name') || adminUser.get('email') || '')
      auditRec.set(
        'details',
        'Token de redefinição anterior invalidado e novo token emitido com expiração de 72h.',
      )
      auditRec.set('ip_address', 'system')
      app.save(auditRec)
    } catch (_) {}
  },
  (app) => {
    try {
      const activeRef = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'active_admin_pwd_reset_token',
      )
      const token = activeRef.get('setting_value')
      app.delete(activeRef)
      const tokenRec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'pwd_reset_' + token,
      )
      app.delete(tokenRec)
    } catch (_) {}
  },
)
