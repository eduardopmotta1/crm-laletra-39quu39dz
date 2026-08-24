import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Star,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Repeat,
  Send,
  Calendar,
  Filter,
  Search,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Layers,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react'
import { evaluationsService } from '@/services/evaluations'
import { postSalesService } from '@/services/postSales'
import { clientsService } from '@/services/clients'
import { productionService } from '@/services/production'
import { usersService } from '@/services/whatsapp'
import { dealsService } from '@/services/deals'
import type {
  Evaluation,
  PostSale,
  Client,
  User as CrmUser,
  ArchivedDeal,
  ProductionOrder,
} from '@/types/crm'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime, formatCurrency, getWhatsAppDirectUrl } from '@/lib/sla'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'
import { toast } from '@/hooks/use-toast'

export default function PostSalesDashboardPage() {
  const navigate = useNavigate()
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [postSales, setPostSales] = useState<PostSale[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([])
  const [archivedDeals, setArchivedDeals] = useState<ArchivedDeal[]>([])
  const [users, setUsers] = useState<CrmUser[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [periodFilter, setPeriodFilter] = useState<'all' | '7d' | '30d' | '90d'>('30d')
  const [assignedFilter, setAssignedFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Chat drawer integration
  const [selectedClientForChat, setSelectedClientForChat] = useState<Client | null>(null)
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)

  const loadData = async () => {
    try {
      const [evals, psList, cls, prodOrders, pastDeals, userList] = await Promise.all([
        evaluationsService.getAll(undefined, '-created'),
        postSalesService.getAll(undefined, '-scheduled_date'),
        clientsService.getAll(undefined, '-updated', { includeArchived: true }),
        productionService.getAll(undefined, '-created'),
        dealsService.getArchivedDeals(),
        usersService.getAll(),
      ])
      setEvaluations(evals)
      setPostSales(psList)
      setClients(cls)
      setProductionOrders(prodOrders)
      setArchivedDeals(pastDeals)
      setUsers(userList)
    } catch (err) {
      console.error('Error loading post sales dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filter items by period and assigned
  const filterByDateAndUser = <
    T extends { created?: string; scheduled_date?: string; client_id?: string },
  >(
    items: T[],
  ): T[] => {
    const now = Date.now()
    const daysLimit =
      periodFilter === '7d' ? 7 : periodFilter === '30d' ? 30 : periodFilter === '90d' ? 90 : null

    return items.filter((item) => {
      // Date filter
      const dateStr = item.created || item.scheduled_date
      if (daysLimit && dateStr) {
        const itemTime = new Date(dateStr).getTime()
        const diffDays = (now - itemTime) / (1000 * 60 * 60 * 24)
        if (diffDays > daysLimit) return false
      }

      // User / assigned filter
      if (assignedFilter !== 'all') {
        const client = clients.find((c) => c.id === item.client_id)
        if (client?.assigned_to !== assignedFilter) return false
      }

      return true
    })
  }

  const filteredEvaluations = filterByDateAndUser(evaluations).filter((ev) => {
    if (!searchTerm) return true
    const clientName = ev.expand?.client_id?.name || ''
    const comment = ev.comment || ''
    return (
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comment.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  const filteredPostSales = filterByDateAndUser(postSales)

  // Metrics computation
  const completedEvaluations = filteredEvaluations.filter((e) => e.overall_rating > 0)
  const totalEvalsCount = completedEvaluations.length

  const avgOverallRating =
    totalEvalsCount > 0
      ? (
          completedEvaluations.reduce((acc, e) => acc + e.overall_rating, 0) / totalEvalsCount
        ).toFixed(1)
      : '0.0'

  const pendingPostSales = filteredPostSales.filter(
    (ps) => ps.status === 'pending' || ps.status === 'sent',
  )
  const completedPostSales = filteredPostSales.filter((ps) => ps.status === 'completed')

  // Dissatisfied clients pending contact
  const dissatisfiedPending = completedEvaluations.filter(
    (e) => e.overall_rating <= 3 && !e.resolved,
  )
  const problemsResolved = completedEvaluations.filter((e) => e.resolved).length

  // Repurchase Metrics: Production orders and closed deals count per client
  const clientPurchasesCount: Record<string, number> = {}
  productionOrders.forEach((ord) => {
    if (ord.client_id) {
      clientPurchasesCount[ord.client_id] = (clientPurchasesCount[ord.client_id] || 0) + 1
    }
  })
  archivedDeals
    .filter((d) => d.result === 'Venda fechada')
    .forEach((deal) => {
      if (!clientPurchasesCount[deal.client_id]) {
        clientPurchasesCount[deal.client_id] = 1
      }
    })

  const returningClients = clients.filter((c) => {
    const ordersCount = clientPurchasesCount[c.id] || 0
    const totalPurchases = c.total_purchases || 0
    return ordersCount > 1 || totalPurchases > 1 || c.has_returned
  })

  const totalClientsWithPurchases = Object.keys(clientPurchasesCount).length
  const repurchaseRate =
    totalClientsWithPurchases > 0
      ? Math.round((returningClients.length / totalClientsWithPurchases) * 100)
      : 0

  // Rating distribution 1 to 5 stars
  const ratingDistribution = [5, 4, 3, 2, 1].map((stars) => {
    const count = completedEvaluations.filter((e) => e.overall_rating === stars).length
    const percentage = totalEvalsCount > 0 ? Math.round((count / totalEvalsCount) * 100) : 0
    return { stars, count, percentage }
  })

  const handleSendPostSaleWhatsApp = async (ps: PostSale) => {
    const client = ps.expand?.client_id || clients.find((c) => c.id === ps.client_id)
    if (!client) {
      toast({ title: 'Cliente não localizado', variant: 'destructive' })
      return
    }

    const token = ps.evaluation_token || 'eval_' + Math.random().toString(36).substring(2, 10)
    const evalLink = `${window.location.origin}/avaliacao/${token}`
    const orderRef = ps.order_number ? ` (Pedido ${ps.order_number})` : ''
    const text = `Olá, ${client.name}! Seu pedido${orderRef} foi concluído pela Laletra. Poderia avaliar nosso atendimento e qualidade no link a seguir? Leva menos de 1 minuto: ${evalLink}`

    // Copy to clipboard or open direct wa
    navigator.clipboard.writeText(text)
    await postSalesService.markAsSent(ps.id, 'Link de avaliação enviado via WhatsApp')
    toast({
      title: 'Mensagem e link de avaliação copiados!',
      description: 'O status do pós-venda foi atualizado para Enviado.',
    })
    loadData()
    window.open(getWhatsAppDirectUrl(client.phone, text), '_blank')
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
            Painel & Dashboard de Pós-Venda
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Acompanhe satisfação dos clientes (NPS), rotinas de pós-venda, recompras e qualidade de
            atendimento.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => navigate('/recuperacao')}
            className="text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            <ShieldAlert className="h-4 w-4 mr-1.5 text-rose-600" />
            Recuperação de Clientes ({dissatisfiedPending.length})
          </Button>
          <Button
            onClick={() => navigate('/configuracoes')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-sm"
          >
            Regras de Pós-Venda
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente ou comentário..."
            className="pl-9 text-xs bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Period Filter */}
          <Select value={periodFilter} onValueChange={(v: any) => setPeriodFilter(v)}>
            <SelectTrigger className="w-full sm:w-36 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Todo o período</SelectItem>
            </SelectContent>
          </Select>

          {/* Assigned User Filter */}
          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger className="w-full sm:w-44 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos responsáveis</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Alert Banner for Dissatisfied Clients Pending Contact */}
      {dissatisfiedPending.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-pulse">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-500 text-white rounded-xl">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-rose-900 dark:text-rose-200 text-sm">
                Atenção: {dissatisfiedPending.length}{' '}
                {dissatisfiedPending.length === 1
                  ? 'cliente insatisfeito aguardando contato'
                  : 'clientes insatisfeitos aguardando contato'}
                !
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                Avaliações de 1 a 3 estrelas foram registradas e necessitam de ação imediata da
                equipe.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/recuperacao')}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs shrink-0 self-start sm:self-auto font-semibold"
          >
            Acessar Área de Recuperação
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Média Geral */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Média Geral das Avaliações
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Star className="h-4 w-4 fill-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {avgOverallRating}
              </span>
              <span className="text-xs text-slate-400 font-semibold">/ 5.0</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Baseado em {totalEvalsCount} {totalEvalsCount === 1 ? 'avaliação' : 'avaliações'}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Pós-vendas Pendentes vs Realizados */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Rotinas de Pós-Venda
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {pendingPostSales.length} pendentes
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {completedPostSales.length} contatos já realizados
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Clientes Insatisfeitos & Resolvidos */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tratamento de Insatisfação
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">
              {dissatisfiedPending.length} a contatar
            </div>
            <p className="text-xs text-slate-500 mt-1">
              <span className="text-emerald-600 font-semibold">
                {problemsResolved} solucionados
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Taxa de Recompra */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Taxa de Recompra (Retorno)
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Repeat className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {repurchaseRate}%
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {returningClients.length} clientes com compras recorrentes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Star Ratings Distribution & Pending Routines List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Rating Breakdown Chart (lg:col-span-5) */}
        <Card className="lg:col-span-5 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
              Distribuição das Notas (1 a 5 Estrelas)
            </CardTitle>
            <CardDescription className="text-xs">
              Percentual e volume de feedbacks registrados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 my-auto">
            {ratingDistribution.map((item) => (
              <div key={item.stars} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                    <span>{item.stars}</span>
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  </div>
                  <span className="text-slate-500 font-medium">
                    {item.count} ({item.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      item.stars >= 4
                        ? 'bg-emerald-500'
                        : item.stars === 3
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.max(item.percentage, item.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Scheduled Post-Sale Contact Queue (lg:col-span-7) */}
        <Card className="lg:col-span-7 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-emerald-600" />
                Fila de Pós-Venda Automático ({pendingPostSales.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Contatos agendados após conclusão dos pedidos na produção
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2.5 max-h-[340px]">
            {pendingPostSales.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                🎉 Nenhuma rotina de pós-venda pendente no período!
              </div>
            ) : (
              pendingPostSales.map((ps) => {
                const client = ps.expand?.client_id || clients.find((c) => c.id === ps.client_id)
                if (!client) return null

                return (
                  <div
                    key={ps.id}
                    className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {client.name}
                        </span>
                        {ps.order_number && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 font-mono bg-white dark:bg-slate-900"
                          >
                            {ps.order_number}
                          </Badge>
                        )}
                        <Badge
                          variant={ps.status === 'sent' ? 'secondary' : 'outline'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {ps.status === 'sent' ? 'Mensagem Enviada' : 'Pós-Venda Agendado'}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>Telefone: {client.phone}</span>
                        <span>•</span>
                        <span>
                          Agendado para: {new Date(ps.scheduled_date).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedClientForChat(client)
                          setChatDrawerOpen(true)
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 font-semibold shadow-xs"
                        title="Responder no CRM e ver histórico"
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        Responder no CRM
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPostSaleWhatsApp(ps)}
                        className="text-xs h-8 px-2.5 text-slate-700 hover:text-emerald-700 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200"
                        title="Abrir no WhatsApp Web com link da pesquisa"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        WhatsApp Web
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Latest Evaluations Feed */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
              Feed de Avaliações Recentes ({filteredEvaluations.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Feed em tempo real das respostas enviadas pelos clientes
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredEvaluations.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Nenhuma avaliação encontrada com os filtros selecionados.
              </div>
            ) : (
              filteredEvaluations.map((ev) => {
                const client = ev.expand?.client_id || clients.find((c) => c.id === ev.client_id)
                const isPositive = ev.overall_rating >= 4
                const isNegative = ev.overall_rating <= 3

                return (
                  <div
                    key={ev.id}
                    className={`p-4 rounded-xl border text-xs space-y-2.5 transition-all ${
                      isNegative && !ev.resolved
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {client?.name || 'Cliente'}
                        </span>
                        {ev.order_number && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                            Pedido {ev.order_number}
                          </Badge>
                        )}
                        <div className="flex items-center text-amber-400">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3.5 w-3.5 ${
                                star <= ev.overall_rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200 dark:text-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                        <Badge
                          variant={isPositive ? 'secondary' : 'destructive'}
                          className="text-[10px] px-2 py-0"
                        >
                          {ev.overall_rating} Estrela(s)
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                        <span>{formatDateTime(ev.created)}</span>
                        {client && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedClientForChat(client)
                              setChatDrawerOpen(true)
                            }}
                            className="h-7 text-xs text-emerald-600 px-2"
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Ver Atendimento
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Detailed sub ratings */}
                    {(ev.service_rating || ev.quality_rating || ev.delivery_rating) && (
                      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg">
                        {ev.service_rating ? (
                          <span>
                            <strong>Atendimento:</strong> {ev.service_rating}★
                          </span>
                        ) : null}
                        {ev.quality_rating ? (
                          <span>
                            <strong>Qualidade:</strong> {ev.quality_rating}★
                          </span>
                        ) : null}
                        {ev.delivery_rating ? (
                          <span>
                            <strong>Prazo/Entrega:</strong> {ev.delivery_rating}★
                          </span>
                        ) : null}
                      </div>
                    )}

                    {/* Comment text */}
                    {ev.comment ? (
                      <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                        "{ev.comment}"
                      </p>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Sem comentário adicional escrito pelo cliente.
                      </span>
                    )}

                    {/* Resolution Status if Dissatisfied */}
                    {isNegative && (
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="font-semibold">
                          Status da Reclamação:{' '}
                          {ev.resolved ? (
                            <span className="text-emerald-600 font-bold">
                              ✓ Resolvido em {formatDateTime(ev.resolved_at || ev.updated)}
                            </span>
                          ) : (
                            <span className="text-rose-600 font-bold">
                              ⚠️ Aguardando contato da equipe
                            </span>
                          )}
                        </span>

                        {!ev.resolved && (
                          <Button
                            size="sm"
                            onClick={() => navigate('/recuperacao')}
                            className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                          >
                            Tratar Reclamação
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Drawer */}
      <WhatsAppChatDrawer
        isOpen={chatDrawerOpen}
        onClose={() => setChatDrawerOpen(false)}
        client={selectedClientForChat}
        slaConfig={{ urgentMinutes: 1440, warningMinutes: 720, noticeMinutes: 360 }}
        onClientUpdated={() => loadData()}
      />
    </div>
  )
}
