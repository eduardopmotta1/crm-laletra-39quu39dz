import pb from '@/lib/pocketbase/client'
import type { Client, KanbanStage } from '@/types/crm'
import { dealsService } from './deals'

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
    let updated: Client
    try {
      updated = await pb.collection('clients').update<Client>(id, data)
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
        // Skip if permanently skipped due to repeated failures
        if (permanentSkipClients.has(client.id)) {
          continue
        }

        // Skip if already being processed by another simultaneous call
        if (archivingClientsInProgress.has(client.id)) {
          continue
        }

        // Skip if already has last_archived_deal_id populated or already marked is_archived
        if (client.last_archived_deal_id || client.is_archived) {
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
            // Reset failure count on success
            clientFailureCount.delete(client.id)
          } catch (archiveErr) {
            console.error(`Failed to auto-archive client ${client.id}:`, archiveErr)

            // Increment failure count
            const currentFails = (clientFailureCount.get(client.id) || 0) + 1
            clientFailureCount.set(client.id, currentFails)

            // Attempt emergency minimal patch to mark client as archived and break loop
            try {
              // Look up if any archived deal was created during the failed attempt
              let lastDealId = client.last_archived_deal_id
              if (!lastDealId) {
                const checkDeals = await pb.collection('archived_deals').getList(1, 1, {
                  filter: `client_id = "${client.id}"`,
                  sort: '-created',
                  requestKey: null,
                })
                if (checkDeals.items.length > 0) {
                  lastDealId = checkDeals.items[0].id
                }
              }

              const minimalPatch: Record<string, any> = { is_archived: true }
              if (lastDealId) {
                minimalPatch.last_archived_deal_id = lastDealId
              }
              await pb.collection('clients').update(client.id, minimalPatch)
              console.log(`Emergency minimal patch applied successfully for client ${client.id}`)
            } catch (patchErr) {
              console.error(`Emergency minimal patch failed for client ${client.id}:`, patchErr)
              // If failure count reached 2 or emergency patch failed, permanently skip to prevent infinite loop
              if (currentFails >= 2) {
                permanentSkipClients.add(client.id)
                console.warn(
                  `Client ${client.id} added to permanentSkipClients after ${currentFails} failures.`,
                )
              }
            }

            if (currentFails >= 2) {
              permanentSkipClients.add(client.id)
            }
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
