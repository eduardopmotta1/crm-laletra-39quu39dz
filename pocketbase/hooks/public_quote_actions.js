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

    // Atualiza status e data de aprovação
    const nowIso = new Date().toISOString()
    q.set('status', 'aprovado')
    q.set('approved_at', nowIso)

    $app.save(q)

    return c.json(200, {
      success: true,
      already_approved: false,
      message: 'Orçamento aprovado com sucesso!',
      approved_at: nowIso,
      status: 'aprovado',
      code: q.getString('code'),
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
