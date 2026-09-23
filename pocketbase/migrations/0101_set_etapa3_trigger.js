migrate(
  (app) => {
    // Migration 0101: Atualizar trigger_etapa3_action para execute_now via raw SQL
    // para ser pego pelo cron automation_processor
    console.log('[Migration 0101] Definindo trigger_etapa3_action = execute_now...')
    app
      .db()
      .newQuery(
        "UPDATE system_settings SET setting_value = 'execute_now' WHERE setting_key = 'trigger_etapa3_action'",
      )
      .execute()
    console.log('[Migration 0101] trigger atualizado com sucesso.')
  },
  (app) => {},
)
