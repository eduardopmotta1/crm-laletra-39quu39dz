import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { CheckCircle2, XCircle, Archive, DollarSign, Sparkles, Package } from 'lucide-react'
import type { Client, DealResult } from '@/types/crm'
import { dealsService } from '@/services/deals'
import { productionService } from '@/services/production'
import { formatCurrency } from '@/lib/sla'
import { toast } from '@/hooks/use-toast'
import ProductionOrderModal from './ProductionOrderModal'

interface CompleteAndArchiveModalProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  attendanceId?: string
  initialResult?: DealResult
  onSuccess?: () => void
  zIndexClass?: string
}

const LOSS_REASON_PRESETS = [
  'Preço / Orçamento alto',
  'Prazo de entrega muito longo',
  'Optou por concorrente',
  'Desistiu do projeto / Não vai mais produzir',
  'Sem retorno após envio do orçamento',
  'Especificação técnica incompatível',
  'Outro motivo',
]

export default function CompleteAndArchiveModal({
  isOpen,
  onClose,
  client,
  attendanceId,
  initialResult = 'Venda fechada',
  onSuccess,
  zIndexClass = 'z-50',
}: CompleteAndArchiveModalProps) {
  const [result, setResult] = useState<DealResult>(initialResult)
  const [quoteValue, setQuoteValue] = useState<string>(
    client?.quote_value ? String(client.quote_value) : '',
  )
  const [productInterest, setProductInterest] = useState<string>(client?.product_interest || '')
  const [lossReason, setLossReason] = useState<string>('')
  const [customLossReason, setCustomLossReason] = useState<string>('')
  const [finalNotes, setFinalNotes] = useState<string>('')
  const [createProductionOrder, setCreateProductionOrder] = useState<boolean>(true)
  const [productionModalOpen, setProductionModalOpen] = useState<boolean>(false)
  const [createdArchivedDealId, setCreatedArchivedDealId] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(false)

  React.useEffect(() => {
    if (client) {
      setQuoteValue(client.quote_value ? String(client.quote_value) : '')
      setProductInterest(client.product_interest || '')
      if (client.stage === 'Não fechou') {
        setResult('Venda perdida')
      } else {
        setResult(initialResult || 'Venda fechada')
      }
      setLossReason('')
      setCustomLossReason('')
      setFinalNotes('')
      setCreateProductionOrder(true)
    }
  }, [client, initialResult, isOpen])

  if (!client) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (result === 'Venda perdida' && !lossReason && !customLossReason.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Por favor, informe o motivo da perda da venda.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const selectedReason =
        lossReason === 'Outro motivo'
          ? customLossReason.trim()
          : lossReason || customLossReason.trim()

      const archived = await dealsService.completeAndArchive({
        clientId: client.id,
        attendanceId: attendanceId || client.attendance_id,
        result,
        lossReason: result === 'Venda perdida' ? selectedReason : undefined,
        quoteValue: quoteValue ? Number(quoteValue) : undefined,
        productInterest: productInterest.trim() || undefined,
        finalNotes: finalNotes.trim() || undefined,
      })
      setCreatedArchivedDealId(archived.id)

      toast({
        title:
          result === 'Venda fechada'
            ? '🎉 Venda Concluída & Arquivada!'
            : 'Atendimento Encerrado & Arquivado',
        description: `O atendimento de "${client.name}" foi arquivado no CRM com dados preservados.`,
      })

      if (result === 'Venda fechada' && createProductionOrder) {
        // Open Production Order Modal with prefilled data
        setProductionModalOpen(true)
      } else {
        if (onSuccess) onSuccess()
        onClose()
      }
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
    } catch (err: any) {
      console.error(
        'Error in completeAndArchive modal:',
        {
          message: err?.message,
          status: err?.status,
          url: err?.url,
          data: err?.data || err?.response?.data,
          response: err?.response,
        },
        err,
      )
      const fieldErrors = err?.response?.data || err?.data
      let detailedMsg = err?.message || 'Não foi possível concluir o atendimento.'
      if (fieldErrors && typeof fieldErrors === 'object') {
        const details = Object.entries(fieldErrors)
          .map(([k, v]: [string, any]) => `${k}: ${v?.message || JSON.stringify(v)}`)
          .join(', ')
        if (details) detailedMsg = `${detailedMsg} (${details})`
      }
      toast({
        title: 'Erro ao arquivar',
        description: detailedMsg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent zIndexClass={zIndexClass} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-base">
              <Archive className="h-5 w-5 text-emerald-600" />
              Concluir e Arquivar Atendimento
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ao concluir, o card sairá do Kanban ativo e será movido para os Atendimentos
              Arquivados. Todo o histórico, mensagens e dados do cliente serão preservados no
              cadastro.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Client Summary Box */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {client.name}
                </span>
                <span className="text-slate-500 font-mono">{client.phone}</span>
              </div>
              {client.product_interest && (
                <p className="text-slate-500 line-clamp-1">{client.product_interest}</p>
              )}
            </div>

            {/* Outcome Choice: Venda Fechada vs Venda Perdida */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Resultado Final do Atendimento *
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setResult('Venda fechada')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                    result === 'Venda fechada'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Venda Fechada
                </button>

                <button
                  type="button"
                  onClick={() => setResult('Venda perdida')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                    result === 'Venda perdida'
                      ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <XCircle className="h-4 w-4 text-rose-600" />
                  Venda Perdida
                </button>
              </div>
            </div>

            {/* If Venda Perdida: Reason Select */}
            {result === 'Venda perdida' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60">
                <div>
                  <label className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                    Motivo da Perda *
                  </label>
                  <Select value={lossReason} onValueChange={setLossReason}>
                    <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Selecione o motivo principal..." />
                    </SelectTrigger>
                    <SelectContent className={zIndexClass === 'z-[80]' ? 'z-[90]' : undefined}>
                      {LOSS_REASON_PRESETS.map((preset) => (
                        <SelectItem key={preset} value={preset}>
                          {preset}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {lossReason === 'Outro motivo' && (
                  <div>
                    <label className="text-xs font-medium text-rose-900 dark:text-rose-200">
                      Especifique o motivo
                    </label>
                    <Input
                      value={customLossReason}
                      onChange={(e) => setCustomLossReason(e.target.value)}
                      placeholder="Descreva o motivo da perda..."
                      className="mt-1 text-xs bg-white dark:bg-slate-900"
                      required
                    />
                  </div>
                )}
              </div>
            )}

            {/* Product and Value */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Produto / Serviço
                </label>
                <Input
                  value={productInterest}
                  onChange={(e) => setProductInterest(e.target.value)}
                  placeholder="Ex: 1000 Panfletos"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Valor Final (R$)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quoteValue}
                  onChange={(e) => setQuoteValue(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 text-xs font-bold"
                />
              </div>
            </div>

            {/* Final Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Observações Finais de Encerramento (opcional)
              </label>
              <Textarea
                value={finalNotes}
                onChange={(e) => setFinalNotes(e.target.value)}
                placeholder="Ex: Pedido pago via PIX, enviado para fila de corte e refile."
                rows={2}
                className="mt-1 text-xs resize-none"
              />
            </div>

            {/* Create Production Order Option for Won Deals */}
            {result === 'Venda fechada' && (
              <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="createProductionOrderCheck"
                  checked={createProductionOrder}
                  onChange={(e) => setCreateProductionOrder(e.target.checked)}
                  className="mt-1 h-4 w-4 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                />
                <label htmlFor="createProductionOrderCheck" className="text-xs cursor-pointer">
                  <span className="font-bold text-emerald-950 dark:text-emerald-100 flex items-center gap-1">
                    <Package className="h-3.5 w-3.5 text-emerald-600" />
                    Criar Pedido de Produção imediatamente
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-300 text-[11px] block mt-0.5">
                    Abre o modal de produção com dados pré-preenchidos (cliente, produto, valores)
                    para gerar a ordem de serviço na esteira de produção.
                  </span>
                </label>
              </div>
            )}

            <DialogFooter className="pt-2 flex flex-row items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className={
                  result === 'Venda fechada'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold'
                    : 'bg-rose-600 hover:bg-rose-700 text-white font-semibold'
                }
              >
                {loading
                  ? 'Concluindo...'
                  : result === 'Venda fechada'
                    ? 'Concluir Venda & Arquivar'
                    : 'Arquivar como Não Fechou'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Production Order Modal triggered after winning deal */}
      <ProductionOrderModal
        isOpen={productionModalOpen}
        zIndexClass={zIndexClass}
        onClose={() => {
          setProductionModalOpen(false)
          if (onSuccess) onSuccess()
          onClose()
        }}
        onSaved={() => {
          setProductionModalOpen(false)
          if (onSuccess) onSuccess()
          onClose()
          window.dispatchEvent(new CustomEvent('production-order-updated'))
        }}
        prefillData={{
          clientId: client?.id,
          clientName: client?.name,
          clientPhone: client?.phone,
          clientEmail: client?.email,
          dealOriginId: createdArchivedDealId,
          product: productInterest || client?.product_interest || '',
          quoteValue: quoteValue ? Number(quoteValue) : client?.quote_value,
          notes: finalNotes || client?.notes || '',
        }}
      />
    </>
  )
}
