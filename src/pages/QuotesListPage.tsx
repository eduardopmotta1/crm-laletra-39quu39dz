import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
} from 'lucide-react'
import { quotesService } from '@/services/quotes'
import type { Quote } from '@/types/quotes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'

export default function QuotesListPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // View Details Modal
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const loadQuotes = async () => {
    setLoading(true)
    try {
      const data = await quotesService.getAll()
      setQuotes(data)
    } catch (err) {
      console.error('Error loading quotes:', err)
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
    loadQuotes()
  }, [])

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

  const handleOpenDetails = (q: Quote) => {
    setSelectedQuote(q)
    setDetailsOpen(true)
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

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDetails(q)}
                    className="gap-1.5 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Detalhes
                  </Button>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
