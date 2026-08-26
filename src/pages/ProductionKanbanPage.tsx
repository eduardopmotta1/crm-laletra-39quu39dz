import React, { useState, useEffect } from 'react'
import type { ProductionOrder, ProductionStage, Priority } from '@/types/crm'
import { productionService } from '@/services/production'
import { productionStagesService } from '@/services/productionStages'
import { formatCurrency, formatDateTime } from '@/lib/sla'
import ProductionCard from '@/components/ProductionCard'
import ProductionOrderModal from '@/components/ProductionOrderModal'
import ProductionStageManagerModal from '@/components/ProductionStageManagerModal'
import ProofApprovalModal from '@/components/ProofApprovalModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Plus,
  SlidersHorizontal,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Archive,
  RotateCcw,
  User as UserIcon,
  LayoutGrid,
  ShieldCheck,
  Package,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function ProductionKanbanPage() {
  const [stages, setStages] = useState<ProductionStage[]>([])
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)

  // View Mode: Active production vs Archived
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [quickFilter, setQuickFilter] = useState<
    | 'all'
    | 'overdue'
    | 'due_today'
    | 'awaiting_art'
    | 'awaiting_approval'
    | 'in_production'
    | 'ready'
    | 'completed'
  >('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')

  // Drag & Drop
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null)
  const [dragOverStageInternalId, setDragOverStageInternalId] = useState<string | null>(null)

  // Modals
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [orderToEdit, setOrderToEdit] = useState<ProductionOrder | null>(null)
  const [stageManagerOpen, setStageManagerOpen] = useState(false)
  const [proofApprovalModalOpen, setProofApprovalModalOpen] = useState(false)
  const [orderForApproval, setOrderForApproval] = useState<ProductionOrder | null>(null)
  const [newOrderStageId, setNewOrderStageId] = useState<string>('order_received')

  // Reopen Modal
  const [reopenModalOpen, setReopenModalOpen] = useState(false)
  const [orderToReopen, setOrderToReopen] = useState<ProductionOrder | null>(null)
  const [reopenTargetStage, setReopenTargetStage] = useState<string>('order_received')
  const [reopening, setReopening] = useState(false)

  const loadData = async () => {
    try {
      const [stageList, orderList] = await Promise.all([
        productionStagesService.getVisible(),
        productionService.getAll(undefined, '-created'),
      ])
      setStages(stageList)
      setOrders(orderList)
    } catch (err) {
      console.error('Error loading production data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const handleUpdate = () => loadData()
    window.addEventListener('production-order-updated', handleUpdate)
    return () => window.removeEventListener('production-order-updated', handleUpdate)
  }, [])

  // Split orders into active and archived
  const activeOrders = orders.filter((o) => o.is_archived !== true)
  const archivedOrders = orders.filter((o) => o.is_archived === true)

  // Quick stats calculation for active production
  const stats = {
    total: activeOrders.length,
    archivedTotal: archivedOrders.length,
    overdue: activeOrders.filter((o) => {
      const dl = productionService.calculateDeadlineStatus(o.promised_deadline, o.is_completed)
      return dl.status === 'overdue'
    }).length,
    dueToday: activeOrders.filter((o) => {
      const dl = productionService.calculateDeadlineStatus(o.promised_deadline, o.is_completed)
      return dl.status === 'due_today'
    }).length,
    awaitingApproval: activeOrders.filter((o) => o.stage_internal_id === 'awaiting_approval')
      .length,
    inProduction: activeOrders.filter((o) => o.stage_internal_id === 'in_production').length,
    ready: activeOrders.filter((o) => o.stage_internal_id === 'ready').length,
    completed: activeOrders.filter((o) => o.is_completed || o.stage_internal_id === 'completed')
      .length,
  }

  // Filter active orders for Kanban
  const filteredActiveOrders = activeOrders.filter((o) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      o.order_number.toLowerCase().includes(term) ||
      o.client_name.toLowerCase().includes(term) ||
      o.client_phone.includes(term) ||
      o.product.toLowerCase().includes(term) ||
      (o.tracking_code && o.tracking_code.toLowerCase().includes(term))

    if (!matchesSearch) return false

    if (priorityFilter !== 'all' && o.priority !== priorityFilter) return false

    if (quickFilter === 'overdue') {
      const dl = productionService.calculateDeadlineStatus(o.promised_deadline, o.is_completed)
      return dl.status === 'overdue'
    }
    if (quickFilter === 'due_today') {
      const dl = productionService.calculateDeadlineStatus(o.promised_deadline, o.is_completed)
      return dl.status === 'due_today' || dl.status === 'due_tomorrow'
    }
    if (quickFilter === 'awaiting_art') {
      return o.stage_internal_id === 'art_preparation' || o.stage_internal_id === 'awaiting_info'
    }
    if (quickFilter === 'awaiting_approval') {
      return o.stage_internal_id === 'awaiting_approval'
    }
    if (quickFilter === 'in_production') {
      return o.stage_internal_id === 'in_production'
    }
    if (quickFilter === 'ready') {
      return o.stage_internal_id === 'ready' || o.stage_internal_id === 'shipped'
    }
    if (quickFilter === 'completed') {
      return o.is_completed || o.stage_internal_id === 'completed'
    }

    return true
  })

  // Filter archived orders for list view
  const filteredArchivedOrders = archivedOrders.filter((o) => {
    const term = searchTerm.toLowerCase()
    return (
      o.order_number.toLowerCase().includes(term) ||
      o.client_name.toLowerCase().includes(term) ||
      o.client_phone.includes(term) ||
      o.product.toLowerCase().includes(term) ||
      (o.tracking_code && o.tracking_code.toLowerCase().includes(term))
    )
  })

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData('text/plain', orderId)
    setDraggedOrderId(orderId)
  }

  const handleDragOver = (e: React.DragEvent, stageInternalId: string) => {
    e.preventDefault()
    if (dragOverStageInternalId !== stageInternalId) {
      setDragOverStageInternalId(stageInternalId)
    }
  }

  const handleDragLeave = () => {
    setDragOverStageInternalId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetStageInternalId: string) => {
    e.preventDefault()
    setDragOverStageInternalId(null)
    const orderId = e.dataTransfer.getData('text/plain') || draggedOrderId
    if (!orderId) return

    const currentOrder = orders.find((o) => o.id === orderId)
    if (!currentOrder || currentOrder.stage_internal_id === targetStageInternalId) return

    const targetStage = stages.find((s) => s.internal_id === targetStageInternalId)
    const targetStageName = targetStage?.name || targetStageInternalId

    // Optimistic UI update
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              stage_internal_id: targetStageInternalId,
              stage_name: targetStageName,
              is_completed: targetStageInternalId === 'completed',
            }
          : o,
      ),
    )

    try {
      await productionService.updateStage(orderId, targetStageInternalId, {
        notes: `Pedido arrastado de "${currentOrder.stage_name}" para "${targetStageName}".`,
      })
      toast({
        title: 'Etapa de Produção Atualizada',
        description: `Pedido ${currentOrder.order_number} movido para "${targetStageName}".`,
      })
      window.dispatchEvent(new CustomEvent('production-order-updated'))
    } catch (err) {
      console.error('Error updating production stage:', err)
      toast({
        title: 'Erro ao mover pedido',
        description: 'Não foi possível atualizar a etapa.',
        variant: 'destructive',
      })
      loadData()
    } finally {
      setDraggedOrderId(null)
    }
  }

  // Handle Reopen Order Flow
  const handleOpenReopenModal = (order: ProductionOrder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setOrderToReopen(order)
    setReopenTargetStage('order_received')
    setReopenModalOpen(true)
  }

  const handleConfirmReopen = async () => {
    if (!orderToReopen) return
    setReopening(true)
    try {
      await productionService.reopenOrder(orderToReopen.id, reopenTargetStage)
      toast({
        title: 'Pedido Reaberto',
        description: `O pedido ${orderToReopen.order_number} foi reaberto com sucesso e enviado para a Produção Ativa.`,
      })
      setReopenModalOpen(false)
      setOrderToReopen(null)
      window.dispatchEvent(new CustomEvent('production-order-updated'))
    } catch (err: any) {
      console.error('Error reopening production order:', err)
      toast({
        title: 'Erro ao reabrir pedido',
        description: err?.message || 'Não foi possível reabrir o pedido.',
        variant: 'destructive',
      })
    } finally {
      setReopening(false)
    }
  }

  const getStageBadgeColor = (colorName?: string) => {
    switch (colorName) {
      case 'cyan':
        return 'border-cyan-500/30 text-cyan-700 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-300'
      case 'rose':
        return 'border-rose-500/30 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300'
      case 'amber':
        return 'border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300'
      case 'purple':
        return 'border-purple-500/30 text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300'
      case 'indigo':
        return 'border-indigo-500/30 text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300'
      case 'emerald':
        return 'border-emerald-500/30 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300'
      case 'slate':
        return 'border-slate-500/30 text-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-slate-300'
      case 'blue':
      default:
        return 'border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300'
    }
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Toggle: Produção Ativa vs Pedidos Arquivados */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'active'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Produção Ativa
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${
                activeTab === 'active'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {stats.total}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'archived'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Archive className="h-4 w-4" />
            Pedidos Arquivados
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${
                activeTab === 'archived'
                  ? 'bg-amber-700 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {stats.archivedTotal}
            </Badge>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            title="Recarregar dados"
            className="h-8 px-2.5 text-xs text-slate-600 dark:text-slate-300"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1 text-slate-500" />
            Atualizar
          </Button>
        </div>
      </div>

      {activeTab === 'active' ? (
        <>
          {/* Top Banner & Quick Metrics Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div
              onClick={() => setQuickFilter(quickFilter === 'overdue' ? 'all' : 'overdue')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                quickFilter === 'overdue'
                  ? 'bg-rose-100 dark:bg-rose-950/60 border-rose-400 ring-2 ring-rose-500/30'
                  : stats.overdue > 0
                    ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 hover:bg-rose-100/60'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400">
                  Atrasados
                </span>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </div>
              <span className="text-xl font-black text-rose-800 dark:text-rose-200 block mt-1">
                {stats.overdue}
              </span>
            </div>

            <div
              onClick={() => setQuickFilter(quickFilter === 'due_today' ? 'all' : 'due_today')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                quickFilter === 'due_today'
                  ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 ring-2 ring-amber-500/30'
                  : stats.dueToday > 0
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 hover:bg-amber-100/60'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400">
                  Para Hoje / Amanhã
                </span>
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <span className="text-xl font-black text-amber-800 dark:text-amber-200 block mt-1">
                {stats.dueToday}
              </span>
            </div>

            <div
              onClick={() =>
                setQuickFilter(quickFilter === 'awaiting_approval' ? 'all' : 'awaiting_approval')
              }
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                quickFilter === 'awaiting_approval'
                  ? 'bg-purple-100 dark:bg-purple-950/60 border-purple-400 ring-2 ring-purple-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-400">
                  Aguardando Aprovação
                </span>
                <ShieldCheck className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-xl font-black text-purple-800 dark:text-purple-200 block mt-1">
                {stats.awaitingApproval}
              </span>
            </div>

            <div
              onClick={() =>
                setQuickFilter(quickFilter === 'in_production' ? 'all' : 'in_production')
              }
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                quickFilter === 'in_production'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-400 ring-2 ring-emerald-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">
                  Em Produção
                </span>
                <Package className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-xl font-black text-emerald-800 dark:text-emerald-200 block mt-1">
                {stats.inProduction}
              </span>
            </div>

            <div
              onClick={() => setQuickFilter(quickFilter === 'ready' ? 'all' : 'ready')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                quickFilter === 'ready'
                  ? 'bg-blue-100 dark:bg-blue-950/60 border-blue-400 ring-2 ring-blue-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-400">
                  Prontos / Expedição
                </span>
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-xl font-black text-blue-800 dark:text-blue-200 block mt-1">
                {stats.ready}
              </span>
            </div>

            <div
              onClick={() => setQuickFilter(quickFilter === 'completed' ? 'all' : 'completed')}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                quickFilter === 'completed'
                  ? 'bg-slate-200 dark:bg-slate-800 border-slate-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  Concluídos Totais
                </span>
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
              </div>
              <span className="text-xl font-black text-slate-800 dark:text-slate-200 block mt-1">
                {stats.completed}
              </span>
            </div>
          </div>

          {/* Control Header & Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    Esteira de Produção Gráfica
                  </h1>
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {filteredActiveOrders.length} pedidos ativos
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Kanban separado do comercial. Drag & drop livre entre etapas com alertas de prazo
                  e avisos automáticos no WhatsApp.
                </p>
              </div>
            </div>

            {/* Action Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px]">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar #pedido, cliente, produto..."
                  className="h-9 pl-9 text-xs bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setStageManagerOpen(true)}
                className="text-xs h-9 text-slate-600 dark:text-slate-300"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                Configurar Etapas
              </Button>

              <Button
                onClick={() => {
                  setOrderToEdit(null)
                  setNewOrderStageId(stages[0]?.internal_id || 'order_received')
                  setOrderModalOpen(true)
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Novo Pedido
              </Button>
            </div>
          </div>

          {/* Kanban Board Horizontal Scroll */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div
              className="flex items-start gap-4 h-full"
              style={{ minWidth: `${Math.max(stages.length * 280, 1400)}px` }}
            >
              {stages.map((stage) => {
                const stageInternalId = stage.internal_id
                const stageOrders = filteredActiveOrders.filter(
                  (o) => o.stage_internal_id === stageInternalId,
                )
                const isTarget = dragOverStageInternalId === stageInternalId
                const totalStageValue = stageOrders.reduce(
                  (sum, o) => sum + (o.total_value || 0),
                  0,
                )

                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => handleDragOver(e, stageInternalId)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, stageInternalId)}
                    className={`w-68 shrink-0 flex flex-col max-h-[calc(100vh-310px)] rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 border transition-all duration-200 ${
                      isTarget
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800/80'
                    }`}
                  >
                    {/* Column Header */}
                    <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {stage.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold px-1.5 py-0 ${getStageBadgeColor(
                            stage.color,
                          )}`}
                        >
                          {stageOrders.length}
                        </Badge>
                      </div>

                      <span
                        className="truncate text-[10px] text-slate-500"
                        title={stage.description}
                      >
                        {stage.description || 'Etapa da esteira'}
                      </span>

                      {totalStageValue > 0 && (
                        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 pt-0.5">
                          Total: {formatCurrency(totalStageValue)}
                        </div>
                      )}
                    </div>

                    {/* Column Cards Container */}
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[140px]">
                      {stageOrders.length === 0 ? (
                        <div
                          onClick={() => {
                            setOrderToEdit(null)
                            setNewOrderStageId(stageInternalId)
                            setOrderModalOpen(true)
                          }}
                          className="h-24 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-center p-3 cursor-pointer hover:bg-white dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <Plus className="h-4 w-4 text-slate-400 mb-1" />
                          <span className="text-[11px] text-slate-400">Adicionar pedido</span>
                        </div>
                      ) : (
                        stageOrders.map((order) => (
                          <ProductionCard
                            key={order.id}
                            order={order}
                            stage={stage}
                            onClick={() => {
                              setOrderToEdit(order)
                              setOrderModalOpen(true)
                            }}
                            onOpenApprovalModal={(ord, e) => {
                              setOrderForApproval(ord)
                              setProofApprovalModalOpen(true)
                            }}
                            onDragStart={(e) => handleDragStart(e, order.id)}
                          />
                        ))
                      )}
                    </div>

                    {/* Column Footer: Quick Add */}
                    <div className="p-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setOrderToEdit(null)
                          setNewOrderStageId(stageInternalId)
                          setOrderModalOpen(true)
                        }}
                        className="w-full text-xs text-slate-500 hover:text-emerald-600 hover:bg-white dark:hover:bg-slate-800 h-8 justify-start"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Novo nesta etapa
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        /* ARCHIVED ORDERS VIEW */
        <div className="flex flex-col flex-1 space-y-4">
          {/* Header Controls for Archived */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-600 text-white rounded-xl shadow-sm">
                <Archive className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    Pedidos de Produção Arquivados
                  </h1>
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {filteredArchivedOrders.length} arquivados
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Histórico de pedidos arquivados da esteira. Você pode consultar detalhes ou
                  reabrir o pedido para qualquer etapa da produção a qualquer momento.
                </p>
              </div>
            </div>

            {/* Search Box */}
            <div className="relative min-w-[260px]">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar pedido arquivado..."
                className="h-9 pl-9 text-xs bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Archived Table / List */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1">
            {filteredArchivedOrders.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-full text-amber-600">
                  <Archive className="h-8 w-8" />
                </div>
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
                  Nenhum pedido de produção arquivado
                </h3>
                <p className="text-xs text-slate-500 max-w-md">
                  Quando um pedido for arquivado na Produção Ativa através do botão de arquivar, ele
                  aparecerá listado aqui com todo o histórico preservado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500">
                      <th className="p-3 font-semibold">Número</th>
                      <th className="p-3 font-semibold">Cliente</th>
                      <th className="p-3 font-semibold">Produto</th>
                      <th className="p-3 font-semibold">Valor</th>
                      <th className="p-3 font-semibold">Data Arquivamento / Atualização</th>
                      <th className="p-3 font-semibold">Responsável</th>
                      <th className="p-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredArchivedOrders.map((order) => {
                      const repName =
                        order.expand?.production_rep_id?.name ||
                        order.expand?.sales_rep_id?.name ||
                        'Não atribuído'

                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{order.order_number}</span>
                              {order.is_completed && (
                                <Badge variant="outline" className="text-[9px] py-0">
                                  Concluído
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {order.client_name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {order.client_phone}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                              {order.product}
                            </div>
                            {order.quantity && (
                              <div className="text-[11px] text-slate-400">
                                Qtd: {order.quantity} un
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                            {order.total_value ? formatCurrency(order.total_value) : '-'}
                          </td>
                          <td className="p-3 text-slate-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              <span>{formatDateTime(order.updated || order.created)}</span>
                            </div>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="h-3.5 w-3.5 text-slate-400" />
                              <span className="truncate max-w-[120px]">{repName}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setOrderToEdit(order)
                                  setOrderModalOpen(true)
                                }}
                                className="h-8 text-xs px-2.5 text-slate-600 dark:text-slate-300"
                              >
                                Ver Detalhes
                              </Button>

                              <Button
                                size="sm"
                                onClick={(e) => handleOpenReopenModal(order, e)}
                                className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 shadow-sm"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reabrir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Production Order Create/Edit Modal */}
      <ProductionOrderModal
        isOpen={orderModalOpen}
        onClose={() => {
          setOrderModalOpen(false)
          setOrderToEdit(null)
        }}
        onSaved={loadData}
        orderToEdit={orderToEdit}
        initialStageId={newOrderStageId}
      />

      {/* Production Stages Manager Modal */}
      <ProductionStageManagerModal
        isOpen={stageManagerOpen}
        onClose={() => setStageManagerOpen(false)}
        onSaved={loadData}
      />

      {/* Proof Approval Modal */}
      <ProofApprovalModal
        isOpen={proofApprovalModalOpen}
        onClose={() => {
          setProofApprovalModalOpen(false)
          setOrderForApproval(null)
        }}
        order={orderForApproval}
        onSuccess={loadData}
      />

      {/* Reopen Production Order Modal */}
      <Dialog open={reopenModalOpen} onOpenChange={setReopenModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
              Reabrir Pedido {orderToReopen?.order_number}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              O pedido de <strong>{orderToReopen?.client_name}</strong> voltará para a esteira de
              produção ativa. Escolha para qual etapa ele deve retornar:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Etapa de Destino na Produção
            </label>
            <Select value={reopenTargetStage} onValueChange={setReopenTargetStage}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Selecione a etapa..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="order_received">📥 Pedido recebido (Recomendado)</SelectItem>
                <SelectItem value="art_preparation">🎨 Arte em preparação</SelectItem>
                <SelectItem value="awaiting_approval">⏳ Aguardando aprovação</SelectItem>
                <SelectItem value="in_production">⚙️ Em produção</SelectItem>
                <SelectItem value="ready">📦 Pronto</SelectItem>
                {stages
                  .filter(
                    (s) =>
                      ![
                        'order_received',
                        'art_preparation',
                        'awaiting_approval',
                        'in_production',
                        'ready',
                      ].includes(s.internal_id),
                  )
                  .map((s) => (
                    <SelectItem key={s.internal_id} value={s.internal_id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">
              O pedido manterá todos os dados, anexos, valores e histórico original de logs.
            </p>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReopenModalOpen(false)}
              disabled={reopening}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmReopen}
              disabled={reopening}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {reopening ? 'Reabrindo...' : 'Confirmar Reabertura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
