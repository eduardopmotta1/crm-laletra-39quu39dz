migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('attendances')
    col.deleteRule = "@request.auth.id != '' && @request.auth.role_slug = 'admin'"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('attendances')
    col.deleteRule = "@request.auth.id != ''"
    app.save(col)
  },
)
