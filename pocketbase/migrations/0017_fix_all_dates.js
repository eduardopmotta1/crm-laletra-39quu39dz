migrate(
  (app) => {
    const tables = {
      clients: [
        'last_message_at',
        'closed_at',
        'next_action_date',
        'reopened_at',
        'first_purchase_date',
        'last_purchase_date',
      ],
      archived_deals: ['closed_at'],
      production_orders: [
        'sale_date',
        'promised_deadline',
        'estimated_delivery_date',
        'completed_at',
        'art_approved_at',
      ],
      production_proofs: ['sent_at', 'approved_at'],
      post_sales: ['scheduled_date', 'sent_date'],
      evaluations: ['resolved_at'],
      tasks: ['due_date'],
      pending_resolutions: ['item_created_at', 'resolved_at'],
    }

    for (const [table, fields] of Object.entries(tables)) {
      for (const field of fields) {
        try {
          app
            .db()
            .newQuery(
              `UPDATE ${table} SET ${field} = substr(${field}, 1, 10) WHERE ${field} IS NOT NULL AND ${field} != '' AND length(${field}) > 10`,
            )
            .execute()
          console.log(`[migration 0017] Cleaned ${table}.${field}`)
        } catch (err) {
          console.log(`[migration 0017] ${table}.${field} warning:`, err)
        }
      }
    }
  },
  (app) => {
    /* noop revert */
  },
)
