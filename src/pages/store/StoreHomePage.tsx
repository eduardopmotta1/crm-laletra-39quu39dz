import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Printer,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Truck,
  Zap,
  CheckCircle,
  HelpCircle,
  Clock,
  ChevronRight,
  Layers,
  Search,
  FileQuestion,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { storeService } from '@/services/storeService'
import type { StoreCategory, StoreProduct, StoreBanner } from '@/types/store'

export default function StoreHomePage() {
  const [searchParams] = useSearchParams()
  const searchQuery = searchParams.get('search') || ''

  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [banners, setBanners] = useState<StoreBanner[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBannerIndex, setActiveBannerIndex] = useState(0)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [catsRes, bannersRes, prodsRes] = await Promise.all([
          storeService.getCategories(),
          storeService.getBanners(),
          storeService.getProducts({ search: searchQuery || undefined }),
        ])
        setCategories(catsRes)
        setBanners(bannersRes)
        setProducts(prodsRes)
      } catch (err) {
        console.error('Erro ao carregar dados da loja:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [searchQuery])

  // Troca automática de banner a cada 6 segundos
  useEffect(() => {
    if (banners.length <= 1) return
    const timer = setInterval(() => {
      setActiveBannerIndex((prev) => (prev + 1) % banners.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [banners.length])

  const formatCurrency = (val?: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  const getProductStartingPrice = (p: StoreProduct) => {
    if (p.quote_only) return null
    if (p.pricing_type === 'quantity_tiers' && p.price_tiers && p.price_tiers.length > 0) {
      const minP = Math.min(...p.price_tiers.map((t) => t.price))
      return { price: minP, prefix: 'A partir de' }
    }
    if (p.pricing_type === 'square_meter') {
      const sqmP = p.sqm_base_price || p.store_price || 65.0
      return { price: sqmP, prefix: 'A partir de', suffix: '/m²' }
    }
    return { price: p.store_price || 0, prefix: '' }
  }

  const featuredProducts = products.filter((p) => p.featured)
  const displayProducts = searchQuery
    ? products
    : featuredProducts.length > 0
      ? featuredProducts
      : products

  return (
    <div className="space-y-12 pb-16">
      {/* 1. HERO BANNER SLIDER */}
      {!searchQuery && banners.length > 0 && (
        <section className="relative overflow-hidden bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
            {banners.map((banner, idx) => {
              const isActive = idx === activeBannerIndex
              if (!isActive) return null

              return (
                <div
                  key={banner.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center animate-in fade-in duration-500"
                >
                  <div className="md:col-span-7 space-y-4">
                    {banner.badge && (
                      <Badge className="bg-emerald-500 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-1 text-xs uppercase tracking-wider">
                        {banner.badge}
                      </Badge>
                    )}
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
                      {banner.title}
                    </h1>
                    <p className="text-slate-300 text-sm sm:text-base max-w-xl leading-relaxed">
                      {banner.subtitle}
                    </p>
                    <div className="pt-2 flex flex-wrap gap-3 items-center">
                      <Link to={banner.link_url || '/loja'}>
                        <Button
                          size="lg"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 gap-2"
                        >
                          {banner.cta_text || 'Ver Produtos'}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Link to="/orcamentos/novo">
                        <Button
                          variant="outline"
                          size="lg"
                          className="border-slate-700 bg-slate-800/80 text-white hover:bg-slate-800 rounded-xl"
                        >
                          Orçamento Especial
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <div className="md:col-span-5 flex justify-center">
                    <div className="relative w-full max-w-md aspect-4/3 rounded-2xl bg-gradient-to-tr from-emerald-600/20 to-blue-600/20 p-2 border border-slate-700/50 shadow-2xl backdrop-blur-xs flex items-center justify-center overflow-hidden">
                      {banner.image_url ? (
                        <img
                          src={banner.image_url}
                          alt={banner.title}
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <div className="text-center p-8 space-y-3">
                          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                            <Printer className="w-8 h-8" />
                          </div>
                          <h3 className="font-bold text-white text-lg">Qualidade Laletra</h3>
                          <p className="text-xs text-slate-300">
                            Equipamentos de alta resolução com acabamentos manuais de excelência.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Banner Dots */}
            {banners.length > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveBannerIndex(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === activeBannerIndex ? 'w-8 bg-emerald-500' : 'w-2 bg-slate-700'
                    }`}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 2. Destaques de Vantagens */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Produção Rápida</h4>
              <p className="text-[11px] text-slate-500">Prazos de 24h a 5 dias úteis</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Checagem de Arte</h4>
              <p className="text-[11px] text-slate-500">Conferência profissional grátis</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Entrega & Balcão</h4>
              <p className="text-[11px] text-slate-500">Envio para todo Brasil ou retirada</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Cores & Fidelidade
              </h4>
              <p className="text-[11px] text-slate-500">Offset calibrado e prova digital</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Grade de Categorias em Carrossel / Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Categorias em Destaque
            </h2>
            <p className="text-xs text-slate-500">
              Encontre o produto gráfico sob medida para o seu objetivo
            </p>
          </div>
          <Link
            to="/loja"
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            Ver catálogo completo <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/loja/categoria/${cat.slug}`}
              className="group p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 hover:shadow-md transition-all text-center flex flex-col items-center justify-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-600 flex items-center justify-center transition-colors">
                <Printer className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                  {cat.name}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Vitrine de Produtos (Destaques ou Busca) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {searchQuery ? `Resultados para "${searchQuery}"` : 'Produtos Mais Populares'}
            </h2>
            <p className="text-xs text-slate-500">
              Preços transparentes, opções de materiais e acabamentos customizáveis
            </p>
          </div>
          {searchQuery && (
            <Link to="/loja">
              <Button variant="ghost" size="sm" className="text-xs">
                Limpar busca
              </Button>
            </Link>
          )}
        </div>

        {displayProducts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
            <FileQuestion className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Nenhum produto encontrado
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Não encontramos nenhum produto publicado com esse termo. Tente buscar por cartões,
              banners ou panfletos.
            </p>
            <Link to="/loja">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                Ver Todos os Produtos
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {displayProducts.map((p) => {
              const priceInfo = getProductStartingPrice(p)

              return (
                <Card
                  key={p.id}
                  className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 hover:shadow-xl transition-all flex flex-col justify-between overflow-hidden rounded-2xl"
                >
                  <Link
                    to={`/loja/produto/${p.seo_slug}`}
                    className="block relative aspect-4/3 bg-slate-100 dark:bg-slate-800 overflow-hidden"
                  >
                    {p.main_image_url ? (
                      <img
                        src={p.main_image_url}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Printer className="w-12 h-12 stroke-[1.5]" />
                      </div>
                    )}

                    {p.badge_label && (
                      <Badge className="absolute top-3 left-3 bg-emerald-600 text-white text-[10px] font-bold shadow-xs">
                        {p.badge_label}
                      </Badge>
                    )}

                    {p.quote_only && (
                      <Badge
                        variant="secondary"
                        className="absolute top-3 right-3 bg-amber-100 text-amber-800 font-bold text-[10px]"
                      >
                        Sob Medida
                      </Badge>
                    )}
                  </Link>

                  <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      {p.category_name && (
                        <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide block">
                          {p.category_name}
                        </span>
                      )}
                      <Link to={`/loja/produto/${p.seo_slug}`}>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 hover:text-emerald-600 transition-colors">
                          {p.name}
                        </h3>
                      </Link>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {p.subtitle ||
                          'Personalize tamanho, papel e acabamento na página do produto.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        {p.quote_only ? (
                          <div>
                            <span className="text-xs font-bold text-amber-600 block">
                              Sob Orçamento
                            </span>
                            <span className="text-[10px] text-slate-400">Consulte valores</span>
                          </div>
                        ) : priceInfo ? (
                          <div>
                            {priceInfo.prefix && (
                              <span className="text-[10px] text-slate-400 block font-medium">
                                {priceInfo.prefix}
                              </span>
                            )}
                            <div className="flex items-baseline gap-1">
                              <span className="text-base font-extrabold text-slate-900 dark:text-white">
                                {formatCurrency(priceInfo.price)}
                              </span>
                              {priceInfo.suffix && (
                                <span className="text-[10px] text-slate-500">
                                  {priceInfo.suffix}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <Link to={`/loja/produto/${p.seo_slug}`}>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold px-3"
                        >
                          Configurar
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* 5. CTA de Orçamento Sob Medida */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-8 space-y-3">
            <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">
              Não encontrou o que procura?
            </span>
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Precisa de um projeto gráfico personalizado ou grandes tiragens?
            </h3>
            <p className="text-sm text-slate-300 max-w-xl">
              Nossa equipe comercial elabora cotações exclusivas com descontos por volume, corte
              especial e visitas técnicas para comunicação visual corporativa.
            </p>
          </div>

          <div className="md:col-span-4 flex flex-col sm:flex-row md:flex-col gap-3 justify-center">
            <Link to="/orcamentos/novo" className="w-full">
              <Button
                size="lg"
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg"
              >
                Fazer Cotação Personalizada
              </Button>
            </Link>
            <a
              href="https://wa.me/5511998819988?text=Ol%C3%A1!%20Gostaria%20de%20um%20or%C3%A7amento%20personalizado%20da%20Laletra%20Store"
              target="_blank"
              rel="noreferrer"
              className="w-full"
            >
              <Button
                variant="outline"
                size="lg"
                className="w-full border-slate-700 text-white hover:bg-slate-800 rounded-xl"
              >
                Falar com Vendedor no WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
