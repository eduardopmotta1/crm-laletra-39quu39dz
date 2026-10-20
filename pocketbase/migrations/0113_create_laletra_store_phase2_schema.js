migrate(
  (app) => {
    // 1. store_customers (base collection para compradores da loja com auth ou perfil próprio)
    if (!app.hasTable('store_customers')) {
      let clientsColId = ''
      try {
        const cCol = app.findCollectionByNameOrId('clients')
        if (cCol) clientsColId = cCol.id
      } catch (_) {}

      const custFields = [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'text', required: true },
        { name: 'normalized_phone', type: 'text' },
        {
          name: 'person_type',
          type: 'select',
          required: true,
          values: ['pf', 'pj'],
        },
        { name: 'document_cpf_cnpj', type: 'text' },
        { name: 'trade_name', type: 'text' },
        { name: 'password_hash', type: 'text' },
        { name: 'reset_token', type: 'text' },
        { name: 'reset_token_expires_at', type: 'date' },
        {
          name: 'crm_link_status',
          type: 'select',
          values: ['unlinked', 'suggested', 'verified_linked', 'rejected'],
        },
        { name: 'crm_link_notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ]

      if (clientsColId) {
        custFields.push({
          name: 'linked_client_id',
          type: 'relation',
          required: false,
          collectionId: clientsColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      const custCol = new Collection({
        name: 'store_customers',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: custFields,
        indexes: [
          ],
      })
      app.save(custCol)
    }

    const custColRecord = app.findCollectionByNameOrId('store_customers')
    const custColId = custColRecord.id

    // 2. store_addresses (endereços de entrega/faturamento do comprador)
    if (!app.hasTable('store_addresses')) {
      const addrCol = new Collection({
        name: 'store_addresses',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'customer_id',
            type: 'relation',
            required: true,
            collectionId: custColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'label', type: 'text' }, // Ex: "Sede", "Casa", "Galpão"
          { name: 'zip_code', type: 'text', required: true },
          { name: 'street', type: 'text', required: true },
          { name: 'number', type: 'text', required: true },
          { name: 'complement', type: 'text' },
          { name: 'neighborhood', type: 'text', required: true },
          { name: 'city', type: 'text', required: true },
          { name: 'state', type: 'text', required: true },
          { name: 'is_default', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_store_addr_cust ON store_addresses (customer_id)',
        ],
      })
      app.save(addrCol)
    }

    // 3. store_orders (pedidos da loja com idempotência, congelamento de valores, status etc.)
    if (!app.hasTable('store_orders')) {
      let prodOrdersColId = ''
      try {
        const po = app.findCollectionByNameOrId('production_orders')
        if (po) prodOrdersColId = po.id
      } catch (_) {}

      const orderFields = [
        { name: 'order_number', type: 'text', required: true },
        { name: 'client_request_id', type: 'text', required: true }, // UNIQUE para idempotência do checkout
        {
          name: 'customer_id',
          type: 'relation',
          required: false,
          collectionId: custColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'customer_name', type: 'text', required: true },
        { name: 'customer_email', type: 'email', required: true },
        { name: 'customer_phone', type: 'text', required: true },
        { name: 'customer_document', type: 'text' },
        {
          name: 'delivery_method',
          type: 'select',
          required: true,
          values: ['pickup', 'delivery'],
        },
        { name: 'shipping_address', type: 'json' },
        { name: 'subtotal', type: 'number', required: true },
        { name: 'shipping_fee', type: 'number', required: true },
        { name: 'discount_amount', type: 'number' },
        { name: 'total_amount', type: 'number', required: true },
        {
          name: 'payment_status',
          type: 'select',
          required: true,
          values: ['pending', 'authorized', 'paid', 'failed', 'refunded'],
        },
        {
          name: 'payment_method',
          type: 'select',
          values: ['pix', 'credit_card', 'bank_slip', 'billed_invoice'],
        },
        {
          name: 'art_status',
          type: 'select',
          required: true,
          values: ['pending_upload', 'uploaded', 'under_review', 'approved', 'rejected'],
        },
        {
          name: 'production_status',
          type: 'select',
          required: true,
          values: ['waiting_release', 'released_to_production', 'in_production', 'ready', 'delivered'],
        },
        { name: 'estimated_days', type: 'number' },
        { name: 'estimated_delivery_date', type: 'date' },
        { name: 'notes', type: 'text' },
        { name: 'human_intervention_needed', type: 'bool' },
        { name: 'human_intervention_reason', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ]

      if (prodOrdersColId) {
        orderFields.push({
          name: 'production_order_id',
          type: 'relation',
          required: false,
          collectionId: prodOrdersColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      const orderCol = new Collection({
        name: 'store_orders',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: orderFields,
        indexes: [
          'CREATE INDEX idx_store_order_created ON store_orders (created DESC)'],
      })
      app.save(orderCol)
    }

    const orderColRecord = app.findCollectionByNameOrId('store_orders')
    const orderColId = orderColRecord.id

    // 4. store_order_items (itens do pedido com especificações e valores congelados)
    if (!app.hasTable('store_order_items')) {
      let storeProdColId = ''
      try {
        const sp = app.findCollectionByNameOrId('store_products')
        if (sp) storeProdColId = sp.id
      } catch (_) {}

      const itemFields = [
        {
          name: 'order_id',
          type: 'relation',
          required: true,
          collectionId: orderColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'product_name', type: 'text', required: true },
        { name: 'pricing_type', type: 'text', required: true },
        { name: 'quantity', type: 'number', required: true },
        { name: 'width', type: 'number' },
        { name: 'height', type: 'number' },
        { name: 'area_m2', type: 'number' },
        { name: 'selected_options', type: 'json' },
        { name: 'selected_finishings', type: 'json' },
        { name: 'unit_price', type: 'number', required: true },
        { name: 'total_price', type: 'number', required: true },
        { name: 'lead_time_days', type: 'number' },
        { name: 'art_notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ]

      if (storeProdColId) {
        itemFields.push({
          name: 'product_id',
          type: 'relation',
          required: false,
          collectionId: storeProdColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      const itemCol = new Collection({
        name: 'store_order_items',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: itemFields,
        indexes: [
        ],
      })
      app.save(itemCol)
    }

    // 5. store_payments (registros estruturados de pagamento / preparação Mercado Pago)
    if (!app.hasTable('store_payments')) {
      const payCol = new Collection({
        name: 'store_payments',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'order_id',
            type: 'relation',
            required: true,
            collectionId: orderColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'gateway',
            type: 'select',
            required: true,
            values: ['mercadopago', 'mock_gateway', 'manual'],
          },
          {
            name: 'method',
            type: 'select',
            required: true,
            values: ['pix', 'credit_card', 'bank_slip', 'billed_invoice'],
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['pending', 'authorized', 'paid', 'failed', 'refunded'],
          },
          { name: 'amount', type: 'number', required: true },
          { name: 'gateway_payment_id', type: 'text' },
          { name: 'gateway_status', type: 'text' },
          { name: 'idempotency_key', type: 'text' },
          { name: 'pix_qr_code', type: 'text' },
          { name: 'pix_qr_code_base64', type: 'text' },
          { name: 'raw_webhook_payload', type: 'json' },
          { name: 'paid_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_store_pay_order ON store_payments (order_id)',
          'CREATE INDEX idx_store_pay_gw_id ON store_payments (gateway_payment_id)',
          'CREATE INDEX idx_store_pay_idem ON store_payments (idempotency_key)',
        ],
      })
      app.save(payCol)
    }

    // 6. store_art_uploads (arquivos de arte enviados pelo comprador)
    if (!app.hasTable('store_art_uploads')) {
      const artCol = new Collection({
        name: 'store_art_uploads',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'order_id',
            type: 'relation',
            required: true,
            collectionId: orderColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'art_file',
            type: 'file',
            required: true,
            maxSelect: 1,
            maxSize: 31457280, // 30MB
            mimeTypes: [
              'image/jpeg',
              'image/png',
              'image/webp',
              'application/pdf',
              'application/postscript',
              'image/x-eps',
              'application/illustrator',
              'application/zip',
            ],
          },
          { name: 'original_filename', type: 'text', required: true },
          { name: 'file_size', type: 'number' },
          { name: 'file_type', type: 'text' },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['uploaded', 'approved', 'rejected'],
          },
          { name: 'rejection_reason', type: 'text' },
          { name: 'customer_notes', type: 'text' },
          { name: 'reviewed_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_store_art_order ON store_art_uploads (order_id)',
        ],
      })
      app.save(artCol)
    }

    // 7. Seed de configurações de frete padrão em system_settings se não existirem
    try {
      const settingsCol = app.findCollectionByNameOrId('system_settings')
      const defaultSettings = [
        {
          key: 'store_shipping_rules',
          value: JSON.stringify({
            free_shipping_min_order: 350.0,
            pickup_enabled: true,
            pickup_label: 'Retirada no Balcão da Gráfica (Centro) - Grátis',
            pickup_fee: 0.0,
            standard_delivery_fee: 25.0,
            express_delivery_fee: 45.0,
            regional_tiers: [
              { region: 'Capital e Grande SP', fee: 25.0, days: 1 },
              { region: 'Interior SP', fee: 38.0, days: 2 },
              { region: 'Demais Estados', fee: 55.0, days: 4 },
            ],
          }),
          description: 'Regras e faixas de frete para Laletra Store Fase 2',
        },
        {
          key: 'store_mercadopago_config',
          value: JSON.stringify({
            mode: 'sandbox_simulated',
            public_key: 'TEST-mock-key-laletra-store',
            access_token_configured: false,
            webhook_secret_configured: false,
            installments_max: 6,
            pix_discount_pct: 5,
          }),
          description: 'Estrutura de integração Mercado Pago para checkout futuro',
        },
      ]

      for (const s of defaultSettings) {
        try {
          app.findFirstRecordByData('system_settings', 'setting_key', s.key)
        } catch (_) {
          const sRec = new Record(settingsCol)
          sRec.set('setting_key', s.key)
          sRec.set('setting_value', s.value)
          sRec.set('description', s.description)
          app.save(sRec)
        }
      }
    } catch (_) {}
  },
  (app) => {
    // Revert idempotent
    try {
      const col = app.findCollectionByNameOrId('store_art_uploads')
      if (col) app.delete(col)
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId('store_payments')
      if (col) app.delete(col)
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId('store_order_items')
      if (col) app.delete(col)
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId('store_orders')
      if (col) app.delete(col)
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId('store_addresses')
      if (col) app.delete(col)
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId('store_customers')
      if (col) app.delete(col)
    } catch (_) {}
  },
)