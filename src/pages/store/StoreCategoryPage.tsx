import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Printer, ChevronRight, Filter, FileQuestion, Layers, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { storeService } from '@/services/storeService'
import type { StoreCategory, StoreProduct } from '@/types/store'

export default function StoreCategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const [category, setCategory] = useState<StoreCategory | null>(null)
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('order')

  useEffect(() => {
    async function loadCategoryAndProducts() {
      if (!slug) return
      try {
        setLoading(true)
        const [cats, prods] = await Promise.all([
          storeService.getCategories(),
          storeService.getProducts({ category: slug }),
        ])

        const currentCat = cats.find((c) => c.slug === slug) || null
        setCategory(currentCat)
        setProducts(prods)
      } catch (err) {
        console.error('Erro ao carregar categoria da loja:', err)
      } finally {
        setLoading(false)
      }
    }

    loadCategoryAndProducts()
  }, [slug])

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

  const sortedProducts = [...products].sort((a, b) => {
    if (sortBy === 'price_asc') {
      const pA = getProductStartingPrice(a)?.price || 0
      const pB = getProductStartingPrice(b)?.price || 0
      return pA - pB
    }
    if (sortBy === 'price_desc') {
      const pA = getProductStartingPrice(a)?.price || 0
      const pB = getProductStartingPrice(b)?.price || 0
      return pB - pA
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name)
    }
    return (a.order_index || 0) - (b.order_index || 0)
  })

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/loja" className="hover:text-emerald-600 transition-colors">
          Loja
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 dark:text-white font-medium">
          {category ? category.name : slug}
        </span>
      </nav>

      {/* Header da Categoria */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <Badge className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5">
            Categoria
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {category ? category.name : slug}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            {category?.description ||
              'Explore todas as especificações, faixas de quantidade, papéis e acabamentos disponíveis para esta categoria.'}
          </p>
        </div>

        {/* Filtros rápidos e ordenação */}
        <div className="flex items-center gap-3 self-start md:self-center">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px] bg-slate-50 dark:bg-slate-800 text-xs rounded-xl">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="order">Destaques da Gráfica</SelectItem>
              <SelectItem value="price_asc">Menor Preço</SelectItem>
              <SelectItem value="price_desc">Maior Preço</SelectItem>
              <SelectItem value="name">Nome (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid de Produtos da Categoria */}
      {sortedProducts.length === 0 && !loading ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-4">
          <FileQuestion className="w-12 h-12 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
              Nenhum produto cadastrado nesta categoria
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Em breve disponibilizaremos mais modelos e opções nesta seção. Você também pode
              solicitar um orçamento sob medida.
            </p>
          </div>
          <Link to="/orcamentos/novo">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
              Solicitar Orçamento Personalizado
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {sortedProducts.map((p) => {
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
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800/80 p-4 text-center">
                      <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 shadow-xs flex items-center justify-center text-emerald-600 mb-2">
                        <Printer className="w-6 h-6 stroke-[1.5]" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 font-serif">
                        Gráfica LaLetra
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {p.unit_label || 'Configurável'}
                      </span>
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
                              <span className="text-[10px] text-slate-500">{priceInfo.suffix}</span>
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
    </div>
  )
}
