migrate(
  (app) => {
    const attendancesCol = app.findCollectionByNameOrId('attendances')
    const quotesCol = app.findCollectionByNameOrId('quotes')

    // Add attendance_id relation field to quotes if not present
    if (!quotesCol.fields.getByName('attendance_id')) {
      quotesCol.fields.add(
        new RelationField({
          name: 'attendance_id',
          collectionId: attendancesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
      quotesCol.addIndex('idx_quotes_attendance', false, 'attendance_id', '')
      app.save(quotesCol)
    }
  },
  (app) => {
    try {
      const quotesCol = app.findCollectionByNameOrId('quotes')
      const field = quotesCol.fields.getByName('attendance_id')
      if (field) {
        quotesCol.fields.removeByName('attendance_id')
        quotesCol.removeIndex('idx_quotes_attendance')
        app.save(quotesCol)
      }
    } catch (_) {}
  },
)
