import React, { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Package,
  Layers,
  ShieldCheck,
  ExternalLink,
  Truck,
  Share2,
  Archive,
  ChevronDown,
  ChevronUp,
  FileText,
  Tag,
  Sparkles,
  Paperclip,
  Palette,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ProductionOrder, ProductionStage } from '@/types/crm'
import type { Quote } from '@/types/quotes'
import { productionService } from '@/services/production'
import { formatCurrency, getWhatsAppDirectUrl } from '@/lib/sla'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/hooks/use-toast'
import { Lock, Check } from 'lucide-react'
import {
  parseOrderItems,
  extractQuoteLinkFromOrder,
  convertQuoteItemsToParsed,
  cleanOrderNotes,
  type ParsedProductionItem,
} from '@/lib/productionItemParser'
import pb from '@/lib/pocketbase/client'

interface ProductionCardProps {
  order: ProductionOrder
  stage?: ProductionStage
  onClick: () => void
  onOpenApprovalModal?: (order: ProductionOrder, e: React.MouseEvent) => void
  onDragStart?: (e: React.DragEvent) => void
}

export default function ProductionCard({
  order,
  stage: _stage,
  onClick,
  onOpenApprovalModal,
  onDragStart,
}: ProductionCardProps) {
  const { canViewFinancials } = useAuth()
  const [expandedItems, setExpandedItems] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState(false)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [linkedQuoteItems, setLinkedQuoteItems] = useState<ParsedProductionItem[] | null>(null)

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

  // 1. Check if order has a linked quote_id / quote_code
  const quoteLink = useMemo(() => extractQuoteLinkFromOrder(order), [order])

  // Try to load quote snapshot items if available and valid
  useEffect(() => {
    let isMounted = true
    if (quoteLink.quoteId) {
      pb.collection('quotes')
        .getOne<Quote>(quoteLink.quoteId)
        .then((q) => {
          if (isMounted && q && Array.isArray(q.items) && q.items.length > 0) {
            const parsed = convertQuoteItemsToParsed(q.items)
            if (parsed.length > 0) {
              setLinkedQuoteItems(parsed)
            }
          }
        })
        .catch(() => {
          // If quote not found or error, fallback to parsed order description items
        })
    }
    return () => {
      isMounted = false
    }
  }, [quoteLink.quoteId])

  // 2. Resolve items: use linked quote snapshot items or fallback to parser
  const items: ParsedProductionItem[] = useMemo(() => {
    if (linkedQuoteItems && linkedQuoteItems.length > 0) {
      return linkedQuoteItems
    }
    return parseOrderItems(order)
  }, [linkedQuoteItems, order])

  const totalItemCount = items.length
  const displayedItems = expandedItems ? items : items.slice(0, 4)
  const remainingCount = totalItemCount - 4

  // Clean human observation notes (without internal system tags)
  const displayNotes = useMemo(() => cleanOrderNotes(order.notes), [order.notes])

  const copyTrackingLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    const link = `${window.location.origin}/acompanhar/${order.tracking_token}`
    navigator.clipboard.writeText(link)
    toast({
      title: 'Link copiado!',
      description: `Link de acompanhamento público do pedido ${order.order_number} copiado para a área de transferência.`,
    })
  }

  const handleArchiveConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsArchiving(true)
    try {
      await productionService.archiveOrder(order.id)
      toast({
        title: 'Pedido arquivado',
        description: `O pedido ${order.order_number} foi arquivado com sucesso.`,
      })
      window.dispatchEvent(new CustomEvent('production-order-updated'))
    } catch (err: any) {
      console.error('Error archiving order:', err)
      toast({
        title: 'Erro ao arquivar',
        description: err?.message || 'Não foi possível arquivar o pedido.',
        variant: 'destructive',
      })
    } finally {
      setIsArchiving(false)
      setArchiveDialogOpen(false)
    }
  }

  const responsibleName =
    order.expand?.production_rep_id?.name || order.expand?.sales_rep_id?.name || 'Produção'

  // Files count and proofs presence
  const attachmentsCount = Array.isArray(order.attachments) ? order.attachments.length : 0
  const hasArtOrProof =
    Boolean(order.approved_proof_id) ||
    Boolean(order.art_approved) ||
    order.stage_internal_id === 'awaiting_approval' ||
    order.stage_internal_id === 'approved' ||
    Boolean(order.art_approved_at)

  const isRequiresArt =
    order.requires_art_approval !== undefined && order.requires_art_approval !== null
      ? Boolean(order.requires_art_approval)
      : false
  const isArtApproved =
    Boolean(order.art_approved) &&
    Boolean(order.approved_proof_id && order.approved_proof_id.trim())

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onClick={onClick}
        className={`group relative bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer select-none p-3.5 space-y-3 w-full min-w-0 max-w-full overflow-hidden ${deadlineInfo.cardBorderClass}`}
      >
        {/* Top row: Order Number + Priority Badge + Deadline Status Alert */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-extrabold text-xs text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-mono shrink-0">
              {order.order_number}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] font-semibold px-2 py-0 uppercase tracking-wider shrink-0 ${
                priorityColors[order.priority || 'media']
              }`}
            >
              {priorityLabels[order.priority || 'media']}
            </Badge>
            {order.art_approved && (
              <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 flex items-center gap-0.5 font-bold shrink-0">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {order.approved_proof_id ? '✅ Arte final aprovada' : 'Arte OK'}
              </Badge>
            )}{' '}
          </div>

          {/* Deadline Badge */}
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${deadlineInfo.badgeClass}`}
          >
            {deadlineInfo.status === 'overdue' ? (
              <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
            ) : (
              <Clock className="h-3 w-3 shrink-0" />
            )}
            {deadlineInfo.label}
          </span>
        </div>

        {/* Header Summary: "X itens • R$ TOTAL" or Single Product Title */}
        <div className="min-w-0">
          {totalItemCount === 1 ? (
            <div className="space-y-0.5 min-w-0">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-snug break-words whitespace-normal group-hover:text-emerald-600 transition-colors">
                {items[0]?.name || order.product}
              </h4>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span>1 item</span>
                {canViewFinancials && order.total_value ? (
                  <>
                    <span>•</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(order.total_value)}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                  {totalItemCount} itens no pedido
                </span>
                {canViewFinancials && order.total_value ? (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {formatCurrency(order.total_value)}
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {totalItemCount} itens discriminados
              </div>
            </div>
          )}
        </div>

        {/* Client Name & Phone */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80 min-w-0">
          <span className="font-semibold truncate min-w-0 flex-1">{order.client_name}</span>
          <span className="text-[11px] text-slate-400 font-mono shrink-0">
            {order.client_phone}
          </span>
        </div>

        {/* Compact Attachments, Proof Indicator & Requires Art Approval Status */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 text-[10px]">
          {/* Approval Requirement Badge: 🔒 Exige aprovação de arte (if pending) / Não exige aprovação de arte */}
          {isRequiresArt ? (
            !isArtApproved && (
              <span
                className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0"
                title="Este pedido exige aprovação de arte antes de entrar em produção"
              >
                <Lock className="h-2.5 w-2.5 text-amber-600" />
                <span>🔒 Exige aprovação de arte</span>
              </span>
            )
          ) : (
            <span
              className="inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0"
              title="Este pedido não exige aprovação de arte para entrar em produção"
            >
              <span>Não exige aprovação de arte</span>
            </span>
          )}

          {attachmentsCount > 0 && (
            <span
              className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0"
              title={`${attachmentsCount} arquivo(s) anexado(s) ao pedido`}
            >
              <Paperclip className="h-2.5 w-2.5 text-slate-500" />📎 {attachmentsCount}{' '}
              {attachmentsCount === 1 ? 'arquivo' : 'arquivos'}
            </span>
          )}

          {order.approved_proof_id ? (
            <span
              className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0"
              title="Arte final aprovada para este pedido"
            >
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />✅ Arte final aprovada
            </span>
          ) : hasArtOrProof ? (
            <span
              className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0"
              title="Arte / prova disponível para este pedido"
            >
              <Palette className="h-2.5 w-2.5 text-purple-600" />🎨 Arte / prova disponível
            </span>
          ) : null}
        </div>

        {/* ITEMS SECTION: Render each item in its own separated container/card block */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/80 pb-1">
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              Itens do Pedido ({totalItemCount})
            </span>
          </div>

          <div className="space-y-2 min-w-0">
            {displayedItems.map((item, index) => (
              <div
                key={item.id || index}
                className="p-2.5 rounded-lg bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5 transition-colors min-w-0"
              >
                {/* Item Name */}
                <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words whitespace-normal min-w-0">
                  {item.name}
                </div>

                {/* Specs: Quantity, Dimensions, Material, Additionals */}
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 min-w-0">
                  {/* Quantity & Dimensions Row */}
                  {(item.quantity || item.dimensions) && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                      {item.quantity && (
                        <span className="font-medium text-slate-700 dark:text-slate-300 shrink-0">
                          {typeof item.quantity === 'number'
                            ? `${item.quantity} un`
                            : item.quantity.includes('un')
                              ? item.quantity
                              : `${item.quantity} un`}
                        </span>
                      )}
                      {item.quantity && item.dimensions && <span>•</span>}
                      {item.dimensions && (
                        <span className="font-mono text-slate-600 dark:text-slate-400 break-words min-w-0">
                          {item.dimensions}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Material */}
                  {item.material && (
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 min-w-0">
                      <Layers className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                      <span className="break-words min-w-0">{item.material}</span>
                    </div>
                  )}

                  {/* Additionals / Acabamentos */}
                  {item.additionals && (
                    <div className="flex items-start gap-1 text-slate-600 dark:text-slate-400 min-w-0">
                      <Sparkles className="h-2.5 w-2.5 shrink-0 text-amber-500 mt-0.5" />
                      <span className="break-words min-w-0">{item.additionals}</span>
                    </div>
                  )}

                  {/* Custom Notes of item */}
                  {item.notes && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 italic bg-white/60 dark:bg-slate-900/60 p-1.5 rounded border border-slate-200/50 dark:border-slate-700/50 break-words min-w-0">
                      {item.notes}
                    </div>
                  )}
                </div>

                {/* Item Price (Unit & Total) if available and allowed */}
                {canViewFinancials && (item.unitPrice || item.totalPrice) && (
                  <div className="pt-1 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-[10px] min-w-0">
                    <span className="text-slate-500">
                      {item.unitPrice ? `Unit: ${item.unitPrice}` : 'Subtotal:'}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {item.totalPrice || item.unitPrice}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* More than 4 items toggle ("+ X itens" / "Ver todos" / "Recolher") */}
          {totalItemCount > 4 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setExpandedItems(!expandedItems)
              }}
              className="w-full flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-colors"
            >
              {expandedItems ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Recolher itens ({totalItemCount})
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />+{remainingCount} item
                  {remainingCount > 1 ? 's' : ''} • Ver todos ({totalItemCount})
                </>
              )}
            </button>
          )}
        </div>

        {/* OBSERVATION BLOCK (Separate section with line break & expand for long text) */}
        {displayNotes && (
          <div className="p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 text-xs space-y-1 min-w-0">
            <div className="flex items-center justify-between text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Observação do Pedido
              </span>
              {displayNotes.length > 100 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpandedNotes(!expandedNotes)
                  }}
                  className="text-amber-700 dark:text-amber-300 hover:underline text-[10px] lowercase font-semibold"
                >
                  {expandedNotes ? 'ver menos' : 'ver mais'}
                </button>
              )}
            </div>
            <p
              className={`text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-line break-words leading-relaxed min-w-0 ${
                !expandedNotes && displayNotes.length > 100 ? 'line-clamp-2' : ''
              }`}
            >
              {displayNotes}
            </p>
          </div>
        )}

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
            <ShieldCheck className="h-3.5 w-3.5 text-purple-600 shrink-0" />
            Registrar Decisão de Arte
          </button>
        )}

        {/* Tracking Code if Shipped */}
        {order.tracking_code && (
          <div className="flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 p-1.5 rounded-lg border border-blue-200 dark:border-blue-800 font-mono min-w-0">
            <span className="flex items-center gap-1 truncate min-w-0">
              <Truck className="h-3 w-3 shrink-0" />
              <span className="truncate">{order.tracking_code}</span>
            </span>
          </div>
        )}

        {/* Total Summary Row if multiple items or single total */}
        {canViewFinancials && order.total_value ? (
          <div className="flex items-baseline justify-between py-1.5 px-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 min-w-0">
            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold">
              Total do Pedido:
            </span>
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(order.total_value)}
            </span>
          </div>
        ) : null}

        {/* Bottom Bar: Responsible info + Share tracking link + WhatsApp + Archive */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1 min-w-0">
          <div
            className="flex items-center space-x-1.5 min-w-0 flex-1"
            title={`Responsável: ${responsibleName}`}
          >
            <Avatar className="h-6 w-6 text-[10px] border border-slate-200 dark:border-slate-700 bg-emerald-100 text-emerald-800 font-semibold shrink-0">
              <AvatarFallback>{getInitials(responsibleName)}</AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0 font-medium">
              {responsibleName.split(' ')[0]}
            </span>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
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

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setArchiveDialogOpen(true)
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
              title="Arquivar Pedido"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-600" />
              Arquivar pedido {order.order_number}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              O pedido de <strong>{order.client_name}</strong> será removido do Kanban ativo e
              enviado para a aba "Pedidos Arquivados". Você poderá reabri-lo a qualquer momento sem
              perder dados ou histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveConfirm}
              disabled={isArchiving}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isArchiving ? 'Arquivando...' : 'Sim, arquivar pedido'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
