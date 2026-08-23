import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  Star,
  Printer,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ThumbsUp,
  Heart,
  Send,
  Loader2,
  Clock,
  Sparkles,
} from 'lucide-react'
import { evaluationsService } from '@/services/evaluations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'

export default function PublicEvaluationPage() {
  const { token } = useParams<{ token: string }>()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [submittedSuccess, setSubmittedSuccess] = useState(false)

  // Form ratings
  const [overallRating, setOverallRating] = useState<number>(0)
  const [hoverOverall, setHoverOverall] = useState<number>(0)

  const [serviceRating, setServiceRating] = useState<number>(0)
  const [qualityRating, setQualityRating] = useState<number>(0)
  const [deliveryRating, setDeliveryRating] = useState<number>(0)

  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Link de avaliação inválido.')
      setLoading(false)
      return
    }

    const checkToken = async () => {
      try {
        const data = await evaluationsService.getByToken(token)
        if (data.already_submitted) {
          setAlreadySubmitted(true)
          if (data.overall_rating) setOverallRating(data.overall_rating)
          if (data.comment) setComment(data.comment)
        }
      } catch (err: any) {
        setError(err?.message || 'Link de avaliação não encontrado ou expirado.')
      } finally {
        setLoading(false)
      }
    }

    checkToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overallRating || overallRating < 1 || overallRating > 5) {
      setError('Por favor, selecione uma nota de 1 a 5 estrelas para sua experiência geral.')
      return
    }

    if (!token) return

    setSubmitting(true)
    setError(null)

    try {
      await evaluationsService.submitEvaluation({
        token,
        overall_rating: overallRating,
        service_rating: serviceRating || undefined,
        quality_rating: qualityRating || undefined,
        delivery_rating: deliveryRating || undefined,
        comment: comment.trim() || undefined,
      })
      setSubmittedSuccess(true)
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar sua avaliação. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const renderRatingStars = (
    value: number,
    onChange: (val: number) => void,
    hoverVal?: number,
    onHover?: (val: number) => void,
    onLeave?: () => void,
    size = 'h-8 w-8',
  ) => {
    return (
      <div className="flex items-center gap-1.5" onMouseLeave={onLeave}>
        {[1, 2, 3, 4, 5].map((star) => {
          const active = (hoverVal || value) >= star
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => onHover && onHover(star)}
              className="p-1 rounded-lg transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                className={`${size} transition-colors ${
                  active
                    ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                    : 'text-slate-300 dark:text-slate-600 hover:text-amber-200'
                }`}
              />
            </button>
          )
        })}
      </div>
    )
  }

  const getRatingLabel = (rating: number) => {
    switch (rating) {
      case 1:
        return 'Muito insatisfeito'
      case 2:
        return 'Insatisfeito'
      case 3:
        return 'Regular / Neutro'
      case 4:
        return 'Satisfeito'
      case 5:
        return 'Excelente! Amei o resultado'
      default:
        return 'Clique para selecionar sua nota'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-between py-8 px-4 sm:px-6">
      <div className="max-w-xl mx-auto w-full space-y-6 my-auto">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 mb-1">
            <Printer className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Laletra Gráfica Rápida
          </h1>
          <p className="text-xs text-slate-500">
            Sua opinião é fundamental para aprimorarmos nossos materiais e atendimento.
          </p>
        </div>

        {/* State: Loading */}
        {loading ? (
          <Card className="border-slate-200/80 shadow-md">
            <CardContent className="py-16 text-center space-y-3">
              <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mx-auto" />
              <p className="text-sm text-slate-500 font-medium">
                Carregando formulário de avaliação...
              </p>
            </CardContent>
          </Card>
        ) : error && !alreadySubmitted && !submittedSuccess ? (
          /* State: Error / Invalid Token */
          <Card className="border-rose-200 bg-rose-50/40 dark:bg-rose-950/20 shadow-md">
            <CardHeader className="text-center pb-3">
              <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="h-6 w-6" />
              </div>
              <CardTitle className="text-rose-900 dark:text-rose-200 text-lg">
                Não foi possível abrir a avaliação
              </CardTitle>
              <CardDescription className="text-xs text-rose-700 dark:text-rose-300">
                {error}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : alreadySubmitted || submittedSuccess ? (
          /* State: Submitted Success */
          <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-lg text-center">
            <CardHeader className="pb-4">
              <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">
                Avaliação Registrada com Sucesso!
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 dark:text-slate-300 pt-1">
                Agradecemos imensamente por dedicar um momento do seu dia para avaliar a Laletra.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pb-6">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/40 max-w-sm mx-auto space-y-2">
                <div className="flex justify-center">
                  {renderRatingStars(
                    overallRating || 5,
                    () => {},
                    undefined,
                    undefined,
                    undefined,
                    'h-6 w-6',
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {getRatingLabel(overallRating || 5)}
                </p>
                {comment && (
                  <p className="text-xs text-slate-500 italic mt-1 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    "{comment}"
                  </p>
                )}
              </div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {overallRating <= 3
                  ? 'Nossa equipe de qualidade já recebeu seus apontamentos e tomará medidas imediatas para solucionar qualquer pendência.'
                  : 'Ficamos muito felizes com a sua satisfação! Conte conosco para seus próximos impressos.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          /* State: Evaluation Form */
          <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-900">
            <CardHeader className="text-center pb-4 border-b border-slate-100 dark:border-slate-800">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mx-auto mb-1">
                <Sparkles className="h-3.5 w-3.5" />
                Pesquisa de Satisfação
              </span>
              <CardTitle className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Como foi sua experiência conosco?
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 max-w-md mx-auto">
                Avalie sua experiência geral com o nosso serviço gráfico.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6 pt-6">
                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 1. Main Rating (1 to 5 Stars) */}
                <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Avaliação Geral *
                  </span>
                  {renderRatingStars(
                    overallRating,
                    (val) => setOverallRating(val),
                    hoverOverall,
                    (val) => setHoverOverall(val),
                    () => setHoverOverall(0),
                    'h-10 w-10',
                  )}
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                      (hoverOverall || overallRating) > 0
                        ? (hoverOverall || overallRating) <= 3
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                        : 'text-slate-400 bg-transparent'
                    }`}
                  >
                    {getRatingLabel(hoverOverall || overallRating)}
                  </span>
                </div>

                {/* 2. Optional Detailed Ratings */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                    Avaliações Detalhadas (Opcional)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Atendimento */}
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col items-center text-center space-y-1.5">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Atendimento
                      </span>
                      {renderRatingStars(
                        serviceRating,
                        (val) => setServiceRating(val),
                        undefined,
                        undefined,
                        undefined,
                        'h-5 w-5',
                      )}
                    </div>

                    {/* Qualidade do Produto */}
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col items-center text-center space-y-1.5">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Qualidade da Arte / Impressão
                      </span>
                      {renderRatingStars(
                        qualityRating,
                        (val) => setQualityRating(val),
                        undefined,
                        undefined,
                        undefined,
                        'h-5 w-5',
                      )}
                    </div>

                    {/* Prazo / Entrega */}
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col items-center text-center space-y-1.5">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Prazo e Entrega
                      </span>
                      {renderRatingStars(
                        deliveryRating,
                        (val) => setDeliveryRating(val),
                        undefined,
                        undefined,
                        undefined,
                        'h-5 w-5',
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Optional Comment */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Quer contar um pouco mais sobre sua experiência?</span>
                    <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                  </label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Conte-nos o que achou da impressão, prazo, embalagem ou atendimento..."
                    rows={3}
                    className="text-xs resize-none bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white"
                  />
                </div>
              </CardContent>

              <CardFooter className="pt-2 pb-6 flex flex-col gap-3">
                <Button
                  type="submit"
                  disabled={submitting || overallRating === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm h-11 shadow-md shadow-emerald-500/20"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando sua avaliação...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar Minha Avaliação
                    </>
                  )}
                </Button>

                <p className="text-[11px] text-slate-400 text-center">
                  🔒 Seus dados e informações são mantidos com total segurança e privacidade.
                </p>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>

      {/* Footer Branding */}
      <footer className="text-center text-xs text-slate-400 mt-6">
        © {new Date().getFullYear()} Laletra Gráfica Rápida — Excelência em Impressão & Atendimento.
      </footer>
    </div>
  )
}
