migrate(
  (app) => {
    const getVal = (key) => {
      try {
        const r = app.findFirstRecordByData('system_settings', 'setting_key', key)
        return r ? r.getString('setting_value') : 'NOT_FOUND'
      } catch (_) {
        return 'ERR_NOT_FOUND'
      }
    }

    const out = [
      'ME_WABA_v21=' + getVal('run_me_wabas_v21.0'),
      'ME_WABA_v19=' + getVal('run_me_wabas_v19.0'),
      'ME_WABA_v18=' + getVal('run_me_wabas_v18.0'),
      'ME_WABA_v16=' + getVal('run_me_wabas_v16.0'),
      'PHONE_TPLS_v21=' + getVal('run_phone_tpls_v21'),
      'PHONE_TPLS_v19=' + getVal('run_phone_tpls_v19'),
    ].join(' ### ')

    throw new Error('PART3: ' + out.substring(0, 1500))
  },
  (app) => {},
)
