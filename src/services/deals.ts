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
    const todayDateStr = new Date().toISOString().split('T')[0]

    // Calculate deal duration in days
    let durationDays = 0
    if (client.created) {
      const createdTime = new Date(client.created).getTime()
      const diffMs = Date.now() - createdTime
      durationDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
    }

    // 1. Upsert archived deal record (1 client = 1 archived_deal)
    let archived: ArchivedDeal
    try {
      const existingList = await pb.collection('archived_deals').getList<ArchivedDeal>(1, 1, {
        filter: `client_id = "${client.id}"`,
        sort: '-created',
        requestKey: null,
      })

      const dealData: Record<string, any> = {
        client_name: client.name,
        client_phone: client.phone,
        client_email: client.email || undefined,
        result: payload.result,
        loss_reason: payload.lossReason || '',
        loss_category: payload.lossCategory || '',
        product_interest: payload.productInterest || client.product_interest || '',
        quote_value:
          payload.quoteValue !== undefined ? payload.quoteValue : client.quote_value || undefined,
        closed_at: todayDateStr,
        assigned_to: payload.assignedTo || client.assigned_to || undefined,
        closed_by: payload.closedBy || pb.authStore.record?.id || undefined,
        final_notes: payload.finalNotes || '',
        duration_days: durationDays,
      }

      if (existingList.items.length > 0) {
        // PATCH existing record
        archived = await pb
          .collection('archived_deals')
          .update<ArchivedDeal>(existingList.items[0].id, dealData)
      } else {
        // POST new record
        archived = await pb.collection('archived_deals').create<ArchivedDeal>({
          client_id: client.id,
          ...dealData,
        })
      }
    } catch (err: any) {
      console.error(
        'Error saving archived deal in PocketBase:',
        {
          message: err?.message,
          status: err?.status,
          url: err?.url,
          data: err?.data || err?.response?.data,
          response: err?.response,
        },
        err,
      )
      throw err
    }

    // 2. Update client as archived, recording last archived deal reference and final stage
    const finalStage = payload.result === 'Venda fechada' ? 'Venda fechada' : 'Não fechou'
    const isWon = payload.result === 'Venda fechada'
    const dealValue =
      payload.quoteValue !== undefined ? payload.quoteValue : client.quote_value || 0

    const currentPurchases = (client.total_purchases || 0) + (isWon ? 1 : 0)
    const currentTotalValue = (client.total_purchase_value || 0) + (isWon ? dealValue : 0)
    const firstPurchase = client.first_purchase_date || (isWon ? todayDateStr : undefined)
    const lastPurchase = isWon ? todayDateStr : client.last_purchase_date

    const rawClientUpdateData: Record<string, any> = {
      is_archived: true,
      stage: finalStage,
      closed_at: todayDateStr,
      last_archived_deal_id: archived.id,
      has_returned: false,
      total_purchases: currentPurchases,
      total_purchase_value: currentTotalValue,
    }
    if (firstPurchase) {
      rawClientUpdateData.first_purchase_date = firstPurchase
    }
    if (lastPurchase) {
      rawClientUpdateData.last_purchase_date = lastPurchase
    }

    // Filter out undefined and null values to build a clean payload
    const clientUpdateData: Record<string, any> = {}
    for (const [key, value] of Object.entries(rawClientUpdateData)) {
      if (value !== undefined && value !== null) {
        clientUpdateData[key] = value
      }
    }

    try {
      await pb.collection('clients').update(client.id, clientUpdateData)
    } catch (err: any) {
      console.error(
        'Error updating client during completeAndArchive in PocketBase:',
        {
          message: err?.message,
          status: err?.status,
          url: err?.url,
          data: err?.data || err?.response?.data,
          response: err?.response,
        },
        err,
      )
      // Emergency minimal patch to at least link the archived deal and set is_archived = true
      try {
        await pb.collection('clients').update(client.id, {
          is_archived: true,
          last_archived_deal_id: archived.id,
        })
        console.log(
          `Emergency minimal client patch succeeded for ${client.id} after main patch failed.`,
        )
      } catch (emergencyErr: any) {
        console.error(
          `Emergency minimal client patch also failed for ${client.id}:`,
          {
            message: emergencyErr?.message,
            status: emergencyErr?.status,
            data: emergencyErr?.data || emergencyErr?.response?.data,
          },
          emergencyErr,
        )
      }
      throw err
    }

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

    // Post-sale trigger rule: Post-sales NO LONGER triggers on deal closure/archive.
    // It triggers strictly when the linked production order is moved to "Concluído" (completed).
    return archived
  },

  /**
   * Reopen an archived deal / client manually
   */
  async reopenClient(clientId: string, stage: string = 'Precisa responder'): Promise<void> {
    const todayDateStr = new Date().toISOString().split('T')[0]
    const client = await pb.collection('clients').getOne(clientId)
    const oldStage = client.stage

    await pb.collection('clients').update(clientId, {
      is_archived: false,
      stage: stage,
      has_returned: true,
      reopened_at: todayDateStr,
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
