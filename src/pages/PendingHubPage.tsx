import React, { useState, useEffect } from 'react'
import {
  AlertCircle,
  Clock,
  MessageSquare,
  Flame,
  FileText,
  CheckSquare,
  Image as ImageIcon,
  Calendar,
  Clock3,
  HeartHandshake,
  AlertTriangle,
  Search,
  Filter,
  CheckCircle2,
  User,
  Users,
  ChevronRight,
  Send,
  ExternalLink,
  RotateCcw,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Percent,
  Check,
  X,
  MoreVertical,
  Layers,
  ArrowUpDown,
  Bell,
  Eye,
  SlidersHorizontal,
  Package,
} from 'lucide-react'
import { pendingService, PENDING_CATEGORY_CONFIG } from '@/services/pending'
import { clientsService } from '@/services/clients'
import { attendancesService } from '@/services/attendances'
import { settingsService } from '@/services/settings'
import { whatsappService } from '@/services/whatsapp'
import { tasksService } from '@/services/tasks'
import type { Attendance } from '@/types/crm'
import { productionService } from '@/services/production'
import { evaluationsService } from '@/services/evaluations'
import { postSalesService } from '@/services/postSales'
import type {
  PendingItem,
  PendingCategory,
  PendingPriority,
  EfficiencyMetrics,
  PendingResolutionRecord,
  User as UserType,
  Client,
  SlaConfig,
} from '@/types/crm'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatDateTime, getWhatsAppDirectUrl } from '@/lib/sla'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'
import ProductionOrderModal from '@/components/ProductionOrderModal'

export default function PendingHubPage() {
  const { user } = useAuth()

  // Data states
  const [items, setItems] = useState<PendingItem[]>([])
  const [metrics, setMetrics] = useState<EfficiencyMetrics | null>(null)
  const [resolutions, setResolutions] = useState<PendingResolutionRecord[]>([])
  const [users, setUsers] = useState<UserType[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({
    urgentMinutes: 1440,
    warningMinutes: 720,
    noticeMinutes: 360,
  })

  // View & Filter states
  const [activeTab, setActiveTab] = useState<'pending' | 'efficiency' | 'history'>('pending')
  const [selectedCategory, setSelectedCategory] = useState<PendingCategory | 'all'>('all')
  const [selectedPriority, setSelectedPriority] = useState<PendingPriority | 'all'>('all')
  const [selectedResponsible, setSelectedResponsible] = useState<string>('all') // 'all', 'me', 'unassigned', or userId
  const [searchQuery, setSearchQuery] = useState('')
  const [efficiencyPeriod, setEfficiencyPeriod] = useState<
    'today' | 'yesterday' | '7days' | 'month'
  >('today')

  // Modals & Action states
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [selectedClientForChat, setSelectedClientForChat] = useState<Client | null>(null)
  const [selectedAttendanceForChat, setSelectedAttendanceForChat] = useState<Attendance | null>(
    null,
  )
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  // Quick Resolve Dialog
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [itemToResolve, setItemToResolve] = useState<PendingItem | null>(null)
  const [resolveAction, setResolveAction] = useState('Marcado como resolvido')
  const [resolveNotes, setResolveNotes] = useState('')
  const [resolvingLoading, setResolvingLoading] = useState(false)

  // Reschedule Dialog
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [itemToReschedule, setItemToReschedule] = useState<PendingItem | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')

  // Assign Responsible Dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [itemToAssign, setItemToAssign] = useState<PendingItem | null>(null)
  const [assignUserId, setAssignUserId] = useState('')

  // Note Dialog
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [itemForNote, setItemForNote] = useState<PendingItem | null>(null)
  const [quickNoteText, setQuickNoteText] = useState('')

  useEffect(() => {
    loadAllData()
    const interval = setInterval(() => {
      loadAllData(false)
    }, 20000) // auto-refresh in background every 20s
    return () => clearInterval(interval)
  }, [efficiencyPeriod])

  const loadAllData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    else setRefreshing(true)

    try {
      const [pendingList, effMetrics, resHistory, userList, slaCfg] = await Promise.all([
        pendingService.getAllPendingItems(),
        pendingService.getEfficiencyMetrics(efficiencyPeriod),
        pendingService.getResolutionHistory(50),
        pb.collection('users').getFullList<UserType>({ requestKey: null }),
        settingsService.getSlaConfig(),
      ])

      setItems(pendingList)
      setMetrics(effMetrics)
      setResolutions(resHistory)
      setUsers(userList)
      setSlaConfig(slaCfg)
    } catch (err) {
      console.error('Error loading pending hub data:', err)
      toast({
        title: 'Erro ao carregar Central de Pendências',
        description: 'Não foi possível sincronizar os módulos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Count items per category
  const categoryCounts: Record<string, number> = {}
  items.forEach((item) => {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1
  })

  // Filter items
  const filteredItems = items.filter((item) => {
    // Category filter
    if (selectedCategory !== 'all' && item.category !== selectedCategory) {
      return false
    }

    // Priority filter
    if (selectedPriority !== 'all' && item.priority !== selectedPriority) {
      return false
    }

    // Responsible filter
    if (selectedResponsible === 'me') {
      if (!user?.id || item.assignedToId !== user.id) return false
    } else if (selectedResponsible === 'unassigned') {
      if (item.assignedToId) return false
    } else if (selectedResponsible !== 'all') {
      if (item.assignedToId !== selectedResponsible) return false
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchTitle = item.title.toLowerCase().includes(q)
      const matchSub = item.subtitle?.toLowerCase().includes(q)
      const matchClient = item.clientName.toLowerCase().includes(q)
      const matchPhone = item.clientPhone.toLowerCase().includes(q)
      const matchOrder = item.orderNumber?.toLowerCase().includes(q)
      const matchProduct = item.productInterest?.toLowerCase().includes(q)
      if (!matchTitle && !matchSub && !matchClient && !matchPhone && !matchOrder && !matchProduct) {
        return false
      }
    }

    return true
  })

  const urgentCount = items.filter((i) => i.priority === 'urgente').length
  const highCount = items.filter((i) => i.priority === 'alta').length
  const unassignedCount = items.filter((i) => !i.assignedToId).length

  // Quick action: open WhatsApp chat
  const handleOpenChat = async (item: PendingItem) => {
    if (!item.clientId) {
      toast({
        title: 'Cliente não vinculado',
        description: 'Este item não possui um cliente com WhatsApp direto.',
        variant: 'destructive',
      })
      return
    }

    try {
      let activeAtt: Attendance | null = null

      if (item.attendanceId) {
        try {
          activeAtt = await attendancesService.getById(item.attendanceId)
          if (!activeAtt) {
            console.warn(
              `[PendingHubPage] Atendimento com ID "${item.attendanceId}" não resolveu (registro apagado ou não encontrado). Abrindo drawer só com o cliente.`,
            )
          }
        } catch (attErr) {
          console.warn(
            `[PendingHubPage] Erro ao buscar atendimento "${item.attendanceId}":`,
            attErr,
          )
        }
      }

      const cl = await clientsService.getById(item.clientId)
      if (cl) {
        setSelectedClientForChat(cl)
        setSelectedAttendanceForChat(activeAtt)
        setChatDrawerOpen(true)
      }
    } catch {
      toast({ title: 'Erro ao abrir cliente' })
    }
  }

  // Quick action: open production order
  const handleOpenOrder = (orderId?: string) => {
    if (orderId) {
      setSelectedOrderId(orderId)
      setOrderModalOpen(true)
    }
  }

  // Resolve item submission
  const handleConfirmResolve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemToResolve) return

    setResolvingLoading(true)
    try {
      const ok = await pendingService.resolveItem(itemToResolve, resolveAction, resolveNotes)
      if (ok) {
        toast({
          title: 'Pendência resolvida!',
          description: `O registro original foi atualizado e retirado da Central.`,
        })
        setResolveDialogOpen(false)
        setItemToResolve(null)
        setResolveNotes('')
        loadAllData(false)
      } else {
        throw new Error('Falha ao atualizar')
      }
    } catch (err) {
      toast({
        title: 'Erro ao resolver pendência',
        variant: 'destructive',
      })
    } finally {
      setResolvingLoading(false)
    }
  }

  // Reschedule submission
  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemToReschedule || !rescheduleDate) return

    try {
      const ok = await pendingService.rescheduleItem(itemToReschedule, rescheduleDate)
      if (ok) {
        await pendingService.logResolution({
          category: itemToReschedule.category,
          itemId: itemToReschedule.id,
          itemTitle: itemToReschedule.title,
          clientId: itemToReschedule.clientId,
          clientName: itemToReschedule.clientName,
          assignedTo: itemToReschedule.assignedToId,
          actionTaken: `Reagendado para ${new Date(rescheduleDate).toLocaleDateString('pt-BR')}`,
          waitingMinutes: itemToReschedule.waitingTimeMinutes,
        })
        toast({
          title: 'Prazo reagendado!',
          description: `Nova data programada: ${new Date(rescheduleDate).toLocaleDateString('pt-BR')}`,
        })
        setRescheduleDialogOpen(false)
        loadAllData(false)
      }
    } catch {
      toast({ title: 'Erro ao reagendar', variant: 'destructive' })
    }
  }

  // Assign responsible submission
  const handleConfirmAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemToAssign || !assignUserId) return

    const selectedUser = users.find((u) => u.id === assignUserId)
    const userName = selectedUser?.name || selectedUser?.email || 'Novo Responsável'

    try {
      const ok = await pendingService.assignResponsible(itemToAssign, assignUserId, userName)
      if (ok) {
        await pendingService.logResolution({
          category: itemToAssign.category,
          itemId: itemToAssign.id,
          itemTitle: itemToAssign.title,
          clientId: itemToAssign.clientId,
          clientName: itemToAssign.clientName,
          assignedTo: assignUserId,
          actionTaken: `Responsável atribuído para: ${userName}`,
          waitingMinutes: itemToAssign.waitingTimeMinutes,
        })
        toast({
          title: 'Responsável atualizado!',
          description: `Item atribuído a ${userName}.`,
        })
        setAssignDialogOpen(false)
        loadAllData(false)
      }
    } catch {
      toast({ title: 'Erro ao atribuir responsável', variant: 'destructive' })
    }
  }

  // Add quick observation
  const handleSaveQuickNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemForNote || !quickNoteText.trim()) return

    try {
      if (itemForNote.clientId) {
        const cl = await clientsService.getById(itemForNote.clientId)
        const newNotes = cl?.notes ? `${cl.notes}\n[Obs Central]: ${quickNoteText}` : quickNoteText
        await clientsService.update(itemForNote.clientId, { notes: newNotes })
      } else if (itemForNote.orderId) {
        const ord = await productionService.getById(itemForNote.orderId)
        const newNotes = ord?.notes
          ? `${ord.notes}\n[Obs Central]: ${quickNoteText}`
          : quickNoteText
        await productionService.update(itemForNote.orderId, { notes: newNotes })
      }

      toast({ title: 'Observação adicionada com sucesso!' })
      setNoteDialogOpen(false)
      setQuickNoteText('')
      loadAllData(false)
    } catch {
      toast({ title: 'Erro ao salvar observação', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header section with status pills */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Central de Pendências
                {urgentCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="animate-pulse text-xs font-extrabold px-2 py-0.5"
                  >
                    {urgentCount} URGENTES
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-slate-500">
                Hub unificado de atenção da equipe: Atendimento, Produção, WhatsApp, Orçamentos,
                Pós-venda e Reclamações.
              </p>
            </div>
          </div>
        </div>

        {/* Tab switch & refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
              Pendências ({items.length})
            </button>
            <button
              onClick={() => setActiveTab('efficiency')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'efficiency'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
              Dashboard de Eficiência
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-purple-600" />
              Histórico de Resoluções
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadAllData(false)}
            disabled={refreshing}
            className="h-9 px-2.5 text-xs text-slate-600 dark:text-slate-300"
            title="Atualizar pendências agora"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-emerald-600' : ''}`}
            />
          </Button>
        </div>
      </div>

      {/* Top Section 3: "O que precisa da minha atenção hoje?" Clickable cards */}
      {activeTab === 'pending' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              O que precisa da minha atenção hoje?
            </h3>
            {selectedCategory !== 'all' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategory('all')}
                className="text-[11px] h-6 px-2 text-rose-600 hover:text-rose-700"
              >
                Limpar filtro de categoria ({PENDING_CATEGORY_CONFIG[selectedCategory]?.shortLabel})
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {Object.entries(PENDING_CATEGORY_CONFIG).map(([catKey, config]) => {
              const count = categoryCounts[catKey] || 0
              const isSelected = selectedCategory === catKey
              const hasUrgent = items.some(
                (i) => i.category === catKey && (i.priority === 'urgente' || i.priority === 'alta'),
              )

              return (
                <div
                  key={catKey}
                  onClick={() =>
                    setSelectedCategory(isSelected ? 'all' : (catKey as PendingCategory))
                  }
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'ring-2 ring-emerald-500 border-emerald-500 bg-white dark:bg-slate-900 shadow-md scale-[1.02]'
                      : count > 0
                        ? `${config.bgColor} ${config.borderColor} hover:shadow-sm hover:border-slate-400`
                        : 'bg-white/60 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                      {config.shortLabel}
                    </span>
                    {hasUrgent && count > 0 && (
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping inline-block shrink-0" />
                    )}
                  </div>

                  <div className="flex items-end justify-between mt-2">
                    <span
                      className={`text-2xl font-black ${
                        count > 0
                          ? hasUrgent
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-900 dark:text-white'
                          : 'text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[9px] px-1.5 py-0 font-bold ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : count > 0
                            ? config.badgeColor
                            : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isSelected ? 'Filtrado' : count > 0 ? 'Ver itens' : 'Limpo'}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 1: PENDÊNCIAS LIST */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Search input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar cliente, pedido, telefone, produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9 bg-slate-50 dark:bg-slate-800 border-slate-200"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
              {/* Priority filter */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-400 text-[11px] font-semibold hidden sm:inline">
                  Prioridade:
                </span>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value as any)}
                  className="h-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 font-medium"
                >
                  <option value="all">Todas as prioridades</option>
                  <option value="urgente">🚨 Somente Urgentes ({urgentCount})</option>
                  <option value="alta">⚡ Alta ({highCount})</option>
                  <option value="normal">Normal</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>

              {/* Responsible filter */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-400 text-[11px] font-semibold hidden sm:inline">
                  Responsável:
                </span>
                <select
                  value={selectedResponsible}
                  onChange={(e) => setSelectedResponsible(e.target.value)}
                  className="h-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 font-medium"
                >
                  <option value="all">Toda a equipe ({items.length})</option>
                  <option value="me">👤 Minhas pendências</option>
                  <option value="unassigned">⚠️ Sem responsável ({unassignedCount})</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset filter button */}
              {(selectedCategory !== 'all' ||
                selectedPriority !== 'all' ||
                selectedResponsible !== 'all' ||
                searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCategory('all')
                    setSelectedPriority('all')
                    setSelectedResponsible('all')
                    setSearchQuery('')
                  }}
                  className="h-9 text-xs text-slate-500 hover:text-slate-800 px-2"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpar Filtros
                </Button>
              )}
            </div>
          </div>

          {/* List of Pending Items */}
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin text-emerald-600" />
              Consolidando pendências de todos os módulos...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="inline-flex p-4 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tudo em dia! Nenhuma pendência encontrada.
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {selectedCategory !== 'all' ||
                selectedPriority !== 'all' ||
                selectedResponsible !== 'all'
                  ? 'Nenhum item corresponde aos filtros selecionados. Experimente limpar os filtros.'
                  : 'Parabéns! Não há clientes sem resposta, pedidos atrasados ou follow-ups vencidos neste momento.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>
                  Mostrando <strong>{filteredItems.length}</strong> de {items.length} pendências
                  (ordenadas por prioridade e tempo de espera)
                </span>
                {unassignedCount > 0 && (
                  <span className="text-amber-600 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {unassignedCount} itens precisam de responsável atribuído
                  </span>
                )}
              </div>

              {filteredItems.map((item) => {
                const isUrgent = item.priority === 'urgente'
                const isHigh = item.priority === 'alta'
                const isUnassigned = !item.assignedToId

                const catCfg = PENDING_CATEGORY_CONFIG[item.category]

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 ${
                      isUrgent
                        ? 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/10'
                        : isHigh
                          ? 'border-amber-300 hover:border-amber-400 bg-amber-50/5'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    {/* Left: Indicator & Content */}
                    <div className="flex items-start space-x-3.5 min-w-0 flex-1">
                      {/* Priority Tag Icon */}
                      <div
                        className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                          isUrgent
                            ? 'bg-rose-500 text-white animate-pulse'
                            : isHigh
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {item.category === 'clients_waiting_response' && (
                          <MessageSquare className="h-5 w-5" />
                        )}
                        {item.category === 'dissatisfied_clients' && (
                          <AlertTriangle className="h-5 w-5" />
                        )}
                        {item.category === 'orders_overdue' && <Clock className="h-5 w-5" />}
                        {item.category === 'overdue_followups' && (
                          <CheckSquare className="h-5 w-5" />
                        )}
                        {item.category === 'quotes_waiting_return' && (
                          <FileText className="h-5 w-5" />
                        )}
                        {item.category === 'proofs_waiting_approval' && (
                          <ImageIcon className="h-5 w-5" />
                        )}
                        {item.category === 'orders_due_today' && <Calendar className="h-5 w-5" />}
                        {item.category === 'orders_due_tomorrow' && <Clock3 className="h-5 w-5" />}
                        {item.category === 'pending_post_sales' && (
                          <HeartHandshake className="h-5 w-5" />
                        )}
                        {item.category === 'overdue_attendances' && <Flame className="h-5 w-5" />}
                      </div>

                      {/* Main Item Text */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-2 py-0.5 font-bold uppercase ${catCfg?.badgeColor || ''}`}
                          >
                            {catCfg?.shortLabel || item.categoryLabel}
                          </Badge>

                          <Badge
                            variant={isUrgent ? 'destructive' : isHigh ? 'secondary' : 'outline'}
                            className={`text-[10px] px-2 py-0.5 font-bold uppercase ${
                              isHigh
                                ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold'
                                : ''
                            }`}
                          >
                            {item.priority.toUpperCase()}
                          </Badge>

                          {item.orderNumber && (
                            <span className="font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border">
                              {item.orderNumber}
                            </span>
                          )}

                          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 ml-auto md:ml-0">
                            <Clock className="h-3 w-3 inline" />
                            {item.waitingTimeFormatted}
                          </span>
                        </div>

                        <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-tight flex items-center gap-2">
                          {item.title}
                        </h4>

                        {item.subtitle && (
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {item.subtitle}
                          </p>
                        )}

                        {/* Meta Details Pills */}
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 flex-wrap">
                          {item.clientPhone && (
                            <span className="font-medium text-slate-600 dark:text-slate-400">
                              Tel: {item.clientPhone}
                            </span>
                          )}

                          {item.quoteValue !== undefined && item.quoteValue > 0 && (
                            <span className="font-bold text-emerald-600">
                              {formatCurrency(item.quoteValue)}
                            </span>
                          )}

                          {item.currentStage && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                              Etapa: {item.currentStage}
                            </span>
                          )}

                          {/* Responsible Badge */}
                          <button
                            onClick={() => {
                              setItemToAssign(item)
                              setAssignUserId(item.assignedToId || '')
                              setAssignDialogOpen(true)
                            }}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                              isUnassigned
                                ? 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 animate-pulse'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                            }`}
                            title="Clique para reatribuir responsável"
                          >
                            <User className="h-3 w-3" />
                            {isUnassigned ? '⚠️ Sem responsável (Atribuir)' : item.assignedToName}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Inline Actions */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800 justify-end flex-wrap">
                      {/* Responder no CRM Direct Action */}
                      {item.clientPhone && (
                        <Button
                          size="sm"
                          onClick={() => handleOpenChat(item)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 shadow-sm font-semibold"
                          title="Abrir histórico e responder no CRM"
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                          Responder no CRM
                        </Button>
                      )}

                      {/* Open Order Action */}
                      {item.orderId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenOrder(item.orderId)}
                          className="text-xs h-8 px-2.5 border-slate-200 hover:bg-slate-100"
                        >
                          <Package className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                          Ver Pedido
                        </Button>
                      )}

                      {/* Quick Follow-up / Action */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setItemToResolve(item)
                          setResolveAction(
                            item.category === 'quotes_waiting_return'
                              ? 'Follow-up realizado no orçamento'
                              : item.category === 'proofs_waiting_approval'
                                ? 'Lembrete de arte enviado / Arte aprovada'
                                : item.category === 'dissatisfied_clients'
                                  ? 'Reclamação atendida e resolvida'
                                  : 'Marcado como resolvido',
                          )
                          setResolveDialogOpen(true)
                        }}
                        className="text-xs h-8 px-2.5 border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                      >
                        <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                        Resolver
                      </Button>

                      {/* Dropdown for More Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 text-xs">
                          <DropdownMenuLabel>Ações da Pendência</DropdownMenuLabel>
                          <DropdownMenuSeparator />

                          {item.clientPhone && (
                            <DropdownMenuItem
                              onClick={() =>
                                window.open(getWhatsAppDirectUrl(item.clientPhone), '_blank')
                              }
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                              Abrir no WhatsApp Web
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem
                            onClick={() => {
                              setItemToReschedule(item)
                              setRescheduleDate(
                                item.referenceDate?.split('T')[0] ||
                                  new Date().toISOString().split('T')[0],
                              )
                              setRescheduleDialogOpen(true)
                            }}
                          >
                            <Calendar className="h-3.5 w-3.5 mr-2 text-amber-600" />
                            Reagendar Prazo / Follow-up
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => {
                              setItemToAssign(item)
                              setAssignUserId(item.assignedToId || '')
                              setAssignDialogOpen(true)
                            }}
                          >
                            <User className="h-3.5 w-3.5 mr-2 text-blue-600" />
                            Atribuir / Trocar Responsável
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => {
                              setItemForNote(item)
                              setQuickNoteText('')
                              setNoteDialogOpen(true)
                            }}
                          >
                            <FileText className="h-3.5 w-3.5 mr-2 text-slate-600" />
                            Adicionar Observação Interna
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            onClick={() => {
                              setItemToResolve(item)
                              setResolveAction('Encerrar e arquivar oportunidade')
                              setResolveDialogOpen(true)
                            }}
                            className="text-rose-600 focus:text-rose-600"
                          >
                            <X className="h-3.5 w-3.5 mr-2" />
                            Encerrar / Não Fechou
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EFFICIENCY DASHBOARD */}
      {activeTab === 'efficiency' && (
        <div className="space-y-6">
          {/* Period Filter Header */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Métricas de Eficiência Operacional & SLA
              </h3>
              <p className="text-xs text-slate-500">
                Acompanhe o tempo médio de resposta, resoluções e taxa de entregas da equipe no
                prazo.
              </p>
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              {(
                [
                  { key: 'today', label: 'Hoje' },
                  { key: 'yesterday', label: 'Ontem' },
                  { key: '7days', label: 'Últimos 7 dias' },
                  { key: 'month', label: 'Mês Atual' },
                ] as const
              ).map((p) => (
                <button
                  key={p.key}
                  onClick={() => setEfficiencyPeriod(p.key)}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    efficiencyPeriod === p.key
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Efficiency Key KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold flex items-center justify-between">
                  <span>Tempo Médio Primeira Resposta</span>
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                </CardDescription>
                <CardTitle className="text-2xl font-black text-slate-900 dark:text-white">
                  {metrics?.avgFirstResponseMinutes ?? 12} min
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-emerald-600 font-medium">
                  Meta: responder em menos de 15 minutos
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold flex items-center justify-between">
                  <span>Pendências Resolvidas no Período</span>
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                </CardDescription>
                <CardTitle className="text-2xl font-black text-slate-900 dark:text-white">
                  {metrics?.resolvedTodayCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-slate-500">
                  Tempo médio de resolução:{' '}
                  <strong>{metrics?.avgResolutionMinutes ?? 18}min</strong>
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold flex items-center justify-between">
                  <span>% Pedidos Entregues no Prazo</span>
                  <Package className="h-4 w-4 text-amber-600" />
                </CardDescription>
                <CardTitle className="text-2xl font-black text-emerald-600">
                  {metrics?.percentOrdersDeliveredOnTime ?? 95}%
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-slate-500">
                  Qualidade e pontualidade na produção gráfica
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold flex items-center justify-between">
                  <span>% Follow-ups & Pós-Vendas Realizados</span>
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                </CardDescription>
                <CardTitle className="text-2xl font-black text-purple-600">
                  {metrics?.percentFollowupsCompleted ?? 88}%
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-slate-500">Acompanhamento contínuo da carteira</p>
              </CardContent>
            </Card>
          </div>

          {/* Efficiency Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Saúde do Atendimento & SLA Atual
              </h4>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border">
                  <span className="text-slate-600 dark:text-slate-300">
                    Respostas dentro do prazo de SLA:
                  </span>
                  <span className="font-extrabold text-emerald-600 text-sm">
                    {metrics?.percentResponsesOnTime ?? 92}%
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border">
                  <span className="text-slate-600 dark:text-slate-300">
                    Atendimentos aguardando resposta:
                  </span>
                  <span className="font-extrabold text-rose-600 text-sm">
                    {items.filter((i) => i.category === 'clients_waiting_response').length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border">
                  <span className="text-slate-600 dark:text-slate-300">
                    Pedidos com produção atrasada:
                  </span>
                  <span className="font-extrabold text-rose-600 text-sm">
                    {items.filter((i) => i.category === 'orders_overdue').length}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                Desempenho por Responsável da Equipe
              </h4>
              <div className="space-y-2 text-xs">
                {users.map((u) => {
                  const userPending = items.filter((i) => i.assignedToId === u.id)
                  const userUrgent = userPending.filter((i) => i.priority === 'urgente').length

                  return (
                    <div
                      key={u.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          {u.name || u.email}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {userPending.length} pendências ativas
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {userUrgent > 0 && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-1.5 py-0 font-bold"
                          >
                            {userUrgent} urgentes
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px]">
                          {userPending.length === 0 ? '✓ Limpo' : `${userPending.length} itens`}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RESOLUTION HISTORY AUDIT */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Histórico de Resoluções & Ações Registradas
              </h3>
              <p className="text-xs text-slate-500">
                Auditoria permanente de tudo o que foi resolvido e ações executadas pela equipe na
                Central de Pendências.
              </p>
            </div>
          </div>

          {resolutions.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              Nenhuma resolução registrada ainda no histórico.
            </div>
          ) : (
            <div className="space-y-2.5">
              {resolutions.map((res) => (
                <div
                  key={res.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {res.action_taken || 'Resolvido'}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {res.category}
                      </Badge>
                    </div>

                    <p className="text-slate-800 dark:text-slate-200 font-medium">
                      {res.item_title || res.client_name || 'Item'}
                    </p>

                    {res.notes && (
                      <p className="text-slate-500 italic text-[11px]">"{res.notes}"</p>
                    )}
                  </div>

                  <div className="text-right shrink-0 text-[11px] text-slate-400">
                    <span className="block font-semibold text-slate-700 dark:text-slate-300">
                      Por: {res.resolved_by_name || 'Atendente'}
                    </span>
                    <span>{formatDateTime(res.resolved_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QUICK RESOLVE DIALOG */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Resolver Pendência
            </DialogTitle>
            <DialogDescription>{itemToResolve?.title}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmResolve} className="space-y-4 pt-2 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Ação realizada:</label>
              <Input
                value={resolveAction}
                onChange={(e) => setResolveAction(e.target.value)}
                placeholder="Ex: Mensagem respondida, arte aprovada, follow-up realizado"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Observações da resolução (opcional):
              </label>
              <Textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Detalhes adicionais sobre a solução dada..."
                rows={3}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setResolveDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={resolvingLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {resolvingLoading ? 'Salvando...' : 'Confirmar Resolução'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RESCHEDULE DIALOG */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Calendar className="h-5 w-5 text-amber-600" />
              Reagendar Prazo
            </DialogTitle>
            <DialogDescription>
              Defina a nova data limite para "{itemToReschedule?.title}"
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmReschedule} className="space-y-4 pt-2 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Nova Data:</label>
              <Input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRescheduleDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white">
                Salvar Nova Data
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ASSIGN RESPONSIBLE DIALOG */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <User className="h-5 w-5 text-blue-600" />
              Atribuir Responsável
            </DialogTitle>
            <DialogDescription>
              Selecione o membro da equipe responsável por atender esta pendência.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmAssign} className="space-y-4 pt-2 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Responsável:</label>
              <select
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                className="w-full h-10 text-xs rounded-lg border border-slate-200 bg-white px-3"
                required
              >
                <option value="">Selecione um usuário...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                Salvar Responsável
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* QUICK NOTE DIALOG */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <FileText className="h-5 w-5 text-emerald-600" />
              Adicionar Observação Interna
            </DialogTitle>
            <DialogDescription>{itemForNote?.title}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveQuickNote} className="space-y-4 pt-2 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Observação:</label>
              <Textarea
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                placeholder="Ex: Cliente pediu para ligar no final da tarde; arte precisa de ajuste no sangra..."
                rows={4}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setNoteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Salvar Observação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Chat Drawer */}
      <WhatsAppChatDrawer
        isOpen={chatDrawerOpen}
        onClose={() => {
          setChatDrawerOpen(false)
          setSelectedAttendanceForChat(null)
        }}
        client={selectedClientForChat}
        activeAttendance={selectedAttendanceForChat}
        slaConfig={slaConfig}
        onClientUpdated={() => loadAllData(false)}
      />

      {/* Production Order Modal */}
      {selectedOrderId && (
        <ProductionOrderModal
          isOpen={orderModalOpen}
          onClose={() => {
            setOrderModalOpen(false)
            setSelectedOrderId(null)
          }}
          onSaved={() => loadAllData(false)}
          orderToEdit={items.find((i) => i.orderId === selectedOrderId)?.originalData || null}
        />
      )}
    </div>
  )
}
