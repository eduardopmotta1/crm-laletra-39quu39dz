migrate(
  (app) => {
    const clientsCol = app.findCollectionByNameOrId('clients')
    const tasksCol = app.findCollectionByNameOrId('tasks')
    const archivedDealsCol = app.findCollectionByNameOrId('archived_deals')

    // 1. Add fields to clients collection for relationship & customer metrics
    if (!clientsCol.fields.getByName('relationship_status')) {
      clientsCol.fields.add(
        new SelectField({
          name: 'relationship_status',
          required: false,
          values: ['satisfied', 'dissatisfied', 'in_recovery', 'recovered', 'neutral'],
          maxSelect: 1,
        }),
      )
    }
    if (!clientsCol.fields.getByName('total_purchases')) {
      clientsCol.fields.add(new NumberField({ name: 'total_purchases', min: 0 }))
    }
    if (!clientsCol.fields.getByName('total_purchase_value')) {
      clientsCol.fields.add(new NumberField({ name: 'total_purchase_value', min: 0 }))
    }
    if (!clientsCol.fields.getByName('first_purchase_date')) {
      clientsCol.fields.add(new DateField({ name: 'first_purchase_date' }))
    }
    if (!clientsCol.fields.getByName('last_purchase_date')) {
      clientsCol.fields.add(new DateField({ name: 'last_purchase_date' }))
    }
    app.save(clientsCol)

    // 2. Create evaluations collection
    let evaluationsCol
    try {
      evaluationsCol = app.findCollectionByNameOrId('evaluations')
    } catch (_) {
      evaluationsCol = new Collection({
        name: 'evaluations',
        type: 'base',
        // list/view allow public (so token-based lookup or evaluation viewing works) or auth
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'token', type: 'text', required: true },
          {
            name: 'client_id',
            type: 'relation',
            collectionId: clientsCol.id,
            cascadeDelete: true,
            maxSelect: 1,
            required: true,
          },
          {
            name: 'attendance_id',
            type: 'relation',
            collectionId: archivedDealsCol.id,
            cascadeDelete: false,
            maxSelect: 1,
            required: false,
          },
          { name: 'attendance_deal_id', type: 'text', required: false },
          { name: 'overall_rating', type: 'number', min: 1, max: 5, required: true },
          { name: 'service_rating', type: 'number', min: 1, max: 5, required: false },
          { name: 'quality_rating', type: 'number', min: 1, max: 5, required: false },
          { name: 'delivery_rating', type: 'number', min: 1, max: 5, required: false },
          { name: 'comment', type: 'text', required: false },
          {
            name: 'status',
            type: 'select',
            values: ['pending_contact', 'in_recovery', 'resolved', 'satisfied'],
            maxSelect: 1,
            required: false,
          },
          { name: 'resolved', type: 'bool', required: false },
          { name: 'resolved_at', type: 'date', required: false },
          { name: 'resolved_notes', type: 'text', required: false },
          {
            name: 'resolved_by',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_evaluations_token ON evaluations (token)',
          'CREATE INDEX idx_evaluations_client ON evaluations (client_id)',
          'CREATE INDEX idx_evaluations_attendance ON evaluations (attendance_id)',
          'CREATE INDEX idx_evaluations_created ON evaluations (created DESC)',
          'CREATE INDEX idx_evaluations_rating ON evaluations (overall_rating)',
        ],
      })
      app.save(evaluationsCol)
    }

    // 3. Create post_sales collection
    let postSalesCol
    try {
      postSalesCol = app.findCollectionByNameOrId('post_sales')
    } catch (_) {
      postSalesCol = new Collection({
        name: 'post_sales',
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
          {
            name: 'attendance_id',
            type: 'relation',
            collectionId: archivedDealsCol.id,
            cascadeDelete: false,
            maxSelect: 1,
            required: false,
          },
          { name: 'scheduled_date', type: 'date', required: true },
          { name: 'sent_date', type: 'date', required: false },
          {
            name: 'status',
            type: 'select',
            values: ['pending', 'sent', 'completed', 'cancelled'],
            maxSelect: 1,
            required: true,
          },
          {
            name: 'task_id',
            type: 'relation',
            collectionId: tasksCol.id,
            cascadeDelete: false,
            maxSelect: 1,
            required: false,
          },
          { name: 'evaluation_token', type: 'text', required: false },
          { name: 'channel', type: 'text', required: false },
          { name: 'notes', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_postsales_client ON post_sales (client_id)',
          'CREATE INDEX idx_postsales_attendance ON post_sales (attendance_id)',
          'CREATE INDEX idx_postsales_status ON post_sales (status)',
          'CREATE INDEX idx_postsales_scheduled ON post_sales (scheduled_date)',
        ],
      })
      app.save(postSalesCol)
    }

    // 4. Seed default Post-Sale Settings
    const defaultPostSaleSettings = [
      {
        key: 'post_sale_enabled',
        val: 'true',
        desc: 'Habilita a rotina e agendamento automático de pós-venda',
      },
      {
        key: 'post_sale_delay_days',
        val: '3',
        desc: 'Dias após conclusão da venda para realizar o pós-venda (1, 3, 7 ou personalizado)',
      },
      {
        key: 'post_sale_auto_task',
        val: 'true',
        desc: 'Cria automaticamente uma tarefa no CRM na data agendada do pós-venda',
      },
      {
        key: 'post_sale_whatsapp_template',
        val: 'avaliacao_atendimento',
        desc: 'Template padrão de WhatsApp para convite de avaliação',
      },
      {
        key: 'post_sale_custom_message',
        val: 'Olá {{nome}}! Seu pedido foi entregue recentemente pela Laletra. Poderia avaliar sua experiência conosco no link: {{link_avaliacao}} ? Agradecemos muito!',
        desc: 'Mensagem de pós-venda padrão com link dinâmico de avaliação',
      },
    ]

    const settingsCol = app.findCollectionByNameOrId('system_settings')
    for (const s of defaultPostSaleSettings) {
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
      app.delete(app.findCollectionByNameOrId('post_sales'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('evaluations'))
    } catch (_) {}
  },
)
