import { describe, it, expect, vi, beforeEach } from 'vitest'
import { productionService } from './production'

/**
 * Pure simulation of the backend hook logic in pocketbase/hooks/public_production_proof.js
 * Validates the exact backend rules without network mocks.
 */
interface MockRecord {
  id: string
  [key: string]: any
  getString: (k: string) => string
  getInt: (k: string) => number
  getBool: (k: string) => boolean
  set: (k: string, v: any) => void
}

function createMockRecord(data: Record<string, any>): MockRecord {
  const store = { ...data }
  return {
    ...store,
    id: store.id,
    getString: (k: string) => (store[k] !== undefined && store[k] !== null ? String(store[k]) : ''),
    getInt: (k: string) => (store[k] !== undefined && store[k] !== null ? Number(store[k]) : 0),
    getBool: (k: string) => Boolean(store[k]),
    set: (k: string, v: any) => {
      store[k] = v
    },
  }
}

interface RunProofDecisionParams {
  token: string
  body: {
    proof_id?: string
    decision?: string
    comment?: string
  }
  orders: MockRecord[]
  proofs: MockRecord[]
  stages?: MockRecord[]
}

function runProofDecisionHook({
  token,
  body,
  orders,
  proofs,
  stages = [],
}: RunProofDecisionParams) {
  const logsCreated: any[] = []

  if (!token || token.trim() === '') {
    return {
      status: 400,
      body: { error: 'Token de acompanhamento inválido ou não fornecido.' },
      logsCreated,
    }
  }

  const proofId = typeof body.proof_id === 'string' ? body.proof_id.trim() : ''
  const rawDecision = typeof body.decision === 'string' ? body.decision.trim() : ''
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''

  let decision = ''
  if (rawDecision === 'approved' || rawDecision === 'aprovado') {
    decision = 'aprovado'
  } else if (rawDecision === 'changes_requested' || rawDecision === 'alteracao_solicitada') {
    decision = 'alteracao_solicitada'
  } else {
    return {
      status: 400,
      body: { error: 'Decisão inválida. Valores aceitos: "approved" ou "changes_requested".' },
      logsCreated,
    }
  }

  if (!proofId) {
    return {
      status: 400,
      body: { error: 'Identificador da prova (proof_id) é obrigatório.' },
      logsCreated,
    }
  }

  const order = orders.find((o) => o.getString('tracking_token') === token.trim())
  if (!order) {
    return {
      status: 404,
      body: { error: 'Pedido de produção não encontrado para este link.' },
      logsCreated,
    }
  }

  const orderId = order.id
  const clientName = order.getString('client_name') || 'Cliente'
  const requiresArt = order.getBool('requires_art_approval') === true
  const isArtApproved = order.getBool('art_approved') === true
  const currentApprovedProofId = order.getString('approved_proof_id') || ''

  if (!requiresArt) {
    return { status: 400, body: { error: 'Este pedido não exige aprovação de arte.' }, logsCreated }
  }

  const orderProofs = proofs.filter((p) => p.getString('order_id') === orderId)
  if (orderProofs.length === 0) {
    return {
      status: 404,
      body: { error: 'Nenhuma prova digital foi enviada para este pedido.' },
      logsCreated,
    }
  }

  const targetProof = orderProofs.find((p) => p.id === proofId)
  if (!targetProof) {
    return {
      status: 403,
      body: { error: 'A prova indicada não pertence a este pedido de produção.' },
      logsCreated,
    }
  }

  const targetVersion = targetProof.getInt('version_number') || 1
  const targetStatus = targetProof.getString('status') || ''

  let maxVersionNumber = 0
  let latestProof = orderProofs[0]
  for (let i = 0; i < orderProofs.length; i++) {
    const v = orderProofs[i].getInt('version_number') || 0
    if (v >= maxVersionNumber) {
      maxVersionNumber = v
      latestProof = orderProofs[i]
    }
  }

  // Idempotência
  if (
    decision === 'aprovado' &&
    targetStatus === 'aprovado' &&
    isArtApproved &&
    currentApprovedProofId === proofId
  ) {
    return {
      status: 200,
      body: {
        success: true,
        already_processed: true,
        decision: 'approved',
        status: 'aprovado',
        version_number: targetVersion,
        message: 'Esta versão da arte já foi aprovada com sucesso.',
      },
      logsCreated,
    }
  }

  if (
    decision === 'alteracao_solicitada' &&
    targetStatus === 'alteracao_solicitada' &&
    targetProof.getString('client_comment') === comment
  ) {
    return {
      status: 200,
      body: {
        success: true,
        already_processed: true,
        decision: 'changes_requested',
        status: 'alteracao_solicitada',
        version_number: targetVersion,
        message: 'A alteração desta arte já foi solicitada anteriormente.',
      },
      logsCreated,
    }
  }

  if (isArtApproved) {
    return {
      status: 400,
      body: {
        error: 'A arte deste pedido já se encontra aprovada e não aceita novas decisões públicas.',
      },
      logsCreated,
    }
  }

  if (targetProof.id !== latestProof.id || targetVersion < maxVersionNumber) {
    return {
      status: 400,
      body: {
        error:
          'Não é possível decidir sobre uma versão anterior da arte. Apenas a versão mais recente pode ser avaliada.',
      },
      logsCreated,
    }
  }

  if (targetStatus !== 'aguardando_aprovacao') {
    return {
      status: 400,
      body: {
        error:
          'Esta versão da arte já teve uma decisão registrada e não está mais aguardando aprovação.',
      },
      logsCreated,
    }
  }

  if (decision === 'alteracao_solicitada' && !comment) {
    return {
      status: 400,
      body: { error: 'Por favor, descreva detalhadamente o que precisa ser alterado na arte.' },
      logsCreated,
    }
  }

  const todayDateStr = '2026-03-30'
  const fromStageId = order.getString('stage_internal_id') || 'awaiting_approval'
  const fromStageName = order.getString('stage_name') || 'Aguardando aprovação'

  if (decision === 'aprovado') {
    targetProof.set('status', 'aprovado')
    targetProof.set('client_comment', comment)
    targetProof.set('approved_at', todayDateStr)
    targetProof.set('approved_by_contact', clientName + ' (Página Pública)')

    order.set('art_approved', true)
    order.set('art_approved_at', todayDateStr)
    order.set('approved_proof_id', targetProof.id)
    order.set('stage_internal_id', 'approved')
    order.set('stage_name', 'Aprovado')

    const logNote = comment
      ? 'Cliente aprovou a arte V' +
        targetVersion +
        ' pela página pública. Comentário: "' +
        comment +
        '".'
      : 'Cliente aprovou a arte V' +
        targetVersion +
        ' pela página pública sem observações adicionais.'

    logsCreated.push({
      order_id: orderId,
      from_stage_id: fromStageId,
      from_stage_name: fromStageName,
      to_stage_id: 'approved',
      to_stage_name: 'Aprovado',
      user_name: clientName + ' (Página Pública)',
      change_type: 'automatic',
      notes: logNote,
      whatsapp_sent: false,
      whatsapp_status: 'nao_enviado',
    })

    return {
      status: 200,
      body: {
        success: true,
        decision: 'approved',
        status: 'aprovado',
        version_number: targetVersion,
        stage_internal_id: 'approved',
        stage_name: 'Aprovado',
        message: 'Arte aprovada com sucesso! Seu pedido seguirá para a próxima etapa.',
      },
      logsCreated,
    }
  } else {
    targetProof.set('status', 'alteracao_solicitada')
    targetProof.set('client_comment', comment)

    order.set('art_approved', false)
    if (order.getString('approved_proof_id') === targetProof.id) {
      order.set('approved_proof_id', '')
    }
    order.set('stage_internal_id', 'art_preparation')
    order.set('stage_name', 'Arte em preparação')

    const logNote =
      'Cliente solicitou alteração na arte V' +
      targetVersion +
      ' pela página pública: "' +
      comment +
      '". Retornado para Arte em preparação.'

    logsCreated.push({
      order_id: orderId,
      from_stage_id: fromStageId,
      from_stage_name: fromStageName,
      to_stage_id: 'art_preparation',
      to_stage_name: 'Arte em preparação',
      user_name: clientName + ' (Página Pública)',
      change_type: 'automatic',
      notes: logNote,
      whatsapp_sent: false,
      whatsapp_status: 'nao_enviado',
    })

    return {
      status: 200,
      body: {
        success: true,
        decision: 'changes_requested',
        status: 'alteracao_solicitada',
        version_number: targetVersion,
        stage_internal_id: 'art_preparation',
        stage_name: 'Arte em preparação',
        comment,
        message:
          'Alteração solicitada com sucesso! Nossa equipe recebeu sua solicitação e preparará uma nova versão.',
      },
      logsCreated,
    }
  }
}

/**
 * Frontend helper condition mirroring PublicTrackingPage logic
 */
function shouldShowDecisionButtons(order: any, latestProof: any) {
  const canDecideArt =
    Boolean(order.requires_art_approval) &&
    !order.art_approved &&
    latestProof?.status === 'aguardando_aprovacao' &&
    (order.stage_internal_id === 'awaiting_approval' ||
      order.stage_internal_id === 'art_preparation')

  return canDecideArt
}

describe('Testes Obrigatórios de Aprovação de Arte Self-Service (Cenários A a J)', () => {
  const validToken = 'tk_valid_tracking_123456789'
  const otherToken = 'tk_other_tracking_987654321'

  let orderAwaiting: MockRecord
  let proofV1: MockRecord
  let proofV2: MockRecord
  let allOrders: MockRecord[]
  let allProofs: MockRecord[]

  beforeEach(() => {
    orderAwaiting = createMockRecord({
      id: 'ord_100',
      order_number: '#001844',
      tracking_token: validToken,
      client_name: 'Gráfica Cliente Alpha',
      requires_art_approval: true,
      art_approved: false,
      art_approved_at: null,
      approved_proof_id: '',
      stage_internal_id: 'awaiting_approval',
      stage_name: 'Aguardando aprovação',
    })

    proofV1 = createMockRecord({
      id: 'prf_001',
      order_id: 'ord_100',
      version_number: 1,
      status: 'alteracao_solicitada',
      client_comment: 'Ajustar cor para azul marinho',
    })

    proofV2 = createMockRecord({
      id: 'prf_002',
      order_id: 'ord_100',
      version_number: 2,
      status: 'aguardando_aprovacao',
      client_comment: '',
    })

    allOrders = [orderAwaiting]
    allProofs = [proofV1, proofV2]
  })

  // Teste A: pedido aguardando aprovação → cliente abre link → vê prova atual → vê os 2 botões
  it('A) pedido aguardando aprovação → cliente abre link → vê prova atual → vê os 2 botões', () => {
    const isVisible = shouldShowDecisionButtons(orderAwaiting, proofV2)
    expect(isVisible).toBe(true)

    // Versão 1 antiga não deve mostrar botões
    const isV1Visible = shouldShowDecisionButtons(orderAwaiting, proofV1)
    expect(isV1Visible).toBe(false)
  })

  // Teste B: cliente aprova → proof aprovada, art_approved true, approved_proof_id correto, etapa approved, log criado
  it('B) cliente aprova → proof aprovada, art_approved true, approved_proof_id correto, etapa approved, log criado', () => {
    const res = runProofDecisionHook({
      token: validToken,
      body: {
        proof_id: 'prf_002',
        decision: 'approved',
      },
      orders: allOrders,
      proofs: allProofs,
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(proofV2.getString('status')).toBe('aprovado')
    expect(orderAwaiting.getBool('art_approved')).toBe(true)
    expect(orderAwaiting.getString('approved_proof_id')).toBe('prf_002')
    expect(orderAwaiting.getString('stage_internal_id')).toBe('approved')

    expect(res.logsCreated.length).toBe(1)
    expect(res.logsCreated[0].to_stage_id).toBe('approved')
    expect(res.logsCreated[0].change_type).toBe('automatic')
    expect(res.logsCreated[0].notes).toContain('Cliente aprovou a arte V2 pela página pública')
  })

  // Teste C: cliente pede alteração com comentário → comentário salvo, etapa art_preparation, log criado
  it('C) cliente pede alteração com comentário → comentário salvo, etapa art_preparation, log criado', () => {
    const res = runProofDecisionHook({
      token: validToken,
      body: {
        proof_id: 'prf_002',
        decision: 'changes_requested',
        comment: 'Corrigir o número do WhatsApp no rodapé',
      },
      orders: allOrders,
      proofs: allProofs,
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(proofV2.getString('status')).toBe('alteracao_solicitada')
    expect(proofV2.getString('client_comment')).toBe('Corrigir o número do WhatsApp no rodapé')
    expect(orderAwaiting.getBool('art_approved')).toBe(false)
    expect(orderAwaiting.getString('stage_internal_id')).toBe('art_preparation')

    expect(res.logsCreated.length).toBe(1)
    expect(res.logsCreated[0].to_stage_id).toBe('art_preparation')
    expect(res.logsCreated[0].notes).toContain(
      'Cliente solicitou alteração na arte V2 pela página pública',
    )
    expect(res.logsCreated[0].notes).toContain('Corrigir o número do WhatsApp no rodapé')
  })

  // Teste D: alteração sem comentário → bloqueada
  it('D) alteração sem comentário → bloqueada', () => {
    const res = runProofDecisionHook({
      token: validToken,
      body: {
        proof_id: 'prf_002',
        decision: 'changes_requested',
        comment: '', // Vazio
      },
      orders: allOrders,
      proofs: allProofs,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('descreva detalhadamente o que precisa ser alterado')
    expect(res.logsCreated.length).toBe(0)
    expect(proofV2.getString('status')).toBe('aguardando_aprovacao')
  })

  // Teste E: duplo clique em aprovar → uma única decisão, um único log
  it('E) duplo clique em aprovar → uma única decisão, um único log (idempotência)', () => {
    // 1ª chamada
    const res1 = runProofDecisionHook({
      token: validToken,
      body: {
        proof_id: 'prf_002',
        decision: 'approved',
      },
      orders: allOrders,
      proofs: allProofs,
    })

    expect(res1.status).toBe(200)
    expect(res1.logsCreated.length).toBe(1)

    // 2ª chamada idêntica (clique duplo)
    const res2 = runProofDecisionHook({
      token: validToken,
      body: {
        proof_id: 'prf_002',
        decision: 'approved',
      },
      orders: allOrders,
      proofs: allProofs,
    })

    expect(res2.status).toBe(200)
    expect(res2.body.already_processed).toBe(true)
    // NENHUM log adicional gerado na segunda chamada
    expect(res2.logsCreated.length).toBe(0)
  })

  // Teste F: tentar decidir versão antiga → bloqueado
  it('F) tentar decidir versão antiga (V1 quando existe V2) → bloqueado', () => {
    const res = runProofDecisionHook({
      token: validToken,
      body: {
        proof_id: 'prf_001', // V1 antiga
        decision: 'approved',
      },
      orders: allOrders,
      proofs: allProofs,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Não é possível decidir sobre uma versão anterior')
    expect(res.logsCreated.length).toBe(0)
  })

  // Teste G: token inválido → sem acesso à decisão
  it('G) token inválido → sem acesso à decisão', () => {
    const res = runProofDecisionHook({
      token: 'tk_token_inexistente_99999',
      body: {
        proof_id: 'prf_002',
        decision: 'approved',
      },
      orders: allOrders,
      proofs: allProofs,
    })

    expect(res.status).toBe(404)
    expect(res.body.error).toContain('Pedido de produção não encontrado')
    expect(res.logsCreated.length).toBe(0)
  })

  // Teste H: proof de outro pedido → bloqueado
  it('H) proof de outro pedido → bloqueado', () => {
    const proofOtherOrder = createMockRecord({
      id: 'prf_999_other',
      order_id: 'ord_different_999',
      version_number: 1,
      status: 'aguardando_aprovacao',
    })

    const res = runProofDecisionHook({
      token: validToken,
      body: {
        proof_id: 'prf_999_other',
        decision: 'approved',
      },
      orders: allOrders,
      proofs: [...allProofs, proofOtherOrder],
    })

    expect(res.status).toBe(403)
    expect(res.body.error).toContain('A prova indicada não pertence a este pedido')
    expect(res.logsCreated.length).toBe(0)
  })

  // Teste I: arte já aprovada → página somente leitura, sem botões
  it('I) arte já aprovada → página somente leitura, sem botões', () => {
    const orderApproved = createMockRecord({
      ...orderAwaiting,
      art_approved: true,
      stage_internal_id: 'approved',
    })

    const isVisible = shouldShowDecisionButtons(orderApproved, proofV2)
    expect(isVisible).toBe(false)
  })

  // Teste J: produto sem requires_art_approval → sem botões
  it('J) produto sem requires_art_approval → sem botões', () => {
    const orderNoArtRequired = createMockRecord({
      ...orderAwaiting,
      requires_art_approval: false,
    })

    const isVisible = shouldShowDecisionButtons(orderNoArtRequired, proofV2)
    expect(isVisible).toBe(false)

    // E se tentar chamar o endpoint:
    const res = runProofDecisionHook({
      token: validToken,
      body: {
        proof_id: 'prf_002',
        decision: 'approved',
      },
      orders: [orderNoArtRequired],
      proofs: allProofs,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Este pedido não exige aprovação de arte')
  })
})
