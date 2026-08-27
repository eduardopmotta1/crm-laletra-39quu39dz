migrate(
  (app) => {
    // Helper to normalize phone number: remove non-digits
    const normalizePhone = (p) => {
      if (!p) return ''
      let digits = p.replace(/\D/g, '')
      // Remove leading 55 if country code present with full number (e.g. 5521999999999 -> 21999999999)
      if (digits.startsWith('55') && digits.length >= 12) {
        digits = digits.substring(2)
      }
      return digits
    }

    const clients = app.findRecordsByFilter('clients', '', 'created', 1000, 0)
    console.log(
      '[Migration 0022] Consolidating duplicate clients among ' + clients.length + ' records',
    )

    // Group clients by normalized phone
    const phoneGroups = {}
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i]
      const rawPhone = c.getString('phone')
      const norm = normalizePhone(rawPhone)
      if (!norm || norm.length < 8) continue // skip invalid/placeholder phones

      if (!phoneGroups[norm]) {
        phoneGroups[norm] = []
      }
      phoneGroups[norm].push(c)
    }

    // Process each group with duplicates
    for (const normPhone in phoneGroups) {
      const group = phoneGroups[normPhone]
      if (group.length <= 1) continue

      console.log(
        '[Migration 0022] Found duplicate group for phone ' +
          normPhone +
          ' with ' +
          group.length +
          ' clients',
      )

      // Score each client: completeness (name, email, notes, etc.) and oldest created date
      let canonical = group[0]
      let maxScore = -1

      for (let j = 0; j < group.length; j++) {
        const c = group[j]
        let score = 0
        if (c.getString('name') && c.getString('name').length > 3) score += 5
        if (c.getString('email')) score += 5
        if (c.getString('notes')) score += 3
        if (c.getString('next_action')) score += 2
        if (c.get('total_purchases') && Number(c.get('total_purchases')) > 0) score += 10
        if (c.get('total_purchase_value') && Number(c.get('total_purchase_value')) > 0) score += 10

        // If score is strictly higher, pick this one
        if (score > maxScore) {
          maxScore = score
          canonical = c
        }
      }

      console.log(
        '[Migration 0022] Selected canonical client: ' +
          canonical.id +
          ' (' +
          canonical.getString('name') +
          ')',
      )

      // Reassign attendances, messages, production_orders, stage_transitions, archived_deals, tasks to canonical
      for (let k = 0; k < group.length; k++) {
        const dup = group[k]
        if (dup.id === canonical.id) continue

        // 1. Reassign attendances
        const atts = app.findRecordsByFilter(
          'attendances',
          'client_id = "' + dup.id + '"',
          '',
          100,
          0,
        )
        for (let a = 0; a < atts.length; a++) {
          atts[a].set('client_id', canonical.id)
          app.save(atts[a])
        }

        // 2. Reassign messages
        const msgs = app.findRecordsByFilter('messages', 'client_id = "' + dup.id + '"', '', 500, 0)
        for (let m = 0; m < msgs.length; m++) {
          msgs[m].set('client_id', canonical.id)
          app.save(msgs[m])
        }

        // 3. Reassign production_orders
        const orders = app.findRecordsByFilter(
          'production_orders',
          'client_id = "' + dup.id + '"',
          '',
          100,
          0,
        )
        for (let o = 0; o < orders.length; o++) {
          orders[o].set('client_id', canonical.id)
          app.save(orders[o])
        }

        // 4. Reassign stage_transitions
        const trans = app.findRecordsByFilter(
          'stage_transitions',
          'client_id = "' + dup.id + '"',
          '',
          100,
          0,
        )
        for (let t = 0; t < trans.length; t++) {
          trans[t].set('client_id', canonical.id)
          app.save(trans[t])
        }

        // 5. Reassign archived_deals
        const deals = app.findRecordsByFilter(
          'archived_deals',
          'client_id = "' + dup.id + '"',
          '',
          100,
          0,
        )
        for (let d = 0; d < deals.length; d++) {
          deals[d].set('client_id', canonical.id)
          app.save(deals[d])
        }

        // 6. Reassign tasks
        const tasks = app.findRecordsByFilter('tasks', 'client_id = "' + dup.id + '"', '', 100, 0)
        for (let tk = 0; tk < tasks.length; tk++) {
          tasks[tk].set('client_id', canonical.id)
          app.save(tasks[tk])
        }

        // 7. Mark duplicate client as archived / legacy note (do not delete)
        dup.set('is_archived', true)
        dup.set(
          'notes',
          (dup.getString('notes') ? dup.getString('notes') + ' ' : '') +
            '[DUPLICADO_CONSOLIDADO -> ' +
            canonical.id +
            ']',
        )
        app.save(dup)
      }
    }

    // 8. Recalculate total_purchases, total_purchase_value, first_purchase_date, last_purchase_date for all clients
    const allClientsAfter = app.findRecordsByFilter('clients', '', 'created', 1000, 0)
    for (let cIdx = 0; cIdx < allClientsAfter.length; cIdx++) {
      const client = allClientsAfter[cIdx]
      const wonDeals = app.findRecordsByFilter(
        'archived_deals',
        'client_id = "' + client.id + '" && result = "Venda fechada"',
        'closed_at',
        500,
        0,
      )

      const totalPurchases = wonDeals.length
      let totalPurchaseValue = 0
      let firstDate = null
      let lastDate = null

      for (let wd = 0; wd < wonDeals.length; wd++) {
        const deal = wonDeals[wd]
        const val = Number(deal.get('quote_value')) || 0
        totalPurchaseValue += val
        const closedAt = deal.getString('closed_at')
        if (closedAt) {
          const pureDate = closedAt.split('T')[0]
          if (!firstDate || pureDate < firstDate) firstDate = pureDate
          if (!lastDate || pureDate > lastDate) lastDate = pureDate
        }
      }

      client.set('total_purchases', totalPurchases)
      client.set('total_purchase_value', totalPurchaseValue)
      if (firstDate) client.set('first_purchase_date', firstDate)
      if (lastDate) client.set('last_purchase_date', lastDate)
      if (totalPurchases > 0) client.set('has_returned', true)
      app.save(client)
    }

    console.log('[Migration 0022] Consolidation and metrics recalculation complete.')
  },
  (app) => {
    // Non-destructive rollback
  },
)
