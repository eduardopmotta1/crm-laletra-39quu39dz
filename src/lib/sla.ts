import pb from '@/lib/pocketbase/client'
import type { Attendance, Client, Message, SlaConfig, SlaInfo } from '@/types/crm'

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  urgentMinutes: 1440, // 24h
  warningMinutes: 720, // 12h
  noticeMinutes: 360, // 6h
  urgentHours: 24,
  warningHours: 12,
  noticeHours: 6,
}

/**
 * Calculates how long a client has been waiting for response and maps to SLA levels in minutes:
 * - Green / normal: < noticeMinutes or outbound message
 * - Yellow / notice: >= noticeMinutes and < warningMinutes (default >= 360min)
 * - Orange / warning: >= warningMinutes and < urgentMinutes (default >= 720min)
 * - Red / urgent: >= urgentMinutes (default >= 1440min)
 */
export function calculateSlaInfo(
  lastMessageAt?: string,
  lastMessageDirection?: 'inbound' | 'outbound',
  stage?: string,
  config: SlaConfig = DEFAULT_SLA_CONFIG,
  nowTimestamp?: number,
): SlaInfo {
  const urgentMins = config.urgentMinutes ?? (config.urgentHours ? config.urgentHours * 60 : 1440)
  const warningMins =
    config.warningMinutes ?? (config.warningHours ? config.warningHours * 60 : 720)
  const noticeMins = config.noticeMinutes ?? (config.noticeHours ? config.noticeHours * 60 : 360)

  // If no last message, or already closed/won, or last message was outbound, they are not waiting for our answer
  if (!lastMessageAt) {
    return {
      status: 'normal',
      minutesElapsed: 0,
      hoursElapsed: 0,
      label: 'Sem mensagens',
      colorBadgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      colorBorderClass: 'border-slate-200 dark:border-slate-800',
      colorBgClass: 'bg-slate-50/50',
      colorTextClass: 'text-slate-600',
    }
  }

  const messageTime = new Date(lastMessageAt).getTime()
  const now = nowTimestamp ?? Date.now()
  const diffMinutes = Math.max(0, Math.floor((now - messageTime) / (1000 * 60)))
  const diffHours = Math.round(diffMinutes / 60)

  // If stage is already finalized, don't trigger urgent SLA alert
  if (stage === 'Venda fechada' || stage === 'Não fechou') {
    return {
      status: 'normal',
      minutesElapsed: diffMinutes,
      hoursElapsed: diffHours,
      label: 'Atendimento finalizado',
      colorBadgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      colorBorderClass: 'border-slate-200 dark:border-slate-800',
      colorBgClass: '',
      colorTextClass: 'text-slate-500',
    }
  }

  // Outbound message: Graphic team was the last to respond, waiting for client response!
  if (lastMessageDirection === 'outbound') {
    if (diffMinutes >= urgentMins) {
      return {
        status: 'urgent',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `Cliente não responde há ${formatMinutes(diffMinutes)}`,
        colorBadgeClass: 'bg-rose-500 text-white font-semibold animate-pulse shadow-sm',
        colorBorderClass: 'border-rose-500 ring-2 ring-rose-500/30',
        colorBgClass: 'bg-rose-50/80 dark:bg-rose-950/20',
        colorTextClass: 'text-rose-600 dark:text-rose-400',
      }
    }

    if (diffMinutes >= warningMins) {
      return {
        status: 'warning',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `Cliente não responde há ${formatMinutes(diffMinutes)}`,
        colorBadgeClass: 'bg-amber-500 text-white font-semibold shadow-sm',
        colorBorderClass: 'border-amber-400 ring-1 ring-amber-400/40',
        colorBgClass: 'bg-amber-50/70 dark:bg-amber-950/20',
        colorTextClass: 'text-amber-600 dark:text-amber-400',
      }
    }

    if (diffMinutes >= noticeMins) {
      return {
        status: 'notice',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `Cliente não responde há ${formatMinutes(diffMinutes)}`,
        colorBadgeClass: 'bg-yellow-400 text-yellow-950 font-medium',
        colorBorderClass: 'border-yellow-300',
        colorBgClass: 'bg-yellow-50/50 dark:bg-yellow-950/10',
        colorTextClass: 'text-yellow-700 dark:text-yellow-400',
      }
    }

    return {
      status: 'normal',
      minutesElapsed: diffMinutes,
      hoursElapsed: diffHours,
      label: `Respondido há ${formatMinutes(diffMinutes)}`,
      colorBadgeClass:
        'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      colorBorderClass: 'border-slate-200 dark:border-slate-800',
      colorBgClass: '',
      colorTextClass: 'text-emerald-600 dark:text-emerald-400',
    }
  }

  // Inbound message: Client is waiting for graphic team response!
  if (diffMinutes >= urgentMins) {
    return {
      status: 'urgent',
      minutesElapsed: diffMinutes,
      hoursElapsed: diffHours,
      label: `SLA Crítico: ${formatMinutes(diffMinutes)} sem resposta`,
      colorBadgeClass: 'bg-rose-500 text-white font-semibold animate-pulse shadow-sm',
      colorBorderClass: 'border-rose-500 ring-2 ring-rose-500/30',
      colorBgClass: 'bg-rose-50/80 dark:bg-rose-950/20',
      colorTextClass: 'text-rose-600 dark:text-rose-400',
    }
  }

  if (diffMinutes >= warningMins) {
    return {
      status: 'warning',
      minutesElapsed: diffMinutes,
      hoursElapsed: diffHours,
      label: `SLA Alerta: ${formatMinutes(diffMinutes)} aguardando`,
      colorBadgeClass: 'bg-amber-500 text-white font-semibold shadow-sm',
      colorBorderClass: 'border-amber-400 ring-1 ring-amber-400/40',
      colorBgClass: 'bg-amber-50/70 dark:bg-amber-950/20',
      colorTextClass: 'text-amber-600 dark:text-amber-400',
    }
  }

  if (diffMinutes >= noticeMins) {
    return {
      status: 'notice',
      minutesElapsed: diffMinutes,
      hoursElapsed: diffHours,
      label: `SLA Atenção: ${formatMinutes(diffMinutes)} aguardando`,
      colorBadgeClass: 'bg-yellow-400 text-yellow-950 font-medium',
      colorBorderClass: 'border-yellow-300',
      colorBgClass: 'bg-yellow-50/50 dark:bg-yellow-950/10',
      colorTextClass: 'text-yellow-700 dark:text-yellow-400',
    }
  }

  return {
    status: 'normal',
    minutesElapsed: diffMinutes,
    hoursElapsed: diffHours,
    label: `Aguardando há ${formatMinutes(diffMinutes)}`,
    colorBadgeClass:
      'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    colorBorderClass: 'border-slate-200 dark:border-slate-800',
    colorBgClass: '',
    colorTextClass: 'text-blue-600 dark:text-blue-400',
  }
}

/**
 * Determina se um atendimento está ativamente aguardando resposta da equipe
 * e calcula o SLA baseado na PRIMEIRA mensagem inbound recebida após a última resposta da equipe.
 *
 * Regras:
 * 1. Se stage for 'Venda fechada' ou 'Não fechou': atendimento finalizado (sem SLA ativo).
 * 2. Se lastCompanyMessageAt existir e não houver inbound posterior a ela (ou firstUnansweredInboundAt for null):
 *    a equipe respondeu por último -> estado "Aguardando cliente" / sem espera ativa da equipe.
 * 3. Se houver mensagens inbound após lastCompanyMessageAt:
 *    o início do SLA é a PRIMEIRA mensagem inbound dessa sequência (firstUnansweredInboundAt).
 *    Segundas ou terceiras inbounds NÃO reiniciam o SLA.
 * 4. Quando a equipe envia outbound, encerra imediatamente o SLA ativo.
 */
export function calculateWaitingSlaInfo(params: {
  firstUnansweredInboundAt?: string | null
  lastCompanyMessageAt?: string | null
  lastCustomerMessageAt?: string | null
  stage?: string
  config?: SlaConfig
  nowTimestamp?: number
}): SlaInfo {
  const {
    firstUnansweredInboundAt,
    lastCompanyMessageAt,
    lastCustomerMessageAt,
    stage,
    config = DEFAULT_SLA_CONFIG,
    nowTimestamp,
  } = params

  const urgentMins = config.urgentMinutes ?? (config.urgentHours ? config.urgentHours * 60 : 1440)
  const warningMins =
    config.warningMinutes ?? (config.warningHours ? config.warningHours * 60 : 720)
  const noticeMins = config.noticeMinutes ?? (config.noticeHours ? config.noticeHours * 60 : 360)
  const now = nowTimestamp ?? Date.now()

  // 1. Etapa finalizada
  if (stage === 'Venda fechada' || stage === 'Não fechou') {
    return {
      status: 'normal',
      minutesElapsed: 0,
      hoursElapsed: 0,
      label: 'Atendimento finalizado',
      colorBadgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      colorBorderClass: 'border-slate-200 dark:border-slate-800',
      colorBgClass: '',
      colorTextClass: 'text-slate-500',
    }
  }

  // 2. Se temos firstUnansweredInboundAt explícito (calculado das mensagens)
  if (firstUnansweredInboundAt) {
    const startTime = new Date(firstUnansweredInboundAt).getTime()
    const diffMinutes = Math.max(0, Math.floor((now - startTime) / (1000 * 60)))
    const diffHours = Math.round(diffMinutes / 60)

    if (diffMinutes >= urgentMins) {
      return {
        status: 'urgent',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `SLA Crítico: ${formatMinutes(diffMinutes)} sem resposta`,
        colorBadgeClass: 'bg-rose-500 text-white font-semibold animate-pulse shadow-sm',
        colorBorderClass: 'border-rose-500 ring-2 ring-rose-500/30',
        colorBgClass: 'bg-rose-50/80 dark:bg-rose-950/20',
        colorTextClass: 'text-rose-600 dark:text-rose-400',
      }
    }

    if (diffMinutes >= warningMins) {
      return {
        status: 'warning',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `SLA Alerta: ${formatMinutes(diffMinutes)} aguardando`,
        colorBadgeClass: 'bg-amber-500 text-white font-semibold shadow-sm',
        colorBorderClass: 'border-amber-400 ring-1 ring-amber-400/40',
        colorBgClass: 'bg-amber-50/70 dark:bg-amber-950/20',
        colorTextClass: 'text-amber-600 dark:text-amber-400',
      }
    }

    if (diffMinutes >= noticeMins) {
      return {
        status: 'notice',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `SLA Atenção: ${formatMinutes(diffMinutes)} aguardando`,
        colorBadgeClass: 'bg-yellow-400 text-yellow-950 font-medium',
        colorBorderClass: 'border-yellow-300',
        colorBgClass: 'bg-yellow-50/50 dark:bg-yellow-950/10',
        colorTextClass: 'text-yellow-700 dark:text-yellow-400',
      }
    }

    return {
      status: 'normal',
      minutesElapsed: diffMinutes,
      hoursElapsed: diffHours,
      label: `Aguardando há ${formatMinutes(diffMinutes)}`,
      colorBadgeClass:
        'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
      colorBorderClass: 'border-slate-200 dark:border-slate-800',
      colorBgClass: '',
      colorTextClass: 'text-blue-600 dark:text-blue-400',
    }
  }

  // 3. Se explicitamente sabemos que NÃO há inbound não respondida (firstUnansweredInboundAt === null)
  // ou se lastCompanyMessageAt existe e é mais recente que lastCustomerMessageAt
  const companyTime = lastCompanyMessageAt ? new Date(lastCompanyMessageAt).getTime() : 0
  const customerTime = lastCustomerMessageAt ? new Date(lastCustomerMessageAt).getTime() : 0

  if (firstUnansweredInboundAt === null || (companyTime > 0 && companyTime >= customerTime)) {
    // Equipe respondeu e o cliente ainda não enviou nova mensagem
    const diffMinutes =
      companyTime > 0 ? Math.max(0, Math.floor((now - companyTime) / (1000 * 60))) : 0
    const diffHours = Math.round(diffMinutes / 60)

    return {
      status: 'normal',
      minutesElapsed: diffMinutes,
      hoursElapsed: diffHours,
      label:
        diffMinutes > 0
          ? `Aguardando cliente há ${formatMinutes(diffMinutes)}`
          : 'Aguardando cliente',
      colorBadgeClass:
        'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      colorBorderClass: 'border-slate-200 dark:border-slate-800',
      colorBgClass: '',
      colorTextClass: 'text-emerald-600 dark:text-emerald-400',
    }
  }

  // 4. Fallback se não temos firstUnansweredInboundAt carregado ainda, mas customerTime > companyTime
  if (customerTime > 0 && customerTime > companyTime) {
    const diffMinutes = Math.max(0, Math.floor((now - customerTime) / (1000 * 60)))
    const diffHours = Math.round(diffMinutes / 60)

    if (diffMinutes >= urgentMins) {
      return {
        status: 'urgent',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `SLA Crítico: ${formatMinutes(diffMinutes)} sem resposta`,
        colorBadgeClass: 'bg-rose-500 text-white font-semibold animate-pulse shadow-sm',
        colorBorderClass: 'border-rose-500 ring-2 ring-rose-500/30',
        colorBgClass: 'bg-rose-50/80 dark:bg-rose-950/20',
        colorTextClass: 'text-rose-600 dark:text-rose-400',
      }
    }

    if (diffMinutes >= warningMins) {
      return {
        status: 'warning',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `SLA Alerta: ${formatMinutes(diffMinutes)} aguardando`,
        colorBadgeClass: 'bg-amber-500 text-white font-semibold shadow-sm',
        colorBorderClass: 'border-amber-400 ring-1 ring-amber-400/40',
        colorBgClass: 'bg-amber-50/70 dark:bg-amber-950/20',
        colorTextClass: 'text-amber-600 dark:text-amber-400',
      }
    }

    if (diffMinutes >= noticeMins) {
      return {
        status: 'notice',
        minutesElapsed: diffMinutes,
        hoursElapsed: diffHours,
        label: `SLA Atenção: ${formatMinutes(diffMinutes)} aguardando`,
        colorBadgeClass: 'bg-yellow-400 text-yellow-950 font-medium',
        colorBorderClass: 'border-yellow-300',
        colorBgClass: 'bg-yellow-50/50 dark:bg-yellow-950/10',
        colorTextClass: 'text-yellow-700 dark:text-yellow-400',
      }
    }

    return {
      status: 'normal',
      minutesElapsed: diffMinutes,
      hoursElapsed: diffHours,
      label: `Aguardando há ${formatMinutes(diffMinutes)}`,
      colorBadgeClass:
        'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
      colorBorderClass: 'border-slate-200 dark:border-slate-800',
      colorBgClass: '',
      colorTextClass: 'text-blue-600 dark:text-blue-400',
    }
  }

  // 5. Sem histórico de mensagens
  return {
    status: 'normal',
    minutesElapsed: 0,
    hoursElapsed: 0,
    label: 'Sem mensagens',
    colorBadgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    colorBorderClass: 'border-slate-200 dark:border-slate-800',
    colorBgClass: 'bg-slate-50/50',
    colorTextClass: 'text-slate-600',
  }
}

/**
 * Busca no backend a primeira mensagem inbound não respondida de um atendimento.
 * Critério:
 * - Se lastCompanyMessageAt existir: busca mensagens inbound com created > lastCompanyMessageAt ordenadas crescentemente por created.
 * - Se lastCompanyMessageAt não existir: busca a primeira mensagem inbound de todas do atendimento.
 * - Se houver mensagens outbound posteriores à inbound mais recente, retorna null (já respondido).
 */
export async function fetchFirstUnansweredInbound(
  attendanceId: string,
  lastCompanyMessageAt?: string | null,
  clientId?: string,
): Promise<string | null> {
  if (!attendanceId && !clientId) return null

  try {
    let resolvedLastCompanyAt = lastCompanyMessageAt || null

    // Se attendanceId estiver presente, o attendance é a fronteira estrita.
    // Primeiro buscar se existe outbound registrada nas mensagens do atendimento mais recente que lastCompanyMessageAt
    if (attendanceId) {
      try {
        const lastOutboundRes = await pb.collection<Message>('messages').getList(1, 1, {
          filter: `attendance_id = "${attendanceId}" && direction = "outbound"`,
          sort: '-created',
          requestKey: null,
          fields: 'created',
        })
        if (lastOutboundRes.items.length > 0) {
          const latestOutboundCreated = lastOutboundRes.items[0].created
          if (
            !resolvedLastCompanyAt ||
            new Date(latestOutboundCreated).getTime() > new Date(resolvedLastCompanyAt).getTime()
          ) {
            resolvedLastCompanyAt = latestOutboundCreated
          }
        }
      } catch {
        // Fallback para resolvedLastCompanyAt
      }
    }

    const filters: string[] = ['direction = "inbound"']
    if (attendanceId) {
      filters.push(`attendance_id = "${attendanceId}"`)
    } else if (clientId) {
      filters.push(`client_id = "${clientId}"`)
    }

    if (resolvedLastCompanyAt) {
      filters.push(`created > "${resolvedLastCompanyAt}"`)
    }

    const res = await pb.collection<Message>('messages').getList(1, 1, {
      filter: filters.join(' && '),
      sort: 'created',
      requestKey: null,
    })

    if (res.items.length > 0) {
      return res.items[0].created
    }

    return null
  } catch (err) {
    console.error('Error fetching first unanswered inbound message for SLA:', err)
    return null
  }
}

/**
 * Helper para calcular firstUnansweredInbound a partir de uma lista local de mensagens já carregadas.
 * ATTENDANCE É A FRONTEIRA: quando attendanceId é fornecido, avalia estritamente mensagens
 * pertencentes àquele attendance (m.attendance_id === attendanceId).
 */
export function resolveFirstUnansweredInboundFromMessages(
  messages: Message[],
  attendanceId?: string,
  clientId?: string,
  lastCompanyMessageAt?: string | null,
): string | null {
  if (!messages || messages.length === 0) return null

  // ATTENDANCE É A FRONTEIRA: se attendanceId estiver presente, filtrar estritamente por ele.
  // Somente se attendanceId NÃO estiver presente usa clientId como fallback.
  const relevant = messages.filter((m) => {
    if (attendanceId) return m.attendance_id === attendanceId
    if (clientId) return m.client_id === clientId
    return false
  })

  if (relevant.length === 0) return null

  // Ordenar mensagens crescentemente por created
  const sorted = [...relevant].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
  )

  // Encontrar o timestamp da última outbound da equipe
  let lastOutboundEpoch = lastCompanyMessageAt ? new Date(lastCompanyMessageAt).getTime() : 0

  for (const m of sorted) {
    if (m.direction === 'outbound') {
      const t = new Date(m.created).getTime()
      if (t > lastOutboundEpoch) {
        lastOutboundEpoch = t
      }
    }
  }

  // Procurar a PRIMEIRA mensagem inbound com created > lastOutboundEpoch
  for (const m of sorted) {
    if (m.direction === 'inbound') {
      const t = new Date(m.created).getTime()
      if (t > lastOutboundEpoch) {
        return m.created
      }
    }
  }

  return null
}

/**
 * CÁLCULO DERIVADO DE MENSAGENS INBOUND PENDENTES:
 * Conta quantas mensagens inbound do cliente estão aguardando resposta da empresa
 * naquele attendance.
 *
 * ATTENDANCE É A FRONTEIRA:
 * Quando attendanceId é informado, a contagem é estritamente do attendance.
 * NÃO soma mensagens de outros attendances do mesmo cliente nem mensagens órfãs.
 * Somente quando attendanceId não existe (ex: cliente sem attendance criado ainda), usa clientId como fallback.
 *
 * Regras de contagem:
 * - Localiza a última mensagem OUTBOUND daquele attendance (ou lastCompanyMessageAt).
 * - Conta SOMENTE mensagens INBOUND daquele attendance onde created > created da última outbound.
 * - Se não houver outbound no attendance: conta todas as mensagens INBOUND daquele attendance.
 * - Se houver outbound mais recente que todas as inbounds: retorna 0 (empresa respondeu).
 * - A contagem NÃO é zerada pela simples abertura do Drawer; somente nova outbound encerra o ciclo.
 */
export function countPendingUnansweredInboundFromMessages(
  messages: Message[],
  attendanceId?: string,
  clientId?: string,
  lastCompanyMessageAt?: string | null,
): number {
  if (!messages || messages.length === 0) return 0

  // ATTENDANCE É A FRONTEIRA: se attendanceId estiver presente, filtrar estritamente por ele.
  // Somente usa clientId se attendanceId não for especificado.
  const relevant = messages.filter((m) => {
    if (attendanceId) return m.attendance_id === attendanceId
    if (clientId) return m.client_id === clientId
    return false
  })

  if (relevant.length === 0) return 0

  let lastOutboundEpoch = lastCompanyMessageAt ? new Date(lastCompanyMessageAt).getTime() : 0

  for (const m of relevant) {
    if (m.direction === 'outbound') {
      const t = new Date(m.created).getTime()
      if (t > lastOutboundEpoch) {
        lastOutboundEpoch = t
      }
    }
  }

  let count = 0
  for (const m of relevant) {
    if (m.direction === 'inbound') {
      const t = new Date(m.created).getTime()
      if (t > lastOutboundEpoch) {
        count++
      }
    }
  }

  return count
}

/**
 * Consulta no backend a quantidade de mensagens inbound não respondidas para um attendance aberto.
 * ATTENDANCE É A FRONTEIRA:
 * - Filtra estritamente por attendance_id quando attendanceId é fornecido (não soma outros attendances do client_id).
 * - Identifica a última outbound daquele attendance e conta apenas inbounds criadas posteriormente.
 */
export async function fetchPendingInboundCount(
  attendanceId: string,
  lastCompanyMessageAt?: string | null,
  clientId?: string,
): Promise<number> {
  if (!attendanceId && !clientId) return 0

  try {
    let resolvedLastCompanyAt = lastCompanyMessageAt || null

    // Se attendanceId estiver presente, buscar se existe outbound no banco para este attendance
    // para garantir o corte exato mesmo se lastCompanyMessageAt estiver desatualizado ou nulo
    if (attendanceId) {
      try {
        const lastOutboundRes = await pb.collection<Message>('messages').getList(1, 1, {
          filter: `attendance_id = "${attendanceId}" && direction = "outbound"`,
          sort: '-created',
          requestKey: null,
          fields: 'created',
        })
        if (lastOutboundRes.items.length > 0) {
          const latestOutboundCreated = lastOutboundRes.items[0].created
          if (
            !resolvedLastCompanyAt ||
            new Date(latestOutboundCreated).getTime() > new Date(resolvedLastCompanyAt).getTime()
          ) {
            resolvedLastCompanyAt = latestOutboundCreated
          }
        }
      } catch {
        // Fallback para resolvedLastCompanyAt
      }
    }

    const filters: string[] = ['direction = "inbound"']
    if (attendanceId) {
      // ATTENDANCE É A FRONTEIRA: nunca somar client_id quando attendanceId está presente
      filters.push(`attendance_id = "${attendanceId}"`)
    } else if (clientId) {
      filters.push(`client_id = "${clientId}"`)
    }

    if (resolvedLastCompanyAt) {
      filters.push(`created > "${resolvedLastCompanyAt}"`)
    }

    // Usar perPage 50 com getList para obter totalItems de forma barata
    const res = await pb.collection<Message>('messages').getList(1, 50, {
      filter: filters.join(' && '),
      requestKey: null,
      fields: 'id',
    })

    return res.totalItems ?? res.items.length
  } catch (err) {
    console.error('Error fetching pending inbound count:', err)
    return 0
  }
}

/**
 * Formats time in minutes (e.g. "30min", "120min", "1440min").
 */
export function formatMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  return `${rounded}min`
}

/**
 * Backward compatibility helper for formatHours
 */
export function formatHours(hours: number): string {
  return formatMinutes(hours * 60)
}

export function formatCurrency(value?: number): string {
  if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDimension(val: number): string {
  // e.g. 1.5 -> "1,50", 1.55 -> "1,55", 2 -> "2,00"
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Extrai resumo legível dos itens reais de um orçamento para ser usado em templates e mensagens.
 * Ex: "1x Banner Lona 440g (1.00x2.00m), 2x Adesivo Vinil" ou "Banner Lona 440g"
 */
export function formatQuoteItemsSummary(
  items?: Array<{
    product_name?: string
    quantity?: number
    width?: number
    height?: number
    linear_meters?: number
    additionals?: Array<{ name?: string; quantity?: number }>
  }>,
): string {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return 'itens sob medida'
  }

  const summaries = items
    .map((item) => {
      const name = (item.product_name || 'Item').trim()
      const qty = item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ''

      let dimension = ''
      if (item.width && item.height && item.width > 0 && item.height > 0) {
        dimension = ` (${formatDimension(item.width)}x${formatDimension(item.height)}m)`
      } else if (item.linear_meters && item.linear_meters > 0) {
        dimension = ` (${formatDimension(item.linear_meters)}m linear)`
      }

      return `${qty}${name}${dimension}`
    })
    .filter(Boolean)

  return summaries.join(', ') || 'itens sob medida'
}

export function formatQuoteWhatsAppMessage(
  quote: {
    code: string
    public_token?: string
    client_name?: string
    items?: Array<{
      product_name?: string
      quantity?: number
      width?: number
      height?: number
      linear_meters?: number
      applied_unit_price?: number
      calculated_unit_price?: number
      item_total_sale?: number
      notes?: string
      additionals?: Array<{
        name?: string
        quantity?: number
        unit_sale?: number
        total_sale?: number
      }>
    }>
    final_total?: number
    total_sale?: number
  },
  clientName?: string,
): string {
  const name = (clientName || quote.client_name || '').trim()
  const greetingName = name || 'cliente'
  const totalVal =
    quote.final_total !== undefined && quote.final_total !== null
      ? quote.final_total
      : quote.total_sale || 0

  const origin =
    typeof window !== 'undefined' && window.location.origin ? window.location.origin : ''
  const publicQuoteUrl =
    quote.public_token && quote.public_token.trim()
      ? `${origin}/orcamento/${quote.public_token.trim()}`
      : ''

  const lines: string[] = []
  lines.push(`Olá, ${greetingName}! Segue seu orçamento ${quote.code}.`)
  lines.push('')

  if (Array.isArray(quote.items) && quote.items.length > 0) {
    lines.push('Itens do orçamento:')
    quote.items.forEach((item, index) => {
      const prodName = (item.product_name || `Item ${index + 1}`).trim()
      lines.push(`• ${prodName}`)

      const qty = item.quantity !== undefined && item.quantity !== null ? item.quantity : 1
      lines.push(`  Quantidade: ${qty}`)

      // Dimensions (width & height in meters)
      if (
        item.width !== undefined &&
        item.width !== null &&
        item.width > 0 &&
        item.height !== undefined &&
        item.height !== null &&
        item.height > 0
      ) {
        lines.push(`  Medidas: ${formatDimension(item.width)} x ${formatDimension(item.height)} m`)
      } else if (
        item.linear_meters !== undefined &&
        item.linear_meters !== null &&
        item.linear_meters > 0
      ) {
        lines.push(`  Medidas: ${formatDimension(item.linear_meters)} m lineares`)
      }

      // Unit value when available
      const unitVal = item.applied_unit_price ?? item.calculated_unit_price
      if (
        unitVal !== undefined &&
        unitVal !== null &&
        !isNaN(Number(unitVal)) &&
        Number(unitVal) > 0
      ) {
        lines.push(`  Valor unitário: ${formatCurrency(Number(unitVal))}`)
      }

      // Additionals if present
      if (Array.isArray(item.additionals) && item.additionals.length > 0) {
        const addNames = item.additionals
          .map((a) => {
            const addName = a.name?.trim()
            if (!addName) return null
            if (a.quantity && a.quantity > 1) {
              return `${addName} (${a.quantity}x)`
            }
            return addName
          })
          .filter(Boolean)
        if (addNames.length > 0) {
          lines.push(`  Acabamentos: ${addNames.join(', ')}`)
        }
      }

      // Item total value
      const itemVal =
        item.item_total_sale !== undefined && item.item_total_sale !== null
          ? item.item_total_sale
          : (unitVal || 0) * qty
      if (
        itemVal !== undefined &&
        itemVal !== null &&
        !isNaN(Number(itemVal)) &&
        Number(itemVal) > 0
      ) {
        lines.push(`  Subtotal item: ${formatCurrency(itemVal)}`)
      }
      lines.push('')
    })
  }

  lines.push(`Valor total: ${formatCurrency(totalVal)}`)

  if (publicQuoteUrl) {
    lines.push('')
    lines.push(`Você pode visualizar e responder pelo link: ${publicQuoteUrl}`)
  }

  return lines.join('\n')
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return isoString
  }
}

export function getWhatsAppDirectUrl(phone: string, message?: string): string {
  const cleanDigits = phone.replace(/\D/g, '')
  // Format with country code 55 if not present
  const fullPhone = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`
  const textParam = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${fullPhone}${textParam}`
}
