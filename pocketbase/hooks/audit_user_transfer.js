// PocketBase Hook — Transferência automática quando usuário é desativado
// NUNCA usar onRecordUpdateRequest (que intercepta o body)
// Usar SEMPRE onRecordAfterUpdateSuccess (roda DEPOIS do update bem-sucedido)
// Colocar try/catch em tudo — nunca quebrar a desativação por falha na transferência

onRecordAfterUpdateSuccess((e) => {
  try {
    const record = e.record
    if (!record) {
      return e.next()
    }

    const originalRecord = record.original()
    if (!originalRecord) {
      return e.next()
    }

    const wasActive = originalRecord.getBool('is_active')
    const isActive = record.getBool('is_active')

    // Verificar se is_active mudou de true para false
    if (wasActive === true && isActive === false) {
      const deactivatedUserId = record.id
      console.log(
        '[USER DEACTIVATION] Usuário desativado:',
        deactivatedUserId,
        record.getString('name'),
      )

      // 1. Desatribuir ou transferir clientes atribuídos
      try {
        $app
          .dao()
          .db()
          .newQuery('UPDATE clients SET assigned_to = "" WHERE assigned_to = {:userId}')
          .bind({ userId: deactivatedUserId })
          .execute()
        console.log('[USER DEACTIVATION] Clientes desatribuídos com sucesso.')
      } catch (clientErr) {
        console.error('[USER DEACTIVATION ERROR - CLIENTS]', clientErr)
      }

      // 2. Desatribuir tarefas pendentes do usuário desativado
      try {
        $app
          .dao()
          .db()
          .newQuery(
            'UPDATE tasks SET assigned_to = "" WHERE assigned_to = {:userId} AND status != "concluida" AND status != "cancelada"',
          )
          .bind({ userId: deactivatedUserId })
          .execute()
        console.log('[USER DEACTIVATION] Tarefas pendentes desatribuídas com sucesso.')
      } catch (taskErr) {
        console.error('[USER DEACTIVATION ERROR - TASKS]', taskErr)
      }

      // 3. Registrar log de auditoria da transferência
      try {
        const authRecord = e.auth
        const auditCol = $app.findCollectionByNameOrId('audit_logs')
        const log = new Record(auditCol)
        log.set('user_id', authRecord ? authRecord.id : '')
        log.set('user_name', authRecord ? authRecord.getString('name') || '' : 'Sistema')
        log.set('user_email', authRecord ? authRecord.getString('email') || '' : '')
        log.set('action', 'user_deactivated_transfer')
        log.set('module', 'users')
        log.set('record_id', deactivatedUserId)
        log.set('record_title', record.getString('name') || '')
        log.set(
          'details',
          'Usuário desativado. Clientes e tarefas pendentes foram desatribuídos automaticamente.',
        )
        $app.save(log)
      } catch (auditErr) {
        console.error('[USER DEACTIVATION AUDIT LOG ERROR]', auditErr)
      }
    }
  } catch (err) {
    console.error('[USER DEACTIVATION HOOK ERROR]', err)
  }

  return e.next()
}, 'users')
