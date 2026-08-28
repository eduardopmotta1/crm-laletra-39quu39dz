import pb from '@/lib/pocketbase/client'
import type { Client, KanbanStage } from '@/types/crm'
import { dealsService } from './deals'
import { attendancesService } from './attendances'

// In-memory locks, failure counter and permanent skip tracker to prevent duplicate / racing auto-archive attempts
const archivingClientsInProgress = new Set<string>()
const permanentSkipClients = new Set<string>()
const clientFailureCount = new Map<string, number>()
let lastAutoArchiveExecutionTime = 0
const AUTO_ARCHIVE_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

export const clientsService = {
  /**
   * Get clients. By default only returns ACTIVE (non-archived) clients for Kanban/dashboard.
   * Pass includeArchived: true if querying everything.
   */
  async getAll(
    filter?: string,
    sort = '-last_message_at',
    options?: { includeArchived?: boolean },
  ): Promise<Client[]> {
    try {
      let combinedFilter = filter || ''
      if (!options?.includeArchived) {
        const activeFilter = 'is_archived != true'
        combinedFilter = combinedFilter ? `(${combinedFilter}) && (${activeFilter})` : activeFilter
      }

      const records = await pb.collection('clients').getFullList<Client>({
        filter: combinedFilter || undefined,
        sort,
        expand: 'assigned_to',
        requestKey: null,
      })
      return records
    } catch (error) {
      console.error('Error fetching clients:', error)
      return []
    }
  },

  async getById(id: string): Promise<Client | null> {
    try {
      return await pb.collection('clients').getOne<Client>(id, {
        expand: 'assigned_to,last_archived_deal_id',
      })
    } catch (error) {
      console.error(`Error fetching client ${id}:`, error)
      return null
    }
  },

  async create(data: Partial<Client>): Promise<Client> {
    const dateFieldNames = [
      'closed_at',
      'next_action_date',
      'reopened_at',
      'first_purchase_date',
      'last_purchase_date',
      'last_message_at',
    ]

    const sanitizedData: Record<string, any> = { ...data }
    for (const key of dateFieldNames) {
      if (key in sanitizedData) {
        const val = sanitizedData[key]
        if (typeof val === 'string' && val.includes('T')) {
          sanitizedData[key] = val.split('T')[0]
        }
      }
    }

    const created = await pb.collection('clients').create<Client>({
      ...sanitizedData,
      is_archived: false,
      has_returned: false,
    })

    // Create attendance record via attendancesService and log transition on attendance
    try {
      await attendancesService.create({
        client_id: created.id,
        stage: created.stage || 'Precisa responder',
        assigned_to: created.assigned_to || '',
        product_interest: created.product_interest || '',
        quote_value: created.quote_value || 0,
        notes: created.notes || '',
        source: created.source || 'whatsapp',
      })
    } catch (attErr) {
      console.error('Error auto-creating attendance for client:', attErr)
    }

    return created
  },

  async update(id: string, data: Partial<Client>): Promise<Client> {
    const prev = await this.getById(id)

    // Sanitize date fields to YYYY-MM-DD
    const dateFieldNames = [
      'closed_at',
      'next_action_date',
      'reopened_at',
      'first_purchase_date',
      'last_purchase_date',
      'last_message_at',
    ]

    const sanitizedData: Record<string, any> = { ...data }
    for (const key of dateFieldNames) {
      if (key in sanitizedData) {
        const val = sanitizedData[key]
        if (typeof val === 'string' && val.includes('T')) {
          sanitizedData[key] = val.split('T')[0]
        }
      }
    }

    let updated: Client
    try {
      updated = await pb.collection('clients').update<Client>(id, sanitizedData as Partial<Client>)
    } catch (err: any) {
      console.error(
        `Error updating client ${id} in PocketBase:`,
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

    // Check if stage changed to log transition
    if (prev && data.stage && prev.stage !== data.stage) {
      dealsService.logTransition({
        clientId: id,
        fromStage: prev.stage,
        toStage: data.stage,
        changeType: 'manual',
        notes: 'Atualização cadastral do cliente',
      })
    }

    return updated
  },

  async updateStage(
    id: string,
    stage: KanbanStage,
    options?: {
      changeType?: 'manual' | 'automatic'
      notes?: string
      fromStage?: string
    },
  ): Promise<Client> {
    const prev = options?.fromStage ? null : await this.getById(id)
    const fromStage = options?.fromStage || prev?.stage || ''

    const isFinalStage = stage === 'Venda fechada' || stage === 'Não fechou'
    const stagePayload: Record<string, any> = {
      stage,
    }
    // NEVER send closed_at: null. Only include closed_at when entering final stage.
    if (isFinalStage) {
      stagePayload.closed_at = new Date().toISOString().split('T')[0]
    }

    let updated: Client
    try {
      updated = await pb.collection('clients').update<Client>(id, stagePayload)
    } catch (err: any) {
      console.error(
        `Error updating stage for client ${id} in PocketBase:`,
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

    if (fromStage !== stage) {
      dealsService.logTransition({
        clientId: id,
        fromStage,
        toStage: stage,
        changeType: options?.changeType || 'manual',
        notes: options?.notes || 'Movimentação manual no funil Kanban',
      })
    }

    // Also find the active attendance for this client and update its stage too
    try {
      const activeAtts = await pb.collection('attendances').getList(1, 1, {
        filter: `client_id = "${id}" && is_archived != true`,
        sort: '-created',
        requestKey: null,
      })
      if (activeAtts.items.length > 0) {
        await attendancesService.updateStage(activeAtts.items[0].id, stage, options)
      }
    } catch (attErr) {
      console.error('Error updating active attendance stage from client:', attErr)
    }

    return updated
  },

  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('clients').delete(id)
      return true
    } catch (error) {
      console.error(`Error deleting client ${id}:`, error)
      return false
    }
  },

  /**
   * Run automated archiving check based on configured hours for closed attendances/deals
   */
  async runAutoArchiveCheck(wonHours = 24, lostHours = 24, force = false): Promise<number> {
    // Delegate to attendancesService
    return attendancesService.runAutoArchiveCheck(wonHours, lostHours, force)
  },
}
