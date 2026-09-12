migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'temp_meta_test_status',
      )
      if (rec) {
        app.delete(rec)
      }
    } catch (_) {}
  },
  () => {},
)
