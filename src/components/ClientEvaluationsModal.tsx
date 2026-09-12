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
  Star,
  Package,
  Calendar,
  User as UserIcon,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import type { Client, Evaluation, ProductionOrder, User } from '@/types/crm'
import { evaluationsService } from '@/services/evaluations'
import { productionService } from '@/services/production'
import { usersService } from '@/services/whatsapp'
import { formatDateTime } from '@/lib/sla'
import ProductionOrderModal from './ProductionOrderModal'

interface ClientEvaluationsModalProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  zIndexClass?: string
}

type RatingFilter = 'all' | '5' | '4' | '3' | '1-2'

export default function ClientEvaluationsModal({
  isOpen,
  onClose,
  client,
  zIndexClass = 'z-[70]',
}: ClientEvaluationsModalProps) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(false)
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all')
  const [usersMap, setUsersMap] = useState<Record<string, User>>({})
  const [ordersMap, setOrdersMap] = useState<Record<string, ProductionOrder>>({})

  // Modal de detalhe do pedido selecionado (ProductionOrderModal oficial)
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null)
  const [orderModalOpen, setOrderModalOpen] = useState(false)

  // Carrega avaliações EXCLUSIVAMENTE pelo client_id
  const loadEvaluations = async (clientId: string) => {
    if (!clientId) return
    setLoading(true)
    try {
      const [evalList, allUsers] = await Promise.all([
        evaluationsService.getByClientId(clientId),
        usersService.getAll(),
      ])

      const uMap: Record<string, User> = {}
      allUsers.forEach((u) => {
        uMap[u.id] = u
      })
      setUsersMap(uMap)

      // Ordenação: mais recente primeiro (-created)
      const sorted = [...evalList].sort((a, b) => {
        const timeA = new Date(a.created || 0).getTime()
        const timeB = new Date(b.created || 0).getTime()
        return timeB - timeA
      })
      setEvaluations(sorted)

      // Identificar order_ids vinculados para carregar pedidos relacionados
      const orderIdsToFetch = new Set<string>()
      sorted.forEach((ev) => {
        if (ev.order_id) {
          orderIdsToFetch.add(ev.order_id)
        }
      })

      if (orderIdsToFetch.size > 0) {
        const fetchedOrders: Record<string, ProductionOrder> = {}
        await Promise.all(
          Array.from(orderIdsToFetch).map(async (oid) => {
            try {
              const ord = await productionService.getById(oid)
              if (ord) {
                fetchedOrders[oid] = ord
              }
            } catch (err) {
              console.warn(`[ClientEvaluationsModal] Não foi possível carregar pedido ${oid}:`, err)
            }
          }),
        )
        setOrdersMap(fetchedOrders)
      } else {
        setOrdersMap({})
      }
    } catch (err) {
      console.error('[ClientEvaluationsModal] Erro ao carregar avaliações do cliente:', err)
      setEvaluations([])
      setOrdersMap({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && client?.id) {
      loadEvaluations(client.id)
      setRatingFilter('all')
      setSelectedOrder(null)
      setOrderModalOpen(false)
    } else {
      setEvaluations([])
      setOrdersMap({})
      setSelectedOrder(null)
      setOrderModalOpen(false)
    }
  }, [isOpen, client?.id])

  // Filtragem por overall_rating
  const filteredEvaluations = useMemo(() => {
    return evaluations.filter((ev) => {
      const rating = Number(ev.overall_rating) || 0
      if (ratingFilter === 'all') return true
      if (ratingFilter === '5') return rating === 5
      if (ratingFilter === '4') return rating === 4
      if (ratingFilter === '3') return rating === 3
      if (ratingFilter === '1-2') return rating >= 1 && rating <= 2
      return true
    })
  }, [evaluations, ratingFilter])

  // Resumo no topo:
  // - Média geral de avaliação (overall_rating)
  // - Quantidade de avaliações
  // - Quantidade 5 estrelas
  // - Quantidade 1–2 estrelas
  // - Data da última avaliação
  const summary = useMemo(() => {
    const validEvals = evaluations.filter((ev) => Number(ev.overall_rating) > 0)
    const count = validEvals.length
    const totalSum = validEvals.reduce((acc, ev) => acc + Number(ev.overall_rating), 0)
    const average = count > 0 ? (totalSum / count).toFixed(1) : null

    const fiveStarsCount = evaluations.filter((ev) => Number(ev.overall_rating) === 5).length
    const fourStarsCount = evaluations.filter((ev) => Number(ev.overall_rating) === 4).length
    const threeStarsCount = evaluations.filter((ev) => Number(ev.overall_rating) === 3).length
    const oneTwoStarsCount = evaluations.filter((ev) => {
      const r = Number(ev.overall_rating)
      return r >= 1 && r <= 2
    }).length

    const lastEval = evaluations[0]
    const lastEvalDate = lastEval?.created || null

    return {
      average,
      totalCount: evaluations.length,
      fiveStarsCount,
      fourStarsCount,
      threeStarsCount,
      oneTwoStarsCount,
      lastEvalDate,
    }
  }, [evaluations])

  // Resolução de atendente/responsável da avaliação ou do pedido vinculado
  const getRepName = (ev: Evaluation, linkedOrder?: ProductionOrder | null) => {
    // 1. Atendente do expand da avaliação (resolved_by ou attendance expand)
    if (ev.expand?.resolved_by?.name) return ev.expand.resolved_by.name
    if (ev.resolved_by && usersMap[ev.resolved_by]?.name) {
      return usersMap[ev.resolved_by].name
    }
    // 2. Responsável do pedido de produção vinculado
    if (linkedOrder) {
      if (linkedOrder.expand?.sales_rep_id?.name) return linkedOrder.expand.sales_rep_id.name
      if (linkedOrder.expand?.sales_rep_id?.email) {
        return linkedOrder.expand.sales_rep_id.email.split('@')[0]
      }
      if (linkedOrder.sales_rep_id && usersMap[linkedOrder.sales_rep_id]) {
        return (
          usersMap[linkedOrder.sales_rep_id].name ||
          usersMap[linkedOrder.sales_rep_id].email.split('@')[0]
        )
      }
      if (linkedOrder.expand?.production_rep_id?.name) {
        return linkedOrder.expand.production_rep_id.name
      }
      if (linkedOrder.production_rep_id && usersMap[linkedOrder.production_rep_id]) {
        return (
          usersMap[linkedOrder.production_rep_id].name ||
          usersMap[linkedOrder.production_rep_id].email.split('@')[0]
        )
      }
    }
    // 3. Atendente permanente da ficha do cliente
    if (client?.assigned_to && usersMap[client.assigned_to]) {
      return usersMap[client.assigned_to].name || usersMap[client.assigned_to].email.split('@')[0]
    }
    return null
  }

  // Ao clicar em uma avaliação com pedido vinculado: abrir o ProductionOrderModal existente
  const handleOpenLinkedOrder = (ev: Evaluation) => {
    if (!ev.order_id) return
    const orderObj = ordersMap[ev.order_id] || ev.expand?.order_id
    if (orderObj) {
      setSelectedOrder(orderObj)
      setOrderModalOpen(true)
    } else {
      // Se ainda não estiver em cache, buscar e abrir
      productionService.getById(ev.order_id).then((ord) => {
        if (ord) {
          setSelectedOrder(ord)
          setOrdersMap((prev) => ({ ...prev, [ord.id]: ord }))
          setOrderModalOpen(true)
        }
      })
    }
  }

  if (!isOpen || !client) return null

  const handleEvaluationsOpenChange = (open: boolean) => {
    if (!open) {
      if (orderModalOpen) {
        return
      }
      onClose()
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleEvaluationsOpenChange}>
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
                  <Star className="h-5 w-5 text-amber-500 fill-amber-400" />
                  Avaliações de Satisfação — {client.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Feedbacks e notas pós-venda vinculados exclusivamente a este cliente (ID:{' '}
                  <span className="font-mono">{client.id}</span>).
                </DialogDescription>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => client.id && loadEvaluations(client.id)}
                disabled={loading}
                className="h-8 text-xs shrink-0 bg-white dark:bg-slate-800"
              >
                <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </DialogHeader>

          {/* Área de Resumo e Métricas */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {/* Média Geral */}
              <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-medium">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                  <span>Média Geral</span>
                </div>
                <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1 flex items-baseline gap-1">
                  {summary.average !== null ? (
                    <>
                      <span>{summary.average}</span>
                      <span className="text-xs font-normal text-slate-400">/ 5.0</span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-slate-400">Sem nota</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">overall_rating</div>
              </div>

              {/* Quantidade Total */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span>Quantidade</span>
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {summary.totalCount}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {summary.totalCount === 1 ? 'avaliação' : 'avaliações'}
                </div>
              </div>

              {/* 5 Estrelas */}
              <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>5 Estrelas</span>
                </div>
                <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                  {summary.fiveStarsCount}
                </div>
                <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/70 mt-0.5">
                  máxima satisfação
                </div>
              </div>

              {/* 1–2 Estrelas */}
              <div className="p-3 rounded-xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40">
                <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                  <span>1–2 Estrelas</span>
                </div>
                <div className="text-xl font-bold font-mono text-rose-700 dark:text-rose-400 mt-1">
                  {summary.oneTwoStarsCount}
                </div>
                <div className="text-[10px] text-rose-600/80 dark:text-rose-400/70 mt-0.5">
                  atenção / recuperação
                </div>
              </div>

              {/* Data da Última Avaliação */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Última Avaliação</span>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-1.5 truncate">
                  {summary.lastEvalDate ? formatDateTime(summary.lastEvalDate) : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {summary.lastEvalDate ? 'data de envio' : 'nenhuma registrada'}
                </div>
              </div>
            </div>

            {/* Filtros: Todas / 5 estrelas / 4 estrelas / 3 estrelas / 1–2 estrelas */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mr-1">
                  Filtrar por:
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={ratingFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setRatingFilter('all')}
                  className={`h-7 text-xs font-medium ${
                    ratingFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  Todas ({evaluations.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={ratingFilter === '5' ? 'default' : 'outline'}
                  onClick={() => setRatingFilter('5')}
                  className={`h-7 text-xs font-medium ${
                    ratingFilter === '5'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  5 estrelas ({summary.fiveStarsCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={ratingFilter === '4' ? 'default' : 'outline'}
                  onClick={() => setRatingFilter('4')}
                  className={`h-7 text-xs font-medium ${
                    ratingFilter === '4'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  4 estrelas ({summary.fourStarsCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={ratingFilter === '3' ? 'default' : 'outline'}
                  onClick={() => setRatingFilter('3')}
                  className={`h-7 text-xs font-medium ${
                    ratingFilter === '3'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  3 estrelas ({summary.threeStarsCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={ratingFilter === '1-2' ? 'default' : 'outline'}
                  onClick={() => setRatingFilter('1-2')}
                  className={`h-7 text-xs font-medium ${
                    ratingFilter === '1-2'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  1–2 estrelas ({summary.oneTwoStarsCount})
                </Button>
              </div>

              <div className="text-[11px] text-slate-400">
                Mostrando {filteredEvaluations.length} de {evaluations.length} avaliações
              </div>
            </div>
          </div>

          {/* Lista de Avaliações */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                <span className="text-xs">Carregando avaliações do cliente...</span>
              </div>
            ) : evaluations.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-2">
                <Star className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <div className="font-semibold text-slate-600 dark:text-slate-300 text-sm">
                  Este cliente ainda não realizou avaliações.
                </div>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Assim que o cliente responder à pesquisa de satisfação pós-venda através do link
                  público, os resultados aparecerão detalhados aqui.
                </p>
              </div>
            ) : filteredEvaluations.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                Nenhuma avaliação encontrada para o filtro selecionado ({ratingFilter} estrelas).
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEvaluations.map((ev) => {
                  const rating = Number(ev.overall_rating) || 0
                  const linkedOrder = ev.order_id
                    ? ordersMap[ev.order_id] || ev.expand?.order_id || null
                    : null
                  const orderNumber = ev.order_number || linkedOrder?.order_number || null
                  const repName = getRepName(ev, linkedOrder)
                  const hasOrderLink = Boolean(ev.order_id)

                  return (
                    <div
                      key={ev.id}
                      onClick={() => hasOrderLink && handleOpenLinkedOrder(ev)}
                      className={`p-4 rounded-xl border text-xs space-y-3 transition-all shadow-xs ${
                        hasOrderLink
                          ? 'cursor-pointer hover:shadow-md hover:border-amber-400 group bg-white dark:bg-slate-900'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {/* Topo do Card: Estrelas + Nota + Data + Badges */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Estrelas */}
                          <div className="flex items-center gap-1 text-amber-400">
                            {[1, 2, 3, 4, 5].map((starIdx) => (
                              <Star
                                key={starIdx}
                                className={`h-4 w-4 ${
                                  starIdx <= rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-200 dark:text-slate-700'
                                }`}
                              />
                            ))}
                            <span className="font-extrabold ml-1.5 text-slate-900 dark:text-white text-sm">
                              {rating} {rating === 1 ? 'estrela' : 'estrelas'}
                            </span>
                          </div>

                          {/* Badge de status de resolução de reclamação */}
                          {rating <= 3 && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-semibold ${
                                ev.resolved
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {ev.resolved ? (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Reclamação resolvida
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Em recuperação / pendente
                                </span>
                              )}
                            </Badge>
                          )}
                        </div>

                        {/* Data da avaliação */}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>{formatDateTime(ev.created)}</span>
                        </div>
                      </div>

                      {/* Comentário do Cliente */}
                      {ev.comment ? (
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs italic leading-relaxed">
                          "{ev.comment}"
                        </div>
                      ) : (
                        <div className="text-slate-400 text-[11px] italic">
                          (Nenhum comentário por escrito adicionado nesta avaliação)
                        </div>
                      )}

                      {/* Notas secundárias (Atendimento, Qualidade, Entrega) quando presentes */}
                      {(ev.service_rating || ev.quality_rating || ev.delivery_rating) && (
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800 flex-wrap">
                          {ev.service_rating && (
                            <span>
                              Atendimento:{' '}
                              <strong className="text-slate-800 dark:text-slate-200">
                                {ev.service_rating}★
                              </strong>
                            </span>
                          )}
                          {ev.quality_rating && (
                            <span>
                              Qualidade:{' '}
                              <strong className="text-slate-800 dark:text-slate-200">
                                {ev.quality_rating}★
                              </strong>
                            </span>
                          )}
                          {ev.delivery_rating && (
                            <span>
                              Entrega:{' '}
                              <strong className="text-slate-800 dark:text-slate-200">
                                {ev.delivery_rating}★
                              </strong>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Metadados: Pedido relacionado, Produto(s), Atendente/Responsável */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                        {/* Pedido relacionado */}
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                            Pedido Relacionado
                          </span>
                          {orderNumber ? (
                            <span className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1 mt-0.5">
                              <Package className="h-3 w-3 text-emerald-600" />
                              {orderNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400 mt-0.5 block">—</span>
                          )}
                        </div>

                        {/* Produto(s) do pedido relacionado */}
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                            Produto(s) do Pedido
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 block truncate">
                            {linkedOrder?.product || '—'}
                          </span>
                        </div>

                        {/* Atendente / Responsável */}
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                            Atendente / Responsável
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1 truncate">
                            <UserIcon className="h-3 w-3 text-slate-400 shrink-0" />
                            {repName || 'Equipe Laletra'}
                          </span>
                        </div>
                      </div>

                      {/* Rodapé do card: Ação de abrir pedido quando vinculado */}
                      {hasOrderLink && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                          <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 group-hover:underline">
                            Ver detalhes do pedido {orderNumber || ''} no ProductionOrderModal
                            <ArrowRight className="h-3 w-3" />
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            Clique para abrir pedido
                          </Badge>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Total de avaliações deste cliente: <strong>{evaluations.length}</strong>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Fechar Avaliações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ProductionOrderModal existente aberto ao clicar em uma avaliação com pedido vinculado */}
      <ProductionOrderModal
        isOpen={orderModalOpen}
        zIndexClass="z-[90]"
        onClose={() => {
          setOrderModalOpen(false)
          setSelectedOrder(null)
        }}
        onSaved={() => {
          if (client?.id) {
            loadEvaluations(client.id)
          }
        }}
        orderToEdit={selectedOrder}
        initialClientId={client?.id}
      />
    </>
  )
}
