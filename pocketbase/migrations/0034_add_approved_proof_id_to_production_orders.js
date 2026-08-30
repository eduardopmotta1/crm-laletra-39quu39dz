migrate(
  (app) => {
    const proofsCol = app.findCollectionByNameOrId('production_proofs')
    const ordersCol = app.findCollectionByNameOrId('production_orders')

    if (!ordersCol.fields.getByName('approved_proof_id')) {
      ordersCol.fields.add(
        new RelationField({
          name: 'approved_proof_id',
          collectionId: proofsCol.id,
          maxSelect: 1,
          required: false,
          cascadeDelete: false,
        }),
      )
      app.save(ordersCol)
    }

    // Safe migration for legacy orders:
    // Analyze orders where art_approved = true
    // ONLY link if there is strictly 1 single production_proof with status = 'aprovado' for that order.
    const approvedOrders = app.findRecordsByFilter(
      'production_orders',
      'art_approved = true',
      '',
      500,
      0,
    )
    for (const order of approvedOrders) {
      const proofs = app.findRecordsByFilter(
        'production_proofs',
        `order_id = '${order.id}' && status = 'aprovado'`,
        '',
        10,
        0,
      )
      if (proofs.length === 1) {
        order.set('approved_proof_id', proofs[0].id)
        app.save(order)
      }
    }
  },
  (app) => {
    const ordersCol = app.findCollectionByNameOrId('production_orders')
    const field = ordersCol.fields.getByName('approved_proof_id')
    if (field) {
      ordersCol.fields.removeByName('approved_proof_id')
      app.save(ordersCol)
    }
  },
)
