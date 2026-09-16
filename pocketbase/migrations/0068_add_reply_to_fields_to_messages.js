// Migration 0068: Adiciona suporte a respostas a mensagens específicas na collection messages
// - reply_to_whatsapp_message_id (text, opcional): WAMID da mensagem original respondida
// - reply_to_message_id (relation para messages, opcional, maxSelect 1): ID local da mensagem respondida
// - índice no campo whatsapp_message_id para consultas rápidas
migrate(
  (app) => {
    const messagesCol = app.findCollectionByNameOrId('messages')
    if (messagesCol) {
      // 1. Campo reply_to_whatsapp_message_id (texto opcional)
      if (!messagesCol.fields.getByName('reply_to_whatsapp_message_id')) {
        messagesCol.fields.add(
          new TextField({
            name: 'reply_to_whatsapp_message_id',
            required: false,
          }),
        )
      }

      // 2. Campo reply_to_message_id (self-relation opcional para messages, maxSelect 1)
      if (!messagesCol.fields.getByName('reply_to_message_id')) {
        messagesCol.fields.add(
          new RelationField({
            name: 'reply_to_message_id',
            collectionId: messagesCol.id,
            required: false,
            maxSelect: 1,
            cascadeDelete: false,
          }),
        )
      }

      // 3. Adicionar índice em whatsapp_message_id
      messagesCol.addIndex('idx_messages_whatsapp_message_id', false, 'whatsapp_message_id', '')

      app.save(messagesCol)
    }
  },
  (app) => {
    const messagesCol = app.findCollectionByNameOrId('messages')
    if (messagesCol) {
      try {
        messagesCol.removeIndex('idx_messages_whatsapp_message_id')
      } catch (_) {}

      if (messagesCol.fields.getByName('reply_to_whatsapp_message_id')) {
        messagesCol.fields.removeByName('reply_to_whatsapp_message_id')
      }

      if (messagesCol.fields.getByName('reply_to_message_id')) {
        messagesCol.fields.removeByName('reply_to_message_id')
      }

      app.save(messagesCol)
    }
  },
)
