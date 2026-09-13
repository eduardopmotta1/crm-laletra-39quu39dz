migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('system_settings')
    const r = new Record(col)
    r.set('setting_key', 'trigger_diag_meta_now')
    r.set('setting_value', String(Date.now()))
    r.set('description', 'trigger_diag_meta_now')
    app.save(r)
  },
  (app) => {},
)
