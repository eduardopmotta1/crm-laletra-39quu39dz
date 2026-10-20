migrate(
  (app) => {
    // 1. Criar store_categories (se não existir)
    if (!app.hasTable('store_categories')) {
      const catCol = new Collection({
        name: 'store_categories',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'slug', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'icon', type: 'text' },
          {
            name: 'image',
            type: 'file',
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
          },
          { name: 'order_index', type: 'number' },
          { name: 'is_active', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_store_cat_slug ON store_categories (slug)',
          'CREATE INDEX idx_store_cat_active_order ON store_categories (is_active, order_index)',
        ],
      })
      app.save(catCol)
    }

    // Obter id da coleção store_categories
    const catColRecord = app.findCollectionByNameOrId('store_categories')
    const catColId = catColRecord.id

    // 2. Criar store_products (se não existir)
    // ATENÇÃO: NENHUM campo de custo interno (cost_price, fixed_cost etc.) nesta coleção.
    if (!app.hasTable('store_products')) {
      let quoteProdColId = ''
      try {
        const qp = app.findCollectionByNameOrId('quote_products')
        if (qp) quoteProdColId = qp.id
      } catch (_) {}

      const prodFields = [
        { name: 'name', type: 'text', required: true },
        { name: 'seo_slug', type: 'text', required: true },
        { name: 'subtitle', type: 'text' },
        { name: 'description_public', type: 'editor' },
        {
          name: 'category_id',
          type: 'relation',
          required: false,
          collectionId: catColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'pricing_type',
          type: 'select',
          required: true,
          values: ['fixed', 'quantity_tiers', 'square_meter'],
        },
        { name: 'store_price', type: 'number' },
        { name: 'price_tiers', type: 'json' },
        { name: 'sqm_min_area', type: 'number' },
        { name: 'sqm_base_price', type: 'number' },
        { name: 'options', type: 'json' },
        { name: 'finishings', type: 'json' },
        { name: 'lead_time_days', type: 'number' },
        { name: 'quote_only', type: 'bool' },
        { name: 'published', type: 'bool' },
        { name: 'featured', type: 'bool' },
        { name: 'order_index', type: 'number' },
        {
          name: 'main_image',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        },
        {
          name: 'gallery_images',
          type: 'file',
          maxSelect: 10,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        },
        { name: 'badge_label', type: 'text' },
        { name: 'unit_label', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ]

      if (quoteProdColId) {
        prodFields.push({
          name: 'quote_product_id',
          type: 'relation',
          required: false,
          collectionId: quoteProdColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      const prodCol = new Collection({
        name: 'store_products',
        type: 'base',
        listRule: "published = true || @request.auth.id != ''",
        viewRule: "published = true || @request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: prodFields,
        indexes: [],
      })
      app.save(prodCol)
    }

    // 3. Criar store_banners (se não existir)
    if (!app.hasTable('store_banners')) {
      const bannerCol = new Collection({
        name: 'store_banners',
        type: 'base',
        listRule: "is_active = true || @request.auth.id != ''",
        viewRule: "is_active = true || @request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'subtitle', type: 'text' },
          { name: 'cta_text', type: 'text' },
          { name: 'link_url', type: 'text' },
          {
            name: 'image',
            type: 'file',
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          },
          { name: 'badge', type: 'text' },
          { name: 'bg_color', type: 'text' },
          { name: 'order_index', type: 'number' },
          { name: 'is_active', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_store_banners_active_order ON store_banners (is_active, order_index)',
        ],
      })
      app.save(bannerCol)
    }

    // 4. SEED DEMONSTRATIVO IDEMPOTENTE (4-6 categorias e 8-12 produtos com os 3 tipos de precificação + quote_only)
    const categoriesData = [
      {
        name: 'Cartões de Visita',
        slug: 'cartoes-de-visita',
        description: 'Cartões profissionais em diversos papéis, acabamentos nobres e laminações.',
        icon: 'CreditCard',
        order_index: 1,
        is_active: true,
      },
      {
        name: 'Banners & Faixas',
        slug: 'banners-e-faixas',
        description:
          'Lonas de alta resistência, acabamento com ilhós ou bastão e corda para comunicação visual.',
        icon: 'Image',
        order_index: 2,
        is_active: true,
      },
      {
        name: 'Adesivos & Rótulos',
        slug: 'adesivos-e-rotulos',
        description:
          'Adesivos em vinil fosco, brilho ou transparente com recorte eletrônico preciso.',
        icon: 'Tag',
        order_index: 3,
        is_active: true,
      },
      {
        name: 'Panfletos & Flyers',
        slug: 'panfletos-e-flyers',
        description: 'Folhetos e panfletos promocionais com impressão offset de alta definição.',
        icon: 'FileSpreadsheet',
        order_index: 4,
        is_active: true,
      },
      {
        name: 'Pastas & Papelaria',
        slug: 'pastas-e-papelaria',
        description:
          'Pastas corporativas com bolsa ou orelha, papéis timbrados e envelopes timbrados.',
        icon: 'Folder',
        order_index: 5,
        is_active: true,
      },
      {
        name: 'Brindes & Especiais',
        slug: 'brindes-e-especiais',
        description: 'Canecas, blocos de notas, calendários e produtos gráficos personalizados.',
        icon: 'Gift',
        order_index: 6,
        is_active: true,
      },
    ]

    const catMap = {}
    for (const c of categoriesData) {
      let rec
      try {
        rec = app.findFirstRecordByData('store_categories', 'slug', c.slug)
      } catch (_) {
        const col = app.findCollectionByNameOrId('store_categories')
        rec = new Record(col)
        rec.set('name', c.name)
        rec.set('slug', c.slug)
        rec.set('description', c.description)
        rec.set('icon', c.icon)
        rec.set('order_index', c.order_index)
        rec.set('is_active', c.is_active)
        app.save(rec)
      }
      if (rec) catMap[c.slug] = rec.id
    }

    // 5. Seed de banners demonstrativos
    const bannersData = [
      {
        title: 'Impressão Gráfica Premium',
        subtitle: 'Qualidade fotográfica, acabamentos especiais e prazo ágil para seu negócio.',
        cta_text: 'Conhecer Catálogo',
        link_url: '/loja',
        badge: 'Laletra Gráfica',
        bg_color: 'from-emerald-900 to-slate-900',
        order_index: 1,
        is_active: true,
      },
      {
        title: 'Cartões de Visita com Verniz Localizado',
        subtitle: 'Papel Couché 300g com Laminação Fosca Soft Touch e Verniz Localizado frente.',
        cta_text: 'Ver Detalhes',
        link_url: '/loja/produto/cartao-de-visita-verniz-localizado',
        badge: 'Mais Vendido',
        bg_color: 'from-blue-900 to-indigo-950',
        order_index: 2,
        is_active: true,
      },
      {
        title: 'Banners e Comunicação Visual',
        subtitle: 'Preço calculado direto por m² com opções de bastão, corda ou ilhós reforçado.',
        cta_text: 'Calcular Agora',
        link_url: '/loja/produto/banner-em-lona-com-bastao',
        badge: 'Comunicação Visual',
        bg_color: 'from-amber-900 to-slate-900',
        order_index: 3,
        is_active: true,
      },
    ]

    for (const b of bannersData) {
      let bRec
      try {
        bRec = app.findFirstRecordByData('store_banners', 'title', b.title)
      } catch (_) {
        const bCol = app.findCollectionByNameOrId('store_banners')
        bRec = new Record(bCol)
        bRec.set('title', b.title)
        bRec.set('subtitle', b.subtitle)
        bRec.set('cta_text', b.cta_text)
        bRec.set('link_url', b.link_url)
        bRec.set('badge', b.badge)
        bRec.set('bg_color', b.bg_color)
        bRec.set('order_index', b.order_index)
        bRec.set('is_active', b.is_active)
        app.save(bRec)
      }
    }

    // 6. Seed de produtos demonstrativos
    const demoProducts = [
      // 1. Cartão de Visita Verniz Localizado (quantity_tiers)
      {
        name: 'Cartão de Visita Premium com Verniz Localizado',
        seo_slug: 'cartao-de-visita-verniz-localizado',
        subtitle: 'Couché 300g com laminação fosca frente e verso e verniz UV localizado.',
        description_public:
          '<p>O cartão de visita ideal para transmitir elegância e profissionalismo. Produzido em papel couché 300g com cobertura laminada fosca e acabamento especial com verniz UV localizado para destacar sua marca.</p><ul><li>Gramatura: Couché 300g</li><li>Tamanho padrão: 9x5 cm</li><li>Cores: 4x4 (frente e verso colorido)</li></ul>',
        category_slug: 'cartoes-de-visita',
        pricing_type: 'quantity_tiers',
        store_price: 135.0,
        price_tiers: [
          { quantity: 500, price: 135.0, label: '500 unidades' },
          { quantity: 1000, price: 198.0, label: '1.000 unidades (Recomendado)' },
          { quantity: 2000, price: 340.0, label: '2.000 unidades' },
          { quantity: 5000, price: 680.0, label: '5.000 unidades' },
        ],
        options: [
          {
            name: 'Cantos',
            values: [
              { id: 'retos', label: 'Cantos Retos', price_modifier: 0 },
              { id: 'arredondados', label: '4 Cantos Arredondados', price_modifier: 25.0 },
            ],
          },
        ],
        finishings: [
          {
            id: 'hot_stamping',
            name: 'Hot Stamping Dourado',
            price: 75.0,
            description: 'Aplicação metalizada ouro na logo',
          },
          {
            id: 'embalagem_acrilica',
            name: 'Estojo Protetor de Acrílico',
            price: 15.0,
            description: 'Caixinha organizadora rígida',
          },
        ],
        lead_time_days: 5,
        quote_only: false,
        published: true,
        featured: true,
        order_index: 1,
        badge_label: 'Mais Vendido',
        unit_label: 'cento/milheiro',
      },
      // 2. Cartão de Visita Clássico (fixed / faixas)
      {
        name: 'Cartão de Visita Clássico Brilho',
        seo_slug: 'cartao-de-visita-classico-brilho',
        subtitle: 'Couché 250g com verniz total frente. Excelente custo-benefício.',
        description_public:
          '<p>Cartão de visita com acabamento clássico em verniz total brilhante na frente. Ideal para grande circulação, comércio e prestadores de serviços.</p>',
        category_slug: 'cartoes-de-visita',
        pricing_type: 'quantity_tiers',
        store_price: 65.0,
        price_tiers: [
          { quantity: 500, price: 65.0, label: '500 unidades' },
          { quantity: 1000, price: 95.0, label: '1.000 unidades' },
          { quantity: 2500, price: 190.0, label: '2.500 unidades' },
        ],
        options: [
          {
            name: 'Impressão',
            values: [
              { id: '4x0', label: 'Frente Colorida / Verso Branco (4x0)', price_modifier: 0 },
              { id: '4x4', label: 'Frente e Verso Coloridos (4x4)', price_modifier: 20.0 },
            ],
          },
        ],
        finishings: [],
        lead_time_days: 3,
        quote_only: false,
        published: true,
        featured: false,
        order_index: 2,
        badge_label: 'Econômico',
        unit_label: 'milheiro',
      },
      // 3. Banner em Lona com Bastão e Corda (square_meter)
      {
        name: 'Banner em Lona Frontlight 440g',
        seo_slug: 'banner-em-lona-com-bastao',
        subtitle:
          'Impressão digital de alta resolução com acabamento em madeira, ponteiras e corda.',
        description_public:
          '<p>Banner impresso em lona 440g resistente a ambientes internos e externos. Cores vibrantes com proteção contra raios UV e acabamento profissional pronto para pendurar.</p>',
        category_slug: 'banners-e-faixas',
        pricing_type: 'square_meter',
        store_price: 65.0,
        sqm_base_price: 65.0,
        sqm_min_area: 0.5,
        options: [
          {
            name: 'Gramatura da Lona',
            values: [
              { id: '440g', label: 'Lona 440g Standard', price_modifier: 0 },
              { id: '510g', label: 'Lona 510g Reforçada', price_modifier: 15.0 },
            ],
          },
        ],
        finishings: [
          {
            id: 'bastao_corda',
            name: 'Bastão de Madeira + Corda + Ponteiras',
            price: 12.0,
            description: 'Pronto para pendurar em parede ou tripé',
          },
          {
            id: 'ilhos',
            name: 'Ilhós Metálicos nas Pontas',
            price: 10.0,
            description: '4 a 8 ilhós niquelados para amarração',
          },
          {
            id: 'reforco_solda',
            name: 'Bainha Soldada de Reforço',
            price: 8.0,
            description: 'Dobra soldada para maior durabilidade ao vento',
          },
        ],
        lead_time_days: 2,
        quote_only: false,
        published: true,
        featured: true,
        order_index: 3,
        badge_label: 'Pronta Entrega 48h',
        unit_label: 'm²',
      },
      // 4. Faixa Promocional em Lona (square_meter)
      {
        name: 'Faixa Promocional em Lona com Ilhós',
        seo_slug: 'faixa-promocional-em-lona',
        subtitle: 'Faixa para eventos, promoções e fachadas com acabamento reforçado.',
        description_public:
          '<p>Faixas em lona para inaugurações, eventos e promoções temporárias. Alta visibilidade com opção de ilhós a cada 50cm.</p>',
        category_slug: 'banners-e-faixas',
        pricing_type: 'square_meter',
        store_price: 55.0,
        sqm_base_price: 55.0,
        sqm_min_area: 1.0,
        options: [],
        finishings: [
          {
            id: 'ilhos_metro',
            name: 'Ilhós a cada metro',
            price: 15.0,
            description: 'Distribuição padrão para fixação firme',
          },
        ],
        lead_time_days: 2,
        quote_only: false,
        published: true,
        featured: false,
        order_index: 4,
        badge_label: null,
        unit_label: 'm²',
      },
      // 5. Adesivo Vinil com Meio Corte (quantity_tiers)
      {
        name: 'Adesivo em Vinil Brilho com Recorte Eletrônico',
        seo_slug: 'adesivo-em-vinil-recorte',
        subtitle: "Adesivos à prova d'água com corte no formato que você escolher.",
        description_public:
          '<p>Adesivo em vinil calandrado impermeável, resistente a umidade e atrito. Corte computadorizado no contorno da sua logo ou formato redondo, quadrado ou personalizado.</p>',
        category_slug: 'adesivos-e-rotulos',
        pricing_type: 'quantity_tiers',
        store_price: 79.0,
        price_tiers: [
          { quantity: 100, price: 79.0, label: '100 unidades (5x5cm aprox.)' },
          { quantity: 250, price: 145.0, label: '250 unidades' },
          { quantity: 500, price: 230.0, label: '500 unidades' },
          { quantity: 1000, price: 380.0, label: '1.000 unidades' },
        ],
        options: [
          {
            name: 'Acabamento do Vinil',
            values: [
              { id: 'brilho', label: 'Vinil Branco Brilhante', price_modifier: 0 },
              { id: 'fosco', label: 'Vinil Branco Fosco', price_modifier: 5.0 },
              { id: 'transparente', label: 'Vinil Transparente', price_modifier: 15.0 },
            ],
          },
        ],
        finishings: [
          {
            id: 'laminacao_protetora',
            name: 'Laminação Protetora Antirrisco',
            price: 35.0,
            description: 'Película extra para alta durabilidade',
          },
        ],
        lead_time_days: 3,
        quote_only: false,
        published: true,
        featured: true,
        order_index: 5,
        badge_label: 'Resistente à Água',
        unit_label: 'pacote',
      },
      // 6. Rótulos em Bobina (quote_only)
      {
        name: 'Rótulos Adesivos Especiais em Bobina',
        seo_slug: 'rotulos-adesivos-bobina-especiais',
        subtitle: 'Rótulos para embalagens, cervejarias, cosméticos e alimentos em alta escala.',
        description_public:
          '<p>Soluções em rótulos sob medida para rotuladoras automáticas ou manuais. Diversos tipos de papéis e filmes: BOPP metalizado, couché, térmico e acabamentos com hot-stamping e vernizes técnicos.</p><p>Devido à variedade de cilindros e especificações da sua linha produtiva, solicite um orçamento direto aos nossos especialistas.</p>',
        category_slug: 'adesivos-e-rotulos',
        pricing_type: 'fixed',
        store_price: 0,
        price_tiers: [],
        options: [],
        finishings: [],
        lead_time_days: 7,
        quote_only: true,
        published: true,
        featured: false,
        order_index: 6,
        badge_label: 'Sob Medida',
        unit_label: 'projeto',
      },
      // 7. Panfletos Promocionais 10x15cm (quantity_tiers)
      {
        name: 'Panfleto Promocional 10x15 cm Couché 115g',
        seo_slug: 'panfleto-promocional-10x15',
        subtitle: 'Impressão offset com cores vivas para distribuição comercial em massa.',
        description_public:
          '<p>Panfleto de alto impacto visual para divulgação de serviços, eventos e restaurantes. Couché 115g com acabamento refinado e entrega garantida.</p>',
        category_slug: 'panfletos-e-flyers',
        pricing_type: 'quantity_tiers',
        store_price: 110.0,
        price_tiers: [
          { quantity: 1000, price: 110.0, label: '1.000 unidades (4x0)' },
          { quantity: 2500, price: 195.0, label: '2.500 unidades' },
          { quantity: 5000, price: 320.0, label: '5.000 unidades' },
          { quantity: 10000, price: 540.0, label: '10.000 unidades (Melhor Custo)' },
        ],
        options: [
          {
            name: 'Impressão',
            values: [
              { id: '4x0', label: 'Frente Colorida (4x0)', price_modifier: 0 },
              { id: '4x4', label: 'Frente e Verso Coloridos (4x4)', price_modifier: 35.0 },
            ],
          },
        ],
        finishings: [
          {
            id: 'uma_dobra',
            name: 'Dobra Central (Vira Folheto)',
            price: 25.0,
            description: 'Dobra vinco no centro do panfleto',
          },
        ],
        lead_time_days: 4,
        quote_only: false,
        published: true,
        featured: true,
        order_index: 7,
        badge_label: 'Preço de Fábrica',
        unit_label: 'milheiro',
      },
      // 8. Flyer Couché 150g 15x21cm (quantity_tiers)
      {
        name: 'Flyer A5 (15x21 cm) Couché 150g',
        seo_slug: 'flyer-a5-couche-150g',
        subtitle: 'Papel encorpado com maior rigidez, ideal para cardápios e apresentações.',
        description_public:
          '<p>O flyer em tamanho A5 oferece espaço generoso para fotos, tabelas de serviços e detalhes comerciais sem poluir a leitura.</p>',
        category_slug: 'panfletos-e-flyers',
        pricing_type: 'quantity_tiers',
        store_price: 180.0,
        price_tiers: [
          { quantity: 1000, price: 180.0, label: '1.000 unidades (4x4)' },
          { quantity: 2500, price: 330.0, label: '2.500 unidades' },
          { quantity: 5000, price: 560.0, label: '5.000 unidades' },
        ],
        options: [],
        finishings: [],
        lead_time_days: 4,
        quote_only: false,
        published: true,
        featured: false,
        order_index: 8,
        badge_label: null,
        unit_label: 'milheiro',
      },
      // 9. Pastas Personalizadas com Bolsa (fixed / faixas)
      {
        name: 'Pasta Corporativa com Bolsa Interna',
        seo_slug: 'pasta-corporativa-com-bolsa',
        subtitle: 'Papel Supremo 300g com laminação fosca e bolsa colada para documentos A4.',
        description_public:
          '<p>Fortaleça a imagem institucional da sua empresa entregando orçamentos, contratos e propostas dentro de uma pasta personalizada de altíssimo nível.</p>',
        category_slug: 'pastas-e-papelaria',
        pricing_type: 'quantity_tiers',
        store_price: 490.0,
        price_tiers: [
          { quantity: 100, price: 490.0, label: '100 unidades' },
          { quantity: 250, price: 790.0, label: '250 unidades' },
          { quantity: 500, price: 1250.0, label: '500 unidades (Melhor Custo)' },
        ],
        options: [
          {
            name: 'Acabamento da Capa',
            values: [
              { id: 'fosca', label: 'Laminação Fosca', price_modifier: 0 },
              { id: 'brilho', label: 'Laminação Brilhante', price_modifier: 0 },
            ],
          },
        ],
        finishings: [
          {
            id: 'verniz_localizado',
            name: 'Verniz Localizado na Logo',
            price: 120.0,
            description: 'Destaque com brilho na capa da pasta',
          },
        ],
        lead_time_days: 6,
        quote_only: false,
        published: true,
        featured: false,
        order_index: 9,
        badge_label: 'Corporativo',
        unit_label: 'pacote',
      },
      // 10. Canecas Personalizadas de Cerâmica (fixed unit)
      {
        name: 'Caneca de Cerâmica Importada Personalizada',
        seo_slug: 'caneca-ceramica-personalizada',
        subtitle: '325ml com sublimação colorida de alta resolução. Embaladas individualmente.',
        description_public:
          '<p>Caneca de cerâmica resinada com brilho intenso e durabilidade. Perfeita para brindes corporativos, comemorações e presentes para clientes e colaboradores.</p>',
        category_slug: 'brindes-e-especiais',
        pricing_type: 'fixed',
        store_price: 29.9,
        price_tiers: [],
        options: [
          {
            name: 'Cor Interna e Alça',
            values: [
              { id: 'branca', label: 'Toda Branca', price_modifier: 0 },
              { id: 'preta', label: 'Interior e Alça Preta', price_modifier: 5.0 },
              { id: 'vermelha', label: 'Interior e Alça Vermelha', price_modifier: 5.0 },
            ],
          },
        ],
        finishings: [
          {
            id: 'caixa_presente',
            name: 'Caixinha Individual para Presente',
            price: 3.5,
            description: 'Embalagem decorada com visor',
          },
        ],
        lead_time_days: 3,
        quote_only: false,
        published: true,
        featured: true,
        order_index: 10,
        badge_label: 'Brinde Top',
        unit_label: 'unidade',
      },
      // 11. Fachadas e Luminosos (quote_only)
      {
        name: 'Letra Caixa e Fachada Comercial Iluminada',
        seo_slug: 'letra-caixa-e-fachada-comercial',
        subtitle: 'Projetos arquitetônicos em ACM, acrílico, inox e módulos LED.',
        description_public:
          '<p>Transforme a presença física da sua empresa com letreiros de alta durabilidade, corte a laser de precisão e iluminação indireta em LED.</p><p>Visita técnica e elaboração de projeto 3D inclusos no processo de orçamento.</p>',
        category_slug: 'banners-e-faixas',
        pricing_type: 'fixed',
        store_price: 0,
        price_tiers: [],
        options: [],
        finishings: [],
        lead_time_days: 15,
        quote_only: true,
        published: true,
        featured: false,
        order_index: 11,
        badge_label: 'Sob Projeto',
        unit_label: 'projeto',
      },
    ]

    for (const p of demoProducts) {
      let pRec
      try {
        pRec = app.findFirstRecordByData('store_products', 'seo_slug', p.seo_slug)
      } catch (_) {
        const pCol = app.findCollectionByNameOrId('store_products')
        pRec = new Record(pCol)
        pRec.set('name', p.name)
        pRec.set('seo_slug', p.seo_slug)
        pRec.set('subtitle', p.subtitle)
        pRec.set('description_public', p.description_public)
        pRec.set('pricing_type', p.pricing_type)
        pRec.set('store_price', p.store_price)
        pRec.set('price_tiers', JSON.stringify(p.price_tiers || []))
        if (p.sqm_base_price) pRec.set('sqm_base_price', p.sqm_base_price)
        if (p.sqm_min_area) pRec.set('sqm_min_area', p.sqm_min_area)
        pRec.set('options', JSON.stringify(p.options || []))
        pRec.set('finishings', JSON.stringify(p.finishings || []))
        pRec.set('lead_time_days', p.lead_time_days)
        pRec.set('quote_only', p.quote_only)
        pRec.set('published', p.published)
        pRec.set('featured', p.featured)
        pRec.set('order_index', p.order_index)
        if (p.badge_label) pRec.set('badge_label', p.badge_label)
        if (p.unit_label) pRec.set('unit_label', p.unit_label)

        const catId = catMap[p.category_slug]
        if (catId) {
          pRec.set('category_id', catId)
        }
        app.save(pRec)
      }
    }
  },
  (app) => {
    // Revert idempotent
    try {
      const pCol = app.findCollectionByNameOrId('store_products')
      if (pCol) app.delete(pCol)
    } catch (_) {}
    try {
      const bCol = app.findCollectionByNameOrId('store_banners')
      if (bCol) app.delete(bCol)
    } catch (_) {}
    try {
      const cCol = app.findCollectionByNameOrId('store_categories')
      if (cCol) app.delete(cCol)
    } catch (_) {}
  },
)
