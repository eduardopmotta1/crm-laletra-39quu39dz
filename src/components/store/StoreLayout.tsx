import React, { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  Search,
  ShoppingCart,
  User,
  Menu,
  X,
  Phone,
  Clock,
  ShieldCheck,
  FileText,
  Truck,
  CreditCard,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { storeService } from '@/services/storeService'
import type { StoreCategory, StoreAllSettings } from '@/types/store'
import StoreSidebar from './StoreSidebar'
import StoreFooter from './StoreFooter'
import { DEFAULT_STORE_FOOTER_SETTINGS } from '@/lib/storeFooterDefaults'

export default function StoreLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [mobileCategoriesDrawer, setMobileCategoriesDrawer] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [cartCount, setCartCount] = useState(0)
  const [settings, setSettings] = useState<StoreAllSettings>({
    appearance: {
      primary_color: '#059669',
      secondary_color: '#0f172a',
      button_color: '#059669',
      header_color: '#ffffff',
      bg_color: '#f8fafc',
      text_color: '#0f172a',
      logo_url: '',
      favicon_url: '',
    },
    commercial_info: {
      whatsapp: '+55 (21) 2391-9112',
      phone: '+55 (21) 2391-9112',
      email: 'contato@laletragrafica.com.br',
      business_hours: 'Seg a Sex das 08h às 18h',
      address: 'Av. Marechal Floriano, 19, Sala 301 - Centro, Rio de Janeiro - RJ, 20080-003',
      footer_text:
        'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
      copyright_text: 'Gráfica LaLetra. Todos os direitos reservados.',
    },
    home_layout: {
      show_hero_banners: true,
      show_advantages_bar: true,
      show_categories_grid: true,
      show_featured_products: true,
      show_custom_quote_cta: true,
      hero_title: '',
      hero_subtitle: '',
      featured_product_ids: [],
      custom_quote_title: 'Precisa de um projeto gráfico personalizado ou grandes tiragens?',
      custom_quote_subtitle:
        'Nossa equipe comercial elabora cotações exclusivas com descontos por volume, corte especial e visitas técnicas para comunicação visual corporativa.',
    },
    footer: DEFAULT_STORE_FOOTER_SETTINGS,
  })

  useEffect(() => {
    async function loadData() {
      try {
        const [list, sets] = await Promise.all([
          storeService.getCategories(),
          storeService.getSettings(),
        ])
        setCategories(list)
        if (sets) {
          setSettings(sets)
          if (sets.appearance?.favicon_url) {
            const favicon = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
            if (favicon) {
              favicon.href = sets.appearance.favicon_url
            }
          }
        }
      } catch (err) {
        console.error('Falha ao carregar dados da loja:', err)
      }
    }
    loadData()

    // Ler quantidade do carrinho do localStorage se houver
    const updateCountFromStorage = () => {
      try {
        const savedCart =
          localStorage.getItem('laletra_store_cart_v2') ||
          localStorage.getItem('laletra_store_cart')
        if (savedCart) {
          const parsed = JSON.parse(savedCart)
          if (Array.isArray(parsed)) {
            const total = parsed.reduce(
              (sum: number, it: any) => sum + (Number(it.quantity) || 1),
              0,
            )
            setCartCount(total)
            return
          }
        }
        setCartCount(0)
      } catch {
        /* intentionally ignored */
      }
    }
    updateCountFromStorage()
    window.addEventListener('storage', updateCountFromStorage)
    return () => window.removeEventListener('storage', updateCountFromStorage)
  }, [])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/loja?search=${encodeURIComponent(searchQuery.trim())}`)
    } else {
      navigate('/loja')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Top Utility Bar */}
      <div className="bg-slate-900 text-slate-300 text-xs py-2 px-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              Laletra Store • Produção Própria & Qualidade Gráfica
            </span>
            <span className="hidden md:flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              Seg a Sex das 08h às 18h
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <a
              href="https://wa.me/552123919112"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-slate-300 hover:text-emerald-400 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              +55 (21) 2391-9112
            </a>
            <span className="text-slate-600">|</span>
            <Link
              to="/orcamentos/novo"
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
            >
              <FileText className="w-3.5 h-3.5" />
              Orçamento Sob Medida
            </Link>
            <span className="text-slate-600">|</span>
            <Link
              to="/login"
              className="text-slate-400 hover:text-emerald-400 flex items-center gap-1 font-medium transition-colors"
              title="Acesso de operadores ao CRM"
            >
              <User className="w-3.5 h-3.5" />
              Área da Equipe
            </Link>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-4">
            {/* Mobile Menu Button */}
            <div className="flex items-center lg:hidden">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMobileCategoriesDrawer(true)}
                className="p-2 text-slate-600 dark:text-slate-300 gap-1.5 text-xs font-bold"
                aria-label="Menu de categorias"
              >
                <Layers className="h-5 w-5 text-emerald-600" />
                <span className="hidden sm:inline">Categorias</span>
              </Button>
            </div>

            {/* Brand Logo */}
            <Link to="/loja" className="flex items-center gap-3 group">
              {settings.appearance.logo_url ? (
                <img
                  src={settings.appearance.logo_url}
                  alt="LaLetra Store"
                  className="h-11 max-w-[190px] object-contain"
                />
              ) : (
                <div
                  className="w-11 h-11 rounded-xl text-white flex items-center justify-center font-serif font-black text-2xl tracking-tighter shadow-md transition-all"
                  style={{ backgroundColor: settings.appearance.primary_color || '#059669' }}
                >
                  <span className="italic">L</span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="font-serif font-black text-xl tracking-tight"
                    style={{ color: settings.appearance.text_color || undefined }}
                  >
                    LaLetra
                  </span>
                  <span
                    className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded font-bold border"
                    style={{
                      borderColor: settings.appearance.primary_color || '#059669',
                      color: settings.appearance.primary_color || '#059669',
                    }}
                  >
                    STORE
                  </span>
                </div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                  Gráfica & Comunicação Visual
                </p>
              </div>
            </Link>

            {/* Search Bar Desktop */}
            <form
              onSubmit={handleSearchSubmit}
              className="hidden lg:flex flex-1 max-w-lg mx-6 relative"
            >
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Busque por cartões, banners, adesivos, panfletos..."
                className="w-full pl-11 pr-24 py-5 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-full text-sm focus-visible:ring-emerald-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <Button
                type="submit"
                size="sm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-xs px-4"
              >
                Buscar
              </Button>
            </form>

            {/* User Actions */}
            <div className="flex items-center gap-3">
              <Link to="/loja/conta" className="hidden sm:inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-700 dark:text-slate-300"
                >
                  <User className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-semibold">Minha Conta</span>
                </Button>
              </Link>

              <div className="relative">
                <Link to="/loja/carrinho">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full gap-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 px-3.5"
                  >
                    <ShoppingCart className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold hidden sm:inline">Meu Carrinho</span>
                    {cartCount > 0 && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center rounded-full font-bold">
                        {cartCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Search bar mobile */}
          <div className="pb-3 lg:hidden">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar produtos e acabamentos..."
                className="w-full pl-10 pr-20 py-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-full text-xs"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <Button
                type="submit"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-xs px-3 py-1 h-7"
              >
                Buscar
              </Button>
            </form>
          </div>
        </div>

        {/* Mobile Bar com Botão Categorias */}
        <div className="lg:hidden bg-slate-100/90 dark:bg-slate-950/80 border-t border-slate-200/70 dark:border-slate-800 py-2 px-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileCategoriesDrawer(true)}
            className="text-xs gap-2 font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-xs text-slate-800 dark:text-slate-100"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            Departamentos & Categorias
          </Button>

          <span className="text-[11px] text-slate-500 font-medium">
            {categories.length} seções disponíveis
          </span>
        </div>
      </header>

      {/* Mobile Drawer de Categorias (Drawer recolhível) */}
      {mobileCategoriesDrawer && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setMobileCategoriesDrawer(false)}
          />
          <div className="relative w-4/5 max-w-sm bg-white dark:bg-slate-900 h-full shadow-2xl p-4 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-300">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center font-serif font-black text-sm">
                    <span className="italic">L</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Departamentos
                    </h2>
                    <p className="text-[10px] text-slate-400">Navegue por nossas categorias</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileCategoriesDrawer(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sidebar dentro do Drawer Mobile */}
              <StoreSidebar
                categories={categories}
                onSelectCategory={() => setMobileCategoriesDrawer(false)}
              />
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 mt-4">
              <Link
                to="/loja/conta"
                onClick={() => setMobileCategoriesDrawer(false)}
                className="w-full block"
              >
                <Button variant="outline" className="w-full text-xs gap-2">
                  <User className="w-4 h-4" /> Minha Conta / Pedidos
                </Button>
              </Link>
              <Link
                to="/login"
                onClick={() => setMobileCategoriesDrawer(false)}
                className="w-full block"
              >
                <Button
                  variant="ghost"
                  className="w-full text-xs text-slate-400 hover:text-slate-200"
                >
                  Acesso Equipe (CRM)
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Container com Menu Lateral Desktop Fixo/Sticky e Conteúdo à Direita */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
          {/* Menu Lateral Esquerdo no Desktop */}
          <div className="hidden lg:block lg:col-span-3 sticky top-28 self-start z-10">
            <StoreSidebar categories={categories} />
          </div>

          {/* Área de Conteúdo à Direita (Banners, Vitrine de Produtos, Páginas) */}
          <div className="lg:col-span-9 w-full min-w-0">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Rodapé 100% Dinâmico e Customizável */}
      <StoreFooter
        footer={settings.footer || DEFAULT_STORE_FOOTER_SETTINGS}
        categories={categories}
      />
    </div>
  )
}
