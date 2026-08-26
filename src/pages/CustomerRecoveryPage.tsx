import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldAlert,
  Search,
  Star,
  CheckCircle2,
  Clock,
  MessageSquare,
  Phone,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Filter,
  Check,
  XCircle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react'
import { evaluationsService } from '@/services/evaluations'
import { clientsService } from '@/services/clients'
import { dealsService } from '@/services/deals'
import type { Evaluation, Client } from '@/types/crm'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { formatDateTime, getWhatsAppDirectUrl } from '@/lib/sla'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'
import { toast } from '@/hooks/use-toast'

export default function CustomerRecoveryPage() {
  const navigate = useNavigate()
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('pending')

  // Resolution modal
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [resolving, setResolving] = useState(false)

  // WhatsApp chat drawer
  const [selectedClientForChat, setSelectedClientForChat] = useState<Client | null>(null)
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)

  const loadData = async () => {
    try {
      const [evals, cls] = await Promise.all([
        evaluationsService.getAll('overall_rating <= 3 && overall_rating > 0', '-created'),
        clientsService.getAll(undefined, '-updated', { includeArchived: true }),
      ])
      setEvaluations(evals)
      setClients(cls)
    } catch (err) {
      console.error('Error loading recovery cases:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredEvaluations = evaluations.filter((ev) => {
    const client = ev.expand?.client_id || clients.find((c) => c.id === ev.client_id)
    const name = client?.name || ''
    const phone = client?.phone || ''
    const orderNum = ev.order_number || ''
    const comment = ev.comment || ''

    const matchesSearch =
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phone.includes(searchTerm) ||
      orderNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comment.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ? true : statusFilter === 'pending' ? !ev.resolved : ev.resolved

    return matchesSearch && matchesStatus
  })

  const pendingCount = evaluations.filter((e) => !e.resolved).length
  const resolvedCount = evaluations.filter((e) => e.resolved).length

  const handleOpenResolveModal = (evaluation: Evaluation) => {
    setSelectedEvaluation(evaluation)
    setResolutionNotes(evaluation.resolved_notes || '')
    setResolveModalOpen(true)
  }

  const handleConfirmResolve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEvaluation) return

    setResolving(true)
    try {
      await evaluationsService.resolveEvaluation(
        selectedEvaluation.id,
        resolutionNotes.trim() || 'Problema alinhado e resolvido com o cliente.',
        true,
      )

      toast({
        title: '🎉 Caso de Recuperação Solucionado!',
        description: 'O cliente foi marcado como recuperado e o histórico registrado com sucesso.',
      })

      setResolveModalOpen(false)
      loadData()
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
    } catch (err: any) {
      toast({
        title: 'Erro ao resolver caso',
        description: err?.message || 'Falha ao salvar resolução.',
        variant: 'destructive',
      })
    } finally {
      setResolving(false)
    }
  }

  const handleContactWhatsApp = (ev: Evaluation) => {
    const client = ev.expand?.client_id || clients.find((c) => c.id === ev.client_id)
    if (!client) {
      toast({ title: 'Cliente não encontrado', variant: 'destructive' })
      return
    }

    const defaultMsg = `Olá, ${client.name}! Aqui é da gerência de qualidade da Laletra Gráfica. Recebemos sua avaliação sobre o recente pedido e gostaríamos muito de entender como podemos te atender melhor e solucionar qualquer ponto pendente. Podemos conversar?`

    // Open chat drawer or open wa direct
    setSelectedClientForChat(client)
    setChatDrawerOpen(true)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-rose-600" />
            Recuperação de Clientes & Tratamento de Insatisfação
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Acompanhe avaliações com notas de 1 a 3 estrelas, entre em contato e registre as ações
            de solução para reter o cliente.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => navigate('/pos-venda')}
            className="text-xs border-slate-300 dark:border-slate-700"
          >
            Dashboard de Pós-Venda
          </Button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Casos Pendentes */}
        <Card className="border-rose-200 bg-rose-50/40 dark:bg-rose-950/20 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Aguardando Contato / Solução
              </p>
              <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                {pendingCount}
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Casos Solucionados */}
        <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Problemas Solucionados
              </p>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {resolvedCount}
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Taxa de Resolução */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Taxa de Resolução
              </p>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                {evaluations.length > 0
                  ? Math.round((resolvedCount / evaluations.length) * 100)
                  : 100}
                %
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center">
              <RotateCcw className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, telefone ou reclamação..."
            className="pl-9 text-xs bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-full sm:w-48 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">⚠️ Aguardando Solução ({pendingCount})</SelectItem>
              <SelectItem value="resolved">✓ Resolvidos ({resolvedCount})</SelectItem>
              <SelectItem value="all">Todos os Casos ({evaluations.length})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List of Recovery Cases */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400">
            Carregando casos de recuperação...
          </div>
        ) : filteredEvaluations.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Nenhuma reclamação pendente!
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Todos os clientes insatisfeitos foram contatados ou não há avaliações negativas no
              momento.
            </p>
          </div>
        ) : (
          filteredEvaluations.map((ev) => {
            const client = ev.expand?.client_id || clients.find((c) => c.id === ev.client_id)
            const attendance = ev.expand?.attendance_id

            return (
              <Card
                key={ev.id}
                className={`transition-all duration-200 ${
                  !ev.resolved
                    ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/10 shadow-sm hover:shadow'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top Bar: Client & Note & Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-slate-900 dark:text-white">
                          {client?.name || 'Cliente'}
                        </span>
                        {ev.order_number && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono px-2 py-0 bg-white dark:bg-slate-900"
                          >
                            Pedido {ev.order_number}
                          </Badge>
                        )}
                        <div className="flex items-center text-amber-500">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-4 w-4 ${
                                s <= ev.overall_rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200 dark:text-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                        <Badge
                          variant={ev.resolved ? 'secondary' : 'destructive'}
                          className="text-[10px] uppercase font-bold px-2 py-0"
                        >
                          {ev.resolved ? '✓ Problema Resolvido' : '⚠️ Contato Urgente'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="h-3 w-3 text-emerald-600" />
                          {client?.phone}
                        </span>
                        <span>•</span>
                        <span>Avaliado em {formatDateTime(ev.created)}</span>
                        {ev.order_number && (
                          <>
                            <span>•</span>
                            <span>
                              Pedido de Produção: <strong>{ev.order_number}</strong>
                            </span>
                          </>
                        )}
                        {attendance && (
                          <>
                            <span>•</span>
                            <span>Origem Comercial: {attendance.product_interest || 'Venda'}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (client) {
                            setSelectedClientForChat(client)
                            setChatDrawerOpen(true)
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8 shadow-xs"
                        title="Abrir e responder conversa no CRM"
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        Responder no CRM
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleContactWhatsApp(ev)}
                        className="text-xs h-8 text-slate-700 hover:text-emerald-700 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200"
                        title="Abrir no WhatsApp Web"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        WhatsApp Web
                      </Button>

                      <Button
                        size="sm"
                        variant={ev.resolved ? 'outline' : 'default'}
                        onClick={() => handleOpenResolveModal(ev)}
                        className={
                          ev.resolved
                            ? 'text-xs h-8'
                            : 'bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold h-8'
                        }
                      >
                        {ev.resolved ? 'Editar Resolução' : 'Registrar Solução'}
                      </Button>
                    </div>
                  </div>

                  {/* Rating breakdown */}
                  {(ev.service_rating || ev.quality_rating || ev.delivery_rating) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Atendimento:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {ev.service_rating ? `${ev.service_rating} ★` : 'Não avaliado'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Qualidade da Impressão:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {ev.quality_rating ? `${ev.quality_rating} ★` : 'Não avaliado'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Prazo / Entrega:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {ev.delivery_rating ? `${ev.delivery_rating} ★` : 'Não avaliado'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Client feedback text */}
                  {ev.comment ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1">
                      <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block">
                        Comentário do Cliente:
                      </span>
                      <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                        "{ev.comment}"
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      O cliente atribuiu a nota sem deixar comentário de texto.
                    </p>
                  )}

                  {/* Resolution Notes box if resolved */}
                  {ev.resolved && ev.resolved_notes && (
                    <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[10px] text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Solução Aplicada pela Equipe:
                        </span>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                          {formatDateTime(ev.resolved_at || ev.updated)}
                        </span>
                      </div>
                      <p className="text-emerald-900 dark:text-emerald-200">{ev.resolved_notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Resolution Modal */}
      <Dialog open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Registrar Solução da Reclamação
            </DialogTitle>
            <DialogDescription className="text-xs">
              Informe as ações tomadas com o cliente (ex: reimpressão, desconto, esclarecimento de
              dúvidas) para marcar o problema como resolvido.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmResolve} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ações Tomadas e Solução *
              </label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Ex: Entramos em contato via WhatsApp, solicitamos o reenvio da arte com sangria e refizemos a impressão em cortesia. Cliente agradeceu e ficou satisfeito."
                rows={4}
                required
                className="mt-1 text-xs resize-none"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResolveModalOpen(false)}
                disabled={resolving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={resolving || !resolutionNotes.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
              >
                {resolving ? 'Gravando...' : 'Marcar como Resolvido'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Chat Drawer */}
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
