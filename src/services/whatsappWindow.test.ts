import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isWithin24HourWindow } from '@/types/crm'
import { lastInboundAt, isTimestampWithin24h } from '@/services/whatsappWindow'
import pb from '@/lib/pocketbase/client'

/**
 * Bateria de Testes Vitest para a Janela WhatsApp Meta de 24h
 *
 * Cenários Obrigatórios:
 * A) Inbound há 5h em atendimento arquivado + atendimento novo vazio -> DENTRO
 * B) Inbound há 25h -> FORA
 * C) Inbound há 20h + outbound há 1h -> DENTRO (outbound não fecha a janela)
 * D) Inbound há 20h + inbound mais nova há 2h -> USA A DE 2H (DENTRO)
 * E) attendance.last_customer_message_at há 3h + inbound em messages há 2h -> USA 2H (DENTRO)
 * F) Nenhuma inbound -> FORA
 * G) Só outbound -> FORA
 *
 * Cenário #001861:
 * Inbound 2026-09-12T21:08:22.945Z vs transição 2026-09-13T15:37:08Z -> ~18h29 -> DENTRO = SIM
 */

describe('Janela de 24h WhatsApp Meta — Cenários A a G e #001861', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // A) Inbound há 5h em atendimento arquivado + atendimento novo vazio -> DENTRO
  it('Cenário A: inbound há 5h em atendimento arquivado + atendimento novo vazio → DENTRO', async () => {
    const now = new Date('2026-05-10T12:00:00.000Z')
    const fiveHoursAgo = new Date(now.getTime() - 5 * 3600 * 1000).toISOString()

    // Mock do PocketBase:
    // Attendance novo não possui last_customer_message_at
    // Collection messages possui inbound de 5h atrás (de atendimento anterior)
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_new_empty',
      last_customer_message_at: null,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      page: 1,
      perPage: 1,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: 'msg_old_att',
          client_id: 'cli_scenario_a',
          attendance_id: 'att_archived',
          direction: 'inbound',
          created: fiveHoursAgo,
        },
      ],
    } as any)

    const resolvedInbound = await lastInboundAt('cli_scenario_a', 'att_new_empty')
    expect(resolvedInbound).toBe(fiveHoursAgo)

    const isInside = isTimestampWithin24h(resolvedInbound, now)
    expect(isInside).toBe(true)

    // Também testando a função isWithin24HourWindow passando o inbound resolvido
    expect(
      isWithin24HourWindow(undefined, undefined, {
        lastCustomerMessageAt: resolvedInbound,
        referenceTime: now,
      }),
    ).toBe(true)
  })

  // B) Inbound há 25h -> FORA
  it('Cenário B: inbound há 25h → FORA', async () => {
    const now = new Date('2026-05-10T12:00:00.000Z')
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 3600 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_b',
      last_customer_message_at: twentyFiveHoursAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [
        {
          id: 'msg_b',
          client_id: 'cli_scenario_b',
          direction: 'inbound',
          created: twentyFiveHoursAgo,
        },
      ],
    } as any)

    const resolvedInbound = await lastInboundAt('cli_scenario_b', 'att_b')
    expect(resolvedInbound).toBe(twentyFiveHoursAgo)

    const isInside = isTimestampWithin24h(resolvedInbound, now)
    expect(isInside).toBe(false)

    expect(
      isWithin24HourWindow(twentyFiveHoursAgo, 'inbound', {
        referenceTime: now,
      }),
    ).toBe(false)
  })

  // C) Inbound há 20h + outbound há 1h -> DENTRO (outbound não fecha/invalida a janela)
  it('Cenário C: inbound há 20h + outbound há 1h → DENTRO', async () => {
    const now = new Date('2026-05-10T12:00:00.000Z')
    const twentyHoursAgo = new Date(now.getTime() - 20 * 3600 * 1000).toISOString()
    const oneHourAgo = new Date(now.getTime() - 1 * 3600 * 1000).toISOString()

    // O cliente possui last_message_at de 1h atrás com direction 'outbound'
    // Mas a última mensagem inbound foi há 20h
    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_c',
      last_customer_message_at: twentyHoursAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [
        {
          id: 'msg_c_inbound',
          client_id: 'cli_c',
          direction: 'inbound',
          created: twentyHoursAgo,
        },
      ],
    } as any)

    const resolvedInbound = await lastInboundAt('cli_c', 'att_c')
    expect(resolvedInbound).toBe(twentyHoursAgo)

    const isInside = isTimestampWithin24h(resolvedInbound, now)
    expect(isInside).toBe(true)

    // isWithin24HourWindow com last_message_at = outbound (1h atrás) + lastCustomerMessageAt (20h atrás)
    const windowActive = isWithin24HourWindow(oneHourAgo, 'outbound', {
      lastCustomerMessageAt: resolvedInbound,
      referenceTime: now,
    })
    expect(windowActive).toBe(true)
  })

  // D) Inbound há 20h + inbound mais nova há 2h -> USA A DE 2H (DENTRO)
  it('Cenário D: inbound há 20h + inbound mais nova há 2h → usa a de 2h (DENTRO)', async () => {
    const now = new Date('2026-05-10T12:00:00.000Z')
    const twentyHoursAgo = new Date(now.getTime() - 20 * 3600 * 1000).toISOString()
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_d',
      last_customer_message_at: twentyHoursAgo,
    } as any)

    // Messages tem mensagem inbound mais recente de 2h atrás
    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [
        {
          id: 'msg_d_recent',
          client_id: 'cli_d',
          direction: 'inbound',
          created: twoHoursAgo,
        },
      ],
    } as any)

    const resolvedInbound = await lastInboundAt('cli_d', 'att_d')
    expect(resolvedInbound).toBe(twoHoursAgo)

    const isInside = isTimestampWithin24h(resolvedInbound, now)
    expect(isInside).toBe(true)
  })

  // E) attendance.last_customer_message_at há 3h + inbound em messages há 2h -> USA 2H (DENTRO)
  it('Cenário E: attendance.last_customer_message_at há 3h + inbound em messages há 2h → usa 2h (DENTRO)', async () => {
    const now = new Date('2026-05-10T12:00:00.000Z')
    const threeHoursAgo = new Date(now.getTime() - 3 * 3600 * 1000).toISOString()
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_e',
      last_customer_message_at: threeHoursAgo,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [
        {
          id: 'msg_e',
          client_id: 'cli_e',
          direction: 'inbound',
          created: twoHoursAgo,
        },
      ],
    } as any)

    const resolvedInbound = await lastInboundAt('cli_e', 'att_e')
    // Deve pegar a mais recente entre 3h e 2h -> 2h
    expect(resolvedInbound).toBe(twoHoursAgo)

    expect(isTimestampWithin24h(resolvedInbound, now)).toBe(true)
  })

  // F) Nenhuma inbound -> FORA
  it('Cenário F: nenhuma inbound → FORA', async () => {
    const now = new Date('2026-05-10T12:00:00.000Z')

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_f',
      last_customer_message_at: null,
    } as any)

    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [],
    } as any)

    const resolvedInbound = await lastInboundAt('cli_f', 'att_f')
    expect(resolvedInbound).toBeNull()

    const isInside = isTimestampWithin24h(resolvedInbound, now)
    expect(isInside).toBe(false)

    expect(isWithin24HourWindow(undefined, undefined, { referenceTime: now })).toBe(false)
  })

  // G) Só outbound -> FORA
  it('Cenário G: só outbound → FORA', async () => {
    const now = new Date('2026-05-10T12:00:00.000Z')
    const oneHourAgo = new Date(now.getTime() - 1 * 3600 * 1000).toISOString()

    vi.spyOn(pb.collection('attendances'), 'getOne').mockResolvedValue({
      id: 'att_g',
      last_customer_message_at: null,
      last_company_message_at: oneHourAgo,
    } as any)

    // Consulta em messages para direction = 'inbound' retorna vazio
    vi.spyOn(pb.collection('messages'), 'getList').mockResolvedValue({
      items: [],
    } as any)

    const resolvedInbound = await lastInboundAt('cli_g', 'att_g')
    expect(resolvedInbound).toBeNull()

    // Outbound puro nunca abre janela de 24h
    expect(isTimestampWithin24h(resolvedInbound, now)).toBe(false)
    expect(isWithin24HourWindow(oneHourAgo, 'outbound', { referenceTime: now })).toBe(false)
  })

  // Cenário #001861:
  // Inbound 2026-09-12T21:08:22.945Z vs transição 2026-09-13T15:37:08Z -> ~18h29 -> DENTRO = SIM
  it('Cenário #001861: inbound 2026-09-12T21:08:22.945Z vs transição 2026-09-13T15:37:08Z → ~18h29 → DENTRO = SIM', async () => {
    const inboundIso = '2026-09-12T21:08:22.945Z'
    const transitionIso = '2026-09-13T15:37:08.000Z'

    const inboundTime = new Date(inboundIso).getTime()
    const transitionTime = new Date(transitionIso).getTime()

    const diffMs = transitionTime - inboundTime
    const diffHours = diffMs / (1000 * 60 * 60)

    // Diferença exata em horas (~18.479h = ~18h 28m 45s)
    expect(diffHours).toBeGreaterThan(18.4)
    expect(diffHours).toBeLessThan(18.5)

    // Verificação via helper síncrono
    const isInside = isTimestampWithin24h(inboundIso, transitionIso)
    expect(isInside).toBe(true)

    // Verificação via isWithin24HourWindow
    const windowValid = isWithin24HourWindow(inboundIso, 'inbound', {
      referenceTime: transitionIso,
    })
    expect(windowValid).toBe(true)

    // Mesmo com outbound posterior existente no cliente, a janela deve continuar DENTRO (SIM)
    const outboundLater = '2026-09-13T10:00:00.000Z'
    const windowValidWithOutbound = isWithin24HourWindow(outboundLater, 'outbound', {
      lastCustomerMessageAt: inboundIso,
      referenceTime: transitionIso,
    })
    expect(windowValidWithOutbound).toBe(true)
  })
})
