migrate(
  (app) => {
    const settingsCol = app.findCollectionByNameOrId('system_settings')

    const settings = [
      {
        key: 'automation_waiting_response_alta_min',
        value: '15',
        desc: 'Minutos para prioridade Alta em Cliente aguardando resposta',
      },
      {
        key: 'automation_waiting_response_urgente_min',
        value: '60',
        desc: 'Minutos para prioridade Urgente em Cliente aguardando resposta',
      },
      {
        key: 'automation_quote_no_return_alta_days',
        value: '1',
        desc: 'Dias para prioridade Alta em Orçamento sem retorno',
      },
      {
        key: 'automation_quote_no_return_urgente_days',
        value: '3',
        desc: 'Dias para prioridade Urgente em Orçamento sem retorno',
      },
      {
        key: 'automation_followup_overdue_urgente_days',
        value: '2',
        desc: 'Dias de atraso para prioridade Urgente em Follow-up vencido',
      },
      {
        key: 'automation_proof_waiting_alta_days',
        value: '1',
        desc: 'Dias para prioridade Alta em Arte aguardando aprovação',
      },
      {
        key: 'automation_proof_waiting_urgente_days',
        value: '2',
        desc: 'Dias para prioridade Urgente em Arte aguardando aprovação',
      },
      {
        key: 'automation_order_overdue_urgente_days',
        value: '1',
        desc: 'Dias de atraso para prioridade Urgente em Pedido atrasado',
      },
      {
        key: 'automation_dissatisfied_urgente_hours',
        value: '24',
        desc: 'Horas para prioridade Urgente em Cliente insatisfeito',
      },
      {
        key: 'automation_postsale_alta_days',
        value: '1',
        desc: 'Dias para prioridade Alta em Pós-venda pendente',
      },
      {
        key: 'automation_postsale_urgente_days',
        value: '3',
        desc: 'Dias para prioridade Urgente em Pós-venda pendente',
      },
    ]

    for (const s of settings) {
      try {
        app.findFirstRecordByData('system_settings', 'setting_key', s.key)
      } catch (_) {
        const rec = new Record(settingsCol)
        rec.set('setting_key', s.key)
        rec.set('setting_value', s.value)
        rec.set('description', s.desc)
        app.save(rec)
      }
    }
  },
  (app) => {
    const keys = [
      'automation_waiting_response_alta_min',
      'automation_waiting_response_urgente_min',
      'automation_quote_no_return_alta_days',
      'automation_quote_no_return_urgente_days',
      'automation_followup_overdue_urgente_days',
      'automation_proof_waiting_alta_days',
      'automation_proof_waiting_urgente_days',
      'automation_order_overdue_urgente_days',
      'automation_dissatisfied_urgente_hours',
      'automation_postsale_alta_days',
      'automation_postsale_urgente_days',
    ]
    for (const k of keys) {
      try {
        const rec = app.findFirstRecordByData('system_settings', 'setting_key', k)
        app.delete(rec)
      } catch (_) {}
    }
  },
)
