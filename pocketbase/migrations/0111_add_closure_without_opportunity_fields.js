migrate(
  (app) => {
    // 1. attendances: adicionar closure_type (select) e closure_reason (text) se ainda não existirem
    try {
      const attendancesCol = app.findCollectionByNameOrId('attendances')
      let changedAtt = false

      if (!attendancesCol.fields.getByName('closure_type')) {
        attendancesCol.fields.add(
          new SelectField({
            name: 'closure_type',
            values: ['won', 'lost', 'without_opportunity'],
            maxSelect: 1,
            required: false,
          }),
        )
        changedAtt = true
      }

      if (!attendancesCol.fields.getByName('closure_reason')) {
        attendancesCol.fields.add(
          new TextField({
            name: 'closure_reason',
            required: false,
          }),
        )
        changedAtt = true
      }

      if (changedAtt) {
        app.save(attendancesCol)
      }
    } catch (errAtt) {
      console.warn('[Migration 0111] Aviso ao atualizar attendances:', errAtt)
    }

    // 2. archived_deals: adicionar closure_type (select) e closure_reason (text) se ainda não existirem
    try {
      const archivedDealsCol = app.findCollectionByNameOrId('archived_deals')
      let changedArch = false

      if (!archivedDealsCol.fields.getByName('closure_type')) {
        archivedDealsCol.fields.add(
          new SelectField({
            name: 'closure_type',
            values: ['won', 'lost', 'without_opportunity'],
            maxSelect: 1,
            required: false,
          }),
        )
        changedArch = true
      }

      if (!archivedDealsCol.fields.getByName('closure_reason')) {
        archivedDealsCol.fields.add(
          new TextField({
            name: 'closure_reason',
            required: false,
          }),
        )
        changedArch = true
      }

      if (changedArch) {
        app.save(archivedDealsCol)
      }
    } catch (errArch) {
      console.warn('[Migration 0111] Aviso ao atualizar archived_deals:', errArch)
    }
  },
  (app) => {
    try {
      const attendancesCol = app.findCollectionByNameOrId('attendances')
      if (attendancesCol.fields.getByName('closure_type')) {
        attendancesCol.fields.removeByName('closure_type')
      }
      if (attendancesCol.fields.getByName('closure_reason')) {
        attendancesCol.fields.removeByName('closure_reason')
      }
      app.save(attendancesCol)
    } catch (_) {}

    try {
      const archivedDealsCol = app.findCollectionByNameOrId('archived_deals')
      if (archivedDealsCol.fields.getByName('closure_type')) {
        archivedDealsCol.fields.removeByName('closure_type')
      }
      if (archivedDealsCol.fields.getByName('closure_reason')) {
        archivedDealsCol.fields.removeByName('closure_reason')
      }
      app.save(archivedDealsCol)
    } catch (_) {}
  },
)
