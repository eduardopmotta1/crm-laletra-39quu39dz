migrate(
  (app) => {
    const prodOrdersCol = app.findCollectionByNameOrId('production_orders')
    const quotesCol = app.findCollectionByNameOrId('quotes')

    // 1. Add quote_id relation field to production_orders if not exists
    if (!prodOrdersCol.fields.getByName('quote_id')) {
      prodOrdersCol.fields.add(
        new RelationField({
          name: 'quote_id',
          collectionId: quotesCol.id,
          required: false,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
      app.save(prodOrdersCol)
    }

    // 2. Safe data migration for legacy records with [QUOTE_ID:...] tag
    // We scan all production_orders
    const orders = app.findRecordsByFilter('production_orders', '', 'created', 5000, 0)
    let linkedCount = 0
    let skippedCount = 0
    let conflictCount = 0

    // Set to track quote_ids already linked during migration to prevent multiple orders claiming same quote
    const assignedQuotes = {}

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i]
      const notes = order.getString('notes') || ''
      const description = order.getString('description') || ''
      const combinedText = notes + ' ' + description

      // Match [QUOTE_ID:<id>]
      const matches = combinedText.match(/\[QUOTE_ID:([a-zA-Z0-9_-]+)\]/g)

      if (!matches || matches.length === 0) {
        skippedCount++
        continue
      }

      // Check if there is exactly one unique quote id matched
      const extractedIds = []
      for (let m = 0; m < matches.length; m++) {
        const idMatch = matches[m].match(/\[QUOTE_ID:([a-zA-Z0-9_-]+)\]/)
        if (idMatch && idMatch[1]) {
          const matchedId = idMatch[1].trim()
          if (extractedIds.indexOf(matchedId) === -1) {
            extractedIds.push(matchedId)
          }
        }
      }

      if (extractedIds.length !== 1) {
        // Ambiguous: multiple different quote ids referenced
        conflictCount++
        continue
      }

      const targetQuoteId = extractedIds[0]

      // Check if quote exists
      let quoteRec = null
      try {
        quoteRec = app.findFirstRecordByData('quotes', 'id', targetQuoteId)
      } catch (_) {
        quoteRec = null
      }

      if (!quoteRec) {
        conflictCount++
        continue
      }

      // Check if another order already claimed this quote
      if (assignedQuotes[targetQuoteId]) {
        conflictCount++
        continue
      }

      // Compatibility check: client_id
      const orderClientId = order.getString('client_id')
      const quoteClientId = quoteRec.getString('client_id')
      if (orderClientId && quoteClientId && orderClientId !== quoteClientId) {
        conflictCount++
        continue
      }

      // Compatibility check: attendance_id
      const orderAttendanceId = order.getString('attendance_id')
      const quoteAttendanceId = quoteRec.getString('attendance_id')
      if (orderAttendanceId && quoteAttendanceId && orderAttendanceId !== quoteAttendanceId) {
        conflictCount++
        continue
      }

      // Safe to link!
      order.set('quote_id', targetQuoteId)
      app.save(order)
      assignedQuotes[targetQuoteId] = order.id
      linkedCount++
    }

    console.log(
      `[migration 0032] Legacy orders checked: ${orders.length}, linked: ${linkedCount}, skipped: ${skippedCount}, conflicts/ambiguous: ${conflictCount}`,
    )

    // 3. Add partial UNIQUE index for quote_id (only when quote_id is not empty / not null)
    // In SQLite / PocketBase partial index syntax:
    // col.addIndex(name, unique, columns, where)
    const refreshedCol = app.findCollectionByNameOrId('production_orders')
    refreshedCol.addIndex(
      'idx_prod_order_quote_unique',
      true,
      'quote_id',
      "quote_id != '' AND quote_id IS NOT NULL",
    )
    app.save(refreshedCol)
  },
  (app) => {
    try {
      const prodOrdersCol = app.findCollectionByNameOrId('production_orders')
      prodOrdersCol.removeIndex('idx_prod_order_quote_unique')
      if (prodOrdersCol.fields.getByName('quote_id')) {
        prodOrdersCol.fields.removeByName('quote_id')
      }
      app.save(prodOrdersCol)
    } catch (_) {}
  },
)
