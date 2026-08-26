migrate(
  (app) => {
    // Convert all `date` type fields across every collection to pure YYYY-MM-DD format.
    // PocketBase strictly validates `date` fields as YYYY-MM-DD (or empty string/null).
    // Using SQLite date() function or substr(field, 1, 10) converts ISO datetimes like '2026-08-25 23:54:53.615Z' to '2026-08-25'.

    // 1. clients
    // fields: last_message_at, closed_at, next_action_date, reopened_at, first_purchase_date, last_purchase_date
    app
      .db()
      .newQuery(`
      UPDATE clients SET
        last_message_at = CASE WHEN last_message_at IS NOT NULL AND last_message_at != '' THEN substr(last_message_at, 1, 10) ELSE last_message_at END,
        closed_at = CASE WHEN closed_at IS NOT NULL AND closed_at != '' THEN substr(closed_at, 1, 10) ELSE closed_at END,
        next_action_date = CASE WHEN next_action_date IS NOT NULL AND next_action_date != '' THEN substr(next_action_date, 1, 10) ELSE next_action_date END,
        reopened_at = CASE WHEN reopened_at IS NOT NULL AND reopened_at != '' THEN substr(reopened_at, 1, 10) ELSE reopened_at END,
        first_purchase_date = CASE WHEN first_purchase_date IS NOT NULL AND first_purchase_date != '' THEN substr(first_purchase_date, 1, 10) ELSE first_purchase_date END,
        last_purchase_date = CASE WHEN last_purchase_date IS NOT NULL AND last_purchase_date != '' THEN substr(last_purchase_date, 1, 10) ELSE last_purchase_date END
    `)
      .execute()

    // 2. archived_deals
    // fields: closed_at
    app
      .db()
      .newQuery(`
      UPDATE archived_deals SET
        closed_at = CASE WHEN closed_at IS NOT NULL AND closed_at != '' THEN substr(closed_at, 1, 10) ELSE closed_at END
    `)
      .execute()

    // 3. production_orders
    // fields: sale_date, promised_deadline, estimated_delivery_date, completed_at, art_approved_at
    app
      .db()
      .newQuery(`
      UPDATE production_orders SET
        sale_date = CASE WHEN sale_date IS NOT NULL AND sale_date != '' THEN substr(sale_date, 1, 10) ELSE sale_date END,
        promised_deadline = CASE WHEN promised_deadline IS NOT NULL AND promised_deadline != '' THEN substr(promised_deadline, 1, 10) ELSE promised_deadline END,
        estimated_delivery_date = CASE WHEN estimated_delivery_date IS NOT NULL AND estimated_delivery_date != '' THEN substr(estimated_delivery_date, 1, 10) ELSE estimated_delivery_date END,
        completed_at = CASE WHEN completed_at IS NOT NULL AND completed_at != '' THEN substr(completed_at, 1, 10) ELSE completed_at END,
        art_approved_at = CASE WHEN art_approved_at IS NOT NULL AND art_approved_at != '' THEN substr(art_approved_at, 1, 10) ELSE art_approved_at END
    `)
      .execute()

    // 4. production_proofs
    // fields: sent_at, approved_at
    app
      .db()
      .newQuery(`
      UPDATE production_proofs SET
        sent_at = CASE WHEN sent_at IS NOT NULL AND sent_at != '' THEN substr(sent_at, 1, 10) ELSE sent_at END,
        approved_at = CASE WHEN approved_at IS NOT NULL AND approved_at != '' THEN substr(approved_at, 1, 10) ELSE approved_at END
    `)
      .execute()

    // 5. post_sales
    // fields: scheduled_date, sent_date
    app
      .db()
      .newQuery(`
      UPDATE post_sales SET
        scheduled_date = CASE WHEN scheduled_date IS NOT NULL AND scheduled_date != '' THEN substr(scheduled_date, 1, 10) ELSE scheduled_date END,
        sent_date = CASE WHEN sent_date IS NOT NULL AND sent_date != '' THEN substr(sent_date, 1, 10) ELSE sent_date END
    `)
      .execute()

    // 6. evaluations
    // fields: resolved_at
    app
      .db()
      .newQuery(`
      UPDATE evaluations SET
        resolved_at = CASE WHEN resolved_at IS NOT NULL AND resolved_at != '' THEN substr(resolved_at, 1, 10) ELSE resolved_at END
    `)
      .execute()

    // 7. tasks
    // fields: due_date
    app
      .db()
      .newQuery(`
      UPDATE tasks SET
        due_date = CASE WHEN due_date IS NOT NULL AND due_date != '' THEN substr(due_date, 1, 10) ELSE due_date END
    `)
      .execute()

    // 8. pending_resolutions
    // fields: item_created_at, resolved_at
    app
      .db()
      .newQuery(`
      UPDATE pending_resolutions SET
        item_created_at = CASE WHEN item_created_at IS NOT NULL AND item_created_at != '' THEN substr(item_created_at, 1, 10) ELSE item_created_at END,
        resolved_at = CASE WHEN resolved_at IS NOT NULL AND resolved_at != '' THEN substr(resolved_at, 1, 10) ELSE resolved_at END
    `)
      .execute()
  },
  (app) => {
    // Revert logic not needed for data format cleanup
  },
)
