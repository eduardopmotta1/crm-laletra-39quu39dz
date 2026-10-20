import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { storeService } from '@/services/storeService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import {
  CheckCircle,
  Clock,
  UploadCloud,
  FileText,
  Copy,
  QrCode,
  Truck,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Check,
  X,
  Palette,
} from 'lucide-react'

export const StoreOrderDetailPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const [orderData, setOrderData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Upload de Arte
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [artNotes, setArtNotes] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // Aprovação / Ajuste de Prova de Arte
  const [artApprovalFeedback, setArtApprovalFeedback] = useState('')
  const [isApprovingArt, setIsApprovingArt] = useState(false)

  // Simulação de pagamento (homologação Mercado Pago)
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false)

  const fetchOrder = async () => {
    if (!orderNumber) return
    try {
      setLoading(true)
      const res = await storeService.getOrderByNumber(orderNumber)
      if (res && res.success && res.order) {
        setOrderData(res.order)
      } else {
        setError('Pedido não encontrado.')
      }
    } catch (err: any) {
      setError(err?.message || 'Falha ao buscar dados do pedido.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrder()
  }, [orderNumber])

  const handleCopyPix = (code: string) => {
    navigator.clipboard.writeText(code)
    toast({
      title: 'Código Pix copiado!',
      description: 'Cole no aplicativo do seu banco para pagar.',
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.size > 30 * 1024 * 1024) {
        toast({
          title: 'Arquivo muito grande',
          description: 'O arquivo não pode exceder 30MB.',
          variant: 'destructive',
        })
        return
      }
      setSelectedFile(file)
    }
  }

  const handleUploadArt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderNumber || !selectedFile) {
      toast({
        title: 'Selecione um arquivo',
        description: 'Escolha seu arquivo de arte em PDF, AI, EPS, JPG, PNG ou ZIP.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsUploading(true)
      const res = await storeService.uploadOrderArt(orderNumber, selectedFile, artNotes)
      if (res && res.success) {
        toast({
          title: 'Arte enviada com sucesso!',
          description: 'Sua arte técnica foi recebida e passará por conferência técnica.',
        })
        setSelectedFile(null)
        setArtNotes('')
        fetchOrder()
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar arte',
        description: err?.message || 'Não foi possível enviar o arquivo.',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleSimulatePayment = async () => {
    if (!orderNumber) return
    try {
      setIsSimulatingPayment(true)
      const res = await storeService.simulateMercadoPagoWebhook(orderNumber)
      if (res && res.success) {
        toast({
          title: 'Pagamento Simulado com Sucesso!',
          description: 'O webhook de homologação processou a aprovação do pedido.',
        })
        fetchOrder()
      }
    } catch (err: any) {
      toast({
        title: 'Falha na simulação',
        description: err?.message || 'Erro ao simular webhook.',
        variant: 'destructive',
      })
    } finally {
      setIsSimulatingPayment(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-lg">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-600">Carregando detalhes do pedido...</p>
      </div>
    )
  }

  if (error || !orderData) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-lg">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Pedido não encontrado</h2>
        <p className="text-slate-600 mb-6 text-sm">
          {error || 'Verifique o número e tente novamente.'}
        </p>
        <Button asChild>
          <Link to="/loja">Voltar para a Loja</Link>
        </Button>
      </div>
    )
  }

  const handleArtApprovalAction = async (approved: boolean) => {
    if (!orderNumber) return
    try {
      setIsApprovingArt(true)
      const res = await storeService.approveOrAdjustArt(orderNumber, approved, artApprovalFeedback)
      toast({
        title: approved ? 'Arte Aprovada com Sucesso!' : 'Solicitação de Ajuste Registrada',
        description: res.message,
      })
      setArtApprovalFeedback('')
      fetchOrder()
    } catch (err: any) {
      toast({
        title: 'Erro ao processar prova de arte',
        description: err?.message || 'Falha ao processar resposta.',
        variant: 'destructive',
      })
    } finally {
      setIsApprovingArt(false)
    }
  }

  const isPaid = orderData.payment_status === 'paid'

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Cabeçalho do Pedido */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Pedido da Loja
              </span>
              <Badge variant={isPaid ? 'default' : 'secondary'} className="text-xs">
                {isPaid ? 'Pagamento Aprovado' : 'Aguardando Pagamento'}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Arte: {orderData.art_status}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              #{orderData.order_number}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Realizado em {new Date(orderData.created).toLocaleDateString('pt-BR')} às{' '}
              {new Date(orderData.created).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs text-slate-500 block">Valor Total</span>
            <span className="text-2xl sm:text-3xl font-bold text-blue-600">
              R$ {Number(orderData.total_amount || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Status de Progresso do Pedido */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
              }`}
            >
              {isPaid ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-[11px] text-slate-400">1. Pagamento</p>
              <p className="text-xs font-semibold text-slate-800">
                {isPaid ? 'Confirmado' : 'Pendente'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                orderData.art_status === 'approved'
                  ? 'bg-emerald-100 text-emerald-600'
                  : orderData.art_status === 'uploaded'
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-amber-100 text-amber-600'
              }`}
            >
              {orderData.art_status === 'approved' ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
            </div>
            <div>
              <p className="text-[11px] text-slate-400">2. Arte Técnica</p>
              <p className="text-xs font-semibold text-slate-800">
                {orderData.art_status === 'approved'
                  ? 'Aprovada'
                  : orderData.art_status === 'uploaded'
                    ? 'Em Conferência'
                    : 'Pendente de Upload'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                orderData.production_status === 'released_to_production' ||
                orderData.production_status === 'in_production'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400">3. Produção</p>
              <p className="text-xs font-semibold text-slate-800">
                {orderData.production_status === 'waiting_release'
                  ? 'Aguardando Liberação'
                  : orderData.production_status === 'released_to_production'
                    ? 'Liberado'
                    : 'Em Produção'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-8 h-8 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400">4. Entrega / Balcão</p>
              <p className="text-xs font-semibold text-slate-800">
                {orderData.delivery_method === 'pickup'
                  ? 'Retirada na Gráfica'
                  : 'Envio por Transportadora'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna da Esquerda: Ações de Pagamento e Upload de Arte */}
        <div className="lg:col-span-2 space-y-6">
          {/* BLOCO DE PAGAMENTO PIX */}
          {!isPaid && (
            <Card className="border-emerald-200 bg-emerald-50/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-emerald-600" />
                  Efetuar Pagamento via Pix
                </CardTitle>
                <CardDescription className="text-xs">
                  Pague agora com o código Pix para liberarmos seu pedido imediatamente para a fila
                  de produção.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-32 h-32 bg-slate-100 rounded-lg border flex items-center justify-center text-slate-400 text-center text-xs p-2 shrink-0">
                    <QrCode className="w-16 h-16 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <p className="text-xs font-semibold text-slate-700 mb-1">Pix Copia e Cola:</p>
                    <div className="bg-slate-50 p-2 rounded border text-xs font-mono break-all text-slate-600 line-clamp-2 select-all">
                      {orderData.payments?.[0]?.pix_qr_code ||
                        '00020126580014br.gov.bcb.pix0136mock-laletra-pix-key...'}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={() =>
                          handleCopyPix(
                            orderData.payments?.[0]?.pix_qr_code ||
                              '00020126580014br.gov.bcb.pix0136mock-laletra-pix-key',
                          )
                        }
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        Copiar Código Pix
                      </Button>

                      {/* Botão de Homologação / Simulação */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSimulatePayment}
                        disabled={isSimulatingPayment}
                        className="border-dashed text-xs text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100/50"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                        {isSimulatingPayment
                          ? 'Processando Webhook...'
                          : 'Simular Pagamento Aprovado (Teste)'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* BLOCO DE APROVAÇÃO / AJUSTE DE PROVA DE ARTE (Fase 3) */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  Conferência e Aprovação de Prova Técnica
                </CardTitle>
                <Badge
                  variant={
                    orderData.art_status === 'approved'
                      ? 'default'
                      : orderData.art_status === 'changes_requested'
                        ? 'destructive'
                        : 'secondary'
                  }
                  className="text-xs"
                >
                  {orderData.art_status === 'approved'
                    ? 'Aprovada para Produção'
                    : orderData.art_status === 'changes_requested'
                      ? 'Ajustes Solicitados'
                      : orderData.art_status === 'uploaded'
                        ? 'Em Análise Técnica'
                        : 'Pendente de Upload'}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {orderData.art_status === 'approved'
                  ? 'A arte deste pedido já foi aprovada tecnicamente e está liberada para produção.'
                  : 'Revise os detalhes técnicos da arte. Ao aprovar, o pedido é liberado para a fila da gráfica.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderData.art_status !== 'approved' && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Instruções de Ajuste ou Observações de Aprovação:
                    </Label>
                    <Textarea
                      placeholder="Ex: Confirmo a aprovação das dimensões e diagramação. Podem rodar a impressão..."
                      rows={2}
                      value={artApprovalFeedback}
                      onChange={(e) => setArtApprovalFeedback(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleArtApprovalAction(false)}
                      disabled={isApprovingArt}
                      className="text-xs text-red-700 border-red-300 hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Solicitar Ajustes na Arte
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleArtApprovalAction(true)}
                      disabled={isApprovingArt}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Aprovar Arte Técnica Agora
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* BLOCO DE UPLOAD DE ARTE TÉCNICA */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-600" />
                Envio da Arte Final para Impressão
              </CardTitle>
              <CardDescription className="text-xs">
                Formatos aceitos: PDF, AI, EPS, JPG, PNG ou ZIP (máximo 30MB).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Histórico de artes enviadas */}
              {orderData.arts && orderData.arts.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold text-slate-700">
                    Arquivos enviados anteriormente:
                  </p>
                  <div className="space-y-1.5">
                    {orderData.arts.map((art: any) => (
                      <div
                        key={art.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="font-medium text-slate-800 truncate">
                            {art.original_filename}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={
                              art.status === 'approved'
                                ? 'default'
                                : art.status === 'rejected'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="text-[10px]"
                          >
                            {art.status === 'approved'
                              ? 'Aprovada'
                              : art.status === 'rejected'
                                ? 'Recusada'
                                : 'Recebida'}
                          </Badge>
                          <span className="text-[10px] text-slate-400">
                            {new Date(art.created).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formulário de novo upload */}
              <form onSubmit={handleUploadArt} className="space-y-3 pt-2">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Selecione o arquivo da sua arte
                  </Label>
                  <Input
                    type="file"
                    onChange={handleFileChange}
                    className="mt-1 cursor-pointer file:cursor-pointer"
                    accept=".pdf,.ai,.eps,.jpg,.jpeg,.png,.webp,.zip"
                  />
                  {selectedFile && (
                    <p className="text-[11px] text-blue-600 mt-1 font-medium">
                      Selecionado: {selectedFile.name} (
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Instruções sobre a arte (opcional)
                  </Label>
                  <Textarea
                    placeholder="Ex: Sangria já aplicada de 3mm, favor conferir fidelidade do pantone..."
                    rows={2}
                    value={artNotes}
                    onChange={(e) => setArtNotes(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="w-full sm:w-auto"
                >
                  <UploadCloud className="w-4 h-4 mr-2" />
                  {isUploading ? 'Enviando Arquivo...' : 'Fazer Upload da Arte'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Coluna da Direita: Dados dos Itens e do Comprador */}
        <div className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Itens do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderData.items?.map((it: any) => (
                <div key={it.id} className="text-xs py-2 border-b border-slate-100 last:border-0">
                  <div className="flex justify-between font-medium text-slate-900">
                    <span>
                      {it.quantity}x {it.product_name}
                    </span>
                    <span>R$ {Number(it.total_price || 0).toFixed(2)}</span>
                  </div>
                  {it.width && it.height && (
                    <p className="text-slate-500 text-[11px]">
                      Dimensões: {it.width} x {it.height} cm
                    </p>
                  )}
                </div>
              ))}

              <Separator className="my-2" />

              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>R$ {Number(orderData.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    Frete ({orderData.delivery_method === 'pickup' ? 'Balcão' : 'Entrega'}):
                  </span>
                  <span>R$ {Number(orderData.shipping_fee || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 text-sm pt-1">
                  <span>Total:</span>
                  <span className="text-blue-600">
                    R$ {Number(orderData.total_amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Dados de Contato e Envio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-600">
              <p>
                <strong className="text-slate-800">Comprador:</strong> {orderData.customer_name}
              </p>
              <p>
                <strong className="text-slate-800">E-mail:</strong> {orderData.customer_email}
              </p>
              <p>
                <strong className="text-slate-800">Telefone:</strong> {orderData.customer_phone}
              </p>

              {orderData.delivery_method === 'delivery' && orderData.shipping_address && (
                <div className="pt-2 border-t border-slate-100 mt-2">
                  <p className="font-semibold text-slate-800 mb-1">Endereço de Entrega:</p>
                  <p>
                    {orderData.shipping_address.street}, {orderData.shipping_address.number}
                    {orderData.shipping_address.complement &&
                      ` - ${orderData.shipping_address.complement}`}
                  </p>
                  <p>
                    {orderData.shipping_address.neighborhood} - {orderData.shipping_address.city}/
                    {orderData.shipping_address.state}
                  </p>
                  <p>CEP: {orderData.shipping_address.zip_code}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
export default StoreOrderDetailPage
