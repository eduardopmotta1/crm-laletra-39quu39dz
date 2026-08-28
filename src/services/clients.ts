import pb from '@/lib/pocketbase/client'
import type { Attendance, Client, KanbanStage } from '@/types/crm'
import { normalizePhone } from '@/lib/utils'
import { dealsService } from './deals'
import { attendancesService } from './attendances'

export interface FindClientByPhoneResult {
  client: Client | null
  isMerged: boolean
  canonicalClient: Client | null
  activeAttendance: Attendance | null
  attendancesCount: number
}

export const clientsService = {
  /**
   * Extrai o ID canônico se o cliente tiver nota de [DUPLICADO_CONSOLIDADO -> canonical_id]
   */
  extractCanonicalId(client: Client | null): string | null {
    if (!client || !client.notes) return null
    const match = client.notes.match(/\[DUPLICADO_CONSOLIDADO\s*->\s*([a-zA-Z0-9_-]+)\]/i)
    return match ? match[1] : null
  },

  /**
   * Resolve um registro de cliente para seu ID canônico, se houver sido consolidado/merged.
   */
  async resolveCanonicalClient(clientOrId: Client | string): Promise<Client | null> {
    let client: Client | null = null
    if (typeof clientOrId === 'string') {
      client = await this.getById(clientOrId)
    } else {
      client = clientOrId
    }

    if (!client) return null

    const canonicalId = this.extractCanonicalId(client)
    if (canonicalId && canonicalId !== client.id) {
      const canonical = await this.getById(canonicalId)
      if (canonical) {
        return canonical
      }
    }

    return client
  },

  /**
   * Localiza cliente por telefone normalizado.
   * Não considera nome ou e-mail como critério de unificação automática.
   * Se encontrar um registro consolidado (merged), resolve para o canônico.
   */
  async findByNormalizedPhone(rawPhone: string): Promise<FindClientByPhoneResult> {
    const norm = normalizePhone(rawPhone)
    if (!norm || norm.length < 8) {
      return {
        client: null,
        isMerged: false,
        canonicalClient: null,
        activeAttendance: null,
        attendancesCount: 0,
      }
    }

    try {
      // Buscar todos os clientes (inclusive arquivados) para varredura por telefone normalizado
      const allClients = await pb.collection('clients').getFullList<Client>({
        requestKey: null,
      })

      const matchedClients = allClients.filter((c) => {
        const cNorm = normalizePhone(c.phone)
        return cNorm && cNorm === norm
      })

      if (matchedClients.length === 0) {
        return {
          client: null,
          isMerged: false,
          canonicalClient: null,
          activeAttendance: null,
          attendancesCount: 0,
        }
      }

      // Se houver mais de um, preferir não consolidado ou o que tenha mais compras/dados
      let matched = matchedClients[0]
      const nonMerged = matchedClients.filter((c) => !this.extractCanonicalId(c))
      if (nonMerged.length > 0) {
        matched = nonMerged[0]
      }

      const canonicalId = this.extractCanonicalId(matched)
      const isMerged = Boolean(canonicalId && canonicalId !== matched.id)
      let canonicalClient: Client | null = null

      if (isMerged && canonicalId) {
        canonicalClient = (await this.getById(canonicalId)) || matched
      } else {
        canonicalClient = matched
      }

      const effectiveClient = canonicalClient || matched

      // Buscar atendimentos do cliente efetivo
      const atts = await pb.collection('attendances').getFullList<Attendance>({
        filter: `client_id = "${effectiveClient.id}"`,
        sort: '-created',
        requestKey: null,
      })

      const activeAttendance = atts.find((a) => !a.is_archived) || null

      return {
        client: matched,
        isMerged,
        canonicalClient: effectiveClient,
        activeAttendance,
        attendancesCount: atts.length,
      }
    } catch (err) {
      console.error('Error finding client by normalized phone:', err)
      return {
        client: null,
        isMerged: false,
        canonicalClient: null,
        activeAttendance: null,
        attendancesCount: 0,
      }
    }
  },

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

  /**
   * Sanitiza campos de data para formato YYYY-MM-DD
   */
  sanitizeDateFields(data: Record<string, any>): Record<string, any> {
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
    return sanitizedData
  },

  /**
   * Cria CLIENT NOVO + ATENDIMENTO INICIAL com proteção centralizada contra duplicidade.
   * Se o telefone já existir, NÃO duplica: reutiliza o cliente canônico existente e cria novo atendimento.
   */
  async createClientWithInitialAttendance(
    data: Partial<Client>,
  ): Promise<{ client: Client; attendance: Attendance }> {
    const rawPhone = data.phone || ''
    const norm = normalizePhone(rawPhone)

    // Proteção centralizada contra duplicidade: verificar se cliente já existe por telefone normalizado
    if (norm && norm.length >= 8) {
      const searchResult = await this.findByNormalizedPhone(rawPhone)
      if (searchResult.canonicalClient) {
        const existingClient = searchResult.canonicalClient
        // Cria somente o novo atendimento para o cliente existente
        const attendance = await attendancesService.createForClient(existingClient.id, {
          stage: (data.stage as KanbanStage) || 'Novo contato',
          assigned_to: data.assigned_to || existingClient.assigned_to || '',
          product_interest: data.product_interest || '',
          quote_value: data.quote_value || 0,
          notes: data.notes || '',
          source: (data as any).source || 'manual',
        })

        // Atualiza dados opcionais do cliente se fornecidos (sem duplicar registro)
        const updatePayload: Partial<Client> = {}
        if (data.name && data.name.trim() && data.name !== existingClient.name) {
          updatePayload.name = data.name.trim()
        }
        if (data.email && data.email.trim() && !existingClient.email) {
          updatePayload.email = data.email.trim()
        }
        if (Object.keys(updatePayload).length > 0) {
          try {
            await pb.collection('clients').update(existingClient.id, updatePayload)
          } catch {
            /* non-fatal */
          }
        }

        return { client: existingClient, attendance }
      }
    }

    // Cliente realmente novo
    const sanitizedData = this.sanitizeDateFields(data as Record<string, any>)
    const clientPayload: Record<string, any> = {
      ...sanitizedData,
      is_archived: false,
      has_returned: false,
      total_purchases: 0,
      total_purchase_value: 0,
    }

    const createdClient = await pb.collection('clients').create<Client>(clientPayload)

    // Criar atendimento inicial vinculado
    try {
      const attendance = await attendancesService.createForClient(createdClient.id, {
        stage: (data.stage as KanbanStage) || 'Novo contato',
        assigned_to: createdClient.assigned_to || '',
        product_interest: createdClient.product_interest || '',
        quote_value: createdClient.quote_value || 0,
        notes: createdClient.notes || '',
        source: (data as any).source || 'manual',
      })
      return { client: createdClient, attendance }
    } catch (attErr) {
      console.error('Error creating initial attendance for new client:', attErr)
      throw new Error('Cliente criado, mas falha ao vincular atendimento inicial. Tente novamente.')
    }
  },

  /**
   * Alias explícito para criação de novo atendimento para cliente existente.
   * Não duplica o registro de cliente e delega para o attendancesService.createForClient.
   */
  async createAttendanceForExistingClient(
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
    return attendancesService.createForClient(clientId, data)
  },

  /**
   * Alias compatível com chamadas legadas de create(data)
   * Redireciona com segurança para createClientWithInitialAttendance
   */
  async create(data: Partial<Client>): Promise<Client> {
    const result = await this.createClientWithInitialAttendance(data)
    return result.client
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
