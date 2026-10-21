migrate(
  (app) => {
    // 1. Atualizar store_categories para suportar subcategorias hierárquicas (parent_id)
    const catCol = app.findCollectionByNameOrId('store_categories')
    if (catCol && !catCol.fields.getByName('parent_id')) {
      catCol.fields.add(
        new RelationField({
          name: 'parent_id',
          collectionId: catCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(catCol)
    }

    // 2. Atualizar store_banners para suportar imagem para mobile e descrição complementar
    const bannerCol = app.findCollectionByNameOrId('store_banners')
    if (bannerCol) {
      let changed = false
      if (!bannerCol.fields.getByName('mobile_image')) {
        bannerCol.fields.add(
          new FileField({
            name: 'mobile_image',
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
            required: false,
          }),
        )
        changed = true
      }
      if (!bannerCol.fields.getByName('description')) {
        bannerCol.fields.add(
          new TextField({
            name: 'description',
            required: false,
          }),
        )
        changed = true
      }
      if (changed) {
        app.save(bannerCol)
      }
    }

    // 3. Criar coleção store_settings (se não existir) para armazenar configurações da loja
    // (Aparência, Informações Comerciais, Home Layout, etc.) com chave única e JSON estruturado
    if (!app.hasTable('store_settings')) {
      const settingsCol = new Collection({
        name: 'store_settings',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'setting_key', type: 'text', required: true },
          { name: 'setting_value', type: 'json' },
          { name: 'description', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_store_settings_key ON store_settings (setting_key)'],
      })
      app.save(settingsCol)
    }

    // 4. Criar coleção store_media_uploads (se não existir) para upload seguro de ativos comerciais
    // Ex: logos, favicons, fotos de vitrine, banners adicionais.
    // Apenas admins salvam/deletam; visualização pública para imagens comerciais.
    if (!app.hasTable('store_media_uploads')) {
      const mediaCol = new Collection({
        name: 'store_media_uploads',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'title', type: 'text' },
          { name: 'purpose', type: 'text' }, // 'logo', 'favicon', 'banner', 'product', 'general'
          {
            name: 'file',
            type: 'file',
            required: true,
            maxSelect: 1,
            maxSize: 10485760, // 10MB
            mimeTypes: [
              'image/jpeg',
              'image/png',
              'image/webp',
              'image/x-icon',
              'image/vnd.microsoft.icon',
            ],
          },
          { name: 'original_name', type: 'text' },
          { name: 'file_size', type: 'number' },
          { name: 'file_type', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_store_media_purpose ON store_media_uploads (purpose)'],
      })
      app.save(mediaCol)
    }

    // 5. Seed idempotente dos valores iniciais de store_settings
    const defaultSettings = [
      {
        setting_key: 'appearance',
        description: 'Cores institucionais e identidade visual da loja pública',
        setting_value: {
          primary_color: '#059669', // emerald-600
          secondary_color: '#0f172a', // slate-900
          button_color: '#059669',
          header_color: '#ffffff',
          bg_color: '#f8fafc',
          text_color: '#0f172a',
          logo_url: '',
          favicon_url: '',
        },
      },
      {
        setting_key: 'commercial_info',
        description: 'Informações comerciais e de atendimento no cabeçalho e rodapé',
        setting_value: {
          whatsapp: '+55 (21) 2391-9112',
          phone: '+55 (21) 2391-9112',
          email: 'contato@laletragrafica.com.br',
          business_hours: 'Seg a Sex das 08h às 18h',
          address: 'Av. Marechal Floriano, 19, Sala 301 - Centro, Rio de Janeiro - RJ, 20080-003',
          footer_text:
            'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
          copyright_text: 'Gráfica LaLetra. Todos os direitos reservados.',
        },
      },
      {
        setting_key: 'home_layout',
        description: 'Seções visíveis, textos institucionais e produtos em destaque na Home',
        setting_value: {
          show_hero_banners: true,
          show_advantages_bar: true,
          show_categories_grid: true,
          show_featured_products: true,
          show_custom_quote_cta: true,
          hero_title: '',
          hero_subtitle: '',
          featured_product_ids: [],
          custom_quote_title: 'Precisa de um projeto gráfico personalizado ou grandes tiragens?',
          custom_quote_subtitle:
            'Nossa equipe comercial elabora cotações exclusivas com descontos por volume, corte especial e visitas técnicas para comunicação visual corporativa.',
        },
      },
    ]

    for (const s of defaultSettings) {
      try {
        app.findFirstRecordByData('store_settings', 'setting_key', s.setting_key)
      } catch (_) {
        const sCol = app.findCollectionByNameOrId('store_settings')
        const rec = new Record(sCol)
        rec.set('setting_key', s.setting_key)
        rec.set('description', s.description)
        rec.set('setting_value', JSON.stringify(s.setting_value))
        app.save(rec)
      }
    }
  },
  (app) => {
    try {
      const mediaCol = app.findCollectionByNameOrId('store_media_uploads')
      if (mediaCol) app.delete(mediaCol)
    } catch (_) {}
    try {
      const settingsCol = app.findCollectionByNameOrId('store_settings')
      if (settingsCol) app.delete(settingsCol)
    } catch (_) {}
  },
)
