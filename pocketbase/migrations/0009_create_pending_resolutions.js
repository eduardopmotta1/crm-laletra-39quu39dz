migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const clients = app.findCollectionByNameOrId('clients')

    const collection = new Collection({
      name: 'pending_resolutions',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'category', type: 'text', required: true },
        { name: 'item_id', type: 'text', required: true },
        { name: 'item_title', type: 'text' },
        { name: 'client_id', type: 'relation', collectionId: clients.id, maxSelect: 1 },
        { name: 'client_name', type: 'text' },
        { name: 'assigned_to', type: 'relation', collectionId: users.id, maxSelect: 1 },
        { name: 'assigned_name', type: 'text' },
        { name: 'resolved_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
        { name: 'resolved_by_name', type: 'text' },
        { name: 'action_taken', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'item_created_at', type: 'date' },
        { name: 'resolved_at', type: 'date' },
        { name: 'resolution_time_minutes', type: 'number' },
        { name: 'initial_priority', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pending_res_cat ON pending_resolutions (category)',
        'CREATE INDEX idx_pending_res_client ON pending_resolutions (client_id)',
        'CREATE INDEX idx_pending_res_resolved_at ON pending_resolutions (resolved_at)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('pending_resolutions')
      app.delete(collection)
    } catch (_) {}
  },
)
