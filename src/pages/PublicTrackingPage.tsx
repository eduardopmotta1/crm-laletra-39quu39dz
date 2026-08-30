import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { productionService } from '@/services/production'
import { productionStagesService } from '@/services/productionStages'
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
import { formatCurrency, formatDateTime } from '@/lib/sla'

export default function PublicTrackingPage() {
  const { token } = useParams<{ token: string }>()
  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [stages, setStages] = useState<ProductionStage[]>([])
  const [proofs, setProofs] = useState<ProductionProof[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Token de acompanhamento inválido ou não informado.')
      setLoading(false)
      return
    }

    Promise.all([productionService.getByTrackingToken(token), productionStagesService.getVisible()])
      .then(async ([foundOrder, stageList]) => {
        if (!foundOrder) {
          setError('Pedido não encontrado ou link expirado.')
          return
        }
        setOrder(foundOrder)
        setStages(stageList)

        // If proof exists, load proofs
        try {
          const proofList = await productionService.getProofs(foundOrder.id)
          setProofs(proofList)
        } catch {
          // ignore
        }
      })
      .catch((err) => {
        console.error('Error fetching public order tracking:', err)
        setError('Erro ao carregar dados do pedido.')
      })
      .finally(() => {
        setLoading(false)
      })
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
          <div className="h-16 w-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Pedido Não Localizado
          </h2>
          <p className="text-sm text-slate-500">
            {error || 'Não encontramos nenhum pedido associado a este código de rastreamento.'}
          </p>
          <div className="pt-2">
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
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-purple-600" />
              Provas Digitais & Mockups da Arte
            </h3>
            <div className="space-y-3">
              {proofs.map((prf) => (
                <div
                  key={prf.id}
                  className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-950 dark:text-purple-200">
                      Versão #{prf.version_number || 1}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-white dark:bg-slate-900 text-purple-800 border-purple-300"
                    >
                      {prf.status === 'aprovado'
                        ? '✓ Aprovado'
                        : prf.status === 'alteracao_solicitada'
                          ? '⚠️ Ajustes solicitados'
                          : '⏳ Em conferência'}
                    </Badge>
                  </div>
                  {prf.feedback_notes && <p className="text-slate-600">{prf.feedback_notes}</p>}
                  {prf.proof_url && (
                    <a
                      href={prf.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-purple-700 dark:text-purple-300 underline pt-1"
                    >
                      Abrir Layout / Prova Digital em Alta Resolução ↗
                    </a>
                  )}

                  {/* Proof Files in Public Tracking */}
                  {prf.proof_file &&
                    (Array.isArray(prf.proof_file) ? prf.proof_file : [prf.proof_file]).filter(
                      Boolean,
                    ).length > 0 && (
                      <div className="space-y-1.5 pt-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300 block">
                          Arquivos Anexos da Prova:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(Array.isArray(prf.proof_file) ? prf.proof_file : [prf.proof_file])
                            .filter(Boolean)
                            .map((pFileName, pIdx) => {
                              const pFileUrl = productionService.getProofFileUrl(prf, pFileName)
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
                                  className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900 flex items-center justify-between gap-2"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {pIsImage ? (
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
                                          pIsPdf
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
                                    <span
                                      className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px]"
                                      title={pFileName}
                                    >
                                      {pFileName}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
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
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        )}

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
