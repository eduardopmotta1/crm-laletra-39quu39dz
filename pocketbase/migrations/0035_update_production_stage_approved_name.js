migrate(
  (app) => {
    // Update visible name for the stage with internal_id 'approved' to 'Arte aprovada'
    // Preserves internal_id and all references
    app
      .db()
      .newQuery(`
    UPDATE production_stages
    SET name = 'Arte aprovada', updated = datetime('now')
    WHERE internal_id = 'approved' AND (name = 'Aprovado' OR name = 'aprovado' OR name = '')
  `)
      .execute()

    // Update existing production orders that might have cached stage_name = 'Aprovado'
    app
      .db()
      .newQuery(`
    UPDATE production_orders
    SET stage_name = 'Arte aprovada', updated = datetime('now')
    WHERE stage_internal_id = 'approved' AND (stage_name = 'Aprovado' OR stage_name = 'aprovado' OR stage_name = '')
  `)
      .execute()
  },
  (app) => {
    app
      .db()
      .newQuery(`
    UPDATE production_stages
    SET name = 'Aprovado', updated = datetime('now')
    WHERE internal_id = 'approved'
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE production_orders
    SET stage_name = 'Aprovado', updated = datetime('now')
    WHERE stage_internal_id = 'approved'
  `)
      .execute()
  },
)
