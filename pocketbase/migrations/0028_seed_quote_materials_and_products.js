migrate(
  (app) => {
    const materialsCol = app.findCollectionByNameOrId('quote_materials')
    const additionalsCol = app.findCollectionByNameOrId('quote_additionals')
    const productsCol = app.findCollectionByNameOrId('quote_products')

    // 1. Seed sample materials from prompt specifications
    const sampleMaterials = [
      {
        name: 'Lona 440g',
        description:
          'Lona frontlight 440g de alta resistência e durabilidade para banners e faixas',
        category: 'Lonas e Tecidos',
        calc_unit: 'm2',
        cost_price: 12.0,
        sale_price: 25.0,
        min_price: 20.0,
        is_active: true,
      },
      {
        name: 'Adesivo brilho',
        description: 'Vinil adesivo calandrado brilho para comunicação visual e etiquetas',
        category: 'Adesivos',
        calc_unit: 'm2',
        cost_price: 8.0,
        sale_price: 22.0,
        min_price: 18.0,
        is_active: true,
      },
      {
        name: 'Adesivo fosco',
        description: 'Vinil adesivo acabamento fosco antirreflexo',
        category: 'Adesivos',
        calc_unit: 'm2',
        cost_price: 9.0,
        sale_price: 24.0,
        min_price: 20.0,
        is_active: true,
      },
      {
        name: 'Lona Backlight 510g',
        description: 'Lona translúcida para painéis iluminados internamente',
        category: 'Lonas e Tecidos',
        calc_unit: 'm2',
        cost_price: 18.0,
        sale_price: 45.0,
        min_price: 35.0,
        is_active: true,
      },
      {
        name: 'Tecido Oxfordine Sublimático',
        description: 'Tecido de alta definição para painéis veste fácil e painéis redondos',
        category: 'Lonas e Tecidos',
        calc_unit: 'm2',
        cost_price: 14.0,
        sale_price: 38.0,
        min_price: 30.0,
        is_active: true,
      },
      {
        name: 'Papel de Parede Adesivo Texturizado',
        description: 'Adesivo de parede fosco texturizado anti-bolhas',
        category: 'Papéis e Decoração',
        calc_unit: 'm2',
        cost_price: 16.0,
        sale_price: 45.0,
        min_price: 35.0,
        is_active: true,
      },
      {
        name: 'Caneca de Porcelana Branca',
        description: 'Caneca resinada para sublimação 325ml',
        category: 'Brindes e Promocionais',
        calc_unit: 'unidade',
        cost_price: 9.5,
        sale_price: 28.0,
        min_price: 22.0,
        is_active: true,
      },
      {
        name: 'Camiseta Poliéster Premium',
        description: 'Camiseta branca toque de algodão para estampa digital',
        category: 'Têxtil e Vestuário',
        calc_unit: 'unidade',
        cost_price: 13.0,
        sale_price: 35.0,
        min_price: 28.0,
        is_active: true,
      },
      {
        name: 'Estrutura Windbanner Fibra',
        description: 'Haste articulada em fibra de vidro e alumínio',
        category: 'Estruturas',
        calc_unit: 'unidade',
        cost_price: 45.0,
        sale_price: 110.0,
        min_price: 90.0,
        is_active: true,
      },
    ]

    const materialMap = {}
    for (const mat of sampleMaterials) {
      try {
        const rec = new Record(materialsCol)
        rec.set('name', mat.name)
        rec.set('description', mat.description)
        rec.set('category', mat.category)
        rec.set('calc_unit', mat.calc_unit)
        rec.set('cost_price', mat.cost_price)
        rec.set('sale_price', mat.sale_price)
        rec.set('min_price', mat.min_price)
        rec.set('is_active', mat.is_active)
        app.save(rec)
        materialMap[mat.name] = rec
      } catch (e) {
        console.log('Error seeding material:', mat.name, e)
      }
    }

    // 2. Seed sample additionals / finishes
    const sampleAdditionals = [
      {
        name: 'Ilhós metálico',
        description: 'Aplicação de ilhós niquelado antiferrugem para fixação',
        category: 'Acabamentos',
        calc_unit: 'unidade',
        cost_price: 0.15,
        sale_price: 0.5,
        min_price: 0.4,
        is_active: true,
      },
      {
        name: 'Costura / Bainha de reforço',
        description: 'Costura perimetral dupla ou solda térmica para reforço de lona/tecido',
        category: 'Acabamentos',
        calc_unit: 'metro_linear',
        cost_price: 1.0,
        sale_price: 2.5,
        min_price: 2.0,
        is_active: true,
      },
      {
        name: 'Bastão de Madeira com Ponteira plástica',
        description: 'Par de bastões de madeira com ponteiras e cordão para pendurar banner',
        category: 'Acessórios',
        calc_unit: 'unidade',
        cost_price: 3.5,
        sale_price: 9.0,
        min_price: 7.0,
        is_active: true,
      },
      {
        name: 'Elástico perimetral',
        description: 'Costura com elástico para painéis redondos e veste fácil',
        category: 'Acabamentos',
        calc_unit: 'metro_linear',
        cost_price: 1.8,
        sale_price: 4.5,
        min_price: 3.5,
        is_active: true,
      },
      {
        name: 'Serviço de Instalação / Aplicação',
        description: 'Mão de obra especializada de instalação no local do cliente',
        category: 'Serviços',
        calc_unit: 'm2',
        cost_price: 15.0,
        sale_price: 35.0,
        min_price: 30.0,
        is_active: true,
      },
      {
        name: 'Criação / Ajuste de Arte Gráfica',
        description: 'Diagramação e vetorização profissional',
        category: 'Serviços',
        calc_unit: 'valor_fixo',
        cost_price: 20.0,
        sale_price: 50.0,
        min_price: 40.0,
        is_active: true,
      },
      {
        name: 'Taxa de Frete / Entrega Rápida',
        description: 'Entrega por motoboy ou veículo próprio na região metropolitana',
        category: 'Logística',
        calc_unit: 'valor_fixo',
        cost_price: 15.0,
        sale_price: 25.0,
        min_price: 20.0,
        is_active: true,
      },
    ]

    const addMap = {}
    for (const add of sampleAdditionals) {
      try {
        const rec = new Record(additionalsCol)
        rec.set('name', add.name)
        rec.set('description', add.description)
        rec.set('category', add.category)
        rec.set('calc_unit', add.calc_unit)
        rec.set('cost_price', add.cost_price)
        rec.set('sale_price', add.sale_price)
        rec.set('min_price', add.min_price)
        rec.set('is_active', add.is_active)
        app.save(rec)
        addMap[add.name] = rec
      } catch (e) {
        console.log('Error seeding additional:', add.name, e)
      }
    }

    // 3. Seed sample products
    const sampleProducts = [
      {
        name: 'Banner Promocional',
        category: 'Comunicação Visual',
        description: 'Banner em Lona 440g com acabamento em bastão, ponteira e cordão ou ilhós',
        calc_rule: 'm2',
        sale_unit: 'm²',
        main_material_id: materialMap['Lona 440g']?.id,
        additionals: [
          addMap['Bastão de Madeira com Ponteira plástica']?.id,
          addMap['Ilhós metálico']?.id,
        ].filter(Boolean),
        has_default_dimensions: true,
        default_width: 1.0,
        default_height: 1.5,
        default_quantity: 1,
        min_price: 30.0,
        internal_notes: 'Cálculo por metro quadrado. Preço mínimo de R$ 30,00 por peça.',
        is_active: true,
      },
      {
        name: 'Painel Redondo para Festas',
        category: 'Eventos e Festas',
        description:
          'Painel sublimado em tecido Oxfordine com elástico na borda para estrutura circular',
        calc_rule: 'm2',
        sale_unit: 'm²',
        main_material_id: materialMap['Tecido Oxfordine Sublimático']?.id,
        additionals: [
          addMap['Elástico perimetral']?.id,
          addMap['Costura / Bainha de reforço']?.id,
        ].filter(Boolean),
        has_default_dimensions: true,
        default_width: 1.5,
        default_height: 1.5,
        default_quantity: 1,
        min_price: 65.0,
        internal_notes: 'Área calculada ou diâmetro. Muito vendido para decoradores.',
        is_active: true,
      },
      {
        name: 'Faixa em Lona com Madeira',
        category: 'Comunicação Visual',
        description: 'Faixa publicitária em Lona 440g com acabamento em madeira nas duas pontas',
        calc_rule: 'metro_linear',
        sale_unit: 'metro linear',
        main_material_id: materialMap['Lona 440g']?.id,
        additionals: [
          addMap['Costura / Bainha de reforço']?.id,
          addMap['Bastão de Madeira com Ponteira plástica']?.id,
        ].filter(Boolean),
        has_default_dimensions: true,
        default_width: 3.0,
        default_height: 0.7,
        default_quantity: 1,
        min_price: 45.0,
        internal_notes: 'Cálculo por metro linear de comprimento.',
        is_active: true,
      },
      {
        name: 'Adesivo Personalizado para Vitrine / Carro',
        category: 'Adesivos',
        description: 'Adesivo vinil brilho com impressão digital de alta resolução',
        calc_rule: 'm2',
        sale_unit: 'm²',
        main_material_id: materialMap['Adesivo brilho']?.id,
        additionals: [
          addMap['Serviço de Instalação / Aplicação']?.id,
          addMap['Criação / Ajuste de Arte Gráfica']?.id,
        ].filter(Boolean),
        has_default_dimensions: true,
        default_width: 1.0,
        default_height: 1.0,
        default_quantity: 1,
        min_price: 25.0,
        internal_notes: 'Preço mínimo R$ 25,00. Opção de incluir instalação.',
        is_active: true,
      },
      {
        name: 'Camiseta Personalizada Sublimação',
        category: 'Têxtil e Vestuário',
        description: 'Camiseta poliéster toque de algodão com estampa frontal ou costas',
        calc_rule: 'unidade',
        sale_unit: 'unidade',
        main_material_id: materialMap['Camiseta Poliéster Premium']?.id,
        additionals: [addMap['Criação / Ajuste de Arte Gráfica']?.id].filter(Boolean),
        has_default_dimensions: false,
        default_quantity: 10,
        min_price: 35.0,
        fixed_price: 35.0,
        fixed_cost: 13.0,
        internal_notes: 'Cálculo por unidade. 10 camisetas x R$ 35 = R$ 350.',
        is_active: true,
      },
      {
        name: 'Caneca Personalizada de Porcelana',
        category: 'Brindes e Promocionais',
        description: 'Caneca de 325ml personalizada com foto, frase ou logotipo',
        calc_rule: 'unidade',
        sale_unit: 'unidade',
        main_material_id: materialMap['Caneca de Porcelana Branca']?.id,
        additionals: [addMap['Criação / Ajuste de Arte Gráfica']?.id].filter(Boolean),
        has_default_dimensions: false,
        default_quantity: 1,
        min_price: 28.0,
        fixed_price: 28.0,
        fixed_cost: 9.5,
        internal_notes: 'Excelente brinde corporativo e presente personalizado.',
        is_active: true,
      },
      {
        name: 'Papel de Parede Personalizado',
        category: 'Decoração e Interiores',
        description: 'Papel de parede vinílico texturizado impresso sob medida',
        calc_rule: 'm2',
        sale_unit: 'm²',
        main_material_id: materialMap['Papel de Parede Adesivo Texturizado']?.id,
        additionals: [addMap['Serviço de Instalação / Aplicação']?.id].filter(Boolean),
        has_default_dimensions: true,
        default_width: 2.5,
        default_height: 2.6,
        default_quantity: 1,
        min_price: 50.0,
        internal_notes: 'Medir altura x largura com sobra de 5cm de sangria.',
        is_active: true,
      },
      {
        name: 'Windbanner Completo (Estrutura + Bandeira + Base)',
        category: 'Comunicação Visual',
        description: 'Kit Windbanner gota/pena com tecido dupla face e haste de fibra',
        calc_rule: 'preco_fixo',
        sale_unit: 'kit',
        main_material_id: materialMap['Estrutura Windbanner Fibra']?.id,
        additionals: [addMap['Criação / Ajuste de Arte Gráfica']?.id].filter(Boolean),
        has_default_dimensions: false,
        default_quantity: 1,
        min_price: 180.0,
        fixed_price: 195.0,
        fixed_cost: 75.0,
        internal_notes: 'Preço fechado do kit completo.',
        is_active: true,
      },
    ]

    for (const prod of sampleProducts) {
      try {
        const rec = new Record(productsCol)
        rec.set('name', prod.name)
        rec.set('category', prod.category)
        rec.set('description', prod.description)
        rec.set('calc_rule', prod.calc_rule)
        rec.set('sale_unit', prod.sale_unit)
        if (prod.main_material_id) rec.set('main_material_id', prod.main_material_id)
        if (prod.additionals && prod.additionals.length > 0)
          rec.set('additionals', prod.additionals)
        rec.set('has_default_dimensions', prod.has_default_dimensions)
        if (prod.default_width) rec.set('default_width', prod.default_width)
        if (prod.default_height) rec.set('default_height', prod.default_height)
        if (prod.default_quantity) rec.set('default_quantity', prod.default_quantity)
        if (prod.min_price) rec.set('min_price', prod.min_price)
        if (prod.fixed_price) rec.set('fixed_price', prod.fixed_price)
        if (prod.fixed_cost) rec.set('fixed_cost', prod.fixed_cost)
        rec.set('internal_notes', prod.internal_notes)
        rec.set('is_active', prod.is_active)
        app.save(rec)
      } catch (e) {
        console.log('Error seeding product:', prod.name, e)
      }
    }
  },
  (app) => {
    // Revert will be handled if collection is dropped
  },
)
