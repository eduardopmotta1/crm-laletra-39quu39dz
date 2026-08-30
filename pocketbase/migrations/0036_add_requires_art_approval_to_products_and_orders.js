migrate(
  (app) => {
    // 1. Add requires_art_approval to quote_products collection (Catalog)
    const quoteProductsCol = app.findCollectionByNameOrId('quote_products')
    if (quoteProductsCol && !quoteProductsCol.fields.getByName('requires_art_approval')) {
      quoteProductsCol.fields.add(
        new BoolField({
          name: 'requires_art_approval',
          required: false,
        }),
      )
      app.save(quoteProductsCol)
    }

    // 2. Add requires_art_approval to production_orders collection (Order snapshot)
    const productionOrdersCol = app.findCollectionByNameOrId('production_orders')
    if (productionOrdersCol && !productionOrdersCol.fields.getByName('requires_art_approval')) {
      productionOrdersCol.fields.add(
        new BoolField({
          name: 'requires_art_approval',
          required: false,
        }),
      )
      app.save(productionOrdersCol)
    }

    // 3. Safe initial data handling for legacy records (Rule 10):
    // For quote_products: Set standard products to true if not defined
    const products = app.findRecordsByFilter('quote_products', '', '', 500, 0)
    for (const prod of products) {
      if (
        prod.get('requires_art_approval') === undefined ||
        prod.get('requires_art_approval') === null
      ) {
        prod.set('requires_art_approval', true)
        app.save(prod)
      }
    }

    // For legacy production_orders (Rule 10):
    // If order was already art_approved = true, set requires_art_approval = true.
    // If order was completed/ready or legacy, preserve current operational state safely.
    // For existing legacy orders without art approval, default requires_art_approval = false
    // so existing ongoing work is not abruptly blocked.
    const orders = app.findRecordsByFilter('production_orders', '', '', 500, 0)
    for (const order of orders) {
      if (
        order.get('requires_art_approval') === undefined ||
        order.get('requires_art_approval') === null
      ) {
        if (order.get('art_approved') === true) {
          order.set('requires_art_approval', true)
        } else {
          order.set('requires_art_approval', false)
        }
        app.save(order)
      }
    }
  },
  (app) => {
    const quoteProductsCol = app.findCollectionByNameOrId('quote_products')
    if (quoteProductsCol && quoteProductsCol.fields.getByName('requires_art_approval')) {
      quoteProductsCol.fields.removeByName('requires_art_approval')
      app.save(quoteProductsCol)
    }

    const productionOrdersCol = app.findCollectionByNameOrId('production_orders')
    if (productionOrdersCol && productionOrdersCol.fields.getByName('requires_art_approval')) {
      productionOrdersCol.fields.removeByName('requires_art_approval')
      app.save(productionOrdersCol)
    }
  },
)
