/**
 * Hook para cliente aprovar um orçamento através do public_token
 * NÃO requer autenticação.
 * Idempotente: se já aprovado, retorna sucesso sem duplicar ou dar erro.
 */
routerAdd('POST', '/api/public/quotes/{token}/approve', (c) => {
  try {
    const token = c.request.pathValue('token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token inválido' })
    }

    const quotes = $app.findRecordsByFilter('quotes', `public_token = {:token}`, '-created', 1, 0, {
      token: token.trim(),
    })

    if (!quotes || quotes.length === 0) {
      return c.json(404, { error: 'Orçamento não encontrado' })
    }

    const q = quotes[0]
    const currentStatus = q.getString('status')

    // Idempotência: Se já estiver aprovado, retorna sucesso com estado atual
    if (currentStatus === 'aprovado') {
      return c.json(200, {
        success: true,
        already_approved: true,
        message: 'Este orçamento já foi aprovado.',
        approved_at: q.getString('approved_at'),
        status: 'aprovado',
        code: q.getString('code'),
      })
    }

    // Regra Bloco 23: Bloquear aprovação antes do reenvio real
    // O botão e endpoint Aprovar só devem ficar disponíveis quando status = 'enviado'
    if (currentStatus === 'rascunho' || currentStatus === 'alteracao_solicitada') {
      return c.json(400, {
        error: 'Este orçamento está sendo atualizado. Aguarde o novo envio.',
        status: currentStatus,
      })
    }

    // Se estiver recusado, não permitir aprovação acidental sem aviso
    if (currentStatus === 'recusado') {
      return c.json(400, {
        error:
          'Este orçamento consta como recusado e não pode ser aprovado diretamente. Entre em contato com nossa equipe.',
        status: currentStatus,
      })
    }

    // 1. Atualiza status e data de aprovação no quote EXATO
    const nowIso = new Date().toISOString()
    const todayDateStr = nowIso.split('T')[0]
    q.set('status', 'aprovado')
    q.set('approved_at', nowIso)

    $app.save(q)

    // 2. Extrair dados básicos do quote
    const quoteId = q.id
    const attendanceId = q.getString('attendance_id')
    const clientId = q.getString('client_id')
    const quoteCode = q.getString('code')
    const quoteUserId = q.getString('user_id')
    let clientName = q.getString('client_name') || ''
    let clientPhone = q.getString('client_phone') || ''
    let clientEmail = q.getString('client_email') || ''
    const quoteNotes = q.getString('notes') || ''

    // Fallback: se clientPhone não estiver preenchido no quote, buscar no cadastro de clients
    let clientRecord = null
    if (clientId) {
      try {
        clientRecord = $app.findRecordById('clients', clientId)
        if (clientRecord) {
          if (!clientName) clientName = clientRecord.getString('name') || ''
          if (!clientPhone) clientPhone = clientRecord.getString('phone') || ''
          if (!clientEmail) clientEmail = clientRecord.getString('email') || ''
        }
      } catch (clientFetchErr) {
        console.warn(
          '[PublicQuoteApprove] Aviso ao buscar cliente ' + clientId + ':',
          clientFetchErr,
        )
      }
    }
    if (!clientName) clientName = 'Cliente'

    // Formatação de moeda BRL (R$ 1.234,56)
    const formatBRL = function (val) {
      const num = Number(val) || 0
      const fixed = num.toFixed(2)
      const parts = fixed.split('.')
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      return 'R$ ' + intPart + ',' + parts[1]
    }

    // Formatação de dimensão métrica
    const formatDim = function (val) {
      if (val === undefined || val === null || isNaN(Number(val))) return '0,00'
      const num = Number(val)
      const fixed = num.toFixed(2)
      return fixed.replace('.', ',')
    }

    // 3. Extrair e normalizar itens do quote (compatível com SQLite / JSON PocketBase v0.36)
    let rawItems = []
    try {
      if (q.getString) {
        const jsonStr = q.getString('items')
        if (jsonStr && typeof jsonStr === 'string' && jsonStr.trim()) {
          try {
            const parsed = JSON.parse(jsonStr)
            if (Array.isArray(parsed)) rawItems = parsed
          } catch (_) {}
        }
      }
    } catch (_) {}

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      try {
        const it = q.get('items')
        if (typeof it === 'string') {
          try {
            const parsed = JSON.parse(it)
            if (Array.isArray(parsed)) rawItems = parsed
          } catch (_) {}
        } else if (Array.isArray(it)) {
          const isByteArray =
            it.length > 0 &&
            it.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 255)
          if (isByteArray) {
            try {
              let reconstructed = ''
              for (let b = 0; b < it.length; b++) {
                reconstructed += String.fromCharCode(it[b])
              }
              const parsed = JSON.parse(reconstructed)
              if (Array.isArray(parsed)) rawItems = parsed
            } catch (_) {}
          } else {
            rawItems = it
          }
        }
      } catch (_) {}
    }
    if (!Array.isArray(rawItems)) rawItems = []

    // Normalizar elementos que possam ter vindo como string JSON
    const normalizedItems = rawItems
      .map((it) => {
        if (typeof it === 'string') {
          try {
            return JSON.parse(it)
          } catch (_) {
            return it
          }
        }
        return it
      })
      .filter((it) => it && typeof it === 'object')

    // Calcular valor total conforme regra de quoteToProduction.ts
    const finalTotal = q.getFloat('final_total')
    const totalSale = q.getFloat('total_sale')
    const totalValue =
      !isNaN(finalTotal) && finalTotal > 0
        ? finalTotal
        : !isNaN(totalSale) && totalSale > 0
          ? totalSale
          : 0

    // Construir snapshot de itens seguindo exatamente extractProductionOrderDataFromQuote
    let productSummary = ''
    let descriptionSummary = ''
    let totalQuantity = 0
    let dimensionsSummary = ''
    let requiresArtApproval = true

    if (normalizedItems.length === 0) {
      productSummary = 'Orçamento sem itens discriminados'
      descriptionSummary = quoteNotes
      totalQuantity = 1
      dimensionsSummary = ''
      requiresArtApproval = true
    } else {
      // 1. Product Summary
      const productNames = normalizedItems.map((it) => {
        const qNum = Number(it.quantity) || 1
        const qtyPrefix = qNum > 1 ? qNum + 'x ' : ''
        const pName = it.product_name || it.name || 'Item'
        return (qtyPrefix + pName).trim()
      })
      productSummary = productNames.join(', ')

      // 2. Technical Description Summary
      const descLines = []
      normalizedItems.forEach((it, idx) => {
        const pName = it.product_name || it.name || 'Produto'
        const title = idx + 1 + '. ' + pName
        const details = []

        const qNum = Number(it.quantity) || 1
        details.push('Quantidade: ' + qNum)

        const w = Number(it.width) || 0
        const h = Number(it.height) || 0
        const lm = Number(it.linear_meters) || 0
        if (w > 0 && h > 0) {
          const area = it.total_area || (w * h * qNum).toFixed(2)
          details.push('Medidas: ' + formatDim(w) + ' x ' + formatDim(h) + ' m (' + area + ' m²)')
        } else if (lm > 0) {
          details.push('Medidas: ' + formatDim(lm) + ' m lineares')
        }

        if (it.material_name) {
          details.push('Material: ' + it.material_name)
        }

        if (Array.isArray(it.additionals) && it.additionals.length > 0) {
          const adds = it.additionals
            .map((a) =>
              a.quantity && a.quantity > 1 ? a.name + ' (' + a.quantity + ' un)' : a.name,
            )
            .filter(Boolean)
          if (adds.length > 0) {
            details.push('Acabamentos/Adicionais: ' + adds.join(', '))
          }
        }

        const unitVal = it.applied_unit_price || it.calculated_unit_price || it.unit_price || 0
        const totalItemVal =
          it.item_total_sale !== undefined && it.item_total_sale !== null
            ? Number(it.item_total_sale)
            : unitVal * qNum
        details.push(
          'Valor Unit: ' + formatBRL(unitVal) + ' | Total Item: ' + formatBRL(totalItemVal),
        )

        if (it.notes && String(it.notes).trim()) {
          details.push('Observação do item: ' + String(it.notes).trim())
        }

        descLines.push(title + '\n  - ' + details.join('\n  - '))
      })
      descriptionSummary = descLines.join('\n\n')

      // 3. Dimensions Summary
      const dimensionsList = normalizedItems
        .map((it) => {
          const w = Number(it.width) || 0
          const h = Number(it.height) || 0
          const lm = Number(it.linear_meters) || 0
          if (w > 0 && h > 0) {
            return formatDim(w) + 'x' + formatDim(h) + 'm'
          }
          if (lm > 0) {
            return formatDim(lm) + 'm'
          }
          return null
        })
        .filter(Boolean)
      dimensionsSummary = dimensionsList.join(', ')

      // 4. Total Quantity
      totalQuantity = normalizedItems.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)
      if (totalQuantity <= 0) totalQuantity = 1

      // 5. requiresArtApproval check
      let hasExplicitDecision = false
      let calculatedRequiresArt = false
      for (let i = 0; i < normalizedItems.length; i++) {
        const it = normalizedItems[i]
        if (it.requires_art_approval !== undefined && it.requires_art_approval !== null) {
          hasExplicitDecision = true
          if (it.requires_art_approval === true || String(it.requires_art_approval) === 'true') {
            calculatedRequiresArt = true
            break
          }
        } else if (it.product_id) {
          try {
            const prodRec = $app.findRecordById('quote_products', it.product_id)
            if (prodRec && prodRec.get('requires_art_approval') !== undefined) {
              hasExplicitDecision = true
              if (prodRec.getBool('requires_art_approval') === true) {
                calculatedRequiresArt = true
                break
              }
            }
          } catch (_) {}
        }
      }

      if (calculatedRequiresArt) {
        requiresArtApproval = true
      } else if (!hasExplicitDecision) {
        requiresArtApproval = true
      } else {
        requiresArtApproval = false
      }
    }

    // 4. Idempotência do Pedido de Produção: verificar se já existe production_order para este quote
    let productionOrder = null
    const existingOrdersByQuote = $app.findRecordsByFilter(
      'production_orders',
      'quote_id = {:qid}',
      '-created',
      1,
      0,
      { qid: quoteId },
    )

    if (existingOrdersByQuote && existingOrdersByQuote.length > 0) {
      productionOrder = existingOrdersByQuote[0]
      console.log(
        '[PublicQuoteApprove] Pedido de produção já existente para quote ' +
          quoteCode +
          ': ' +
          productionOrder.getString('order_number'),
      )
    } else {
      // Fallback de compatibilidade: buscar pelas tags legadas [QUOTE_ID:...] ou [ORC:...]
      const legacyTagFilter =
        'notes ~ {:tagId} || description ~ {:tagId} || notes ~ {:tagCode} || description ~ {:tagCode}'
      const legacyOrders = $app.findRecordsByFilter(
        'production_orders',
        legacyTagFilter,
        '-created',
        1,
        0,
        {
          tagId: '[QUOTE_ID:' + quoteId + ']',
          tagCode: '[ORC:' + quoteCode + ']',
        },
      )
      if (legacyOrders && legacyOrders.length > 0) {
        productionOrder = legacyOrders[0]
        if (!productionOrder.getString('quote_id')) {
          productionOrder.set('quote_id', quoteId)
          try {
            $app.save(productionOrder)
          } catch (_) {}
        }
      }
    }

    // Se ainda não existir production_order, criar agora com retry contra colisão de order_number
    if (!productionOrder) {
      const trackingTag = '[QUOTE_ID:' + quoteId + '] [ORC:' + quoteCode + ']'
      const notesParts = []
      if (quoteNotes.trim()) {
        notesParts.push('Obs. comercial do orçamento: ' + quoteNotes.trim())
      }
      notesParts.push(
        'Origem: Orçamento ' +
          quoteCode +
          ' aprovado pelo cliente na página pública em ' +
          todayDateStr +
          '. ' +
          trackingTag,
      )
      const combinedNotes = notesParts.join('\n\n')

      // Obter estágio inicial "order_received"
      let initialStageId = ''
      let initialStageInternalId = 'order_received'
      let initialStageName = 'Pedido recebido'
      try {
        const stages = $app.findRecordsByFilter(
          'production_stages',
          'internal_id = "order_received"',
          'order_index',
          1,
          0,
        )
        if (stages && stages.length > 0) {
          initialStageId = stages[0].id
          initialStageName = stages[0].getString('name') || 'Pedido recebido'
        }
      } catch (stErr) {
        console.warn('[PublicQuoteApprove] Falha ao buscar production_stage order_received:', stErr)
      }

      // Prazo prometido padrão: +3 dias úteis se não especificado
      const promisedDateObj = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      const promisedDeadlineStr = promisedDateObj.toISOString().split('T')[0]

      const prodOrdersCollection = $app.findCollectionByNameOrId('production_orders')
      const maxRetries = 5
      let createError = null

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Gerar order_number com base no maior existente (mínimo 1844)
          let nextOrderNum = '#001844'
          try {
            const latestRecords = $app.findRecordsByFilter(
              'production_orders',
              '',
              '-created',
              10,
              0,
            )
            let maxNum = 0
            for (let r = 0; r < latestRecords.length; r++) {
              const numStr = latestRecords[r].getString('order_number').replace(/\D/g, '')
              const num = parseInt(numStr, 10)
              if (!isNaN(num) && num > maxNum) {
                maxNum = num
              }
            }
            if (maxNum > 0) {
              const nextVal = Math.max(maxNum + 1, 1844) + attempt
              let padStr = String(nextVal)
              while (padStr.length < 6) {
                padStr = '0' + padStr
              }
              nextOrderNum = '#' + padStr
            }
          } catch (_) {
            nextOrderNum = '#00' + Math.floor(1844 + Math.random() * 5000)
          }

          // Gerar tracking_token seguro (24 chars)
          const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
          let tokenStr = 'tk_'
          for (let cIdx = 0; cIdx < 24; cIdx++) {
            tokenStr += chars.charAt(Math.floor(Math.random() * chars.length))
          }

          const newOrder = new Record(prodOrdersCollection)
          newOrder.set('order_number', nextOrderNum)
          newOrder.set('tracking_token', tokenStr)
          if (clientId) newOrder.set('client_id', clientId)
          if (attendanceId) newOrder.set('attendance_id', attendanceId)
          newOrder.set('quote_id', quoteId)
          newOrder.set('client_name', clientName)
          newOrder.set('client_phone', clientPhone)
          if (clientEmail) newOrder.set('client_email', clientEmail)
          newOrder.set('sale_date', todayDateStr)
          newOrder.set('product', productSummary)
          if (descriptionSummary) newOrder.set('description', descriptionSummary)
          newOrder.set('quantity', totalQuantity)
          if (dimensionsSummary) newOrder.set('dimensions', dimensionsSummary)
          newOrder.set('total_value', totalValue)
          if (quoteUserId) newOrder.set('sales_rep_id', quoteUserId)
          newOrder.set('promised_deadline', promisedDeadlineStr)
          newOrder.set('delivery_type', 'retirada')
          newOrder.set('notes', combinedNotes)
          newOrder.set('requires_art_approval', requiresArtApproval)
          newOrder.set('art_approved', false)
          if (initialStageId) newOrder.set('stage_id', initialStageId)
          newOrder.set('stage_internal_id', initialStageInternalId)
          newOrder.set('stage_name', initialStageName)
          newOrder.set('priority', 'media')
          newOrder.set('is_completed', false)
          newOrder.set('is_archived', false)

          $app.save(newOrder)
          productionOrder = newOrder
          createError = null
          break
        } catch (saveErr) {
          createError = saveErr
          const errStr = String(saveErr && saveErr.message ? saveErr.message : saveErr)
          // Se for conflito de índice único (order_number ou tracking_token), tentar próxima tentativa
          if (errStr.toLowerCase().includes('unique') && attempt < maxRetries - 1) {
            console.warn(
              '[PublicQuoteApprove] Colisão detectada ao criar pedido de produção. Tentativa ' +
                (attempt + 1) +
                '/' +
                maxRetries +
                '. Erro: ' +
                errStr,
            )
            continue
          }
          break
        }
      }

      // Validação crítica de idempotência pós-falha: verificar se outra requisição concorrente já criou
      if (!productionOrder) {
        const doubleCheckOrders = $app.findRecordsByFilter(
          'production_orders',
          'quote_id = {:qid}',
          '-created',
          1,
          0,
          { qid: quoteId },
        )
        if (doubleCheckOrders && doubleCheckOrders.length > 0) {
          productionOrder = doubleCheckOrders[0]
          createError = null
        }
      }

      // Se após todas as tentativas o pedido não foi criado:
      // REGRA CRÍTICA: NUNCA arquivar attendance e NUNCA criar archived_deal se production_order falhar!
      if (!productionOrder || !productionOrder.id) {
        const errMsg = createError ? createError.message : 'Falha desconhecida ao gerar pedido'
        console.error(
          '[PublicQuoteApprove] ERRO CRÍTICO: Falha ao criar pedido de produção para o quote ' +
            quoteCode +
            ': ' +
            errMsg,
        )
        return c.json(500, {
          error:
            'Erro ao gerar pedido de produção para o orçamento aprovado. Por favor, tente novamente ou contate a gráfica.',
          details: errMsg,
        })
      }

      // Registrar production_logs para o pedido criado
      try {
        const prodLogsCol = $app.findCollectionByNameOrId('production_logs')
        if (prodLogsCol) {
          const logRec = new Record(prodLogsCol)
          logRec.set('order_id', productionOrder.id)
          logRec.set('from_stage_id', '')
          logRec.set('from_stage_name', '')
          logRec.set('to_stage_id', initialStageInternalId)
          logRec.set('to_stage_name', initialStageName)
          logRec.set('user_name', 'Cliente (Página Pública)')
          logRec.set('change_type', 'automatic')
          logRec.set(
            'notes',
            'Pedido criado automaticamente após aprovação do orçamento ' +
              quoteCode +
              ' pelo cliente na página pública. Número: ' +
              productionOrder.getString('order_number') +
              '.',
          )
          logRec.set('whatsapp_sent', false)
          logRec.set('whatsapp_status', 'nao_enviado')
          $app.save(logRec)
        }
      } catch (logErr) {
        console.warn('[PublicQuoteApprove] Aviso ao salvar production_logs:', logErr)
      }
    }

    const orderNumber = productionOrder.getString('order_number')

    // 5. SOMENTE DEPOIS DA PRODUÇÃO GARANTIDA:
    // Atualizar attendance para "Venda fechada", arquivar e criar/atualizar archived_deal
    let archivedDealRecord = null
    if (attendanceId) {
      try {
        const att = $app.findRecordById('attendances', attendanceId)
        if (att) {
          const oldStage = att.getString('stage') || 'Em atendimento'

          // Calcular duração do atendimento em dias
          let durationDays = 0
          const attCreated = att.getString('created')
          if (attCreated) {
            const createdMs = new Date(attCreated).getTime()
            const diffMs = Date.now() - createdMs
            durationDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
          }

          // 5.1 Upsert em archived_deals (evitar duplicatas pelo attendance_id)
          const archivedDealsCollection = $app.findCollectionByNameOrId('archived_deals')
          let existingDeals = $app.findRecordsByFilter(
            'archived_deals',
            'attendance_id = {:attId}',
            '-created',
            1,
            0,
            { attId: attendanceId },
          )
          if (!existingDeals || existingDeals.length === 0) {
            if (clientId) {
              existingDeals = $app.findRecordsByFilter(
                'archived_deals',
                'client_id = {:cId}',
                '-created',
                1,
                0,
                { cId: clientId },
              )
            }
          }

          let isNewArchived = false
          let prevResult = null
          const dealNotes =
            'Atendimento concluído e arquivado automaticamente após aprovação na página pública e criação confirmada do pedido de produção ' +
            orderNumber +
            ' vinculado ao orçamento ' +
            quoteCode +
            '.'

          if (existingDeals && existingDeals.length > 0) {
            archivedDealRecord = existingDeals[0]
            prevResult = archivedDealRecord.getString('result')
            archivedDealRecord.set('client_name', clientName)
            archivedDealRecord.set('client_phone', clientPhone)
            if (clientEmail) archivedDealRecord.set('client_email', clientEmail)
            archivedDealRecord.set('result', 'Venda fechada')
            archivedDealRecord.set('product_interest', productSummary)
            archivedDealRecord.set('quote_value', totalValue)
            archivedDealRecord.set('closed_at', todayDateStr)
            if (quoteUserId) archivedDealRecord.set('assigned_to', quoteUserId)
            archivedDealRecord.set('final_notes', dealNotes)
            archivedDealRecord.set('duration_days', durationDays)
            if (attendanceId) archivedDealRecord.set('attendance_id', attendanceId)
            if (clientId) archivedDealRecord.set('client_id', clientId)
            $app.save(archivedDealRecord)
          } else {
            isNewArchived = true
            archivedDealRecord = new Record(archivedDealsCollection)
            if (clientId) archivedDealRecord.set('client_id', clientId)
            if (attendanceId) archivedDealRecord.set('attendance_id', attendanceId)
            archivedDealRecord.set('client_name', clientName)
            archivedDealRecord.set('client_phone', clientPhone)
            if (clientEmail) archivedDealRecord.set('client_email', clientEmail)
            archivedDealRecord.set('result', 'Venda fechada')
            archivedDealRecord.set('product_interest', productSummary)
            archivedDealRecord.set('quote_value', totalValue)
            archivedDealRecord.set('closed_at', todayDateStr)
            if (quoteUserId) archivedDealRecord.set('assigned_to', quoteUserId)
            archivedDealRecord.set('final_notes', dealNotes)
            archivedDealRecord.set('duration_days', durationDays)
            $app.save(archivedDealRecord)
          }

          // 5.2 Vincular deal_origin_id no production_order caso ainda não tenha
          if (archivedDealRecord && !productionOrder.getString('deal_origin_id')) {
            productionOrder.set('deal_origin_id', archivedDealRecord.id)
            try {
              $app.save(productionOrder)
            } catch (_) {}
          }

          // 5.3 Atualizar e arquivar o attendance
          att.set('stage', 'Venda fechada')
          att.set('result', 'Venda fechada')
          att.set('quote_value', totalValue)
          att.set('is_archived', true)
          att.set('closed_at', todayDateStr)
          att.set('archived_at', todayDateStr)
          if (archivedDealRecord) {
            att.set('last_archived_deal_id', archivedDealRecord.id)
          }
          $app.save(att)

          // 5.4 Atualizar métricas do cliente (compras acumuladas) se clientRecord disponível
          if (clientRecord) {
            try {
              let shouldIncrement = false
              if (isNewArchived) {
                shouldIncrement = true
              } else if (prevResult !== 'Venda fechada') {
                shouldIncrement = true
              }

              const currPurchases = clientRecord.getInt('total_purchases') || 0
              const currTotalVal = clientRecord.getFloat('total_purchase_value') || 0
              const newPurchases = currPurchases + (shouldIncrement ? 1 : 0)
              const newTotalVal = currTotalVal + (shouldIncrement ? totalValue : 0)

              clientRecord.set('stage', 'Venda fechada')
              clientRecord.set('closed_at', todayDateStr)
              if (archivedDealRecord) {
                clientRecord.set('last_archived_deal_id', archivedDealRecord.id)
              }
              clientRecord.set('has_returned', newPurchases > 0)
              clientRecord.set('total_purchases', newPurchases)
              clientRecord.set('total_purchase_value', newTotalVal)
              if (!clientRecord.getString('first_purchase_date')) {
                clientRecord.set('first_purchase_date', todayDateStr)
              }
              clientRecord.set('last_purchase_date', todayDateStr)

              $app.save(clientRecord)
            } catch (cUpErr) {
              console.warn('[PublicQuoteApprove] Aviso ao atualizar métricas do client:', cUpErr)
            }
          }

          // 5.5 Gravar stage_transitions
          try {
            const stageTransCollection = $app.findCollectionByNameOrId('stage_transitions')
            if (stageTransCollection) {
              const transRec = new Record(stageTransCollection)
              transRec.set('client_id', clientId || '')
              transRec.set('attendance_id', attendanceId)
              transRec.set('from_stage', oldStage)
              transRec.set('to_stage', 'Venda fechada (Arquivado)')
              transRec.set('change_type', 'automatic')
              transRec.set('user_name', 'Cliente (Página Pública)')
              transRec.set(
                'notes',
                'Atendimento concluído e arquivado automaticamente após aprovação do orçamento ' +
                  quoteCode +
                  ' e criação do pedido de produção ' +
                  orderNumber +
                  '. Valor: ' +
                  formatBRL(totalValue) +
                  '.',
              )
              $app.save(transRec)
            }
          } catch (tErr) {
            console.error('[PublicQuoteApprove] Erro ao criar stage_transition:', tErr)
          }
        }
      } catch (attErr) {
        console.error(
          '[PublicQuoteApprove] Erro ao atualizar e arquivar attendance ' + attendanceId + ':',
          attErr,
        )
      }
    }

    // 6. Gravar audit_log
    try {
      const auditCollection = $app.findCollectionByNameOrId('audit_logs')
      if (auditCollection) {
        const auditRec = new Record(auditCollection)
        auditRec.set('user_name', 'Cliente (Página Pública)')
        auditRec.set('user_email', '')
        auditRec.set('action', 'aprovar_e_producao')
        auditRec.set('module', 'quotes')
        auditRec.set('record_id', q.id)
        auditRec.set('record_title', quoteCode)
        auditRec.set(
          'details',
          'Orçamento ' +
            quoteCode +
            ' aprovado pelo cliente na página pública. Pedido de produção ' +
            orderNumber +
            ' gerado com sucesso. Atendimento ' +
            (attendanceId || 'N/A') +
            ' arquivado.',
        )
        auditRec.set('previous_value', JSON.stringify({ status: currentStatus }))
        auditRec.set(
          'new_value',
          JSON.stringify({
            status: 'aprovado',
            code: quoteCode,
            final_total: totalValue,
            client_id: clientId,
            attendance_id: attendanceId,
            production_order_id: productionOrder ? productionOrder.id : '',
            order_number: orderNumber,
            archived_deal_id: archivedDealRecord ? archivedDealRecord.id : '',
          }),
        )
        $app.save(auditRec)
      }
    } catch (audErr) {
      console.error('[PublicQuoteApprove] Erro ao salvar audit_log:', audErr)
    }

    return c.json(200, {
      success: true,
      already_approved: false,
      message: 'Orçamento aprovado com sucesso! Seu pedido de produção foi gerado.',
      approved_at: nowIso,
      status: 'aprovado',
      code: quoteCode,
      order_number: orderNumber,
      production_order_id: productionOrder ? productionOrder.id : '',
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao aprovar orçamento: ' + err.message })
  }
})

/**
 * Hook para cliente solicitar alteração em um orçamento através do public_token
 * Requer campo 'customer_notes' com a explicação da alteração desejada.
 */
routerAdd('POST', '/api/public/quotes/{token}/request-change', (c) => {
  let token = ''
  try {
    token = c.request.pathValue('token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token inválido' })
    }

    const body = c.requestInfo().body || {}
    const notes = typeof body.customer_notes === 'string' ? body.customer_notes.trim() : ''

    if (!notes) {
      return c.json(400, { error: 'Por favor, descreva o que gostaria de alterar no orçamento.' })
    }

    const quotes = $app.findRecordsByFilter('quotes', `public_token = {:token}`, '-created', 1, 0, {
      token: token.trim(),
    })

    if (!quotes || quotes.length === 0) {
      return c.json(404, { error: 'Orçamento não encontrado' })
    }

    const q = quotes[0]
    const currentStatus = q.getString('status')

    if (currentStatus === 'aprovado') {
      return c.json(400, {
        error:
          'Este orçamento já foi aprovado e está em processamento. Entre em contato diretamente com o atendente para alterações.',
        status: 'aprovado',
      })
    }

    // Atualiza status para alteracao_solicitada e guarda observação do cliente
    q.set('status', 'alteracao_solicitada')
    q.set('customer_notes', notes)

    $app.save(q)

    return c.json(200, {
      success: true,
      message: 'Sua solicitação de alteração foi registrada com sucesso!',
      status: 'alteracao_solicitada',
      customer_notes: notes,
      code: q.getString('code'),
    })
  } catch (err) {
    const maskedToken = token ? token.substring(0, 4) + '...' + token.slice(-4) : 'nenhum'
    console.error(
      `[PublicQuoteActions] Ação: request-change | Token: ${maskedToken} | Erro: ${err && err.message ? err.message : String(err)}`,
    )
    return c.json(500, { error: 'Erro ao solicitar alteração: ' + err.message })
  }
})

/**
 * Hook para cliente recusar um orçamento através do public_token
 * Requer campo 'reason' obrigatório e 'notes' opcional.
 * Regra Bloco 24: Atualiza o quote EXATO para 'recusado' com rejected_at,
 * e move EXCLUSIVAMENTE o attendance vinculado (quote.attendance_id) para 'Não fechou'.
 */
routerAdd('POST', '/api/public/quotes/{token}/reject', (c) => {
  let token = ''
  try {
    token = c.request.pathValue('token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token inválido' })
    }

    const body = c.requestInfo().body || {}
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

    if (!reason) {
      return c.json(400, { error: 'Por favor, selecione um motivo para a recusa do orçamento.' })
    }

    const quotes = $app.findRecordsByFilter('quotes', `public_token = {:token}`, '-created', 1, 0, {
      token: token.trim(),
    })

    if (!quotes || quotes.length === 0) {
      return c.json(404, { error: 'Orçamento não encontrado' })
    }

    const q = quotes[0]
    const currentStatus = q.getString('status')

    if (currentStatus === 'aprovado') {
      return c.json(400, {
        error: 'Este orçamento já foi aprovado e não pode ser recusado diretamente pelo link.',
        status: 'aprovado',
      })
    }

    const nowIso = new Date().toISOString()
    const todayDateStr = nowIso.split('T')[0]

    // Formata o motivo
    const finalReasonText =
      reason === 'Outro' && notes ? `Outro: ${notes}` : notes ? `${reason} - ${notes}` : reason

    // 1. Atualiza quote EXATO
    q.set('status', 'recusado')
    q.set('rejected_at', nowIso)
    if (notes) {
      q.set('customer_notes', notes)
    }
    $app.save(q)

    // 2. Localizar attendance EXATO por quote.attendance_id
    const attendanceId = q.getString('attendance_id')
    const clientId = q.getString('client_id')
    const quoteCode = q.getString('code')

    if (attendanceId) {
      try {
        const att = $app.findRecordById('attendances', attendanceId)
        if (att) {
          const oldStage = att.getString('stage') || 'Em atendimento'
          att.set('stage', 'Não fechou')
          att.set('result', 'Venda perdida')
          att.set('loss_reason', finalReasonText)
          att.set('closed_at', todayDateStr)
          $app.save(att)

          // Registrar histórico de transição
          try {
            const stageTransCollection = $app.findCollectionByNameOrId('stage_transitions')
            if (stageTransCollection) {
              const transRec = new Record(stageTransCollection)
              transRec.set('client_id', clientId || '')
              transRec.set('attendance_id', attendanceId)
              transRec.set('from_stage', oldStage)
              transRec.set('to_stage', 'Não fechou')
              transRec.set('change_type', 'automatic')
              transRec.set('user_name', 'Cliente (Página Pública)')
              transRec.set(
                'notes',
                `Orçamento ${quoteCode} recusado pelo cliente. Motivo: ${finalReasonText}.`,
              )
              $app.save(transRec)
            }
          } catch (tErr) {
            console.error('[PublicQuoteReject] Erro ao criar stage_transition:', tErr)
          }
        }
      } catch (attErr) {
        console.error(
          '[PublicQuoteReject] Erro ao atualizar attendance ' + attendanceId + ':',
          attErr,
        )
      }
    }

    // 3. Registrar audit_log
    try {
      const auditCollection = $app.findCollectionByNameOrId('audit_logs')
      if (auditCollection) {
        const auditRec = new Record(auditCollection)
        auditRec.set('user_name', 'Cliente (Página Pública)')
        auditRec.set('user_email', '')
        auditRec.set('action', 'recusar')
        auditRec.set('module', 'quotes')
        auditRec.set('record_id', q.id)
        auditRec.set('record_title', quoteCode)
        auditRec.set(
          'details',
          `Orçamento ${quoteCode} recusado pelo cliente na página pública. Motivo: ${finalReasonText}.`,
        )
        auditRec.set('previous_value', JSON.stringify({ status: currentStatus }))
        auditRec.set(
          'new_value',
          JSON.stringify({
            status: 'recusado',
            reason: reason,
            notes: notes || null,
            code: quoteCode,
            attendance_id: attendanceId,
          }),
        )
        $app.save(auditRec)
      }
    } catch (audErr) {
      console.error('[PublicQuoteReject] Erro ao salvar audit_log:', audErr)
    }

    return c.json(200, {
      success: true,
      message: 'Orçamento recusado com sucesso.',
      status: 'recusado',
      rejected_at: nowIso,
      code: quoteCode,
    })
  } catch (err) {
    const maskedToken = token ? token.substring(0, 4) + '...' + token.slice(-4) : 'nenhum'
    console.error(
      `[PublicQuoteActions] Ação: reject | Token: ${maskedToken} | Erro: ${err && err.message ? err.message : String(err)}`,
    )
    return c.json(500, { error: 'Erro ao recusar orçamento: ' + err.message })
  }
})
