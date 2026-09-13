/**
 * Hook para envio público de avaliação por token.
 * NÃO requer autenticação.
 * Endpoint: POST /backend/v1/crm/submit-evaluation
 *
 * Regras:
 * - Token inválido / inexistente: rejeitar com 404
 * - Expiração: token expirado (> 30 dias) rejeitar com 410 / erro claro
 * - Resposta única: se já submetida (overall_rating > 0 ou status != 'pending_contact'), rejeitar com 400 sem sobrescrever notas/comentários
 * - Avaliação existente válida e pendente: salvar notas, status e atualizar post_sales
 */
routerAdd('POST', '/backend/v1/crm/submit-evaluation', (e) => {
  try {
    const body = e.requestInfo().body
    const token = body && body.token ? String(body.token).trim() : ''
    if (!token) {
      return e.json(400, { error: 'Token é obrigatório.' })
    }

    const overallRating = Number(body.overall_rating) || 0
    if (overallRating < 1 || overallRating > 5) {
      return e.json(400, { error: 'A nota geral deve ser de 1 a 5 estrelas.' })
    }

    const serviceRating = Number(body.service_rating) || 0
    const qualityRating = Number(body.quality_rating) || 0
    const deliveryRating = Number(body.delivery_rating) || 0
    const comment = body.comment ? String(body.comment).trim() : ''

    // 1. Buscar se já existe em evaluations
    let record = null
    const records = $app.findRecordsByFilter('evaluations', 'token = {:token}', '', 1, 0, {
      token: token,
    })

    if (records && records.length > 0) {
      record = records[0]
    }

    // 2. Buscar em post_sales (para obter dados ou checar data)
    let postSaleRecord = null
    const psRecords = $app.findRecordsByFilter(
      'post_sales',
      'evaluation_token = {:token}',
      '',
      1,
      0,
      {
        token: token,
      },
    )
    if (psRecords && psRecords.length > 0) {
      postSaleRecord = psRecords[0]
    }

    // Se não encontrou nem em evaluations nem em post_sales
    if (!record && !postSaleRecord) {
      return e.json(404, { error: 'Link de avaliação inválido ou inexistente.' })
    }

    // 3. Checagem de EXPIRAÇÃO (30 dias)
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    let referenceDateMs = 0

    if (postSaleRecord) {
      const scheduledDateStr = postSaleRecord.getString('scheduled_date') || ''
      const psCreatedStr = postSaleRecord.getString('created') || ''
      if (scheduledDateStr) {
        const parsedSched = Date.parse(scheduledDateStr)
        if (!isNaN(parsedSched)) {
          referenceDateMs = parsedSched
        }
      }
      if (!referenceDateMs && psCreatedStr) {
        const parsedCreated = Date.parse(psCreatedStr)
        if (!isNaN(parsedCreated)) {
          referenceDateMs = parsedCreated
        }
      }
    }

    if (!referenceDateMs && record) {
      const evCreatedStr = record.getString('created') || ''
      if (evCreatedStr) {
        const parsedEv = Date.parse(evCreatedStr)
        if (!isNaN(parsedEv)) {
          referenceDateMs = parsedEv
        }
      }
    }

    if (referenceDateMs > 0) {
      const expiresAtMs = referenceDateMs + THIRTY_DAYS_MS
      if (Date.now() > expiresAtMs) {
        return e.json(410, {
          error: 'Este link de avaliação expirou.',
          expired: true,
        })
      }
    }

    // 4. Checagem de RESPOSTA ÚNICA (não permitir novo submit, não sobrescrever)
    if (record) {
      const existingOverall = record.getInt('overall_rating') || 0
      const existingStatus = record.getString('status') || ''

      if (existingOverall > 0 || (existingStatus && existingStatus !== 'pending_contact')) {
        return e.json(400, {
          error: 'Esta avaliação já foi enviada. Obrigado pelo seu feedback.',
          already_submitted: true,
        })
      }
    }

    // Se o registro em evaluations não existe ainda, criar novo
    if (!record) {
      const evCol = $app.findCollectionByNameOrId('evaluations')
      record = new Record(evCol)
      record.set('token', token)
      record.set('client_id', postSaleRecord.getString('client_id') || '')
      if (postSaleRecord.getString('order_id')) {
        record.set('order_id', postSaleRecord.getString('order_id'))
      }
      if (postSaleRecord.getString('order_number')) {
        record.set('order_number', postSaleRecord.getString('order_number'))
      }
      if (postSaleRecord.getString('attendance_id')) {
        record.set('attendance_id', postSaleRecord.getString('attendance_id'))
      }
    }

    // Definir notas e comentários
    record.set('overall_rating', overallRating)
    if (serviceRating > 0) record.set('service_rating', serviceRating)
    if (qualityRating > 0) record.set('quality_rating', qualityRating)
    if (deliveryRating > 0) record.set('delivery_rating', deliveryRating)
    record.set('comment', comment)

    // Se nota <= 3, cliente insatisfeito necessita contato
    // Se nota >= 4, cliente satisfeito
    const isDissatisfied = overallRating <= 3
    record.set('status', isDissatisfied ? 'pending_contact' : 'satisfied')

    $app.save(record)

    // Atualizar status do post_sales para completed se existir
    if (postSaleRecord) {
      try {
        postSaleRecord.set('status', 'completed')
        $app.save(postSaleRecord)
      } catch (_) {}
    }

    return e.json(200, {
      success: true,
      status: 'submitted',
      message: 'Avaliação registrada com sucesso.',
      is_dissatisfied: isDissatisfied,
    })
  } catch (err) {
    console.error('[SUBMIT EVALUATION] error:', err)
    return e.json(500, { error: 'Erro ao enviar avaliação.' })
  }
})
