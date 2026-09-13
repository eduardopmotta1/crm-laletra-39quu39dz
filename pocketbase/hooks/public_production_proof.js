/**
 * Hook para decisão de prova de arte pelo cliente na página pública /acompanhar/:tracking_token
 * NÃO requer autenticação.
 * Endpoint: POST /backend/v1/crm/public-production/{tracking_token}/proof-decision
 *
 * Payload: { proof_id: string, decision: "approved" | "changes_requested", comment?: string }
 *
 * Validações obrigatórias:
 * 1. tracking_token existe e localiza exatamente um production_order
 * 2. proof_id pertence ao pedido de produção
 * 3. requires_art_approval = true
 * 4. art_approved != true (se já aprovado e request tenta aprovar mesma prova -> idempotência; se tenta outra decisão -> bloqueado)
 * 5. proof é a versão correta/ativa aguardando decisão (somente a prova mais recente aguardando decisão)
 * 6. Se alteração solicitada: comentário obrigatório
 * 7. Idempotência contra clique duplo
 * 8. Histórico registrado em production_logs com change_type = "automatic"
 * 9. Atualização de status em production_proofs, production_orders e etapa do pedido
 */
routerAdd('POST', '/backend/v1/crm/public-production/{tracking_token}/proof-decision', (c) => {
  let token = ''
  try {
    token = c.request.pathValue('tracking_token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token de acompanhamento inválido ou não fornecido.' })
    }

    const body = c.requestInfo().body || {}
    const proofId = typeof body.proof_id === 'string' ? body.proof_id.trim() : ''
    const rawDecision = typeof body.decision === 'string' ? body.decision.trim() : ''
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''

    // Normalizar decisão: aceita "approved" ou "aprovado" / "changes_requested" ou "alteracao_solicitada"
    let decision = ''
    if (rawDecision === 'approved' || rawDecision === 'aprovado') {
      decision = 'aprovado'
    } else if (rawDecision === 'changes_requested' || rawDecision === 'alteracao_solicitada') {
      decision = 'alteracao_solicitada'
    } else {
      return c.json(400, {
        error: 'Decisão inválida. Valores aceitos: "approved" ou "changes_requested".',
      })
    }

    if (!proofId) {
      return c.json(400, { error: 'Identificador da prova (proof_id) é obrigatório.' })
    }

    // 1. Localizar o pedido pelo tracking_token
    const orders = $app.findRecordsByFilter(
      'production_orders',
      'tracking_token = {:token}',
      '-created',
      1,
      0,
      { token: token.trim() },
    )

    if (!orders || orders.length === 0) {
      return c.json(404, { error: 'Pedido de produção não encontrado para este link.' })
    }

    const order = orders[0]
    const orderId = order.id
    const orderNumber = order.getString('order_number') || 'Pedido'
    const clientName = order.getString('client_name') || 'Cliente'
    const requiresArt = order.getBool('requires_art_approval') === true
    const isArtApproved = order.getBool('art_approved') === true
    const currentApprovedProofId = order.getString('approved_proof_id') || ''

    // Validação: pedido exige aprovação de arte?
    if (!requiresArt) {
      return c.json(400, {
        error: 'Este pedido não exige aprovação de arte.',
      })
    }

    // 2. Buscar todas as provas do pedido para identificar a versão ativa e verificar posse
    const proofs = $app.findRecordsByFilter(
      'production_proofs',
      'order_id = {:orderId}',
      'version_number',
      100,
      0,
      { orderId: orderId },
    )

    if (!proofs || proofs.length === 0) {
      return c.json(404, { error: 'Nenhuma prova digital foi enviada para este pedido.' })
    }

    // Verificar se a proof pertence ao pedido
    const targetProof = proofs.find((p) => p.id === proofId)
    if (!targetProof) {
      return c.json(403, { error: 'A prova indicada não pertence a este pedido de produção.' })
    }

    const targetVersion = targetProof.getInt('version_number') || 1
    const targetStatus = targetProof.getString('status') || ''

    // Determinar a prova mais recente do pedido (maior version_number)
    let maxVersionNumber = 0
    let latestProof = proofs[0]
    for (let i = 0; i < proofs.length; i++) {
      const v = proofs[i].getInt('version_number') || 0
      if (v >= maxVersionNumber) {
        maxVersionNumber = v
        latestProof = proofs[i]
      }
    }

    // 3. IDEMPOTÊNCIA: Se já foi aprovada exatamente esta mesma prova
    if (
      decision === 'aprovado' &&
      targetStatus === 'aprovado' &&
      isArtApproved &&
      currentApprovedProofId === proofId
    ) {
      return c.json(200, {
        success: true,
        already_processed: true,
        decision: 'approved',
        status: 'aprovado',
        version_number: targetVersion,
        message: 'Esta versão da arte já foi aprovada com sucesso.',
      })
    }

    // IDEMPOTÊNCIA: Se alteração com exatamente este comentário já foi solicitada para esta versão
    if (
      decision === 'alteracao_solicitada' &&
      targetStatus === 'alteracao_solicitada' &&
      targetProof.getString('client_comment') === comment
    ) {
      return c.json(200, {
        success: true,
        already_processed: true,
        decision: 'changes_requested',
        status: 'alteracao_solicitada',
        version_number: targetVersion,
        message: 'A alteração desta arte já foi solicitada anteriormente.',
      })
    }

    // Se o pedido já tiver arte aprovada no geral
    if (isArtApproved) {
      return c.json(400, {
        error: 'A arte deste pedido já se encontra aprovada e não aceita novas decisões públicas.',
      })
    }

    // 4. Bloquear decisão sobre versão antiga
    // Apenas a prova mais recente pode ser decidida
    if (targetProof.id !== latestProof.id || targetVersion < maxVersionNumber) {
      return c.json(400, {
        error:
          'Não é possível decidir sobre uma versão anterior da arte. Apenas a versão mais recente pode ser avaliada.',
      })
    }

    // Apenas prova aguardando decisão pode receber resposta
    if (targetStatus !== 'aguardando_aprovacao') {
      return c.json(400, {
        error:
          'Esta versão da arte já teve uma decisão registrada e não está mais aguardando aprovação.',
      })
    }

    // 5. Se for solicitação de alteração, comentário é obrigatório
    if (decision === 'alteracao_solicitada') {
      if (!comment) {
        return c.json(400, {
          error: 'Por favor, descreva detalhadamente o que precisa ser alterado na arte.',
        })
      }
    }

    // 6. Executar a decisão (mesma lógica do recordProofDecision existente)
    const todayDateStr = new Date().toISOString().split('T')[0]
    const prodLogsCol = $app.findCollectionByNameOrId('production_logs')

    // Localizar a etapa alvo em production_stages
    const targetStageInternalId = decision === 'aprovado' ? 'approved' : 'art_preparation'
    let targetStageRecord = null
    try {
      targetStageRecord = $app.findFirstRecordByData(
        'production_stages',
        'internal_id',
        targetStageInternalId,
      )
    } catch (_) {
      try {
        const found = $app.findRecordsByFilter(
          'production_stages',
          "internal_id = '" + targetStageInternalId + "'",
          '',
          1,
          0,
        )
        if (found && found.length > 0) {
          targetStageRecord = found[0]
        }
      } catch (_) {}
    }

    const targetStageName = targetStageRecord
      ? targetStageRecord.getString('name')
      : decision === 'aprovado'
        ? 'Aprovado'
        : 'Arte em preparação'

    const fromStageId = order.getString('stage_internal_id') || 'awaiting_approval'
    const fromStageName = order.getString('stage_name') || 'Aguardando aprovação'

    if (decision === 'aprovado') {
      // 6.1 Atualizar a prova para aprovada
      targetProof.set('status', 'aprovado')
      targetProof.set('client_comment', comment)
      targetProof.set('approved_at', todayDateStr)
      targetProof.set('approved_by_contact', clientName + ' (Página Pública)')
      $app.save(targetProof)

      // 6.2 Atualizar o pedido para aprovado
      order.set('art_approved', true)
      order.set('art_approved_at', todayDateStr)
      order.set('approved_proof_id', targetProof.id)
      order.set('stage_internal_id', 'approved')
      order.set('stage_name', targetStageName)
      if (targetStageRecord) {
        order.set('stage_id', targetStageRecord.id)
      }
      $app.save(order)

      // 6.3 Criar production_log
      const logNote = comment
        ? 'Cliente aprovou a arte V' +
          targetVersion +
          ' pela página pública. Comentário: "' +
          comment +
          '".'
        : 'Cliente aprovou a arte V' +
          targetVersion +
          ' pela página pública sem observações adicionais.'

      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', fromStageId)
        logRec.set('from_stage_name', fromStageName)
        logRec.set('to_stage_id', 'approved')
        logRec.set('to_stage_name', targetStageName)
        logRec.set('user_name', clientName + ' (Página Pública)')
        logRec.set('change_type', 'automatic')
        logRec.set('notes', logNote)
        logRec.set('whatsapp_sent', false)
        logRec.set('whatsapp_status', 'nao_enviado')
        logRec.set('whatsapp_message', '')
        $app.save(logRec)
      } catch (logErr) {
        console.error('[PublicProofDecision] Erro ao gravar production_log:', logErr)
      }

      return c.json(200, {
        success: true,
        decision: 'approved',
        status: 'aprovado',
        version_number: targetVersion,
        stage_internal_id: 'approved',
        stage_name: targetStageName,
        message: 'Arte aprovada com sucesso! Seu pedido seguirá para a próxima etapa.',
      })
    } else {
      // 6.4 Atualizar a prova para alteracao_solicitada
      targetProof.set('status', 'alteracao_solicitada')
      targetProof.set('client_comment', comment)
      $app.save(targetProof)

      // 6.5 Atualizar o pedido: volta para art_preparation e desmarca aprovação
      order.set('art_approved', false)
      if (order.getString('approved_proof_id') === targetProof.id) {
        order.set('approved_proof_id', '')
      }
      order.set('stage_internal_id', 'art_preparation')
      order.set('stage_name', targetStageName)
      if (targetStageRecord) {
        order.set('stage_id', targetStageRecord.id)
      }
      $app.save(order)

      // 6.6 Criar production_log
      const logNote =
        'Cliente solicitou alteração na arte V' +
        targetVersion +
        ' pela página pública: "' +
        comment +
        '". Retornado para Arte em preparação.'

      try {
        const logRec = new Record(prodLogsCol)
        logRec.set('order_id', orderId)
        logRec.set('from_stage_id', fromStageId)
        logRec.set('from_stage_name', fromStageName)
        logRec.set('to_stage_id', 'art_preparation')
        logRec.set('to_stage_name', targetStageName)
        logRec.set('user_name', clientName + ' (Página Pública)')
        logRec.set('change_type', 'automatic')
        logRec.set('notes', logNote)
        logRec.set('whatsapp_sent', false)
        logRec.set('whatsapp_status', 'nao_enviado')
        logRec.set('whatsapp_message', '')
        $app.save(logRec)
      } catch (logErr) {
        console.error('[PublicProofDecision] Erro ao gravar production_log:', logErr)
      }

      return c.json(200, {
        success: true,
        decision: 'changes_requested',
        status: 'alteracao_solicitada',
        version_number: targetVersion,
        stage_internal_id: 'art_preparation',
        stage_name: targetStageName,
        comment: comment,
        message:
          'Alteração solicitada com sucesso! Nossa equipe recebeu sua solicitação e preparará uma nova versão.',
      })
    }
  } catch (err) {
    const maskedToken = token ? token.substring(0, 4) + '...' + token.slice(-4) : 'nenhum'
    console.error(
      `[PublicProofDecision] Token: ${maskedToken} | Erro: ${err && err.message ? err.message : String(err)}`,
    )
    return c.json(500, {
      error:
        'Erro ao processar decisão da arte: ' + (err && err.message ? err.message : String(err)),
    })
  }
})
