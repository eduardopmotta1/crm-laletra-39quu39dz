/**
 * Hook para envio público de avaliação por token.
 * NÃO requer autenticação.
 * Endpoint: POST /backend/v1/crm/submit-evaluation
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
    } else {
      // Se não existe em evaluations, verificar em post_sales para criar o registro
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
      if (!psRecords || psRecords.length === 0) {
        return e.json(404, { error: 'Link de avaliação não encontrado ou expirado.' })
      }

      const ps = psRecords[0]
      const evCol = $app.findCollectionByNameOrId('evaluations')
      record = new Record(evCol)
      record.set('token', token)
      record.set('client_id', ps.getString('client_id') || '')
      if (ps.getString('order_id')) {
        record.set('order_id', ps.getString('order_id'))
      }
      if (ps.getString('order_number')) {
        record.set('order_number', ps.getString('order_number'))
      }
      if (ps.getString('attendance_id')) {
        record.set('attendance_id', ps.getString('attendance_id'))
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
    try {
      const psMatches = $app.findRecordsByFilter(
        'post_sales',
        'evaluation_token = {:token}',
        '',
        1,
        0,
        {
          token: token,
        },
      )
      if (psMatches && psMatches.length > 0) {
        const psRec = psMatches[0]
        psRec.set('status', 'completed')
        $app.save(psRec)
      }
    } catch (_) {}

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
