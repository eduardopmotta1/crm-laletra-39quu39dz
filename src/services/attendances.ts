import pb from '@/lib/pocketbase/client'
import type { Attendance, KanbanStage } from '@/types/crm'
import { dealsService } from './deals'
import { tasksService } from './tasks'

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
      allowDuplicateActive?: boolean
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

    // 2. ETAPA 2A: Centralização no BACKEND com transação SQLite e lock atômico
    // Chama o endpoint POST /backend/v1/crm/attendances/resolve
    try {
      const response = await pb.send<{
        success: boolean
        action: 'reused' | 'created' | 'historical_inconsistency_resolved'
        attendance: Attendance
        attendance_id: string
      }>('/backend/v1/crm/attendances/resolve', {
        method: 'POST',
        body: {
          client_id: targetClientId,
          stage: data.stage || 'Novo contato',
          assigned_to: data.assigned_to,
          product_interest: data.product_interest,
          quote_value: data.quote_value,
          notes: data.notes,
          source: data.source || 'manual',
        },
      })

      if (response && response.attendance) {
        // Log transition se foi um attendance recém-criado
        if (response.action === 'created') {
          try {
            await dealsService.logTransition({
              attendanceId: response.attendance.id,
              clientId: targetClientId,
              fromStage: undefined,
              toStage: data.stage || 'Novo contato',
              changeType: 'manual',
              notes: `Novo atendimento criado (${data.product_interest || 'Geral'})`,
            })
          } catch (transErr) {
            console.warn('[attendancesService] Error logging transition for attendance:', transErr)
          }
        }
        return response.attendance
      }
    } catch (endpointErr) {
      console.warn(
        `[attendancesService.createForClient] Endpoint backend falhou, aplicando fallback local protegido:`,
        endpointErr,
      )
    }

    // 3. Fallback defensivo local caso o backend esteja indisponível (ex: ambiente offline ou erro de rota transitório)
    if (!data.allowDuplicateActive) {
      try {
        const existingActive = await pb.collection('attendances').getList<Attendance>(1, 1, {
          filter: `client_id = "${targetClientId}" && is_archived = false`,
          sort: '-created',
          requestKey: null,
        })
        if (existingActive.items && existingActive.items.length > 0) {
          console.warn(
            `[attendancesService.createForClient] Reutilizando attendance ativo existente ${existingActive.items[0].id} para client ${targetClientId} em vez de duplicar.`,
          )
          return existingActive.items[0]
        }
      } catch (checkErr) {
        // Ignora erro de consulta defensivo e segue para criação
      }
    }

    const stage = data.stage || 'Novo contato'
    const todayDateStr = new Date().toISOString().split('T')[0]

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
   * Resolve de forma centralizada e atômica o atendimento ativo do cliente.
   * Chama o backend /backend/v1/crm/attendances/resolve garantindo:
   * 1. Reutilização de attendance ativo existente;
   * 2. Criação única sob lock transacional se não houver ativo;
   * 3. Resolução determinística e aviso estruturado se houver >1 ativos históricos;
   * 4. Nunca usa clientAtts[0] arbitrário.
   */
  async resolveForClient(
    clientId: string,
    options?: {
      stage?: KanbanStage
      assigned_to?: string
      product_interest?: string
      notes?: string
      source?: string
    },
  ): Promise<Attendance> {
    return this.createForClient(clientId, { ...options, allowDuplicateActive: false })
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
    allowDuplicateActive?: boolean
  }): Promise<Attendance> {
    return this.createForClient(data.client_id, data)
  },

  /**
   * Localiza ou cria um atendimento aberto para vincular a um orçamento.
   * Regras:
   * 1. Buscar atendimento do cliente com:
   *    is_archived != true AND stage != "Venda fechada" AND stage != "Não fechou"
   * 2. Se encontrar: reutilizar esse atendimento aberto existente (não duplica atendimento).
   * 3. Se não encontrar: criar novo atendimento com client_id = clientId, stage = "Em atendimento",
   *    is_archived = false, source = 'orcamento' (origem pelo módulo de orçamentos).
   * 4. Retornar o Attendance.
   */
  async resolveOrCreateForQuote(clientId: string): Promise<Attendance> {
    if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
      throw new Error('[attendancesService.resolveOrCreateForQuote] clientId é obrigatório.')
    }

    const cleanClientId = clientId.trim()

    // 1. Resolver clientId canônico caso tenha sido mesclado/consolidado
    let targetClientId = cleanClientId
    try {
      const client = await pb.collection('clients').getOne(cleanClientId)
      if (client.notes) {
        const match = client.notes.match(/\[DUPLICADO_CONSOLIDADO\s*->\s*([a-zA-Z0-9_-]+)\]/i)
        if (match && match[1]) {
          targetClientId = match[1]
        }
      }
    } catch (err) {
      console.warn(
        `[attendancesService.resolveOrCreateForQuote] Client ${cleanClientId} fetch check:`,
        err,
      )
    }

    // 2. Buscar atendimento aberto do cliente
    try {
      const openAttendances = await pb.collection('attendances').getFullList<Attendance>({
        filter: `client_id = "${targetClientId}" && is_archived != true && stage != "Venda fechada" && stage != "Não fechou"`,
        sort: '-created',
        requestKey: null,
      })

      if (openAttendances.length > 0) {
        return openAttendances[0]
      }
    } catch (fetchErr) {
      console.error(
        `[attendancesService.resolveOrCreateForQuote] Erro ao buscar atendimentos abertos para o cliente ${targetClientId}:`,
        fetchErr,
      )
    }

    // 3. Se não encontrar, criar novo atendimento aberto com stage "Em atendimento" e source "orcamento"
    return await this.createForClient(targetClientId, {
      stage: 'Em atendimento',
      source: 'orcamento',
      notes: 'Atendimento iniciado automaticamente pelo Módulo de Orçamentos',
    })
  },

  async update(id: string, data: Partial<Attendance>): Promise<Attendance> {
    const current = await this.getById(id)
    const oldStage = current?.stage

    const record = await pb.collection('attendances').update<Attendance>(id, data)

    if (data.stage && oldStage && data.stage !== oldStage) {
      await dealsService.logTransition({
        attendanceId: id,
        clientId: record.client_id,
        fromStage: oldStage,
        toStage: data.stage,
        changeType: 'manual',
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
      attendanceId: id,
      clientId: record.client_id,
      fromStage,
      toStage: stage,
      changeType: options?.changeType || 'manual',
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
                lossReason:
                  resultType === 'lost' ? 'Arquivado automaticamente por inatividade' : undefined,
                finalNotes: `Arquivado automaticamente pelo sistema após ${limitHours}h da conclusão.`,
              })

              // Encerramento automático garantido de follow-ups pendentes para o attendance arquivado por inatividade
              try {
                await tasksService.cancelPendingFollowUpsForAttendance(att.id, {
                  reason: 'Auto-arquivamento por inatividade',
                  source: 'attendancesService.runAutoArchiveCheck',
                })
              } catch (taskCancelErr) {
                console.error(
                  `[AutoArchive] Erro ao cancelar follow-ups do atendimento ${att.id}:`,
                  taskCancelErr,
                )
              }

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
