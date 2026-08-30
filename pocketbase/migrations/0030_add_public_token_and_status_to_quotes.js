migrate(
  (app) => {
    const quotesCol = app.findCollectionByNameOrId('quotes')

    // 1. Add fields if not exist
    if (!quotesCol.fields.getByName('public_token')) {
      quotesCol.fields.add(
        new TextField({
          name: 'public_token',
          required: false,
        }),
      )
    }

    if (!quotesCol.fields.getByName('approved_at')) {
      quotesCol.fields.add(
        new DateField({
          name: 'approved_at',
          required: false,
        }),
      )
    }

    if (!quotesCol.fields.getByName('rejected_at')) {
      quotesCol.fields.add(
        new DateField({
          name: 'rejected_at',
          required: false,
        }),
      )
    }

    if (!quotesCol.fields.getByName('customer_notes')) {
      quotesCol.fields.add(
        new TextField({
          name: 'customer_notes',
          required: false,
        }),
      )
    }

    const statusField = quotesCol.fields.getByName('status')
    if (statusField) {
      statusField.values = [
        'rascunho',
        'enviado',
        'aprovado',
        'recusado',
        'expirado',
        'alteracao_solicitada',
      ]
      statusField.maxSelect = 1
    }

    // Save field definitions first
    app.save(quotesCol)

    // 2. Populate public_token for all existing quotes
    const allQuotes = app.findRecordsByFilter('quotes', '', 'created', 5000, 0)
    for (let i = 0; i < allQuotes.length; i++) {
      const q = allQuotes[i]
      const existingToken = q.getString('public_token')
      if (!existingToken) {
        const token = 'qtk_' + $security.randomString(24)
        q.set('public_token', token)
        app.save(q)
      }
    }

    // 3. Add UNIQUE index on public_token where public_token != ''
    quotesCol.addIndex('idx_quotes_public_token', true, 'public_token', "public_token != ''")
    app.save(quotesCol)
  },
  (app) => {
    try {
      const quotesCol = app.findCollectionByNameOrId('quotes')
      quotesCol.removeIndex('idx_quotes_public_token')
      if (quotesCol.fields.getByName('public_token')) {
        quotesCol.fields.removeByName('public_token')
      }
      if (quotesCol.fields.getByName('approved_at')) {
        quotesCol.fields.removeByName('approved_at')
      }
      if (quotesCol.fields.getByName('rejected_at')) {
        quotesCol.fields.removeByName('rejected_at')
      }
      if (quotesCol.fields.getByName('customer_notes')) {
        quotesCol.fields.removeByName('customer_notes')
      }
      const statusField = quotesCol.fields.getByName('status')
      if (statusField) {
        statusField.values = ['rascunho', 'enviado', 'aprovado', 'recusado', 'expirado']
      }
      app.save(quotesCol)
    } catch (_) {}
  },
)
