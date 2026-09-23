migrate(
  (app) => {
    let fsys = null
    let backupsList = []
    try {
      fsys = app.newBackupsFilesystem()
      const files = fsys.list('') || []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (f && !f.isDir) {
          let sz = 0
          try {
            const attrs = fsys.attributes(f.key)
            if (attrs && typeof attrs.size === 'number') sz = attrs.size
          } catch (_) {}
          backupsList.push({ key: f.key, size: sz })
        }
      }
    } finally {
      if (fsys) {
        try {
          fsys.close()
        } catch (_) {}
      }
    }

    const settingsCol = app.findCollectionByNameOrId('system_settings')
    const rec = new Record(settingsCol)
    rec.set('setting_key', 'list_backups_result')
    rec.set('setting_value', JSON.stringify(backupsList))
    rec.set('description', 'List of backups created in pb_data')
    app.save(rec)
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData('system_settings', 'setting_key', 'list_backups_result')
      app.delete(rec)
    } catch (_) {}
  },
)
