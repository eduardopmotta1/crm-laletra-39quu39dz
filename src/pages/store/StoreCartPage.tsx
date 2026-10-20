import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '@/context/StoreContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  Truck,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export const StoreCartPage: React.FC = () => {
  const {
    cart,
    updateQuantity,
    removeFromCart,
    clearCart,
    cartSubtotal,
    isRevalidatingCart,
    revalidateCartWithServer,
  } = useStore()
  const navigate = useNavigate()
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('delivery')
  const [zipCode, setZipCode] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [serverShippingData, setServerShippingData] = useState<{
    shipping_fee: number
    shipping_note: string
    subtotal: number
    total_amount: number
    estimated_days: number
  } | null>(null)

  // Revalidação com o backend ao mudar método ou itens
  useEffect(() => {
    if (cart.length === 0) return
    let active = true
    setIsValidating(true)
    storeService
      .validateCartOnServer(
        cart.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          width: it.width,
          height: it.height,
          selected_options: it.selected_options,
          selected_finishings: it.selected_finishings,
        })),
        deliveryMethod,
        zipCode,
      )
      .then((res) => {
        if (active && res && res.success) {
          setServerShippingData({
            shipping_fee: res.shipping_fee,
            shipping_note: res.shipping_note,
            subtotal: res.subtotal,
            total_amount: res.total_amount,
            estimated_days: res.estimated_days,
          })
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsValidating(false)
      })

    return () => {
      active = false
    }
  }, [cart, deliveryMethod, zipCode])

  const freeShippingThreshold = 350.0
  const shippingFee =
    serverShippingData?.shipping_fee ??
    (deliveryMethod === 'pickup' ? 0 : cartSubtotal >= freeShippingThreshold ? 0 : 25.0)
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - cartSubtotal)
  const totalAmount =
    serverShippingData?.total_amount ?? Number((cartSubtotal + shippingFee).toFixed(2))

  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-lg">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Seu carrinho está vazio</h2>
        <p className="text-slate-600 mb-8 text-sm">
          Você ainda não adicionou nenhum item impresso ao seu carrinho de compras.
        </p>
        <Button asChild size="lg" className="w-full sm:w-auto font-medium">
          <Link to="/loja">Ver catálogo de produtos</Link>
        </Button>
      </div>
    )
  }

  const handleProceedToCheckout = () => {
    navigate('/loja/checkout')
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b mb-8 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Carrinho de Compras
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Revise seus produtos, quantidades e opções de envio antes de finalizar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => revalidateCartWithServer()}
            disabled={isRevalidatingCart || isValidating}
            className="text-xs"
          >
            {isRevalidatingCart || isValidating ? 'Revalidando...' : 'Atualizar Preços'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCart}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Esvaziar carrinho
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lista de Itens */}
        <div className="lg:col-span-2 space-y-4">
          {remainingForFreeShipping > 0 && deliveryMethod === 'delivery' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Falta apenas <strong>R$ {remainingForFreeShipping.toFixed(2)}</strong> para você
                ganhar <strong>FRETE GRÁTIS</strong>!
              </span>
            </div>
          )}

          {cart.map((item) => {
            const optionsSummary = item.selected_options_labels
              ? Object.values(item.selected_options_labels).join(' • ')
              : ''
            const finishingsSummary = item.selected_finishings_labels?.join(', ') || ''

            return (
              <Card key={item.cart_item_id} className="overflow-hidden border-slate-200">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {/* Imagem */}
                    <div className="w-20 h-20 bg-slate-100 rounded-md overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center text-slate-400">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ShoppingBag className="w-8 h-8 opacity-40" />
                      )}
                    </div>

                    {/* Detalhes do Produto */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <Link
                          to={`/loja/produto/${item.product_slug}`}
                          className="font-semibold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1"
                        >
                          {item.product_name}
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFromCart(item.cart_item_id)}
                          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-slate-100 -mr-1 -mt-1"
                          title="Remover item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Especificações técnicas */}
                      <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                        {item.width && item.height && (
                          <p>
                            Dimensões: {item.width} x {item.height} cm ({item.area_m2} m²)
                          </p>
                        )}
                        {optionsSummary && <p>Opções: {optionsSummary}</p>}
                        {finishingsSummary && <p>Acabamentos: {finishingsSummary}</p>}
                        {item.lead_time_days && (
                          <p className="text-slate-400">
                            Prazo de produção estimado: ~{item.lead_time_days} dias úteis
                          </p>
                        )}
                      </div>

                      {/* Quantidade e Preço */}
                      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center border border-slate-200 rounded-md">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => updateQuantity(item.cart_item_id, item.quantity - 1)}
                            className="h-8 w-8 rounded-none border-r border-slate-200"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="w-12 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => updateQuantity(item.cart_item_id, item.quantity + 1)}
                            className="h-8 w-8 rounded-none border-l border-slate-200"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">
                            Unitário: R$ {item.unit_price.toFixed(2)}
                          </span>
                          <span className="text-base font-bold text-slate-900">
                            R$ {item.total_price.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/loja">Continuar comprando</Link>
            </Button>
          </div>
        </div>

        {/* Resumo do Pedido & Envio */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-slate-200 shadow-sm sticky top-24">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Resumo da Compra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Opção de Envio */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Forma de recebimento:
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                      deliveryMethod === 'delivery'
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-medium'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Truck className="w-3.5 h-3.5" /> Entrega
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {shippingFee === 0 ? 'Grátis' : 'R$ 25,00 fixo'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                      deliveryMethod === 'pickup'
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-medium'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" /> Balcão
                    </span>
                    <span className="text-[11px] text-emerald-600 font-medium">Grátis</span>
                  </button>
                </div>
              </div>

              <Separator />

              {/* Valores */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal dos itens</span>
                  <span>R$ {cartSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Envio / Frete</span>
                  <span>
                    {shippingFee === 0 ? (
                      <span className="text-emerald-600 font-medium">Grátis</span>
                    ) : (
                      `R$ ${shippingFee.toFixed(2)}`
                    )}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold text-slate-900 pt-1">
                  <span>Total</span>
                  <span className="text-xl text-blue-600">R$ {totalAmount.toFixed(2)}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  * Os preços e condições de frete são revalidados estritamente no servidor ao
                  finalizar.
                </p>
              </div>

              <Button
                onClick={handleProceedToCheckout}
                className="w-full font-semibold py-6 text-base"
                size="lg"
              >
                Prosseguir para o Checkout
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <div className="bg-slate-50 rounded-lg p-3 text-[11px] text-slate-500 space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-slate-700">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Compra 100% Segura
                </p>
                <p>
                  Você poderá enviar seus arquivos de arte após a identificação ou finalizar e
                  enviar depois por este mesmo portal.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
export default StoreCartPage
