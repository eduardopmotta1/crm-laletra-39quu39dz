migrate(
  (app) => {
    const clientsCol = app.findCollectionByNameOrId('clients')
    const attendancesCol = app.findCollectionByNameOrId('attendances')
    const archivedDealsCol = app.findCollectionByNameOrId('archived_deals')
    const stageTransCol = app.findCollectionByNameOrId('stage_transitions')
    const prodOrdersCol = app.findCollectionByNameOrId('production_orders')
    const tasksCol = app.findCollectionByNameOrId('tasks')
    const messagesCol = app.findCollectionByNameOrId('messages')

    // 1. Fetch all clients
    const clients = app.findRecordsByFilter('clients', '', 'created', 1000, 0)
    console.log('[Migration 0021] Found ' + clients.length + ' clients to migrate')

    const clientToAttendanceMap = {}

    for (let i = 0; i < clients.length; i++) {
      const c = clients[i]
      const clientId = c.id

      // Check if an attendance already exists for this client (idempotency)
      let attRecord = null
      try {
        attRecord = app.findFirstRecordByData('attendances', 'client_id', clientId)
      } catch (_) {}

      if (!attRecord) {
        attRecord = new Record(attendancesCol)
        attRecord.set('client_id', clientId)
        attRecord.set('stage', c.getString('stage') || 'Novo contato')
        if (c.getString('assigned_to')) {
          attRecord.set('assigned_to', c.getString('assigned_to'))
        }
        attRecord.set('product_interest', c.getString('product_interest') || '')
        attRecord.set('quote_value', c.get('quote_value') || 0)
        attRecord.set('notes', c.getString('notes') || '')
        attRecord.set('source', 'migrated_from_client')
        attRecord.set('is_archived', c.getBool('is_archived') || false)

        const closedAt = c.getString('closed_at')
        if (closedAt) {
          attRecord.set('closed_at', closedAt.split('T')[0])
          const isWon = c.getString('stage') === 'Venda fechada'
          attRecord.set('result', isWon ? 'Venda fechada' : 'Venda perdida')
        }

        const lastMsgAt = c.getString('last_message_at')
        const lastMsgDir = c.getString('last_message_direction')
        if (lastMsgAt) {
          const dateOnly = lastMsgAt.split('T')[0]
          if (lastMsgDir === 'inbound') {
            attRecord.set('last_customer_message_at', dateOnly)
          } else if (lastMsgDir === 'outbound') {
            attRecord.set('last_company_message_at', dateOnly)
          }
        }

        const lastDealId = c.getString('last_archived_deal_id')
        if (lastDealId) {
          attRecord.set('last_archived_deal_id', lastDealId)
        }

        app.save(attRecord)
      }

      clientToAttendanceMap[clientId] = attRecord.id
    }

    // 2. Update archived_deals with attendance_id
    const archivedDeals = app.findRecordsByFilter('archived_deals', '', 'created', 1000, 0)
    for (let j = 0; j < archivedDeals.length; j++) {
      const deal = archivedDeals[j]
      const cId = deal.getString('client_id')
      if (cId && clientToAttendanceMap[cId]) {
        const attId = clientToAttendanceMap[cId]
        if (!deal.getString('attendance_id')) {
          deal.set('attendance_id', attId)
          app.save(deal)
        }
      }
    }

    // 3. Update stage_transitions with attendance_id
    const stageTrans = app.findRecordsByFilter('stage_transitions', '', 'created', 1000, 0)
    for (let k = 0; k < stageTrans.length; k++) {
      const st = stageTrans[k]
      const cId = st.getString('client_id')
      if (cId && clientToAttendanceMap[cId]) {
        const attId = clientToAttendanceMap[cId]
        if (!st.getString('attendance_id')) {
          st.set('attendance_id', attId)
          app.save(st)
        }
      }
    }

    // 4. Update production_orders with attendance_id
    const prodOrders = app.findRecordsByFilter('production_orders', '', 'created', 1000, 0)
    for (let m = 0; m < prodOrders.length; m++) {
      const po = prodOrders[m]
      if (!po.getString('attendance_id')) {
        let attId = null
        const dealOriginId = po.getString('deal_origin_id')
        if (dealOriginId) {
          try {
            const dealRec = app.findFirstRecordByData('archived_deals', 'id', dealOriginId)
            if (dealRec && dealRec.getString('attendance_id')) {
              attId = dealRec.getString('attendance_id')
            }
          } catch (_) {}
        }

        if (!attId) {
          const cId = po.getString('client_id')
          if (cId && clientToAttendanceMap[cId]) {
            attId = clientToAttendanceMap[cId]
          }
        }

        if (attId) {
          po.set('attendance_id', attId)
          app.save(po)
        }
      }
    }

    // 5. Update messages and tasks with attendance_id
    const messages = app.findRecordsByFilter('messages', '', 'created', 1000, 0)
    for (let n = 0; n < messages.length; n++) {
      const msg = messages[n]
      const cId = msg.getString('client_id')
      if (cId && clientToAttendanceMap[cId] && !msg.getString('attendance_id')) {
        msg.set('attendance_id', clientToAttendanceMap[cId])
        app.save(msg)
      }
    }

    const tasks = app.findRecordsByFilter('tasks', '', 'created', 1000, 0)
    for (let p = 0; p < tasks.length; p++) {
      const t = tasks[p]
      const cId = t.getString('client_id')
      if (cId && clientToAttendanceMap[cId] && !t.getString('attendance_id')) {
        t.set('attendance_id', clientToAttendanceMap[cId])
        app.save(t)
      }
    }

    console.log('[Migration 0021] Data migration completed successfully')
  },
  (app) => {
    // Revert is a no-op / non-destructive
  },
)
