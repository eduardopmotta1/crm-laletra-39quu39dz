import pb from '@/lib/pocketbase/client'
import type { Attendance, KanbanStage } from '@/types/crm'
import { dealsService } from './deals'

export const attendancesService = {
  async getAll(
    filter?: string,
    sort = '-created',
    options?: { includeArchived?: boolean },
  ): Promise<Attendance[]> {
    try {
      let finalFilter = options?.includeArchived ? '' : 'is_archived != true'
      if (filter) {
        finalFilter = finalFilter ? `(${finalFilter}) && (${filter})` : filter
      }

      const records = await pb.collection('attendances').getFullList<Attendance>({
        filter: finalFilter || undefined,
        sort,
        expand: 'client_id,assigned_to',
        requestKey: null,
      })
      return records
    } catch (error) {
      console.error('Error fetching attendances:', error)
      return []
    }
  },

  async getById(id: string): Promise<Attendance | null> {
    try {
      const record = await pb.collection('attendances').getOne<Attendance>(id, {
        expand: 'client_id,assigned_to,last_archived_deal_id',
        requestKey: null,
      })
      return record
    } catch (error) {
      console.error('Error fetching attendance by id:', error)
      return null
    }
  },

  async getByClientId(clientId: string): Promise<Attendance[]> {
    try {
      const records = await pb.collection('attendances').getFullList<Attendance>({
        filter: `client_id = "${clientId}"`,
        sort: '-created',
        expand: 'client_id,assigned_to,last_archived_deal_id',
        requestKey: null,
      })
      return records
    } catch (error) {
      console.error('Error fetching attendances by client id:', error)
      return []
    }
  },

  async create(data: {
    client_id: string
    stage?: KanbanStage
    assigned_to?: string
    product_interest?: string
    quote_value?: number
    notes?: string
    source?: string
  }): Promise<Attendance> {
    const stage = data.stage || 'Precisa responder'
    const payload: Partial<Attendance> = {
      client_id: data.client_id,
      stage,
      assigned_to: data.assigned_to || '',
      product_interest: data.product_interest || '',
      quote_value: data.quote_value || 0,
      notes: data.notes || '',
      source: data.source || 'whatsapp',
      is_archived: false,
    }

    const record = await pb.collection('attendances').create<Attendance>(payload)

    // Log transition on attendance
    await dealsService.logTransition({
      attendance_id: record.id,
      client_id: data.client_id,
      from_stage: undefined,
      to_stage: stage,
      change_type: 'manual',
      notes: 'Atendimento criado',
    })

    return record
  },

  async update(id: string, data: Partial<Attendance>): Promise<Attendance> {
    const current = await this.getById(id)
    const oldStage = current?.stage

    const record = await pb.collection('attendances').update<Attendance>(id, data)

    if (data.stage && oldStage && data.stage !== oldStage) {
      await dealsService.logTransition({
        attendance_id: id,
        client_id: record.client_id,
        from_stage: oldStage,
        to_stage: data.stage,
        change_type: 'manual',
        notes: 'Etapa atualizada via update',
      })
    }

    return record
  },

  async updateStage(
    id: string,
    stage: KanbanStage,
    options?: { changeType?: 'manual' | 'automatic'; notes?: string; fromStage?: string },
  ): Promise<Attendance> {
    const current = await this.getById(id)
    const fromStage = options?.fromStage || current?.stage

    const updatePayload: Partial<Attendance> = {
      stage,
    }

    if (stage === 'Venda fechada' || stage === 'Não fechou') {
      updatePayload.closed_at = new Date().toISOString()
    } else {
      updatePayload.closed_at = ''
    }

    const record = await pb.collection('attendances').update<Attendance>(id, updatePayload)

    // Log transition with attendance_id
    await dealsService.logTransition({
      attendance_id: id,
      client_id: record.client_id,
      from_stage: fromStage,
      to_stage: stage,
      change_type: options?.changeType || 'manual',
      notes: options?.notes,
    })

    return record
  },

  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('attendances').delete(id)
      return true
    } catch (error) {
      console.error('Error deleting attendance:', error)
      return false
    }
  },

  async runAutoArchiveCheck(wonHours = 24, lostHours = 24, force = false): Promise<number> {
    // In-flight locking and failure recovery variables stored in module scope or memory
    try {
      // Find candidate attendances that are in terminal stage and not archived
      const wonAttendances = await pb.collection('attendances').getFullList<Attendance>({
        filter: 'is_archived != true && stage = "Venda fechada"',
        requestKey: null,
      })

      const lostAttendances = await pb.collection('attendances').getFullList<Attendance>({
        filter: 'is_archived != true && stage = "Não fechou"',
        requestKey: null,
      })

      const now = new Date()
      const nowMs = now.getTime()
      let archivedCount = 0

      const processList = async (
        list: Attendance[],
        limitHours: number,
        resultType: 'won' | 'lost',
      ) => {
        for (const att of list) {
          const timeRefStr = att.closed_at || att.updated || att.created
          const timeRefMs = new Date(timeRefStr).getTime()
          const diffHours = (nowMs - timeRefMs) / (1000 * 60 * 60)

          if (force || diffHours >= limitHours) {
            try {
              console.log(
                `[AutoArchive] Arquivando atendimento ${att.id} (${att.stage}) após ${diffHours.toFixed(1)}h (limite: ${limitHours}h)`,
              )

              await dealsService.completeAndArchive({
                attendanceId: att.id,
                clientId: att.client_id,
                result: resultType === 'won' ? 'Venda fechada' : 'Venda perdida',
                loss_reason:
                  resultType === 'lost' ? 'Arquivado automaticamente por inatividade' : undefined,
                notes: `Arquivado automaticamente pelo sistema após ${limitHours}h da conclusão.`,
              })

              archivedCount++
            } catch (itemErr) {
              console.error(`[AutoArchive] Falha ao arquivar atendimento ${att.id}:`, itemErr)
            }
          }
        }
      }

      await processList(wonAttendances, wonHours, 'won')
      await processList(lostAttendances, lostHours, 'lost')

      if (archivedCount > 0) {
        console.log(
          `[AutoArchive] Sucesso: ${archivedCount} atendimentos arquivados automaticamente.`,
        )
        window.dispatchEvent(new CustomEvent('crm-client-updated'))
      }

      return archivedCount
    } catch (error) {
      console.error('Error in runAutoArchiveCheck:', error)
      return 0
    }
  },
}
