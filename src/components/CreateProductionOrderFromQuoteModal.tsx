import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Package,
  Calendar,
  Layers,
  FileText,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Truck,
  ShieldCheck,
  Tag,
  ExternalLink,
} from 'lucide-react'
import type { Quote } from '@/types/quotes'
import type {
  ProductionOrder,
  ProductionStage,
  User as UserType,
  Priority,
  ProductionDeliveryType,
} from '@/types/crm'
import {
  quoteToProductionService,
  extractProductionOrderDataFromQuote,
} from '@/services/quoteToProduction'
import { productionStagesService } from '@/services/productionStages'
import { usersService } from '@/services/whatsapp'
import { formatCurrency, formatDateTime } from '@/lib/sla'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'

interface CreateProductionOrderFromQuoteModalProps {
  isOpen: boolean
  onClose: () => void
  quote: Quote | null
  onOrderCreated?: (order: ProductionOrder, isExisting: boolean) => void
  onOpenExistingOrder?: (order: ProductionOrder) => void
}

export default function CreateProductionOrderFromQuoteModal({
  isOpen,
  onClose,
  quote,
  onOrderCreated,
  onOpenExistingOrder,
}: CreateProductionOrderFromQuoteModalProps) {
  const [users, setUsers] = useState<UserType[]>([])
  const [loading, setLoading] = useState(false)
  const [checkingExisting, setCheckingExisting] = useState(false)
  const [existingOrder, setExistingOrder] = useState<ProductionOrder | null>(null)

  // Production-only form fields
  const [promisedDeadline, setPromisedDeadline] = useState('')
  const [salesRepId, setSalesRepId] = useState('')
  const [productionRepId, setProductionRepId] = useState('')
  const [priority, setPriority] = useState<Priority>('media')
  const [deliveryType, setDeliveryType] = useState<ProductionDeliveryType>('retirada')
  const [requiresArtApproval, setRequiresArtApproval] = useState<boolean>(true)
  const [productionNotes, setProductionNotes] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)

  useEffect(() => {
    if (isOpen && quote) {
      // Default deadline: 3 days from today
      const d = new Date()
      d.setDate(d.getDate() + 3)
      setPromisedDeadline(d.toISOString().substring(0, 10))

      setSalesRepId(quote.user_id || pb.authStore.record?.id || '')
      setProductionRepId('')
      setPriority('media')
      setDeliveryType('retirada')
      // Rule 3: Compute initial snapshot for requiresArtApproval from quote items
      const initialSnap = extractProductionOrderDataFromQuote(quote)
      setRequiresArtApproval(initialSnap.requiresArtApproval)
      setProductionNotes('')
      setSelectedFiles(null)
      setExistingOrder(null)

      // Fetch users for assignment
      usersService.getAll().then(setUsers).catch(console.error)

      // Check if order already exists for this quote.id
      setCheckingExisting(true)
      quoteToProductionService
        .findExistingOrderForQuote(quote.id, quote.code)
        .then((found) => {
          setExistingOrder(found)
        })
        .catch(console.error)
        .finally(() => {
          setCheckingExisting(false)
        })
    }
  }, [isOpen, quote])

  if (!quote) return null

  const snapshot = extractProductionOrderDataFromQuote(quote)
  const isApproved = quote.status === 'aprovado'

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isApproved) {
      toast({
        title: 'Orçamento não está aprovado',
        description: 'Apenas orçamentos com status "Aprovado" podem ser convertidos em pedido.',
        variant: 'destructive',
      })
      return
    }

    if (existingOrder) {
      toast({
        title: 'Pedido já existe',
        description: `Este orçamento já originou o Pedido ${existingOrder.order_number}.`,
      })
      if (onOpenExistingOrder) {
        onOpenExistingOrder(existingOrder)
      }
      onClose()
      return
    }

    setLoading(true)
    try {
      const filesArray: File[] = []
      if (selectedFiles) {
        for (let i = 0; i < selectedFiles.length; i++) {
          filesArray.push(selectedFiles[i])
        }
      }

      const result = await quoteToProductionService.createProductionOrderFromQuote({
        quote,
        promisedDeadline: promisedDeadline.substring(0, 10),
        salesRepId: salesRepId || undefined,
        productionRepId: productionRepId || undefined,
        priority,
        deliveryType,
        requiresArtApproval,
        productionNotes: productionNotes.trim() || undefined,
        attachments: filesArray,
      })

      if (result.isExisting) {
        toast({
          title: 'Pedido já cadastrado!',
          description: `O orçamento ${quote.code} já está vinculado ao pedido ${result.order.order_number}.`,
        })
        if (onOpenExistingOrder) {
          onOpenExistingOrder(result.order)
        }
      } else {
        toast({
          title: '🎉 Pedido de Produção Criado!',
          description: `Pedido ${result.order.order_number} gerado a partir do orçamento ${quote.code} com sucesso!`,
        })
        if (onOrderCreated) {
          onOrderCreated(result.order, false)
        }
      }

      window.dispatchEvent(new CustomEvent('production-order-updated'))
      window.dispatchEvent(new CustomEvent('quotes-updated'))
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
      window.dispatchEvent(new CustomEvent('deal-updated'))
      onClose()
    } catch (err: any) {
      console.error('Error creating production order from quote:', err)
      toast({
        title: 'Erro ao gerar pedido de produção',
        description: err?.message || 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-lg">
              <Package className="h-5 w-5 text-emerald-600" />
              <span>Pedido de Produção a partir do {quote.code}</span>
            </DialogTitle>
            <Badge
              className={
                isApproved
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300'
              }
            >
              {isApproved ? '✓ Orçamento Aprovado' : `Status: ${quote.status}`}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Confira as especificações exatas aprovadas pelo cliente e complete os dados de produção
            (prazo, responsáveis e observações internas).
          </DialogDescription>
        </DialogHeader>

        {/* Banner se pedido já existe */}
        {existingOrder && (
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <div>
                <strong>Pedido já criado anteriormente:</strong>{' '}
                <span className="font-mono font-bold">{existingOrder.order_number}</span> (Etapa:{' '}
                {existingOrder.stage_name || existingOrder.stage_internal_id})
              </div>
            </div>
            {onOpenExistingOrder && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onOpenExistingOrder(existingOrder)
                  onClose()
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir Pedido
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleConfirmCreate} className="space-y-4 pt-1">
          {/* SEÇÃO 1: DADOS COMERCIAIS CONGELADOS DO ORÇAMENTO (READ-ONLY) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-emerald-600" />
                1. Snapshot Aprovado do Orçamento (Não Editável)
              </span>
              <span className="text-xs text-slate-500 font-mono">{quote.code}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Cliente
                </span>
                <strong className="text-slate-900 dark:text-white text-xs block truncate mt-0.5">
                  {quote.client_name}
                </strong>
                <span className="text-slate-500 text-[11px] font-mono">
                  {quote.client_phone || 'Sem telefone'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Atendimento Origem
                </span>
                <strong className="text-slate-900 dark:text-white text-xs block truncate mt-0.5 font-mono">
                  {quote.attendance_id || 'Atendimento comercial'}
                </strong>
                <span className="text-slate-500 text-[11px]">
                  Aprovado em:{' '}
                  {quote.approved_at
                    ? new Date(quote.approved_at).toLocaleDateString('pt-BR')
                    : 'Data recente'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <span className="text-emerald-700 dark:text-emerald-400 block text-[10px] uppercase font-semibold">
                  Valor Total da Venda
                </span>
                <strong className="text-emerald-600 dark:text-emerald-300 text-base font-bold block mt-0.5">
                  {formatCurrency(snapshot.totalValue)}
                </strong>
                <span className="text-emerald-700/80 dark:text-emerald-400/80 text-[10px]">
                  {Array.isArray(quote.items) ? quote.items.length : 0} item(ns) incluído(s)
                </span>
              </div>
            </div>

            {/* Itens detalhados do orçamento */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Itens & Especificações Técnicas:
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {Array.isArray(quote.items) && quote.items.length > 0 ? (
                  quote.items.map((it, idx) => (
                    <div
                      key={it.id || idx}
                      className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 dark:text-white">
                          {idx + 1}. {it.product_name}
                        </strong>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(
                            it.item_total_sale !== undefined && it.item_total_sale !== null
                              ? it.item_total_sale
                              : (it.applied_unit_price || it.calculated_unit_price || 0) *
                                  (it.quantity || 1),
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <Badge variant="outline" className="text-[10px] py-0">
                          Qtd: {it.quantity || 1}
                        </Badge>
                        {it.width && it.height && (
                          <span>
                            Medidas: {it.width}m × {it.height}m
                          </span>
                        )}
                        {it.linear_meters && <span>Medidas: {it.linear_meters}m lineares</span>}
                        {it.material_name && (
                          <span className="text-slate-600 dark:text-slate-300">
                            Material: <strong>{it.material_name}</strong>
                          </span>
                        )}
                        <span>
                          Unit:{' '}
                          {formatCurrency(it.applied_unit_price || it.calculated_unit_price || 0)}
                        </span>
                      </div>

                      {Array.isArray(it.additionals) && it.additionals.length > 0 && (
                        <div className="text-[10px] text-teal-600 font-medium">
                          Adicionais:{' '}
                          {it.additionals
                            .map((a: any) => `${a.name} (${a.quantity} un)`)
                            .join(', ')}
                        </div>
                      )}
                      {it.notes && (
                        <div className="text-[10px] text-slate-400 italic">Obs: {it.notes}</div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Nenhum item discriminado no orçamento.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: DADOS DE PRODUÇÃO (PRAZO, RESPONSÁVEIS, TIPO DE ENTREGA) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              2. Dados da Produção & Entrega
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Prazo Prometido de Entrega *
                </label>
                <Input
                  type="date"
                  value={promisedDeadline}
                  onChange={(e) => setPromisedDeadline(e.target.value)}
                  className="mt-1 text-xs bg-white dark:bg-slate-950 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Prioridade
                </label>
                <Select value={priority} onValueChange={(val: Priority) => setPriority(val)}>
                  <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-950">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                    <SelectItem value="media">🟡 Média</SelectItem>
                    <SelectItem value="alta">🟠 Alta</SelectItem>
                    <SelectItem value="urgente">🔴 Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tipo de Entrega
                </label>
                <Select
                  value={deliveryType}
                  onValueChange={(val: ProductionDeliveryType) => setDeliveryType(val)}
                >
                  <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-950">
                    <SelectValue placeholder="Entrega..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retirada">🏬 Retirada no Balcão</SelectItem>
                    <SelectItem value="envio">📦 Envio / Transportadora</SelectItem>
                    <SelectItem value="entrega_propria">🛵 Entrega Própria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Configuração de Exigência de Aprovação de Arte */}
            <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                  Exige Aprovação de Arte?
                </span>
                <span className="text-[11px] text-amber-700 dark:text-amber-400 block">
                  {requiresArtApproval
                    ? 'O pedido exigirá arte aprovada antes de entrar em "Em Produção".'
                    : 'O pedido poderá entrar direto em produção sem fluxo de aprovação de arte (ex: reimpressão / arquivo pronto).'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={requiresArtApproval ? 'default' : 'outline'}
                  onClick={() => setRequiresArtApproval(true)}
                  className={`text-xs h-7 px-3 ${
                    requiresArtApproval
                      ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold'
                      : 'border-amber-300 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  SIM
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!requiresArtApproval ? 'default' : 'outline'}
                  onClick={() => setRequiresArtApproval(false)}
                  className={`text-xs h-7 px-3 ${
                    !requiresArtApproval
                      ? 'bg-slate-700 hover:bg-slate-800 text-white font-semibold'
                      : 'border-slate-300 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  NÃO
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Resp. Atendimento Comercial
                </label>
                <Select value={salesRepId} onValueChange={setSalesRepId}>
                  <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-950">
                    <SelectValue placeholder="Atendente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Resp. Produção / Design
                </label>
                <Select value={productionRepId} onValueChange={setProductionRepId}>
                  <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-950">
                    <SelectValue placeholder="Designer/Produtor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Arquivos Adicionais / Artes
                </label>
                <Input
                  type="file"
                  multiple
                  onChange={(e) => setSelectedFiles(e.target.files)}
                  className="mt-1 text-xs bg-white dark:bg-slate-950"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  PDF, AI, CDR, PNG, JPG (opcional)
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Observações Internas da Produção
                </label>
                <Textarea
                  value={productionNotes}
                  onChange={(e) => setProductionNotes(e.target.value)}
                  placeholder="Instruções de impressão, corte, embalagem..."
                  rows={2}
                  className="mt-1 text-xs bg-white dark:bg-slate-950 resize-none"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 flex flex-row items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            {existingOrder ? (
              <Button
                type="button"
                onClick={() => {
                  if (onOpenExistingOrder) onOpenExistingOrder(existingOrder)
                  onClose()
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5"
              >
                <Package className="h-4 w-4" />
                Ver Pedido Existente #{existingOrder.order_number}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={loading || !isApproved || checkingExisting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 min-w-[160px]"
              >
                {loading ? (
                  <>
                    <Clock className="h-3.5 w-3.5 animate-spin" />
                    <span>Gerando Pedido...</span>
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4" />
                    <span>Confirmar e Criar Pedido</span>
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
