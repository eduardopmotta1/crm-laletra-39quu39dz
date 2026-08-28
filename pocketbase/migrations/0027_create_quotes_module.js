migrate(
  (app) => {
    // 1. Create quote_materials collection
    const quoteMaterials = new Collection({
      name: 'quote_materials',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'category', type: 'text', required: true },
        {
          name: 'calc_unit',
          type: 'select',
          values: ['m2', 'metro_linear', 'unidade', 'centimetro', 'quilo', 'valor_fixo'],
          maxSelect: 1,
          required: true,
        },
        { name: 'cost_price', type: 'number', required: false },
        { name: 'sale_price', type: 'number', required: false },
        { name: 'min_price', type: 'number', required: false },
        { name: 'is_active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_quote_mat_name ON quote_materials (name)',
        'CREATE INDEX idx_quote_mat_cat ON quote_materials (category)',
        'CREATE INDEX idx_quote_mat_active ON quote_materials (is_active)',
      ],
    })
    app.save(quoteMaterials)

    // 2. Create quote_additionals collection (acabamentos e adicionais: Ilhós, Costura, Bastão, etc.)
    const quoteAdditionals = new Collection({
      name: 'quote_additionals',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'category', type: 'text' },
        {
          name: 'calc_unit',
          type: 'select',
          values: ['unidade', 'metro_linear', 'm2', 'valor_fixo'],
          maxSelect: 1,
          required: true,
        },
        { name: 'cost_price', type: 'number', required: false },
        { name: 'sale_price', type: 'number', required: false },
        { name: 'min_price', type: 'number', required: false },
        { name: 'is_active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_quote_add_name ON quote_additionals (name)',
        'CREATE INDEX idx_quote_add_active ON quote_additionals (is_active)',
      ],
    })
    app.save(quoteAdditionals)

    // 3. Create quote_products collection
    const quoteProducts = new Collection({
      name: 'quote_products',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'category', type: 'text', required: true },
        { name: 'description', type: 'text' },
        {
          name: 'main_image',
          type: 'file',
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
        },
        {
          name: 'gallery_images',
          type: 'file',
          maxSelect: 8,
          maxSize: 10485760,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
        },
        {
          name: 'main_material_id',
          type: 'relation',
          collectionId: quoteMaterials.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'additionals',
          type: 'relation',
          collectionId: quoteAdditionals.id,
          cascadeDelete: false,
          maxSelect: 50,
        },
        {
          name: 'calc_rule',
          type: 'select',
          values: ['m2', 'metro_linear', 'unidade', 'preco_fixo'],
          maxSelect: 1,
          required: true,
        },
        { name: 'sale_unit', type: 'text' }, // e.g., 'm²', 'metro', 'unidade', 'pacote'
        { name: 'has_default_dimensions', type: 'bool' },
        { name: 'default_width', type: 'number' }, // em metros ou cm
        { name: 'default_height', type: 'number' }, // em metros ou cm
        { name: 'default_quantity', type: 'number' },
        { name: 'min_price', type: 'number' }, // Preço mínimo configurado
        { name: 'fixed_price', type: 'number' }, // Para regra Preço Fixo
        { name: 'fixed_cost', type: 'number' }, // Custo fixo se aplicável
        { name: 'internal_notes', type: 'text' },
        { name: 'is_active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_quote_prod_name ON quote_products (name)',
        'CREATE INDEX idx_quote_prod_cat ON quote_products (category)',
        'CREATE INDEX idx_quote_prod_active ON quote_products (is_active)',
      ],
    })
    app.save(quoteProducts)

    // 4. Create quotes collection (Estrutura para orçamentos - pronta para etapa inicial)
    const usersCollection = app.findCollectionByNameOrId('_pb_users_auth_')
    const clientsCollection = app.findCollectionByNameOrId('clients')

    const quotes = new Collection({
      name: 'quotes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'code', type: 'text', required: true }, // ex: ORC-2025-001
        {
          name: 'client_id',
          type: 'relation',
          collectionId: clientsCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'client_name', type: 'text', required: true },
        { name: 'client_phone', type: 'text' },
        { name: 'client_email', type: 'email' },
        {
          name: 'user_id',
          type: 'relation',
          collectionId: usersCollection.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          values: ['rascunho', 'enviado', 'aprovado', 'recusado', 'expirado'],
          maxSelect: 1,
          required: true,
        },
        { name: 'items', type: 'json' }, // lista estruturada de itens, dimensões, adicionais, cálculo de custo e venda
        { name: 'total_cost', type: 'number' },
        { name: 'total_sale', type: 'number' },
        { name: 'discount_amount', type: 'number' },
        { name: 'final_total', type: 'number' },
        { name: 'gross_profit', type: 'number' },
        { name: 'profit_margin_pct', type: 'number' },
        { name: 'notes', type: 'text' },
        { name: 'internal_notes', type: 'text' },
        { name: 'valid_until', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_quotes_code ON quotes (code)',
        'CREATE INDEX idx_quotes_client ON quotes (client_id)',
        'CREATE INDEX idx_quotes_status ON quotes (status)',
      ],
    })
    app.save(quotes)
  },
  (app) => {
    try {
      const quotes = app.findCollectionByNameOrId('quotes')
      app.delete(quotes)
    } catch (_) {}
    try {
      const products = app.findCollectionByNameOrId('quote_products')
      app.delete(products)
    } catch (_) {}
    try {
      const additionals = app.findCollectionByNameOrId('quote_additionals')
      app.delete(additionals)
    } catch (_) {}
    try {
      const materials = app.findCollectionByNameOrId('quote_materials')
      app.delete(materials)
    } catch (_) {}
  },
)
