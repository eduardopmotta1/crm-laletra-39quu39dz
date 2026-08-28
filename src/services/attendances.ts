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

  /**
   * Cria um NOVO atendimento para um CLIENTE EXISTENTE.
   * Valida o cliente, resolve registro canonical se for merged,
   * NÃO cria outro registro na collection 'clients',
   * atualiza o client para refletir o ciclo comercial ativo (desarquivado)
   * e retorna o attendance criado.
   */
  async createForClient(
    clientId: string,
    data: {
      stage?: KanbanStage
      assigned_to?: string
      product_interest?: string
      quote_value?: number
      notes?: string
      source?: string
    },
  ): Promise<Attendance> {
    // 1. Validar e resolver client canônico
    let targetClientId = clientId
    try {
      const client = await pb.collection('clients').getOne(clientId)
      if (client.notes) {
        const match = client.notes.match(/\[DUPLICADO_CONSOLIDADO\s*->\s*([a-zA-Z0-9_-]+)\]/i)
        if (match && match[1]) {
          targetClientId = match[1]
        }
      }
    } catch (err) {
      console.warn(`[attendancesService] Could not resolve client ${clientId}:`, err)
    }

    const stage = data.stage || 'Novo contato'
    const todayDateStr = new Date().toISOString().split('T')[0]

    // 2. Criar attendance vinculado ao client canônico
    const payload: Partial<Attendance> = {
      client_id: targetClientId,
      stage,
      assigned_to: data.assigned_to || '',
      product_interest: data.product_interest || '',
      quote_value: data.quote_value || 0,
      notes: data.notes || '',
      source: data.source || 'manual',
      is_archived: false,
    }

    const record = await pb.collection('attendances').create<Attendance>(payload)

    // 3. Atualizar o cliente para refletir o novo ciclo comercial ativo
    try {
      const clientRec = await pb.collection('clients').getOne(targetClientId)
      const hasPurchasesBefore = (clientRec.total_purchases || 0) > 0

      await pb.collection('clients').update(targetClientId, {
        is_archived: false,
        stage: stage,
        product_interest: data.product_interest || clientRec.product_interest || '',
        quote_value: data.quote_value !== undefined ? data.quote_value : clientRec.quote_value,
        assigned_to: data.assigned_to || clientRec.assigned_to || '',
        notes: data.notes
          ? `${clientRec.notes ? clientRec.notes + '\n---\n' : ''}${data.notes}`
          : clientRec.notes,
        has_returned: hasPurchasesBefore,
        last_message_at: todayDateStr,
        last_message_direction: 'inbound',
        last_message_text: `Novo atendimento iniciado: ${data.product_interest || 'Geral'}`,
      })
    } catch (clientErr) {
      console.warn(
        '[attendancesService] Error syncing client metadata on new attendance:',
        clientErr,
      )
    }

    // 4. Log stage transition
    try {
      await dealsService.logTransition({
        attendanceId: record.id,
        clientId: targetClientId,
        fromStage: undefined,
        toStage: stage,
        changeType: 'manual',
        notes: `Novo atendimento criado (${data.product_interest || 'Geral'})`,
      })
    } catch (transErr) {
      console.warn('[attendancesService] Error logging transition for attendance:', transErr)
    }

    return record
  },

  /**
   * Alias de compatibilidade
   */
  async create(data: {
    client_id: string
    stage?: KanbanStage
    assigned_to?: string
    product_interest?: string
    quote_value?: number
    notes?: string
    source?: string
  }): Promise<Attendance> {
    return this.createForClient(data.client_id, data)
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
