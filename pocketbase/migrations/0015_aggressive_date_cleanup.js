migrate(
  (app) => {
    // In SQLite, date('2026-08-26 00:00:00.000Z') or date('2026-08-26T00:00:00.000Z') produces '2026-08-26'.
    // We update every record where the date column is present and non-empty.
    // Also we clean any spaces or ISO suffixes using substr / date().

    // 1. clients
    const clientFields = [
      'last_message_at',
      'closed_at',
      'next_action_date',
      'reopened_at',
      'first_purchase_date',
      'last_purchase_date',
    ]
    for (const f of clientFields) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE clients SET ${f} = CASE 
              WHEN ${f} IS NULL OR ${f} = '' THEN NULL 
              ELSE COALESCE(date(${f}), substr(${f}, 1, 10)) 
            END WHERE ${f} IS NOT NULL AND ${f} != ''`,
          )
          .execute()
      } catch (err) {
        console.log(`[migration 0015] clients.${f} cleanup warning:`, err)
      }
    }

    // 2. archived_deals
    const archivedDealFields = ['closed_at']
    for (const f of archivedDealFields) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE archived_deals SET ${f} = CASE 
              WHEN ${f} IS NULL OR ${f} = '' THEN NULL 
              ELSE COALESCE(date(${f}), substr(${f}, 1, 10)) 
            END WHERE ${f} IS NOT NULL AND ${f} != ''`,
          )
          .execute()
      } catch (err) {
        console.log(`[migration 0015] archived_deals.${f} cleanup warning:`, err)
      }
    }

    // 3. production_orders
    const prodOrderFields = [
      'sale_date',
      'promised_deadline',
      'estimated_delivery_date',
      'completed_at',
      'art_approved_at',
    ]
    for (const f of prodOrderFields) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE production_orders SET ${f} = CASE 
              WHEN ${f} IS NULL OR ${f} = '' THEN NULL 
              ELSE COALESCE(date(${f}), substr(${f}, 1, 10)) 
            END WHERE ${f} IS NOT NULL AND ${f} != ''`,
          )
          .execute()
      } catch (err) {
        console.log(`[migration 0015] production_orders.${f} cleanup warning:`, err)
      }
    }

    // 4. production_proofs
    const prodProofFields = ['sent_at', 'approved_at']
    for (const f of prodProofFields) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE production_proofs SET ${f} = CASE 
              WHEN ${f} IS NULL OR ${f} = '' THEN NULL 
              ELSE COALESCE(date(${f}), substr(${f}, 1, 10)) 
            END WHERE ${f} IS NOT NULL AND ${f} != ''`,
          )
          .execute()
      } catch (err) {
        console.log(`[migration 0015] production_proofs.${f} cleanup warning:`, err)
      }
    }

    // 5. post_sales
    const postSalesFields = ['scheduled_date', 'sent_date']
    for (const f of postSalesFields) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE post_sales SET ${f} = CASE 
              WHEN ${f} IS NULL OR ${f} = '' THEN NULL 
              ELSE COALESCE(date(${f}), substr(${f}, 1, 10)) 
            END WHERE ${f} IS NOT NULL AND ${f} != ''`,
          )
          .execute()
      } catch (err) {
        console.log(`[migration 0015] post_sales.${f} cleanup warning:`, err)
      }
    }

    // 6. evaluations
    const evalFields = ['resolved_at']
    for (const f of evalFields) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE evaluations SET ${f} = CASE 
              WHEN ${f} IS NULL OR ${f} = '' THEN NULL 
              ELSE COALESCE(date(${f}), substr(${f}, 1, 10)) 
            END WHERE ${f} IS NOT NULL AND ${f} != ''`,
          )
          .execute()
      } catch (err) {
        console.log(`[migration 0015] evaluations.${f} cleanup warning:`, err)
      }
    }

    // 7. tasks
    const taskFields = ['due_date']
    for (const f of taskFields) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE tasks SET ${f} = CASE 
              WHEN ${f} IS NULL OR ${f} = '' THEN NULL 
              ELSE COALESCE(date(${f}), substr(${f}, 1, 10)) 
            END WHERE ${f} IS NOT NULL AND ${f} != ''`,
          )
          .execute()
      } catch (err) {
        console.log(`[migration 0015] tasks.${f} cleanup warning:`, err)
      }
    }

    // 8. pending_resolutions
    const pendingFields = ['item_created_at', 'resolved_at']
    for (const f of pendingFields) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE pending_resolutions SET ${f} = CASE 
              WHEN ${f} IS NULL OR ${f} = '' THEN NULL 
              ELSE COALESCE(date(${f}), substr(${f}, 1, 10)) 
            END WHERE ${f} IS NOT NULL AND ${f} != ''`,
          )
          .execute()
      } catch (err) {
        console.log(`[migration 0015] pending_resolutions.${f} cleanup warning:`, err)
      }
    }
  },
  (app) => {
    // Revert logic is a no-op since cleaning invalid date strings cannot/should not be reversed
  },
)
