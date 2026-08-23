import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Clock,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  ArrowUpRight,
  Printer,
  Calendar,
  Layers,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { clientsService } from '@/services/clients'
import { tasksService } from '@/services/tasks'
import { settingsService } from '@/services/settings'
import { calculateSlaInfo, formatCurrency, formatDateTime } from '@/lib/sla'
import type { Client, Task, SlaConfig } from '@/types/crm'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'
import ClientFormModal from '@/components/ClientFormModal'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({
    urgentHours: 24,
    warningHours: 12,
    noticeHours: 6,
  })
  const [loading, setLoading] = useState(true)

  // Selected client for drawer / modal
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [newClientOpen, setNewClientOpen] = useState(false)

  const loadData = async () => {
    try {
      const [cls, tks, cfg] = await Promise.all([
        clientsService.getAll(),
        tasksService.getAll('status = "pendente"'),
        settingsService.getSlaConfig(),
      ])
      setClients(cls)
      setTasks(tks)
      setSlaConfig(cfg)
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const handleUpdate = () => loadData()
    window.addEventListener('crm-client-updated', handleUpdate)
    return () => window.removeEventListener('crm-client-updated', handleUpdate)
  }, [])

  // Metrics computation
  const waitingClients = clients.filter(
    (c) =>
      c.stage !== 'Venda fechada' &&
      c.stage !== 'Não fechou' &&
      c.last_message_direction === 'inbound',
  )

  const urgentClients = clients.filter((c) => {
    if (c.stage === 'Venda fechada' || c.stage === 'Não fechou') return false
    const sla = calculateSlaInfo(c.last_message_at, c.last_message_direction, c.stage, slaConfig)
    return sla.status === 'urgent'
  })

  const warningClients = clients.filter((c) => {
    if (c.stage === 'Venda fechada' || c.stage === 'Não fechou') return false
    const sla = calculateSlaInfo(c.last_message_at, c.last_message_direction, c.stage, slaConfig)
    return sla.status === 'warning'
  })

  const openQuotes = clients.filter(
    (c) =>
      c.stage === 'Orçamento enviado' ||
      c.stage === 'Aguardando cliente' ||
      c.stage === 'Em atendimento',
  )
  const openQuotesTotal = openQuotes.reduce((acc, c) => acc + (c.quote_value || 0), 0)

  const wonClients = clients.filter((c) => c.stage === 'Venda fechada')
  const wonTotal = wonClients.reduce((acc, c) => acc + (c.quote_value || 0), 0)

  // Stage distribution for funnel graph
  const stageStats = [
    {
      stage: 'Novo contato',
      count: clients.filter((c) => c.stage === 'Novo contato').length,
      color: 'bg-blue-500',
    },
    {
      stage: 'Precisa responder',
      count: clients.filter((c) => c.stage === 'Precisa responder').length,
      color: 'bg-rose-500',
    },
    {
      stage: 'Em atendimento',
      count: clients.filter((c) => c.stage === 'Em atendimento').length,
      color: 'bg-amber-500',
    },
    {
      stage: 'Orçamento enviado',
      count: clients.filter((c) => c.stage === 'Orçamento enviado').length,
      color: 'bg-purple-500',
    },
    {
      stage: 'Aguardando cliente',
      count: clients.filter((c) => c.stage === 'Aguardando cliente').length,
      color: 'bg-indigo-500',
    },
    { stage: 'Venda fechada', count: wonClients.length, color: 'bg-emerald-500' },
    {
      stage: 'Não fechou',
      count: clients.filter((c) => c.stage === 'Não fechou').length,
      color: 'bg-slate-400',
    },
  ]

  const maxStageCount = Math.max(...stageStats.map((s) => s.count), 1)

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Printer className="h-6 w-6 text-emerald-600" />
            Painel de Atendimentos & Gráfica
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Visão geral de respostas do WhatsApp, SLAs e conversão do funil de vendas.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => navigate('/kanban')}
            className="text-xs border-slate-300 dark:border-slate-700"
          >
            <Layers className="h-4 w-4 mr-1.5 text-slate-500" />
            Ver Funil Kanban
          </Button>
          <Button
            onClick={() => setNewClientOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Atendimento
          </Button>
        </div>
      </div>

      {/* Critical SLA Alert Box if any */}
      {urgentClients.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-pulse">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-500 text-white rounded-xl">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-rose-900 dark:text-rose-200 text-sm">
                Atenção: {urgentClients.length}{' '}
                {urgentClients.length === 1 ? 'cliente estourou' : 'clientes estouraram'} o SLA de{' '}
                {slaConfig.urgentHours}h!
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                Mensagens de WhatsApp sem resposta podem resultar em perda de orçamentos para
                concorrentes.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/kanban')}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs shrink-0 self-start sm:self-auto"
          >
            Responder Agora no Funil
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Clientes Aguardando Resposta */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Aguardando Resposta
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {waitingClients.length}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              {urgentClients.length > 0 ? (
                <span className="text-rose-600 font-semibold flex items-center">
                  <AlertTriangle className="h-3 w-3 mr-0.5" /> {urgentClients.length} críticos
                </span>
              ) : (
                <span className="text-emerald-600 font-medium">Todos em dia</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Orçamentos em Aberto */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Orçamentos em Aberto
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(openQuotesTotal)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {openQuotes.length} propostas em negociação
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Vendas Fechadas (Total) */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Vendas Fechadas
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(wonTotal)}
            </div>
            <p className="text-xs text-slate-500 mt-1">{wonClients.length} pedidos em produção</p>
          </CardContent>
        </Card>

        {/* Card 4: SLA Estourado / Atrasados */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              SLA Atrasado (&gt;{slaConfig.urgentHours}h)
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {urgentClients.length}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              +{warningClients.length} em nível de alerta
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Distribution & Urgent Action List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Funnel Graph (lg:col-span-7) */}
        <Card className="lg:col-span-7 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                  Distribuição do Funil de Atendimento
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Volume de clientes ativos em cada uma das etapas do processo
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/kanban')}
                className="text-xs text-emerald-600 hover:text-emerald-700"
              >
                Abrir Funil <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {stageStats.map((stat) => {
              const percentage = Math.round((stat.count / maxStageCount) * 100)
              return (
                <div key={stat.stage} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {stat.stage}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {stat.count} {stat.count === 1 ? 'cliente' : 'clientes'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full ${stat.color} transition-all duration-500 rounded-full`}
                      style={{ width: `${Math.max(percentage, 6)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Priority Clients Pending Response (lg:col-span-5) */}
        <Card className="lg:col-span-5 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  Prioridade de Resposta
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Clientes ordenados pelo tempo sem atendimento
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-semibold">
                {waitingClients.length} na fila
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2.5 max-h-[380px] pr-1">
            {waitingClients.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                🎉 Nenhum cliente aguardando resposta no momento!
              </div>
            ) : (
              waitingClients.slice(0, 6).map((client) => {
                const sla = calculateSlaInfo(
                  client.last_message_at,
                  client.last_message_direction,
                  client.stage,
                  slaConfig,
                )
                return (
                  <div
                    key={client.id}
                    onClick={() => {
                      setSelectedClient(client)
                      setChatDrawerOpen(true)
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer hover:shadow-sm flex items-center justify-between gap-3 ${
                      sla.status === 'urgent'
                        ? 'border-rose-300 bg-rose-50/60 dark:bg-rose-950/20'
                        : sla.status === 'warning'
                          ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {client.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {client.product_interest || client.phone}
                      </p>
                    </div>

                    <div className="flex flex-col items-end shrink-0 gap-1">
                      <Badge className={`text-[10px] px-1.5 py-0 ${sla.colorBadgeClass}`}>
                        {sla.hoursElapsed}h
                      </Badge>
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center">
                        Responder <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Follow-up Pending Tasks Section */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" />
              Tarefas de Follow-up Pendentes ({tasks.length})
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Lembretes de propostas, aprovações de provas digitais e retornos programados
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/tarefas')}
            className="text-xs text-emerald-600"
          >
            Ver Todas <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tasks.slice(0, 6).map((task) => (
              <div
                key={task.id}
                className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                      {task.expand?.client_id?.name || 'Cliente'}
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {task.priority}
                    </Badge>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 line-clamp-2">
                    {task.title}
                  </h4>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                  <span>Vence: {formatDateTime(task.due_date)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Chat & Details Drawer */}
      <WhatsAppChatDrawer
        isOpen={chatDrawerOpen}
        onClose={() => setChatDrawerOpen(false)}
        client={selectedClient}
        slaConfig={slaConfig}
        onClientUpdated={() => loadData()}
      />

      {/* New Client Modal */}
      <ClientFormModal
        isOpen={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onSaved={() => loadData()}
      />
    </div>
  )
}
