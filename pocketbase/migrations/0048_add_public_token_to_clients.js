migrate(
  (app) => {
    const clientsCol = app.findCollectionByNameOrId('clients')

    // 1. Add public_token field if not exists
    if (!clientsCol.fields.getByName('public_token')) {
      clientsCol.fields.add(
        new TextField({
          name: 'public_token',
          required: false,
        }),
      )
    }

    // Save field definition first
    app.save(clientsCol)

    // 2. Populate public_token for all existing clients (32+ chars crypto unpredictable)
    const allClients = app.findRecordsByFilter('clients', '', 'created', 5000, 0)
    for (let i = 0; i < allClients.length; i++) {
      const c = allClients[i]
      const existingToken = c.getString('public_token')
      if (!existingToken) {
        const token = 'ctk_' + $security.randomString(32)
        c.set('public_token', token)
        app.save(c)
      }
    }

    // 3. Add UNIQUE index on public_token where public_token != ''
    clientsCol.addIndex('idx_clients_public_token', true, 'public_token', "public_token != ''")
    app.save(clientsCol)
  },
  (app) => {
    try {
      const clientsCol = app.findCollectionByNameOrId('clients')
      clientsCol.removeIndex('idx_clients_public_token')
      if (clientsCol.fields.getByName('public_token')) {
        clientsCol.fields.removeByName('public_token')
      }
      app.save(clientsCol)
    } catch (_) {}
  },
)
