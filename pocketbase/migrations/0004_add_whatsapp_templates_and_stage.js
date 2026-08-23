migrate(
  (app) => {
    // 1. Update clients collection stage select field to include "Contato iniciado"
    const clients = app.findCollectionByNameOrId('clients')
    const stageField = clients.fields.getByName('stage')
    if (stageField) {
      stageField.values = [
        'Novo contato',
        'Contato iniciado',
        'Precisa responder',
        'Em atendimento',
        'Orçamento enviado',
        'Aguardando cliente',
        'Venda fechada',
        'Não fechou',
      ]
      stageField.maxSelect = 1
    }
    app.save(clients)

    // 2. Create whatsapp_templates collection
    const templates = new Collection({
      name: 'whatsapp_templates',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        {
          name: 'category',
          type: 'select',
          required: true,
          values: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
          maxSelect: 1,
        },
        { name: 'language', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['APPROVED', 'PENDING', 'REJECTED'],
          maxSelect: 1,
        },
        { name: 'body', type: 'text', required: true },
        { name: 'variables', type: 'json', required: false },
        { name: 'meta_template_id', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_wa_tpl_name ON whatsapp_templates (name)',
        'CREATE INDEX idx_wa_tpl_status ON whatsapp_templates (status)',
      ],
    })
    app.save(templates)

    // 3. Seed useful default approved templates for print / graphic shop
    const defaultTemplates = [
      {
        name: 'primeiro_contato_lead',
        category: 'UTILITY',
        language: 'pt_BR',
        status: 'APPROVED',
        body: 'Olá {{nome}}! Tudo bem? Aqui é da gráfica Laletra. Vimos seu interesse em {{produto}} e gostaríamos de te apresentar opções exclusivas e tirar dúvidas. Como podemos te ajudar hoje?',
        variables: ['nome', 'produto'],
      },
      {
        name: 'envio_orcamento_express',
        category: 'UTILITY',
        language: 'pt_BR',
        status: 'APPROVED',
        body: 'Olá {{nome}}, seu orçamento para {{produto}} no valor de {{orcamento}} já está pronto! Caso queira aprovar ou ajustar os detalhes, estou à disposição por aqui.',
        variables: ['nome', 'produto', 'orcamento'],
      },
      {
        name: 'followup_proposta_aberta',
        category: 'MARKETING',
        language: 'pt_BR',
        status: 'APPROVED',
        body: 'Oi {{nome}}! Passando para checar se você conseguiu avaliar nossa proposta para {{produto}}. Quer que enviemos uma amostra física ou prova digital?',
        variables: ['nome', 'produto'],
      },
      {
        name: 'lembrete_aprovacao_arte',
        category: 'UTILITY',
        language: 'pt_BR',
        status: 'APPROVED',
        body: 'Olá {{nome}}, a prévia digital do seu material ({{produto}}) está pronta para conferência. Podemos enviar para a linha de produção?',
        variables: ['nome', 'produto'],
      },
      {
        name: 'pedido_pronto_retirada',
        category: 'UTILITY',
        language: 'pt_BR',
        status: 'APPROVED',
        body: 'Boas notícias {{nome}}! Seu pedido de {{produto}} está impresso e pronto para retirada ou envio com nosso motoboy. Horário de funcionamento: 08h às 18h.',
        variables: ['nome', 'produto'],
      },
    ]

    for (let tpl of defaultTemplates) {
      try {
        app.findFirstRecordByData('whatsapp_templates', 'name', tpl.name)
      } catch (_) {
        const rec = new Record(templates)
        rec.set('name', tpl.name)
        rec.set('category', tpl.category)
        rec.set('language', tpl.language)
        rec.set('status', tpl.status)
        rec.set('body', tpl.body)
        rec.set('variables', tpl.variables)
        app.save(rec)
      }
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('whatsapp_templates'))
    } catch (_) {}
  },
)
