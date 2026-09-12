import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText,
  Plus,
  Search,
  DollarSign,
  TrendingUp,
  Percent,
  Calendar,
  Layers,
  Package,
  Calculator,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Scissors,
  Edit3,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  XCircle,
} from 'lucide-react'
import { quotesService } from '@/services/quotes'
import { productionService } from '@/services/production'
import CreateProductionOrderFromQuoteModal from '@/components/CreateProductionOrderFromQuoteModal'
import ProductionOrderModal from '@/components/ProductionOrderModal'
import type { Quote } from '@/types/quotes'
import type { ProductionOrder } from '@/types/crm'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'

export default function QuotesListPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Delete Confirmation Dialog
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // View Details Modal
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Approve Modal State
  const [quoteToApprove, setQuoteToApprove] = useState<Quote | null>(null)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [isApprovingQuote, setIsApprovingQuote] = useState(false)

  // Reject Modal State
  const [quoteToReject, setQuoteToReject] = useState<Quote | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState<string>('')
  const [rejectNotes, setRejectNotes] = useState<string>('')
  const [isRejectingQuote, setIsRejectingQuote] = useState(false)

  // Production Orders state for duplicate checking
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([])
  const [createOrderModalOpen, setCreateOrderModalOpen] = useState(false)
  const [quoteForProductionOrder, setQuoteForProductionOrder] = useState<Quote | null>(null)
  const [viewOrderModalOpen, setViewOrderModalOpen] = useState(false)
  const [selectedOrderToView, setSelectedOrderToView] = useState<ProductionOrder | null>(null)

  const loadQuotesAndOrders = async () => {
    setLoading(true)
    try {
      const [quotesData, ordersData] = await Promise.all([
        quotesService.getAll(),
        productionService.getAll().catch(() => [] as ProductionOrder[]),
      ])
      setQuotes(quotesData)
      setProductionOrders(ordersData)
    } catch (err) {
      console.error('Error loading quotes and orders:', err)
      toast({
        title: 'Erro ao carregar propostas',
        description: 'Não foi possível buscar a lista de orçamentos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadQuotesAndOrders()

    const handleUpdate = () => {
      loadQuotesAndOrders()
    }
    window.addEventListener('production-order-updated', handleUpdate)
    window.addEventListener('quotes-updated', handleUpdate)
    return () => {
      window.removeEventListener('production-order-updated', handleUpdate)
      window.removeEventListener('quotes-updated', handleUpdate)
    }
  }, [])

  // Helper to find linked production order for a quote
  const getLinkedOrderForQuote = (quote: Quote): ProductionOrder | undefined => {
    return productionOrders.find(
      (o) =>
        o.quote_id === quote.id ||
        (o.notes &&
          (o.notes.includes(`[QUOTE_ID:${quote.id}]`) ||
            o.notes.includes(`[ORC:${quote.code}]`))) ||
        (o.description &&
          (o.description.includes(`[QUOTE_ID:${quote.id}]`) ||
            o.description.includes(`[ORC:${quote.code}]`))),
    )
  }

  const filteredQuotes = quotes.filter((q) => {
    const matchesSearch =
      q.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.client_phone && q.client_phone.includes(searchQuery))

    const matchesStatus = statusFilter === 'all' || q.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: Quote['status']) => {
    switch (status) {
      case 'aprovado':
        return (
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Aprovado
          </Badge>
        )
      case 'alteracao_solicitada':
        return (
          <Badge className="bg-amber-600 text-white hover:bg-amber-700">
            <Edit3 className="h-3 w-3 mr-1" />
            Alteração Solicitada
          </Badge>
        )
      case 'enviado':
        return (
          <Badge className="bg-blue-600 text-white hover:bg-blue-700">
            <Clock className="h-3 w-3 mr-1" />
            Enviado
          </Badge>
        )
      case 'recusado':
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Recusado
          </Badge>
        )
      case 'expirado':
        return <Badge variant="secondary">Expirado</Badge>
      default:
        return (
          <Badge variant="outline" className="text-slate-600 dark:text-slate-400">
            Rascunho
          </Badge>
        )
    }
  }

  const handleOpenApproveQuote = (q: Quote) => {
    setQuoteToApprove(q)
    setApproveDialogOpen(true)
  }

  const handleConfirmApproveQuote = async () => {
    if (!quoteToApprove || isApprovingQuote) return
    setIsApprovingQuote(true)
    const quoteCode = quoteToApprove.code
    const quoteId = quoteToApprove.id

    try {
      const updated = await quotesService.approve(quoteId)

      setQuotes((prev) => prev.map((item) => (item.id === quoteId ? updated : item)))
      if (selectedQuote?.id === quoteId) {
        setSelectedQuote(updated)
      }

      toast({
        title: 'Orçamento Aprovado!',
        description: `O orçamento ${quoteCode} foi aprovado com sucesso e o atendimento movido para "Venda fechada".`,
      })

      setApproveDialogOpen(false)
      setQuoteToApprove(null)
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
    } catch (err: any) {
      console.error('Error approving quote:', err)
      toast({
        title: 'Erro ao aprovar orçamento',
        description: err?.message || 'Não foi possível aprovar o orçamento.',
        variant: 'destructive',
      })
    } finally {
      setIsApprovingQuote(false)
    }
  }

  const handleOpenRejectQuote = (q: Quote) => {
    setQuoteToReject(q)
    setRejectReason('')
    setRejectNotes('')
    setRejectDialogOpen(true)
  }

  const handleConfirmRejectQuote = async () => {
    if (!quoteToReject || isRejectingQuote) return
    if (!rejectReason) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Por favor, selecione o motivo da recusa antes de prosseguir.',
        variant: 'destructive',
      })
      return
    }

    setIsRejectingQuote(true)
    const quoteCode = quoteToReject.code
    const quoteId = quoteToReject.id

    try {
      const updated = await quotesService.reject(
        quoteId,
        rejectReason,
        rejectNotes.trim() || undefined,
      )

      setQuotes((prev) => prev.map((item) => (item.id === quoteId ? updated : item)))
      if (selectedQuote?.id === quoteId) {
        setSelectedQuote(updated)
      }

      toast({
        title: 'Orçamento Recusado',
        description: `O orçamento ${quoteCode} foi registrado como recusado e o atendimento movido para "Não fechou".`,
      })

      setRejectDialogOpen(false)
      setQuoteToReject(null)
      setRejectReason('')
      setRejectNotes('')
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
    } catch (err: any) {
      console.error('Error rejecting quote:', err)
      toast({
        title: 'Erro ao recusar orçamento',
        description: err?.message || 'Não foi possível recusar o orçamento.',
        variant: 'destructive',
      })
    } finally {
      setIsRejectingQuote(false)
    }
  }

  const handleOpenDetails = (q: Quote) => {
    setSelectedQuote(q)
    setDetailsOpen(true)
  }

  const handleOpenDelete = (q: Quote) => {
    setQuoteToDelete(q)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!quoteToDelete || isDeleting) return

    setIsDeleting(true)
    const quoteCode = quoteToDelete.code
    const quoteId = quoteToDelete.id

    try {
      await quotesService.delete(quoteId)

      // Only on success: remove from local list
      setQuotes((prev) => prev.filter((q) => q.id !== quoteId))

      if (selectedQuote?.id === quoteId) {
        setDetailsOpen(false)
        setSelectedQuote(null)
      }

      toast({
        title: 'Orçamento excluído',
        description: `Orçamento ${quoteCode} excluído com sucesso.`,
      })

      setDeleteDialogOpen(false)
      setQuoteToDelete(null)
    } catch (err: any) {
      console.error('Error deleting quote:', err)
      const errorMsg =
        err?.message ||
        err?.response?.message ||
        (typeof err?.data === 'object' ? JSON.stringify(err.data) : null) ||
        'Não foi possível excluir o orçamento.'
      toast({
        title: 'Erro ao excluir orçamento',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <FileText className="h-4 w-4" />
            Módulo Orçamentos
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Gestão de Orçamentos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Visualize propostas comerciais emitidas, simulações de preços e margens de lucro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/orcamentos/novo">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Novo Orçamento
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Access to Submodules */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/orcamentos/materiais" className="group">
          <Card className="border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all shadow-xs group-hover:shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                    Materiais e Preços
                  </h4>
                  <p className="text-xs text-slate-500">Custos, venda por m², linear e kg</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-600 group-hover:translate-x-1 transition-transform">
                →
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link to="/orcamentos/produtos" className="group">
          <Card className="border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all shadow-xs group-hover:shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-teal-600 transition-colors">
                    Catálogo de Produtos
                  </h4>
                  <p className="text-xs text-slate-500">Banners, faixas, adesivos e regras</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-teal-600 group-hover:translate-x-1 transition-transform">
                →
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link to="/orcamentos/novo" className="group">
          <Card className="border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-500 transition-all shadow-xs group-hover:shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                    Calculadora & Novo Orçamento
                  </h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Simule área, m², adicionais e margens
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-600 group-hover:translate-x-1 transition-transform">
                →
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="sm:col-span-8 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar orçamentos por código (ex: ORC-2025-001) ou nome do cliente..."
            className="pl-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
          />
        </div>

        <div className="sm:col-span-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
              <SelectValue placeholder="Status da proposta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="alteracao_solicitada">Alteração Solicitada</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="recusado">Recusado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quotes List Table / Cards */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mr-3" />
          Carregando propostas de orçamento...
        </div>
      ) : filteredQuotes.length === 0 ? (
        <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Nenhum orçamento registrado
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Utilize a tela de Novo Orçamento para simular produtos, metros quadrados e valores de
            venda.
          </p>
          <Link to="/orcamentos/novo">
            <Button className="mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4" />
              Criar Primeiro Orçamento
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuotes.map((q) => (
            <Card
              key={q.id}
              className="border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800 transition-all shadow-xs"
            >
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {q.code}
                    </span>
                    {getStatusBadge(q.status)}
                    <span className="text-xs text-slate-400">
                      • {new Date(q.created).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {q.client_name}
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {q.client_phone && <span>📞 {q.client_phone}</span>}
                    {q.items && (
                      <span>
                        📦 {Array.isArray(q.items) ? q.items.length : 0} item(ns) incluído(s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Financial overview */}
                <div className="flex items-center gap-6 self-end md:self-center">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                      Valor Total
                    </span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {Number(q.final_total || q.total_sale || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Botão de Criação / Visualização de Pedido de Produção (para orçamentos aprovados e internos válidos) */}
                  {q.status !== 'recusado' &&
                    q.status !== 'expirado' &&
                    (() => {
                      const linkedOrder = getLinkedOrderForQuote(q)
                      if (linkedOrder) {
                        return (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setSelectedOrderToView(linkedOrder)
                              setViewOrderModalOpen(true)
                            }}
                            className="gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold h-8 px-2.5 shadow-xs"
                            title={`Ver Pedido de Produção ${linkedOrder.order_number}`}
                          >
                            <Package className="h-3.5 w-3.5" />
                            <span>Pedido #{linkedOrder.order_number}</span>
                          </Button>
                        )
                      }
                      return (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setQuoteForProductionOrder(q)
                            setCreateOrderModalOpen(true)
                          }}
                          className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-8 px-2.5 shadow-xs"
                          title={`Criar pedido de produção a partir do ${q.code}`}
                        >
                          <Package className="h-3.5 w-3.5" />
                          <span>Criar pedido de produção</span>
                        </Button>
                      )
                    })()}

                  {q.status === 'enviado' && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleOpenApproveQuote(q)}
                        className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-8 px-2.5"
                        title={`Aprovar orçamento ${q.code}`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Aprovar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRejectQuote(q)}
                        className="gap-1 text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-semibold h-8 px-2.5"
                        title={`Recusar orçamento ${q.code}`}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        Recusar
                      </Button>
                    </div>
                  )}

                  {q.status !== 'aprovado' && q.status !== 'recusado' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const attParam = q.attendance_id
                          ? `attendance_id=${encodeURIComponent(q.attendance_id)}`
                          : ''
                        const clientParam = q.client_id
                          ? `client_id=${encodeURIComponent(q.client_id)}`
                          : ''
                        const params = [attParam, clientParam].filter(Boolean).join('&')
                        navigate(params ? `/kanban?${params}` : '/kanban')
                      }}
                      className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-8 px-2.5"
                      title={
                        q.status === 'rascunho'
                          ? `Enviar orçamento ${q.code}`
                          : `Reenviar orçamento ${q.code}`
                      }
                    >
                      {q.status === 'rascunho' ? 'Enviar orçamento' : 'Reenviar orçamento'}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDetails(q)}
                    className="gap-1.5 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Detalhes
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const attParam = q.attendance_id
                        ? `?attendance_id=${encodeURIComponent(q.attendance_id)}`
                        : ''
                      navigate(`/orcamentos/${q.id}/editar${attParam}`)
                    }}
                    className="gap-1.5 text-xs bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-amber-600" />
                    Alterar orçamento
                  </Button>

                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDelete(q)}
                      className="gap-1.5 text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                      title={`Excluir orçamento ${q.code}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      Excluir
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL: QUOTE DETAILS */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white font-mono">
              <FileText className="h-5 w-5 text-emerald-600" />
              {selectedQuote?.code} — {selectedQuote?.client_name}
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
                    {selectedQuote.client_name}
                  </strong>
                  {selectedQuote.client_phone && (
                    <span className="text-slate-400 block">{selectedQuote.client_phone}</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Status</span>
                  {getStatusBadge(selectedQuote.status)}
                </div>
              </div>

              {/* Customer Notes if Alteration Requested */}
              {selectedQuote.customer_notes && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs space-y-1">
                  <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                    Solicitação de alteração do cliente:
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 italic whitespace-pre-wrap">
                    "{selectedQuote.customer_notes}"
                  </p>
                </div>
              )}

              {/* Public Link Generator / Copy */}
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
                    onClick={() => {
                      const url = quotesService.getPublicQuoteUrl(selectedQuote)
                      navigator.clipboard.writeText(url)
                      toast({
                        title: 'Link copiado!',
                        description:
                          'Link público do orçamento copiado para a área de transferência.',
                      })
                    }}
                    className="h-7 text-xs flex-shrink-0"
                  >
                    Copiar link
                  </Button>
                </div>
              )}

              {/* Items List */}
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
                        <span className="font-bold text-emerald-600 text-sm">
                          R$ {Number(item.item_total_sale || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-slate-500 text-[11px]">
                        <span>Qtd: {item.quantity}</span>
                        {item.width && item.height && (
                          <span>
                            Medidas: {item.width}m × {item.height}m (Área: {item.total_area} m²)
                          </span>
                        )}
                        <span>Unit: R$ {Number(item.applied_unit_price || 0).toFixed(2)}</span>
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

              {/* Internal Cost x Sale Financial Box */}
              <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Visão Administrativa (Custo x Venda)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2">
                  <div className="p-2 rounded-lg bg-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block">Custo Total</span>
                    <strong className="text-xs text-slate-200">
                      R$ {Number(selectedQuote.total_cost || 0).toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block">Venda Total</span>
                    <strong className="text-xs text-emerald-400">
                      R$ {Number(selectedQuote.total_sale || 0).toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block">Lucro Bruto</span>
                    <strong className="text-xs text-emerald-400">
                      R$ {Number(selectedQuote.gross_profit || 0).toFixed(2)}
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

              {/* Modal Footer with Delete & Edit Action */}
              <div className="pt-2 flex justify-between items-center gap-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDelete(selectedQuote)}
                      className="text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      Excluir orçamento
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  {selectedQuote.status !== 'recusado' &&
                    selectedQuote.status !== 'expirado' &&
                    (() => {
                      const linkedOrder = getLinkedOrderForQuote(selectedQuote)
                      if (linkedOrder) {
                        return (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setDetailsOpen(false)
                              setSelectedOrderToView(linkedOrder)
                              setViewOrderModalOpen(true)
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 font-semibold shadow-xs"
                          >
                            <Package className="h-3.5 w-3.5" />
                            Pedido #{linkedOrder.order_number}
                          </Button>
                        )
                      }
                      return (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const q = selectedQuote
                            setDetailsOpen(false)
                            setQuoteForProductionOrder(q)
                            setCreateOrderModalOpen(true)
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold shadow-xs"
                        >
                          <Package className="h-3.5 w-3.5" />
                          Criar pedido de produção
                        </Button>
                      )
                    })()}

                  {selectedQuote.status === 'enviado' && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleOpenApproveQuote(selectedQuote)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Aprovar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRejectQuote(selectedQuote)}
                        className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 text-xs gap-1.5 font-semibold"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        Recusar
                      </Button>
                    </>
                  )}

                  {selectedQuote.status !== 'aprovado' && selectedQuote.status !== 'recusado' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setDetailsOpen(false)
                        const attParam = selectedQuote.attendance_id
                          ? `attendance_id=${encodeURIComponent(selectedQuote.attendance_id)}`
                          : ''
                        const clientParam = selectedQuote.client_id
                          ? `client_id=${encodeURIComponent(selectedQuote.client_id)}`
                          : ''
                        const params = [attParam, clientParam].filter(Boolean).join('&')
                        navigate(params ? `/kanban?${params}` : '/kanban')
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold"
                    >
                      {selectedQuote.status === 'rascunho'
                        ? 'Enviar orçamento'
                        : 'Reenviar orçamento'}
                    </Button>
                  )}

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
                    onClick={() => {
                      setDetailsOpen(false)
                      const attParam = selectedQuote.attendance_id
                        ? `?attendance_id=${encodeURIComponent(selectedQuote.attendance_id)}`
                        : ''
                      navigate(`/orcamentos/${selectedQuote.id}/editar${attParam}`)
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Alterar este orçamento
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: CONFIRMAÇÃO DE APROVAÇÃO DE ORÇAMENTO */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Aprovar orçamento {quoteToApprove?.code}?
            </DialogTitle>
            <DialogDescription>
              Confirme a aprovação da proposta comercial para o cliente.
            </DialogDescription>
          </DialogHeader>

          {quoteToApprove && (
            <div className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Código:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {quoteToApprove.code}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {quoteToApprove.client_name}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    Valor Total:
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base">
                    R${' '}
                    {Number(quoteToApprove.final_total || quoteToApprove.total_sale || 0).toFixed(
                      2,
                    )}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                O orçamento será marcado como <strong>Aprovado</strong> e registrado no histórico de
                auditoria do CRM.
              </p>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isApprovingQuote}
                  onClick={() => {
                    setApproveDialogOpen(false)
                    setQuoteToApprove(null)
                  }}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isApprovingQuote}
                  onClick={handleConfirmApproveQuote}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold"
                >
                  {isApprovingQuote ? (
                    <>
                      <Clock className="h-3.5 w-3.5 animate-spin" />
                      <span>Aprovando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Confirmar aprovação</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: CRIAR PEDIDO DE PRODUÇÃO A PARTIR DO ORÇAMENTO APROVADO */}
      <CreateProductionOrderFromQuoteModal
        isOpen={createOrderModalOpen}
        onClose={() => {
          setCreateOrderModalOpen(false)
          setQuoteForProductionOrder(null)
        }}
        quote={quoteForProductionOrder}
        onOrderCreated={(order) => {
          loadQuotesAndOrders()
          setSelectedOrderToView(order)
          setViewOrderModalOpen(true)
        }}
        onOpenExistingOrder={(order) => {
          setSelectedOrderToView(order)
          setViewOrderModalOpen(true)
        }}
      />

      {/* MODAL: VISUALIZAR / EDITAR PEDIDO DE PRODUÇÃO */}
      <ProductionOrderModal
        isOpen={viewOrderModalOpen}
        onClose={() => {
          setViewOrderModalOpen(false)
          setSelectedOrderToView(null)
        }}
        orderToEdit={selectedOrderToView}
        onSaved={() => {
          loadQuotesAndOrders()
        }}
      />

      {/* MODAL: RECUSA DE ORÇAMENTO */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <XCircle className="h-5 w-5 text-rose-600" />
              Recusar orçamento {quoteToReject?.code}?
            </DialogTitle>
            <DialogDescription>
              Informe o motivo da recusa para manter o histórico e auditoria do CRM.
            </DialogDescription>
          </DialogHeader>

          {quoteToReject && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Orçamento:</span>
                  <span className="font-mono font-bold">{quoteToReject.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-semibold">{quoteToReject.client_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor Total:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    R${' '}
                    {Number(quoteToReject.final_total || quoteToReject.total_sale || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Motivo da recusa <span className="text-rose-500">*</span>
                </label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione o motivo da recusa..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Preço">Preço</SelectItem>
                    <SelectItem value="Prazo">Prazo</SelectItem>
                    <SelectItem value="Fechou com concorrente">Fechou com concorrente</SelectItem>
                    <SelectItem value="Cliente desistiu">Cliente desistiu</SelectItem>
                    <SelectItem value="Sem retorno / perdeu interesse">
                      Sem retorno / perdeu interesse
                    </SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {rejectReason === 'Outro' ? (
                    <>
                      Comentário / Detalhamento <span className="text-rose-500">*</span>
                    </>
                  ) : (
                    'Observações adicionais (opcional)'
                  )}
                </label>
                <Textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder={
                    rejectReason === 'Outro'
                      ? 'Descreva o motivo da recusa...'
                      : 'Ex: Cliente optou por adiar ou encontrou valor menor...'
                  }
                  className="text-xs min-h-[70px]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRejectingQuote}
                  onClick={() => {
                    setRejectDialogOpen(false)
                    setQuoteToReject(null)
                  }}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isRejectingQuote}
                  onClick={handleConfirmRejectQuote}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs gap-1.5 font-semibold"
                >
                  {isRejectingQuote ? (
                    <>
                      <Clock className="h-3.5 w-3.5 animate-spin" />
                      <span>Registrando recusa...</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Confirmar recusa</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* DIALOG DE CONFIRMAÇÃO DE EXCLUSÃO DE ORÇAMENTO */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" />
              <span>Excluir orçamento {quoteToDelete?.code}?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="block">Esta ação excluirá somente este orçamento.</span>
              <span className="block">
                Cliente, atendimento, mensagens e pedidos não serão excluídos.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-600"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir orçamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
