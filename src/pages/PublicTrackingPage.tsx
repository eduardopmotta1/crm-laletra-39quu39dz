import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { productionService } from '@/services/production'
import type { ProductionOrder, ProductionStage, ProductionProof } from '@/types/crm'
import {
  Package,
  CheckCircle2,
  Clock,
  Truck,
  Sparkles,
  Phone,
  Calendar,
  Layers,
  ShieldCheck,
  FileCheck,
  AlertCircle,
  Building,
  Eye,
  Download,
  FileText,
  File,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatDateTime } from '@/lib/sla'

export default function PublicTrackingPage() {
  const { token } = useParams<{ token: string }>()
  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [stages, setStages] = useState<ProductionStage[]>([])
  const [proofs, setProofs] = useState<ProductionProof[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isNetworkError, setIsNetworkError] = useState(false)

  // Decision Modal States
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [isChangeDialogOpen, setIsChangeDialogOpen] = useState(false)
  const [selectedProof, setSelectedProof] = useState<ProductionProof | null>(null)
  const [changeComment, setChangeComment] = useState('')
  const [submittingDecision, setSubmittingDecision] = useState(false)
  const [decisionFeedback, setDecisionFeedback] = useState<{
    type: 'approved' | 'changes_requested'
    message: string
  } | null>(null)

  const loadTrackingData = async (trackingToken: string) => {
    try {
      setIsNetworkError(false)
      const data = await productionService.getPublicTracking(trackingToken)
      if (!data || !data.order) {
        setError('Pedido não localizado para este link de acompanhamento.')
        return
      }

      setOrder(data.order as unknown as ProductionOrder)
      if (data.stages && Array.isArray(data.stages)) {
        setStages(data.stages as unknown as ProductionStage[])
      }
      if (data.proofs && Array.isArray(data.proofs)) {
        setProofs(data.proofs as unknown as ProductionProof[])
      }
      setError(null)
    } catch (err: any) {
      console.error('Erro ao consultar acompanhamento público:', err)
      const status = err?.status || err?.statusCode || err?.response?.status
      if (status === 404) {
        setError('Pedido não localizado para este link de acompanhamento.')
        setIsNetworkError(false)
      } else {
        setIsNetworkError(true)
        setError('Não foi possível carregar o acompanhamento. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) {
      setError('Token de acompanhamento inválido ou não informado.')
      setIsNetworkError(false)
      setLoading(false)
      return
    }

    setLoading(true)
    loadTrackingData(token)
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mb-4" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
          Carregando status do seu pedido na Gráfica Laletra...
        </p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <div
            className={`h-16 w-16 ${
              isNetworkError
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
            } rounded-full flex items-center justify-center mx-auto`}
          >
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isNetworkError ? 'Erro ao carregar acompanhamento' : 'Pedido não localizado'}
          </h2>
          <p className="text-sm text-slate-500">
            {error || 'Não encontramos nenhum pedido associado a este link de acompanhamento.'}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            {isNetworkError && token && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoading(true)
                  loadTrackingData(token)
                }}
                className="inline-flex items-center justify-center gap-2"
              >
                Tentar novamente
              </Button>
            )}
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md transition-all"
            >
              <Phone className="h-4 w-4" />
              Falar com Atendimento Laletra
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Find current stage index in pipeline
  const currentStageIndex = stages.findIndex((st) => st.internal_id === order.stage_internal_id)

  // Determine latest proof awaiting decision
  // Chronological sort: proofs are sorted by 'created' or version_number
  const sortedProofs = [...proofs].sort((a, b) => (a.version_number || 0) - (b.version_number || 0))
  const latestProof = sortedProofs.length > 0 ? sortedProofs[sortedProofs.length - 1] : null

  // Condition to display decision buttons:
  // - pedido.requires_art_approval = true
  // - pedido.art_approved != true
  // - etapa atual compatível com awaiting_approval (ou stage_internal_id === 'awaiting_approval' ou 'art_preparation')
  // - existe proof aguardando decisão E essa proof é a mais recente
  const canDecideArt =
    Boolean(order.requires_art_approval) &&
    !order.art_approved &&
    latestProof?.status === 'aguardando_aprovacao' &&
    (order.stage_internal_id === 'awaiting_approval' ||
      order.stage_internal_id === 'art_preparation')

  const handleOpenApproveModal = (proof: ProductionProof) => {
    setSelectedProof(proof)
    setIsApproveDialogOpen(true)
  }

  const handleOpenChangeModal = (proof: ProductionProof) => {
    setSelectedProof(proof)
    setChangeComment('')
    setIsChangeDialogOpen(true)
  }

  const handleConfirmApproval = async () => {
    if (!token || !selectedProof || submittingDecision) return
    setSubmittingDecision(true)
    try {
      const res = await productionService.submitPublicProofDecision(token, {
        proofId: selectedProof.id,
        decision: 'approved',
      })

      // Update state locally
      setDecisionFeedback({
        type: 'approved',
        message: '✅ Arte aprovada com sucesso! Seu pedido seguirá para a próxima etapa.',
      })

      setOrder((prev) =>
        prev
          ? {
              ...prev,
              art_approved: true,
              art_approved_at: new Date().toISOString().split('T')[0],
              approved_proof_id: selectedProof.id,
              stage_internal_id: 'approved',
              stage_name: res.stage_name || 'Aprovado',
            }
          : prev,
      )

      setProofs((prev) =>
        prev.map((p) =>
          p.id === selectedProof.id
            ? {
                ...p,
                status: 'aprovado',
                approved_at: new Date().toISOString().split('T')[0],
              }
            : p,
        ),
      )

      setIsApproveDialogOpen(false)
      // Recarregar os dados atualizados via endpoint público
      loadTrackingData(token)
    } catch (err: any) {
      alert(err?.message || 'Erro ao aprovar arte. Tente novamente.')
    } finally {
      setSubmittingDecision(false)
    }
  }

  const handleConfirmChangeRequest = async () => {
    if (!token || !selectedProof || submittingDecision) return
    if (!changeComment.trim()) {
      alert('Por favor, descreva o que precisa ser alterado na arte.')
      return
    }

    setSubmittingDecision(true)
    try {
      const res = await productionService.submitPublicProofDecision(token, {
        proofId: selectedProof.id,
        decision: 'changes_requested',
        comment: changeComment.trim(),
      })

      setDecisionFeedback({
        type: 'changes_requested',
        message:
          '✏️ Alteração solicitada! Nossa equipe recebeu sua solicitação e preparará uma nova versão.',
      })

      setOrder((prev) =>
        prev
          ? {
              ...prev,
              art_approved: false,
              approved_proof_id: '',
              stage_internal_id: 'art_preparation',
              stage_name: res.stage_name || 'Arte em preparação',
            }
          : prev,
      )

      setProofs((prev) =>
        prev.map((p) =>
          p.id === selectedProof.id
            ? {
                ...p,
                status: 'alteracao_solicitada',
                client_comment: changeComment.trim(),
              }
            : p,
        ),
      )

      setIsChangeDialogOpen(false)
      // Recarregar os dados atualizados via endpoint público
      loadTrackingData(token)
    } catch (err: any) {
      alert(err?.message || 'Erro ao solicitar alteração. Tente novamente.')
    } finally {
      setSubmittingDecision(false)
    }
  }

  const deliveryLabels: Record<string, string> = {
    retirada: '🏬 Retirada no Balcão da Gráfica',
    envio: '📦 Envio / Transportadora',
    entrega_propria: '🛵 Entrega Expressa',
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Navbar with Brand */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-4 px-6 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-600 text-white rounded-xl font-black text-lg">LA</div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white block">
                GRÁFICA LALETRA
              </span>
              <span className="text-[11px] text-slate-400">
                Portal de Acompanhamento de Produção
              </span>
            </div>
          </div>

          <Badge
            variant="outline"
            className="font-mono text-xs px-2.5 py-1 font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800"
          >
            Pedido {order.order_number}
          </Badge>
        </div>
      </header>

      {/* Main Tracking Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Hero Card: Order Status Summary */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-widest font-bold text-emerald-100 bg-emerald-800/60 px-3 py-1 rounded-full backdrop-blur-sm">
                Status Atual do Pedido
              </span>
              <span className="text-xs text-emerald-100 font-mono">{order.client_name}</span>
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{order.stage_name}</h1>
              <p className="text-sm text-emerald-100 max-w-xl">{order.product}</p>
            </div>

            {/* Estimated Deadline Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/15 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-emerald-200" />
                <div>
                  <span className="text-[10px] text-emerald-200 block">Previsão de Conclusão:</span>
                  <span className="text-sm font-bold">
                    {order.promised_deadline
                      ? new Date(order.promised_deadline).toLocaleDateString('pt-BR')
                      : 'Em programação'}
                  </span>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/15 flex items-center gap-3">
                <Truck className="h-5 w-5 text-emerald-200" />
                <div>
                  <span className="text-[10px] text-emerald-200 block">
                    Forma de Retirada / Envio:
                  </span>
                  <span className="text-sm font-bold truncate">
                    {deliveryLabels[order.delivery_type || 'retirada']}
                  </span>
                </div>
              </div>
            </div>

            {order.tracking_code && (
              <div className="p-3 bg-emerald-900/60 rounded-xl border border-emerald-400/30 text-xs flex items-center justify-between">
                <span>Código de rastreio de envio:</span>
                <span className="font-mono font-bold">{order.tracking_code}</span>
              </div>
            )}
          </div>
        </div>

        {/* Visual Timeline Stepper (✓ Concluído, ● Atual, ○ Futuro) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-600" />
              Linha do Tempo da Produção
            </h3>
            <p className="text-xs text-slate-500">
              Acompanhe passo a passo cada etapa do seu material gráfico em nossa gráfica.
            </p>
          </div>

          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {stages.map((stage, idx) => {
              const isPast = currentStageIndex > idx || order.is_completed
              const isCurrent = currentStageIndex === idx && !order.is_completed
              const isFuture = currentStageIndex < idx && !order.is_completed

              return (
                <div key={stage.id} className="relative flex items-start gap-4">
                  {/* Step Icon */}
                  <div
                    className={`absolute -left-[30px] sm:-left-[35px] top-0.5 h-7 w-7 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 transition-all ${
                      isPast
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                          ? 'bg-emerald-500 text-white animate-bounce'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isCurrent ? (
                      <div className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-slate-400" />
                    )}
                  </div>

                  {/* Step Description */}
                  <div
                    className={`p-4 rounded-2xl border transition-all w-full ${
                      isCurrent
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 ring-1 ring-emerald-500/20'
                        : isPast
                          ? 'bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800'
                          : 'bg-slate-50/50 dark:bg-slate-900/20 border-slate-100 dark:border-slate-800/40 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-bold text-sm ${
                          isCurrent
                            ? 'text-emerald-800 dark:text-emerald-300'
                            : isPast
                              ? 'text-slate-800 dark:text-slate-200'
                              : 'text-slate-400'
                        }`}
                      >
                        {stage.name}
                      </span>
                      {isCurrent && (
                        <Badge className="bg-emerald-600 text-white text-[10px] font-bold uppercase">
                          Etapa Atual
                        </Badge>
                      )}
                      {isPast && (
                        <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                          ✓ Concluído
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {stage.description || 'Processamento da ordem de produção'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Digital Proof section if awaiting approval or approved */}
        {proofs.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-purple-600" />
                Provas Digitais & Mockups da Arte
              </h3>
              {order.art_approved && (
                <Badge className="bg-emerald-600 text-white font-bold text-xs py-1 px-3">
                  ✓ Arte aprovada para produção
                </Badge>
              )}
            </div>

            {/* Instant feedback notification after client decision */}
            {decisionFeedback && (
              <div
                className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between ${
                  decisionFeedback.type === 'approved'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800'
                }`}
              >
                <span>{decisionFeedback.message}</span>
              </div>
            )}

            <div className="space-y-4">
              {sortedProofs.map((prf) => {
                const isLatest = latestProof?.id === prf.id
                const isAwaiting = prf.status === 'aguardando_aprovacao'
                const isThisProofApproved = prf.status === 'aprovado'
                const isChangesRequested = prf.status === 'alteracao_solicitada'

                // Buttons are shown only on the latest proof when it's awaiting approval and the order requires art approval and is not approved yet
                const showActionButtons =
                  canDecideArt && isLatest && isAwaiting && !decisionFeedback

                return (
                  <div
                    key={prf.id}
                    className={`p-5 rounded-2xl border transition-all text-xs space-y-3 ${
                      isLatest && isAwaiting && canDecideArt
                        ? 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-300 dark:border-purple-800 shadow-sm ring-1 ring-purple-500/20'
                        : isThisProofApproved
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900'
                          : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                          Versão #{prf.version_number || 1}
                        </span>
                        {isLatest && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold border-purple-300 text-purple-700 dark:text-purple-300"
                          >
                            Mais recente
                          </Badge>
                        )}
                      </div>

                      <Badge
                        variant="outline"
                        className={`text-[11px] font-bold px-2.5 py-0.5 ${
                          isThisProofApproved
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                            : isChangesRequested
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300'
                        }`}
                      >
                        {isThisProofApproved
                          ? '✓ Arte Aprovada'
                          : isChangesRequested
                            ? '✏️ Alteração solicitada'
                            : '⏳ Aguardando sua aprovação'}
                      </Badge>
                    </div>

                    {prf.feedback_notes && (
                      <p className="text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-800/70 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                        <strong className="text-slate-800 dark:text-slate-200 block text-[11px] mb-0.5">
                          Instruções / Notas da Gráfica:
                        </strong>
                        {prf.feedback_notes}
                      </p>
                    )}

                    {prf.client_comment && (
                      <p className="text-slate-700 dark:text-slate-300 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900">
                        <strong className="text-amber-900 dark:text-amber-200 block text-[11px] mb-0.5">
                          Retorno do Cliente:
                        </strong>
                        {prf.client_comment}
                      </p>
                    )}

                    {prf.proof_url && (
                      <a
                        href={prf.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-purple-700 dark:text-purple-300 hover:underline pt-1 text-xs"
                      >
                        Abrir Layout / Prova Digital em Alta Resolução ↗
                      </a>
                    )}

                    {/* Proof Files in Public Tracking */}
                    {(() => {
                      // Obter lista normalizada de arquivos usando files[] retornado pelo endpoint público
                      const rawProofFiles = (
                        Array.isArray(prf.proof_file) ? prf.proof_file : [prf.proof_file]
                      ).filter(Boolean) as string[]

                      const attachedFiles: Array<{ name: string; url?: string }> =
                        Array.isArray((prf as any).files) && (prf as any).files.length > 0
                          ? (prf as any).files
                          : rawProofFiles.map((fn) => ({ name: fn, url: '' }))

                      if (attachedFiles.length === 0) return null

                      return (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300 block">
                            Arquivos Anexos da Prova:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {attachedFiles.map((fileItem, pIdx) => {
                              const pFileName = fileItem.name || `arquivo_${pIdx + 1}`
                              const pFileUrl = fileItem.url?.trim() || ''
                              const hasValidUrl =
                                Boolean(pFileUrl) && !pFileUrl.startsWith('/api/files/')
                              const pExt = pFileName.split('.').pop()?.toLowerCase() || ''
                              const pIsImage = [
                                'png',
                                'jpg',
                                'jpeg',
                                'webp',
                                'gif',
                                'svg',
                              ].includes(pExt)
                              const pIsPdf = pExt === 'pdf'

                              return (
                                <div
                                  key={pIdx}
                                  className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900 flex items-center justify-between gap-2 shadow-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {hasValidUrl && pIsImage ? (
                                      <div className="h-9 w-9 rounded-lg border bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                        <img
                                          src={pFileUrl}
                                          alt={pFileName}
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                        />
                                      </div>
                                    ) : (
                                      <div
                                        className={`h-9 w-9 rounded-lg flex flex-col items-center justify-center shrink-0 border ${
                                          !hasValidUrl
                                            ? 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                                            : pIsPdf
                                              ? 'bg-rose-50 border-rose-200 text-rose-600'
                                              : 'bg-purple-50 border-purple-200 text-purple-600'
                                        }`}
                                      >
                                        {pIsPdf ? (
                                          <FileText className="h-4 w-4" />
                                        ) : (
                                          <File className="h-4 w-4" />
                                        )}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <span
                                        className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px] block"
                                        title={pFileName}
                                      >
                                        {pFileName}
                                      </span>
                                      {!hasValidUrl && (
                                        <span className="text-[10px] text-slate-400 block">
                                          Arquivo indisponível no momento
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {hasValidUrl ? (
                                      <>
                                        <a
                                          href={pFileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 text-slate-600 hover:text-purple-600 transition-colors"
                                          title="Visualizar"
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                        </a>
                                        <a
                                          href={`${pFileUrl}?download=1`}
                                          download
                                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 text-slate-600 hover:text-purple-600 transition-colors"
                                          title="Baixar"
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                        </a>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 italic px-2">
                                        Indisponível
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                    {/* DECISION BUTTONS: ONLY on latest proof awaiting decision */}
                    {showActionButtons && (
                      <div className="pt-3 border-t border-purple-200/80 dark:border-purple-900/80 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleOpenChangeModal(prf)}
                          disabled={submittingDecision}
                          className="w-full sm:w-auto text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-xs font-semibold"
                        >
                          Solicitar alteração
                        </Button>
                        <Button
                          type="button"
                          onClick={() => handleOpenApproveModal(prf)}
                          disabled={submittingDecision}
                          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          Aprovar arte
                        </Button>
                      </div>
                    )}

                    {/* Read-only indicators when not awaiting or when already decided */}
                    {!showActionButtons && (
                      <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-between">
                        {isThisProofApproved ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Arte aprovada
                            {prf.approved_at
                              ? ` em ${new Date(prf.approved_at).toLocaleDateString('pt-BR')}`
                              : ''}
                          </span>
                        ) : isChangesRequested ? (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Alteração solicitada — aguardando nova versão da equipe
                          </span>
                        ) : !isLatest ? (
                          <span className="text-slate-400">
                            Versão anterior arquivada no histórico.
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Modal: Confirmar Aprovação de Arte */}
        <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-base">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Confirmar aprovação desta arte?
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 dark:text-slate-400 pt-2 space-y-2">
                <span className="block font-semibold text-slate-900 dark:text-white">
                  Versão #{selectedProof?.version_number || 1}
                </span>
                <span className="block p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs">
                  ⚠️ <strong>Aviso importante:</strong> Ao aprovar, esta versão será considerada a
                  arte oficial para produção. Verifique textos, ortografia, telefones e dimensões
                  antes de confirmar.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-3 flex flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsApproveDialogOpen(false)}
                disabled={submittingDecision}
              >
                Voltar e revisar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmApproval}
                disabled={submittingDecision}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {submittingDecision ? 'Aprovando...' : 'Sim, aprovar esta arte'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Solicitar Alteração na Arte */}
        <Dialog open={isChangeDialogOpen} onOpenChange={setIsChangeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-base">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Solicitar alteração na arte
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Informe o que nossa equipe precisa ajustar para preparar a próxima versão.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Descreva o que precisa ser alterado *
              </label>
              <Textarea
                value={changeComment}
                onChange={(e) => setChangeComment(e.target.value)}
                placeholder="Ex: Corrigir o telefone para (11) 98888-7777 e clarear um pouco o fundo..."
                rows={4}
                className="text-xs resize-none"
              />
              <p className="text-[11px] text-slate-400">
                Campo obrigatório. Seja o mais específico possível para agilizar seu ajuste.
              </p>
            </div>

            <DialogFooter className="pt-3 flex flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsChangeDialogOpen(false)}
                disabled={submittingDecision}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmChangeRequest}
                disabled={submittingDecision || !changeComment.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                {submittingDecision ? 'Enviando...' : 'Enviar solicitação de alteração'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Need Help Footer */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <h4 className="font-bold text-sm text-slate-900 dark:text-white">
            Dúvidas sobre o seu pedido?
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Nossa equipe de atendimento da Gráfica Laletra está à disposição para ajudar com seu
            prazo ou especificações.
          </p>
          <a
            href="https://wa.me/5511999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition-all"
          >
            <Phone className="h-3.5 w-3.5" />
            Falar pelo WhatsApp da Laletra
          </a>
        </div>
      </main>
    </div>
  )
}
