migrate(
  (app) => {
    // 1. Atualização aditiva de schema no campo `stage` da collection `attendances`
    const attendances = app.findCollectionByNameOrId('attendances')
    const attStageField = attendances.fields.getByName('stage')
    if (attStageField) {
      const currentValues = attStageField.values || []
      if (!currentValues.includes('Em produção')) {
        attStageField.values = [...currentValues, 'Em produção']
        attStageField.maxSelect = 1
        app.save(attendances)
      }
    }

    // 2. Atualização aditiva de schema no campo `stage` da collection `clients` (para compatibilidade legado)
    const clients = app.findCollectionByNameOrId('clients')
    const clientStageField = clients.fields.getByName('stage')
    if (clientStageField) {
      const currentValues = clientStageField.values || []
      if (!currentValues.includes('Em produção')) {
        clientStageField.values = [...currentValues, 'Em produção']
        clientStageField.maxSelect = 1
        app.save(clients)
      }
    }

    // 3. Atualizar order_index das colunas em `kanban_columns`
    // "Venda fechada" deve ter order_index 5 (se ainda não tiver)
    // "Não fechou" deve passar para order_index 7
    try {
      app
        .db()
        .newQuery(
          "UPDATE kanban_columns SET order_index = 7 WHERE internal_id = 'lost' OR name = 'Não fechou'",
        )
        .execute()
    } catch (err) {
      console.log('[Migration 0065] Erro ao mover coluna Não fechou para ordem 7:', err)
    }

    // 4. Inserir ou atualizar a coluna "Em produção" (internal_id: sales_in_production, order_index: 6)
    const kanbanCol = app.findCollectionByNameOrId('kanban_columns')
    try {
      const existing = app.findFirstRecordByData(
        'kanban_columns',
        'internal_id',
        'sales_in_production',
      )
      existing.set('name', 'Em produção')
      existing.set('description', 'Venda fechada e pedido em produção (visível para o vendedor)')
      existing.set('color', 'amber')
      existing.set('order_index', 6)
      existing.set('is_visible', true)
      existing.set('stage_type', 'intermediate')
      app.save(existing)
    } catch (_) {
      const rec = new Record(kanbanCol)
      rec.set('internal_id', 'sales_in_production')
      rec.set('name', 'Em produção')
      rec.set('description', 'Venda fechada e pedido em produção (visível para o vendedor)')
      rec.set('color', 'amber')
      rec.set('order_index', 6)
      rec.set('is_visible', true)
      rec.set('stage_type', 'intermediate')
      app.save(rec)
    }
  },
  (app) => {
    // Reverter order_index de "Não fechou" para 6
    try {
      app
        .db()
        .newQuery(
          "UPDATE kanban_columns SET order_index = 6 WHERE internal_id = 'lost' OR name = 'Não fechou'",
        )
        .execute()
    } catch (_) {}

    // Remover coluna sales_in_production se existir
    try {
      const existing = app.findFirstRecordByData(
        'kanban_columns',
        'internal_id',
        'sales_in_production',
      )
      app.delete(existing)
    } catch (_) {}

    // Reverter valores do select stage em attendances
    try {
      const attendances = app.findCollectionByNameOrId('attendances')
      const attStageField = attendances.fields.getByName('stage')
      if (attStageField && attStageField.values) {
        attStageField.values = attStageField.values.filter((v) => v !== 'Em produção')
        app.save(attendances)
      }
    } catch (_) {}

    // Reverter valores do select stage em clients
    try {
      const clients = app.findCollectionByNameOrId('clients')
      const clientStageField = clients.fields.getByName('stage')
      if (clientStageField && clientStageField.values) {
        clientStageField.values = clientStageField.values.filter((v) => v !== 'Em produção')
        app.save(clients)
      }
    } catch (_) {}
  },
)
