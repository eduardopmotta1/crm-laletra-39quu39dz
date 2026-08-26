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

    // Desatribuir clientes
    $app
      .db()
      .newQuery('UPDATE clients SET assigned_to = "" WHERE assigned_to = {:userId}')
      .bind({ userId: userId })
      .execute()

    // Desatribuir tarefas pendentes
    $app
      .db()
      .newQuery(
        'UPDATE tasks SET assigned_to = "" WHERE assigned_to = {:userId} AND status != \'concluida\'',
      )
      .bind({ userId: userId })
      .execute()

    console.log('[USER TRANSFER] Transferência concluída para:', userId)
  } catch (err) {
    console.error('[USER TRANSFER] Erro:', err && err.message ? err.message : err)
  }
  return e.next()
}, 'users')

console.log('[AUDIT USER TRANSFER] v2 loaded — safe mode')
