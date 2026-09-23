migrate(
  (app) => {
    // Migration 0069: Índices para prevenir concorrência e duplicação em attendances e messages
    // REGRA DE PRODUÇÃO: Proibido apagar dados, mesclar dados ou alterar dados de clientes existentes.
    // Se a criação do índice único estrito falhar devido a duplicatas pré-existentes, não falhamos a migração;
    // criamos o índice não-único ou parcial permissivo e o hook lida com o lock por cliente.

    // 1. attendances: índice único para atendimentos ativos (is_archived = false)
    try {
      const attendancesCol = app.findCollectionByNameOrId('attendances')

      // Tentativa de adicionar índice parcial único via SQLite:
      // Apenas registros onde is_archived = false ou 0
      try {
        attendancesCol.addIndex(
          'idx_attendances_client_active_unique',
          true,
          'client_id',
          'is_archived = false OR is_archived = 0',
        )
        app.save(attendancesCol)
        console.log(
          '[migration 0069] Índice parcial único idx_attendances_client_active_unique criado com sucesso.',
        )
      } catch (idxErr) {
        console.warn(
          '[migration 0069] Aviso: Não foi possível criar índice parcial UNIQUE em attendances (duplicatas históricas existentes detectadas). Criando índice regular para performance:',
          idxErr,
        )
        // Se já existe duplicata ativa histórica (ex: Mario Angelo), o banco rejeitará UNIQUE.
        // Criamos o índice normal (não-único) para garantir que a busca do lock no hook seja instantânea.
        try {
          const refreshedCol = app.findCollectionByNameOrId('attendances')
          refreshedCol.addIndex(
            'idx_attendances_client_active',
            false,
            'client_id, is_archived',
            '',
          )
          app.save(refreshedCol)
          console.log(
            '[migration 0069] Índice não-único idx_attendances_client_active criado com sucesso.',
          )
        } catch (fallbackErr) {
          console.warn(
            '[migration 0069] Aviso ao criar índice fallback em attendances:',
            fallbackErr,
          )
        }
      }
    } catch (colErr) {
      console.warn('[migration 0069] Erro ao acessar collection attendances:', colErr)
    }

    // 2. messages: proteção de unicidade para whatsapp_message_id
    try {
      const messagesCol = app.findCollectionByNameOrId('messages')
      try {
        // Tenta criar índice UNIQUE onde whatsapp_message_id != '' e != null
        messagesCol.addIndex(
          'idx_messages_whatsapp_id_unique',
          true,
          'whatsapp_message_id',
          "whatsapp_message_id != '' AND whatsapp_message_id IS NOT NULL",
        )
        app.save(messagesCol)
        console.log(
          '[migration 0069] Índice único idx_messages_whatsapp_id_unique criado com sucesso.',
        )
      } catch (msgIdxErr) {
        console.warn(
          '[migration 0069] Aviso: Não foi possível criar índice UNIQUE em messages.whatsapp_message_id (duplicatas históricas existentes detectadas). A unicidade será garantida no webhook hook com lock e verificação prévia.',
          msgIdxErr,
        )
      }
    } catch (mErr) {
      console.warn('[migration 0069] Erro ao acessar collection messages:', mErr)
    }
  },
  (app) => {
    try {
      const attendancesCol = app.findCollectionByNameOrId('attendances')
      try {
        attendancesCol.removeIndex('idx_attendances_client_active_unique')
      } catch (_) {}
      try {
        attendancesCol.removeIndex('idx_attendances_client_active')
      } catch (_) {}
      app.save(attendancesCol)
    } catch (_) {}

    try {
      const messagesCol = app.findCollectionByNameOrId('messages')
      try {
        messagesCol.removeIndex('idx_messages_whatsapp_id_unique')
      } catch (_) {}
      app.save(messagesCol)
    } catch (_) {}
  },
)
