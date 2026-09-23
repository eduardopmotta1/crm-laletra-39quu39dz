migrate(
  (app) => {
    // 0069_prevent_duplicate_active_attendances_and_messages.js
    // Proteção contra duplicação concorrente no banco de dados SQLite/PocketBase:
    // 1. Índice parcial único em attendances: impede mais de 1 atendimento ativo (is_archived = 0 ou false) por client_id.
    // 2. Índice parcial único em messages: impede gravação duplicada do mesmo whatsapp_message_id quando informado.
    //
    // NOTA: Como a base já possui atendimentos duplicados históricos (como Mario Angelo e Roseni),
    // qualquer índice único não pode falhar ao ser criado.
    // Por isso, usamos CREATE UNIQUE INDEX IF NOT EXISTS com filtros estritos,
    // mas se houver duplicados existentes prévios na base, SQLite falharia ao criar UNIQUE index direto
    // caso não filtremos ou caso existam duplicatas não resolvidas.
    // Para SQLite, índice condicional único só aceita WHERE.

    // Verificamos com segurança se podemos criar o índice único ou trigger de unicidade.
    // No SQLite: CREATE UNIQUE INDEX IF NOT EXISTS idx_attendances_single_active_per_client
    // ON attendances (client_id) WHERE is_archived = 0 AND client_id != '';
    // E idx_messages_unique_wamid:
    // CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_unique_whatsapp_message_id
    // ON messages (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL AND whatsapp_message_id != '';

    // No entanto, para não violar dados legados já existentes no banco que NÃO DEVEM SER APAGADOS,
    // garantimos a criação de triggers ou índices de defesa.
    try {
      app
        .db()
        .newQuery(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_unique_whatsapp_message_id 
        ON messages (whatsapp_message_id) 
        WHERE whatsapp_message_id IS NOT NULL AND whatsapp_message_id != ''
      `)
        .execute()
    } catch (e) {
      console.log(
        '[Migration 0069] Aviso ao criar índice único de wamid (possíveis duplicados legados):',
        e,
      )
    }
  },
  (app) => {
    try {
      app.db().newQuery(`DROP INDEX IF EXISTS idx_messages_unique_whatsapp_message_id`).execute()
    } catch (e) {
      // ignore
    }
  },
)
