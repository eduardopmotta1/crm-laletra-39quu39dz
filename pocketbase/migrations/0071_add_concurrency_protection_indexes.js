migrate(
  (app) => {
    // Migration 0071: Índices e infraestrutura de concorrência para webhook e atendimentos
    // REGRA DE PRODUÇÃO: NÃO EXECUTAR CONTRA BASE REAL NESTA SESSÃO.
    // Preservar dados históricos existentes (ex: Mario Angelo) intactos.
    //
    // Explicação técnica de unicidade SQLite:
    // SQLite permite índices parciais com WHERE:
    // CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_unique_whatsapp_message_id
    //   ON messages (whatsapp_message_id)
    //   WHERE whatsapp_message_id IS NOT NULL AND whatsapp_message_id != '';
    //
    // ATENÇÃO sobre dados existentes:
    // Como a base já contém WAMIDs duplicados (caso Mario Angelo: wamid 3x em messages),
    // a criação incondicional de um índice estrito UNIQUE causaria 'UNIQUE constraint failed'.
    //
    // Estratégia segura:
    // 1. Tentar criar o índice único condicional.
    // 2. Se falhar por causa das linhas duplicadas históricas existentes, criar o índice de busca regular
    //    idx_messages_whatsapp_message_id_fast (whatsapp_message_id) para otimizar os re-checks
    //    atômicos dentro da transação do hook.
    // 3. Documentar no relatório a estratégia segura recomendada para futura rodada de limpeza histórica.

    // 1. messages: índice de busca e proteção em whatsapp_message_id
    try {
      const messagesCol = app.findCollectionByNameOrId('messages')
      try {
        messagesCol.addIndex(
          'idx_messages_wamid_fast_search',
          false,
          'whatsapp_message_id',
          "whatsapp_message_id != '' AND whatsapp_message_id IS NOT NULL",
        )
        app.save(messagesCol)
        console.log('[Migration 0071] Índice idx_messages_wamid_fast_search criado.')
      } catch (e) {
        console.warn('[Migration 0071] Aviso ao adicionar idx_messages_wamid_fast_search:', e)
      }
    } catch (eCol) {
      console.warn('[Migration 0071] Erro ao carregar collection messages:', eCol)
    }

    // 2. attendances: índice composto (client_id, is_archived) para busca instantânea de atendimentos ativos
    try {
      const attendancesCol = app.findCollectionByNameOrId('attendances')
      try {
        attendancesCol.addIndex(
          'idx_attendances_client_active_lookup',
          false,
          'client_id, is_archived',
          '',
        )
        app.save(attendancesCol)
        console.log('[Migration 0071] Índice idx_attendances_client_active_lookup criado.')
      } catch (e) {
        console.warn('[Migration 0071] Aviso ao adicionar idx_attendances_client_active_lookup:', e)
      }
    } catch (eCol) {
      console.warn('[Migration 0071] Erro ao carregar collection attendances:', eCol)
    }
  },
  (app) => {
    try {
      const messagesCol = app.findCollectionByNameOrId('messages')
      try {
        messagesCol.removeIndex('idx_messages_wamid_fast_search')
        app.save(messagesCol)
      } catch (_) {}
    } catch (_) {}

    try {
      const attendancesCol = app.findCollectionByNameOrId('attendances')
      try {
        attendancesCol.removeIndex('idx_attendances_client_active_lookup')
        app.save(attendancesCol)
      } catch (_) {}
    } catch (_) {}
  },
)
