migrate(
  (app) => {
    // 1. Remove duplicate archived_deals records per client_id:
    // Keep only the oldest record (MIN created or MIN id) per client_id
    app
      .db()
      .newQuery(`
    DELETE FROM archived_deals 
    WHERE id NOT IN (
      SELECT id FROM archived_deals a1
      WHERE a1.created = (
        SELECT MIN(a2.created) 
        FROM archived_deals a2 
        WHERE a2.client_id = a1.client_id
      )
      GROUP BY a1.client_id
    )
  `)
      .execute()

    // 2. For each client that has an entry in archived_deals:
    // ensure is_archived = true and last_archived_deal_id is set to their archived_deal id
    app
      .db()
      .newQuery(`
    UPDATE clients 
    SET is_archived = 1,
        last_archived_deal_id = (
          SELECT id FROM archived_deals 
          WHERE archived_deals.client_id = clients.id 
          ORDER BY created ASC 
          LIMIT 1
        )
    WHERE id IN (SELECT DISTINCT client_id FROM archived_deals WHERE client_id IS NOT NULL AND client_id != '')
  `)
      .execute()
  },
  (app) => {
    // Irreversible cleanup migration, no rollback needed
  },
)
