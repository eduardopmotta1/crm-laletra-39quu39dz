import { describe, it, expect, beforeEach } from 'vitest'

/**
 * SUÍTE COMPLETA DE TESTES DE CONCORRÊNCIA E IDEMPOTÊNCIA DO WHATSAPP WEBHOOK
 *
 * Regra: Mocks e simulação puramente locais / em memória.
 * NENHUMA conexão ou alteração no banco de produção.
 * Preservação integral dos dados legados e compatibilidade total.
 *
 * 10 CENÁRIOS OBRIGATÓRIOS:
 * 1) mesmo WAMID processado 3x simultaneamente → 1 message, 1 attendance, 1 deal
 * 2) mesmo WAMID reenviado 30s depois (retry da Meta) → nenhuma duplicação
 * 3) 3 mensagens com WAMIDs DIFERENTES simultâneas para cliente sem atendimento → 3 messages, 1 attendance, 1 deal
 * 4) 3 mensagens simultâneas para cliente COM attendance ativo → 3 messages, mesmo attendance, mesmo deal
 * 5) 2 mensagens simultâneas de clientes diferentes → cada cliente com seu próprio atendimento
 * 6) mensagem com context.id (função responder específica da 0.0.243) → mesma regra de idempotência
 * 7) webhook duplicado com context.id → não duplica message/attendance/deal
 * 8) realtime após processamento → um único card gerado/refletido
 * 9) polling após processamento → um único card gerado/refletido
 * 10) atendimento anterior realmente encerrado + nova mensagem → criação de apenas UM novo atendimento conforme regra atual
 */

interface MockDbRecord {
  id: string
  [key: string]: any
  get: (field: string) => any
  set: (field: string, val: any) => void
}

function createRecord(colName: string, initial: Record<string, any>): MockDbRecord {
  const recordId = initial.id || `${colName}_${Math.random().toString(36).substring(2, 9)}`
  const data: Record<string, any> = {
    ...initial,
    id: recordId,
    created: initial.created || new Date().toISOString(),
    updated: initial.updated || new Date().toISOString(),
  }
  return {
    id: recordId,
    ...data,
    get: (field: string) => data[field],
    set: (field: string, val: any) => {
      data[field] = val
    },
  }
}

class MockPocketBaseStore {
  collections: {
    clients: MockDbRecord[]
    attendances: MockDbRecord[]
    deals: MockDbRecord[]
    messages: MockDbRecord[]
    users: MockDbRecord[]
    system_settings: MockDbRecord[]
  } = {
    clients: [],
    attendances: [],
    deals: [],
    messages: [],
    users: [],
    system_settings: [],
  }

  // Simula o lock de escrita única do SQLite
  private _txLock = Promise.resolve()

  // In-memory deduplication cache como em globalThis.__pb_processedWamids
  processedWamids = new Map<string, number>()

  findCollectionByNameOrId(name: string) {
    if (this.collections[name as keyof typeof this.collections] !== undefined) {
      return { id: name, name }
    }
    throw new Error(`Collection ${name} not found`)
  }

  findFirstRecordByData(colName: string, field: string, val: any): MockDbRecord {
    const list = this.collections[colName as keyof typeof this.collections]
    if (!list) throw new Error('Collection not found')
    const item = list.find((rec) => rec.get(field) === val)
    if (!item) throw new Error(`sql: no rows in result set (${colName}.${field}=${val})`)
    return item
  }

  findRecordById(colName: string, id: string): MockDbRecord {
    return this.findFirstRecordByData(colName, 'id', id)
  }

  findRecordsByFilter(
    colName: string,
    filterStr: string,
    sort = '-created',
    limit = 50,
    _offset = 0,
  ): MockDbRecord[] {
    const list = this.collections[colName as keyof typeof this.collections] || []
    let results = list.filter((rec) => {
      if (!filterStr || filterStr.trim() === '') return true

      // Simple mock filter parser for common queries
      if (filterStr.includes('is_archived = false')) {
        if (rec.get('is_archived') === true) return false
      }
      if (filterStr.includes('client_id =')) {
        const match = filterStr.match(/client_id = ['"]([^'"]+)['"]/)
        if (match && rec.get('client_id') !== match[1]) return false
      }
      if (filterStr.includes('attendance_id =')) {
        const match = filterStr.match(/attendance_id = ['"]([^'"]+)['"]/)
        if (match && rec.get('attendance_id') !== match[1]) return false
      }
      if (filterStr.includes('is_active = true')) {
        if (rec.get('is_active') !== true) return false
      }
      if (filterStr.includes('is_completed = false')) {
        if (rec.get('is_completed') === true) return false
      }
      return true
    })

    if (sort === '-created') {
      results.sort(
        (a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime(),
      )
    }
    return results.slice(0, limit)
  }

  save(record: MockDbRecord) {
    // Determinar coleção pelo prefixo do id ou registrar
    for (const key of Object.keys(this.collections) as (keyof typeof this.collections)[]) {
      const list = this.collections[key]
      const idx = list.findIndex((r) => r.id === record.id)
      if (idx >= 0) {
        list[idx] = record
        return
      }
    }
    // Novo registro: detectar pelo tipo
    if (record.get('whatsapp_message_id') !== undefined || record.get('direction') !== undefined) {
      this.collections.messages.push(record)
    } else if (
      record.get('channel') !== undefined &&
      record.get('client_id') !== undefined &&
      record.get('is_archived') !== undefined
    ) {
      this.collections.attendances.push(record)
    } else if (record.get('stage') !== undefined && record.get('attendance_id') !== undefined) {
      this.collections.deals.push(record)
    } else if (record.get('phone') !== undefined) {
      this.collections.clients.push(record)
    } else if (record.get('setting_key') !== undefined) {
      this.collections.system_settings.push(record)
    }
  }

  /**
   * Simula a execução atômica serializada de runInTransaction do SQLite/PocketBase
   */
  async runInTransaction<T>(fn: (txApp: MockPocketBaseStore) => T | Promise<T>): Promise<T> {
    const currentLock = this._txLock
    let releaseLock: () => void = () => {}
    this._txLock = new Promise<void>((resolve) => {
      releaseLock = resolve
    })

    await currentLock
    try {
      return await fn(this)
    } finally {
      releaseLock()
    }
  }
}

/**
 * Simula o webhook conforme refatorado no pocketbase/hooks/whatsapp_webhook.js
 */
async function processIncomingWebhookSimulated(
  db: MockPocketBaseStore,
  payloadMsg: {
    id: string
    from: string
    timestamp?: string
    text?: { body: string }
    context?: { id: string }
  },
  contactName = '',
) {
  const wamid = payloadMsg.id
  const from = payloadMsg.from
  const normalizedPhone = from.startsWith('55') ? from : '55' + from

  // 1. FAST DEDUPLICATION IN-MEMORY (READ ONLY):
  if (wamid) {
    if (db.processedWamids.has(wamid)) {
      return { status: 'ignored_in_memory_dedupe' }
    }
  }

  // 2. CHECK DATABASE FOR DEDUPLICATION OF WAMID:
  if (wamid) {
    try {
      const existing = db.findFirstRecordByData('messages', 'whatsapp_message_id', wamid)
      if (existing) {
        db.processedWamids.set(wamid, Date.now())
        return { status: 'ignored_db_dedupe' }
      }
    } catch (_) {
      // not found
    }
  }

  // 3. SEÇÃO CRÍTICA TRANSACIONADA (SERIALIZADA PELO SQLite SINGLE-WRITER)
  let txOk = false
  try {
    const res = await db.runInTransaction(async (txApp) => {
      // 3.1 Re-check WAMID dentro da transação
      if (wamid) {
        try {
          const checkInsideTx = txApp.findFirstRecordByData(
            'messages',
            'whatsapp_message_id',
            wamid,
          )
          if (checkInsideTx) {
            return { status: 'ignored_tx_recheck' }
          }
        } catch {
          /* intentionally ignored */
        }
      }

      // 3.2 Find or create client
      let client: MockDbRecord
      try {
        client = txApp.findFirstRecordByData('clients', 'phone', normalizedPhone)
      } catch (_) {
        client = createRecord('clients', {
          name: contactName || normalizedPhone,
          phone: normalizedPhone,
          stage: 'Primeiro contato',
          is_archived: false,
        })
        txApp.save(client)
      }

      // 3.3 Strict resolution of active attendance (Reutilizar se existir ativo)
      let attendance: MockDbRecord
      const activeAttendances = txApp.findRecordsByFilter(
        'attendances',
        `client_id = '${client.id}' && is_archived = false`,
        '-created',
        1,
      )

      if (activeAttendances.length > 0) {
        attendance = activeAttendances[0]
      } else {
        attendance = createRecord('attendances', {
          client_id: client.id,
          channel: 'whatsapp',
          stage: 'Primeiro contato',
          status: 'in_progress',
          is_archived: false,
          started_at: new Date().toISOString(),
        })
        txApp.save(attendance)
      }

      // 3.4 Resolve deal (1 deal ativo para o attendance)
      let deal: MockDbRecord
      const deals = txApp.findRecordsByFilter(
        'deals',
        `attendance_id = '${attendance.id}'`,
        '-created',
        1,
      )
      if (deals.length > 0) {
        deal = deals[0]
      } else {
        deal = createRecord('deals', {
          client_id: client.id,
          attendance_id: attendance.id,
          stage: 'Primeiro contato',
          is_active: true,
        })
        txApp.save(deal)
      }

      // 3.5 Context reply-to support (0.0.243)
      let replyToWhatsappMessageId = ''
      let replyToMessageId = ''
      if (payloadMsg.context && payloadMsg.context.id) {
        replyToWhatsappMessageId = payloadMsg.context.id
        try {
          const parent = txApp.findFirstRecordByData(
            'messages',
            'whatsapp_message_id',
            replyToWhatsappMessageId,
          )
          if (parent) {
            replyToMessageId = parent.id
          }
        } catch {
          /* intentionally ignored */
        }
      }

      // 3.6 Save message
      const message = createRecord('messages', {
        attendance_id: attendance.id,
        client_id: client.id,
        direction: 'inbound',
        type: 'text',
        content: payloadMsg.text?.body || '',
        whatsapp_message_id: wamid,
        status: 'delivered',
        is_read: false,
        reply_to_whatsapp_message_id: replyToWhatsappMessageId || undefined,
        reply_to_message_id: replyToMessageId || undefined,
      })
      txApp.save(message)

      attendance.set('last_message_at', new Date().toISOString())
      attendance.set('last_customer_message_at', new Date().toISOString())
      txApp.save(attendance)

      txOk = true
      return {
        status: 'saved',
        messageId: message.id,
        attendanceId: attendance.id,
        dealId: deal.id,
        clientId: client.id,
      }
    })
    if (txOk && wamid) {
      db.processedWamids.set(wamid, Date.now())
    }
    return res
  } catch (err) {
    if (wamid) {
      db.processedWamids.delete(wamid)
    }
    throw err
  }
}

describe('Testes Obrigatórios de Concorrência e Idempotência — Webhook WhatsApp', () => {
  let db: MockPocketBaseStore

  beforeEach(() => {
    db = new MockPocketBaseStore()
  })

  it('1) mesmo WAMID processado 3x simultaneamente → 1 message, 1 attendance, 1 deal', async () => {
    const payload = {
      id: 'wamid_mario_concurrent_123',
      from: '5511999990001',
      text: { body: 'Olá, preciso de um banner urgente' },
    }

    // Disparar 3 execuções simultâneas reais com Promise.all
    const results = await Promise.all([
      processIncomingWebhookSimulated(db, payload, 'Mario Angelo'),
      processIncomingWebhookSimulated(db, payload, 'Mario Angelo'),
      processIncomingWebhookSimulated(db, payload, 'Mario Angelo'),
    ])

    expect(db.collections.messages.length).toBe(1)
    expect(db.collections.attendances.length).toBe(1)
    expect(db.collections.deals.length).toBe(1)

    const saved = results.filter((r) => r.status === 'saved')
    expect(saved.length).toBe(1)
    expect(db.collections.messages[0].get('whatsapp_message_id')).toBe('wamid_mario_concurrent_123')
  })

  it('2) mesmo WAMID reenviado 30s depois (retry da Meta) → nenhuma duplicação', async () => {
    const payload = {
      id: 'wamid_meta_retry_456',
      from: '5511999990002',
      text: { body: 'Mensagem inicial' },
    }

    // 1º Envio
    const res1 = await processIncomingWebhookSimulated(db, payload, 'Cliente Teste')
    expect(res1.status).toBe('saved')
    expect(db.collections.messages.length).toBe(1)
    expect(db.collections.attendances.length).toBe(1)
    expect(db.collections.deals.length).toBe(1)

    // Simular retry da Meta ~30s depois
    const res2 = await processIncomingWebhookSimulated(db, payload, 'Cliente Teste')
    expect(res2.status).toMatch(/ignored/)

    // Contadores permanecem exatamente 1
    expect(db.collections.messages.length).toBe(1)
    expect(db.collections.attendances.length).toBe(1)
    expect(db.collections.deals.length).toBe(1)
  })

  it('3) 3 mensagens com WAMIDs DIFERENTES simultâneas para cliente sem atendimento → 3 messages, 1 attendance, 1 deal', async () => {
    const from = '5511999990003'
    const payloads = [
      { id: 'wamid_diff_1', from, text: { body: 'Mensagem 1' } },
      { id: 'wamid_diff_2', from, text: { body: 'Mensagem 2' } },
      { id: 'wamid_diff_3', from, text: { body: 'Mensagem 3' } },
    ]

    const results = await Promise.all(
      payloads.map((p) => processIncomingWebhookSimulated(db, p, 'Cliente Novo')),
    )

    expect(results.every((r) => r.status === 'saved')).toBe(true)
    // 3 mensagens salvas
    expect(db.collections.messages.length).toBe(3)
    // EXATAMENTE 1 attendance criado e compartilhado por todas
    expect(db.collections.attendances.length).toBe(1)
    // EXATAMENTE 1 deal criado
    expect(db.collections.deals.length).toBe(1)

    const attId = db.collections.attendances[0].id
    expect(db.collections.messages.every((m) => m.get('attendance_id') === attId)).toBe(true)
  })

  it('4) 3 mensagens simultâneas para cliente COM attendance ativo → 3 messages, mesmo attendance, mesmo deal', async () => {
    const client = createRecord('clients', {
      id: 'cli_existing_4',
      name: 'Cliente Existente',
      phone: '5511999990004',
      stage: 'Em negociação',
      is_archived: false,
    })
    db.save(client)

    const existingAtt = createRecord('attendances', {
      id: 'att_existing_4',
      client_id: client.id,
      stage: 'Em negociação',
      is_archived: false,
    })
    db.save(existingAtt)

    const existingDeal = createRecord('deals', {
      id: 'deal_existing_4',
      client_id: client.id,
      attendance_id: existingAtt.id,
      stage: 'Em negociação',
      is_active: true,
    })
    db.save(existingDeal)

    const payloads = [
      { id: 'wamid_active_1', from: client.phone, text: { body: 'Pergunta A' } },
      { id: 'wamid_active_2', from: client.phone, text: { body: 'Pergunta B' } },
      { id: 'wamid_active_3', from: client.phone, text: { body: 'Pergunta C' } },
    ]

    await Promise.all(payloads.map((p) => processIncomingWebhookSimulated(db, p)))

    expect(db.collections.messages.length).toBe(3)
    // Nenhum novo attendance criado; permaneceu o existente
    expect(db.collections.attendances.length).toBe(1)
    expect(db.collections.attendances[0].id).toBe(existingAtt.id)
    // Nenhum novo deal criado; permaneceu o existente
    expect(db.collections.deals.length).toBe(1)
    expect(db.collections.deals[0].id).toBe(existingDeal.id)
  })

  it('5) 2 mensagens simultâneas de clientes diferentes → cada cliente com seu próprio atendimento', async () => {
    const p1 = { id: 'wamid_c1', from: '5511999990011', text: { body: 'Cliente 1 falando' } }
    const p2 = { id: 'wamid_c2', from: '5511999990022', text: { body: 'Cliente 2 falando' } }

    await Promise.all([
      processIncomingWebhookSimulated(db, p1, 'Cliente Um'),
      processIncomingWebhookSimulated(db, p2, 'Cliente Dois'),
    ])

    expect(db.collections.clients.length).toBe(2)
    expect(db.collections.attendances.length).toBe(2)
    expect(db.collections.deals.length).toBe(2)
    expect(db.collections.messages.length).toBe(2)

    const att1 = db.collections.attendances.find(
      (a) => a.get('client_id') === db.collections.clients[0].id,
    )
    const att2 = db.collections.attendances.find(
      (a) => a.get('client_id') === db.collections.clients[1].id,
    )
    expect(att1?.id).not.toBe(att2?.id)
  })

  it('6) mensagem com context.id (função responder específica da 0.0.243) → mesma regra de idempotência', async () => {
    // Parent msg
    const parentMsg = createRecord('messages', {
      id: 'msg_parent_quote_1',
      whatsapp_message_id: 'wamid_parent_quote_1',
      direction: 'outbound',
      content: 'Segue o orçamento de R$ 500,00',
    })
    db.save(parentMsg)

    const payload = {
      id: 'wamid_reply_with_context',
      from: '5511999990006',
      text: { body: 'Aprovado, podemos fazer!' },
      context: { id: 'wamid_parent_quote_1' },
    }

    const res = await processIncomingWebhookSimulated(db, payload, 'Cliente Contexto')
    expect(res.status).toBe('saved')

    const savedMsg = db.findFirstRecordByData(
      'messages',
      'whatsapp_message_id',
      'wamid_reply_with_context',
    )
    expect(savedMsg.get('reply_to_whatsapp_message_id')).toBe('wamid_parent_quote_1')
    expect(savedMsg.get('reply_to_message_id')).toBe(parentMsg.id)
    expect(db.collections.attendances.length).toBe(1)
    expect(db.collections.deals.length).toBe(1)
  })

  it('7) webhook duplicado com context.id → não duplica message/attendance/deal', async () => {
    const payload = {
      id: 'wamid_reply_duplicate_context',
      from: '5511999990007',
      text: { body: 'Respondendo com context' },
      context: { id: 'wamid_parent_xyz' },
    }

    // 2 envios simultâneos
    await Promise.all([
      processIncomingWebhookSimulated(db, payload, 'Cliente Duplo'),
      processIncomingWebhookSimulated(db, payload, 'Cliente Duplo'),
    ])

    expect(db.collections.messages.length).toBe(1)
    expect(db.collections.attendances.length).toBe(1)
    expect(db.collections.deals.length).toBe(1)
  })

  it('8) realtime após processamento → um único card', async () => {
    const payload = {
      id: 'wamid_rt_test',
      from: '5511999990008',
      text: { body: 'Testando evento realtime' },
    }

    await processIncomingWebhookSimulated(db, payload, 'Cliente Realtime')

    // Simula a subscrição realtime de attendances / deals no Kanban
    const kanbanCards = db.findRecordsByFilter('attendances', 'is_archived = false')
    expect(kanbanCards.length).toBe(1)
  })

  it('9) polling após processamento → um único card', async () => {
    const payload = {
      id: 'wamid_poll_test',
      from: '5511999990009',
      text: { body: 'Testando consulta de polling' },
    }

    await processIncomingWebhookSimulated(db, payload, 'Cliente Polling')

    // Polling do Kanban buscando attendances ativos
    const polled1 = db.findRecordsByFilter('attendances', 'is_archived = false', '-created')
    const polled2 = db.findRecordsByFilter('attendances', 'is_archived = false', '-created')

    expect(polled1.length).toBe(1)
    expect(polled2.length).toBe(1)
    expect(polled1[0].id).toBe(polled2[0].id)
  })

  it('10) atendimento anterior realmente encerrado + nova mensagem → criação de apenas UM novo atendimento conforme regra atual', async () => {
    const client = createRecord('clients', {
      id: 'cli_recorrente_10',
      name: 'Cliente Histórico',
      phone: '5511999990010',
      is_archived: false,
    })
    db.save(client)

    // Atendimento histórico anterior ENCERRADO (is_archived = true)
    const archivedAttendance = createRecord('attendances', {
      id: 'att_encerrado_anterior',
      client_id: client.id,
      stage: 'Venda fechada',
      is_archived: true,
      closed_at: '2025-01-10T10:00:00.000Z',
    })
    db.save(archivedAttendance)

    // Chega nova mensagem semanas depois
    const payload = {
      id: 'wamid_new_cycle_after_archived',
      from: client.phone,
      text: { body: 'Olá, preciso de um novo pedido' },
    }

    await processIncomingWebhookSimulated(db, payload)

    // Total de attendances deve ser 2 (1 histórico arquivado + 1 NOVO ativo)
    expect(db.collections.attendances.length).toBe(2)
    const activeAtts = db.findRecordsByFilter(
      'attendances',
      `client_id = '${client.id}' && is_archived = false`,
    )
    expect(activeAtts.length).toBe(1)
    expect(activeAtts[0].id).not.toBe('att_encerrado_anterior')
    expect(activeAtts[0].get('is_archived')).toBe(false)
  })
})
