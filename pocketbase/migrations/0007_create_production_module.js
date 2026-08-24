migrate(
  (app) => {
    // 1. Clean up "Contato iniciado" from clients and kanban_columns if it exists
    try {
      app
        .db()
        .newQuery(`
      UPDATE clients SET stage = 'Novo contato' WHERE stage = 'Contato iniciado'
    `)
        .execute()
    } catch (err) {
      console.log('Error updating clients stage from Contato iniciado:', err)
    }

    try {
      app
        .db()
        .newQuery(`
      DELETE FROM kanban_columns WHERE internal_id = 'contact_initiated' OR name = 'Contato iniciado'
    `)
        .execute()
    } catch (err) {
      console.log('Error deleting Contato iniciado column:', err)
    }

    // Re-index order_index for commercial kanban columns
    try {
      const commercialCols = [
        { internal_id: 'new_contact', name: 'Novo contato', order: 0 },
        { internal_id: 'needs_response', name: 'Precisa responder', order: 1 },
        { internal_id: 'in_service', name: 'Em atendimento', order: 2 },
        { internal_id: 'quote_sent', name: 'Orçamento enviado', order: 3 },
        { internal_id: 'waiting_customer', name: 'Aguardando cliente', order: 4 },
        { internal_id: 'won', name: 'Venda fechada', order: 5 },
        { internal_id: 'lost', name: 'Não fechou', order: 6 },
      ]
      for (const c of commercialCols) {
        app
          .db()
          .newQuery(`
        UPDATE kanban_columns SET order_index = {:order} WHERE internal_id = {:id}
      `)
          .bind({ order: c.order, id: c.internal_id })
          .execute()
      }
    } catch (err) {
      console.log('Error reindexing commercial columns:', err)
    }

    // 2. Create production_stages collection
    const usersCollection = app.findCollectionByNameOrId('_pb_users_auth_')
    const clientsCollection = app.findCollectionByNameOrId('clients')
    const archivedDealsCollection = app.findCollectionByNameOrId('archived_deals')

    const productionStages = new Collection({
      name: 'production_stages',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: '', // public read for public tracking
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'internal_id', type: 'text', required: true },
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'color', type: 'text' },
        { name: 'order_index', type: 'number' },
        { name: 'is_visible', type: 'bool' },
        { name: 'auto_notify_whatsapp', type: 'bool' },
        { name: 'whatsapp_message_template', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_prod_stages_internal ON production_stages (internal_id)',
        'CREATE INDEX idx_prod_stages_order ON production_stages (order_index)',
      ],
    })
    app.save(productionStages)

    // 3. Create production_orders collection
    const productionOrders = new Collection({
      name: 'production_orders',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: '', // public read for tracking token
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'order_number', type: 'text', required: true },
        { name: 'tracking_token', type: 'text', required: true },
        {
          name: 'client_id',
          type: 'relation',
          required: true,
          collectionId: clientsCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'client_name', type: 'text', required: true },
        { name: 'client_phone', type: 'text', required: true },
        { name: 'client_email', type: 'email' },
        {
          name: 'deal_origin_id',
          type: 'relation',
          collectionId: archivedDealsCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'sale_date', type: 'date' },
        { name: 'product', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'quantity', type: 'number' },
        { name: 'dimensions', type: 'text' },
        { name: 'total_value', type: 'number' },
        {
          name: 'sales_rep_id',
          type: 'relation',
          collectionId: usersCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'production_rep_id',
          type: 'relation',
          collectionId: usersCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'promised_deadline', type: 'date' },
        { name: 'estimated_delivery_date', type: 'date' },
        { name: 'completed_at', type: 'date' },
        {
          name: 'delivery_type',
          type: 'select',
          values: ['retirada', 'envio', 'entrega_propria'],
          maxSelect: 1,
        },
        { name: 'tracking_code', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'attachments', type: 'file', maxSelect: 10, maxSize: 52428800 },
        { name: 'art_approved', type: 'bool' },
        { name: 'art_approved_at', type: 'date' },
        {
          name: 'stage_id',
          type: 'relation',
          collectionId: productionStages.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'stage_internal_id', type: 'text', required: true },
        { name: 'stage_name', type: 'text', required: true },
        {
          name: 'priority',
          type: 'select',
          values: ['baixa', 'media', 'alta', 'urgente'],
          maxSelect: 1,
        },
        { name: 'is_completed', type: 'bool' },
        { name: 'is_archived', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_prod_order_num ON production_orders (order_number)',
        'CREATE UNIQUE INDEX idx_prod_order_token ON production_orders (tracking_token)',
        'CREATE INDEX idx_prod_order_client ON production_orders (client_id)',
        'CREATE INDEX idx_prod_order_stage ON production_orders (stage_internal_id)',
        'CREATE INDEX idx_prod_order_completed ON production_orders (is_completed)',
        'CREATE INDEX idx_prod_order_deadline ON production_orders (promised_deadline)',
      ],
    })
    app.save(productionOrders)

    // 4. Create production_logs collection (Auditoria e Histórico de Mudanças)
    const productionLogs = new Collection({
      name: 'production_logs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: '', // public read for tracking if needed
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'order_id',
          type: 'relation',
          required: true,
          collectionId: productionOrders.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'from_stage_id', type: 'text' },
        { name: 'from_stage_name', type: 'text' },
        { name: 'to_stage_id', type: 'text', required: true },
        { name: 'to_stage_name', type: 'text', required: true },
        {
          name: 'user_id',
          type: 'relation',
          collectionId: usersCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'user_name', type: 'text' },
        { name: 'change_type', type: 'select', values: ['manual', 'automatic'], maxSelect: 1 },
        { name: 'notes', type: 'text' },
        { name: 'whatsapp_sent', type: 'bool' },
        {
          name: 'whatsapp_status',
          type: 'select',
          values: ['nao_enviado', 'enviado', 'entregue', 'falhou'],
          maxSelect: 1,
        },
        { name: 'whatsapp_message', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prod_logs_order ON production_logs (order_id)',
        'CREATE INDEX idx_prod_logs_created ON production_logs (created)',
      ],
    })
    app.save(productionLogs)

    // 5. Create production_proofs collection (Histórico de Aprovação de Arte)
    const productionProofs = new Collection({
      name: 'production_proofs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: '',
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'order_id',
          type: 'relation',
          required: true,
          collectionId: productionOrders.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'version_number', type: 'number' },
        { name: 'proof_url', type: 'text' },
        { name: 'proof_file', type: 'file', maxSelect: 5, maxSize: 52428800 },
        { name: 'sent_at', type: 'date' },
        {
          name: 'sent_by',
          type: 'relation',
          collectionId: usersCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          values: ['aguardando_aprovacao', 'aprovado', 'alteracao_solicitada'],
          maxSelect: 1,
        },
        { name: 'feedback_notes', type: 'text' },
        { name: 'client_comment', type: 'text' },
        { name: 'approved_at', type: 'date' },
        { name: 'approved_by_contact', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_prod_proofs_order ON production_proofs (order_id)'],
    })
    app.save(productionProofs)

    // 6. Seed default production stages
    const defaultStages = [
      {
        internal_id: 'order_received',
        name: 'Pedido recebido',
        description: 'Pedido confirmado e registrado no sistema',
        color: 'blue',
        order_index: 0,
        is_visible: true,
        auto_notify_whatsapp: true,
        whatsapp_message_template:
          'Olá, {{nome}}! Seu pedido #{{pedido}} foi confirmado e já entrou em nosso sistema. Você receberá atualizações por aqui conforme ele avançar.',
      },
      {
        internal_id: 'awaiting_info',
        name: 'Aguardando informações/arquivo',
        description: 'Aguardando envio de arquivos, logos ou informações adicionais',
        color: 'amber',
        order_index: 1,
        is_visible: true,
        auto_notify_whatsapp: true,
        whatsapp_message_template:
          'Olá, {{nome}}! Para darmos andamento ao pedido #{{pedido}}, precisamos que envie as informações/arquivos pendentes.',
      },
      {
        internal_id: 'art_preparation',
        name: 'Arte em preparação',
        description: 'Equipe de design diagramando e ajustando arte/prova digital',
        color: 'indigo',
        order_index: 2,
        is_visible: true,
        auto_notify_whatsapp: false,
        whatsapp_message_template: '',
      },
      {
        internal_id: 'awaiting_approval',
        name: 'Aguardando aprovação do cliente',
        description: 'Prova digital enviada ao cliente aguardando OK final',
        color: 'purple',
        order_index: 3,
        is_visible: true,
        auto_notify_whatsapp: true,
        whatsapp_message_template:
          'Olá, {{nome}}! A arte do seu pedido #{{pedido}} está pronta para aprovação. Por favor, confira para podermos continuar a produção. Link de acompanhamento: {{link_acompanhamento}}',
      },
      {
        internal_id: 'approved',
        name: 'Aprovado',
        description: 'Arte e especificações aprovadas pelo cliente',
        color: 'cyan',
        order_index: 4,
        is_visible: true,
        auto_notify_whatsapp: true,
        whatsapp_message_template:
          'Tudo certo! A arte do seu pedido #{{pedido}} foi aprovada e seguirá para produção.',
      },
      {
        internal_id: 'in_production',
        name: 'Em produção',
        description: 'Impressão, laminação, corte, vinco e acabamentos',
        color: 'amber',
        order_index: 5,
        is_visible: true,
        auto_notify_whatsapp: true,
        whatsapp_message_template:
          'Seu pedido #{{pedido}} entrou em produção. Avisaremos assim que estiver pronto.',
      },
      {
        internal_id: 'ready',
        name: 'Pronto',
        description: 'Material pronto no setor de expedição / balcão',
        color: 'emerald',
        order_index: 6,
        is_visible: true,
        auto_notify_whatsapp: true,
        whatsapp_message_template:
          'Boas notícias! Seu pedido #{{pedido}} está pronto para retirada no balcão da gráfica!',
      },
      {
        internal_id: 'shipped',
        name: 'Enviado / Aguardando retirada',
        description: 'Despachado para entrega ou aguardando cliente retirar',
        color: 'blue',
        order_index: 7,
        is_visible: true,
        auto_notify_whatsapp: true,
        whatsapp_message_template: 'Seu pedido #{{pedido}} foi enviado! {{codigo_rastreio}}',
      },
      {
        internal_id: 'completed',
        name: 'Concluído',
        description: 'Pedido entregue e finalizado com sucesso',
        color: 'slate',
        order_index: 8,
        is_visible: true,
        auto_notify_whatsapp: true,
        whatsapp_message_template:
          'Pedido #{{pedido}} concluído com sucesso! Agradecemos a preferência pela Gráfica Laletra.',
      },
    ]

    const stagesCol = app.findCollectionByNameOrId('production_stages')
    const stageRecordsMap = {}
    for (const st of defaultStages) {
      const record = new Record(stagesCol)
      record.set('internal_id', st.internal_id)
      record.set('name', st.name)
      record.set('description', st.description)
      record.set('color', st.color)
      record.set('order_index', st.order_index)
      record.set('is_visible', st.is_visible)
      record.set('auto_notify_whatsapp', st.auto_notify_whatsapp)
      record.set('whatsapp_message_template', st.whatsapp_message_template)
      app.save(record)
      stageRecordsMap[st.internal_id] = record
    }

    // 7. Seed sample production orders for demonstration
    try {
      const clientsList = app.findRecordsByFilter(
        'clients',
        'is_archived = false',
        '-created',
        5,
        0,
      )
      const orderCol = app.findCollectionByNameOrId('production_orders')
      const logsCol = app.findCollectionByNameOrId('production_logs')

      if (clientsList.length > 0) {
        const demoClient1 = clientsList[0]
        const order1 = new Record(orderCol)
        order1.set('order_number', '#001842')
        order1.set('tracking_token', 'tk_' + $security.randomString(20))
        order1.set('client_id', demoClient1.id)
        order1.set('client_name', demoClient1.getString('name') || 'Cliente Laletra')
        order1.set('client_phone', demoClient1.getString('phone') || '+55 11 99999-9999')
        order1.set('client_email', demoClient1.getString('email') || '')
        order1.set('sale_date', new Date().toISOString())
        order1.set('product', '1.000 Cartões de Visita 4x4')
        order1.set('description', 'Couché 300g, Laminação Fosca + Verniz Localizado frente e verso')
        order1.set('quantity', 1000)
        order1.set('dimensions', '9x5 cm')
        order1.set('total_value', 120.0)
        order1.set(
          'promised_deadline',
          new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        )
        order1.set(
          'estimated_delivery_date',
          new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        )
        order1.set('delivery_type', 'retirada')
        order1.set('notes', 'Cliente solicitou cantos arredondados raio 5mm.')
        order1.set('art_approved', true)
        order1.set('art_approved_at', new Date().toISOString())
        order1.set('stage_id', stageRecordsMap['in_production']?.id)
        order1.set('stage_internal_id', 'in_production')
        order1.set('stage_name', 'Em produção')
        order1.set('priority', 'alta')
        order1.set('is_completed', false)
        order1.set('is_archived', false)
        app.save(order1)

        // Log for order 1
        const log1 = new Record(logsCol)
        log1.set('order_id', order1.id)
        log1.set('from_stage_id', 'approved')
        log1.set('from_stage_name', 'Aprovado')
        log1.set('to_stage_id', 'in_production')
        log1.set('to_stage_name', 'Em produção')
        log1.set('user_name', 'Sistema de Produção')
        log1.set('change_type', 'manual')
        log1.set('notes', 'Arte aprovada enviada para impressão offset.')
        log1.set('whatsapp_sent', true)
        log1.set('whatsapp_status', 'entregue')
        log1.set(
          'whatsapp_message',
          'Seu pedido #001842 entrou em produção. Avisaremos assim que estiver pronto.',
        )
        app.save(log1)

        if (clientsList.length > 1) {
          const demoClient2 = clientsList[1]
          const order2 = new Record(orderCol)
          order2.set('order_number', '#001843')
          order2.set('tracking_token', 'tk_' + $security.randomString(20))
          order2.set('client_id', demoClient2.id)
          order2.set('client_name', demoClient2.getString('name') || 'Restaurante Sabor Real')
          order2.set('client_phone', demoClient2.getString('phone') || '+55 11 98888-8888')
          order2.set('client_email', demoClient2.getString('email') || '')
          order2.set('sale_date', new Date().toISOString())
          order2.set('product', '500 Cardápios Wire-o')
          order2.set(
            'description',
            'Papel Couché 250g com laminação brilhante cristal, wire-o preto',
          )
          order2.set('quantity', 500)
          order2.set('dimensions', 'A4 (21x29.7 cm)')
          order2.set('total_value', 450.0)
          order2.set(
            'promised_deadline',
            new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          )
          order2.set('delivery_type', 'envio')
          order2.set('notes', 'Aguardando cliente validar os preços dos pratos no mockup.')
          order2.set('art_approved', false)
          order2.set('stage_id', stageRecordsMap['awaiting_approval']?.id)
          order2.set('stage_internal_id', 'awaiting_approval')
          order2.set('stage_name', 'Aguardando aprovação do cliente')
          order2.set('priority', 'media')
          order2.set('is_completed', false)
          order2.set('is_archived', false)
          app.save(order2)
        }
      }
    } catch (err) {
      console.log('Error seeding sample production orders:', err)
    }
  },
  (app) => {
    try {
      const proofs = app.findCollectionByNameOrId('production_proofs')
      app.delete(proofs)
    } catch (_) {}
    try {
      const logs = app.findCollectionByNameOrId('production_logs')
      app.delete(logs)
    } catch (_) {}
    try {
      const orders = app.findCollectionByNameOrId('production_orders')
      app.delete(orders)
    } catch (_) {}
    try {
      const stages = app.findCollectionByNameOrId('production_stages')
      app.delete(stages)
    } catch (_) {}
  },
)
