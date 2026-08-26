import React, { useState, useEffect } from 'react'
import {
  Archive,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Calendar,
  Phone,
  Mail,
  User,
  DollarSign,
  ArrowUpRight,
  RotateCcw,
  Clock,
  Sparkles,
  FileText,
  Building,
  Tag,
  RefreshCw,
  ExternalLink,
  MessageSquare,
} from 'lucide-react'
import { dealsService } from '@/services/deals'
import { clientsService } from '@/services/clients'
import { usersService } from '@/services/whatsapp'
import type { ArchivedDeal, DealResult, User as CRMUser, Client } from '@/types/crm'
import { formatCurrency, formatDateTime, getWhatsAppDirectUrl } from '@/lib/sla'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'

export default function ArchivedDealsPage() {
  const [deals, setDeals] = useState<ArchivedDeal[]>([])
  const [archivedClientIds, setArchivedClientIds] = useState<Set<string>>(new Set())
  const [users, setUsers] = useState<CRMUser[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [resultFilter, setResultFilter] = useState<string>('all')
  const [assignedFilter, setAssignedFilter] = useState<string>('all')
  const [datePeriodFilter, setDatePeriodFilter] = useState<string>('all')
  const [lossReasonFilter, setLossReasonFilter] = useState<string>('all')

  // Reopen confirmation dialog
  const [reopenModalOpen, setReopenModalOpen] = useState(false)
  const [dealToReopen, setDealToReopen] = useState<ArchivedDeal | null>(null)
  const [reopening, setReopening] = useState(false)

  // Drawer for viewing full history / chat
  const [selectedClientForDrawer, setSelectedClientForDrawer] = useState<Client | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Details Modal
  const [viewDealModalOpen, setViewDealModalOpen] = useState(false)
  const [dealToView, setDealToView] = useState<ArchivedDeal | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [dealsList, usersList, clientsList] = await Promise.all([
        dealsService.getArchivedDeals(),
        usersService.getAll(),
        clientsService.getAll(undefined, '-last_message_at', { includeArchived: true }),
      ])
      const activeArchivedIds = new Set(
        clientsList.filter((c) => c.is_archived === true).map((c) => c.id),
      )
      setArchivedClientIds(activeArchivedIds)
      setDeals(dealsList)
      setUsers(usersList)
    } catch (err) {
      console.error('Error loading archived deals:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Deals whose clients are currently archived (is_archived === true)
  const currentlyArchivedDeals = deals.filter((deal) => archivedClientIds.has(deal.client_id))

  // Loss reasons present in currently archived data
  const distinctLossReasons = Array.from(
    new Set(
      currentlyArchivedDeals
        .filter((d) => d.result === 'Venda perdida' && d.loss_reason)
        .map((d) => d.loss_reason!.trim()),
    ),
  )

  // Filter application
  const filteredDeals = currentlyArchivedDeals.filter((deal) => {
    // Search by client name, phone, email, product, loss reason, or final notes
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch =
      !searchTerm ||
      deal.client_name.toLowerCase().includes(searchLower) ||
      deal.client_phone.includes(searchTerm) ||
      (deal.client_email && deal.client_email.toLowerCase().includes(searchLower)) ||
      (deal.product_interest && deal.product_interest.toLowerCase().includes(searchLower)) ||
      (deal.loss_reason && deal.loss_reason.toLowerCase().includes(searchLower)) ||
      (deal.final_notes && deal.final_notes.toLowerCase().includes(searchLower))

    // Result Filter
    const matchesResult = resultFilter === 'all' || deal.result === resultFilter

    // Assigned User Filter
    const matchesAssigned =
      assignedFilter === 'all' ||
      deal.assigned_to === assignedFilter ||
      deal.closed_by === assignedFilter

    // Loss reason filter
    const matchesLossReason =
      lossReasonFilter === 'all' ||
      (deal.loss_reason && deal.loss_reason.toLowerCase() === lossReasonFilter.toLowerCase())

    // Date Period Filter
    let matchesDate = true
    if (datePeriodFilter !== 'all' && deal.closed_at) {
      const closedTime = new Date(deal.closed_at).getTime()
      const now = Date.now()
      const daysDiff = (now - closedTime) / (1000 * 60 * 60 * 24)

      if (datePeriodFilter === 'today') {
        matchesDate = daysDiff <= 1
      } else if (datePeriodFilter === '7days') {
        matchesDate = daysDiff <= 7
      } else if (datePeriodFilter === '30days') {
        matchesDate = daysDiff <= 30
      } else if (datePeriodFilter === '90days') {
        matchesDate = daysDiff <= 90
      }
    }

    return matchesSearch && matchesResult && matchesAssigned && matchesLossReason && matchesDate
  })

  // Summary Metrics
  const wonDeals = currentlyArchivedDeals.filter((d) => d.result === 'Venda fechada')
  const lostDeals = currentlyArchivedDeals.filter((d) => d.result === 'Venda perdida')
  const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.quote_value || 0), 0)
  const totalLostValue = lostDeals.reduce((sum, d) => sum + (d.quote_value || 0), 0)

  const handleReopenDeal = async () => {
    if (!dealToReopen) return
    setReopening(true)
    try {
      await dealsService.reopenClient(dealToReopen.client_id, 'Precisa responder')
      toast({
        title: 'Atendimento Reaberto!',
        description: `O cliente "${dealToReopen.client_name}" foi desarquivado e movido para "Precisa responder" no funil Kanban com destaque de retorno.`,
      })
      setReopenModalOpen(false)
      setDealToReopen(null)
      loadData()
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
    } catch (err: any) {
      toast({
        title: 'Erro ao reabrir',
        description: err?.message || 'Falha ao desarquivar atendimento.',
        variant: 'destructive',
      })
    } finally {
      setReopening(false)
    }
  }

  const handleOpenClientDrawer = async (clientId: string) => {
    try {
      const client = await clientsService.getById(clientId)
      if (client) {
        setSelectedClientForDrawer(client)
        setDrawerOpen(true)
      } else {
        toast({
          title: 'Aviso',
          description: 'Registro do cliente não encontrado.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error('Error fetching client details:', err)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Archive className="h-6 w-6 text-emerald-600" />
            Atendimentos Arquivados
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Consulta e histórico completo de vendas fechadas e perdidas encerradas no funil.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadData}
          className="text-xs border-slate-200 dark:border-slate-700 h-9"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
          Atualizar Lista
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Arquivados */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Encerrados
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
              <Archive className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {currentlyArchivedDeals.length}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {filteredDeals.length} correspondentes ao filtro
            </p>
          </CardContent>
        </Card>

        {/* Vendas Fechadas */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Vendas Concluídas
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {wonDeals.length}
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium mt-1">
              {formatCurrency(totalWonValue)} faturados
            </p>
          </CardContent>
        </Card>

        {/* Vendas Perdidas */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Vendas Perdidas
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <XCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {lostDeals.length}
            </div>
            <p className="text-xs text-rose-700 dark:text-rose-300 font-medium mt-1">
              {formatCurrency(totalLostValue)} não convertidos
            </p>
          </CardContent>
        </Card>

        {/* Taxa de Conversão */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Taxa de Conversão
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {currentlyArchivedDeals.length > 0
                ? `${Math.round((wonDeals.length / currentlyArchivedDeals.length) * 100)}%`
                : '0%'}
            </div>
            <p className="text-xs text-slate-500 mt-1">Dos atendimentos finalizados</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Box */}
          <div className="md:col-span-4 relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente, tel, produto, motivo..."
              className="pl-9 text-xs bg-slate-50 dark:bg-slate-800 h-9"
            />
          </div>

          {/* Result Filter */}
          <div className="md:col-span-2">
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="text-xs h-9 bg-slate-50 dark:bg-slate-800">
                <SelectValue placeholder="Resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os resultados</SelectItem>
                <SelectItem value="Venda fechada">✅ Venda fechada</SelectItem>
                <SelectItem value="Venda perdida">❌ Venda perdida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Period Filter */}
          <div className="md:col-span-2">
            <Select value={datePeriodFilter} onValueChange={setDatePeriodFilter}>
              <SelectTrigger className="text-xs h-9 bg-slate-50 dark:bg-slate-800">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o período</SelectItem>
                <SelectItem value="today">Hoje (últimas 24h)</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                <SelectItem value="90days">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assigned User Filter */}
          <div className="md:col-span-2">
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="text-xs h-9 bg-slate-50 dark:bg-slate-800">
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

          {/* Loss Reason Filter */}
          <div className="md:col-span-2">
            <Select value={lossReasonFilter} onValueChange={setLossReasonFilter}>
              <SelectTrigger className="text-xs h-9 bg-slate-50 dark:bg-slate-800">
                <SelectValue placeholder="Motivo da Perda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motivos</SelectItem>
                {distinctLossReasons.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active Filters summary badge */}
        {(searchTerm ||
          resultFilter !== 'all' ||
          assignedFilter !== 'all' ||
          datePeriodFilter !== 'all' ||
          lossReasonFilter !== 'all') && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span>Filtros ativos:</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('')
                setResultFilter('all')
                setAssignedFilter('all')
                setDatePeriodFilter('all')
                setLossReasonFilter('all')
              }}
              className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {/* Table of Archived Deals */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Cliente & Contato</th>
                <th className="py-3.5 px-4">Resultado Final</th>
                <th className="py-3.5 px-4">Produto & Valor</th>
                <th className="py-3.5 px-4">Motivo da Perda / Observações</th>
                <th className="py-3.5 px-4">Data Encerramento</th>
                <th className="py-3.5 px-4">Responsável</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Carregando atendimentos arquivados...
                  </td>
                </tr>
              ) : filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhum atendimento arquivado encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredDeals.map((deal) => {
                  const isWon = deal.result === 'Venda fechada'

                  return (
                    <tr
                      key={deal.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Client */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">
                          {deal.client_name}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-[11px] mt-0.5">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-emerald-600" />
                            {deal.client_phone}
                          </span>
                          {deal.client_email && (
                            <span className="flex items-center gap-1 truncate max-w-[140px]">
                              <Mail className="h-3 w-3 text-slate-400" />
                              {deal.client_email}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Result */}
                      <td className="py-3 px-4">
                        <Badge
                          className={`text-xs font-semibold px-2.5 py-0.5 ${
                            isWon
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {isWon ? (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600 inline" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 mr-1 text-rose-600 inline" />
                          )}
                          {deal.result}
                        </Badge>
                      </td>

                      {/* Product & Value */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1 max-w-[200px]">
                          {deal.product_interest || '-'}
                        </div>
                        <div
                          className={`font-bold text-[11px] mt-0.5 ${
                            isWon
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500 line-through'
                          }`}
                        >
                          {deal.quote_value ? formatCurrency(deal.quote_value) : 'Sem valor'}
                        </div>
                      </td>

                      {/* Loss Reason / Notes */}
                      <td className="py-3 px-4 max-w-[220px]">
                        {!isWon && deal.loss_reason ? (
                          <div className="inline-block px-2 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 font-medium text-[11px] border border-rose-100 dark:border-rose-900">
                            {deal.loss_reason}
                          </div>
                        ) : null}
                        {deal.final_notes ? (
                          <p className="text-[11px] text-slate-500 italic line-clamp-1 mt-0.5">
                            "{deal.final_notes}"
                          </p>
                        ) : !deal.loss_reason ? (
                          <span className="text-slate-400">-</span>
                        ) : null}
                      </td>

                      {/* Closed Date & Duration */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">
                          {formatDateTime(deal.closed_at)}
                        </div>
                        {deal.duration_days !== undefined && (
                          <span className="text-[10px] text-slate-400">
                            Ciclo: {deal.duration_days} dias
                          </span>
                        )}
                      </td>

                      {/* Assigned to / Closed by */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {deal.expand?.assigned_to?.name ||
                            deal.expand?.closed_by?.name ||
                            'Atendente'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDealToReopen(deal)
                              setReopenModalOpen(true)
                            }}
                            className="h-8 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-800 font-semibold"
                            title="Reabrir este atendimento e colocar na etapa 'Precisa responder'"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Reabrir
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenClientDrawer(deal.client_id)}
                            className="h-8 text-xs text-slate-600 hover:text-slate-900"
                            title="Abrir histórico e mensagens do cliente"
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1 text-slate-500" />
                            Histórico
                          </Button>

                          <a
                            href={getWhatsAppDirectUrl(deal.client_phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Abrir no WhatsApp Web"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reopen Confirmation Dialog */}
      <Dialog open={reopenModalOpen} onOpenChange={setReopenModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
              Reabrir Atendimento?
            </DialogTitle>
            <DialogDescription>
              O cliente <strong>"{dealToReopen?.client_name}"</strong> será desarquivado e retornado
              ao funil Kanban principal na coluna <strong>"Precisa responder"</strong>, mantendo
              todo o histórico de mensagens e negociações anteriores.
            </DialogDescription>
          </DialogHeader>

          {dealToReopen && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Último encerramento:</span>
                <span className="font-semibold">{dealToReopen.result}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Data do encerramento:</span>
                <span>{formatDateTime(dealToReopen.closed_at)}</span>
              </div>
              {dealToReopen.quote_value ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor anterior:</span>
                  <span className="font-bold text-emerald-600">
                    {formatCurrency(dealToReopen.quote_value)}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="pt-2">
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
              onClick={handleReopenDeal}
              disabled={reopening}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {reopening ? 'Reabrindo...' : 'Confirmar e Reabrir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Chat & History Drawer */}
      <WhatsAppChatDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setSelectedClientForDrawer(null)
        }}
        client={selectedClientForDrawer}
        slaConfig={{ urgentMinutes: 1440, warningMinutes: 720, noticeMinutes: 360 }}
        onClientUpdated={() => loadData()}
      />
    </div>
  )
}
