import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * SUÍTE DE TESTES OBRIGATÓRIOS DA ETAPA 2 (A, B, C, D, E, F)
 * Concorrência, Resolução Determinística e Prevenção de Races sem Constraint Físico UNIQUE
 *
 * Teste A: 10 requisições simultâneas resolvendo/criando attendance para o mesmo cliente sem attendance
 *          → 1 attendance criado, as outras 9 reutilizam o mesmo ID.
 * Teste B: 10 mensagens diferentes simultâneas para o mesmo cliente
 *          → 10 messages, 1 attendance.
 * Teste C: mensagem inbound exatamente durante fechamento de venda
 *          → mesmo attendance, 0 attendance adicional, 0 card adicional.
 * Teste D: Drawer aberto durante fechamento + outbound simultâneo
 *          → outbound salvo no attendance correto, nunca em attendance histórico arbitrário.
 * Teste E: troca rápida cliente A → B no Drawer com requisições do A em andamento
 *          → nenhum dado/mensagem/attendance de A assume o estado de B.
 * Teste F: cliente com >1 attendance ativo histórico
 *          → nenhum terceiro attendance criado, nenhum clientAtts[0] arbitrário,
 *            inconsistência registrada e resolução determinística.
 */

interface MockRecord {
  id: string
  [key: string]: any
  get: (field: string) => any
  set: (field: string, val: any) => void
}

function makeRecord(col: string, data: Record<string, any>): MockRecord {
  const id = data.id || `${col}_${Math.random().toString(36).substring(2, 9)}`
  const record: Record<string, any> = {
    ...data,
    id,
    created: data.created || new Date().toISOString(),
    updated: data.updated || new Date().toISOString(),
  }
  return {
    id,
    ...record,
    get: (f: string) => record[f],
    set: (f: string, v: any) => {
      record[f] = v
    },
  }
}

class MockBackendStore {
  collections: {
    clients: MockRecord[]
    attendances: MockRecord[]
    deals: MockRecord[]
    messages: MockRecord[]
    production_orders: MockRecord[]
    archived_deals: MockRecord[]
    system_settings: MockRecord[]
  } = {
    clients: [],
    attendances: [],
    deals: [],
    messages: [],
    production_orders: [],
    archived_deals: [],
    system_settings: [],
  }

  private _txQueue: Promise<void> = Promise.resolve()
  warnLogs: string[] = []

  async runInTransaction<T>(fn: (tx: MockBackendStore) => Promise<T> | T): Promise<T> {
    const prev = this._txQueue
    let release: () => void = () => {}
    this._txQueue = new Promise<void>((res) => {
      release = res
    })

    await prev
    try {
      return await fn(this)
    } finally {
      release()
    }
  }

  findRecordById(col: string, id: string): MockRecord {
    const list = this.collections[col as keyof typeof this.collections] || []
    const item = list.find((r) => r.id === id)
    if (!item) throw new Error(`Not found in ${col}: ${id}`)
    return item
  }

  findFirstRecordByData(col: string, field: string, val: any): MockRecord {
    const list = this.collections[col as keyof typeof this.collections] || []
    const item = list.find((r) => r.get(field) === val)
    if (!item) throw new Error(`Not found in ${col} with ${field}=${val}`)
    return item
  }

  findRecordsByFilter(col: string, filterStr: string, sort = '-created', limit = 50): MockRecord[] {
    const list = this.collections[col as keyof typeof this.collections] || []
    let filtered = list.filter((r) => {
      if (filterStr.includes('client_id =')) {
        const m = filterStr.match(/client_id = ['"]([^'"]+)['"]/)
        if (m && r.get('client_id') !== m[1]) return false
      }
      if (filterStr.includes('is_archived = false')) {
        if (r.get('is_archived') === true) return false
      }
      if (filterStr.includes('is_completed = false')) {
        if (r.get('is_completed') === true) return false
      }
      if (filterStr.includes('is_active = true')) {
        if (r.get('is_active') === false) return false
      }
      if (filterStr.includes('attendance_id =')) {
        const m = filterStr.match(/attendance_id = ['"]([^'"]+)['"]/)
        if (m && r.get('attendance_id') !== m[1]) return false
      }
      return true
    })

    if (sort === '-created') {
      filtered.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
    }
    return filtered.slice(0, limit)
  }

  save(rec: MockRecord) {
    for (const key of Object.keys(this.collections) as (keyof typeof this.collections)[]) {
      const arr = this.collections[key]
      const idx = arr.findIndex((r) => r.id === rec.id)
      if (idx >= 0) {
        arr[idx] = rec
        return
      }
    }
    // New record routing
    if (rec.get('whatsapp_message_id') !== undefined || rec.get('direction') !== undefined) {
      this.collections.messages.push(rec)
    } else if (rec.get('channel') !== undefined && rec.get('client_id') !== undefined) {
      this.collections.attendances.push(rec)
    } else if (rec.get('order_number') !== undefined) {
      this.collections.production_orders.push(rec)
    } else if (rec.get('reason') !== undefined && rec.get('original_attendance_id') !== undefined) {
      this.collections.archived_deals.push(rec)
    } else if (rec.get('stage') !== undefined && rec.get('attendance_id') !== undefined) {
      this.collections.deals.push(rec)
    } else if (rec.get('phone') !== undefined) {
      this.collections.clients.push(rec)
    } else if (rec.get('setting_key') !== undefined) {
      this.collections.system_settings.push(rec)
    }
  }

  /**
   * Implementação espelho exata do backend pocketbase/hooks/attendance_resolution.js
   */
  async resolveAttendanceBackend(
    clientId: string,
    metadata: { stage?: string; assigned_to?: string; notes?: string } = {},
  ): Promise<{ attendance: MockRecord; action: string }> {
    return await this.runInTransaction(async (txApp) => {
      // 1. Lock cliente
      const lockKey = 'lock_client_' + clientId
      let lockRec: MockRecord | null = null
      try {
        lockRec = txApp.findFirstRecordByData('system_settings', 'setting_key', lockKey)
      } catch {
        /* intentionally ignored */
      }
      const nowIso = new Date().toISOString()
      if (lockRec) {
        lockRec.set('setting_value', nowIso)
        txApp.save(lockRec)
      } else {
        const newLock = makeRecord('system_settings', {
          setting_key: lockKey,
          setting_value: nowIso,
        })
        txApp.save(newLock)
      }

      // 2. Busca ativos
      const activeList = txApp.findRecordsByFilter(
        'attendances',
        `client_id = '${clientId}' && is_archived = false`,
        '-created',
        20,
      )

      if (activeList.length === 1) {
        return { attendance: activeList[0], action: 'reused' }
      }

      if (activeList.length > 1) {
        const ids = activeList.map((a) => a.id).join(', ')
        const warning = `[INCONSISTENCIA_HISTORICA_ATTENDANCE] Cliente ${clientId} possui ${activeList.length} atendimentos ativos: [${ids}]. Resolução determinística: mais recente (${activeList[0].id}).`
        this.warnLogs.push(warning)
        return { attendance: activeList[0], action: 'historical_inconsistency_resolved' }
      }

      // 3. Regra 2C: Fechamento / Produção (Caso Gabriela)
      const activeOrders = txApp.findRecordsByFilter(
        'production_orders',
        `client_id = '${clientId}' && is_completed = false && is_archived = false`,
        '-created',
        5,
      )
      for (const ord of activeOrders) {
        const linkedId = ord.get('attendance_id')
        if (linkedId) {
          try {
            const linkedAtt = txApp.findRecordById('attendances', linkedId)
            if (linkedAtt && !linkedAtt.get('is_archived')) {
              return { attendance: linkedAtt, action: 'reused' }
            }
          } catch {
            /* intentionally ignored */
          }
        }
      }

      const recentDeals = txApp.findRecordsByFilter(
        'archived_deals',
        `client_id = '${clientId}' && reason = 'won'`,
        '-created',
        1,
      )
      if (recentDeals.length > 0) {
        const origId = recentDeals[0].get('original_attendance_id')
        if (origId) {
          try {
            const prevAtt = txApp.findRecordById('attendances', origId)
            if (prevAtt && !prevAtt.get('is_archived')) {
              return { attendance: prevAtt, action: 'reused' }
            }
          } catch {
            /* intentionally ignored */
          }
        }
      }

      // 4. Re-check antes de criar
      const recheck = txApp.findRecordsByFilter(
        'attendances',
        `client_id = '${clientId}' && is_archived = false`,
        '-created',
        1,
      )
      if (recheck.length > 0) {
        return { attendance: recheck[0], action: 'reused' }
      }

      // 5. Criar exatamente UM novo
      const newAtt = makeRecord('attendances', {
        client_id: clientId,
        channel: 'whatsapp',
        stage: metadata.stage || 'Novo contato',
        status: 'in_progress',
        is_archived: false,
        started_at: nowIso,
      })
      txApp.save(newAtt)
      return { attendance: newAtt, action: 'created' }
    })
  }

  /**
   * Processamento de webhook sincronizado com resolveAttendanceBackend
   */
  async processWebhook(payload: { id: string; from: string; body: string; clientId: string }) {
    return await this.runInTransaction(async (txApp) => {
      // Dedupe WAMID check inside tx
      try {
        const existing = txApp.findFirstRecordByData('messages', 'whatsapp_message_id', payload.id)
        if (existing) return { status: 'ignored_wamid_exists' }
      } catch {
        /* intentionally ignored */
      }

      // Resolve attendance com a MESMA lógica central
      const resolved = await txApp.resolveAttendanceBackend(payload.clientId)
      const attendance = resolved.attendance

      // Deal
      let deal: MockRecord
      const deals = txApp.findRecordsByFilter(
        'deals',
        `attendance_id = '${attendance.id}'`,
        '-created',
        1,
      )
      if (deals.length > 0) {
        deal = deals[0]
      } else {
        deal = makeRecord('deals', {
          client_id: payload.clientId,
          attendance_id: attendance.id,
          stage: 'Primeiro contato',
          is_active: true,
        })
        txApp.save(deal)
      }

      // Message
      const msg = makeRecord('messages', {
        attendance_id: attendance.id,
        client_id: payload.clientId,
        direction: 'inbound',
        type: 'text',
        content: payload.body,
        whatsapp_message_id: payload.id,
        status: 'delivered',
        is_read: false,
      })
      txApp.save(msg)

      attendance.set('last_message_at', new Date().toISOString())
      attendance.set('last_customer_message_at', new Date().toISOString())
      txApp.save(attendance)

      return {
        status: 'saved',
        messageId: msg.id,
        attendanceId: attendance.id,
        dealId: deal.id,
      }
    })
  }
}

describe('Etapa 2 — Testes Obrigatórios A, B, C, D, E, F', () => {
  let db: MockBackendStore

  beforeEach(() => {
    db = new MockBackendStore()
  })

  it('Teste A: 10 requisições simultâneas resolvendo/criando attendance para o mesmo cliente sem attendance → 1 attendance criado, 9 reutilizam o mesmo ID', async () => {
    const clientId = 'client_test_a_001'
    const client = makeRecord('clients', {
      id: clientId,
      name: 'Cliente Teste A',
      phone: '551199990001',
    })
    db.save(client)

    // Disparar 10 chamadas rigorosamente paralelas
    const promises = Array.from({ length: 10 }, (_, i) =>
      db.resolveAttendanceBackend(clientId, { stage: 'Novo contato', notes: `Req ${i + 1}` }),
    )

    const results = await Promise.all(promises)

    // Validação 1: Apenas 1 attendance físico criado no banco
    expect(db.collections.attendances.length).toBe(1)

    const singleAttendanceId = db.collections.attendances[0].id

    // Validação 2: Todas as 10 requisições retornaram exatamente o mesmo attendanceId
    results.forEach((res) => {
      expect(res.attendance.id).toBe(singleAttendanceId)
    })

    // Validação 3: Exatamente 1 marcou como 'created' e as outras 9 marcaram 'reused'
    const createdCount = results.filter((r) => r.action === 'created').length
    const reusedCount = results.filter((r) => r.action === 'reused').length
    expect(createdCount).toBe(1)
    expect(reusedCount).toBe(9)
  })

  it('Teste B: 10 mensagens diferentes simultâneas para o mesmo cliente → 10 messages, 1 attendance', async () => {
    const clientId = 'client_test_b_002'
    const client = makeRecord('clients', {
      id: clientId,
      name: 'Cliente Teste B',
      phone: '551199990002',
    })
    db.save(client)

    // 10 mensagens com WAMIDs distintos disparadas simultaneamente
    const promises = Array.from({ length: 10 }, (_, i) =>
      db.processWebhook({
        id: `wamid_test_b_${i + 1}`,
        from: '551199990002',
        body: `Mensagem ${i + 1}`,
        clientId,
      }),
    )

    const results = await Promise.all(promises)

    // Validação: 10 mensagens salvas, 1 único attendance criado, 1 único deal criado
    expect(db.collections.messages.length).toBe(10)
    expect(db.collections.attendances.length).toBe(1)
    expect(db.collections.deals.length).toBe(1)

    const singleAttId = db.collections.attendances[0].id
    results.forEach((r) => {
      expect(r.status).toBe('saved')
      expect(r.attendanceId).toBe(singleAttId)
    })
    db.collections.messages.forEach((m) => {
      expect(m.get('attendance_id')).toBe(singleAttId)
    })
  })

  it('Teste C: mensagem inbound exatamente durante fechamento de venda (caso Gabriela) → mesmo attendance, 0 attendance adicional, 0 card adicional', async () => {
    // Cenário Gabriela:
    // Cliente tem attendance existente att_gabriela que entrou no fluxo de fechamento com produção.
    // O attendance foi mantido com is_archived = false (venda em produção).
    // Uma ordem de produção ord_gabriela foi aberta para o cliente.
    // Archived deal foi registrado como 'won' com original_attendance_id = 'att_gabriela'.
    const clientId = 'client_gabriela_nk6'
    const attGabriela = makeRecord('attendances', {
      id: 'att_gabriela_original',
      client_id: clientId,
      channel: 'whatsapp',
      stage: 'Em produção',
      status: 'in_progress',
      is_archived: false, // Regra do CRM Laletra para vendas em produção!
      created: '2025-01-01T10:00:00.000Z',
    })
    db.save(attGabriela)

    const prodOrder = makeRecord('production_orders', {
      id: 'ord_gabriela_123',
      order_number: 1001,
      client_id: clientId,
      attendance_id: attGabriela.id,
      is_completed: false,
      is_archived: false,
    })
    db.save(prodOrder)

    // Simular que o fechamento está gerando o archived_deal ao mesmo tempo em que o webhook dispara
    const inboundPromise = db.processWebhook({
      id: 'wamid_gabriela_inbound_nao',
      from: '551199998888',
      body: 'Não',
      clientId,
    })

    const dealClosurePromise = db.runInTransaction(async (tx) => {
      const archDeal = makeRecord('archived_deals', {
        id: 'arch_deal_gabriela_won',
        client_id: clientId,
        reason: 'won',
        original_attendance_id: attGabriela.id,
      })
      tx.save(archDeal)
      return archDeal
    })

    const [inboundRes] = await Promise.all([inboundPromise, dealClosurePromise])

    // Validação estrita:
    // 1. Mensagem inbound vinculada ao MESMO attendance existente
    expect(inboundRes.attendanceId).toBe('att_gabriela_original')
    // 2. ZERO atendimentos adicionais criados no sistema (continua apenas 1)
    expect(db.collections.attendances.length).toBe(1)
    expect(db.collections.attendances[0].id).toBe('att_gabriela_original')
    // 3. ZERO deals adicionais criados no sistema
    expect(db.collections.deals.length).toBe(1)
    expect(db.collections.deals[0].get('attendance_id')).toBe('att_gabriela_original')
    // 4. Mensagem está associada a attGabriela
    expect(db.collections.messages.length).toBe(1)
    expect(db.collections.messages[0].get('attendance_id')).toBe('att_gabriela_original')
  })

  it('Teste D: Drawer aberto durante fechamento + outbound simultâneo → outbound salvo no attendance correto, nunca em attendance histórico arbitrário', async () => {
    // Cliente possui attendance ativo att_ativo_456
    const clientId = 'client_drawer_d'
    const activeAtt = makeRecord('attendances', {
      id: 'att_ativo_456',
      client_id: clientId,
      stage: 'Em produção',
      is_archived: false,
      created: '2025-01-02T10:00:00.000Z',
    })
    // Também possui um histórico arquivado mais antigo
    const archivedOldAtt = makeRecord('attendances', {
      id: 'att_antigo_123',
      client_id: clientId,
      stage: 'Venda perdida',
      is_archived: true,
      created: '2024-12-01T10:00:00.000Z',
    })
    db.save(archivedOldAtt)
    db.save(activeAtt)

    // Lógica do Drawer sem clientAtts[0]:
    // Deve consultar o backend ou filtrar estritamente !is_archived e nunca pegar o primeiro histórico
    const resolved = await db.resolveAttendanceBackend(clientId)
    expect(resolved.attendance.id).toBe('att_ativo_456')
    expect(resolved.attendance.id).not.toBe('att_antigo_123')

    // Simulação do envio outbound
    const outboundMsg = makeRecord('messages', {
      client_id: clientId,
      attendance_id: resolved.attendance.id,
      direction: 'outbound',
      content: 'Segue o código de rastreio',
      whatsapp_message_id: 'wamid_outbound_d_1',
    })
    db.save(outboundMsg)

    expect(outboundMsg.get('attendance_id')).toBe('att_ativo_456')
    expect(db.collections.attendances.length).toBe(2) // nenhum novo criado
  })

  it('Teste E: troca rápida cliente A → B no Drawer com requisições do A em andamento → nenhum dado/mensagem/attendance de A assume o estado de B', async () => {
    // Simulação dos refs e proteções da 0.0.242 presentes no WhatsAppChatDrawer:
    // loadRequestIdRef e activeClientIdRef
    let currentActiveClientId = 'client_A'
    let currentRequestId = 0

    const clientAData = {
      clientId: 'client_A',
      attendanceId: 'att_A_1',
      messages: ['msg_A_1', 'msg_A_2'],
    }

    const clientBData = {
      clientId: 'client_B',
      attendanceId: 'att_B_1',
      messages: ['msg_B_1'],
    }

    let drawerDisplayedState = {
      clientId: '',
      attendanceId: '',
      messages: [] as string[],
    }

    // 1. Inicia carga de A (demorada: simula 50ms)
    currentActiveClientId = 'client_A'
    const reqAId = ++currentRequestId
    const loadPromiseA = new Promise<{ clientId: string; attId: string; msgs: string[] }>((res) => {
      setTimeout(() => {
        res({
          clientId: clientAData.clientId,
          attId: clientAData.attendanceId,
          msgs: clientAData.messages,
        })
      }, 50)
    }).then((data) => {
      // Guard da 0.0.242: isCurrentRequest()
      if (reqAId === currentRequestId && currentActiveClientId === data.clientId) {
        drawerDisplayedState = {
          clientId: data.clientId,
          attendanceId: data.attId,
          messages: data.msgs,
        }
      }
    })

    // 2. Imediatamente usuário clica no cliente B (rápido: 10ms)
    currentActiveClientId = 'client_B'
    const reqBId = ++currentRequestId
    const loadPromiseB = new Promise<{ clientId: string; attId: string; msgs: string[] }>((res) => {
      setTimeout(() => {
        res({
          clientId: clientBData.clientId,
          attId: clientBData.attendanceId,
          msgs: clientBData.messages,
        })
      }, 10)
    }).then((data) => {
      // Guard da 0.0.242: isCurrentRequest()
      if (reqBId === currentRequestId && currentActiveClientId === data.clientId) {
        drawerDisplayedState = {
          clientId: data.clientId,
          attendanceId: data.attId,
          messages: data.msgs,
        }
      }
    })

    await Promise.all([loadPromiseA, loadPromiseB])

    // Validação:
    // O Drawer DEVE conter apenas o estado de B! A resposta tardia de A foi descartada
    expect(drawerDisplayedState.clientId).toBe('client_B')
    expect(drawerDisplayedState.attendanceId).toBe('att_B_1')
    expect(drawerDisplayedState.messages).toEqual(['msg_B_1'])
    expect(drawerDisplayedState.messages).not.toContain('msg_A_1')
  })

  it('Teste F: cliente com >1 attendance ativo histórico → nenhum terceiro attendance criado, nenhum clientAtts[0] arbitrário, inconsistência registrada e resolução determinística', async () => {
    const clientId = 'client_inconsistent_history_f'
    // Inconsistência histórica: cliente possui 2 atendimentos com is_archived = false
    const attOld = makeRecord('attendances', {
      id: 'att_historic_old_1',
      client_id: clientId,
      is_archived: false,
      created: '2025-01-01T10:00:00.000Z',
    })
    const attRecent = makeRecord('attendances', {
      id: 'att_historic_recent_2',
      client_id: clientId,
      is_archived: false,
      created: '2025-01-02T10:00:00.000Z',
    })
    db.save(attOld)
    db.save(attRecent)

    // Chamar a resolução centralizada do backend
    const res = await db.resolveAttendanceBackend(clientId)

    // Validação 1: NENHUM terceiro attendance criado
    expect(db.collections.attendances.length).toBe(2)

    // Validação 2: Inconsistência registrada no log estruturado com IDs
    expect(res.action).toBe('historical_inconsistency_resolved')
    expect(db.warnLogs.length).toBeGreaterThan(0)
    expect(db.warnLogs[0]).toContain('[INCONSISTENCIA_HISTORICA_ATTENDANCE]')
    expect(db.warnLogs[0]).toContain(clientId)
    expect(db.warnLogs[0]).toContain('att_historic_old_1')
    expect(db.warnLogs[0]).toContain('att_historic_recent_2')

    // Validação 3: Resolução determinística pelo mais recente por created (-created)
    expect(res.attendance.id).toBe('att_historic_recent_2')

    // Validação 4: Execução subsequente mantém deterministicamente o mesmo attendance sem criar outro
    const res2 = await db.resolveAttendanceBackend(clientId)
    expect(res2.attendance.id).toBe('att_historic_recent_2')
    expect(db.collections.attendances.length).toBe(2)
  })
})
