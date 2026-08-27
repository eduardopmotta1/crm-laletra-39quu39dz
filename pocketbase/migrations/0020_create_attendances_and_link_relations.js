migrate(
  (app) => {
    const clientsCol = app.findCollectionByNameOrId('clients')

    // 1. Create 'attendances' collection
    const attendances = new Collection({
      name: 'attendances',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'client_id',
          type: 'relation',
          collectionId: clientsCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'stage',
          type: 'select',
          required: true,
          values: [
            'Novo contato',
            'Contato iniciado',
            'Precisa responder',
            'Em atendimento',
            'Orçamento enviado',
            'Aguardando cliente',
            'Venda fechada',
            'Não fechou',
          ],
          maxSelect: 1,
        },
        {
          name: 'assigned_to',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'product_interest', type: 'text', required: false },
        { name: 'quote_value', type: 'number', required: false, min: 0 },
        { name: 'notes', type: 'text', required: false },
        { name: 'source', type: 'text', required: false },
        { name: 'is_archived', type: 'bool', required: false },
        {
          name: 'result',
          type: 'select',
          required: false,
          values: ['Venda fechada', 'Venda perdida'],
          maxSelect: 1,
        },
        { name: 'loss_reason', type: 'text', required: false },
        { name: 'closed_at', type: 'date', required: false },
        { name: 'archived_at', type: 'date', required: false },
        { name: 'last_customer_message_at', type: 'date', required: false },
        { name: 'last_company_message_at', type: 'date', required: false },
        { name: 'last_archived_deal_id', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_att_client ON attendances (client_id)',
        'CREATE INDEX idx_att_stage ON attendances (stage)',
        'CREATE INDEX idx_att_archived ON attendances (is_archived)',
      ],
    })
    app.save(attendances)

    // 2. Add attendance_id relation field to existing collections
    const collectionsToUpdate = [
      'archived_deals',
      'production_orders',
      'tasks',
      'stage_transitions',
      'messages',
      'pending_resolutions',
    ]

    for (let i = 0; i < collectionsToUpdate.length; i++) {
      const colName = collectionsToUpdate[i]
      try {
        const col = app.findCollectionByNameOrId(colName)
        if (!col.fields.getByName('attendance_id')) {
          col.fields.add(
            new RelationField({
              name: 'attendance_id',
              collectionId: attendances.id,
              cascadeDelete: false,
              maxSelect: 1,
              required: false,
            }),
          )
          app.save(col)
        }
      } catch (err) {
        console.log('[Migration 0020] Error adding attendance_id to ' + colName + ':', err)
      }
    }
  },
  (app) => {
    try {
      const collectionsToRevert = [
        'archived_deals',
        'production_orders',
        'tasks',
        'stage_transitions',
        'messages',
        'pending_resolutions',
      ]
      for (let i = 0; i < collectionsToRevert.length; i++) {
        const col = app.findCollectionByNameOrId(collectionsToRevert[i])
        const field = col.fields.getByName('attendance_id')
        if (field) {
          col.fields.removeByName('attendance_id')
          app.save(col)
        }
      }
      const attendances = app.findCollectionByNameOrId('attendances')
      app.delete(attendances)
    } catch (_) {}
  },
)
