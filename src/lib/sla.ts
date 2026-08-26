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
