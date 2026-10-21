import React, { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Printer,
  ChevronRight,
  FileQuestion,
  Layers,
  ArrowUpDown,
  ChevronLeft,
  Tag,
  ArrowRight,
} from 'lucide-react'
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

const PRODUCTS_PER_PAGE = 12

export default function StoreCategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const [category, setCategory] = useState<StoreCategory | null>(null)
  const [allCategories, setAllCategories] = useState<StoreCategory[]>([])
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('order')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    async function loadCategoryAndProducts() {
      if (!slug) return
      try {
        setLoading(true)
        setCurrentPage(1)

        const [cats, prods] = await Promise.all([
          storeService.getCategories(),
          storeService.getProducts({ category: slug }),
        ])

        setAllCategories(cats)

        // Tenta resolver a categoria pelo slug ou pelo id (compatibilidade retroativa)
        const currentCat = cats.find((c) => c.slug === slug || c.id === slug) || null
        setCategory(currentCat)

        // Deduplicação estrita de produtos por ID
        const uniqueProdsMap = new Map<string, StoreProduct>()
        for (const p of prods) {
          if (p && p.id && !uniqueProdsMap.has(p.id)) {
            uniqueProdsMap.set(p.id, p)
          }
        }
        setProducts(Array.from(uniqueProdsMap.values()))
      } catch (err) {
        console.error('Erro ao carregar categoria da loja:', err)
      } finally {
        setLoading(false)
      }
    }

    loadCategoryAndProducts()
  }, [slug])

  // Subcategorias filhas da categoria atual (se houver)
  const subcategories = useMemo(() => {
    if (!category) return []
    return allCategories.filter((c) => c.parent_id === category.id && c.is_active !== false)
  }, [category, allCategories])

  // Cadeia completa de ancestrais para o breadcrumb (da raiz até a categoria pai imediata)
  const breadcrumbTrail = useMemo(() => {
    if (!category) return []
    const trail: StoreCategory[] = []
    let currParentId = category.parent_id
    const visited = new Set<string>()

    while (currParentId && !visited.has(currParentId)) {
      visited.add(currParentId)
      const parent = allCategories.find((c) => c.id === currParentId)
      if (parent) {
        trail.unshift(parent)
        currParentId = parent.parent_id
      } else {
        break
      }
    }
    return trail
  }, [category, allCategories])

  // Categoria pai imediata (para badges informativos)
  const parentCategory = useMemo(() => {
    if (breadcrumbTrail.length === 0) return null
    return breadcrumbTrail[breadcrumbTrail.length - 1]
  }, [breadcrumbTrail])

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

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
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
  }, [products, sortBy])

  // Paginação
  const totalPages = Math.ceil(sortedProducts.length / PRODUCTS_PER_PAGE) || 1
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE
    return sortedProducts.slice(start, start + PRODUCTS_PER_PAGE)
  }, [sortedProducts, currentPage])

  return (
    <div className="space-y-6">
      {/* Breadcrumb navegável com suporte a cadeia completa de múltiplos níveis */}
      <nav className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
        <Link to="/loja" className="hover:text-emerald-600 transition-colors">
          Loja
        </Link>
        {breadcrumbTrail.map((ancestor) => (
          <React.Fragment key={ancestor.id}>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <Link
              to={`/loja/categoria/${ancestor.slug}`}
              className="hover:text-emerald-600 transition-colors"
            >
              {ancestor.name}
            </Link>
          </React.Fragment>
        ))}
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 dark:text-white font-medium">
          {category ? category.name : slug}
        </span>
      </nav>

      {/* Header da Categoria com Imagem/Ícone quando disponível */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start sm:items-center gap-4 max-w-2xl">
          {category?.image_url && (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-center p-1">
              <img
                src={category.image_url}
                alt={category.name}
                className="w-full h-full object-contain"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5">
                {parentCategory ? `Subcategoria de ${parentCategory.name}` : 'Categoria'}
              </Badge>
              <span className="text-xs text-slate-400">
                {products.length} {products.length === 1 ? 'produto ativo' : 'produtos ativos'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              {category ? category.name : slug}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              {category?.description ||
                'Explore todas as especificações, faixas de quantidade, papéis e acabamentos disponíveis para esta categoria.'}
            </p>
          </div>
        </div>

        {/* Filtros rápidos e ordenação */}
        <div className="flex items-center gap-3 self-start md:self-center">
          <Select
            value={sortBy}
            onValueChange={(val) => {
              setSortBy(val)
              setCurrentPage(1)
            }}
          >
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

      {/* Subcategorias vinculadas (navegação rápida quando a categoria possui filhos) */}
      {subcategories.length > 0 && (
        <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Subdepartamentos de {category?.name}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {subcategories.map((sub) => (
              <Link key={sub.id} to={`/loja/categoria/${sub.slug}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs rounded-xl hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 gap-1.5 transition-all"
                >
                  <Tag className="w-3 h-3 text-emerald-600" />
                  <span>{sub.name}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>
      )}

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
              solicitar um orçamento sob medida com nossa equipe técnica.
            </p>
          </div>
          <Link to="/orcamentos/novo">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
              Solicitar Orçamento Personalizado
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {paginatedProducts.map((p) => {
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

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 px-2"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 px-3">
                Página {currentPage} de {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 px-2"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
