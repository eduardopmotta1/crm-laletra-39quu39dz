migrate(
  (app) => {
    const prodOrdersCol = app.findCollectionByNameOrId('production_orders')

    let col
    try {
      col = app.findCollectionByNameOrId('production_order_chat_messages')
    } catch (_) {
      col = new Collection({
        name: 'production_order_chat_messages',
        type: 'base',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != "" && user_id = @request.auth.id',
        deleteRule: '@request.auth.id != "" && user_id = @request.auth.id',
        fields: [
          {
            name: 'order_id',
            type: 'relation',
            required: true,
            collectionId: prodOrdersCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'user_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'text',
            type: 'text',
            required: true,
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
          'CREATE INDEX idx_pochats_order ON production_order_chat_messages (order_id)',
          'CREATE INDEX idx_pochats_order_created ON production_order_chat_messages (order_id, created ASC)',
          'CREATE INDEX idx_pochats_user ON production_order_chat_messages (user_id)',
        ],
      })
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('production_order_chat_messages')
      if (col) {
        app.delete(col)
      }
    } catch (_) {}
  },
)
