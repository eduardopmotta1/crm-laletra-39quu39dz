migrate(
  (app) => {
    // 1. Criar coleção places_cache para cache simples e persistente (TTL 24h)
    try {
      app.findCollectionByNameOrId('places_cache')
    } catch (_) {
      const col = new Collection({
        name: 'places_cache',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'cache_key', type: 'text', required: true },
          {
            name: 'cache_type',
            type: 'select',
            values: ['search', 'details'],
            maxSelect: 1,
            required: true,
          },
          { name: 'data', type: 'json', required: true },
          { name: 'expires_at', type: 'date', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_places_cache_key ON places_cache (cache_key)',
          'CREATE INDEX idx_places_cache_expires ON places_cache (expires_at)',
        ],
      })
      app.save(col)
    }

    // 2. Garantir campo google_place_id em clients (além de external_place_id existente)
    const clientsCol = app.findCollectionByNameOrId('clients')
    if (!clientsCol.fields.getByName('google_place_id')) {
      clientsCol.fields.add(new TextField({ name: 'google_place_id', required: false }))
      app.save(clientsCol)
      try {
        clientsCol.addIndex('idx_clients_google_place_id', false, 'google_place_id', '')
        app.save(clientsCol)
      } catch (_) {}
    }

    // 3. Inicializar contadores em system_settings se não existirem
    const counters = [
      { key: 'google_search_requests', desc: 'Total de buscas realizadas na Google Places API' },
      {
        key: 'google_details_requests',
        desc: 'Total de requisições de detalhes na Google Places API',
      },
      { key: 'google_cache_hits', desc: 'Total de requisições atendidas pelo cache' },
    ]

    const settingsCol = app.findCollectionByNameOrId('system_settings')
    for (const c of counters) {
      try {
        app.findFirstRecordByData('system_settings', 'setting_key', c.key)
      } catch (_) {
        const rec = new Record(settingsCol)
        rec.set('setting_key', c.key)
        rec.set('setting_value', '0')
        rec.set('description', c.desc)
        app.save(rec)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('places_cache')
      app.delete(col)
    } catch (_) {}

    try {
      const clientsCol = app.findCollectionByNameOrId('clients')
      if (clientsCol.fields.getByName('google_place_id')) {
        clientsCol.fields.removeByName('google_place_id')
      }
      try {
        clientsCol.removeIndex('idx_clients_google_place_id')
      } catch (_) {}
      app.save(clientsCol)
    } catch (_) {}
  },
)
