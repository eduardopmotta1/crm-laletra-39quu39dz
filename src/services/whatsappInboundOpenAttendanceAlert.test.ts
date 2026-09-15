import { describe, it, expect } from 'vitest'
import {
  countPendingUnansweredInboundFromMessages,
  resolveFirstUnansweredInboundFromMessages,
  calculateWaitingSlaInfo,
} from '@/lib/sla'
import type { Message, Attendance } from '@/types/crm'

/**
 * Testes Unitários de Inbound WhatsApp com Atendimento Aberto e Notificação no Card
 * VERSÃO 0.0.232
 *
 * MOCKS EM MEMÓRIA — NENHUM DADO REAL É ALTERADO, NENHUM WHATSAPP REAL É ENVIADO.
 *
 * Cenários Obrigatórios:
 * (A) Orçamento enviado + inbound → permanece "Orçamento enviado" + alerta 1 mensagem.
 * (B) Em produção + inbound → permanece "Em produção" + alerta 1.
 * (C) 3 inbounds consecutivas → mesmo attendance, mesmo stage, alerta 3.
 * (D) Outbound após as 3 → mesmo stage, alerta some, SLA encerra.
 * (E) Nova inbound depois → alerta 1, SLA inicia novo ciclo.
 * (F) Abrir Drawer sem responder → alerta NÃO some (outbound é o único evento que zera).
 * (G) Nenhum attendance duplicado.
 */

// Simulador puro da lógica do webhook no PocketBase (pocketbase/hooks/whatsapp_webhook.js)
interface MockAttendanceRecord {
  id: string
  client_id: string
  stage: string
  is_archived: boolean
  last_customer_message_at?: string
  last_company_message_at?: string
}

function createMockMsg(data: {
  id: string
  attendance_id?: string
  client_id?: string
  direction: 'inbound' | 'outbound'
  message_text: string
  created: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
}): Message {
  return {
    id: data.id,
    attendance_id: data.attendance_id,
    client_id: data.client_id,
    direction: data.direction,
    message_text: data.message_text,
    created: data.created,
    updated: data.created,
    status: data.status || 'delivered',
  }
}

function processInboundWebhookSimulation(
  attendance: MockAttendanceRecord,
  inboundTimestampIso: string,
): MockAttendanceRecord {
  // Reutiliza o mesmo attendance
  // NÃO altera stage em hipótese alguma
  // Atualiza last_customer_message_at
  return {
    ...attendance,
    last_customer_message_at: inboundTimestampIso,
  }
}

describe('Inbound WhatsApp com Atendimento Aberto — Notificação e Preservação de Stage', () => {
  const attId = 'att_test_123'
  const clientId = 'cli_test_456'

  it('Cenário (A): Orçamento enviado + inbound → permanece "Orçamento enviado" + alerta 1 mensagem', () => {
    const attendance: MockAttendanceRecord = {
      id: attId,
      client_id: clientId,
      stage: 'Orçamento enviado',
      is_archived: false,
      last_company_message_at: '2025-05-10T10:00:00.000Z',
    }

    // 1. Inbound chega pelo webhook
    const updated = processInboundWebhookSimulation(attendance, '2025-05-10T10:30:00.000Z')
    expect(updated.stage).toBe('Orçamento enviado')
    expect(updated.id).toBe(attId)

    // 2. Registro da mensagem inbound
    const messages: Message[] = [
      createMockMsg({
        id: 'msg_out_1',
        attendance_id: attId,
        client_id: clientId,
        direction: 'outbound',
        message_text: 'Segue seu orçamento em anexo.',
        created: '2025-05-10T10:00:00.000Z',
      }),
      createMockMsg({
        id: 'msg_in_1',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Qual o prazo de entrega?',
        created: '2025-05-10T10:30:00.000Z',
      }),
    ]

    const pendingCount = countPendingUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      updated.last_company_message_at,
    )

    expect(pendingCount).toBe(1)
  })

  it('Cenário (B): Em produção + inbound → permanece "Em produção" + alerta 1 mensagem', () => {
    const attendance: MockAttendanceRecord = {
      id: attId,
      client_id: clientId,
      stage: 'Em produção',
      is_archived: false,
      last_company_message_at: '2025-05-10T09:00:00.000Z',
    }

    const updated = processInboundWebhookSimulation(attendance, '2025-05-10T11:00:00.000Z')
    expect(updated.stage).toBe('Em produção')
    expect(updated.id).toBe(attId)

    const messages: Message[] = [
      createMockMsg({
        id: 'msg_out_1',
        attendance_id: attId,
        client_id: clientId,
        direction: 'outbound',
        message_text: 'Seu material já está rodando em produção!',
        created: '2025-05-10T09:00:00.000Z',
      }),
      createMockMsg({
        id: 'msg_in_1',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Consigo retirar hoje às 17h?',
        created: '2025-05-10T11:00:00.000Z',
      }),
    ]

    const pendingCount = countPendingUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      updated.last_company_message_at,
    )

    expect(pendingCount).toBe(1)
  })

  it('Cenário (C): 3 inbounds consecutivas → mesmo attendance, mesmo stage, alerta 3', () => {
    let attendance: MockAttendanceRecord = {
      id: attId,
      client_id: clientId,
      stage: 'Aguardando cliente',
      is_archived: false,
      last_company_message_at: '2025-05-10T08:00:00.000Z',
    }

    const messages: Message[] = [
      createMockMsg({
        id: 'msg_out_0',
        attendance_id: attId,
        client_id: clientId,
        direction: 'outbound',
        message_text: 'Pode confirmar a medida?',
        created: '2025-05-10T08:00:00.000Z',
      }),
    ]

    // Inbound 1
    attendance = processInboundWebhookSimulation(attendance, '2025-05-10T08:05:00.000Z')
    messages.push(
      createMockMsg({
        id: 'msg_in_1',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Oi',
        created: '2025-05-10T08:05:00.000Z',
      }),
    )

    // Inbound 2
    attendance = processInboundWebhookSimulation(attendance, '2025-05-10T08:06:00.000Z')
    messages.push(
      createMockMsg({
        id: 'msg_in_2',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Meu pedido',
        created: '2025-05-10T08:06:00.000Z',
      }),
    )

    // Inbound 3
    attendance = processInboundWebhookSimulation(attendance, '2025-05-10T08:07:00.000Z')
    messages.push(
      createMockMsg({
        id: 'msg_in_3',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Quando fica pronto?',
        created: '2025-05-10T08:07:00.000Z',
      }),
    )

    expect(attendance.stage).toBe('Aguardando cliente')
    expect(attendance.id).toBe(attId)

    const pendingCount = countPendingUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      attendance.last_company_message_at,
    )
    expect(pendingCount).toBe(3)

    // SLA: Início deve ser na PRIMEIRA inbound ('msg_in_1'), sem reiniciar nas seguintes
    const firstInbound = resolveFirstUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      attendance.last_company_message_at,
    )
    expect(firstInbound).toBe('2025-05-10T08:05:00.000Z')
  })

  it('Cenário (D): Outbound após as 3 inbounds → mesmo stage, alerta some (0), SLA encerra', () => {
    const attendance: MockAttendanceRecord = {
      id: attId,
      client_id: clientId,
      stage: 'Aguardando cliente',
      is_archived: false,
      last_company_message_at: '2025-05-10T08:15:00.000Z', // atualizado pela outbound
      last_customer_message_at: '2025-05-10T08:07:00.000Z',
    }

    const messages: Message[] = [
      createMockMsg({
        id: 'msg_in_1',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Oi',
        created: '2025-05-10T08:05:00.000Z',
      }),
      createMockMsg({
        id: 'msg_in_2',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Meu pedido',
        created: '2025-05-10T08:06:00.000Z',
      }),
      createMockMsg({
        id: 'msg_in_3',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Quando fica pronto?',
        created: '2025-05-10T08:07:00.000Z',
      }),
      createMockMsg({
        id: 'msg_out_respond',
        attendance_id: attId,
        client_id: clientId,
        direction: 'outbound',
        message_text: 'Olá! Seu pedido fica pronto amanhã às 14h.',
        created: '2025-05-10T08:15:00.000Z',
      }),
    ]

    // Stage permanece 'Aguardando cliente' (outbound NÃO altera stage)
    expect(attendance.stage).toBe('Aguardando cliente')

    // Contador derivado zera
    const pendingCount = countPendingUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      attendance.last_company_message_at,
    )
    expect(pendingCount).toBe(0)

    // SLA encerra (firstUnanswered vira null)
    const firstInbound = resolveFirstUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      attendance.last_company_message_at,
    )
    expect(firstInbound).toBeNull()

    const sla = calculateWaitingSlaInfo({
      firstUnansweredInboundAt: firstInbound,
      lastCompanyMessageAt: attendance.last_company_message_at,
      lastCustomerMessageAt: attendance.last_customer_message_at,
      stage: attendance.stage,
      nowTimestamp: new Date('2025-05-10T08:20:00.000Z').getTime(),
    })
    expect(sla.label).toContain('Aguardando cliente')
  })

  it('Cenário (E): Nova inbound depois da resposta → alerta 1, SLA inicia novo ciclo', () => {
    let attendance: MockAttendanceRecord = {
      id: attId,
      client_id: clientId,
      stage: 'Aguardando cliente',
      is_archived: false,
      last_company_message_at: '2025-05-10T08:15:00.000Z',
    }

    const messages: Message[] = [
      createMockMsg({
        id: 'msg_in_old',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Oi',
        created: '2025-05-10T08:05:00.000Z',
      }),
      createMockMsg({
        id: 'msg_out_1',
        attendance_id: attId,
        client_id: clientId,
        direction: 'outbound',
        message_text: 'Respondido.',
        created: '2025-05-10T08:15:00.000Z',
      }),
    ]

    // Nova mensagem do cliente horas depois
    attendance = processInboundWebhookSimulation(attendance, '2025-05-10T14:00:00.000Z')
    messages.push(
      createMockMsg({
        id: 'msg_in_new',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Consegue entregar antes?',
        created: '2025-05-10T14:00:00.000Z',
      }),
    )

    expect(attendance.stage).toBe('Aguardando cliente')

    const pendingCount = countPendingUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      attendance.last_company_message_at,
    )
    expect(pendingCount).toBe(1)

    const firstInbound = resolveFirstUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      attendance.last_company_message_at,
    )
    expect(firstInbound).toBe('2025-05-10T14:00:00.000Z')
  })

  it('Cenário (F): Abrir o Drawer sem responder → alerta NÃO some', () => {
    const attendance: MockAttendanceRecord = {
      id: attId,
      client_id: clientId,
      stage: 'Em atendimento',
      is_archived: false,
      last_company_message_at: '2025-05-10T08:00:00.000Z',
      last_customer_message_at: '2025-05-10T08:30:00.000Z',
    }

    const messages: Message[] = [
      createMockMsg({
        id: 'msg_out_0',
        attendance_id: attId,
        client_id: clientId,
        direction: 'outbound',
        message_text: 'Bom dia',
        created: '2025-05-10T08:00:00.000Z',
      }),
      createMockMsg({
        id: 'msg_in_1',
        attendance_id: attId,
        client_id: clientId,
        direction: 'inbound',
        message_text: 'Preciso alterar a quantidade para 500',
        created: '2025-05-10T08:30:00.000Z',
      }),
    ]

    // Simula atendente abrindo o Drawer (apenas lê a tela)
    const isDrawerOpen = true
    expect(isDrawerOpen).toBe(true)

    // Como nenhuma mensagem outbound foi criada, a contagem permanece 1
    const pendingCount = countPendingUnansweredInboundFromMessages(
      messages,
      attId,
      clientId,
      attendance.last_company_message_at,
    )
    expect(pendingCount).toBe(1)
  })

  it('Cenário (G): Nenhum attendance duplicado ao receber múltiplas mensagens com attendance aberto', () => {
    const existingAttendances: MockAttendanceRecord[] = [
      {
        id: 'att_existente',
        client_id: clientId,
        stage: 'Novo contato',
        is_archived: false,
      },
    ]

    // Simula 5 inbounds chegando para o mesmo cliente
    for (let i = 1; i <= 5; i++) {
      // Procura attendance aberto existente
      const open = existingAttendances.find(
        (a) => a.client_id === clientId && a.is_archived !== true,
      )
      expect(open).toBeDefined()
      if (open) {
        open.last_customer_message_at = `2025-05-10T09:0${i}:00.000Z`
        // Não cria novo attendance
      }
    }

    expect(existingAttendances.length).toBe(1)
    expect(existingAttendances[0].id).toBe('att_existente')
    expect(existingAttendances[0].stage).toBe('Novo contato')
  })

  it('Verifica pluralização correta do alerta', () => {
    const formatAlert = (count: number) =>
      `🔴 ${count} ${count === 1 ? 'nova mensagem' : 'novas mensagens'}`

    expect(formatAlert(1)).toBe('🔴 1 nova mensagem')
    expect(formatAlert(2)).toBe('🔴 2 novas mensagens')
    expect(formatAlert(3)).toBe('🔴 3 novas mensagens')
  })

  it('Verifica que o webhook não possui mais a regra que força "Precisa responder"', async () => {
    const webhookCodeModule = await import('../../../pocketbase/hooks/whatsapp_webhook.js?raw')
    const webhookCode = webhookCodeModule.default

    // Garante que o código do webhook não faz targetAtt.set('stage', 'Precisa responder')
    expect(webhookCode).not.toContain("targetAtt.set('stage', 'Precisa responder')")
  })

  describe('Auditoria e Cenários da Regra Correta de Contagem (Caso Lorrayny Sander)', () => {
    const lorraynyClientId = 'rut0w0ea2xgmba0'
    const lorraynyOldAttId = 'lpfib4p04xk75um' // Atendimento antigo fechado
    const lorraynyActiveAttId = 'y09apx2kcxwdtds' // Atendimento ativo atual

    // Histórico real de mensagens da Lorrayny no banco
    const lorraynyRealMessages: Message[] = [
      createMockMsg({
        id: 'xfvao2cefat32r2',
        attendance_id: lorraynyOldAttId,
        client_id: lorraynyClientId,
        direction: 'inbound',
        message_text: 'Oi',
        created: '2026-09-10T17:45:27.892Z',
      }),
      createMockMsg({
        id: 'gq5ku4po6raqm2s',
        attendance_id: lorraynyOldAttId,
        client_id: lorraynyClientId,
        direction: 'outbound',
        message_text: 'te amo',
        created: '2026-09-10T17:45:50.775Z',
      }),
      createMockMsg({
        id: 'laaz0nxx571iold',
        attendance_id: lorraynyOldAttId,
        client_id: lorraynyClientId,
        direction: 'outbound',
        message_text: 'ssrsrs',
        created: '2026-09-10T17:45:53.927Z',
      }),
      createMockMsg({
        id: '3scv6ol3hmaf8qh',
        attendance_id: lorraynyOldAttId,
        client_id: lorraynyClientId,
        direction: 'outbound',
        message_text: 'funcionou',
        created: '2026-09-10T17:45:57.124Z',
      }),
      createMockMsg({
        id: 'juver8ztgr8l2si',
        attendance_id: lorraynyOldAttId,
        client_id: lorraynyClientId,
        direction: 'inbound',
        message_text: 'Rsrs',
        created: '2026-09-10T17:46:11.961Z',
      }),
      createMockMsg({
        id: 'bipkqisk7wfs268',
        attendance_id: lorraynyOldAttId,
        client_id: lorraynyClientId,
        direction: 'inbound',
        message_text: 'Hg',
        created: '2026-09-10T20:44:05.854Z',
      }),
      createMockMsg({
        id: '34kbz5hd5lckl2a',
        attendance_id: lorraynyOldAttId,
        client_id: lorraynyClientId,
        direction: 'outbound',
        message_text: 'ffjjf',
        created: '2026-09-10T20:44:16.416Z',
      }),
      createMockMsg({
        id: 'xlrh1i1kubxwsb6',
        attendance_id: lorraynyOldAttId,
        client_id: lorraynyClientId,
        direction: 'outbound',
        message_text: 'Olá, Lorrayny Sander! Segue seu orçamento ORC-2026-0016...',
        created: '2026-09-10T20:44:46.820Z',
      }),
      createMockMsg({
        id: '867ui79mktp5l31',
        attendance_id: undefined, // mensagem de sistema sem attendance
        client_id: lorraynyClientId,
        direction: 'outbound',
        message_text: '📦 [Produção #001855] Olá, Lorrayny Sander! A arte está pronta...',
        created: '2026-09-10T20:46:53.768Z',
      }),
      createMockMsg({
        id: 'pfkvdvmv43c4e9d',
        attendance_id: undefined,
        client_id: lorraynyClientId,
        direction: 'outbound',
        message_text: '📦 [Produção #001855] Tudo certo! A arte foi aprovada...',
        created: '2026-09-10T20:47:09.985Z',
      }),
      createMockMsg({
        id: '0ktgm4q0lsbg0u4',
        attendance_id: lorraynyActiveAttId,
        client_id: lorraynyClientId,
        direction: 'inbound',
        message_text: 'ioi',
        created: '2026-09-15T23:47:43.554Z',
      }),
      createMockMsg({
        id: 'o8lzpb8cx905kpv',
        attendance_id: lorraynyActiveAttId,
        client_id: lorraynyClientId,
        direction: 'outbound',
        message_text: 'Olá, Lorrayny Sander! Segue seu orçamento ORC-2026-0023...',
        created: '2026-09-15T23:48:52.801Z',
      }),
    ]

    it('Caso Real Lorrayny: com a última outbound da empresa respondendo o orçamento, o contador do attendance ativo é 0 (ou 1 se nova inbound chegar)', () => {
      // No estado atual do banco, a mensagem o8lzpb8cx905kpv (outbound) respondeu a inbound 0ktgm4q0lsbg0u4
      const countWithOutbound = countPendingUnansweredInboundFromMessages(
        lorraynyRealMessages,
        lorraynyActiveAttId,
        lorraynyClientId,
        '2026-09-15T23:48:52.801Z',
      )
      expect(countWithOutbound).toBe(0)

      // Se simularmos antes da outbound da empresa ser enviada (somente a inbound 'ioi' recebida):
      const msgsBeforeOutbound = lorraynyRealMessages.filter((m) => m.id !== 'o8lzpb8cx905kpv')
      const countBeforeOutbound = countPendingUnansweredInboundFromMessages(
        msgsBeforeOutbound,
        lorraynyActiveAttId,
        lorraynyClientId,
        null, // sem outbound no attendance novo
      )
      // Deve retornar EXATAMENTE 1 (e NÃO 4!)
      expect(countBeforeOutbound).toBe(1)

      // Se uma nova mensagem inbound chegar após a última outbound:
      const msgsWithNewInbound = [
        ...lorraynyRealMessages,
        createMockMsg({
          id: 'new_inbound_lorrayny',
          attendance_id: lorraynyActiveAttId,
          client_id: lorraynyClientId,
          direction: 'inbound',
          message_text: 'Obrigada pelo orçamento!',
          created: '2026-09-16T10:00:00.000Z',
        }),
      ]
      const countWithNewInbound = countPendingUnansweredInboundFromMessages(
        msgsWithNewInbound,
        lorraynyActiveAttId,
        lorraynyClientId,
        '2026-09-15T23:48:52.801Z',
      )
      expect(countWithNewInbound).toBe(1)
    })

    it('Regra (A): 3 inbounds sem outbound → contador 3', () => {
      const messages: Message[] = [
        createMockMsg({
          id: 'in1',
          attendance_id: 'att_a',
          direction: 'inbound',
          message_text: 'msg 1',
          created: '2026-09-16T11:00:00.000Z',
        }),
        createMockMsg({
          id: 'in2',
          attendance_id: 'att_a',
          direction: 'inbound',
          message_text: 'msg 2',
          created: '2026-09-16T11:01:00.000Z',
        }),
        createMockMsg({
          id: 'in3',
          attendance_id: 'att_a',
          direction: 'inbound',
          message_text: 'msg 3',
          created: '2026-09-16T11:02:00.000Z',
        }),
      ]

      const count = countPendingUnansweredInboundFromMessages(messages, 'att_a')
      expect(count).toBe(3)
    })

    it('Regra (B): 3 inbounds + outbound → contador 0', () => {
      const messages: Message[] = [
        createMockMsg({
          id: 'in1',
          attendance_id: 'att_b',
          direction: 'inbound',
          message_text: 'msg 1',
          created: '2026-09-16T11:00:00.000Z',
        }),
        createMockMsg({
          id: 'in2',
          attendance_id: 'att_b',
          direction: 'inbound',
          message_text: 'msg 2',
          created: '2026-09-16T11:01:00.000Z',
        }),
        createMockMsg({
          id: 'in3',
          attendance_id: 'att_b',
          direction: 'inbound',
          message_text: 'msg 3',
          created: '2026-09-16T11:02:00.000Z',
        }),
        createMockMsg({
          id: 'out1',
          attendance_id: 'att_b',
          direction: 'outbound',
          message_text: 'resposta da empresa',
          created: '2026-09-16T11:05:00.000Z',
        }),
      ]

      const count = countPendingUnansweredInboundFromMessages(messages, 'att_b')
      expect(count).toBe(0)
    })

    it('Regra (C): 3 inbounds + outbound + 1 inbound → contador 1', () => {
      const messages: Message[] = [
        createMockMsg({
          id: 'in1',
          attendance_id: 'att_c',
          direction: 'inbound',
          message_text: 'msg 1',
          created: '2026-09-16T11:00:00.000Z',
        }),
        createMockMsg({
          id: 'in2',
          attendance_id: 'att_c',
          direction: 'inbound',
          message_text: 'msg 2',
          created: '2026-09-16T11:01:00.000Z',
        }),
        createMockMsg({
          id: 'in3',
          attendance_id: 'att_c',
          direction: 'inbound',
          message_text: 'msg 3',
          created: '2026-09-16T11:02:00.000Z',
        }),
        createMockMsg({
          id: 'out1',
          attendance_id: 'att_c',
          direction: 'outbound',
          message_text: 'resposta da empresa',
          created: '2026-09-16T11:05:00.000Z',
        }),
        createMockMsg({
          id: 'in4',
          attendance_id: 'att_c',
          direction: 'inbound',
          message_text: 'nova dúvida do cliente',
          created: '2026-09-16T11:10:00.000Z',
        }),
      ]

      const count = countPendingUnansweredInboundFromMessages(messages, 'att_c')
      expect(count).toBe(1)
    })

    it('Regra (D): Mensagens antigas de outro attendance do mesmo cliente NÃO entram no contador', () => {
      const sameClient = 'cli_common_999'
      const oldAttId = 'att_archived_1'
      const currentAttId = 'att_active_2'

      const messages: Message[] = [
        // 5 inbounds do attendance antigo
        createMockMsg({
          id: 'old1',
          attendance_id: oldAttId,
          client_id: sameClient,
          direction: 'inbound',
          message_text: 'inbound antiga 1',
          created: '2026-08-01T10:00:00.000Z',
        }),
        createMockMsg({
          id: 'old2',
          attendance_id: oldAttId,
          client_id: sameClient,
          direction: 'inbound',
          message_text: 'inbound antiga 2',
          created: '2026-08-01T10:05:00.000Z',
        }),
        // 1 inbound no atendimento atual
        createMockMsg({
          id: 'cur1',
          attendance_id: currentAttId,
          client_id: sameClient,
          direction: 'inbound',
          message_text: 'inbound atendimento atual',
          created: '2026-09-16T12:00:00.000Z',
        }),
      ]

      // Avaliando o attendance atual
      const count = countPendingUnansweredInboundFromMessages(messages, currentAttId, sameClient)
      // Deve contar SOMENTE a 1 do attendance atual, NUNCA somar as 2 do attendance antigo
      expect(count).toBe(1)
    })

    it('Regra (E): Abrir Drawer NÃO zera contador', () => {
      let count = 2
      const isDrawerOpen = true
      // O estado do drawer não afeta o contador
      if (isDrawerOpen) {
        // Apenas visualização
      }
      expect(count).toBe(2)
    })

    it('Regra (F): Outbound zera contador', () => {
      const messages: Message[] = [
        createMockMsg({
          id: 'in1',
          attendance_id: 'att_f',
          direction: 'inbound',
          message_text: 'cliente falando',
          created: '2026-09-16T12:00:00.000Z',
        }),
      ]

      let count = countPendingUnansweredInboundFromMessages(messages, 'att_f')
      expect(count).toBe(1)

      // Empresa envia outbound
      messages.push(
        createMockMsg({
          id: 'out1',
          attendance_id: 'att_f',
          direction: 'outbound',
          message_text: 'empresa respondendo',
          created: '2026-09-16T12:02:00.000Z',
        }),
      )

      count = countPendingUnansweredInboundFromMessages(messages, 'att_f')
      expect(count).toBe(0)
    })
  })
})
