import React, { useState, useEffect, useCallback, useTransition } from 'react'
import {
  ClipboardList,
  Search,
  Eye,
  Calendar,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react'
import {
  productionService,
  type OrdersPaginatedFilterOptions,
  type OrdersIndicatorsResult,
} from '@/services/production'
import { productionStagesService } from '@/services/productionStages'
import { usersService } from '@/services/whatsapp'
import ProductionOrderModal from '@/components/ProductionOrderModal'
import type { ProductionOrder, ProductionStage, User } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'

export default function OrdersListPage() {
  const [, startTransition] = useTransition()

  // State: Data
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [stages, setStages] = useState<ProductionStage[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [indicatorsLoading, setIndicatorsLoading] = useState(true)
  const [indicators, setIndicators] = useState<OrdersIndicatorsResult>({
    ordersToday: 0,
    inProduction: 0,
    readyOrAwaitingPickup: 0,
    completedToday: 0,
  })

  // State: Pagination (server-side, 50 por página)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const perPage = 50

  // State: Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [situationFilter, setSituationFilter] = useState<
    'all' | 'active' | 'completed' | 'archived'
  >('all')
  const [periodFilter, setPeriodFilter] = useState<
    'all' | 'today' | 'last_7_days' | 'last_30_days' | 'custom'
  >('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [salesRepFilter, setSalesRepFilter] = useState('all')
  const [productionRepFilter, setProductionRepFilter] = useState('all')

  // State: Modal "Ver pedido"
  const [selectedOrderToView, setSelectedOrderToView] = useState<ProductionOrder | null>(null)
  const [viewOrderModalOpen, setViewOrderModalOpen] = useState(false)

  // Debounce search input to avoid excessive server queries
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
    }, 300)
    return () => clearTimeout(handler)
  }, [searchQuery])

  // Reset to page 1 whenever search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Load static filter resources (stages, users) once
  useEffect(() => {
    let mounted = true
    Promise.all([
      productionStagesService.getVisible().catch(() => [] as ProductionStage[]),
      usersService.getAll().catch(() => [] as User[]),
    ]).then(([st, u]) => {
      if (!mounted) return
      setStages(st)
      setUsers(u)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Load server-wide lightweight indicators (collection inteira)
  const loadIndicators = useCallback(async () => {
    setIndicatorsLoading(true)
    try {
      const summary = await productionService.getOrdersIndicatorsSummary()
      setIndicators(summary)
    } catch (err) {
      console.error('Erro ao carregar indicadores de pedidos:', err)
    } finally {
      setIndicatorsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIndicators()
  }, [loadIndicators])

  // Load paginated list of production orders (server-side getList(page, 50))
  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const filterOptions: OrdersPaginatedFilterOptions = {
        search: debouncedSearch,
        stageInternalId: stageFilter,
        situation: situationFilter,
        period: periodFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        salesRepId: salesRepFilter,
        productionRepId: productionRepFilter,
      }

      const res = await productionService.getOrdersPaginated(
        page,
        perPage,
        filterOptions,
        '-created',
      )
      setOrders(res.items || [])
      setTotalItems(res.totalItems || 0)
      setTotalPages(res.totalPages || 1)
    } catch (err: any) {
      console.error('Erro ao listar pedidos de produção:', err)
      toast({
        title: 'Erro ao carregar pedidos',
        description: 'Não foi possível carregar a listagem de pedidos.',
        variant: 'destructive',
      })
      setOrders([])
      setTotalItems(0)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [
    page,
    debouncedSearch,
    stageFilter,
    situationFilter,
    periodFilter,
    startDate,
    endDate,
    salesRepFilter,
    productionRepFilter,
  ])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Listen to order updates from modal or external events to refresh
  useEffect(() => {
    const handleUpdate = () => {
      loadOrders()
      loadIndicators()
    }
    window.addEventListener('production-order-updated', handleUpdate)
    return () => {
      window.removeEventListener('production-order-updated', handleUpdate)
    }
  }, [loadOrders, loadIndicators])

  // Helpers for formatting
  const formatCurrency = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(Number(val))) return 'R$ 0,00'
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(val))
  }

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—'
    try {
      const d = new Date(isoString)
      if (isNaN(d.getTime())) return '—'
      return d.toLocaleDateString('pt-BR')
    } catch {
      return '—'
    }
  }

  const formatProductSummary = (order: ProductionOrder) => {
    const parts: string[] = []
    if (order.quantity && order.quantity > 0) {
      parts.push(`${order.quantity}x`)
    }
    if (order.product) {
      parts.push(order.product)
    }
    if (order.dimensions && order.dimensions.trim()) {
      parts.push(`(${order.dimensions})`)
    }
    return parts.join(' ') || '—'
  }

  const getStageColorBadge = (stageName: string, internalId?: string) => {
    switch (internalId) {
      case 'order_received':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300'
      case 'awaiting_info':
        return 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
      case 'art_preparation':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300'
      case 'awaiting_approval':
        return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300'
      case 'approved':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300'
      case 'in_production':
        return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 font-semibold'
      case 'ready':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 font-semibold'
      case 'shipped':
        return 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/70 dark:text-blue-200'
      case 'completed':
        return 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  const handleOpenOrder = (order: ProductionOrder) => {
    setSelectedOrderToView(order)
    setViewOrderModalOpen(true)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <ClipboardList className="h-4 w-4" />
            Central de Pedidos
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Pedidos de Produção
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Consulta rápida e unificada de todos os pedidos, prazos, produtos e responsáveis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadOrders()
              loadIndicators()
            }}
            className="text-xs gap-1.5 text-slate-600 dark:text-slate-300"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* 4 Indicadores Superiores (Collection Inteira) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Pedidos Hoje */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Pedidos Hoje
              </span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {indicatorsLoading ? '—' : indicators.ordersToday}
              </div>
              <span className="text-[10px] text-slate-400 block">Criados no dia atual</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Em Produção */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                Em Produção
              </span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {indicatorsLoading ? '—' : indicators.inProduction}
              </div>
              <span className="text-[10px] text-slate-400 block">Pedidos ativos em máquina</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Prontos / Aguardando Retirada */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Prontos / Retirada
              </span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {indicatorsLoading ? '—' : indicators.readyOrAwaitingPickup}
              </div>
              <span className="text-[10px] text-slate-400 block">Prontos ou despachados</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Concluídos Hoje */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                Concluídos Hoje
              </span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {indicatorsLoading ? '—' : indicators.completedToday}
              </div>
              <span className="text-[10px] text-slate-400 block">Finalizados hoje</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros & Busca Server-Side */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        {/* Linha 1: Busca rápida */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar pedidos... (Pedido, cliente ou telefone)"
            className="pl-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-sm"
          />
        </div>

        {/* Linha 2: Filtros combináveis */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* 1. Filtro Etapa / Status */}
          <div>
            <label className="text-[10px] font-semibold uppercase text-slate-500 mb-1 block">
              Status / Etapa
            </label>
            <Select
              value={stageFilter}
              onValueChange={(val) => {
                startTransition(() => {
                  setStageFilter(val)
                  setPage(1)
                })
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Todas as etapas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as etapas</SelectItem>
                {stages.map((st) => (
                  <SelectItem key={st.id} value={st.internal_id}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Filtro Situação */}
          <div>
            <label className="text-[10px] font-semibold uppercase text-slate-500 mb-1 block">
              Situação
            </label>
            <Select
              value={situationFilter}
              onValueChange={(val: any) => {
                startTransition(() => {
                  setSituationFilter(val)
                  setPage(1)
                })
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="archived">Arquivados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 3. Filtro Período */}
          <div>
            <label className="text-[10px] font-semibold uppercase text-slate-500 mb-1 block">
              Período
            </label>
            <Select
              value={periodFilter}
              onValueChange={(val: any) => {
                startTransition(() => {
                  setPeriodFilter(val)
                  setPage(1)
                })
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o histórico</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 4. Filtro Vendedor (sales_rep_id) */}
          <div>
            <label className="text-[10px] font-semibold uppercase text-slate-500 mb-1 block">
              Vendedor
            </label>
            <Select
              value={salesRepFilter}
              onValueChange={(val) => {
                startTransition(() => {
                  setSalesRepFilter(val)
                  setPage(1)
                })
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 5. Filtro Resp. Produção (production_rep_id) */}
          <div>
            <label className="text-[10px] font-semibold uppercase text-slate-500 mb-1 block">
              Resp. Produção
            </label>
            <Select
              value={productionRepFilter}
              onValueChange={(val) => {
                startTransition(() => {
                  setProductionRepFilter(val)
                  setPage(1)
                })
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Todos da produção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos da produção</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Período Personalizado (Inputs de data inicial e final) */}
        {periodFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">De:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPage(1)
                }}
                className="h-8 w-36 text-xs bg-slate-50 dark:bg-slate-950/50"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Até:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPage(1)
                }}
                className="h-8 w-36 text-xs bg-slate-50 dark:bg-slate-950/50"
              />
            </div>
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                  setPage(1)
                }}
                className="h-8 text-xs text-slate-400 hover:text-slate-600"
              >
                Limpar datas
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Contagem total de resultados */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          <strong>{totalItems}</strong>{' '}
          {totalItems === 1 ? 'pedido encontrado' : 'pedidos encontrados'}
          {totalItems > 0 && ` (mostrando página ${page} de ${totalPages})`}
        </span>
      </div>

      {/* TABELA SERVER-SIDE DE PEDIDOS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Pedido</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Produto</th>
                <th className="py-3 px-4">Valor</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Vendedor</th>
                <th className="py-3 px-4">Resp. Produção</th>
                <th className="py-3 px-4">Previsão</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" />
                      <span>Carregando pedidos de produção...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <ClipboardList className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <strong className="block text-slate-700 dark:text-slate-300 text-sm font-semibold">
                      Nenhum pedido encontrado
                    </strong>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tente ajustar os filtros ou o termo de busca.
                    </p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const salesRepName = order.expand?.sales_rep_id?.name || null
                  const prodRepName = order.expand?.production_rep_id?.name || null
                  const deadlineInfo = productionService.calculateDeadlineStatus(
                    order.promised_deadline,
                    order.is_completed,
                  )

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* PEDIDO (order_number) */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{order.order_number}</span>
                          {order.is_completed && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300"
                            >
                              ✓
                            </Badge>
                          )}
                          {order.is_archived && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 border-slate-300 text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400"
                            >
                              Arq.
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* CLIENTE (client_name) */}
                      <td className="py-3 px-4">
                        <div className="min-w-0 max-w-[200px]">
                          <span
                            className="font-semibold text-slate-900 dark:text-white text-xs block truncate"
                            title={order.client_name}
                          >
                            {order.client_name || '—'}
                          </span>
                          {order.client_phone && (
                            <span className="text-[11px] text-slate-400 block truncate">
                              {order.client_phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* DATA (created) */}
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(order.created)}
                      </td>

                      {/* PRODUTO (resumo derivado de product + quantity + dimensions) */}
                      <td className="py-3 px-4">
                        <div className="max-w-[240px] truncate" title={formatProductSummary(order)}>
                          <span className="text-slate-800 dark:text-slate-200 font-medium">
                            {formatProductSummary(order)}
                          </span>
                        </div>
                      </td>

                      {/* VALOR (total_value em R$) */}
                      <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {formatCurrency(order.total_value)}
                      </td>

                      {/* STATUS (stage_name) */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-2 py-0.5 border ${getStageColorBadge(
                            order.stage_name,
                            order.stage_internal_id,
                          )}`}
                        >
                          {order.stage_name || 'Pedido recebido'}
                        </Badge>
                      </td>

                      {/* VENDEDOR (sales_rep_id expand users; se vazio, "—" sem inventar) */}
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {salesRepName ? (
                          <div className="flex items-center gap-1.5" title={salesRepName}>
                            <UserCheck className="h-3 w-3 text-slate-400" />
                            <span className="truncate max-w-[120px]">{salesRepName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* RESP. PRODUÇÃO (production_rep_id expand users; se vazio, "—") */}
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {prodRepName ? (
                          <div className="flex items-center gap-1.5" title={prodRepName}>
                            <Layers className="h-3 w-3 text-slate-400" />
                            <span className="truncate max-w-[120px]">{prodRepName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* PREVISÃO (promised_deadline; se vazio, "—") */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {order.promised_deadline ? (
                          <div className="flex flex-col">
                            <span className="text-slate-800 dark:text-slate-200 font-medium">
                              {formatDate(order.promised_deadline)}
                            </span>
                            {!order.is_completed && deadlineInfo.status === 'overdue' && (
                              <span className="text-[10px] text-rose-600 font-bold">
                                {deadlineInfo.label}
                              </span>
                            )}
                            {!order.is_completed && deadlineInfo.status === 'due_today' && (
                              <span className="text-[10px] text-amber-600 font-bold">
                                Vence HOJE
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* AÇÃO (botão "Ver pedido") */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenOrder(order)}
                          className="h-8 text-xs gap-1.5 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:bg-slate-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 font-semibold shadow-2xs"
                          title={`Ver detalhes do pedido ${order.order_number}`}
                        >
                          <Eye className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Ver pedido</span>
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé de Paginação Server-side */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div>
            Mostrando <strong>{orders.length}</strong> de <strong>{totalItems}</strong> pedidos (50
            por página)
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5 text-xs gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Anterior</span>
            </Button>

            <span className="px-2 font-medium">
              Página {page} de {totalPages || 1}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2.5 text-xs gap-1"
            >
              <span>Próxima</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ProductionOrderModal Reutilizado com todos os recursos (histórico, chat interno, etapas, anexos) */}
      <ProductionOrderModal
        isOpen={viewOrderModalOpen}
        onClose={() => {
          setViewOrderModalOpen(false)
          setSelectedOrderToView(null)
        }}
        orderToEdit={selectedOrderToView}
        onSaved={() => {
          loadOrders()
          loadIndicators()
        }}
      />
    </div>
  )
}
