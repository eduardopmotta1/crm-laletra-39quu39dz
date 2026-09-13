migrate(
  (app) => {
    // Limpeza de registros de diagnóstico antigos em system_settings
    // Mantém meta_credential_validation_result
    const filter =
      "setting_key ~ 'diag_' || " +
      "setting_key ~ 'run_' || " +
      "setting_key = 'meta_audit_diag' || " +
      "setting_key = 'meta_submission_result' || " +
      "setting_key = 'trigger_meta_submission_exec' || " +
      "setting_key = 'trigger_diag_meta_now' || " +
      "setting_key = 'temp_meta_test_status'"

    try {
      const records = app.findRecordsByFilter('system_settings', filter, '-created', 500, 0)
      for (let i = 0; i < records.length; i++) {
        try {
          app.delete(records[i])
        } catch (_) {}
      }
    } catch (_) {}
  },
  (app) => {},
)
