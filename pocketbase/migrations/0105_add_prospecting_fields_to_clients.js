migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('clients')

    if (!col.fields.getByName('origin')) {
      col.fields.add(new TextField({ name: 'origin', required: false }))
    }

    if (!col.fields.getByName('prospecting_status')) {
      col.fields.add(
        new SelectField({
          name: 'prospecting_status',
          values: [
            'Nao contatado',
            'Contato iniciado',
            'Respondeu',
            'Interessado',
            'Orcamento',
            'Convertido',
            'Sem interesse',
          ],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('external_place_id')) {
      col.fields.add(new TextField({ name: 'external_place_id', required: false }))
    }

    if (!col.fields.getByName('latitude')) {
      col.fields.add(new NumberField({ name: 'latitude', required: false }))
    }

    if (!col.fields.getByName('longitude')) {
      col.fields.add(new NumberField({ name: 'longitude', required: false }))
    }

    if (!col.fields.getByName('website')) {
      col.fields.add(new TextField({ name: 'website', required: false }))
    }

    if (!col.fields.getByName('business_category')) {
      col.fields.add(new TextField({ name: 'business_category', required: false }))
    }

    if (!col.fields.getByName('prospecting_date')) {
      col.fields.add(new DateField({ name: 'prospecting_date', required: false }))
    }

    app.save(col)

    // Adiciona índice não único em external_place_id para busca rápida e anti-duplicação
    try {
      col.addIndex('idx_clients_place_id', false, 'external_place_id', '')
      app.save(col)
    } catch (_) {}
  },
  (app) => {
    const col = app.findCollectionByNameOrId('clients')
    const fieldsToRemove = [
      'origin',
      'prospecting_status',
      'external_place_id',
      'latitude',
      'longitude',
      'website',
      'business_category',
      'prospecting_date',
    ]

    for (const f of fieldsToRemove) {
      if (col.fields.getByName(f)) {
        col.fields.removeByName(f)
      }
    }

    try {
      col.removeIndex('idx_clients_place_id')
    } catch (_) {}

    app.save(col)
  },
)
