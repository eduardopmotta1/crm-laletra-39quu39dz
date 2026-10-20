import React, { useState, useEffect } from 'react'
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Printer,
  Search,
  ShoppingCart,
  User,
  Menu,
  X,
  Phone,
  Clock,
  ShieldCheck,
  ChevronRight,
  FileText,
  Truck,
  CreditCard,
  Image as ImageIcon,
  Tag,
  Folder,
  Gift,
  FileSpreadsheet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { storeService } from '@/services/storeService'
import type { StoreCategory } from '@/types/store'

const iconMap: Record<string, React.ReactNode> = {
  CreditCard: <CreditCard className="w-4 h-4" />,
  Image: <ImageIcon className="w-4 h-4" />,
  Tag: <Tag className="w-4 h-4" />,
  FileSpreadsheet: <FileSpreadsheet className="w-4 h-4" />,
  Folder: <Folder className="w-4 h-4" />,
  Gift: <Gift className="w-4 h-4" />,
}

export default function StoreLayout() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [cartCount, setCartCount] = useState(0)

  useEffect(() => {
    async function loadCats() {
      try {
        const list = await storeService.getCategories()
        setCategories(list)
      } catch (err) {
        console.error('Falha ao carregar categorias da loja:', err)
      }
    }
    loadCats()

    // Ler quantidade do carrinho do localStorage se houver
    try {
      const savedCart = localStorage.getItem('laletra_store_cart')
      if (savedCart) {
        const parsed = JSON.parse(savedCart)
        if (Array.isArray(parsed)) setCartCount(parsed.length)
      }
    } catch {
      /* intentionally ignored */
    }
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
            <span className="flex items-center gap-1 text-slate-300 hover:text-white">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              (11) 99881-9988
            </span>
            <span className="text-slate-600">|</span>
            <Link
              to="/orcamentos/novo"
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
            >
              <FileText className="w-3.5 h-3.5" />
              Solicitar Orçamento Personalizado
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
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Menu de categorias"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>

            {/* Brand Logo */}
            <Link to="/loja" className="flex items-center gap-3 group">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 group-hover:bg-emerald-500 text-white flex items-center justify-center font-black text-2xl tracking-tighter shadow-md shadow-emerald-600/20 transition-all">
                L
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
                    LALETRA
                  </span>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold py-0 px-1.5"
                  >
                    Store
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500 font-medium tracking-wide">
                  Gráfica Rápida & Comunicação Visual
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
              <Link to="/login" className="hidden sm:inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-700 dark:text-slate-300"
                >
                  <User className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-semibold">Área do Cliente</span>
                </Button>
              </Link>

              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    alert(
                      'Carrinho rápido: Os itens selecionados podem ser cotados ou convertidos em pedido pelo atendente.',
                    )
                  }
                  className="rounded-full gap-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 px-3.5"
                >
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold hidden sm:inline">Meu Pedido</span>
                  {cartCount > 0 && (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center rounded-full font-bold">
                      {cartCount}
                    </Badge>
                  )}
                </Button>
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

        {/* Categories Bar Navigation */}
        <nav className="hidden lg:block bg-slate-100/70 dark:bg-slate-950/60 border-t border-slate-200/70 dark:border-slate-800 text-xs font-medium">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto py-2 scrollbar-none">
            <NavLink
              to="/loja"
              end
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-emerald-600 hover:bg-white/50'
                }`
              }
            >
              Todos os Produtos
            </NavLink>

            {categories.map((cat) => (
              <NavLink
                key={cat.id}
                to={`/loja/categoria/${cat.slug}`}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:text-emerald-600 hover:bg-white/50'
                  }`
                }
              >
                {cat.icon && iconMap[cat.icon] ? (
                  <span className="text-slate-400">{iconMap[cat.icon]}</span>
                ) : null}
                {cat.name}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-4/5 max-w-sm bg-white dark:bg-slate-900 h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                    L
                  </div>
                  <span className="font-extrabold text-slate-900 dark:text-white">Categorias</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-1">
                <Link
                  to="/loja"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span>Todos os Produtos</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>

                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    to={`/loja/categoria/${cat.slug}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between p-2.5 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center gap-2.5">
                      {cat.icon && iconMap[cat.icon] ? (
                        <span className="text-emerald-600">{iconMap[cat.icon]}</span>
                      ) : null}
                      <span>{cat.name}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="w-full block">
                <Button variant="outline" className="w-full text-xs gap-2">
                  <User className="w-4 h-4" /> Entrar no CRM
                </Button>
              </Link>
              <p className="text-[11px] text-center text-slate-400">
                Laletra Gráfica e Comunicação Visual
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Page Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Institutional Footer */}
      <footer className="bg-slate-900 text-slate-400 text-sm border-t border-slate-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Col 1: Sobre */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-2xl tracking-tighter">
                  L
                </div>
                <div>
                  <h3 className="text-white font-extrabold text-lg">Gráfica Laletra</h3>
                  <p className="text-xs text-slate-400">Desde 2012 inovando em impressão</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e
                atendimento humanizado para potencializar a marca da sua empresa.
              </p>
            </div>

            {/* Col 2: Categorias */}
            <div className="space-y-3">
              <h4 className="text-white text-xs font-bold uppercase tracking-wider">
                Categorias Populares
              </h4>
              <ul className="space-y-2 text-xs">
                {categories.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/loja/categoria/${c.slug}`}
                      className="hover:text-emerald-400 transition-colors"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3: Serviços & Vantagens */}
            <div className="space-y-3">
              <h4 className="text-white text-xs font-bold uppercase tracking-wider">
                Diferenciais
              </h4>
              <ul className="space-y-2 text-xs">
                <li className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Entrega rápida ou retirada balcão</span>
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Conferência técnica de arquivos gratuita</span>
                </li>
                <li className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Condições especiais para empresas</span>
                </li>
              </ul>
            </div>

            {/* Col 4: Contato */}
            <div className="space-y-3">
              <h4 className="text-white text-xs font-bold uppercase tracking-wider">Atendimento</h4>
              <p className="text-xs text-slate-300 font-medium">WhatsApp Comercial:</p>
              <p className="text-sm text-emerald-400 font-bold">(11) 99881-9988</p>
              <p className="text-xs text-slate-400">contato@laletragrafica.com.br</p>
              <div className="pt-2">
                <Link to="/loja-admin">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-8 border-slate-700 text-slate-300 hover:text-white"
                  >
                    Gerenciar Loja (Admin)
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-800 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>
              © {new Date().getFullYear()} Gráfica Laletra. Todos os direitos reservados. CNPJ:
              00.000.000/0001-00
            </p>
            <div className="flex gap-4">
              <span className="hover:text-slate-400">Termos de Uso</span>
              <span>•</span>
              <span className="hover:text-slate-400">Política de Privacidade</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
