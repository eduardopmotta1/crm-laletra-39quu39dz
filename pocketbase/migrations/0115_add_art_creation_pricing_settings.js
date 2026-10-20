migrate(
  (app) => {
    // 1. Inserir ou atualizar a configuração de precificação de criação de arte em system_settings
    const settingsCol = app.findCollectionByNameOrId('system_settings')
    let existing = null
    try {
      existing = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'store_art_creation_pricing',
      )
    } catch (_) {
      existing = null
    }

    const defaultPricing = JSON.stringify({
      base_creation_fee: 45.0,
      description: 'Criação profissional de arte pela equipe LaLetra',
      free_for_orders_above: 500.0,
      is_active: true,
      lead_time_extra_days: 2,
    })

    if (!existing) {
      const rec = new Record(settingsCol)
      rec.set('setting_key', 'store_art_creation_pricing')
      rec.set('setting_value', defaultPricing)
      rec.set(
        'description',
        'Configuração de valor e regras para criação de arte gráfica pela equipe LaLetra na loja virtual',
      )
      app.save(rec)
    }

    // 2. Adicionar campo art_option e art_creation_fee em store_order_items se não existirem
    const orderItemsCol = app.findCollectionByNameOrId('store_order_items')
    if (!orderItemsCol.fields.getByName('art_option')) {
      orderItemsCol.fields.add(
        new SelectField({
          name: 'art_option',
          values: ['send_ready', 'send_later', 'request_creation'],
          maxSelect: 1,
        }),
      )
    }
    if (!orderItemsCol.fields.getByName('art_creation_fee')) {
      orderItemsCol.fields.add(
        new NumberField({
          name: 'art_creation_fee',
        }),
      )
    }
    app.save(orderItemsCol)
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'store_art_creation_pricing',
      )
      if (rec) app.delete(rec)
    } catch (_) {}
  },
)
