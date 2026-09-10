import { describe, it, expect } from 'vitest'
import { isWithin24HourWindow } from './crm'
import { calculateWaitingSlaInfo, resolveFirstUnansweredInboundFromMessages } from '@/lib/sla'
import type { Message } from './crm'

describe('Regra de Janela de 24 Horas WhatsApp Meta', () => {
  it('valida a sequência exata de inbound, outbound e fechamento de 24h', () => {
    // Cenário do usuário:
    // - Inbound 10/09 10:00 -> aberto
    // - Outbound 10/09 10:15 -> continua aberto
    // - 10/09 23:59 -> continua aberto
    // - 11/09 09:59 -> continua aberto
    // - 11/09 10:01 -> fechado/template necessário
    // - Nova inbound 11/09 10:05 -> aberto novamente até 12/09 10:05

    const inbound1 = '2024-09-10T10:00:00.000Z'

    // 1. Inbound 10/09 10:00 -> aberto
    const check1 = isWithin24HourWindow(inbound1, 'inbound', {
      lastCustomerMessageAt: inbound1,
      referenceTime: '2024-09-10T10:00:00.000Z',
    })
    expect(check1).toBe(true)

    // 2. Outbound 10/09 10:15 -> continua aberto e NÃO altera a janela
    const check2 = isWithin24HourWindow('2024-09-10T10:15:00.000Z', 'outbound', {
      lastCustomerMessageAt: inbound1, // attendance preserva o timestamp inbound do cliente
      referenceTime: '2024-09-10T10:15:00.000Z',
    })
    expect(check2).toBe(true)

    // 3. 10/09 23:59 -> continua aberto
    const check3 = isWithin24HourWindow('2024-09-10T10:15:00.000Z', 'outbound', {
      lastCustomerMessageAt: inbound1,
      referenceTime: '2024-09-10T23:59:00.000Z',
    })
    expect(check3).toBe(true)

    // 4. 11/09 09:59 -> continua aberto (23h59min decorridos)
    const check4 = isWithin24HourWindow('2024-09-10T10:15:00.000Z', 'outbound', {
      lastCustomerMessageAt: inbound1,
      referenceTime: '2024-09-11T09:59:00.000Z',
    })
    expect(check4).toBe(true)

    // 5. 11/09 10:01 -> fechado/template necessário (24h01min decorridos)
    const check5 = isWithin24HourWindow('2024-09-10T10:15:00.000Z', 'outbound', {
      lastCustomerMessageAt: inbound1,
      referenceTime: '2024-09-11T10:01:00.000Z',
    })
    expect(check5).toBe(false)

    // 6. Nova inbound 11/09 10:05 -> aberto novamente até 12/09 10:05
    const inbound2 = '2024-09-11T10:05:00.000Z'
    const check6Open = isWithin24HourWindow(inbound2, 'inbound', {
      lastCustomerMessageAt: inbound2,
      referenceTime: '2024-09-11T10:05:00.000Z',
    })
    expect(check6Open).toBe(true)

    const check6UntilNextDay = isWithin24HourWindow(inbound2, 'inbound', {
      lastCustomerMessageAt: inbound2,
      referenceTime: '2024-09-12T10:05:00.000Z',
    })
    expect(check6UntilNextDay).toBe(true)

    const check6ExpiredNextDay = isWithin24HourWindow(inbound2, 'inbound', {
      lastCustomerMessageAt: inbound2,
      referenceTime: '2024-09-12T10:06:00.000Z',
    })
    expect(check6ExpiredNextDay).toBe(false)
  })

  it('comportamento com fallback quando não há attendance.last_customer_message_at', () => {
    const clientInboundTime = '2024-09-10T14:10:00.000Z'

    // Fallback usando apenas dados de client
    expect(
      isWithin24HourWindow(clientInboundTime, 'inbound', {
        referenceTime: '2024-09-11T14:00:00.000Z',
      }),
    ).toBe(true)

    // Fallback após 24h
    expect(
      isWithin24HourWindow(clientInboundTime, 'inbound', {
        referenceTime: '2024-09-11T14:15:00.000Z',
      }),
    ).toBe(false)

    // Sem timestamp de customer nem inbound
    expect(isWithin24HourWindow('2024-09-10T14:10:00.000Z', 'outbound')).toBe(false)
  })
})

describe('Regra de SLA / Tempo de Espera do Cliente', () => {
  it('10:00 inbound inicia SLA em 10:00; 10:08 segunda inbound NÃO reinicia; 10:15 outbound equipe para SLA; 10:20 nova inbound inicia novo ciclo', () => {
    const t1000 = '2024-09-10T10:00:00.000Z'
    const t1008 = '2024-09-10T10:08:00.000Z'
    const t1015 = '2024-09-10T10:15:00.000Z'
    const t1020 = '2024-09-10T10:20:00.000Z'

    const attId = 'att_123'
    const cliId = 'cli_456'

    // Passo 1: 10:00 cliente envia mensagem -> SLA começa em 10:00
    const msg1: Message = {
      id: 'm1',
      attendance_id: attId,
      client_id: cliId,
      direction: 'inbound',
      created: t1000,
      updated: t1000,
      message_text: 'Olá',
    }
    const firstInboundPass1 = resolveFirstUnansweredInboundFromMessages([msg1], attId, cliId, null)
    expect(firstInboundPass1).toBe(t1000)

    const slaPass1 = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: firstInboundPass1,
      nowTimestamp: new Date('2024-09-10T10:05:00.000Z').getTime(), // 5 minutos depois
    })
    expect(slaPass1.minutesElapsed).toBe(5)
    expect(slaPass1.label).toBe('Aguardando há 5min')

    // Passo 2: 10:08 cliente envia outra mensagem -> SLA NÃO reinicia -> continua contando desde 10:00
    const msg2: Message = {
      id: 'm2',
      attendance_id: attId,
      client_id: cliId,
      direction: 'inbound',
      created: t1008,
      updated: t1008,
      message_text: 'Vocês estão aí?',
    }
    const firstInboundPass2 = resolveFirstUnansweredInboundFromMessages(
      [msg1, msg2],
      attId,
      cliId,
      null,
    )
    expect(firstInboundPass2).toBe(t1000) // Continua sendo 10:00! NÃO reiniciou para 10:08!

    const slaPass2 = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: firstInboundPass2,
      nowTimestamp: new Date('2024-09-10T10:10:00.000Z').getTime(), // 10 minutos após t1000
    })
    expect(slaPass2.minutesElapsed).toBe(10) // 10:10 - 10:00 = 10 minutos
    expect(slaPass2.label).toBe('Aguardando há 10min')

    // Passo 3: 10:15 equipe responde -> cliente não está mais esperando -> SLA para / sai do estado de espera
    const msgOutbound: Message = {
      id: 'm3',
      attendance_id: attId,
      client_id: cliId,
      direction: 'outbound',
      created: t1015,
      updated: t1015,
      message_text: 'Olá! Como podemos ajudar?',
    }
    const firstInboundPass3 = resolveFirstUnansweredInboundFromMessages(
      [msg1, msg2, msgOutbound],
      attId,
      cliId,
      t1015,
    )
    expect(firstInboundPass3).toBeNull() // Sem inbound após a resposta da equipe!

    const slaPass3 = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: firstInboundPass3,
      lastCompanyMessageAt: t1015,
      lastCustomerMessageAt: t1008,
      nowTimestamp: new Date('2024-09-10T10:18:00.000Z').getTime(),
    })
    expect(slaPass3.label).toBe('Aguardando cliente há 3min')
    expect(slaPass3.status).toBe('normal')

    // Passo 4: 10:20 cliente envia nova mensagem -> novo ciclo de SLA começa em 10:20
    const msg4: Message = {
      id: 'm4',
      attendance_id: attId,
      client_id: cliId,
      direction: 'inbound',
      created: t1020,
      updated: t1020,
      message_text: 'Quero um orçamento de banner',
    }
    const firstInboundPass4 = resolveFirstUnansweredInboundFromMessages(
      [msg1, msg2, msgOutbound, msg4],
      attId,
      cliId,
      t1015,
    )
    expect(firstInboundPass4).toBe(t1020) // Novo ciclo inicia em 10:20!

    const slaPass4 = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: firstInboundPass4,
      lastCompanyMessageAt: t1015,
      lastCustomerMessageAt: t1020,
      nowTimestamp: new Date('2024-09-10T10:25:00.000Z').getTime(), // 5 min após 10:20
    })
    expect(slaPass4.minutesElapsed).toBe(5)
    expect(slaPass4.label).toBe('Aguardando há 5min')
  })
})
