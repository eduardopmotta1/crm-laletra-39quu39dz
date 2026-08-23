import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Phone,
  Clock,
  MessageSquare,
  Calendar,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import type { Client, SlaConfig } from '@/types/crm'
import { calculateSlaInfo, formatCurrency, formatHours, getWhatsAppDirectUrl } from '@/lib/sla'

interface KanbanCardProps {
  client: Client
  slaConfig: SlaConfig
  onClick: () => void
  onOpenChat: (e: React.MouseEvent) => void
  onDragStart?: (e: React.DragEvent) => void
}

export default function KanbanCard({
  client,
  slaConfig,
  onClick,
  onOpenChat,
  onDragStart,
}: KanbanCardProps) {
  const sla = calculateSlaInfo(
    client.last_message_at,
    client.last_message_direction,
    client.stage,
    slaConfig,
  )

  const priorityColors: Record<string, string> = {
    urgente: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300',
    alta: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
    media: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
    baixa: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  }

  const priorityLabels: Record<string, string> = {
    urgente: 'Urgente',
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa',
  }

  const getInitials = (name?: string) => {
    if (!name) return 'AT'
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={`group relative bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer select-none p-3.5 space-y-3 ${
        sla.status === 'urgent'
          ? 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/20'
          : sla.status === 'warning'
            ? 'border-amber-400 ring-1 ring-amber-400/30'
            : 'border-slate-200/90 dark:border-slate-800 hover:border-emerald-500/50'
      }`}
    >
      {/* Top row: Priority badge + SLA indicator */}
      <div className="flex items-center justify-between gap-1">
        <Badge
          variant="outline"
          className={`text-[10px] font-semibold px-2 py-0 uppercase tracking-wider ${
            priorityColors[client.priority] || priorityColors.media
          }`}
        >
          {priorityLabels[client.priority] || 'Média'}
        </Badge>

        {/* SLA Status Badge */}
        {client.stage !== 'Venda fechada' && client.stage !== 'Não fechou' && (
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sla.colorBadgeClass}`}
            title={`Última mensagem: ${client.last_message_at || 'Sem registro'}`}
          >
            <Clock className="h-3 w-3" />
            {client.last_message_direction === 'inbound'
              ? `${sla.hoursElapsed}h aguardando`
              : 'Respondido'}
          </span>
        )}
      </div>

      {/* Client Name & Product */}
      <div className="space-y-1">
        <h4 className="font-semibold text-slate-900 dark:text-white text-sm leading-tight line-clamp-1 group-hover:text-emerald-600 transition-colors">
          {client.name}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {client.product_interest || 'Sem produto informado'}
        </p>
      </div>

      {/* Quote Value */}
      {client.quote_value ? (
        <div className="flex items-baseline justify-between py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <span className="text-[11px] text-slate-500 font-medium">Orçamento:</span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(client.quote_value)}
          </span>
        </div>
      ) : null}

      {/* Last Message Snippet */}
      {client.last_message_text && (
        <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50/80 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80 line-clamp-2 italic">
          "{client.last_message_text}"
        </div>
      )}

      {/* Bottom Bar: Assigned User + WhatsApp Direct Action */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <div
          className="flex items-center space-x-1.5"
          title={client.expand?.assigned_to?.name || 'Atendente'}
        >
          <Avatar className="h-6 w-6 text-[10px] border border-slate-200 dark:border-slate-700 bg-slate-100 text-slate-700 font-semibold">
            <AvatarFallback>{getInitials(client.expand?.assigned_to?.name)}</AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-slate-500 truncate max-w-[90px]">
            {client.expand?.assigned_to?.name?.split(' ')[0] || 'Geral'}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={onOpenChat}
            className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
            title="Abrir Chat do WhatsApp & Tarefas"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <a
            href={getWhatsAppDirectUrl(client.phone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Abrir no WhatsApp Web"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
