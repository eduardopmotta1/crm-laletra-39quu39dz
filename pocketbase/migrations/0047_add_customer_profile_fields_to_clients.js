migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('clients')

    if (!col.fields.getByName('client_type')) {
      col.fields.add(
        new SelectField({
          name: 'client_type',
          values: ['pessoa_fisica', 'pessoa_juridica'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('trade_name')) {
      col.fields.add(new TextField({ name: 'trade_name', required: false }))
    }

    if (!col.fields.getByName('cpf_cnpj')) {
      col.fields.add(new TextField({ name: 'cpf_cnpj', required: false }))
    }

    if (!col.fields.getByName('birth_date')) {
      col.fields.add(new DateField({ name: 'birth_date', required: false }))
    }

    if (!col.fields.getByName('secondary_phone')) {
      col.fields.add(new TextField({ name: 'secondary_phone', required: false }))
    }

    if (!col.fields.getByName('instagram')) {
      col.fields.add(new TextField({ name: 'instagram', required: false }))
    }

    if (!col.fields.getByName('how_found')) {
      col.fields.add(new TextField({ name: 'how_found', required: false }))
    }

    if (!col.fields.getByName('is_vip')) {
      col.fields.add(new BoolField({ name: 'is_vip', required: false }))
    }

    if (!col.fields.getByName('address_zip')) {
      col.fields.add(new TextField({ name: 'address_zip', required: false }))
    }

    if (!col.fields.getByName('address_street')) {
      col.fields.add(new TextField({ name: 'address_street', required: false }))
    }

    if (!col.fields.getByName('address_number')) {
      col.fields.add(new TextField({ name: 'address_number', required: false }))
    }

    if (!col.fields.getByName('address_complement')) {
      col.fields.add(new TextField({ name: 'address_complement', required: false }))
    }

    if (!col.fields.getByName('address_neighborhood')) {
      col.fields.add(new TextField({ name: 'address_neighborhood', required: false }))
    }

    if (!col.fields.getByName('address_city')) {
      col.fields.add(new TextField({ name: 'address_city', required: false }))
    }

    if (!col.fields.getByName('address_state')) {
      col.fields.add(new TextField({ name: 'address_state', required: false }))
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('clients')
    const fieldsToRemove = [
      'client_type',
      'trade_name',
      'cpf_cnpj',
      'birth_date',
      'secondary_phone',
      'instagram',
      'how_found',
      'is_vip',
      'address_zip',
      'address_street',
      'address_number',
      'address_complement',
      'address_neighborhood',
      'address_city',
      'address_state',
    ]

    for (let f of fieldsToRemove) {
      const existing = col.fields.getByName(f)
      if (existing) {
        col.fields.removeByName(f)
      }
    }

    app.save(col)
  },
)
