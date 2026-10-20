import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Printer,
  ChevronRight,
  ShieldCheck,
  Clock,
  Truck,
  CheckCircle2,
  FileText,
  AlertCircle,
  HelpCircle,
  ShoppingCart,
  PhoneCall,
  Loader2,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { storeService } from '@/services/storeService'
import type { StoreProduct, StorePriceCalculationResult } from '@/types/store'

export default function StoreProductDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [product, setProduct] = useState<StoreProduct | null>(null)
  const [relatedProducts, setRelatedProducts] = useState<StoreProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estados de Configuração e Precificação
  const [quantity, setQuantity] = useState<number>(1)
  const [width, setWidth] = useState<number>(100) // para square_meter (cm)
  const [height, setHeight] = useState<number>(100) // para square_meter (cm)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [selectedFinishings, setSelectedFinishings] = useState<string[]>([])

  // Resultado do Cálculo
  const [calcResult, setCalcResult] = useState<StorePriceCalculationResult | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [addedToCartToast, setAddedToCartToast] = useState(false)

  // Carregar Produto
  useEffect(() => {
    async function loadProduct() {
      if (!slug) return
      try {
        setLoading(true)
        setError(null)
        const res = await storeService.getProductBySlug(slug)
        setProduct(res.product)
        setRelatedProducts(res.related || [])

        // Inicializar configurações padrão
        if (res.product) {
          const p = res.product
          if (p.pricing_type === 'quantity_tiers' && p.price_tiers && p.price_tiers.length > 0) {
            setQuantity(Number(p.price_tiers[0].quantity) || 100)
          } else {
            setQuantity(1)
          }

          // Opções padrão (primeiro valor de cada opção)
          const initialOpts: Record<string, string> = {}
          if (Array.isArray(p.options)) {
            for (const opt of p.options) {
              if (opt.values && opt.values.length > 0) {
                initialOpts[opt.name] = opt.values[0].id
              }
            }
          }
          setSelectedOptions(initialOpts)
        }
      } catch (err: any) {
        console.error('Erro ao carregar produto:', err)
        setError(err.message || 'Produto não encontrado na loja.')
      } finally {
        setLoading(false)
      }
    }

    loadProduct()
  }, [slug])

  // Recalcular Preço ao mudar parâmetros
  useEffect(() => {
    if (!product || product.quote_only) return

    let isMounted = true
    async function doCalculation() {
      setCalculating(true)
      try {
        const res = await storeService.calculatePrice({
          product_id: product?.id,
          product: product || undefined,
          quantity,
          width,
          height,
          selected_options: selectedOptions,
          selected_finishings: selectedFinishings,
        })
        if (isMounted) setCalcResult(res)
      } catch (err) {
        console.error('Erro ao calcular preço:', err)
      } finally {
        if (isMounted) setCalculating(false)
      }
    }

    doCalculation()
    return () => {
      isMounted = false
    }
  }, [product, quantity, width, height, selectedOptions, selectedFinishings])

  const formatCurrency = (val?: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  const handleOptionChange = (optionName: string, valueId: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [optionName]: valueId,
    }))
  }

  const handleFinishingToggle = (finishingId: string) => {
    setSelectedFinishings((prev) =>
      prev.includes(finishingId) ? prev.filter((id) => id !== finishingId) : [...prev, finishingId],
    )
  }

  const handleAddToCart = () => {
    if (!product) return

    const cartItem = {
      product_id: product.id,
      name: product.name,
      slug: product.seo_slug,
      quantity,
      width: product.pricing_type === 'square_meter' ? width : undefined,
      height: product.pricing_type === 'square_meter' ? height : undefined,
      selected_options: selectedOptions,
      selected_finishings: selectedFinishings,
      total: calcResult?.total || 0,
      unit_price: calcResult?.unit_price || 0,
      lead_time_days: calcResult?.lead_time_days || product.lead_time_days || 3,
      created_at: new Date().toISOString(),
    }

    try {
      const existing = localStorage.getItem('laletra_store_cart')
      const cart = existing ? JSON.parse(existing) : []
      cart.push(cartItem)
      localStorage.setItem('laletra_store_cart', JSON.stringify(cart))

      setAddedToCartToast(true)
      setTimeout(() => setAddedToCartToast(false), 4000)
    } catch {
      /* intentionally ignored */
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto mb-4" />
        <p className="text-slate-500 text-sm font-medium">Carregando produto e acabamentos...</p>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
          Produto não encontrado
        </h2>
        <p className="text-xs text-slate-500">
          O produto que você procura não está publicado ou foi descontinuado.
        </p>
        <Link to="/loja">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
            Voltar para o Catálogo
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/loja" className="hover:text-emerald-600">
          Loja
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        {product.category && (
          <>
            <Link
              to={`/loja/categoria/${product.category.slug}`}
              className="hover:text-emerald-600"
            >
              {product.category.name}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </>
        )}
        <span className="text-slate-900 dark:text-white font-medium truncate max-w-xs">
          {product.name}
        </span>
      </nav>

      {/* Alerta de Adicionado ao Pedido */}
      {addedToCartToast && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 p-4 rounded-2xl flex items-center justify-between gap-3 shadow-md animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold">
              Item configurado com sucesso! Salvo para orçamento ou checkout.
            </span>
          </div>
          <Link to="/loja">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-emerald-700 hover:text-emerald-800"
            >
              Continuar Comprando
            </Button>
          </Link>
        </div>
      )}

      {/* Grid Principal: Imagens e Painel de Configuração */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Coluna Esquerda: Imagem & Descrição (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="aspect-4/3 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm relative">
            {product.main_image_url ? (
              <img
                src={product.main_image_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <Printer className="w-16 h-16 stroke-[1.2]" />
              </div>
            )}
            {product.badge_label && (
              <Badge className="absolute top-4 left-4 bg-emerald-600 text-white font-bold text-xs shadow-md">
                {product.badge_label}
              </Badge>
            )}
          </div>

          {/* Galeria de miniaturas se houver */}
          {product.gallery_image_urls && product.gallery_image_urls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {product.gallery_image_urls.map((imgUrl, i) => (
                <div
                  key={i}
                  className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 cursor-pointer hover:border-emerald-500"
                >
                  <img src={imgUrl} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {/* Descrição Detalhada */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
              Detalhes Técnicos & Aplicação
            </h3>
            {product.description_public ? (
              <div
                className="prose prose-sm dark:prose-invert text-xs text-slate-600 dark:text-slate-400 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: product.description_public }}
              />
            ) : (
              <p className="text-xs text-slate-500">
                Produto produzido com matéria-prima de primeira linha e conferência técnica de arte
                antes da impressão.
              </p>
            )}
          </div>
        </div>

        {/* Coluna Direita: Personalização e Precificação (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-2">
            {product.category && (
              <Badge
                variant="outline"
                className="text-emerald-600 border-emerald-300 text-[11px] font-bold"
              >
                {product.category.name}
              </Badge>
            )}
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {product.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              {product.subtitle ||
                'Configure a quantidade, variações e acabamentos para simular o valor final.'}
            </p>
          </div>

          {/* Se produto for SOMENTE ORÇAMENTO */}
          {product.quote_only ? (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-6 rounded-3xl space-y-4">
              <div className="flex items-start gap-3">
                <FileText className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    Produto Exclusivo sob Orçamento Personalizado
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    Este item exige avaliação técnica personalizada de medidas, tipo de instalação
                    ou tiragem específica.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Link to="/orcamentos/novo" className="flex-1">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs">
                    Solicitar Orçamento Online
                  </Button>
                </Link>
                <a
                  href={`https://wa.me/5511998819988?text=Ol%C3%A1!%20Gostaria%20de%20or%C3%A7amento%20para%20o%20produto%20${encodeURIComponent(product.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1"
                >
                  <Button variant="outline" className="w-full rounded-xl text-xs gap-2">
                    <PhoneCall className="w-4 h-4 text-emerald-600" /> WhatsApp Direto
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            /* CONFIGURADOR DE PREÇO (fixed, quantity_tiers, square_meter) */
            <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-8">
              {/* 1. SELETOR DE QUANTIDADE / MEDIDAS */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    1. Quantidade ou Medidas
                  </Label>
                  <span className="text-[11px] text-slate-400">
                    Prazo estimado: {product.lead_time_days || 3} dias úteis
                  </span>
                </div>

                {/* Faixas de Quantidade (quantity_tiers) */}
                {product.pricing_type === 'quantity_tiers' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {product.price_tiers && product.price_tiers.length > 0 ? (
                      product.price_tiers.map((tier) => {
                        const isSelected = quantity === Number(tier.quantity)
                        return (
                          <button
                            key={tier.quantity}
                            type="button"
                            onClick={() => setQuantity(Number(tier.quantity))}
                            className={`p-3 rounded-2xl border text-left transition-all ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 shadow-sm ring-1 ring-emerald-600'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="block font-bold text-xs">
                              {tier.label || `${tier.quantity} un`}
                            </span>
                            <span className="block font-extrabold text-sm text-emerald-600 mt-1">
                              {formatCurrency(tier.price)}
                            </span>
                          </button>
                        )
                      })
                    ) : (
                      <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-32 rounded-xl text-xs"
                      />
                    )}
                  </div>
                )}

                {/* Metro Quadrado (square_meter) */}
                {product.pricing_type === 'square_meter' && (
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          Largura (cm)
                        </Label>
                        <Input
                          type="number"
                          min="10"
                          step="5"
                          value={width}
                          onChange={(e) => setWidth(Math.max(10, parseFloat(e.target.value) || 10))}
                          className="mt-1 bg-white dark:bg-slate-900 rounded-xl text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          Altura (cm)
                        </Label>
                        <Input
                          type="number"
                          min="10"
                          step="5"
                          value={height}
                          onChange={(e) =>
                            setHeight(Math.max(10, parseFloat(e.target.value) || 10))
                          }
                          className="mt-1 bg-white dark:bg-slate-900 rounded-xl text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          Qtd. Banners
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          className="mt-1 bg-white dark:bg-slate-900 rounded-xl text-xs font-mono"
                        />
                      </div>
                    </div>
                    {calcResult?.area_m2 && (
                      <p className="text-[11px] text-slate-500 font-medium">
                        Área total calculada: <strong>{calcResult.area_m2} m²</strong> (Área mínima
                        faturada: {product.sqm_min_area || 0.5} m²)
                      </p>
                    )}
                  </div>
                )}

                {/* Preço Fixo (fixed) */}
                {product.pricing_type === 'fixed' && (
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-slate-600">Quantidade:</Label>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-28 rounded-xl text-xs font-bold"
                    />
                    <span className="text-xs text-slate-500">
                      {product.unit_label || 'unidade(s)'}
                    </span>
                  </div>
                )}
              </div>

              {/* 2. OPÇÕES / VARIAÇÕES (ex.: Cantos, Papel, Cor) */}
              {product.options && product.options.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                    2. Escolha as Variações
                  </Label>
                  <div className="space-y-4">
                    {product.options.map((opt) => (
                      <div key={opt.name} className="space-y-2">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {opt.name}:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {opt.values.map((val) => {
                            const isSelected = selectedOptions[opt.name] === val.id
                            return (
                              <button
                                key={val.id}
                                type="button"
                                onClick={() => handleOptionChange(opt.name, val.id)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                  isSelected
                                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:border-emerald-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                }`}
                              >
                                {val.label}
                                {val.price_modifier > 0 && (
                                  <span className="text-[10px] ml-1.5 opacity-80">
                                    (+{formatCurrency(val.price_modifier)})
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. ACABAMENTOS ADICIONAIS (finishings) */}
              {product.finishings && product.finishings.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                    3. Acabamentos Adicionais
                  </Label>
                  <div className="space-y-2">
                    {product.finishings.map((fin) => {
                      const isChecked = selectedFinishings.includes(fin.id)
                      return (
                        <label
                          key={fin.id}
                          onClick={() => handleFinishingToggle(fin.id)}
                          className={`flex items-start justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-500'
                              : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              className="mt-1 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                            />
                            <div>
                              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                                {fin.name}
                              </span>
                              {fin.description && (
                                <span className="text-[11px] text-slate-500 block leading-tight">
                                  {fin.description}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-emerald-600 shrink-0 ml-2">
                            +{formatCurrency(fin.price)}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 4. RESUMO DE VALORES E CTA */}
              <div className="pt-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium block">
                    Valor Total do Pedido:
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900 dark:text-white">
                      {formatCurrency(calcResult?.total)}
                    </span>
                    {calcResult?.unit_price && quantity > 1 && (
                      <span className="text-xs text-slate-500">
                        ({formatCurrency(calcResult.unit_price)}/un)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-emerald-600 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Produção em {calcResult?.lead_time_days || 3} dias úteis</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    size="lg"
                    onClick={handleAddToCart}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg text-xs gap-2 px-6"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Salvar no Pedido
                  </Button>
                  <a
                    href={`https://wa.me/5511998819988?text=Ol%C3%A1!%20Gostaria%20de%20fechar%20o%20produto%20${encodeURIComponent(product.name)}%20(Qtd:%20${quantity},%20Total:%20${encodeURIComponent(formatCurrency(calcResult?.total))})`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="outline" size="lg" className="rounded-xl text-xs gap-2">
                      <PhoneCall className="w-4 h-4 text-emerald-600" />
                      Pedir pelo WhatsApp
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. PRODUTOS RELACIONADOS DA MESMA CATEGORIA */}
      {relatedProducts.length > 0 && (
        <section className="space-y-6 pt-10 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Quem viu este produto também se interessou:
            </h3>
            {product.category && (
              <Link
                to={`/loja/categoria/${product.category.slug}`}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
              >
                Ver todos da categoria
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {relatedProducts.map((rel) => (
              <Card
                key={rel.id}
                className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 rounded-2xl overflow-hidden transition-all"
              >
                <Link
                  to={`/loja/produto/${rel.seo_slug}`}
                  className="block relative aspect-4/3 bg-slate-100 dark:bg-slate-800"
                >
                  {rel.main_image_url ? (
                    <img
                      src={rel.main_image_url}
                      alt={rel.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <Printer className="w-8 h-8" />
                    </div>
                  )}
                </Link>
                <CardContent className="p-4 space-y-2">
                  <Link to={`/loja/produto/${rel.seo_slug}`}>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1 group-hover:text-emerald-600">
                      {rel.name}
                    </h4>
                  </Link>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {rel.quote_only ? 'Sob Orçamento' : formatCurrency(rel.store_price)}
                    </span>
                    <Link to={`/loja/produto/${rel.seo_slug}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2 text-emerald-600"
                      >
                        Ver
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
