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
import { CheckCircle2, RotateCcw, ShieldCheck, MessageSquare } from 'lucide-react'
import type { ProductionOrder, ProductionProof } from '@/types/crm'
import { productionService } from '@/services/production'
import { toast } from '@/hooks/use-toast'

interface ProofApprovalModalProps {
  isOpen: boolean
  onClose: () => void
  order: ProductionOrder | null
  onSuccess: () => void
}

export default function ProofApprovalModal({
  isOpen,
  onClose,
  order,
  onSuccess,
}: ProofApprovalModalProps) {
  const [decision, setDecision] = useState<'aprovado' | 'alteracao_solicitada'>('aprovado')
  const [comment, setComment] = useState('')
  const [approvedByContact, setApprovedByContact] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeProof, setActiveProof] = useState<ProductionProof | null>(null)

  React.useEffect(() => {
    if (order && isOpen) {
      setDecision('aprovado')
      setComment('')
      setApprovedByContact(order.client_name || '')
      productionService.getProofs(order.id).then((list) => {
        if (list.length > 0) {
          setActiveProof(list[0])
        } else {
          setActiveProof(null)
        }
      })
    }
  }, [order, isOpen])

  if (!order) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (decision === 'alteracao_solicitada' && !comment.trim()) {
      toast({
        title: 'Comentário obrigatório',
        description: 'Informe quais alterações o cliente solicitou na arte.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      if (activeProof) {
        await productionService.recordProofDecision(
          activeProof.id,
          order.id,
          decision,
          comment.trim() || undefined,
          approvedByContact.trim() || undefined,
        )
      } else {
        // Direct order approval without previous proof record
        if (decision === 'aprovado') {
          await productionService.updateStage(order.id, 'approved', {
            notes: `Arte aprovada diretamente. Contato: ${approvedByContact || order.client_name}. Comentário: ${comment || 'OK'}`,
          })
        } else {
          await productionService.updateStage(order.id, 'art_preparation', {
            notes: `Alteração de arte solicitada: "${comment}". Retornado para Arte em preparação.`,
          })
        }
      }

      toast({
        title:
          decision === 'aprovado' ? '🎉 Arte Aprovada com Sucesso!' : '⚠️ Alteração Registrada!',
        description:
          decision === 'aprovado'
            ? `Pedido ${order.order_number} movido para "Aprovado" e pronto para impressão.`
            : `Pedido ${order.order_number} retornado para "Arte em preparação".`,
      })

      onSuccess()
      onClose()
      window.dispatchEvent(new CustomEvent('production-order-updated'))
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar decisão',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-base">
            <ShieldCheck className="h-5 w-5 text-purple-600" />
            Decisão de Aprovação de Arte — {order.order_number}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Registre formalmente se o cliente aprovou o layout final ou se solicitou ajustes na
            arte.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Order info summary */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
            <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
              <span>{order.product}</span>
              <span className="font-mono">{order.client_name}</span>
            </div>
            {activeProof?.proof_url && (
              <a
                href={activeProof.proof_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline block text-[11px]"
              >
                Visualizar Prova Digital Enviada ↗
              </a>
            )}
          </div>

          {/* Decision choice */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Resultado da Validação do Cliente *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDecision('aprovado')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all ${
                  decision === 'aprovado'
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Arte Aprovada
              </button>

              <button
                type="button"
                onClick={() => setDecision('alteracao_solicitada')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all ${
                  decision === 'alteracao_solicitada'
                    ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <RotateCcw className="h-5 w-5 text-amber-600" />
                Pedir Alteração
              </button>
            </div>
          </div>

          {/* Contact Person Name */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nome de quem deu o retorno / contato
            </label>
            <Input
              value={approvedByContact}
              onChange={(e) => setApprovedByContact(e.target.value)}
              placeholder="Ex: Carlos (Proprietário)"
              className="mt-1 text-xs"
            />
          </div>

          {/* Comments */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {decision === 'aprovado'
                ? 'Observações de Aprovação (opcional)'
                : 'Ajustes Solicitados pelo Cliente *'}
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                decision === 'aprovado'
                  ? 'Ex: Cliente aprovou via WhatsApp às 14h sem ressalvas.'
                  : 'Ex: Trocar o logo pelo vetor em anexo e aumentar o tamanho do telefone.'
              }
              rows={3}
              required={decision === 'alteracao_solicitada'}
              className="mt-1 text-xs resize-none"
            />
          </div>

          <DialogFooter className="pt-2 flex flex-row items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className={
                decision === 'aprovado'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold'
                  : 'bg-amber-600 hover:bg-amber-700 text-white font-semibold'
              }
            >
              {loading
                ? 'Gravando...'
                : decision === 'aprovado'
                  ? 'Confirmar Aprovação'
                  : 'Retornar para Ajustes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
