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
    q.set('status', 'aprovado')
    q.set('approved_at', nowIso)

    $app.save(q)

    // 2. Extrai dados do quote e localiza attendance EXATO por quote.attendance_id
    const attendanceId = q.getString('attendance_id')
    const clientId = q.getString('client_id')
    const quoteCode = q.getString('code')
    const finalTotal = q.getFloat('final_total')
    const totalSale = q.getFloat('total_sale')
    const quoteValue =
      !isNaN(finalTotal) && finalTotal > 0 ? finalTotal : !isNaN(totalSale) ? totalSale : 0

    if (attendanceId) {
      try {
        const att = $app.findRecordById('attendances', attendanceId)
        if (att) {
          const oldStage = att.getString('stage') || 'Em atendimento'
          att.set('stage', 'Venda fechada')
          att.set('quote_value', quoteValue)
          $app.save(att)

          // 3. Registrar histórico de transição em stage_transitions
          try {
            const stageTransCollection = $app.findCollectionByNameOrId('stage_transitions')
            if (stageTransCollection) {
              const transRec = new Record(stageTransCollection)
              transRec.set('client_id', clientId || '')
              transRec.set('attendance_id', attendanceId)
              transRec.set('from_stage', oldStage)
              transRec.set('to_stage', 'Venda fechada')
              transRec.set('change_type', 'automatic')
              transRec.set('user_name', 'Cliente (Página Pública)')
              transRec.set(
                'notes',
                `Atendimento movido para "Venda fechada" após aprovação do orçamento ${quoteCode} pelo cliente na página pública. Valor: R$ ${quoteValue.toFixed(2)}.`,
              )
              $app.save(transRec)
            }
          } catch (tErr) {
            console.error('[PublicQuoteApprove] Erro ao criar stage_transition:', tErr)
          }
        }
      } catch (attErr) {
        console.error(
          '[PublicQuoteApprove] Erro ao atualizar attendance ' + attendanceId + ':',
          attErr,
        )
      }
    }

    // 4. Registrar audit_log de aprovação pública
    try {
      const auditCollection = $app.findCollectionByNameOrId('audit_logs')
      if (auditCollection) {
        const auditRec = new Record(auditCollection)
        auditRec.set('user_name', 'Cliente (Página Pública)')
        auditRec.set('user_email', '')
        auditRec.set('action', 'aprovar')
        auditRec.set('module', 'quotes')
        auditRec.set('record_id', q.id)
        auditRec.set('record_title', quoteCode)
        auditRec.set(
          'details',
          `Orçamento ${quoteCode} aprovado pelo cliente na página pública. Valor total: R$ ${quoteValue.toFixed(2)}.`,
        )
        auditRec.set('previous_value', JSON.stringify({ status: currentStatus }))
        auditRec.set(
          'new_value',
          JSON.stringify({
            status: 'aprovado',
            code: quoteCode,
            final_total: quoteValue,
            client_id: clientId,
            attendance_id: attendanceId,
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
      message: 'Orçamento aprovado com sucesso!',
      approved_at: nowIso,
      status: 'aprovado',
      code: quoteCode,
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
  try {
    const token = c.request.pathValue('token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token inválido' })
    }

    const body = $apis.requestInfo(c).data || {}
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
  try {
    const token = c.request.pathValue('token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token inválido' })
    }

    const body = $apis.requestInfo(c).data || {}
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
    return c.json(500, { error: 'Erro ao recusar orçamento: ' + err.message })
  }
})
