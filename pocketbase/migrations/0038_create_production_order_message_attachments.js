migrate(
  (app) => {
    // 1. Create production_order_message_attachments tracking collection
    const prodOrdersCol = app.findCollectionByNameOrId('production_orders')
    const messagesCol = app.findCollectionByNameOrId('messages')

    let col
    try {
      col = app.findCollectionByNameOrId('production_order_message_attachments')
    } catch (_) {
      col = new Collection({
        name: 'production_order_message_attachments',
        type: 'base',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          {
            name: 'production_order_id',
            type: 'relation',
            required: true,
            collectionId: prodOrdersCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'message_id',
            type: 'relation',
            required: true,
            collectionId: messagesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'created_by',
            type: 'relation',
            required: false,
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'file_name',
            type: 'text',
            required: false,
          },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_poma_order_message ON production_order_message_attachments (production_order_id, message_id)',
          'CREATE INDEX idx_poma_order ON production_order_message_attachments (production_order_id)',
          'CREATE INDEX idx_poma_message ON production_order_message_attachments (message_id)',
        ],
      })
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('production_order_message_attachments')
      if (col) {
        app.delete(col)
      }
    } catch (_) {}
  },
)
