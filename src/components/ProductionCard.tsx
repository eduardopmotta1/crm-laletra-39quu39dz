import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Package,
  Layers,
  ShieldCheck,
  ExternalLink,
  Truck,
  Sparkles,
  FileText,
  User,
  Share2,
} from 'lucide-react'
import type { ProductionOrder, ProductionStage } from '@/types/crm'
import { productionService } from '@/services/production'
import { formatCurrency, getWhatsAppDirectUrl } from '@/lib/sla'
import { toast } from '@/hooks/use-toast'

interface ProductionCardProps {
  order: ProductionOrder
  stage?: ProductionStage
  onClick: () => void
  onOpenApprovalModal?: (order: ProductionOrder, e: React.MouseEvent) => void
  onDragStart?: (e: React.DragEvent) => void
}

export default function ProductionCard({
  order,
  stage,
  onClick,
  onOpenApprovalModal,
  onDragStart,
}: ProductionCardProps) {
  const deadlineInfo = productionService.calculateDeadlineStatus(
    order.promised_deadline,
    order.is_completed,
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
    if (!name) return 'PR'
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  const copyTrackingLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    const link = `${window.location.origin}/acompanhar/${order.tracking_token}`
    navigator.clipboard.writeText(link)
    toast({
      title: 'Link copiado!',
      description: `Link de acompanhamento público do pedido ${order.order_number} copiado para a área de transferência.`,
    })
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={`group relative bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer select-none p-3.5 space-y-3 ${deadlineInfo.cardBorderClass}`}
    >
      {/* Top row: Order Number + Priority Badge + Deadline Status Alert */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-extrabold text-xs text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-mono">
            {order.order_number}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] font-semibold px-2 py-0 uppercase tracking-wider ${
              priorityColors[order.priority || 'media']
            }`}
          >
            {priorityLabels[order.priority || 'media']}
          </Badge>

          {order.art_approved && (
            <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 flex items-center gap-0.5 font-bold">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Arte OK
            </Badge>
          )}
        </div>

        {/* Deadline Badge */}
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${deadlineInfo.badgeClass}`}
        >
          {deadlineInfo.status === 'overdue' ? (
            <AlertTriangle className="h-3 w-3 text-rose-600" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {deadlineInfo.label}
        </span>
      </div>

      {/* Product Name & Description */}
      <div className="space-y-1">
        <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight line-clamp-1 group-hover:text-emerald-600 transition-colors">
          {order.product}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {order.description || 'Sem especificações detalhadas'}
        </p>
      </div>

      {/* Client Name & Phone */}
      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80">
        <span className="font-semibold truncate max-w-[140px]">{order.client_name}</span>
        <span className="text-[11px] text-slate-400 font-mono">{order.client_phone}</span>
      </div>

      {/* Quantity, Dimensions & Value Summary */}
      <div className="grid grid-cols-2 gap-1 text-[11px]">
        {order.quantity && (
          <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
            <Package className="h-3 w-3 text-slate-400" />
            <span>
              Qtd: <strong>{order.quantity} un</strong>
            </span>
          </div>
        )}
        {order.dimensions && (
          <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 justify-end">
            <Layers className="h-3 w-3 text-slate-400" />
            <span className="truncate">{order.dimensions}</span>
          </div>
        )}
      </div>

      {order.total_value ? (
        <div className="flex items-baseline justify-between py-1 px-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
          <span className="text-[10px] text-slate-500 font-medium">Valor do Pedido:</span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(order.total_value)}
          </span>
        </div>
      ) : null}

      {/* Action for Approval if currently in awaiting_approval */}
      {order.stage_internal_id === 'awaiting_approval' && onOpenApprovalModal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenApprovalModal(order, e)
          }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-semibold transition-colors animate-pulse"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
          Registrar Decisão de Arte
        </button>
      )}

      {/* Tracking Code if Shipped */}
      {order.tracking_code && (
        <div className="flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 p-1.5 rounded-lg border border-blue-200 dark:border-blue-800 font-mono">
          <span className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {order.tracking_code}
          </span>
        </div>
      )}

      {/* Bottom Bar: Responsible info + Share tracking link + WhatsApp */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <div
          className="flex items-center space-x-1.5"
          title={`Resp: ${order.expand?.production_rep_id?.name || order.expand?.sales_rep_id?.name || 'Produção'}`}
        >
          <Avatar className="h-6 w-6 text-[10px] border border-slate-200 dark:border-slate-700 bg-emerald-100 text-emerald-800 font-semibold">
            <AvatarFallback>
              {getInitials(
                order.expand?.production_rep_id?.name || order.expand?.sales_rep_id?.name,
              )}
            </AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-slate-500 truncate max-w-[85px]">
            {order.expand?.production_rep_id?.name?.split(' ')[0] ||
              order.expand?.sales_rep_id?.name?.split(' ')[0] ||
              'Produção'}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={copyTrackingLink}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Copiar Link de Acompanhamento Público"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>

          <a
            href={getWhatsAppDirectUrl(order.client_phone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Abrir WhatsApp"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
