// Hook: Submit Public Customer Evaluation
// POST /api/crm/submit-evaluation
// Public endpoint (no auth required)
routerAdd('POST', '/api/crm/submit-evaluation', (e) => {
  const body = e.requestInfo().body || {}
  const token = (body.token || '').trim()
  const overallRating = Number(body.overall_rating)
  const serviceRating = body.service_rating ? Number(body.service_rating) : null
  const qualityRating = body.quality_rating ? Number(body.quality_rating) : null
  const deliveryRating = body.delivery_rating ? Number(body.delivery_rating) : null
  const comment = (body.comment || '').trim()

  if (!token) {
    return e.json(400, { error: 'Token de avaliação é obrigatório.' })
  }

  if (!overallRating || overallRating < 1 || overallRating > 5) {
    return e.json(400, { error: 'Nota geral de 1 a 5 estrelas é obrigatória.' })
  }

  // 1. Locate evaluation record or post_sale by token
  let evalRecord
  let associatedOrderId = ''
  let associatedOrderNumber = ''

  try {
    evalRecord = $app.findFirstRecordByData('evaluations', 'token', token)
    associatedOrderId = evalRecord.getString('order_id')
    associatedOrderNumber = evalRecord.getString('order_number')
  } catch (_) {
    // If not in evaluations, check if a post_sale exists with this token
    try {
      const psRecord = $app.findFirstRecordByData('post_sales', 'evaluation_token', token)
      const clientId = psRecord.getString('client_id')
      const attendanceId = psRecord.getString('attendance_id')
      associatedOrderId = psRecord.getString('order_id')
      associatedOrderNumber = psRecord.getString('order_number')

      const evalCol = $app.findCollectionByNameOrId('evaluations')
      evalRecord = new Record(evalCol)
      evalRecord.set('token', token)
      evalRecord.set('client_id', clientId)
      if (attendanceId) {
        evalRecord.set('attendance_id', attendanceId)
      }
      if (associatedOrderId) {
        evalRecord.set('order_id', associatedOrderId)
      }
      if (associatedOrderNumber) {
        evalRecord.set('order_number', associatedOrderNumber)
      }
      evalRecord.set('overall_rating', overallRating)
      evalRecord.set('comment', comment)
    } catch (_) {
      return e.json(404, { error: 'Link de avaliação inválido ou não encontrado.' })
    }
  }

  // Check if order number is missing and resolve it if order_id exists
  if (!associatedOrderNumber && associatedOrderId) {
    try {
      const ord = $app.findFirstRecordByData('production_orders', 'id', associatedOrderId)
      associatedOrderNumber = ord.getString('order_number')
      evalRecord.set('order_number', associatedOrderNumber)
    } catch (_) {}
  }

  // Prevent duplicate submissions for the same token/order if already evaluated
  if (
    evalRecord.getInt('overall_rating') > 0 &&
    evalRecord.getString('created') !== evalRecord.getString('updated')
  ) {
    const existingComment = evalRecord.getString('comment')
    if (
      evalRecord.getBool('resolved') ||
      existingComment ||
      evalRecord.getInt('overall_rating') > 0
    ) {
      return e.json(409, {
        error:
          'Esta avaliação para este pedido já foi respondida e registrada anteriormente. Obrigado pelo seu feedback!',
        already_submitted: true,
      })
    }
  }

  evalRecord.set('overall_rating', overallRating)
  if (serviceRating) evalRecord.set('service_rating', serviceRating)
  if (qualityRating) evalRecord.set('quality_rating', qualityRating)
  if (deliveryRating) evalRecord.set('delivery_rating', deliveryRating)
  if (comment) evalRecord.set('comment', comment)

  const isDissatisfied = overallRating <= 3
  const isSatisfied = overallRating >= 4

  if (isDissatisfied) {
    evalRecord.set('status', 'pending_contact')
    evalRecord.set('resolved', false)
  } else {
    evalRecord.set('status', 'satisfied')
    evalRecord.set('resolved', true)
  }

  $app.save(evalRecord)

  const clientId = evalRecord.getString('client_id')
  let clientRecord
  if (clientId) {
    try {
      clientRecord = $app.findFirstRecordByData('clients', 'id', clientId)
      if (isDissatisfied) {
        clientRecord.set('relationship_status', 'dissatisfied')
      } else if (isSatisfied) {
        // Only set satisfied if not in recovery or dissatisfied from another unresolved order
        clientRecord.set('relationship_status', 'satisfied')
      }
      $app.save(clientRecord)
    } catch (err) {
      console.log('Error updating client relationship status:', err)
    }
  }

  // 2. If dissatisfied (1, 2, 3 stars): create urgent Attention Task for recovery linked to client and order
  if (isDissatisfied && clientId) {
    try {
      const tasksCol = $app.findCollectionByNameOrId('tasks')
      const taskRecord = new Record(tasksCol)
      const clientName = clientRecord ? clientRecord.getString('name') : 'Cliente'
      const assignedTo = clientRecord ? clientRecord.getString('assigned_to') : ''
      const orderLabel = associatedOrderNumber ? ` [Pedido ${associatedOrderNumber}]` : ''

      taskRecord.set(
        'title',
        `⚠️ RECUPERAÇÃO: Cliente Insatisfeito (${overallRating}★)${orderLabel} - ${clientName}`,
      )
      taskRecord.set(
        'description',
        `Avaliação de ${overallRating} estrela(s) recebida para o pedido ${associatedOrderNumber || '(Vinculado)'}. ` +
          (comment ? `Comentário: "${comment}". ` : 'Sem comentário adicional. ') +
          `Entrar em contato urgentemente na área de Recuperação para entender o motivo e solucionar a insatisfação.`,
      )
      taskRecord.set('client_id', clientId)
      if (assignedTo) taskRecord.set('assigned_to', assignedTo)
      taskRecord.set('due_date', new Date().toISOString().split('T')[0])
      taskRecord.set('status', 'pendente')
      taskRecord.set('priority', 'alta')

      $app.save(taskRecord)
    } catch (err) {
      console.log('Error creating dissatisfied client task:', err)
    }
  }

  // 3. Mark post_sales record as completed if it exists
  try {
    const postSalesCol = $app.findCollectionByNameOrId('post_sales')
    const postSaleRec = $app.findFirstRecordByData('post_sales', 'evaluation_token', token)
    postSaleRec.set('status', 'completed')
    $app.save(postSaleRec)
  } catch (_) {}

  return e.json(200, {
    success: true,
    message: 'Avaliação registrada com sucesso. Muito obrigado pela sua opinião!',
    is_dissatisfied: isDissatisfied,
    order_number: associatedOrderNumber || undefined,
  })
})
