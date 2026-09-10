import { describe, it, expect } from 'vitest'
import { isWithin24HourWindow } from './crm'

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
