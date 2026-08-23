migrate(
  (app) => {
    // 1. Clients Collection
    const clients = new Collection({
      name: 'clients',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'phone', type: 'text', required: true },
        { name: 'email', type: 'email' },
        {
          name: 'stage',
          type: 'select',
          required: true,
          values: [
            'Novo contato',
            'Precisa responder',
            'Em atendimento',
            'Orçamento enviado',
            'Aguardando cliente',
            'Venda fechada',
            'Não fechou',
          ],
          maxSelect: 1,
        },
        { name: 'product_interest', type: 'text', required: false },
        { name: 'quote_value', type: 'number', required: false, min: 0 },
        {
          name: 'priority',
          type: 'select',
          required: true,
          values: ['baixa', 'media', 'alta', 'urgente'],
          maxSelect: 1,
        },
        {
          name: 'assigned_to',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'last_message_at', type: 'date', required: false },
        {
          name: 'last_message_direction',
          type: 'select',
          values: ['inbound', 'outbound'],
          maxSelect: 1,
        },
        { name: 'last_message_text', type: 'text', required: false },
        { name: 'notes', type: 'text', required: false },
        { name: 'next_action', type: 'text', required: false },
        { name: 'next_action_date', type: 'date', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_clients_stage ON clients (stage)',
        'CREATE INDEX idx_clients_phone ON clients (phone)',
        'CREATE INDEX idx_clients_assigned ON clients (assigned_to)',
        'CREATE INDEX idx_clients_last_msg ON clients (last_message_at DESC)',
      ],
    })
    app.save(clients)

    // 2. Tasks Collection
    const tasks = new Collection({
      name: 'tasks',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'text', required: false },
        {
          name: 'client_id',
          type: 'relation',
          collectionId: clients.id,
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'assigned_to',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'due_date', type: 'date', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pendente', 'concluida', 'cancelada'],
          maxSelect: 1,
        },
        {
          name: 'priority',
          type: 'select',
          required: true,
          values: ['baixa', 'media', 'alta'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_tasks_client ON tasks (client_id)',
        'CREATE INDEX idx_tasks_status ON tasks (status)',
        'CREATE INDEX idx_tasks_due ON tasks (due_date ASC)',
      ],
    })
    app.save(tasks)

    // 3. Settings Collection (System configs for WhatsApp API, SLAs, Company name)
    const settings = new Collection({
      name: 'system_settings',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'setting_key', type: 'text', required: true },
        { name: 'setting_value', type: 'text', required: false },
        { name: 'description', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_settings_key ON system_settings (setting_key)'],
    })
    app.save(settings)

    // 4. Messages / Interaction log
    const messages = new Collection({
      name: 'messages',
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
          collectionId: clients.id,
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'direction',
          type: 'select',
          required: true,
          values: ['inbound', 'outbound'],
          maxSelect: 1,
        },
        { name: 'message_text', type: 'text', required: true },
        { name: 'sender_name', type: 'text', required: false },
        {
          name: 'sent_by_user',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'whatsapp_message_id', type: 'text', required: false },
        {
          name: 'status',
          type: 'select',
          values: ['sent', 'delivered', 'read', 'failed'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_messages_client ON messages (client_id, created ASC)'],
    })
    app.save(messages)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('messages'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('tasks'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('clients'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('system_settings'))
    } catch (_) {}
  },
)
