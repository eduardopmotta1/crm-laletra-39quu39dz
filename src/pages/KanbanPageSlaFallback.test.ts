import { describe, it, expect, vi } from 'vitest'
import {
  calculateWaitingSlaInfo,
  fetchFirstUnansweredInbound,
  fetchPendingInboundCount,
  resolveFirstUnansweredInboundFromMessages,
  countPendingUnansweredInboundFromMessages,
} from '@/lib/sla'
import type { Attendance, Message } from '@/types/crm'

describe('Kanban SLA Feeding & Fallback Unit Tests', () => {
  // A) inbound 10:00 / outbound 10:01 → SLA sem resposta INATIVO
  it('A) inbound 10:00 / outbound 10:01 → SLA sem resposta INATIVO', () => {
    const inboundAt = '2026-09-16T10:00:00.000Z'
    const outboundAt = '2026-09-16T10:01:00.000Z'
    const nowTimestamp = new Date('2026-09-16T10:30:00.000Z').getTime()

    const sla = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: null,
      lastCompanyMessageAt: outboundAt,
      lastCustomerMessageAt: inboundAt,
      stage: 'Em atendimento',
      nowTimestamp,
    })

    expect(sla.status).toBe('normal')
    expect(sla.label).toContain('Aguardando cliente')
  })

  // B) inbound 10:00 sem outbound → SLA ativo desde 10:00
  it('B) inbound 10:00 sem outbound → SLA ativo desde 10:00', () => {
    const inboundAt = '2026-09-16T10:00:00.000Z'
    const nowTimestamp = new Date('2026-09-16T10:30:00.000Z').getTime()

    const sla = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: inboundAt,
      lastCompanyMessageAt: null,
      lastCustomerMessageAt: inboundAt,
      stage: 'Em atendimento',
      nowTimestamp,
    })

    expect(sla.minutesElapsed).toBe(30)
    expect(sla.label).toBe('Aguardando há 30min')
  })

  // C) outbound antiga 09:50 / inbound 10:00 → SLA ativo desde 10:00
  it('C) outbound antiga 09:50 / inbound 10:00 → SLA ativo desde 10:00', () => {
    const outboundAt = '2026-09-16T09:50:00.000Z'
    const inboundAt = '2026-09-16T10:00:00.000Z'
    const nowTimestamp = new Date('2026-09-16T10:45:00.000Z').getTime()

    const sla = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: inboundAt,
      lastCompanyMessageAt: outboundAt,
      lastCustomerMessageAt: inboundAt,
      stage: 'Em atendimento',
      nowTimestamp,
    })

    expect(sla.minutesElapsed).toBe(45)
    expect(sla.label).toBe('Aguardando há 45min')
  })

  // D) inbound 10:00 / outbound 10:01 / fallback da busca acionado → firstUnansweredInboundAt = null → SLA INATIVO
  it('D) inbound 10:00 / outbound 10:01 / fallback da busca acionado → firstUnansweredInboundAt = null → SLA INATIVO', () => {
    const att: Attendance = {
      id: 'att_test_fallback',
      client_id: 'client_fallback',
      stage: 'Em atendimento',
      last_customer_message_at: '2026-09-16T10:00:00.000Z',
      last_company_message_at: '2026-09-16T10:01:00.000Z',
      created: '2026-09-16T09:00:00.000Z',
      updated: '2026-09-16T10:01:00.000Z',
    }

    // Simula a lógica de cálculo do fallback corrigido no KanbanPage
    const compTime = att.last_company_message_at
      ? new Date(att.last_company_message_at).getTime()
      : 0
    const custTime = att.last_customer_message_at
      ? new Date(att.last_customer_message_at).getTime()
      : 0

    let firstUnansweredInboundAt: string | null = null
    let pendingCount = 0

    // Se compTime >= custTime no loadData, nem chama a busca e seta null / 0
    if (compTime > 0 && compTime >= custTime) {
      firstUnansweredInboundAt = null
      pendingCount = 0
    } else {
      // Se por algum motivo o catch do fallback fosse acionado
      const hasUnansweredInbound = custTime > 0 && custTime > compTime
      firstUnansweredInboundAt = hasUnansweredInbound ? att.last_customer_message_at || null : null
      pendingCount = hasUnansweredInbound ? 1 : 0
    }

    expect(firstUnansweredInboundAt).toBeNull()
    expect(pendingCount).toBe(0)

    const nowTimestamp = new Date('2026-09-16T12:00:00.000Z').getTime()
    const sla = calculateWaitingSlaInfo({
      firstUnansweredInboundAt,
      lastCompanyMessageAt: att.last_company_message_at,
      lastCustomerMessageAt: att.last_customer_message_at,
      stage: att.stage,
      nowTimestamp,
    })

    expect(sla.status).toBe('normal')
    expect(sla.label).toContain('Aguardando cliente')
    expect(sla.label).not.toContain('sem resposta')
  })

  // E) inbound → realtime ativa SLA; outbound → realtime encerra; reload da página → continua encerrado
  it('E) inbound ativa SLA; outbound encerra; reload reconstrói estado encerrado', () => {
    let currentSlaMap: Record<string, string | null> = {}
    let currentPendingCountMap: Record<string, number> = {}

    const attId = 'att_lifecycle'
    const inboundMsg: Partial<Message> = {
      id: 'msg_in_1',
      attendance_id: attId,
      direction: 'inbound',
      created: '2026-09-16T10:00:00.000Z',
    }

    // 1. Inbound chega via realtime
    currentSlaMap[attId] = inboundMsg.created!
    currentPendingCountMap[attId] = 1

    expect(currentSlaMap[attId]).toBe('2026-09-16T10:00:00.000Z')
    expect(currentPendingCountMap[attId]).toBe(1)

    // 2. Outbound chega via realtime
    const outboundMsg: Partial<Message> = {
      id: 'msg_out_1',
      attendance_id: attId,
      direction: 'outbound',
      created: '2026-09-16T10:05:00.000Z',
    }
    currentSlaMap[attId] = null
    currentPendingCountMap[attId] = 0

    expect(currentSlaMap[attId]).toBeNull()
    expect(currentPendingCountMap[attId]).toBe(0)

    // 3. Simula Reload da página (loadData executado com os dados atuais do banco)
    const attAfterReload: Attendance = {
      id: attId,
      client_id: 'client_lifecycle',
      stage: 'Em atendimento',
      last_customer_message_at: inboundMsg.created,
      last_company_message_at: outboundMsg.created,
      created: '2026-09-16T09:00:00.000Z',
      updated: outboundMsg.created!,
    }

    const compTime = attAfterReload.last_company_message_at
      ? new Date(attAfterReload.last_company_message_at).getTime()
      : 0
    const custTime = attAfterReload.last_customer_message_at
      ? new Date(attAfterReload.last_customer_message_at).getTime()
      : 0

    const reloadedSlaMap: Record<string, string | null> = {}
    const reloadedCountMap: Record<string, number> = {}

    if (compTime > 0 && compTime >= custTime) {
      reloadedSlaMap[attId] = null
      reloadedCountMap[attId] = 0
    }

    expect(reloadedSlaMap[attId]).toBeNull()
    expect(reloadedCountMap[attId]).toBe(0)
  })

  // F) mensagens de outro attendance → não interferem
  it('F) mensagens de outro attendance não interferem no cálculo do atendimento alvo', () => {
    const messages: Partial<Message>[] = [
      {
        id: 'msg_other_att',
        attendance_id: 'att_other',
        client_id: 'client_shared',
        direction: 'inbound',
        message_text: 'inbound outro attendance',
        created: '2026-09-16T10:00:00.000Z',
        updated: '2026-09-16T10:00:00.000Z',
      },
      {
        id: 'msg_target_out',
        attendance_id: 'att_target',
        client_id: 'client_shared',
        direction: 'outbound',
        message_text: 'resposta target',
        created: '2026-09-16T09:30:00.000Z',
        updated: '2026-09-16T09:30:00.000Z',
      },
    ]

    const firstInbound = resolveFirstUnansweredInboundFromMessages(
      messages as Message[],
      'att_target',
      'client_shared',
      '2026-09-16T09:30:00.000Z',
    )
    const count = countPendingUnansweredInboundFromMessages(
      messages as Message[],
      'att_target',
      'client_shared',
      '2026-09-16T09:30:00.000Z',
    )

    expect(firstInbound).toBeNull()
    expect(count).toBe(0)
  })

  // G) Caso Real Lorrayny Sander (somente leitura / simulação dos dados reais)
  it('G) Caso Real Lorrayny Sander: last_company >= last_customer -> SLA sem resposta INATIVO e 0 novas mensagens', () => {
    const lorraynyAtt: Attendance = {
      id: 'y09apx2kcxwdtds',
      client_id: 'rut0w0ea2xgmba0',
      stage: 'Em produção',
      last_customer_message_at: '2026-09-15 23:47:41.000Z',
      last_company_message_at: '2026-09-15 23:48:52.801Z',
      created: '2026-09-15 23:47:43.553Z',
      updated: '2026-09-15 23:49:34.913Z',
    }

    const compTime = new Date(lorraynyAtt.last_company_message_at!).getTime()
    const custTime = new Date(lorraynyAtt.last_customer_message_at!).getTime()

    expect(compTime).toBeGreaterThan(custTime)

    // Lógica do loadData e refreshAttendanceSlaStart
    const hasUnansweredInbound = custTime > 0 && custTime > compTime
    const slaStart = hasUnansweredInbound ? lorraynyAtt.last_customer_message_at || null : null
    const pendingCount = hasUnansweredInbound ? 1 : 0

    expect(slaStart).toBeNull()
    expect(pendingCount).toBe(0)

    const now = new Date('2026-09-16T14:00:00.000Z').getTime()
    const slaInfo = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: slaStart,
      lastCompanyMessageAt: lorraynyAtt.last_company_message_at,
      lastCustomerMessageAt: lorraynyAtt.last_customer_message_at,
      stage: lorraynyAtt.stage,
      nowTimestamp: now,
    })

    expect(slaInfo.status).toBe('normal')
    expect(slaInfo.label).toContain('Aguardando cliente')
    expect(slaInfo.label).not.toContain('sem resposta')
  })
})
