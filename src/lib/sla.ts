import pb from '@/lib/pocketbase/client'
import type { SlaConfig, SlaInfo } from '@/types/crm'

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
  const now = Date.now()
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

  const lines: string[] = []
  lines.push(`Olá, ${greetingName}! 😊`)
  lines.push('')
  lines.push('Segue seu orçamento:')
  lines.push('')
  lines.push(`📄 Orçamento ${quote.code}`)
  lines.push('')

  if (Array.isArray(quote.items) && quote.items.length > 0) {
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
        lines.push(`  Medida: ${formatDimension(item.width)} x ${formatDimension(item.height)} m`)
      } else if (
        item.linear_meters !== undefined &&
        item.linear_meters !== null &&
        item.linear_meters > 0
      ) {
        lines.push(`  Medida: ${formatDimension(item.linear_meters)} m lineares`)
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

      // Value
      const itemVal =
        item.item_total_sale !== undefined && item.item_total_sale !== null
          ? item.item_total_sale
          : (item.applied_unit_price || item.calculated_unit_price || 0) * qty
      lines.push(`  Valor: ${formatCurrency(itemVal)}`)
      lines.push('')
    })
  }

  lines.push(`Total do orçamento: ${formatCurrency(totalVal)}`)
  lines.push('')
  lines.push('Se estiver tudo certo, me avise por aqui para seguirmos com o pedido. 😊')

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
