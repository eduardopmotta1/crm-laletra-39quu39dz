migrate(
  (app) => {
    // Update or migrate existing SLA settings to minutes
    // Keys can be sla_urgent_minutes, sla_warning_minutes, sla_notice_minutes
    // If old sla_*_hours exist, convert them (hours * 60) or set new default minute values.
    const settingsCol = app.findCollectionByNameOrId('system_settings')

    const slaConfigs = [
      {
        oldKey: 'sla_urgent_hours',
        newKey: 'sla_urgent_minutes',
        defaultVal: '1440', // 24h = 1440min
        desc: 'Tempo de resposta crítico (Vermelho) em minutos',
      },
      {
        oldKey: 'sla_warning_hours',
        newKey: 'sla_warning_minutes',
        defaultVal: '720', // 12h = 720min
        desc: 'Tempo de resposta alerta (Laranja) em minutos',
      },
      {
        oldKey: 'sla_notice_hours',
        newKey: 'sla_notice_minutes',
        defaultVal: '360', // 6h = 360min
        desc: 'Tempo de resposta atenção (Amarelo) em minutos',
      },
    ]

    for (const cfg of slaConfigs) {
      let convertedValue = cfg.defaultVal
      try {
        const oldRec = app.findFirstRecordByData('system_settings', 'setting_key', cfg.oldKey)
        const oldHours = Number(oldRec.getString('setting_value'))
        if (!isNaN(oldHours) && oldHours > 0) {
          convertedValue = String(oldHours * 60)
        }
        // Update key & value & description
        oldRec.set('setting_key', cfg.newKey)
        oldRec.set('setting_value', convertedValue)
        oldRec.set('description', cfg.desc)
        app.save(oldRec)
      } catch (_) {
        // old record didn't exist or already converted, check if newKey exists
        try {
          const newRec = app.findFirstRecordByData('system_settings', 'setting_key', cfg.newKey)
          // already exists
        } catch (_) {
          const rec = new Record(settingsCol)
          rec.set('setting_key', cfg.newKey)
          rec.set('setting_value', cfg.defaultVal)
          rec.set('description', cfg.desc)
          app.save(rec)
        }
      }
    }
  },
  (app) => {
    const slaConfigs = [
      {
        oldKey: 'sla_urgent_hours',
        newKey: 'sla_urgent_minutes',
        defaultHours: '24',
        desc: 'Tempo de resposta crítico (Vermelho) em horas',
      },
      {
        oldKey: 'sla_warning_hours',
        newKey: 'sla_warning_minutes',
        defaultHours: '12',
        desc: 'Tempo de resposta alerta (Laranja) em horas',
      },
      {
        oldKey: 'sla_notice_hours',
        newKey: 'sla_notice_minutes',
        defaultHours: '6',
        desc: 'Tempo de resposta atenção (Amarelo) em horas',
      },
    ]

    for (const cfg of slaConfigs) {
      try {
        const rec = app.findFirstRecordByData('system_settings', 'setting_key', cfg.newKey)
        const mins = Number(rec.getString('setting_value'))
        const hours = !isNaN(mins) && mins > 0 ? String(Math.round(mins / 60)) : cfg.defaultHours
        rec.set('setting_key', cfg.oldKey)
        rec.set('setting_value', hours)
        rec.set('description', cfg.desc)
        app.save(rec)
      } catch (_) {}
    }
  },
)
