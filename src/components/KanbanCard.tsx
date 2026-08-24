import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Clock, Sparkles, Tag, ExternalLink, Star, Archive, Package } from 'lucide-react'
import type { Client, Priority, KanbanColumn, SlaConfig } from '@/types/crm'
import { calculateSlaInfo, formatCurrency, getWhatsAppDirectUrl } from '@/lib/sla'
import { toast } from '@/hooks/use-toast'
import ProductionOrderModal from './ProductionOrderModal'

interface KanbanCardProps {
  client: Client
  slaConfig: SlaConfig
  column?: KanbanColumn
  onClick: () => void
  onOpenChat: (e: React.MouseEvent) => void
  onCompleteAndArchive?: (client: Client, e: React.MouseEvent) => void
  onDragStart?: (e: React.DragEvent) => void
}

export default function KanbanCard({
  client,
  slaConfig,
  column,
  onClick,
  onOpenChat,
  onCompleteAndArchive,
  onDragStart,
}: KanbanCardProps) {
  const [productionModalOpen, setProductionModalOpen] = React.useState(false)
  const slaInfo = calculateSlaInfo(
    client.last_message_at,
    client.last_message_direction,
    client.stage,
    slaConfig,
  )

  const priorityColors: Record<Priority, string> = {
    urgente: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300',
    alta: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
    media: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
    baixa: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  }

  const priorityLabels: Record<Priority, string> = {
    urgente: 'Urgente',
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa',
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  const copyWhatsAppLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = getWhatsAppDirectUrl(
      client.phone,
      `Olá, ${client.name}! Tudo bem? Falamos da Gráfica Laletra.`,
    )
    navigator.clipboard.writeText(url)
    toast({
      title: 'Link copiado!',
      description: `Link do WhatsApp para ${client.name} copiado para a área de transferência.`,
    })
  }

  const isWon = client.stage === 'Venda fechada'
  const isLost = client.stage === 'Não fechou'
  const isFinalStage = isWon || isLost

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onClick={onClick}
        className={`group relative bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer select-none p-3.5 space-y-3 ${
          slaInfo.colorBorderClass
        }`}
      >
        {/* Top row: Priority Badge + SLA Badge */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {client.priority && (
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold px-2 py-0 uppercase tracking-wider ${
                  priorityColors[client.priority]
                }`}
              >
                {priorityLabels[client.priority]}
              </Badge>
            )}
          </div>

          {/* Dynamic SLA Badge */}
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${slaInfo.colorBadgeClass}`}
            title={`Tempo na etapa: ${slaInfo.minutesElapsed} minutos`}
          >
            <Clock className="h-3 w-3" />
            {slaInfo.label}
          </span>
        </div>

        {/* Client Name & Product */}
        <div className="space-y-1">
          <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight line-clamp-1 group-hover:text-emerald-600 transition-colors">
            {client.name}
          </h4>

          {client.product_interest ? (
            <div className="flex items-center text-xs text-slate-600 dark:text-slate-300 gap-1.5 font-medium">
              <Tag className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{client.product_interest}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Sem produto definido</p>
          )}
        </div>

        {/* Quote Value Badge */}
        {client.quote_value ? (
          <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/60">
            <span className="text-[10px] text-slate-500 font-medium">Orçamento:</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">
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

        {/* Quick Final Stage Action: Concluir & Arquivar button directly on final cards + Create Production Order */}
        {isFinalStage && (
          <div className="flex flex-col gap-1.5 pt-0.5">
            {isWon && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setProductionModalOpen(true)
                }}
                className="w-full py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
              >
                <Package className="h-3.5 w-3.5" />
                Criar Pedido de Produção
              </button>
            )}

            {onCompleteAndArchive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCompleteAndArchive(client, e)
                }}
                className={`w-full py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                  isWon
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-700 hover:bg-slate-800 text-white'
                }`}
              >
                <Archive className="h-3.5 w-3.5" />
                {isWon ? 'Concluir & Arquivar Venda' : 'Arquivar Atendimento'}
              </button>
            )}
          </div>
        )}

        {/* Bottom row: Assigned User + Direct WhatsApp Action */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div
            className="flex items-center space-x-1.5"
            title={`Responsável: ${client.expand?.assigned_to?.name || 'Não atribuído'}`}
          >
            <Avatar className="h-6 w-6 text-[10px] border border-slate-200 dark:border-slate-700">
              <AvatarFallback>
                {getInitials(client.expand?.assigned_to?.name || 'LA')}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-slate-500 truncate max-w-[90px]">
              {client.expand?.assigned_to?.name?.split(' ')[0] || 'Atendente'}
            </span>
          </div>

          <div className="flex items-center space-x-1">
            {!isFinalStage && onCompleteAndArchive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCompleteAndArchive(client, e)
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Concluir e arquivar atendimento"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={copyWhatsAppLink}
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Copiar Link de Atendimento WhatsApp"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>

            <a
              href={getWhatsAppDirectUrl(client.phone)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Abrir WhatsApp Web"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      <ProductionOrderModal
        isOpen={productionModalOpen}
        onClose={() => setProductionModalOpen(false)}
        onSaved={() => {
          setProductionModalOpen(false)
          window.dispatchEvent(new CustomEvent('production-order-updated'))
        }}
        prefillData={{
          clientId: client.id,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email,
          product: client.product_interest || '',
          quoteValue: client.quote_value,
          notes: client.notes,
        }}
      />
    </>
  )
}
