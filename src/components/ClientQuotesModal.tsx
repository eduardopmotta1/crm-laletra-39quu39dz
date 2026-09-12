import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
  FileSpreadsheet,
  Calendar,
  DollarSign,
  Clock,
  User as UserIcon,
  RotateCcw,
  Loader2,
  ExternalLink,
  MessageSquare,
  Copy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit3,
  Layers,
  Send,
  PlusCircle,
} from 'lucide-react'
import type { Client, User } from '@/types/crm'
import type { Quote, QuoteStatus } from '@/types/quotes'
import { quotesService } from '@/services/quotes'
import { usersService } from '@/services/whatsapp'
import {
  formatCurrency,
  formatDateTime,
  formatQuoteWhatsAppMessage,
  getWhatsAppDirectUrl,
} from '@/lib/sla'
import { toast } from '@/hooks/use-toast'

interface ClientQuotesModalProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  zIndexClass?: string
}

type FilterTab = 'all' | 'aprovado' | 'pendente' | 'rejeitado'

export default function ClientQuotesModal({
  isOpen,
  onClose,
  client,
  zIndexClass = 'z-[70]',
}: ClientQuotesModalProps) {
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [usersMap, setUsersMap] = useState<Record<string, User>>({})

  // Modal de detalhes do orçamento selecionado
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Estado para ações assíncronas
  const [actionLoading, setActionLoading] = useState(false)

  // Buscar orçamentos EXCLUSIVAMENTE por client_id
  const loadQuotes = async (clientId: string) => {
    if (!clientId) return
    setLoading(true)
    try {
      const [quoteList, allUsers] = await Promise.all([
        quotesService.getByClientId(clientId),
        usersService.getAll(),
      ])

      const uMap: Record<string, User> = {}
      allUsers.forEach((u) => {
        uMap[u.id] = u
      })
      setUsersMap(uMap)

      // Garantir ordenação: mais recente primeiro (-created)
      const sorted = [...quoteList].sort((a, b) => {
        const timeA = new Date(a.created || 0).getTime()
        const timeB = new Date(b.created || 0).getTime()
        return timeB - timeA
      })

      setQuotes(sorted)
    } catch (err) {
      console.error('[ClientQuotesModal] Erro ao carregar orçamentos do cliente:', err)
      setQuotes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && client?.id) {
      loadQuotes(client.id)
      setFilterTab('all')
      setSelectedQuote(null)
      setDetailsOpen(false)
    } else {
      setQuotes([])
      setSelectedQuote(null)
      setDetailsOpen(false)
    }
  }, [isOpen, client?.id])

  // Categorização de status conforme especificado:
  // - Aprovados (status = aprovado)
  // - Pendentes/Enviados (status em rascunho, enviado, alteracao_solicitada)
  // - Rejeitados/Não fechados (status em recusado, expirado)
  const isApproved = (q: Quote) => q.status === 'aprovado'
  const isPending = (q: Quote) =>
    q.status === 'rascunho' || q.status === 'enviado' || q.status === 'alteracao_solicitada'
  const isRejected = (q: Quote) => q.status === 'recusado' || q.status === 'expirado'

  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      if (filterTab === 'all') return true
      if (filterTab === 'aprovado') return isApproved(q)
      if (filterTab === 'pendente') return isPending(q)
      if (filterTab === 'rejeitado') return isRejected(q)
      return true
    })
  }, [quotes, filterTab])

  // Resumo no topo
  const summary = useMemo(() => {
    const totalCount = quotes.length
    const approvedQuotes = quotes.filter(isApproved)
    const approvedCount = approvedQuotes.length
    const pendingCount = quotes.filter(isPending).length
    const rejectedCount = quotes.filter(isRejected).length

    const totalApprovedValue = approvedQuotes.reduce(
      (acc, q) =>
        acc +
        (Number(
          q.final_total !== undefined && q.final_total !== null ? q.final_total : q.total_sale,
        ) || 0),
      0,
    )

    return {
      totalCount,
      approvedCount,
      pendingCount,
      rejectedCount,
      totalApprovedValue,
    }
  }, [quotes])

  const getRepName = (quote: Quote) => {
    if (quote.expand?.user_id?.name) return quote.expand.user_id.name
    if (quote.expand?.user_id?.email) return quote.expand.user_id.email.split('@')[0]
    if (quote.user_id && usersMap[quote.user_id]) {
      return usersMap[quote.user_id].name || usersMap[quote.user_id].email.split('@')[0]
    }
    return 'Equipe Comercial'
  }

  const getStatusBadge = (status?: QuoteStatus | string) => {
    switch (status) {
      case 'aprovado':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold gap-1">
            <CheckCircle2 className="h-3 w-3" /> Aprovado
          </Badge>
        )
      case 'enviado':
        return (
          <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold gap-1">
            <Send className="h-3 w-3" /> Enviado
          </Badge>
        )
      case 'rascunho':
        return (
          <Badge
            variant="outline"
            className="bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-semibold"
          >
            Rascunho
          </Badge>
        )
      case 'alteracao_solicitada':
        return (
          <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold gap-1">
            <AlertCircle className="h-3 w-3" /> Alteração solicitada
          </Badge>
        )
      case 'recusado':
        return (
          <Badge className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold gap-1">
            <XCircle className="h-3 w-3" /> Recusado
          </Badge>
        )
      case 'expirado':
        return (
          <Badge
            variant="outline"
            className="bg-zinc-100 text-zinc-600 border-zinc-300 text-[10px] font-semibold"
          >
            Expirado
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {status || 'Sem status'}
          </Badge>
        )
    }
  }

  const handleOpenQuoteDetails = (quote: Quote) => {
    setSelectedQuote(quote)
    setDetailsOpen(true)
  }

  const handleEditQuote = (quote: Quote) => {
    setDetailsOpen(false)
    onClose()
    const attParam = quote.attendance_id
      ? `?attendance_id=${encodeURIComponent(quote.attendance_id)}`
      : ''
    navigate(`/orcamentos/${quote.id}/editar${attParam}`)
  }

  const handleDuplicateQuote = async (quote: Quote, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setActionLoading(true)
    try {
      const duplicated = await quotesService.duplicate(quote.id)
      toast({
        title: 'Orçamento duplicado!',
        description: `Novo orçamento ${duplicated.code} gerado como rascunho com sucesso.`,
      })
      if (client?.id) {
        await loadQuotes(client.id)
      }
      setSelectedQuote(duplicated)
      setDetailsOpen(true)
    } catch (err: any) {
      console.error('[ClientQuotesModal] Erro ao duplicar orçamento:', err)
      toast({
        title: 'Erro ao duplicar orçamento',
        description: err?.message || 'Não foi possível duplicar o orçamento.',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleResendWhatsApp = (quote: Quote, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const phoneToUse = quote.client_phone || client?.phone
    if (!phoneToUse) {
      toast({
        title: 'Telefone não encontrado',
        description: 'Este orçamento e cliente não possuem número de WhatsApp cadastrado.',
        variant: 'destructive',
      })
      return
    }

    const message = formatQuoteWhatsAppMessage(quote, client?.name || quote.client_name)
    const directUrl = getWhatsAppDirectUrl(phoneToUse, message)
    window.open(directUrl, '_blank', 'noopener,noreferrer')
    toast({
      title: 'WhatsApp iniciado',
      description: `Mensagem do orçamento ${quote.code} preparada para envio.`,
    })
  }

  const handleCopyPublicLink = (quote: Quote, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const url = quotesService.getPublicQuoteUrl(quote)
    if (!url) {
      toast({
        title: 'Sem link público',
        description: 'Este orçamento não possui token público gerado.',
        variant: 'destructive',
      })
      return
    }
    navigator.clipboard.writeText(url)
    toast({
      title: 'Link copiado!',
      description: 'Link público do orçamento copiado para a área de transferência.',
    })
  }

  if (!isOpen || !client) return null

  const handleQuotesOpenChange = (open: boolean) => {
    if (!open) {
      if (detailsOpen) {
        return
      }
      onClose()
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleQuotesOpenChange}>
        <DialogContent
          zIndexClass={zIndexClass}
          className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0"
          onEscapeKeyDown={(e) => {
            if (detailsOpen) {
              e.preventDefault()
              return
            }
            e.stopPropagation()
          }}
          onInteractOutside={(e) => {
            if (detailsOpen) {
              e.preventDefault()
            }
          }}
          onPointerDownOutside={(e) => {
            if (detailsOpen) {
              e.preventDefault()
            }
          }}
        >
          {/* Header */}
          <DialogHeader className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  Orçamentos — {client.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Consulta de propostas comerciais vinculadas exclusivamente a este cliente (ID:{' '}
                  <span className="font-mono">{client.id}</span>).
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => client.id && loadQuotes(client.id)}
                  disabled={loading || actionLoading}
                  className="h-8 text-xs shrink-0 bg-white dark:bg-slate-800"
                >
                  <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onClose()
                    navigate(`/orcamentos/novo?client_id=${encodeURIComponent(client.id)}`)
                  }}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shrink-0 gap-1.5 shadow-xs"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Novo Orçamento
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Área de Resumo e Métricas */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {/* Total de Orçamentos */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
                  <span>Total</span>
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {summary.totalCount}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">propostas</div>
              </div>

              {/* Aprovados */}
              <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Aprovados</span>
                </div>
                <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                  {summary.approvedCount}
                </div>
                <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/70 mt-0.5">
                  fechados
                </div>
              </div>

              {/* Pendentes / Enviados */}
              <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>Pendentes</span>
                </div>
                <div className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400 mt-1">
                  {summary.pendingCount}
                </div>
                <div className="text-[10px] text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                  em negociação
                </div>
              </div>

              {/* Rejeitados / Não fechados */}
              <div className="p-3 rounded-xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs font-medium">
                  <XCircle className="h-3.5 w-3.5 text-rose-600" />
                  <span>Não fechados</span>
                </div>
                <div className="text-xl font-bold font-mono text-rose-700 dark:text-rose-400 mt-1">
                  {summary.rejectedCount}
                </div>
                <div className="text-[10px] text-rose-600/80 dark:text-rose-400/70 mt-0.5">
                  recusados/expirados
                </div>
              </div>

              {/* Valor Total Aprovado */}
              <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Total Aprovado</span>
                </div>
                <div className="text-lg sm:text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1 truncate">
                  {formatCurrency(summary.totalApprovedValue)}
                </div>
                <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/70 mt-0.5">
                  soma dos aprovados
                </div>
              </div>
            </div>

            {/* Barra de Filtros */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mr-1">
                  Filtrar por:
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={filterTab === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('all')}
                  className={`h-7 text-xs font-medium ${
                    filterTab === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  Todos ({quotes.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filterTab === 'aprovado' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('aprovado')}
                  className={`h-7 text-xs font-medium ${
                    filterTab === 'aprovado'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  Aprovados ({quotes.filter(isApproved).length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filterTab === 'pendente' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('pendente')}
                  className={`h-7 text-xs font-medium ${
                    filterTab === 'pendente'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  Pendentes/Enviados ({quotes.filter(isPending).length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filterTab === 'rejeitado' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('rejeitado')}
                  className={`h-7 text-xs font-medium ${
                    filterTab === 'rejeitado'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-white dark:bg-slate-800'
                  }`}
                >
                  Rejeitados/Não fechados ({quotes.filter(isRejected).length})
                </Button>
              </div>

              <div className="text-[11px] text-slate-400">
                Mostrando {filteredQuotes.length} de {quotes.length} orçamentos
              </div>
            </div>
          </div>

          {/* Lista de Orçamentos */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                <span className="text-xs">Carregando orçamentos do cliente...</span>
              </div>
            ) : quotes.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-2">
                <FileSpreadsheet className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <div className="font-semibold text-slate-600 dark:text-slate-300 text-sm">
                  Este cliente ainda não possui orçamentos.
                </div>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Você pode gerar uma nova proposta comercial clicando em "Novo Orçamento" no topo.
                </p>
              </div>
            ) : filteredQuotes.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                Nenhum orçamento encontrado para o filtro selecionado.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredQuotes.map((q) => {
                  const repName = getRepName(q)
                  const totalVal =
                    q.final_total !== undefined && q.final_total !== null
                      ? Number(q.final_total)
                      : Number(q.total_sale || 0)
                  const hasItems = Array.isArray(q.items) && q.items.length > 0

                  return (
                    <div
                      key={q.id}
                      onClick={() => handleOpenQuoteDetails(q)}
                      className="group p-4 rounded-xl border text-xs space-y-3 cursor-pointer transition-all shadow-xs hover:shadow-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500"
                    >
                      {/* Linha Superior: Código, Status, Badges e Valor Total */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold font-mono text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-xs">
                            {q.code}
                          </span>
                          {getStatusBadge(q.status)}
                          {q.attendance_id && (
                            <Badge
                              variant="outline"
                              className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1"
                            >
                              <MessageSquare className="h-2.5 w-2.5" />
                              Atendimento vinculado
                            </Badge>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                            {formatCurrency(totalVal)}
                          </span>
                        </div>
                      </div>

                      {/* Resumo de Produtos / Itens Principais (nome x quantidade) */}
                      {hasItems && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Layers className="h-3 w-3 text-emerald-600" />
                            Itens do Orçamento ({q.items?.length || 0})
                          </div>
                          <div className="space-y-1">
                            {q.items?.slice(0, 3).map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 p-1.5 rounded bg-slate-50 dark:bg-slate-800/60"
                              >
                                <span className="font-medium truncate pr-2">
                                  {item.product_name || `Item ${idx + 1}`}{' '}
                                  <strong className="text-slate-500 text-[11px]">
                                    × {item.quantity || 1}
                                  </strong>
                                </span>
                                {(item.item_total_sale !== undefined ||
                                  item.applied_unit_price !== undefined) && (
                                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 text-[11px]">
                                    {formatCurrency(
                                      Number(
                                        item.item_total_sale ??
                                          (item.applied_unit_price || 0) * (item.quantity || 1),
                                      ),
                                    )}
                                  </span>
                                )}
                              </div>
                            ))}
                            {(q.items?.length || 0) > 3 && (
                              <div className="text-[10px] text-slate-400 pl-1 italic">
                                + {(q.items?.length || 0) - 3} outro(s) item(ns)...
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Observações do cliente se houver */}
                      {q.customer_notes && (
                        <div className="p-2 rounded bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                          <AlertCircle className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            <strong>Obs/Alteração:</strong> {q.customer_notes}
                          </span>
                        </div>
                      )}

                      {/* Metadados: Data, Validade, Origem, Responsável */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
                        {/* Data */}
                        <div>
                          <span className="text-slate-400 block">Data de Criação:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {q.created ? formatDateTime(q.created) : '—'}
                          </span>
                        </div>

                        {/* Validade */}
                        <div>
                          <span className="text-slate-400 block">Validade:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {q.valid_until
                              ? new Date(q.valid_until).toLocaleDateString('pt-BR')
                              : 'Sem validade'}
                          </span>
                        </div>

                        {/* Origem */}
                        <div>
                          <span className="text-slate-400 block">Atendimento:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                            {q.attendance_id ? (
                              <span className="font-mono text-blue-600 dark:text-blue-400">
                                {q.attendance_id.slice(0, 8)}...
                              </span>
                            ) : (
                              'Direto'
                            )}
                          </span>
                        </div>

                        {/* Responsável */}
                        <div>
                          <span className="text-slate-400 block">Responsável:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 truncate">
                            <UserIcon className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                            {repName}
                          </span>
                        </div>
                      </div>

                      {/* Rodapé do Card com Ações Rápidas */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 flex-wrap">
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold group-hover:underline text-[11px]">
                          Ver detalhes da proposta →
                        </span>

                        <div className="flex items-center gap-1.5">
                          {/* Reenviar WhatsApp */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => handleResendWhatsApp(q, e)}
                            className="h-6 text-[10px] px-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-800 gap-1"
                            title="Reenviar via WhatsApp"
                          >
                            <Send className="h-2.5 w-2.5 text-emerald-600" />
                            WhatsApp
                          </Button>

                          {/* Duplicar */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={actionLoading}
                            onClick={(e) => handleDuplicateQuote(q, e)}
                            className="h-6 text-[10px] px-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 gap-1"
                            title="Duplicar orçamento"
                          >
                            <Copy className="h-2.5 w-2.5 text-slate-500" />
                            Duplicar
                          </Button>

                          {/* Link Público */}
                          {q.public_token && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleCopyPublicLink(q, e)}
                              className="h-6 text-[10px] px-1.5 text-slate-500 hover:text-slate-800"
                              title="Copiar link público do orçamento"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                            </Button>
                          )}
                        </div>
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
              Total de orçamentos deste cliente: <strong>{quotes.length}</strong>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes Reutilizando o mesmo padrão estrutural da QuotesListPage */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent
          zIndexClass="z-[90]"
          className="sm:max-w-2xl max-h-[88vh] overflow-y-auto"
          onEscapeKeyDown={(e) => {
            e.stopPropagation()
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white font-mono">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              {selectedQuote?.code} — {selectedQuote?.client_name || client.name}
            </DialogTitle>
            <DialogDescription>
              Resumo dos itens calculados e composição financeira do orçamento.
            </DialogDescription>
          </DialogHeader>

          {selectedQuote && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block">Cliente</span>
                  <strong className="text-slate-900 dark:text-white text-sm">
                    {selectedQuote.client_name || client.name}
                  </strong>
                  {(selectedQuote.client_phone || client.phone) && (
                    <span className="text-slate-400 block font-mono">
                      {selectedQuote.client_phone || client.phone}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Status</span>
                  {getStatusBadge(selectedQuote.status)}
                </div>
              </div>

              {/* Observações / Alteração solicitada */}
              {selectedQuote.customer_notes && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs space-y-1">
                  <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    Solicitação de alteração do cliente:
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 italic whitespace-pre-wrap">
                    "{selectedQuote.customer_notes}"
                  </p>
                </div>
              )}

              {/* Link público para aprovação */}
              {selectedQuote.public_token && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-500 block font-medium">
                      Link público para aprovação do cliente:
                    </span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate block">
                      {quotesService.getPublicQuoteUrl(selectedQuote)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyPublicLink(selectedQuote)}
                    className="h-7 text-xs flex-shrink-0"
                  >
                    Copiar link
                  </Button>
                </div>
              )}

              {/* Lista discriminada de Itens */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Itens da Proposta
                </h4>
                {Array.isArray(selectedQuote.items) && selectedQuote.items.length > 0 ? (
                  selectedQuote.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 dark:text-white text-sm">
                          {item.product_name}
                        </strong>
                        <span className="font-bold text-emerald-600 text-sm font-mono">
                          {formatCurrency(
                            Number(
                              item.item_total_sale !== undefined
                                ? item.item_total_sale
                                : (item.applied_unit_price || 0) * (item.quantity || 1),
                            ),
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-slate-500 text-[11px]">
                        <span>Qtd: {item.quantity}</span>
                        {item.width && item.height && (
                          <span>
                            Medidas: {item.width}m × {item.height}m
                          </span>
                        )}
                        {item.applied_unit_price !== undefined && (
                          <span>Unit: {formatCurrency(Number(item.applied_unit_price))}</span>
                        )}
                      </div>

                      {item.additionals && item.additionals.length > 0 && (
                        <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] text-teal-600 font-medium block">
                            Adicionais:{' '}
                            {item.additionals
                              .map((a: any) => `${a.name} (${a.quantity} un)`)
                              .join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Nenhum item discriminado.</p>
                )}
              </div>

              {/* Visão de Valores */}
              <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Visão Financeira
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2">
                  <div className="p-2 rounded-lg bg-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block">Custo Total</span>
                    <strong className="text-xs text-slate-200">
                      {formatCurrency(Number(selectedQuote.total_cost || 0))}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block">Venda Total</span>
                    <strong className="text-xs text-emerald-400">
                      {formatCurrency(
                        Number(selectedQuote.final_total || selectedQuote.total_sale || 0),
                      )}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block">Lucro Bruto</span>
                    <strong className="text-xs text-emerald-400">
                      {formatCurrency(Number(selectedQuote.gross_profit || 0))}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block">Margem %</span>
                    <strong className="text-xs text-emerald-400">
                      {Number(selectedQuote.profit_margin_pct || 0).toFixed(1)}%
                    </strong>
                  </div>
                </div>
              </div>

              {/* Ações do Rodapé do Modal de Detalhes */}
              <div className="pt-2 flex justify-between items-center gap-2 border-t border-slate-100 dark:border-slate-800 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => handleDuplicateQuote(selectedQuote)}
                    className="text-xs gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5 text-slate-500" />
                    Duplicar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleResendWhatsApp(selectedQuote)}
                    className="text-xs gap-1.5 text-emerald-700 hover:text-emerald-800 border-emerald-200"
                  >
                    <Send className="h-3.5 w-3.5 text-emerald-600" />
                    Reenviar WhatsApp
                  </Button>
                </div>

                <div className="flex gap-2 items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailsOpen(false)}
                    className="text-xs"
                  >
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleEditQuote(selectedQuote)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar orçamento
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
