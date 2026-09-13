// Migration 0063: Adiciona suporte a link público controlado de mídia e status pending em messages
migrate(
  (app) => {
    const messagesCol = app.findCollectionByNameOrId('messages')
    if (messagesCol) {
      // 1. Atualizar select 'status' para incluir 'pending'
      const statusField = messagesCol.fields.getByName('status')
      if (statusField) {
        statusField.values = ['pending', 'sent', 'delivered', 'read', 'failed']
      }

      // 2. Adicionar public_media_token (token criptográfico imprevisível de 32+ chars)
      if (!messagesCol.fields.getByName('public_media_token')) {
        messagesCol.fields.add(
          new TextField({
            name: 'public_media_token',
            required: false,
          }),
        )
      }

      // 3. Adicionar public_media_expires_at (data de expiração opcional)
      if (!messagesCol.fields.getByName('public_media_expires_at')) {
        messagesCol.fields.add(
          new DateField({
            name: 'public_media_expires_at',
            required: false,
          }),
        )
      }

      // 4. Adicionar índice no public_media_token
      messagesCol.addIndex('idx_messages_public_media_token', false, 'public_media_token', '')

      app.save(messagesCol)
    }
  },
  (app) => {
    const messagesCol = app.findCollectionByNameOrId('messages')
    if (messagesCol) {
      try {
        messagesCol.removeIndex('idx_messages_public_media_token')
      } catch (_) {}

      if (messagesCol.fields.getByName('public_media_token')) {
        messagesCol.fields.removeByName('public_media_token')
      }
      if (messagesCol.fields.getByName('public_media_expires_at')) {
        messagesCol.fields.removeByName('public_media_expires_at')
      }

      const statusField = messagesCol.fields.getByName('status')
      if (statusField) {
        statusField.values = ['sent', 'delivered', 'read', 'failed']
      }

      app.save(messagesCol)
    }
  },
)
