import pb from '@/lib/pocketbase/client'
import type { Client, KanbanStage } from '@/types/crm'
import { dealsService } from './deals'

// In-memory locks and cooldown tracker to prevent duplicate / racing auto-archive attempts
const archivingClientsInProgress = new Set<string>()
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
    const created = await pb.collection('clients').create<Client>({
      ...data,
      is_archived: false,
      has_returned: false,
    })

    // Log initial stage transition
    if (created.stage) {
      dealsService.logTransition({
        clientId: created.id,
        fromStage: '',
        toStage: created.stage,
        changeType: 'manual',
        notes: 'Criação manual do atendimento no funil',
      })
    }

    return created
  },

  async update(id: string, data: Partial<Client>): Promise<Client> {
    const prev = await this.getById(id)
    const updated = await pb.collection('clients').update<Client>(id, data)

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

    const updated = await pb.collection('clients').update<Client>(id, {
      stage,
      // If moving out of final stage, remove closed_at
      closed_at:
        stage === 'Venda fechada' || stage === 'Não fechou'
          ? new Date().toISOString().split('T')[0]
          : null,
    })

    if (fromStage !== stage) {
      dealsService.logTransition({
        clientId: id,
        fromStage,
        toStage: stage,
        changeType: options?.changeType || 'manual',
        notes: options?.notes || 'Movimentação manual no funil Kanban',
      })
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
   * Run client-side automated archiving check based on configured hours for closed deals
   */
  async runAutoArchiveCheck(wonHours = 24, lostHours = 24, force = false): Promise<number> {
    const now = Date.now()
    if (
      !force &&
      lastAutoArchiveExecutionTime > 0 &&
      now - lastAutoArchiveExecutionTime < AUTO_ARCHIVE_COOLDOWN_MS
    ) {
      // Cooldown active (< 5 minutes since last execution)
      return 0
    }
    lastAutoArchiveExecutionTime = now

    try {
      const candidates = await pb.collection('clients').getFullList<Client>({
        filter: 'is_archived != true && (stage = "Venda fechada" || stage = "Não fechou")',
        requestKey: null,
      })

      let archivedCount = 0
      for (const client of candidates) {
        // Skip if already being processed by another simultaneous call
        if (archivingClientsInProgress.has(client.id)) {
          continue
        }

        // Skip if already has last_archived_deal_id populated
        if (client.last_archived_deal_id) {
          continue
        }

        // Use closed_at or updated or created timestamp
        const timeRef = client.closed_at || client.updated || client.created
        if (!timeRef) continue

        const elapsedMs = now - new Date(timeRef).getTime()
        const elapsedHours = elapsedMs / (1000 * 60 * 60)

        const thresholdHours = client.stage === 'Venda fechada' ? wonHours : lostHours

        if (elapsedHours >= thresholdHours) {
          // Check if an archived_deal record already exists for this client to prevent duplicate loops
          try {
            const existingDeals = await pb.collection('archived_deals').getList(1, 1, {
              filter: `client_id = "${client.id}"`,
              requestKey: null,
            })
            if (existingDeals.totalItems > 0) {
              // Deal already exists in archived_deals, update client is_archived directly so it stops appearing as candidate
              const latestDeal = existingDeals.items[0]
              await pb.collection('clients').update(client.id, {
                is_archived: true,
                last_archived_deal_id: latestDeal.id,
              })
              continue
            }
          } catch (checkErr) {
            console.error(
              `Error checking existing archived deals for client ${client.id}:`,
              checkErr,
            )
          }

          // Lock in-flight client archiving
          archivingClientsInProgress.add(client.id)
          try {
            const result = client.stage === 'Venda fechada' ? 'Venda fechada' : 'Venda perdida'
            await dealsService.completeAndArchive({
              clientId: client.id,
              result,
              lossReason:
                result === 'Venda perdida'
                  ? client.notes || 'Arquivamento automático após limite de tempo'
                  : undefined,
              finalNotes: `Arquivado automaticamente após ${Math.round(elapsedHours)}h na etapa final.`,
            })
            archivedCount++
          } catch (archiveErr) {
            console.error(`Failed to auto-archive client ${client.id}:`, archiveErr)
          } finally {
            archivingClientsInProgress.delete(client.id)
          }
        }
      }

      return archivedCount
    } catch (error) {
      console.error('Error in runAutoArchiveCheck:', error)
      return 0
    }
  },
}
