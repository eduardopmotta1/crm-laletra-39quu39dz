import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ShoppingBag,
  Package,
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  User as UserIcon,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  RotateCcw,
  Loader2,
  FileSpreadsheet,
  MessageSquare,
} from 'lucide-react'
import type { Client, ProductionOrder, User } from '@/types/crm'
import type { Quote } from '@/types/quotes'
import { productionService } from '@/services/production'
import { usersService } from '@/services/whatsapp'
import { formatCurrency, formatDateTime } from '@/lib/sla'
import {
  parseOrderItems,
  convertQuoteItemsToParsed,
  extractQuoteLinkFromOrder,
  cleanOrderNotes,
  type ParsedProductionItem,
} from '@/lib/productionItemParser'
import pb from '@/lib/pocketbase/client'
import ProductionOrderModal from './ProductionOrderModal'

interface ClientPurchaseHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  zIndexClass?: string
}

type StatusFilter = 'all' | 'in_production' | 'completed'

export default function ClientPurchaseHistoryModal({
  isOpen,
  onClose,
  client,
  zIndexClass = 'z-[70]',
}: ClientPurchaseHistoryModalProps) {
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [usersMap, setUsersMap] = useState<Record<string, User>>({})
  const [quotesCache, setQuotesCache] = useState<Record<string, Quote>>({})

  // Modal de detalhe do pedido selecionado (ProductionOrderModal oficial)
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null)
  const [orderModalOpen, setOrderModalOpen] = useState(false)

  // Controle de expansão de itens por pedido (order.id -> boolean)
  const [expandedOrderItems, setExpandedOrderItems] = useState<Record<string, boolean>>({})

  // Buscar pedidos do cliente exclusivamente por client_id
  const loadOrders = async (clientId: string) => {
    if (!clientId) return
    setLoading(true)
    try {
      const [orderList, allUsers] = await Promise.all([
        productionService.getByClientId(clientId),
        usersService.getAll(),
      ])

      const uMap: Record<string, User> = {}
      allUsers.forEach((u) => {
        uMap[u.id] = u
      })
      setUsersMap(uMap)

      // Garantir ordenação: mais recente primeiro (-created ou sale_date)
      const sorted = [...orderList].sort((a, b) => {
        const timeA = new Date(a.created || a.sale_date || 0).getTime()
        const timeB = new Date(b.created || b.sale_date || 0).getTime()
        return timeB - timeA
      })

      setOrders(sorted)

      // Carregar orçamentos vinculados em lote para os pedidos que possuem quote_id / tag [QUOTE_ID:...]
      const quoteIdsToFetch = new Set<string>()
      sorted.forEach((ord) => {
        const link = extractQuoteLinkFromOrder(ord)
        if (link.quoteId) {
          quoteIdsToFetch.add(link.quoteId)
        }
      })

      if (quoteIdsToFetch.size > 0) {
        const quoteIds = Array.from(quoteIdsToFetch)
        const filterStr = quoteIds.map((id) => `id = "${id}"`).join(' || ')
        try {
          const fetchedQuotes = await pb.collection('quotes').getFullList<Quote>({
            filter: filterStr,
            requestKey: null,
          })
          const qMap: Record<string, Quote> = {}
          fetchedQuotes.forEach((q) => {
            qMap[q.id] = q
          })
          setQuotesCache(qMap)
        } catch (qErr) {
          console.warn(
            '[ClientPurchaseHistoryModal] Falha ao pré-carregar orçamentos vinculados:',
            qErr,
          )
        }
      }
    } catch (err) {
      console.error('[ClientPurchaseHistoryModal] Erro ao carregar pedidos do cliente:', err)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && client?.id) {
      loadOrders(client.id)
      setStatusFilter('all')
      setExpandedOrderItems({})
    } else {
      setOrders([])
      setSelectedOrder(null)
      setOrderModalOpen(false)
    }
  }, [isOpen, client?.id])

  // Helper para identificar status de produção
  const isOrderInProduction = (ord: ProductionOrder) => {
    return (
      ord.stage_internal_id === 'in_production' ||
      ord.stage_internal_id === 'order_received' ||
      ord.stage_internal_id === 'awaiting_info' ||
      ord.stage_internal_id === 'art_preparation' ||
      ord.stage_internal_id === 'awaiting_approval' ||
      ord.stage_internal_id === 'approved' ||
      ord.stage_internal_id === 'ready' ||
      ord.stage_internal_id === 'shipped'
    )
  }

  const isOrderCompleted = (ord: ProductionOrder) => {
    return (
      ord.is_completed === true ||
      ord.stage_internal_id === 'completed' ||
      Boolean(ord.completed_at)
    )
  }

  // Filtragem dos pedidos
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'in_production') {
        // Pedidos em produção (não concluídos e em alguma etapa ativa de produção)
        return isOrderInProduction(ord) && !isOrderCompleted(ord)
      }
      if (statusFilter === 'completed') {
        return isOrderCompleted(ord)
      }
      return true
    })
  }, [orders, statusFilter])

  // Resumo no topo:
  // Requisito 5:
  // - Total de pedidos
  // - Total comprado
  // - Ticket médio
  // - Data do último pedido
  // "Calcular usando apenas pedidos válidos/concluídos conforme os status existentes no sistema. Não inventar status novos."
  const summary = useMemo(() => {
    // Pedidos válidos para cálculo:
    // Consideramos pedidos que não foram cancelados (no sistema não há status cancelado, mas consideramos pedidos concluídos ou com valor positivo válido)
    // Para cálculo comercial de "Total Comprado" e "Ticket Médio", usamos os pedidos concluídos (is_completed || stage_internal_id === 'completed')
    // Se não houver nenhum concluído ainda mas existirem pedidos com valor registrado, consideramos todos os pedidos válidos.
    const completedOrders = orders.filter((o) => isOrderCompleted(o))
    const validOrdersForMetrics =
      completedOrders.length > 0 ? completedOrders : orders.filter((o) => (o.total_value || 0) > 0)

    const totalOrdersCount = orders.length
    const totalPurchasedValue = validOrdersForMetrics.reduce(
      (acc, ord) => acc + (Number(ord.total_value) || 0),
      0,
    )
    const validCount = validOrdersForMetrics.length
    const averageTicket = validCount > 0 ? totalPurchasedValue / validCount : 0

    // Data do último pedido (o mais recente da lista)
    const lastOrder = orders[0]
    const lastOrderDate = lastOrder ? lastOrder.sale_date || lastOrder.created : null

    return {
      totalOrdersCount,
      completedOrdersCount: completedOrders.length,
      totalPurchasedValue,
      averageTicket,
      lastOrderDate,
      usingCompletedOnly: completedOrders.length > 0,
    }
  }, [orders])

  // Helper para resolver os itens de um pedido (snapshot próprio ou quote vinculada)
  const getOrderItems = (order: ProductionOrder): ParsedProductionItem[] => {
    const qLink = extractQuoteLinkFromOrder(order)
    if (qLink.quoteId && quotesCache[qLink.quoteId]) {
      const q = quotesCache[qLink.quoteId]
      if (Array.isArray(q.items) && q.items.length > 0) {
        const parsed = convertQuoteItemsToParsed(q.items)
        if (parsed.length > 0) return parsed
      }
    }
    return parseOrderItems(order)
  }

  // Nome do responsável comercial / produção
  const getRepName = (order: ProductionOrder) => {
    return (
      order.expand?.sales_rep_id?.name ||
      order.expand?.sales_rep_id?.email?.split('@')[0] ||
      order.expand?.production_rep_id?.name ||
      order.expand?.production_rep_id?.email?.split('@')[0] ||
      (order.sales_rep_id && usersMap[order.sales_rep_id]
        ? usersMap[order.sales_rep_id].name || usersMap[order.sales_rep_id].email.split('@')[0]
        : null) ||
      (order.production_rep_id && usersMap[order.production_rep_id]
        ? usersMap[order.production_rep_id].name ||
          usersMap[order.production_rep_id].email.split('@')[0]
        : null)
    )
  }

  const toggleOrderExpanded = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedOrderItems((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }))
  }

  const handleOpenOrderDetail = (order: ProductionOrder) => {
    setSelectedOrder(order)
    setOrderModalOpen(true)
  }

  if (!isOpen || !client) return null

  const handleHistoryOpenChange = (open: boolean) => {
    if (!open) {
      if (orderModalOpen) {
        return
      }
      onClose()
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleHistoryOpenChange}>
        <DialogContent
          zIndexClass={zIndexClass}
          className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0"
          onEscapeKeyDown={(e) => {
            if (orderModalOpen) {
              e.preventDefault()
              return
            }
            e.stopPropagation()
          }}
          onInteractOutside={(e) => {
            if (orderModalOpen) {
              e.preventDefault()
            }
          }}
          onPointerDownOutside={(e) => {
            if (orderModalOpen) {
              e.preventDefault()
            }
          }}
        >
          {/* Header */}
          <DialogHeader className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                  <ShoppingBag className="h-5 w-5 text-emerald-600" />
                  Histórico de Compras — {client.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Consulta de pedidos de produção vinculados exclusivamente a este cliente (ID:{' '}
                  <span className="font-mono">{client.id}</span>).
                </DialogDescription>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => client.id && loadOrders(client.id)}
                disabled={loading}
                className="h-8 text-xs shrink-0 bg-white dark:bg-slate-800"
              >
                <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </DialogHeader>

          {/* Área de Resumo e Métricas (Requisito 5) */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Total de Pedidos */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  <Package className="h-3.5 w-3.5 text-blue-600" />
                  <span>Total de Pedidos</span>
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {summary.totalOrdersCount}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {summary.completedOrdersCount} concluído(s)
                </div>
              </div>

              {/* Total Comprado */}
              <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Total Comprado</span>
                </div>
                <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                  {formatCurrency(summary.totalPurchasedValue)}
                </div>
                <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/70 mt-0.5">
                  {summary.usingCompletedOnly ? 'Base: pedidos concluídos' : 'Pedidos cadastrados'}
                </div>
              </div>

              {/* Ticket Médio */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Ticket Médio</span>
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {formatCurrency(summary.averageTicket)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Média por pedido</div>
              </div>

              {/* Data do Último Pedido */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  <Calendar className="h-3.5 w-3.5 text-amber-600" />
                  <span>Último Pedido</span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-1.5 truncate">
                  {summary.lastOrderDate ? formatDateTime(summary.lastOrderDate) : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {summary.lastOrderDate ? 'Data registrada' : 'Nenhum pedido'}
                </div>
              </div>
            </div>

            {/* Barra de Filtros (Requisito 9: Todos / Em produção / Concluídos) */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mr-1">
                  Filtrar por:
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                  className={`h-7 text-xs font-medium ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  Todos ({orders.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={statusFilter === 'in_production' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('in_production')}
                  className={`h-7 text-xs font-medium ${
                    statusFilter === 'in_production'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  Em produção (
                  {orders.filter((o) => isOrderInProduction(o) && !isOrderCompleted(o)).length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={statusFilter === 'completed' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('completed')}
                  className={`h-7 text-xs font-medium ${
                    statusFilter === 'completed'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  Concluídos ({orders.filter((o) => isOrderCompleted(o)).length})
                </Button>
              </div>

              <div className="text-[11px] text-slate-400">
                Mostrando {filteredOrders.length} de {orders.length} pedidos
              </div>
            </div>
          </div>

          {/* Lista de Pedidos */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                <span className="text-xs">Carregando histórico de pedidos do cliente...</span>
              </div>
            ) : orders.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-2">
                <Package className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <div className="font-semibold text-slate-600 dark:text-slate-300 text-sm">
                  Este cliente ainda não possui pedidos.
                </div>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Assim que pedidos de produção forem criados para este cliente ou originados a
                  partir de orçamentos aprovados, eles aparecerão detalhados aqui.
                </p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                Nenhum pedido encontrado para o filtro selecionado (
                {statusFilter === 'in_production' ? 'Em produção' : 'Concluídos'}).
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((ord) => {
                  const isCompleted = isOrderCompleted(ord)
                  const isArchived = Boolean(ord.is_archived)
                  const repName = getRepName(ord)
                  const items = getOrderItems(ord)
                  const totalItems = items.length
                  const isExpanded = Boolean(expandedOrderItems[ord.id])
                  const displayedItems = isExpanded ? items : items.slice(0, 3)
                  const cleanNotes = cleanOrderNotes(ord.notes)
                  const quoteLink = extractQuoteLinkFromOrder(ord)

                  return (
                    <div
                      key={ord.id}
                      onClick={() => handleOpenOrderDetail(ord)}
                      className={`group p-4 rounded-xl border text-xs space-y-3 cursor-pointer transition-all shadow-xs hover:shadow-md ${
                        isArchived
                          ? 'bg-slate-100/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-90'
                          : isCompleted
                            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500'
                            : 'bg-white dark:bg-slate-900 border-emerald-200/90 dark:border-slate-800 hover:border-emerald-500'
                      }`}
                    >
                      {/* Linha Superior: Número, Status, Badges e Valor Total */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold font-mono text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-xs">
                            {ord.order_number}
                          </span>

                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${
                              isArchived
                                ? 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                                : isCompleted
                                  ? 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {ord.stage_name}
                          </Badge>

                          {isArchived && (
                            <Badge
                              variant="outline"
                              className="text-[9px] bg-slate-100 text-slate-500 border-slate-200"
                            >
                              Arquivado
                            </Badge>
                          )}

                          {ord.art_approved && (
                            <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 font-bold">
                              Arte OK
                            </Badge>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                            {ord.total_value ? formatCurrency(ord.total_value) : 'R$ 0,00'}
                          </span>
                        </div>
                      </div>

                      {/* Título Principal do Pedido */}
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-emerald-600 transition-colors">
                          {ord.product || 'Pedido de Produção'}
                        </h4>
                        {ord.description && !ord.description.includes('1. ') && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                            {ord.description}
                          </p>
                        )}
                      </div>

                      {/* PRODUTOS COMPRADOS (Requisitos 6 e 7): Lista discriminada */}
                      <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3 text-emerald-600" />
                            Produtos Comprados ({totalItems})
                          </span>
                          {totalItems > 3 && (
                            <button
                              type="button"
                              onClick={(e) => toggleOrderExpanded(ord.id, e)}
                              className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 normal-case font-semibold"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="h-3 w-3" /> Ver menos
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3 w-3" /> +{totalItems - 3} item(ns)
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {displayedItems.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-xs space-y-1"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                                  {item.name}
                                </span>
                                {(item.totalPrice || item.unitPrice) && (
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px] font-mono shrink-0">
                                    {item.totalPrice || item.unitPrice}
                                  </span>
                                )}
                              </div>

                              {/* Especificações: Quantidade, Medidas, Material, Acabamentos */}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                                {item.quantity && (
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    Qtd: <strong>{item.quantity}</strong>
                                  </span>
                                )}

                                {item.dimensions && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-slate-600 dark:text-slate-300">
                                      Medidas: {item.dimensions}
                                    </span>
                                  </>
                                )}

                                {item.material && (
                                  <>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                      <Layers className="h-2.5 w-2.5 text-slate-400" />
                                      {item.material}
                                    </span>
                                  </>
                                )}

                                {item.additionals && (
                                  <>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                      <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                                      {item.additionals}
                                    </span>
                                  </>
                                )}
                              </div>

                              {item.notes && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 italic bg-white/70 dark:bg-slate-900/60 p-1 rounded border border-slate-200/50 dark:border-slate-700/50">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Observações do pedido limpas (se houver) */}
                      {cleanNotes && (
                        <div className="p-2 rounded bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                          <FileText className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{cleanNotes}</span>
                        </div>
                      )}

                      {/* Metadados: Data, Origem, Prazo, Responsável (Requisito 6) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
                        {/* Data do Pedido */}
                        <div>
                          <span className="text-slate-400 block">Data do Pedido:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {ord.sale_date
                              ? new Date(ord.sale_date).toLocaleDateString('pt-BR')
                              : ord.created
                                ? formatDateTime(ord.created)
                                : '—'}
                          </span>
                        </div>

                        {/* Data Prevista / Prazo */}
                        <div>
                          <span className="text-slate-400 block">Data Prevista:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {ord.promised_deadline
                              ? new Date(ord.promised_deadline).toLocaleDateString('pt-BR')
                              : 'Sem prazo'}
                          </span>
                        </div>

                        {/* Origem (Orçamento / Atendimento) */}
                        <div className="col-span-1">
                          <span className="text-slate-400 block">Origem:</span>
                          {ord.quote_id || quoteLink.quoteId ? (
                            <span className="font-mono text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
                              <FileSpreadsheet className="h-2.5 w-2.5" />
                              {quoteLink.quoteCode
                                ? quoteLink.quoteCode
                                : quotesCache[ord.quote_id || quoteLink.quoteId || '']?.code ||
                                  'Orçamento vinculado'}
                            </span>
                          ) : ord.attendance_id ? (
                            <span className="font-mono text-blue-700 dark:text-blue-300 font-medium flex items-center gap-1">
                              <MessageSquare className="h-2.5 w-2.5" />
                              Atendimento vinculado
                            </span>
                          ) : (
                            <span className="text-slate-400">Direto / Balcão</span>
                          )}
                        </div>

                        {/* Responsável */}
                        <div>
                          <span className="text-slate-400 block">Responsável:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 truncate">
                            <UserIcon className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                            {repName || 'Produção Laletra'}
                          </span>
                        </div>
                      </div>

                      {/* Rodapé do Card: Dica de clique + Rastreio */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold group-hover:underline">
                          Abrir detalhes do pedido #{ord.order_number} →
                        </span>

                        <a
                          href={`${window.location.origin}/acompanhar/${ord.tracking_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-500 hover:text-emerald-600 flex items-center gap-1 font-medium transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Rastreio público
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Total de pedidos deste cliente: <strong>{orders.length}</strong>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Fechar Histórico
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Requisito 8: Abrir ProductionOrderModal existente ao clicar em qualquer pedido */}
      <ProductionOrderModal
        isOpen={orderModalOpen}
        zIndexClass="z-[90]"
        onClose={() => {
          setOrderModalOpen(false)
          setSelectedOrder(null)
        }}
        onSaved={() => {
          if (client?.id) {
            loadOrders(client.id)
          }
        }}
        orderToEdit={selectedOrder}
        initialClientId={client?.id}
      />
    </>
  )
}
