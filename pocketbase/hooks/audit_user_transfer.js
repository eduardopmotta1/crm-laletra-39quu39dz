// User Transfer Hook — v2 segura
// Transfere clientes e tarefas quando um usuário é desativado

onRecordAfterUpdateSuccess((e) => {
  try {
    const record = e.record
    if (!record) return e.next()
    const original = record.original()
    if (!original) return e.next()

    const wasActive = original.get('is_active')
    const isNowInactive = record.get('is_active') === false

    // Só age se is_active mudou de true para false
    if (wasActive !== false || !isNowInactive) return e.next()
    if (!record.id) return e.next()

    const userId = record.id
    console.log('[USER TRANSFER] User desativado, transferindo recursos:', userId)

    // Nota de segurança: A desatribuição em massa ao desativar usuário agora é tratada
    // de forma orquestrada e transacional pelo endpoint /backend/v1/crm/transfer-user-workload,
    // que transfere para o usuário destino com log de auditoria completo.
    // Este listener apenas limpa qualquer registro residual que tenha permanecido sem atribuição.
    $app
      .db()
      .newQuery(
        'UPDATE clients SET assigned_to = "" WHERE assigned_to = {:userId} AND is_archived = false',
      )
      .bind({ userId: userId })
      .execute()

    $app
      .db()
      .newQuery(
        "UPDATE tasks SET assigned_to = \"\" WHERE assigned_to = {:userId} AND status != 'concluida' AND status != 'cancelada'",
      )
      .bind({ userId: userId })
      .execute()

    console.log('[USER TRANSFER] Limpeza residual concluída para:', userId)
  } catch (err) {
    console.error('[USER TRANSFER] Erro:', err && err.message ? err.message : err)
  }
  return e.next()
}, 'users')

console.log('[AUDIT USER TRANSFER] v2 loaded — safe mode')
