// Endpoint: POST /backend/v1/crm/fix-users-email-visibility
// Atualiza SOMENTE emailVisibility = true nos registros da collection users de forma idempotente e protegida.

console.log('[FIX USERS EMAIL VISIBILITY] Initializing hook...')

routerAdd('POST', '/backend/v1/crm/fix-users-email-visibility', (e) => {
  try {
    // 1. AUTORIZAÇÃO: Apenas admin autenticado e ativo
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
        error:
          'Acesso restrito: apenas administradores podem executar a sincronização de visibilidade de e-mails.',
      })
    }

    // 2. BUSCAR TODOS OS USUÁRIOS
    const users = $app.findRecordsByFilter('users', '', 'created', 1000, 0)
    let alreadyTrueCount = 0
    let updatedCount = 0
    let failedCount = 0

    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      const currentVisibility = user.get('emailVisibility') === true

      if (currentVisibility) {
        alreadyTrueCount++
        continue
      }

      try {
        user.set('emailVisibility', true)
        $app.save(user)
        updatedCount++
      } catch (errUser) {
        console.error(
          '[FIX USERS EMAIL VISIBILITY] Erro ao atualizar usuário ' + user.id + ':',
          errUser && errUser.message ? errUser.message : errUser,
        )
        failedCount++
      }
    }

    // 3. REGISTRAR AUDITORIA (se alterou algum registro)
    if (updatedCount > 0) {
      try {
        const auditCol = $app.findCollectionByNameOrId('audit_logs')
        if (auditCol) {
          const auditRec = new Record(auditCol)
          auditRec.set('user_id', auth.id)
          auditRec.set('user_name', auth.get('name') || auth.get('email') || '')
          auditRec.set('user_email', auth.get('email') || '')
          auditRec.set('action', 'fix_users_email_visibility')
          auditRec.set('module', 'users')
          auditRec.set('record_id', auth.id)
          auditRec.set('record_title', 'Sincronização de Visibilidade de E-mails')
          auditRec.set(
            'details',
            'Visibilidade de e-mail atualizada para ' +
              updatedCount +
              ' usuário(s). Já visíveis: ' +
              alreadyTrueCount +
              '. Falhas: ' +
              failedCount +
              '.',
          )
          auditRec.set('ip_address', e.requestInfo().remoteIP || '')
          $app.save(auditRec)
        }
      } catch (audErr) {
        console.warn('[FIX USERS EMAIL VISIBILITY] Falha ao registrar log de auditoria:', audErr)
      }
    }

    console.log(
      '[FIX USERS EMAIL VISIBILITY] Concluído: ' +
        updatedCount +
        ' atualizados, ' +
        alreadyTrueCount +
        ' já visíveis, ' +
        failedCount +
        ' falhas.',
    )

    return e.json(200, {
      success: true,
      already_visible: alreadyTrueCount,
      updated_count: updatedCount,
      failed_count: failedCount,
      total_users: users.length,
      message: 'Sincronização de visibilidade de e-mails concluída com sucesso.',
    })
  } catch (err) {
    console.error(
      '[FIX USERS EMAIL VISIBILITY] Erro crítico:',
      err && err.message ? err.message : err,
    )
    return e.json(500, {
      success: false,
      error:
        'Falha interna ao atualizar visibilidade de e-mails: ' +
        (err && err.message ? err.message : String(err)),
    })
  }
})

console.log('[FIX USERS EMAIL VISIBILITY] Hook registered successfully')
