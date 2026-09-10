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

    // Token seguro aleatório com 48 caracteres hexadecimais
    const token = $security.randomString(48)
    const expiresAt = new Date().getTime() + 72 * 60 * 60 * 1000 // 72 horas

    const payload = {
      token: token,
      user_id: adminUser.id,
      email: adminEmail,
      user_name: adminUser.get('name') || 'Eduardo Motta',
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    }

    const settingsCol = app.findCollectionByNameOrId('system_settings')
    const rec = new Record(settingsCol)
    rec.set('setting_key', 'pwd_reset_' + token)
    rec.set('setting_value', JSON.stringify(payload))
    rec.set('description', 'Token de redefinição de senha para ' + adminEmail)
    app.save(rec)

    // Também salvar a chave ativa para referência do sistema
    try {
      const activeRef = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'active_admin_pwd_reset_token',
      )
      activeRef.set('setting_value', token)
      app.save(activeRef)
    } catch (_) {
      const activeRef = new Record(settingsCol)
      activeRef.set('setting_key', 'active_admin_pwd_reset_token')
      activeRef.set('setting_value', token)
      activeRef.set('description', 'Token ativo de redefinição de senha do administrador')
      app.save(activeRef)
    }

    console.log('[MIGRATION 0043] Admin password reset token created for ' + adminEmail)
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
