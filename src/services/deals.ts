import pb from '@/lib/pocketbase/client'
import type { ArchivedDeal, StageTransition } from '@/types/crm'

export interface ArchiveDealPayload {
  clientId?: string
  attendanceId?: string
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
   * - Upserts archived_deals based on attendance_id
   * - Marks attendance and client is_archived = true
   * - Does NOT delete client, messages, quotes, tasks, notes or history
   * - Logs the final stage transition
   */
  async completeAndArchive(payload: ArchiveDealPayload): Promise<ArchivedDeal> {
    const todayDateStr = new Date().toISOString().split('T')[0]
    let clientId = payload.clientId
    let attendanceId = payload.attendanceId
    let attendance: any = null
    let client: any = null

    if (attendanceId) {
      try {
        attendance = await pb
          .collection('attendances')
          .getOne(attendanceId, { expand: 'client_id' })
        if (!clientId && attendance.client_id) {
          clientId = attendance.client_id
        }
        if (attendance.expand?.client_id) {
          client = attendance.expand.client_id
        }
      } catch (err) {
        console.warn(`Attendance ${attendanceId} not found directly, falling back:`, err)
      }
    }

    if (clientId && !client) {
      client = await pb.collection('clients').getOne(clientId)
    }

    if (!attendance && clientId) {
      // Find active attendance or latest attendance for this client
      try {
        const atts = await pb.collection('attendances').getList(1, 1, {
          filter: `client_id = "${clientId}"`,
          sort: '-created',
          requestKey: null,
        })
        if (atts.items.length > 0) {
          attendance = atts.items[0]
          attendanceId = attendance.id
        }
      } catch {
        /* intentionally ignored */
      }
    }

    const clientName = client?.name || 'Cliente'
    const clientPhone = client?.phone || ''
    const clientEmail = client?.email || undefined

    // Calculate deal duration in days
    let durationDays = 0
    const timeRef = attendance?.created || client?.created
    if (timeRef) {
      const createdTime = new Date(timeRef).getTime()
      const diffMs = Date.now() - createdTime
      durationDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
    }

    // 1. Upsert archived deal record by attendance_id (or client_id as fallback)
    let archived: ArchivedDeal
    let isNewArchivedRecord = false
    let previousExistingResult: string | null = null

    try {
      let existingList: { items: ArchivedDeal[] } = { items: [] }
      if (attendanceId) {
        existingList = await pb.collection('archived_deals').getList<ArchivedDeal>(1, 1, {
          filter: `attendance_id = "${attendanceId}"`,
          sort: '-created',
          requestKey: null,
        })
      } else if (clientId) {
        existingList = await pb.collection('archived_deals').getList<ArchivedDeal>(1, 1, {
          filter: `client_id = "${clientId}"`,
          sort: '-created',
          requestKey: null,
        })
      }

      const dealData: Record<string, any> = {
        client_name: clientName,
        client_phone: clientPhone,
        client_email: clientEmail,
        result: payload.result,
        loss_reason: payload.lossReason || '',
        loss_category: payload.lossCategory || '',
        product_interest:
          payload.productInterest || attendance?.product_interest || client?.product_interest || '',
        quote_value:
          payload.quoteValue !== undefined
            ? payload.quoteValue
            : attendance?.quote_value !== undefined
              ? attendance.quote_value
              : client?.quote_value || undefined,
        closed_at: todayDateStr,
        assigned_to:
          payload.assignedTo || attendance?.assigned_to || client?.assigned_to || undefined,
        closed_by: payload.closedBy || pb.authStore.record?.id || undefined,
        final_notes: payload.finalNotes || '',
        duration_days: durationDays,
      }
      if (attendanceId) {
        dealData.attendance_id = attendanceId
      }
      if (clientId) {
        dealData.client_id = clientId
      }

      if (existingList.items.length > 0) {
        // PATCH existing record
        const existingDeal = existingList.items[0]
        previousExistingResult = existingDeal.result
        archived = await pb
          .collection('archived_deals')
          .update<ArchivedDeal>(existingDeal.id, dealData)
      } else {
        // POST new record
        isNewArchivedRecord = true
        archived = await pb.collection('archived_deals').create<ArchivedDeal>({
          client_id: clientId || '',
          attendance_id: attendanceId || undefined,
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

    // 2. Update attendance record (archive cycle)
    const finalStage = payload.result === 'Venda fechada' ? 'Venda fechada' : 'Não fechou'
    const isWon = payload.result === 'Venda fechada'

    if (attendanceId) {
      try {
        await pb.collection('attendances').update(attendanceId, {
          is_archived: true,
          stage: finalStage,
          result: payload.result,
          loss_reason: payload.lossReason || '',
          closed_at: todayDateStr,
          archived_at: todayDateStr,
          last_archived_deal_id: archived.id,
        })
      } catch (attErr) {
        console.error('Error updating attendance during archive:', attErr)
      }
    }

    // 3. Update client summary metrics (total purchases, first/last purchase date)
    if (clientId && client) {
      const dealValue =
        payload.quoteValue !== undefined
          ? payload.quoteValue
          : attendance?.quote_value || client.quote_value || 0

      let shouldIncrementPurchase = false
      if (isWon) {
        if (isNewArchivedRecord) {
          shouldIncrementPurchase = true
        } else if (previousExistingResult !== 'Venda fechada') {
          shouldIncrementPurchase = true
        }
      }

      const currentPurchases = (client.total_purchases || 0) + (shouldIncrementPurchase ? 1 : 0)
      const currentTotalValue =
        (client.total_purchase_value || 0) + (shouldIncrementPurchase ? dealValue : 0)
      const firstPurchase = client.first_purchase_date || (isWon ? todayDateStr : undefined)
      const lastPurchase = isWon ? todayDateStr : client.last_purchase_date

      const rawClientUpdateData: Record<string, any> = {
        is_archived: true,
        stage: finalStage,
        closed_at: todayDateStr,
        last_archived_deal_id: archived.id,
        has_returned: currentPurchases > 0,
        total_purchases: currentPurchases,
        total_purchase_value: currentTotalValue,
      }
      if (firstPurchase) {
        rawClientUpdateData.first_purchase_date = firstPurchase
      }
      if (lastPurchase) {
        rawClientUpdateData.last_purchase_date = lastPurchase
      }

      const clientUpdateData: Record<string, any> = {}
      for (const [key, value] of Object.entries(rawClientUpdateData)) {
        if (value !== undefined && value !== null) {
          clientUpdateData[key] = value
        }
      }

      try {
        await pb.collection('clients').update(client.id, clientUpdateData)
      } catch (err: any) {
        console.error('Error updating client during completeAndArchive in PocketBase:', err)
      }
    }

    // 4. Log stage transition history
    try {
      await pb.collection('stage_transitions').create({
        client_id: clientId || '',
        attendance_id: attendanceId || undefined,
        from_stage: attendance?.stage || client?.stage || '',
        to_stage: `${finalStage} (Arquivado)`,
        change_type: 'manual',
        user_id: pb.authStore.record?.id || undefined,
        user_name: pb.authStore.record?.name || pb.authStore.record?.email || 'Atendente',
        notes:
          payload.result === 'Venda fechada'
            ? `Atendimento concluído e arquivado com sucesso. Valor: R$ ${(payload.quoteValue || attendance?.quote_value || client?.quote_value || 0).toFixed(2)}.`
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
  async reopenClient(
    clientId: string,
    stage: string = 'Precisa responder',
    attendanceId?: string,
  ): Promise<void> {
    const todayDateStr = new Date().toISOString().split('T')[0]
    const client = await pb.collection('clients').getOne(clientId)
    const oldStage = client.stage
    const hasPurchasedBefore = (client.total_purchases || 0) > 0

    // 1. If attendanceId provided, un-archive it. Else create a new active attendance or unarchive latest
    let activeAttendanceId = attendanceId
    if (activeAttendanceId) {
      try {
        await pb.collection('attendances').update(activeAttendanceId, {
          is_archived: false,
          stage: stage,
          result: null,
          loss_reason: '',
          closed_at: null,
          archived_at: null,
        })
      } catch (err) {
        console.warn('Error updating attendance on reopen:', err)
      }
    } else {
      try {
        // Try to find the latest attendance for this client
        const existingAtts = await pb.collection('attendances').getList(1, 1, {
          filter: `client_id = "${clientId}"`,
          sort: '-created',
          requestKey: null,
        })
        if (existingAtts.items.length > 0) {
          activeAttendanceId = existingAtts.items[0].id
          await pb.collection('attendances').update(activeAttendanceId, {
            is_archived: false,
            stage: stage,
          })
        } else {
          // Create a new attendance
          const newAtt = await pb.collection('attendances').create({
            client_id: clientId,
            stage: stage,
            is_archived: false,
            assigned_to: client.assigned_to || undefined,
            product_interest: client.product_interest || '',
            quote_value: client.quote_value || 0,
          })
          activeAttendanceId = newAtt.id
        }
      } catch (err) {
        console.error('Error ensuring attendance on reopen:', err)
      }
    }

    await pb.collection('clients').update(clientId, {
      is_archived: false,
      stage: stage,
      has_returned: hasPurchasedBefore,
      reopened_at: todayDateStr,
    })

    try {
      await pb.collection('stage_transitions').create({
        client_id: clientId,
        attendance_id: activeAttendanceId || undefined,
        from_stage: `${oldStage || 'Fechado'} (Arquivado)`,
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
    attendanceId?: string
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
        attendance_id: data.attendanceId || undefined,
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
