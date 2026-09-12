import pb from '@/lib/pocketbase/client'
import type { Attendance, Client, KanbanStage, PublicClientProfileData } from '@/types/crm'
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
  /**
   * Retorna a URL pública para o cliente visualizar/preencher seu próprio cadastro
   */
  getPublicClientUrl(client: Client | { public_token?: string; id?: string }): string {
    const token = client.public_token
    if (!token || typeof token !== 'string' || token.trim() === '') return ''
    const origin =
      typeof window !== 'undefined' && window.location.origin ? window.location.origin : ''
    return `${origin}/cadastro/${token.trim()}`
  },

  /**
   * Garante que um cliente tenha public_token (gera se não possuir)
   */
  async ensurePublicToken(client: Client): Promise<Client> {
    if (client.public_token && client.public_token.trim() !== '') {
      return client
    }
    const token =
      'ctk_' +
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15) +
      Date.now().toString(36)
    return await pb.collection('clients').update<Client>(client.id, { public_token: token })
  },

  /**
   * Obtém os dados cadastrais seguros através do public_token (endpoint público sem auth)
   */
  async getByPublicToken(token: string): Promise<PublicClientProfileData> {
    const res = await pb.send<{ data: PublicClientProfileData }>(
      `/backend/v1/public/clients/${encodeURIComponent(token.trim())}`,
      {
        method: 'GET',
      },
    )
    return res.data
  },

  /**
   * Atualiza os dados cadastrais através do public_token (endpoint público sem auth, com whitelist rígida)
   */
  async updateByPublicToken(
    token: string,
    payload: Partial<PublicClientProfileData>,
  ): Promise<{ success: boolean; message: string; data: PublicClientProfileData }> {
    return await pb.send<{ success: boolean; message: string; data: PublicClientProfileData }>(
      `/backend/v1/public/clients/${encodeURIComponent(token.trim())}`,
      {
        method: 'POST',
        body: payload,
      },
    )
  },

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
   * Utiliza consulta direta pelo campo `normalized_phone` e fallback em memória.
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
      // 1. Tentar busca indexada direta pelo campo normalized_phone
      let matched: Client | null = null
      try {
        const directMatches = await pb.collection('clients').getFullList<Client>({
          filter: `normalized_phone = "${norm}"`,
          requestKey: null,
        })
        if (directMatches.length > 0) {
          const nonMerged = directMatches.filter((c) => !this.extractCanonicalId(c))
          matched = nonMerged.length > 0 ? nonMerged[0] : directMatches[0]
        }
      } catch (directErr) {
        console.warn(
          'Direct query by normalized_phone failed, falling back to full list scan:',
          directErr,
        )
      }

      // 2. Fallback de varredura se busca indexada não retornou (ou se houver registros legados)
      if (!matched) {
        const allClients = await pb.collection('clients').getFullList<Client>({
          requestKey: null,
        })

        const matchedClients = allClients.filter((c) => {
          const cNorm = c.normalized_phone || normalizePhone(c.phone)
          return (
            cNorm &&
            (cNorm === norm || (cNorm === `merged_${c.id}` && normalizePhone(c.phone) === norm))
          )
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

        const nonMerged = matchedClients.filter((c) => !this.extractCanonicalId(c))
        matched = nonMerged.length > 0 ? nonMerged[0] : matchedClients[0]
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
      'birth_date',
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
   * Cria CLIENT NOVO + ATENDIMENTO INICIAL com proteção centralizada contra duplicidade e concorrência.
   * Se o telefone já existir ou se houver corrida concorrente (UNIQUE constraint no backend),
   * NÃO duplica: reutiliza o cliente canônico existente e cria o atendimento solicitado vinculado.
   * Não exibe erro de duplicidade ao usuário quando for apenas corrida de concorrência.
   */
  async createClientWithInitialAttendance(
    data: Partial<Client>,
  ): Promise<{ client: Client; attendance: Attendance }> {
    const rawPhone = data.phone || ''
    const norm = normalizePhone(rawPhone)

    // 1 & 2. Normalizar telefone e verificar se cliente já existe pelo normalized_phone
    if (norm && norm.length >= 8) {
      const searchResult = await this.findByNormalizedPhone(rawPhone)
      if (searchResult.canonicalClient) {
        const existingClient = searchResult.canonicalClient
        return this.attachAttendanceToClient(existingClient, data)
      }
    }

    // 4. Tentativa de criação de cliente novo
    const sanitizedData = this.sanitizeDateFields(data as Record<string, any>)
    const clientPayload: Record<string, any> = {
      ...sanitizedData,
      normalized_phone: norm && norm.length >= 8 ? norm : '',
      is_archived: false,
      has_returned: false,
      total_purchases: 0,
      total_purchase_value: 0,
    }

    let createdClient: Client
    try {
      createdClient = await pb.collection('clients').create<Client>(clientPayload)
    } catch (createErr: any) {
      // 5. Se o CREATE falhar por conflito de UNIQUE ou erro de validação de duplicidade (outra requisição venceu a corrida):
      const errStr = JSON.stringify(
        createErr?.data || createErr?.response || createErr?.message || '',
      )
      const isUniqueOrDuplicate =
        createErr?.status === 400 ||
        createErr?.status === 409 ||
        errStr.toLowerCase().includes('unique') ||
        errStr.toLowerCase().includes('normalized_phone') ||
        errStr.toLowerCase().includes('phone')

      if (isUniqueOrDuplicate && norm && norm.length >= 8) {
        console.info(
          `[Concurrency Protection] Caught potential duplicate/race condition for normalized_phone ${norm}. Resolving existing canonical client...`,
        )
        // 5 & 6. Buscar novamente pelo normalized_phone e reutilizar o client vencedor
        const retryResult = await this.findByNormalizedPhone(rawPhone)
        if (retryResult.canonicalClient) {
          return this.attachAttendanceToClient(retryResult.canonicalClient, data)
        }
      }

      // Se não foi erro de unicidade recuperável ou não encontrou, repassa o erro
      console.error('Error creating client in PocketBase:', createErr)
      throw createErr
    }

    // 7. Criar atendimento inicial vinculado ao cliente recém-criado
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
   * Auxiliar interno para vincular novo atendimento a um cliente existente,
   * atualizando dados opcionais (nome/e-mail) de forma segura.
   */
  async attachAttendanceToClient(
    client: Client,
    data: Partial<Client>,
  ): Promise<{ client: Client; attendance: Attendance }> {
    const attendance = await attendancesService.createForClient(client.id, {
      stage: (data.stage as KanbanStage) || 'Novo contato',
      assigned_to: data.assigned_to || client.assigned_to || '',
      product_interest: data.product_interest || '',
      quote_value: data.quote_value || 0,
      notes: data.notes || '',
      source: (data as any).source || 'manual',
    })

    // Atualiza dados opcionais do cliente se fornecidos e reativa caso arquivado (sem duplicar registro)
    const updatePayload: Partial<Client> = {}
    if (client.is_archived) {
      updatePayload.is_archived = false
    }
    if (data.name && data.name.trim() && data.name !== client.name) {
      updatePayload.name = data.name.trim()
    }
    if (data.email && data.email.trim() && !client.email) {
      updatePayload.email = data.email.trim()
    }
    let updatedClient = client
    if (Object.keys(updatePayload).length > 0) {
      try {
        updatedClient = await pb.collection('clients').update<Client>(client.id, updatePayload)
      } catch {
        /* non-fatal */
      }
    }

    return { client: updatedClient, attendance }
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
      'birth_date',
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

    if (sanitizedData.phone !== undefined) {
      const norm = normalizePhone(sanitizedData.phone)
      if (norm && norm.length >= 8) {
        // Se for merged, preserva prefixo merged_
        const isMerged = prev && this.extractCanonicalId(prev)
        if (!isMerged) {
          sanitizedData.normalized_phone = norm
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

  /**
   * Exclusão segura por SOFT-DELETE:
   * Marca `is_archived = true` sem apagar fisicamente o registro.
   * Oculta o cliente da lista padrão sem apagar mensagens, atendimentos,
   * orçamentos ou histórico. Se voltar a mandar mensagem pelo mesmo telefone,
   * o cliente é reativado automaticamente sem duplicar.
   */
  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('clients').update(id, {
        is_archived: true,
      })
      return true
    } catch (error) {
      console.error(`Error soft-deleting client ${id}:`, error)
      return false
    }
  },

  /**
   * Reativa um cliente arquivado (soft-delete revertido).
   */
  async reactivate(id: string): Promise<Client> {
    return this.update(id, { is_archived: false })
  },

  /**
   * Run automated archiving check based on configured hours for closed attendances/deals
   */
  async runAutoArchiveCheck(wonHours = 24, lostHours = 24, force = false): Promise<number> {
    // Delegate to attendancesService
    return attendancesService.runAutoArchiveCheck(wonHours, lostHours, force)
  },
}
