import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '@/context/StoreContext'
import { storeService } from '@/services/storeService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import {
  ShieldCheck,
  Truck,
  CreditCard,
  QrCode,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  User,
  MapPin,
  Clock,
} from 'lucide-react'

export const StoreCheckoutPage: React.FC = () => {
  const { cart, cartSubtotal, clearCart, customer, customerToken } = useStore()
  const navigate = useNavigate()

  // Se o carrinho estiver vazio, volta para a loja
  useEffect(() => {
    if (cart.length === 0) {
      navigate('/loja')
    }
  }, [cart, navigate])

  // Dados do Comprador
  const [customerName, setCustomerName] = useState(customer?.name || '')
  const [customerEmail, setCustomerEmail] = useState(customer?.email || '')
  const [customerPhone, setCustomerPhone] = useState(customer?.phone || '')
  const [customerDoc, setCustomerDoc] = useState(customer?.document_cpf_cnpj || '')

  // Método de Envio
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('delivery')

  // Endereço (se delivery)
  const defaultAddr = customer?.addresses?.find((a) => a.is_default) || customer?.addresses?.[0]
  const [zipCode, setZipCode] = useState(defaultAddr?.zip_code || '')
  const [street, setStreet] = useState(defaultAddr?.street || '')
  const [number, setNumber] = useState(defaultAddr?.number || '')
  const [complement, setComplement] = useState(defaultAddr?.complement || '')
  const [neighborhood, setNeighborhood] = useState(defaultAddr?.neighborhood || '')
  const [city, setCity] = useState(defaultAddr?.city || 'São Paulo')
  const [state, setState] = useState(defaultAddr?.state || 'SP')

  // Método de Pagamento (Estrutura Mercado Pago)
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card'>('pix')
  const [notes, setNotes] = useState('')

  // Estado de Validação do Servidor
  const [isValidating, setIsValidating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverValidatedData, setServerValidatedData] = useState<{
    subtotal: number
    shipping_fee: number
    total_amount: number
    estimated_days: number
  } | null>(null)

  // Revalidação estrita no servidor sempre que carrinho ou método de entrega mudarem
  useEffect(() => {
    if (cart.length === 0) return

    let isMounted = true
    const validate = async () => {
      try {
        setIsValidating(true)
        const itemsPayload = cart.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          width: it.width,
          height: it.height,
          selected_options: it.selected_options,
          selected_finishings: it.selected_finishings,
        }))

        const res = await storeService.validateCartOnServer(itemsPayload, deliveryMethod, zipCode)
        if (isMounted && res && res.success) {
          setServerValidatedData({
            subtotal: res.subtotal,
            shipping_fee: res.shipping_fee,
            total_amount: res.total_amount,
            estimated_days: res.estimated_days,
          })
        }
      } catch (err: any) {
        console.warn('Erro ao validar carrinho no servidor:', err)
      } finally {
        if (isMounted) setIsValidating(false)
      }
    }

    validate()

    return () => {
      isMounted = false
    }
  }, [cart, deliveryMethod, zipCode])

  const effectiveSubtotal = serverValidatedData?.subtotal ?? cartSubtotal
  const effectiveShipping = serverValidatedData?.shipping_fee ?? (deliveryMethod === 'delivery' ? 25 : 0)
  const effectiveTotal = serverValidatedData?.total_amount ?? effectiveSubtotal + effectiveShipping

  // Submissão do Checkout com Idempotência
  const handleFinalizeOrder = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!customerName || !customerEmail || !customerPhone) {
      toast({
        title: 'Dados incompletos',
        description: 'Por favor, informe seu nome, e-mail e telefone de contato.',
        variant: 'destructive',
      })
      return
    }

    if (deliveryMethod === 'delivery' && (!zipCode || !street || !number || !neighborhood)) {
      toast({
        title: 'Endereço incompleto',
        description: 'Preencha o CEP, rua, número e bairro para entrega.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsSubmitting(true)

      // Chave de idempotência única por tentativa do cliente
      // Formato: REQ-<timestamp>-<hash-aleatorio>
      const clientRequestId = `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

      const itemsPayload = cart.map((it) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        width: it.width,
        height: it.height,
        selected_options: it.selected_options,
        selected_finishings: it.selected_finishings,
      }))

      const shippingAddressPayload =
        deliveryMethod === 'delivery'
          ? {
              zip_code: zipCode,
              street,
              number,
              complement,
              neighborhood,
              city,
              state,
            }
          : null

      const res = await storeService.checkoutOrder(
        {
          client_request_id: clientRequestId,
          delivery_method: deliveryMethod,
          payment_method: paymentMethod,
          customer: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
            document: customerDoc,
          },
          shipping_address: shippingAddressPayload,
          items: itemsPayload,
          notes,
        },
        customerToken,
      )

      if (res && res.success) {
        toast({
          title: 'Pedido criado com sucesso!',
          description: `Seu pedido ${res.order_number} foi registrado no sistema.`,
        })
        clearCart()
        navigate(`/loja/pedido/${res.order_number}`)
      } else {
        throw new Error(res?.error || 'Não foi possível registrar o pedido.')
      }
    } catch (err: any) {
      toast({
        title: 'Falha no checkout',
        description: err?.message || 'Ocorreu um erro ao processar seu pedido. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="pb-6 border-b mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Finalizar Compra
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Identifique-se, selecione o método de entrega e a opção de pagamento.
        </p>
      </div>

      <form onSubmit={handleFinalizeOrder}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. IDENTIFICAÇÃO DO COMPRADOR */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    1. Identificação do Comprador
                  </CardTitle>
                  {!customerToken && (
                    <Button asChild variant="link" size="sm" className="text-xs text-blue-600 p-0">
                      <Link to="/loja/conta">Já tenho cadastro</Link>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Nome Completo *</Label>
                    <Input
                      required
                      placeholder="Seu nome ou da empresa"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">E-mail *</Label>
                    <Input
                      required
                      type="email"
                      placeholder="seu@email.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">WhatsApp / Tel *</Label>
                    <Input
                      required
                      placeholder="(11) 99999-9999"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">CPF ou CNPJ (Opcional)</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={customerDoc}
                      onChange={(e) => setCustomerDoc(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 2. FORMA DE RECEBIMENTO */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  2. Forma de Recebimento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={deliveryMethod}
                  onValueChange={(v) => setDeliveryMethod(v as 'pickup' | 'delivery')}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <label
                    htmlFor="deliv_ship"
                    className={`p-3.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${
                      deliveryMethod === 'delivery'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900 font-medium'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="delivery" id="deliv_ship" />
                      <div className="text-sm font-semibold">Entrega no Endereço</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 pl-6">
                      Receba no seu endereço com frete calculado no servidor.
                    </div>
                  </label>

                  <label
                    htmlFor="deliv_pickup"
                    className={`p-3.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${
                      deliveryMethod === 'pickup'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900 font-medium'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pickup" id="deliv_pickup" />
                      <div className="text-sm font-semibold">Retirada no Balcão</div>
                    </div>
                    <div className="mt-2 text-xs text-emerald-600 font-semibold pl-6">
                      Grátis no Balcão da Gráfica
                    </div>
                  </label>
                </RadioGroup>

                {/* Campos de endereço se Entrega */}
                {deliveryMethod === 'delivery' && (
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">CEP *</Label>
                        <Input
                          placeholder="00000-000"
                          value={zipCode}
                          onChange={(e) => setZipCode(e.target.value)}
                          className="mt-1"
                          required
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs font-semibold text-slate-700">Logradouro / Rua *</Label>
                        <Input
                          placeholder="Av. Paulista"
                          value={street}
                          onChange={(e) => setStreet(e.target.value)}
                          className="mt-1"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Número *</Label>
                        <Input
                          placeholder="1000"
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          className="mt-1"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Complemento</Label>
                        <Input
                          placeholder="Apto 42, Bloco B"
                          value={complement}
                          onChange={(e) => setComplement(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Bairro *</Label>
                        <Input
                          placeholder="Bela Vista"
                          value={neighborhood}
                          onChange={(e) => setNeighborhood(e.target.value)}
                          className="mt-1"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Cidade *</Label>
                        <Input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="mt-1"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Estado (UF) *</Label>
                        <Input
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="mt-1"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. PAGAMENTO (Preparação Mercado Pago) */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  3. Forma de Pagamento
                </CardTitle>
                <CardDescription className="text-xs text-amber-700 bg-amber-50 p-2 rounded-md border border-amber-200/60 mt-1">
                  Ambiente de Simulação e Homologação. Nenhuma cobrança real no cartão será realizada nesta etapa.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as 'pix' | 'credit_card')}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <label
                    htmlFor="pay_pix"
                    className={`p-3.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${
                      paymentMethod === 'pix'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900 font-medium'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pix" id="pay_pix" />
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-emerald-600" />
                        Pix Instantâneo
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-emerald-600 font-medium pl-6">
                      Aprovação mais rápida para início de produção
                    </div>
                  </label>

                  <label
                    htmlFor="pay_card"
                    className={`p-3.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${
                      paymentMethod === 'credit_card'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900 font-medium'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="credit_card" id="pay_card" />
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-blue-600" />
                        Cartão de Crédito
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 pl-6">
                      Parcelamento em até 6x (Mercado Pago)
                    </div>
                  </label>
                </RadioGroup>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Observações gerais do pedido (opcional)
                  </Label>
                  <Textarea
                    placeholder="Instruções de embalagem, horário preferencial para entrega ou detalhes da sua gráfica..."
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lateral: Resumo Financeiro & Conclusão */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Resumo do Pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-xs">
                  {cart.map((item) => (
                    <div key={item.cart_item_id} className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-600 line-clamp-1 flex-1 pr-2">
                        {item.quantity}x {item.product_name}
                      </span>
                      <span className="font-semibold text-slate-800 shrink-0">
                        R$ {item.total_price.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>R$ {effectiveSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Frete / Envio</span>
                    <span>
                      {effectiveShipping === 0 ? (
                        <span className="text-emerald-600 font-medium">Grátis</span>
                      ) : (
                        `R$ ${effectiveShipping.toFixed(2)}`
                      )}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-bold text-slate-900 pt-1">
                    <span>Total a Pagar</span>
                    <span className="text-xl text-blue-600">R$ {effectiveTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1.5 text-slate-600">
                  <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                    <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Prazo de Produção: ~{serverValidatedData?.estimated_days || 3} dias úteis</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    O prazo de produção é contado a partir da confirmação do pagamento e da aprovação
                    da arte técnica.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting || isValidating}
                  className="w-full py-6 font-semibold text-base"
                  size="lg"
                >
                  {isSubmitting ? 'Gerando Pedido...' : 'Concluir Pedido'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <p className="text-[11px] text-center text-slate-400">
                  Ao clicar em Concluir Pedido, seus dados são gravados com segurança e idempotência
                  no servidor.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
export default StoreCheckoutPage
