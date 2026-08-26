migrate(
  (app) => {
    // 3. Limpar duplicatas existentes em archived_deals mantendo apenas o mais recente
    // Deletar os 5 registros duplicados antigos:
    // - t9ddaydt3wu68wp (Dr. Marcelo)
    // - ka7071qjnrbw9lw (StartFit)
    // - 6j1i9tayhadbano (Escola Futuro Brilhante)
    // - 8kxn2lmzp253qow (Escola Futuro Brilhante)
    // - 0w81yo9jj6jv5xi (Ana Carolina)

    app
      .db()
      .newQuery(`
    DELETE FROM archived_deals WHERE id IN (
      't9ddaydt3wu68wp',
      'ka7071qjnrbw9lw',
      '6j1i9tayhadbano',
      '8kxn2lmzp253qow',
      '0w81yo9jj6jv5xi'
    )
  `)
      .execute()
  },
  (app) => {
    // Revert not applicable for deleted duplicate cleanup
  },
)
