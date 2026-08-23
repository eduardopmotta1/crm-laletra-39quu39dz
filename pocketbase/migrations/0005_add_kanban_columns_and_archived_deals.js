migrate(
  (app) => {
    const clientsCol = app.findCollectionByNameOrId('clients')

    // 1. Add fields to clients collection for active/archived status and returned highlight
    if (!clientsCol.fields.getByName('is_archived')) {
      clientsCol.fields.add(new BoolField({ name: 'is_archived' }))
    }
    if (!clientsCol.fields.getByName('has_returned')) {
      clientsCol.fields.add(new BoolField({ name: 'has_returned' }))
    }
    if (!clientsCol.fields.getByName('reopened_at')) {
      clientsCol.fields.add(new DateField({ name: 'reopened_at' }))
    }
    if (!clientsCol.fields.getByName('closed_at')) {
      clientsCol.fields.add(new DateField({ name: 'closed_at' }))
    }
    if (!clientsCol.fields.getByName('last_archived_deal_id')) {
      clientsCol.fields.add(new TextField({ name: 'last_archived_deal_id' }))
    }
    app.save(clientsCol)

    // Add index for is_archived on clients
    try {
      clientsCol.addIndex('idx_clients_is_archived', false, 'is_archived', '')
      app.save(clientsCol)
    } catch (_) {}

    // 2. Kanban Columns Collection
    let kanbanColumnsCol
    try {
      kanbanColumnsCol = app.findCollectionByNameOrId('kanban_columns')
    } catch (_) {
      kanbanColumnsCol = new Collection({
        name: 'kanban_columns',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'internal_id', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'description', type: 'text', required: false },
          { name: 'color', type: 'text', required: false },
          { name: 'order_index', type: 'number', required: false, min: 0 },
          { name: 'is_visible', type: 'bool', required: false },
          {
            name: 'stage_type',
            type: 'select',
            required: true,
            values: ['initial', 'intermediate', 'final'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_kanban_col_internal ON kanban_columns (internal_id)',
          'CREATE INDEX idx_kanban_col_order ON kanban_columns (order_index ASC)',
        ],
      })
      app.save(kanbanColumnsCol)
    }

    // Seed default Kanban Columns
    const defaultColumns = [
      {
        internal_id: 'new_contact',
        name: 'Novo contato',
        description: 'Novas mensagens ou leads cadastrados',
        color: 'blue',
        order_index: 0,
        is_visible: true,
        stage_type: 'initial',
      },
      {
        internal_id: 'contact_initiated',
        name: 'Contato iniciado',
        description: 'Template WhatsApp enviado ao cliente',
        color: 'cyan',
        order_index: 1,
        is_visible: true,
        stage_type: 'intermediate',
      },
      {
        internal_id: 'needs_response',
        name: 'Precisa responder',
        description: 'Clientes aguardando nossa resposta (SLA ativo)',
        color: 'rose',
        order_index: 2,
        is_visible: true,
        stage_type: 'intermediate',
      },
      {
        internal_id: 'in_service',
        name: 'Em atendimento',
        description: 'Briefing e especificações técnicas',
        color: 'amber',
        order_index: 3,
        is_visible: true,
        stage_type: 'intermediate',
      },
      {
        internal_id: 'quote_sent',
        name: 'Orçamento enviado',
        description: 'Proposta de preços encaminhada',
        color: 'purple',
        order_index: 4,
        is_visible: true,
        stage_type: 'intermediate',
      },
      {
        internal_id: 'waiting_customer',
        name: 'Aguardando cliente',
        description: 'Aguardando aprovação ou arte final',
        color: 'indigo',
        order_index: 5,
        is_visible: true,
        stage_type: 'intermediate',
      },
      {
        internal_id: 'won',
        name: 'Venda fechada',
        description: 'PIX/Pagamento aprovado & em produção',
        color: 'emerald',
        order_index: 6,
        is_visible: true,
        stage_type: 'final',
      },
      {
        internal_id: 'lost',
        name: 'Não fechou',
        description: 'Orçamento recusado ou cancelado',
        color: 'slate',
        order_index: 7,
        is_visible: true,
        stage_type: 'final',
      },
    ]

    for (const col of defaultColumns) {
      try {
        app.findFirstRecordByData('kanban_columns', 'internal_id', col.internal_id)
      } catch (_) {
        const rec = new Record(kanbanColumnsCol)
        rec.set('internal_id', col.internal_id)
        rec.set('name', col.name)
        rec.set('description', col.description)
        rec.set('color', col.color)
        rec.set('order_index', col.order_index)
        rec.set('is_visible', col.is_visible)
        rec.set('stage_type', col.stage_type)
        app.save(rec)
      }
    }

    // 3. Archived Deals Collection
    let archivedDealsCol
    try {
      archivedDealsCol = app.findCollectionByNameOrId('archived_deals')
    } catch (_) {
      archivedDealsCol = new Collection({
        name: 'archived_deals',
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
            cascadeDelete: true,
            maxSelect: 1,
            required: true,
          },
          { name: 'client_name', type: 'text', required: true },
          { name: 'client_phone', type: 'text', required: true },
          { name: 'client_email', type: 'email', required: false },
          {
            name: 'result',
            type: 'select',
            required: true,
            values: ['Venda fechada', 'Venda perdida'],
            maxSelect: 1,
          },
          { name: 'loss_reason', type: 'text', required: false },
          { name: 'loss_category', type: 'text', required: false },
          { name: 'product_interest', type: 'text', required: false },
          { name: 'quote_value', type: 'number', required: false, min: 0 },
          { name: 'closed_at', type: 'date', required: true },
          {
            name: 'assigned_to',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'closed_by',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'final_notes', type: 'text', required: false },
          { name: 'duration_days', type: 'number', required: false, min: 0 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_archived_client ON archived_deals (client_id)',
          'CREATE INDEX idx_archived_result ON archived_deals (result)',
          'CREATE INDEX idx_archived_closed_at ON archived_deals (closed_at DESC)',
          'CREATE INDEX idx_archived_assigned ON archived_deals (assigned_to)',
        ],
      })
      app.save(archivedDealsCol)
    }

    // 4. Stage Transitions Collection (Audit / history log)
    let stageTransitionsCol
    try {
      stageTransitionsCol = app.findCollectionByNameOrId('stage_transitions')
    } catch (_) {
      stageTransitionsCol = new Collection({
        name: 'stage_transitions',
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
            cascadeDelete: true,
            maxSelect: 1,
            required: true,
          },
          { name: 'from_stage', type: 'text', required: false },
          { name: 'to_stage', type: 'text', required: true },
          { name: 'from_stage_id', type: 'text', required: false },
          { name: 'to_stage_id', type: 'text', required: false },
          {
            name: 'change_type',
            type: 'select',
            required: true,
            values: ['manual', 'automatic'],
            maxSelect: 1,
          },
          {
            name: 'user_id',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'user_name', type: 'text', required: false },
          { name: 'notes', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_stage_trans_client ON stage_transitions (client_id, created DESC)',
          'CREATE INDEX idx_stage_trans_user ON stage_transitions (user_id)',
        ],
      })
      app.save(stageTransitionsCol)
    }

    // 5. Seed default auto-archive settings
    const defaultAutoArchiveSettings = [
      {
        key: 'auto_archive_enabled',
        val: 'true',
        desc: 'Habilita arquivamento automático de atendimentos finalizados',
      },
      {
        key: 'auto_archive_won_hours',
        val: '24',
        desc: 'Horas após fechamento para arquivar venda fechada (ex: 24)',
      },
      {
        key: 'auto_archive_lost_hours',
        val: '24',
        desc: 'Horas após encerramento para arquivar venda perdida (ex: 24)',
      },
    ]

    const settingsCol = app.findCollectionByNameOrId('system_settings')
    for (const s of defaultAutoArchiveSettings) {
      try {
        app.findFirstRecordByData('system_settings', 'setting_key', s.key)
      } catch (_) {
        const rec = new Record(settingsCol)
        rec.set('setting_key', s.key)
        rec.set('setting_value', s.val)
        rec.set('description', s.desc)
        app.save(rec)
      }
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('stage_transitions'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('archived_deals'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('kanban_columns'))
    } catch (_) {}
  },
)
