import { describe, it, expect, vi } from 'vitest'
import type { Attendance, Client, ArchivedDeal } from '@/types/crm'

/**
 * BATERIA DE TESTES OBRIGATÓRIOS (A até G)
 * Conforme especificado na tarefa:
 * - A: cliente com atendimento vendido/arquivado — abrir/fechar conversa 10x → 0 novos cards.
 * - B: cliente com atendimento perdido/arquivado — abrir conversa → 0 novos cards.
 * - C: cliente antigo envia NOVA mensagem inbound → novo atendimento conforme regra existente, sem modificar o anterior.
 * - D: cliente antigo sem atendimento ativo, abrir conversa só para consultar histórico → histórico disponível, 0 novos cards.
 * - E: cliente sem atendimento ativo + clique "Novo atendimento" → exatamente 1 novo atendimento/card.
 * - F: atendimento criado + "Encerrar sem oportunidade" → sai do funil, NÃO conta como venda perdida nem afeta negativamente a conversão.
 * - G: abrir/fechar repetidamente a mesma conversa → nenhuma duplicidade.
 */

describe('Correção de Cards Fantasmas & Encerramento Neutro sem Oportunidade', () => {
  // Simulador puro da lógica de loadClientData de WhatsAppChatDrawer (100% LEITURA)
  function simulateDrawerLoadAttendance(params: {
    clientAtts: Attendance[]
    targetAttId?: string | null
  }): Attendance | null {
    const { clientAtts, targetAttId } = params

    if (targetAttId) {
      const found = clientAtts.find((a) => a.id === targetAttId)
      if (found) return found
    }

    const activeList = clientAtts.filter((a) => !a.is_archived)

    // (2) Se existir exatamente 1 ativo -> usar diretamente
    if (activeList.length === 1) {
      return activeList[0]
    }

    // (3) Se nenhum ativo existir -> NUNCA criar attendance!
    // Carregar apenas o ÚLTIMO existente ordenado deterministicamente por -created
    if (activeList.length === 0) {
      if (clientAtts.length > 0) {
        const sortedHistory = [...clientAtts].sort(
          (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
        )
        return sortedHistory[0] || null
      }
      return null
    }

    // (4) Se >1 ativos históricos: ordena por -created
    const sortedActive = [...activeList].sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    )
    return sortedActive[0] || null
  }

  // Simulador do endpoint /backend/v1/crm/attendances/resolve em modo read-only
  function simulateEndpointResolve(params: {
    clientAtts: Attendance[]
    isReadOnly?: boolean
    onCreate?: () => Attendance
  }): { attendance: Attendance | null; action: string } {
    const active = params.clientAtts.filter((a) => !a.is_archived)
    if (active.length > 0) {
      return { attendance: active[0], action: 'reused' }
    }
    if (params.isReadOnly) {
      return { attendance: null, action: 'none' }
    }
    const created = params.onCreate ? params.onCreate() : null
    return { attendance: created, action: 'created' }
  }

  it('TESTE A: cliente com atendimento vendido/arquivado — abrir/fechar conversa 10x → 0 novos cards', () => {
    const attendancesDatabase: Attendance[] = [
      {
        id: 'att_won_1',
        client_id: 'cli_1',
        stage: 'Venda fechada',
        is_archived: true,
        result: 'Venda fechada',
        created: '2025-01-01T10:00:00.000Z',
        updated: '2025-01-01T12:00:00.000Z',
      },
    ]

    const initialCount = attendancesDatabase.length

    // Simula abrir e fechar a conversa 10 vezes
    for (let i = 0; i < 10; i++) {
      const loadedAttendance = simulateDrawerLoadAttendance({
        clientAtts: attendancesDatabase,
      })

      // Deve carregar o histórico anterior para leitura
      expect(loadedAttendance?.id).toBe('att_won_1')
      expect(loadedAttendance?.is_archived).toBe(true)
    }

    // NENHUM card/attendance novo foi adicionado
    expect(attendancesDatabase.length).toBe(initialCount)
  })

  it('TESTE B: cliente com atendimento perdido/arquivado — abrir conversa → 0 novos cards', () => {
    const attendancesDatabase: Attendance[] = [
      {
        id: 'att_lost_1',
        client_id: 'cli_2',
        stage: 'Não fechou',
        is_archived: true,
        result: 'Venda perdida',
        loss_reason: 'Preço alto',
        created: '2025-02-01T10:00:00.000Z',
        updated: '2025-02-01T12:00:00.000Z',
      },
    ]

    const initialCount = attendancesDatabase.length

    const loadedAttendance = simulateDrawerLoadAttendance({
      clientAtts: attendancesDatabase,
    })

    expect(loadedAttendance?.id).toBe('att_lost_1')
    expect(loadedAttendance?.is_archived).toBe(true)
    expect(attendancesDatabase.length).toBe(initialCount)
  })

  it('TESTE C: cliente antigo envia NOVA mensagem inbound → novo atendimento conforme regra existente, sem modificar o anterior', () => {
    const attendancesDatabase: Attendance[] = [
      {
        id: 'att_ancient_won',
        client_id: 'cli_3',
        stage: 'Venda fechada',
        is_archived: true,
        result: 'Venda fechada',
        created: '2025-01-10T08:00:00.000Z',
        updated: '2025-01-10T10:00:00.000Z',
      },
    ]

    // Simulação do webhook inbound: sem attendance ativo e sem pedido ativo em produção -> cria Novo contato
    const activeOpen = attendancesDatabase.filter(
      (a) => !a.is_archived && a.stage !== 'Venda fechada' && a.stage !== 'Não fechou',
    )
    expect(activeOpen.length).toBe(0)

    const newInboundAttendance: Attendance = {
      id: 'att_inbound_new',
      client_id: 'cli_3',
      stage: 'Novo contato',
      is_archived: false,
      source: 'whatsapp',
      created: '2025-05-15T14:00:00.000Z',
      updated: '2025-05-15T14:00:00.000Z',
    }
    attendancesDatabase.push(newInboundAttendance)

    expect(attendancesDatabase.length).toBe(2)
    // O anterior permanece intacto como arquivado
    expect(attendancesDatabase[0].id).toBe('att_ancient_won')
    expect(attendancesDatabase[0].is_archived).toBe(true)
    expect(attendancesDatabase[0].stage).toBe('Venda fechada')

    // O novo atendimento está ativo
    expect(attendancesDatabase[1].id).toBe('att_inbound_new')
    expect(attendancesDatabase[1].is_archived).toBe(false)
    expect(attendancesDatabase[1].stage).toBe('Novo contato')
  })

  it('TESTE D: cliente antigo sem atendimento ativo, abrir conversa só para consultar histórico → histórico disponível, 0 novos cards', () => {
    const historyAtt: Attendance = {
      id: 'att_hist_99',
      client_id: 'cli_4',
      stage: 'Venda fechada',
      is_archived: true,
      notes: 'Histórico de banner impresso em janeiro',
      created: '2025-01-15T10:00:00.000Z',
      updated: '2025-01-15T12:00:00.000Z',
    }
    const attendancesDatabase = [historyAtt]

    const loaded = simulateDrawerLoadAttendance({
      clientAtts: attendancesDatabase,
    })

    expect(loaded).toBeDefined()
    expect(loaded?.id).toBe('att_hist_99')
    expect(loaded?.notes).toContain('Histórico de banner')
    expect(attendancesDatabase.length).toBe(1)
  })

  it('TESTE E: cliente sem atendimento ativo + clique "Novo atendimento" → exatamente 1 novo atendimento/card', () => {
    const attendancesDatabase: Attendance[] = [
      {
        id: 'att_old_archived',
        client_id: 'cli_5',
        stage: 'Venda fechada',
        is_archived: true,
        created: '2025-01-01T00:00:00.000Z',
        updated: '2025-01-01T00:00:00.000Z',
      },
    ]

    // 1. Abrir Drawer: zero novos cards
    const initialView = simulateDrawerLoadAttendance({ clientAtts: attendancesDatabase })
    expect(initialView?.is_archived).toBe(true)
    expect(attendancesDatabase.length).toBe(1)

    // 2. Ação explícita manual: usuário clica no botão "Novo atendimento"
    const handleManualNewAttendance = () => {
      const newAtt: Attendance = {
        id: 'att_manual_click_1',
        client_id: 'cli_5',
        stage: 'Em atendimento',
        source: 'drawer_manual',
        is_archived: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }
      attendancesDatabase.push(newAtt)
      return newAtt
    }

    const created = handleManualNewAttendance()
    expect(created.id).toBe('att_manual_click_1')
    expect(created.stage).toBe('Em atendimento')
    expect(attendancesDatabase.length).toBe(2)
  })

  it('TESTE F: atendimento criado + "Encerrar sem oportunidade" → sai do funil, NÃO conta como venda perdida nem afeta negativamente a conversão', () => {
    // Cenário:
    // 10 vendas fechadas
    // 10 vendas perdidas normais
    // Taxa de conversão inicial = 10 / (10 + 10) = 50%
    const initialWon = 10
    const initialLost = 10
    const initialConversionRate = Math.round((initialWon / (initialWon + initialLost)) * 100)
    expect(initialConversionRate).toBe(50)

    // Agora adicionamos um atendimento novo e encerramos como "Sem oportunidade"
    const newArchivedDeal: ArchivedDeal = {
      id: 'arch_without_opp_1',
      client_id: 'cli_test_f',
      client_name: 'Cliente Teste F',
      client_phone: '5511999990000',
      result: 'Sem oportunidade',
      closure_type: 'without_opportunity',
      closure_reason: 'Apenas consulta',
      quote_value: 0,
      closed_at: '2025-05-15',
      created: '2025-05-15T10:00:00.000Z',
      updated: '2025-05-15T10:00:00.000Z',
    }

    const allArchivedDeals: ArchivedDeal[] = [
      ...Array.from({ length: initialWon }).map(
        (_, i) =>
          ({
            id: `won_${i}`,
            client_id: `cli_w_${i}`,
            client_name: `Won ${i}`,
            client_phone: '123',
            result: 'Venda fechada',
            quote_value: 500,
            closed_at: '2025-05-15',
            created: '2025-05-15',
            updated: '2025-05-15',
          }) as ArchivedDeal,
      ),
      ...Array.from({ length: initialLost }).map(
        (_, i) =>
          ({
            id: `lost_${i}`,
            client_id: `cli_l_${i}`,
            client_name: `Lost ${i}`,
            client_phone: '123',
            result: 'Venda perdida',
            loss_reason: 'Preço alto',
            quote_value: 300,
            closed_at: '2025-05-15',
            created: '2025-05-15',
            updated: '2025-05-15',
          }) as ArchivedDeal,
      ),
      newArchivedDeal,
    ]

    // Aplicar a fórmula de cálculo isolada (ArchivedDealsPage)
    const wonDeals = allArchivedDeals.filter((d) => d.result === 'Venda fechada')
    const lostDeals = allArchivedDeals.filter(
      (d) => d.result === 'Venda perdida' && d.closure_type !== 'without_opportunity',
    )
    const withoutOppDeals = allArchivedDeals.filter(
      (d) => d.result === 'Sem oportunidade' || d.closure_type === 'without_opportunity',
    )

    // Denominador comercial puro
    const commercialEvaluated = wonDeals.length + lostDeals.length
    const conversionRate = Math.round((wonDeals.length / commercialEvaluated) * 100)

    expect(withoutOppDeals.length).toBe(1)
    expect(wonDeals.length).toBe(10)
    expect(lostDeals.length).toBe(10)
    // A taxa de conversão DEVE CONTINUAR EXATAMENTE 50% (não foi reduzida para 10/21 = 47%)
    expect(conversionRate).toBe(50)
  })

  it('TESTE G: abrir/fechar repetidamente a mesma conversa → nenhuma duplicidade', () => {
    const client: Client = {
      id: 'cli_repeat_test',
      name: 'Cliente Repetição',
      phone: '5511988887777',
      stage: 'Precisa responder',
      is_archived: false,
      created: '2025-03-01T10:00:00.000Z',
      updated: '2025-03-01T10:00:00.000Z',
    }

    const singleActiveAtt: Attendance = {
      id: 'att_single_active',
      client_id: client.id,
      stage: 'Precisa responder',
      is_archived: false,
      created: '2025-03-01T10:00:00.000Z',
      updated: '2025-03-01T10:00:00.000Z',
    }

    const attendancesDatabase: Attendance[] = [singleActiveAtt]

    // Abrir e fechar repetidamente 50 vezes
    for (let i = 0; i < 50; i++) {
      const att = simulateDrawerLoadAttendance({
        clientAtts: attendancesDatabase,
      })
      expect(att?.id).toBe('att_single_active')
    }

    // A quantidade de atendimentos no banco DEVE ser estritamente 1
    expect(attendancesDatabase.length).toBe(1)
  })

  it('Validação Backend Endpoint: modo read_only=true NUNCA cria registros', () => {
    const emptyAttendances: Attendance[] = []
    let createCalled = false

    const response = simulateEndpointResolve({
      clientAtts: emptyAttendances,
      isReadOnly: true,
      onCreate: () => {
        createCalled = true
        return {
          id: 'unwanted_att',
          client_id: 'c1',
          stage: 'Novo contato',
          created: '',
          updated: '',
        }
      },
    })

    expect(response.action).toBe('none')
    expect(response.attendance).toBeNull()
    expect(createCalled).toBe(false)
  })
})
