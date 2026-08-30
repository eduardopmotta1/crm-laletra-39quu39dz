import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Edit3,
  Calendar,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  Send,
  Loader2,
  Check,
} from 'lucide-react'
import { quotesService } from '@/services/quotes'
import type { PublicQuoteData } from '@/types/quotes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<PublicQuoteData | null>(null)

  // Dialog states
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [showChangeModal, setShowChangeModal] = useState(false)
  const [changeNotes, setChangeNotes] = useState('')
  const [changeNotesError, setChangeNotesError] = useState<string | null>(null)

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectNotes, setRejectNotes] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)

  // Action states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadQuote() {
      if (!token) {
        setError('Token de orçamento não fornecido.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const data = await quotesService.getByPublicToken(token)
        setQuote(data)
      } catch (err: any) {
        console.error('Error loading public quote:', err)
        setError(err?.message || 'Orçamento não encontrado ou link expirado.')
      } finally {
        setLoading(false)
      }
    }

    loadQuote()
  }, [token])

  const handleApprove = async () => {
    if (!token || !quote) return

    // Idempotência no frontend: Se já estiver aprovado, não reenvia
    if (quote.status === 'aprovado') {
      setShowApproveConfirm(false)
      return
    }

    try {
      setIsSubmitting(true)
      const res = await quotesService.approvePublicQuote(token)
      setQuote((prev) =>
        prev
          ? {
              ...prev,
              status: 'aprovado',
              approved_at: res.approved_at || new Date().toISOString(),
            }
          : null,
      )
      setShowApproveConfirm(false)
      setActionSuccessMessage(res.message || 'Orçamento aprovado com sucesso!')
    } catch (err: any) {
      alert(err?.message || 'Falha ao aprovar orçamento. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRequestChange = async () => {
    if (!token || !quote) return

    const trimmed = changeNotes.trim()
    if (!trimmed) {
      setChangeNotesError('Por favor, descreva as alterações que deseja.')
      return
    }

    try {
      setIsSubmitting(true)
      setChangeNotesError(null)
      const res = await quotesService.requestChangePublicQuote(token, trimmed)
      setQuote((prev) =>
        prev
          ? {
              ...prev,
              status: 'alteracao_solicitada',
              customer_notes: trimmed,
            }
          : null,
      )
      setShowChangeModal(false)
      setActionSuccessMessage(
        'Sua solicitação de alteração foi enviada para o atendente com sucesso!',
      )
    } catch (err: any) {
      setChangeNotesError(err?.message || 'Falha ao enviar solicitação de alteração.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!token || !quote) return

    if (!rejectReason) {
      setRejectError('Por favor, selecione um motivo para a recusa.')
      return
    }

    if (rejectReason === 'Outro' && !rejectNotes.trim()) {
      setRejectError('Por favor, informe o comentário detalhando o motivo da recusa.')
      return
    }

    try {
      setIsSubmitting(true)
      setRejectError(null)
      const res = await quotesService.rejectPublicQuote(
        token,
        rejectReason,
        rejectNotes.trim() || undefined,
      )
      setQuote((prev) =>
        prev
          ? {
              ...prev,
              status: 'recusado',
              rejected_at: res.rejected_at || new Date().toISOString(),
              customer_notes: rejectNotes.trim() || prev.customer_notes,
            }
          : null,
      )
      setShowRejectModal(false)
      setActionSuccessMessage(res.message || 'Orçamento recusado com sucesso.')
    } catch (err: any) {
      setRejectError(err?.message || 'Falha ao registrar recusa do orçamento.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCurrency = (val?: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch (_) {
      return dateStr
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aprovado':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 px-3 py-1 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" /> Aprovado
          </Badge>
        )
      case 'alteracao_solicitada':
        return (
          <Badge className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 px-3 py-1 text-sm font-medium">
            <Edit3 className="w-4 h-4" /> Alteração Solicitada
          </Badge>
        )
      case 'recusado':
        return (
          <Badge className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5 px-3 py-1 text-sm font-medium">
            <AlertCircle className="w-4 h-4" /> Recusado
          </Badge>
        )
      case 'expirado':
        return (
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
            <Clock className="w-4 h-4" /> Expirado
          </Badge>
        )
      default:
        return (
          <Badge className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 px-3 py-1 text-sm font-medium">
            <Clock className="w-4 h-4" /> Aguardando Decisão
          </Badge>
        )
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">Carregando orçamento...</p>
        </div>
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-lg border-slate-200 dark:border-slate-800">
          <CardHeader>
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 rounded-full flex items-center justify-center mx-auto mb-2 text-rose-600">
              <AlertCircle className="w-8 h-8" />
            </div>
            <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Orçamento não encontrado
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400 mt-2">
              {error ||
                'O link pode estar incorreto, cancelado ou expirado. Por favor, solicite um novo link ao atendente.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Ambiente Seguro • Laletra Gráfica
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isActionable = quote.status === 'enviado'

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header da Gráfica */}
        <header className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-2xl tracking-tighter shadow-inner">
              L
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Gráfica Laletra
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Orçamento de Serviços e Produtos Personalizados
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Status
            </span>
            <div className="mt-1">{getStatusBadge(quote.status)}</div>
          </div>
        </header>

        {/* Notificações e banners de feedback */}
        {actionSuccessMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-4 rounded-xl flex items-start gap-3 shadow-sm animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">{actionSuccessMessage}</p>
              <p className="text-xs opacity-90 mt-0.5">
                Nossa equipe já foi notificada e dará o devido prosseguimento ao seu atendimento.
              </p>
            </div>
          </div>
        )}

        {quote.status === 'aprovado' && !actionSuccessMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-4 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Este orçamento já foi aprovado.</span>
              {quote.approved_at && (
                <span className="text-xs block mt-0.5 text-emerald-700 dark:text-emerald-400">
                  Aprovado em: {formatDate(quote.approved_at)}
                </span>
              )}
            </div>
          </div>
        )}

        {(quote.status === 'alteracao_solicitada' || quote.status === 'rascunho') &&
          !actionSuccessMessage && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-4 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Edit3 className="w-4 h-4 text-amber-600" />
                <span>Este orçamento está sendo atualizado. Aguarde o novo envio.</span>
              </div>
              {quote.customer_notes && (
                <div className="text-xs bg-white/70 dark:bg-slate-900/60 p-2.5 rounded border border-amber-200 dark:border-amber-900/60 text-slate-800 dark:text-slate-200">
                  <span className="font-semibold block text-slate-500 mb-0.5">
                    Observação da solicitação:
                  </span>
                  <p className="italic">"{quote.customer_notes}"</p>
                </div>
              )}
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Assim que a equipe finalizar e reenviar a proposta atualizada, você poderá aprovar
                diretamente por este mesmo link.
              </p>
            </div>
          )}

        {quote.status === 'recusado' && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 p-4 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Este orçamento consta como recusado.</span>
              <p className="text-xs mt-0.5 text-rose-700 dark:text-rose-400">
                Caso deseje retomar a proposta ou tirar dúvidas, favor entrar em contato com nossa
                equipe.
              </p>
            </div>
          </div>
        )}

        {/* Resumo do Orçamento / Cabeçalho de Dados */}
        <Card className="bg-white dark:bg-slate-900 shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Proposta Comercial
                </span>
                <CardTitle className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-primary" />
                  {quote.code}
                </CardTitle>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                Emitido em {formatDate(quote.created)}
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-slate-500 font-medium block">Cliente</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                {quote.client_name || 'Cliente'}
              </span>
            </div>
            {quote.valid_until && (
              <div>
                <span className="text-xs text-slate-500 font-medium block">
                  Validade da Proposta
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {formatDate(quote.valid_until)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Itens do Orçamento (Snapshot salvo) */}
        <Card className="bg-white dark:bg-slate-900 shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Itens da Proposta
            </CardTitle>
            <CardDescription className="text-xs">
              Especificações, medidas e acabamentos orçados para este pedido
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-2">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {quote.items && quote.items.length > 0 ? (
                quote.items.map((item, idx) => (
                  <div key={item.id || idx} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100">
                            {item.product_name}
                          </h3>
                        </div>

                        {item.material_name && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 pl-8">
                            Material / Papel:{' '}
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {item.material_name}
                            </span>
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400 pl-8 pt-0.5">
                          <span>
                            Quantidade: <strong>{item.quantity}</strong> {item.unit_measure || 'un'}
                          </span>
                          {item.width && item.height && (
                            <span>
                              Dimensões:{' '}
                              <strong>
                                {item.width} x {item.height} m
                              </strong>
                            </span>
                          )}
                          {item.unit_price > 0 && (
                            <span>
                              Valor unitário: <strong>{formatCurrency(item.unit_price)}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right sm:pl-4 pl-8">
                        <span className="text-xs text-slate-400 block sm:inline mr-1">
                          Subtotal
                        </span>
                        <span className="font-bold text-base text-slate-900 dark:text-slate-100">
                          {formatCurrency(item.total_sale)}
                        </span>
                      </div>
                    </div>

                    {/* Acabamentos / Adicionais */}
                    {item.additionals && item.additionals.length > 0 && (
                      <div className="pl-8 pt-1.5">
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 text-xs space-y-1.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                            Acabamentos / Serviços Inclusos:
                          </span>
                          {item.additionals.map((add, aIdx) => (
                            <div
                              key={aIdx}
                              className="flex items-center justify-between text-slate-600 dark:text-slate-400"
                            >
                              <span>
                                • {add.name} ({add.quantity}x)
                              </span>
                              <span>{formatCurrency(add.total_sale)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 py-4 text-center">
                  Nenhum item discriminado neste orçamento.
                </p>
              )}
            </div>

            {/* Observações públicas */}
            {quote.notes && (
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  Observações e Condições:
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {quote.notes}
                </p>
              </div>
            )}

            {/* Totalizador Financeiro */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col items-end space-y-1.5">
              {quote.discount_amount > 0 && (
                <div className="flex justify-between w-full max-w-xs text-sm text-slate-500">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(quote.total_sale)}</span>
                </div>
              )}
              {quote.discount_amount > 0 && (
                <div className="flex justify-between w-full max-w-xs text-sm text-emerald-600 dark:text-emerald-400">
                  <span>Desconto aplicado:</span>
                  <span>- {formatCurrency(quote.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline w-full max-w-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Valor Total:
                </span>
                <span className="text-2xl sm:text-3xl font-black text-primary">
                  {formatCurrency(quote.final_total || quote.total_sale)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação para o Cliente (Aprovar / Solicitar Alteração) */}
        {isActionable && (
          <Card className="bg-white dark:bg-slate-900 shadow-md border-primary/20">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    Deseja aprovar esta proposta?
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Você pode aprovar imediatamente ou solicitar alterações para nossa equipe.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRejectReason('')
                      setRejectNotes('')
                      setRejectError(null)
                      setShowRejectModal(true)
                    }}
                    className="border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 w-full sm:w-auto gap-1.5"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Recusar
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setChangeNotes('')
                      setChangeNotesError(null)
                      setShowChangeModal(true)
                    }}
                    className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 w-full sm:w-auto gap-2"
                  >
                    <Edit3 className="w-4 h-4 text-amber-600" />
                    Solicitar alteração
                  </Button>

                  <Button
                    onClick={() => setShowApproveConfirm(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow font-semibold w-full sm:w-auto gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Aprovar orçamento
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rodapé institucional seguro */}
        <footer className="text-center py-4 text-xs text-slate-400 space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Página de aprovação segura • Laletra Gráfica e Comunicação Visual</span>
          </div>
          <p>
            Em caso de dúvidas, responda diretamente à mensagem do WhatsApp ou entre em contato com
            nosso atendimento.
          </p>
        </footer>
      </div>

      {/* Modal de Confirmação de Aprovação */}
      <Dialog open={showApproveConfirm} onOpenChange={setShowApproveConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 rounded-full flex items-center justify-center text-emerald-600 mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold">
              Confirma a aprovação do orçamento {quote.code}?
            </DialogTitle>
            <DialogDescription className="text-sm pt-1">
              Ao confirmar, você autoriza a execução dos itens discriminados no valor total de{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {formatCurrency(quote.final_total || quote.total_sale)}
              </strong>
              . Nosso time dará sequência imediata.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowApproveConfirm(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Aprovando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Sim, confirmar aprovação
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Solicitação de Alteração */}
      <Dialog open={showChangeModal} onOpenChange={setShowChangeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/50 rounded-full flex items-center justify-center text-amber-600 mb-2">
              <Edit3 className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold">Solicitar Alteração</DialogTitle>
            <DialogDescription className="text-sm pt-1">
              Informe as alterações desejadas no orçamento <strong>{quote.code}</strong> (medidas,
              materiais, quantidades ou itens).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="change-notes"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Conte o que gostaria de alterar: <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                id="change-notes"
                rows={4}
                placeholder="Ex.: Gostaria de aumentar a quantidade para 2000 unidades e verificar o prazo de entrega..."
                value={changeNotes}
                onChange={(e) => {
                  setChangeNotes(e.target.value)
                  if (changeNotesError) setChangeNotesError(null)
                }}
                className={changeNotesError ? 'border-rose-500' : ''}
              />
              {changeNotesError && (
                <p className="text-xs text-rose-600 font-medium">{changeNotesError}</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowChangeModal(false)}
              disabled={isSubmitting}
            >
              Voltar
            </Button>
            <Button
              onClick={handleRequestChange}
              disabled={isSubmitting || !changeNotes.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar solicitação
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Recusa de Orçamento Pública */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/50 rounded-full flex items-center justify-center text-rose-600 mb-2">
              <AlertCircle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold">Recusar Orçamento {quote.code}</DialogTitle>
            <DialogDescription className="text-sm pt-1">
              Por favor, informe o motivo pelo qual você não dará sequência nesta proposta
              comercial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="public-reject-reason"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Motivo da recusa <span className="text-rose-500">*</span>
              </Label>
              <select
                id="public-reject-reason"
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value)
                  if (rejectError) setRejectError(null)
                }}
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="">Selecione o motivo...</option>
                <option value="Preço">Preço</option>
                <option value="Prazo">Prazo</option>
                <option value="Fechou com concorrente">Fechou com concorrente</option>
                <option value="Cliente desistiu">Cliente desistiu</option>
                <option value="Sem retorno / perdeu interesse">
                  Sem retorno / perdeu interesse
                </option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="public-reject-notes"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                {rejectReason === 'Outro' ? (
                  <>
                    Comentário / Detalhamento <span className="text-rose-500">*</span>
                  </>
                ) : (
                  'Comentário adicional (opcional)'
                )}
              </Label>
              <Textarea
                id="public-reject-notes"
                rows={3}
                placeholder={
                  rejectReason === 'Outro'
                    ? 'Descreva o motivo da recusa...'
                    : 'Gostaria de deixar alguma observação para a equipe?'
                }
                value={rejectNotes}
                onChange={(e) => {
                  setRejectNotes(e.target.value)
                  if (rejectError) setRejectError(null)
                }}
              />
            </div>

            {rejectError && <p className="text-xs text-rose-600 font-medium">{rejectError}</p>}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowRejectModal(false)}
              disabled={isSubmitting}
            >
              Voltar
            </Button>
            <Button
              onClick={handleReject}
              disabled={isSubmitting || !rejectReason}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-2 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recusando...
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Confirmar recusa
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
