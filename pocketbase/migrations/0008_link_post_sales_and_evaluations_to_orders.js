migrate(
  (app) => {
    const prodOrdersCol = app.findCollectionByNameOrId('production_orders')
    const evaluationsCol = app.findCollectionByNameOrId('evaluations')
    const postSalesCol = app.findCollectionByNameOrId('post_sales')

    // 1. Add order_id to evaluations collection
    if (!evaluationsCol.fields.getByName('order_id')) {
      evaluationsCol.fields.add(
        new RelationField({
          name: 'order_id',
          collectionId: prodOrdersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!evaluationsCol.fields.getByName('order_number')) {
      evaluationsCol.fields.add(
        new TextField({
          name: 'order_number',
          required: false,
        }),
      )
    }
    evaluationsCol.addIndex('idx_evaluations_order', false, 'order_id', '')
    app.save(evaluationsCol)

    // 2. Add order_id to post_sales collection
    if (!postSalesCol.fields.getByName('order_id')) {
      postSalesCol.fields.add(
        new RelationField({
          name: 'order_id',
          collectionId: prodOrdersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!postSalesCol.fields.getByName('order_number')) {
      postSalesCol.fields.add(
        new TextField({
          name: 'order_number',
          required: false,
        }),
      )
    }
    postSalesCol.addIndex('idx_postsales_order', false, 'order_id', '')
    app.save(postSalesCol)

    // 3. Update description of post_sale_delay_days in system_settings if exists
    try {
      const delaySetting = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'post_sale_delay_days',
      )
      delaySetting.set(
        'description',
        'Dias após conclusão do pedido de produção para realizar o pós-venda (1, 3, 7 ou personalizado)',
      )
      app.save(delaySetting)
    } catch (_) {}
  },
  (app) => {
    try {
      const evaluationsCol = app.findCollectionByNameOrId('evaluations')
      evaluationsCol.removeIndex('idx_evaluations_order')
      if (evaluationsCol.fields.getByName('order_id')) {
        evaluationsCol.fields.removeByName('order_id')
      }
      if (evaluationsCol.fields.getByName('order_number')) {
        evaluationsCol.fields.removeByName('order_number')
      }
      app.save(evaluationsCol)
    } catch (_) {}

    try {
      const postSalesCol = app.findCollectionByNameOrId('post_sales')
      postSalesCol.removeIndex('idx_postsales_order')
      if (postSalesCol.fields.getByName('order_id')) {
        postSalesCol.fields.removeByName('order_id')
      }
      if (postSalesCol.fields.getByName('order_number')) {
        postSalesCol.fields.removeByName('order_number')
      }
      app.save(postSalesCol)
    } catch (_) {}
  },
)
