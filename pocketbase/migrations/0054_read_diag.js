migrate(
  (app) => {
    // Read all run_ results from system_settings
    const records = app.findRecordsByFilter(
      'system_settings',
      "setting_key ~ 'run_'",
      '-created',
      100,
      0,
    )
    for (let i = 0; i < records.length; i++) {
      console.log(
        '[MIG RUN DIAG]',
        records[i].getString('setting_key'),
        '=>',
        records[i].getString('setting_value'),
      )
    }
  },
  (app) => {},
)
