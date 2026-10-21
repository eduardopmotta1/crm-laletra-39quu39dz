import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ChevronRight,
  Printer,
  Sparkles,
  Layers,
  CreditCard,
  Image as ImageIcon,
  Tag,
  FileSpreadsheet,
  Folder,
  Gift,
  Check,
} from 'lucide-react'
import type { StoreCategory } from '@/types/store'

const iconMap: Record<string, React.ReactNode> = {
  CreditCard: <CreditCard className="w-4 h-4" />,
  Image: <ImageIcon className="w-4 h-4" />,
  Tag: <Tag className="w-4 h-4" />,
  FileSpreadsheet: <FileSpreadsheet className="w-4 h-4" />,
  Folder: <Folder className="w-4 h-4" />,
  Gift: <Gift className="w-4 h-4" />,
}

interface StoreSidebarProps {
  categories: StoreCategory[]
  onSelectCategory?: () => void
  currentCategorySlug?: string
  className?: string
}

export function buildCategoryTree(flatCategories: StoreCategory[]): StoreCategory[] {
  const map = new Map<string, StoreCategory>()
  const roots: StoreCategory[] = []

  // Clonar para evitar mutações indesejadas
  flatCategories.forEach((cat) => {
    map.set(cat.id, { ...cat, children: [] })
  })

  flatCategories.forEach((cat) => {
    const node = map.get(cat.id)!
    if (cat.parent_id && map.has(cat.parent_id)) {
      const parent = map.get(cat.parent_id)!
      if (!parent.children) parent.children = []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })

  // Ordenar raízes e filhos por order_index
  roots.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  roots.forEach((root) => {
    if (root.children && root.children.length > 0) {
      root.children.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    }
  })

  return roots
}

export default function StoreSidebar({
  categories,
  onSelectCategory,
  currentCategorySlug,
  className = '',
}: StoreSidebarProps) {
  const location = useLocation()
  const tree = React.useMemo(() => buildCategoryTree(categories), [categories])

  // Determina o slug ativo (passado por prop ou obtido da URL /loja/categoria/:slug)
  const activeSlug = React.useMemo(() => {
    if (currentCategorySlug) return currentCategorySlug
    const match = location.pathname.match(/^\/loja\/categoria\/([^/]+)/)
    return match ? decodeURIComponent(match[1]) : ''
  }, [currentCategorySlug, location.pathname])

  // Identificar categorias com filhos para expansão
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    // Se a categoria selecionada for filha de alguém, abre o pai por padrão
    categories.forEach((cat) => {
      if (activeSlug && (cat.slug === activeSlug || cat.id === activeSlug) && cat.parent_id) {
        initial[cat.parent_id] = true
      }
    })
    return initial
  })

  // Sincronizar expansão quando a rota mudar para uma subcategoria ou categoria com filhos
  React.useEffect(() => {
    if (!activeSlug) return
    const activeCat = categories.find((c) => c.slug === activeSlug || c.id === activeSlug)
    if (activeCat?.parent_id) {
      setExpandedCats((prev) => ({ ...prev, [activeCat.parent_id!]: true }))
    }
  }, [activeSlug, categories])

  const toggleExpand = (catId: string) => {
    setExpandedCats((prev) => ({ ...prev, [catId]: !prev[catId] }))
  }

  const isAllSelected = location.pathname === '/loja' || location.pathname === '/'

  return (
    <aside
      className={`w-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden ${className}`}
    >
      {/* Top Header do Menu */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Departamentos
          </h3>
        </div>
        <span className="text-[10px] text-slate-400 font-medium">{categories.length} seções</span>
      </div>

      {/* Lista de Navegação com Rolagem Independente */}
      <nav className="p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-220px)] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
        {/* Link: Todos os Produtos */}
        <NavLink
          to="/loja"
          end
          onClick={onSelectCategory}
          className={({ isActive }) =>
            `group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              isActive || isAllSelected
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200/60 dark:border-emerald-800/60 shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
            }`
          }
        >
          <div className="flex items-center gap-2.5 truncate">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                isAllSelected
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-emerald-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="truncate">Todos os Produtos</span>
          </div>
          {isAllSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
        </NavLink>

        {/* Categorias e Subcategorias Dinâmicas */}
        {tree.map((cat) => {
          const hasChildren = Boolean(cat.children && cat.children.length > 0)
          const isExpanded = !!expandedCats[cat.id]
          const isCurrentActive =
            cat.slug === activeSlug || location.pathname === `/loja/categoria/${cat.slug}`
          const isChildActive = Boolean(
            hasChildren &&
            cat.children?.some(
              (sub) =>
                sub.slug === activeSlug || location.pathname === `/loja/categoria/${sub.slug}`,
            ),
          )
          const isParentHighlighted = isCurrentActive || isChildActive
          const subcategoryId = `subcategories-${cat.id}`

          const categoryIcon = (
            <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200/60 dark:border-slate-700/60">
              {cat.image_url ? (
                <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
              ) : cat.icon && iconMap[cat.icon] ? (
                <span className="text-emerald-600">{iconMap[cat.icon]}</span>
              ) : (
                <Printer className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
              )}
            </div>
          )

          return (
            <div key={cat.id} className="space-y-0.5">
              <div className="flex items-center">
                {hasChildren ? (
                  /* Categoria COM subcategorias: o elemento inteiro é um botão que expande/recolhe */
                  <button
                    type="button"
                    onClick={() => toggleExpand(cat.id)}
                    aria-expanded={isExpanded}
                    aria-controls={subcategoryId}
                    className={`w-full group flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium transition-all text-left select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      isParentHighlighted
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200/60 dark:border-emerald-800/60 shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {categoryIcon}
                      <span className="truncate">{cat.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isChildActive && !isCurrentActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                      )}
                      {isCurrentActive && (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      <span
                        className="p-1 rounded-md text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors"
                        aria-hidden="true"
                      >
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform duration-200 ease-in-out ${
                            isExpanded ? 'rotate-90 text-emerald-600 dark:text-emerald-400' : ''
                          }`}
                        />
                      </span>
                    </div>
                  </button>
                ) : (
                  /* Categoria SEM subcategorias: clique abre direto a página da categoria */
                  <NavLink
                    to={`/loja/categoria/${cat.slug}`}
                    onClick={onSelectCategory}
                    className={({ isActive }) =>
                      `flex-1 group flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        isActive || isCurrentActive
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200/60 dark:border-emerald-800/60 shadow-xs'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                      }`
                    }
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {categoryIcon}
                      <span className="truncate">{cat.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrentActive && (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                    </div>
                  </NavLink>
                )}
              </div>

              {/* Subcategorias Indentadas */}
              {hasChildren && isExpanded && (
                <div
                  id={subcategoryId}
                  role="region"
                  aria-label={`Subcategorias de ${cat.name}`}
                  className="pl-7 pr-1 py-1 space-y-1 border-l-2 border-emerald-100 dark:border-emerald-950/60 ml-4 animate-in fade-in slide-in-from-top-1 duration-200"
                >
                  {/* Link "Ver todos": acesso direto a todos os produtos da categoria pai */}
                  <NavLink
                    to={`/loja/categoria/${cat.slug}`}
                    onClick={onSelectCategory}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-2.5 py-2 min-h-[36px] rounded-lg text-[11px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        isActive || isCurrentActive
                          ? 'bg-emerald-100/80 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200 font-bold border border-emerald-200/70 dark:border-emerald-800/70'
                          : 'text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 font-medium italic'
                      }`
                    }
                  >
                    <span className="truncate">Ver todos em {cat.name}</span>
                    {isCurrentActive && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
                  </NavLink>

                  {cat.children!.map((sub) => {
                    const isSubActive =
                      sub.slug === activeSlug || location.pathname === `/loja/categoria/${sub.slug}`

                    return (
                      <NavLink
                        key={sub.id}
                        to={`/loja/categoria/${sub.slug}`}
                        onClick={onSelectCategory}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-2.5 py-2 min-h-[36px] rounded-lg text-[11px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                            isActive || isSubActive
                              ? 'bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 hover:bg-slate-100/50 dark:hover:bg-slate-800/40'
                          }`
                        }
                      >
                        <span className="truncate">{sub.name}</span>
                        {isSubActive && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Box Inferior: Atendimento Rápido */}
      <div className="p-3.5 m-2 mt-auto bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-slate-800/40 rounded-xl border border-emerald-100 dark:border-emerald-900/40 text-xs">
        <p className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">
          Dúvidas no pedido?
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          Fale com nossa equipe técnica pelo WhatsApp.
        </p>
        <a
          href="https://wa.me/552123919112?text=Ol%C3%A1,%20gostaria%20de%20ajuda%20com%20meu%20pedido%20na%20LaLetra%20Store"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400 hover:underline text-[11px]"
        >
          Conversar no WhatsApp →
        </a>
      </div>
    </aside>
  )
}
