import pb from '@/lib/pocketbase/client'
import type { ArchivedDeal, StageTransition } from '@/types/crm'

export interface ArchiveDealPayload {
  clientId: string
  result: 'Venda fechada' | 'Venda perdida'
  lossReason?: string
  lossCategory?: string
  finalNotes?: string
  quoteValue?: number
  productInterest?: string
  assignedTo?: string
  closedBy?: string
}

export const dealsService = {
  /**
   * Concluir e Arquivar Atendimento
   * - Creates an archived_deals entry
   * - Marks client is_archived = true
   * - Does NOT delete client, messages, quotes, tasks, notes or history
   * - Logs the final stage transition
   */
  async completeAndArchive(payload: ArchiveDealPayload): Promise<ArchivedDeal> {
    const client = await pb.collection('clients').getOne(payload.clientId)
    const nowIso = new Date().toISOString()

    // Calculate deal duration in days
    let durationDays = 0
    if (client.created) {
      const createdTime = new Date(client.created).getTime()
      const diffMs = Date.now() - createdTime
      durationDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
    }

    // 1. Create archived deal record
    const archived = await pb.collection('archived_deals').create<ArchivedDeal>({
      client_id: client.id,
      client_name: client.name,
      client_phone: client.phone,
      client_email: client.email || '',
      result: payload.result,
      loss_reason: payload.lossReason || '',
      loss_category: payload.lossCategory || '',
      product_interest: payload.productInterest || client.product_interest || '',
      quote_value:
        payload.quoteValue !== undefined ? payload.quoteValue : client.quote_value || undefined,
      closed_at: nowIso,
      assigned_to: payload.assignedTo || client.assigned_to || undefined,
      closed_by: payload.closedBy || pb.authStore.record?.id || undefined,
      final_notes: payload.finalNotes || '',
      duration_days: durationDays,
    })

    // 2. Update client as archived, recording last archived deal reference and final stage
    const finalStage = payload.result === 'Venda fechada' ? 'Venda fechada' : 'Não fechou'
    const isWon = payload.result === 'Venda fechada'
    const dealValue =
      payload.quoteValue !== undefined ? payload.quoteValue : client.quote_value || 0

    const currentPurchases = (client.total_purchases || 0) + (isWon ? 1 : 0)
    const currentTotalValue = (client.total_purchase_value || 0) + (isWon ? dealValue : 0)
    const firstPurchase = client.first_purchase_date || (isWon ? nowIso : undefined)
    const lastPurchase = isWon ? nowIso : client.last_purchase_date

    await pb.collection('clients').update(client.id, {
      is_archived: true,
      stage: finalStage,
      closed_at: nowIso,
      last_archived_deal_id: archived.id,
      has_returned: false,
      total_purchases: currentPurchases,
      total_purchase_value: currentTotalValue,
      first_purchase_date: firstPurchase,
      last_purchase_date: lastPurchase,
    })

    // 3. Log stage transition history
    try {
      await pb.collection('stage_transitions').create({
        client_id: client.id,
        from_stage: client.stage,
        to_stage: `${finalStage} (Arquivado)`,
        change_type: 'manual',
        user_id: pb.authStore.record?.id || undefined,
        user_name: pb.authStore.record?.name || pb.authStore.record?.email || 'Atendente',
        notes:
          payload.result === 'Venda fechada'
            ? `Atendimento concluído e arquivado com sucesso. Valor: R$ ${(payload.quoteValue || client.quote_value || 0).toFixed(2)}.`
            : `Atendimento encerrado como venda perdida. Motivo: ${payload.lossReason || 'Não informado'}.`,
      })
    } catch (err) {
      console.error('Error logging stage transition:', err)
    }

    // 4. Schedule Post-Sale if it was a won deal ("Venda fechada")
    if (isWon) {
      try {
        const { settingsService } = await import('@/services/settings')
        const postSaleCfg = await settingsService.getPostSaleConfig()

        if (postSaleCfg.enabled) {
          const delayDays = postSaleCfg.delayDays || 3
          const scheduledDate = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString()
          const evalToken =
            'eval_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36)

          // Pre-create evaluation record for this token
          try {
            await pb.collection('evaluations').create({
              token: evalToken,
              client_id: client.id,
              attendance_id: archived.id,
              overall_rating: 0,
            })
          } catch (e) {
            console.error('Error pre-creating evaluation record:', e)
          }

          // Create follow-up Task if enabled
          let taskId: string | undefined = undefined
          if (postSaleCfg.autoTask) {
            try {
              const task = await pb.collection('tasks').create({
                title: `⭐ Pós-venda e Avaliação: ${client.name}`,
                description: `Realizar contato de pós-venda para verificar entrega e coletar avaliação do cliente. Link de avaliação: ${window.location.origin}/avaliacao/${evalToken}`,
                client_id: client.id,
                assigned_to: payload.assignedTo || client.assigned_to || pb.authStore.record?.id,
                due_date: scheduledDate,
                status: 'pendente',
                priority: 'media',
              })
              taskId = task.id
            } catch (err) {
              console.error('Error creating post sale task:', err)
            }
          }

          // Create post_sales record
          await pb.collection('post_sales').create({
            client_id: client.id,
            attendance_id: archived.id,
            scheduled_date: scheduledDate,
            status: 'pending',
            task_id: taskId,
            evaluation_token: evalToken,
            channel: 'whatsapp',
            notes: `Agendado para ${delayDays} dia(s) após conclusão da venda.`,
          })
        }
      } catch (err) {
        console.error('Error scheduling post sale:', err)
      }
    }

    return archived
  },

  /**
   * Reopen an archived deal / client manually
   */
  async reopenClient(clientId: string, stage: string = 'Precisa responder'): Promise<void> {
    const nowIso = new Date().toISOString()
    const client = await pb.collection('clients').getOne(clientId)
    const oldStage = client.stage

    await pb.collection('clients').update(clientId, {
      is_archived: false,
      stage: stage,
      has_returned: true,
      reopened_at: nowIso,
    })

    try {
      await pb.collection('stage_transitions').create({
        client_id: clientId,
        from_stage: `${oldStage} (Arquivado)`,
        to_stage: stage,
        change_type: 'manual',
        user_id: pb.authStore.record?.id || undefined,
        user_name: pb.authStore.record?.name || pb.authStore.record?.email || 'Atendente',
        notes: 'Atendimento reaberto manualmente e retornado ao funil ativo.',
      })
    } catch {
      /* intentionally ignored */
    }
  },

  /**
   * Get all archived deals with optional filter and sort
   */
  async getArchivedDeals(filter?: string, sort = '-closed_at'): Promise<ArchivedDeal[]> {
    try {
      return await pb.collection('archived_deals').getFullList<ArchivedDeal>({
        filter,
        sort,
        expand: 'client_id,assigned_to,closed_by',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching archived deals:', error)
      return []
    }
  },

  /**
   * Get archived deals for a specific client
   */
  async getByClientId(clientId: string): Promise<ArchivedDeal[]> {
    try {
      return await pb.collection('archived_deals').getFullList<ArchivedDeal>({
        filter: `client_id = "${clientId}"`,
        sort: '-closed_at',
        expand: 'assigned_to,closed_by',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching archived deals for client ${clientId}:`, error)
      return []
    }
  },

  /**
   * Get stage transition history for a client
   */
  async getStageTransitions(clientId: string): Promise<StageTransition[]> {
    try {
      return await pb.collection('stage_transitions').getFullList<StageTransition>({
        filter: `client_id = "${clientId}"`,
        sort: '-created',
        expand: 'user_id',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching stage transitions for client ${clientId}:`, error)
      return []
    }
  },

  /**
   * Log a stage change audit record
   */
  async logTransition(data: {
    clientId: string
    fromStage?: string
    toStage: string
    fromStageId?: string
    toStageId?: string
    changeType?: 'manual' | 'automatic'
    notes?: string
  }): Promise<StageTransition | null> {
    try {
      return await pb.collection('stage_transitions').create<StageTransition>({
        client_id: data.clientId,
        from_stage: data.fromStage || '',
        to_stage: data.toStage,
        from_stage_id: data.fromStageId || '',
        to_stage_id: data.toStageId || '',
        change_type: data.changeType || 'manual',
        user_id: pb.authStore.record?.id || undefined,
        user_name: pb.authStore.record?.name || pb.authStore.record?.email || 'Atendente',
        notes: data.notes || '',
      })
    } catch (error) {
      console.error('Error logging stage transition:', error)
      return null
    }
  },
}
