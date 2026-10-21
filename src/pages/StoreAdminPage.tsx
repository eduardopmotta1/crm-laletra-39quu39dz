import React, { useState, useEffect } from 'react'
import {
  Store,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  FolderTree,
  Tag,
  Palette,
  Home,
  PhoneCall,
  Save,
  RotateCcw,
  ExternalLink,
  Layers,
  Sparkles,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { storeService } from '@/services/storeService'
import ImageUploader from '@/components/store/ImageUploader'
import type {
  StoreCategory,
  StoreProduct,
  StoreBanner,
  PricingType,
  StoreAllSettings,
  StoreAppearanceSettings,
  StoreCommercialInfoSettings,
  StoreHomeLayoutSettings,
} from '@/types/store'

const DEFAULT_SETTINGS: StoreAllSettings = {
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
}

export default function StoreAdminPage() {
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState('appearance')
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [banners, setBanners] = useState<StoreBanner[]>([])
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  // Configurações Consolidadas
  const [settings, setSettings] = useState<StoreAllSettings>(DEFAULT_SETTINGS)

  // Dialogs
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false)

  // Form States para Entidades
  const [editingProduct, setEditingProduct] = useState<Partial<StoreProduct> | null>(null)
  const [editingCategory, setEditingCategory] = useState<Partial<StoreCategory> | null>(null)
  const [editingBanner, setEditingBanner] = useState<Partial<StoreBanner> | null>(null)

  // JSON string helpers para campos complexos do produto
  const [priceTiersJson, setPriceTiersJson] = useState('[]')
  const [optionsJson, setOptionsJson] = useState('[]')
  const [finishingsJson, setFinishingsJson] = useState('[]')

  const loadAll = async () => {
    try {
      setLoading(true)
      const [cats, prods, bans, sets] = await Promise.all([
        storeService.adminGetAllCategories(),
        storeService.adminGetAllProducts(),
        storeService.adminGetAllBanners(),
        storeService.getSettings(),
      ])
      setCategories(cats)
      setProducts(prods)
      setBanners(bans)
      if (sets) {
        setSettings({
          appearance: { ...DEFAULT_SETTINGS.appearance, ...(sets.appearance || {}) },
          commercial_info: {
            ...DEFAULT_SETTINGS.commercial_info,
            ...(sets.commercial_info || {}),
          },
          home_layout: { ...DEFAULT_SETTINGS.home_layout, ...(sets.home_layout || {}) },
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dados da Loja',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // ====================
  // CONFIGURAÇÕES (Salvar no backend com validação)
  // ====================
  const handleSaveAppearance = async () => {
    try {
      setSavingSettings(true)
      await storeService.adminSaveSetting('appearance', settings.appearance)
      toast({
        title: 'Aparência atualizada!',
        description: 'As cores e logotipo foram gravados e já refletem na loja pública.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar aparência',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleResetDefaultColors = () => {
    setSettings((prev) => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        primary_color: DEFAULT_SETTINGS.appearance.primary_color,
        secondary_color: DEFAULT_SETTINGS.appearance.secondary_color,
        button_color: DEFAULT_SETTINGS.appearance.button_color,
        header_color: DEFAULT_SETTINGS.appearance.header_color,
        bg_color: DEFAULT_SETTINGS.appearance.bg_color,
        text_color: DEFAULT_SETTINGS.appearance.text_color,
      },
    }))
    toast({
      title: 'Cores restauradas para o padrão',
      description: 'Clique em "Salvar Aparência" para confirmar as mudanças.',
    })
  }

  const handleSaveCommercialInfo = async () => {
    try {
      setSavingSettings(true)
      await storeService.adminSaveSetting('commercial_info', settings.commercial_info)
      toast({
        title: 'Informações comerciais atualizadas!',
        description: 'Telefone, WhatsApp e endereços foram atualizados no cabeçalho e rodapé.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar informações comerciais',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSaveHomeLayout = async () => {
    try {
      setSavingSettings(true)
      await storeService.adminSaveSetting('home_layout', settings.home_layout)
      toast({
        title: 'Layout da Home atualizado!',
        description: 'As seções e textos foram atualizados.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar seções da Home',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSavingSettings(false)
    }
  }

  // ====================
  // PRODUTOS CRUD
  // ====================
  const handleOpenNewProduct = () => {
    setEditingProduct({
      name: '',
      seo_slug: '',
      subtitle: '',
      description_public: '',
      pricing_type: 'quantity_tiers',
      store_price: 100,
      lead_time_days: 3,
      published: true,
      featured: false,
      quote_only: false,
      order_index: (products.length + 1) * 10,
      main_image_url: '',
    })
    setPriceTiersJson(
      JSON.stringify(
        [
          { quantity: 500, price: 100, label: '500 un' },
          { quantity: 1000, price: 160, label: '1.000 un' },
        ],
        null,
        2,
      ),
    )
    setOptionsJson('[]')
    setFinishingsJson('[]')
    setProductDialogOpen(true)
  }

  const handleEditProduct = (prod: StoreProduct) => {
    setEditingProduct(prod)
    setPriceTiersJson(JSON.stringify(prod.price_tiers || [], null, 2))
    setOptionsJson(JSON.stringify(prod.options || [], null, 2))
    setFinishingsJson(JSON.stringify(prod.finishings || [], null, 2))
    setProductDialogOpen(true)
  }

  const handleSaveProduct = async () => {
    if (!editingProduct || !editingProduct.name || !editingProduct.seo_slug) {
      toast({ title: 'Preencha os campos obrigatórios (Nome e Slug SEO)', variant: 'destructive' })
      return
    }

    try {
      let parsedTiers = []
      let parsedOptions = []
      let parsedFinishings = []

      try {
        parsedTiers = JSON.parse(priceTiersJson || '[]')
      } catch (_) {
        throw new Error('JSON de Faixas de Quantidade inválido')
      }
      try {
        parsedOptions = JSON.parse(optionsJson || '[]')
      } catch (_) {
        throw new Error('JSON de Variações/Opções inválido')
      }
      try {
        parsedFinishings = JSON.parse(finishingsJson || '[]')
      } catch (_) {
        throw new Error('JSON de Acabamentos inválido')
      }

      const payload: any = {
        name: editingProduct.name,
        seo_slug: editingProduct.seo_slug,
        subtitle: editingProduct.subtitle || '',
        description_public: editingProduct.description_public || '',
        category_id: editingProduct.category_id || null,
        pricing_type: editingProduct.pricing_type || 'quantity_tiers',
        store_price: Number(editingProduct.store_price) || 0,
        sqm_base_price: Number(editingProduct.sqm_base_price) || 0,
        sqm_min_area: Number(editingProduct.sqm_min_area) || 0,
        price_tiers: parsedTiers,
        options: parsedOptions,
        finishings: parsedFinishings,
        lead_time_days: Number(editingProduct.lead_time_days) || 3,
        quote_only: editingProduct.quote_only === true,
        published: editingProduct.published === true,
        featured: editingProduct.featured === true,
        order_index: Number(editingProduct.order_index) || 0,
        badge_label: editingProduct.badge_label || null,
        unit_label: editingProduct.unit_label || null,
      }

      if (editingProduct.id) {
        await storeService.adminUpdateProduct(editingProduct.id, payload)
        toast({ title: 'Produto atualizado com sucesso!' })
      } else {
        await storeService.adminCreateProduct(payload)
        toast({ title: 'Produto criado com sucesso na Loja!' })
      }

      setProductDialogOpen(false)
      loadAll()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar produto', description: err.message, variant: 'destructive' })
    }
  }

  const handleTogglePublishProduct = async (prod: StoreProduct) => {
    try {
      await storeService.adminUpdateProduct(prod.id, { published: !prod.published })
      toast({
        title: prod.published
          ? 'Produto desativado/oculto do catálogo'
          : 'Produto ativado na loja!',
      })
      loadAll()
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar visibilidade',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleDeleteProduct = async (prod: StoreProduct) => {
    // Regra de segurança: Preferir desativar para não quebrar integridade de pedidos vinculados
    if (prod.published) {
      const confirmDeact = confirm(
        `Deseja DESATIVAR o produto "${prod.name}" da loja? Ele deixará de ser visível no catálogo, preservando pedidos anteriores com segurança.`,
      )
      if (confirmDeact) {
        await storeService.adminUpdateProduct(prod.id, { published: false })
        toast({ title: 'Produto desativado com segurança!' })
        loadAll()
      }
      return
    }

    if (!confirm(`Deseja realmente remover permanentemente "${prod.name}"?`)) return
    try {
      await storeService.adminDeleteProduct(prod.id)
      toast({ title: 'Produto removido com sucesso.' })
      loadAll()
    } catch (err: any) {
      toast({ title: 'Erro ao excluir produto', description: err.message, variant: 'destructive' })
    }
  }

  // ====================
  // CATEGORIAS CRUD (com suporte a subcategorias parent_id)
  // ====================
  const handleOpenNewCategory = () => {
    setEditingCategory({
      name: '',
      slug: '',
      description: '',
      order_index: (categories.length + 1) * 10,
      is_active: true,
      parent_id: null,
      image_url: '',
    })
    setCategoryDialogOpen(true)
  }

  const handleSaveCategory = async () => {
    if (!editingCategory || !editingCategory.name || !editingCategory.slug) {
      toast({ title: 'Preencha o Nome e o Slug da Categoria', variant: 'destructive' })
      return
    }

    try {
      const payload: any = {
        name: editingCategory.name,
        slug: editingCategory.slug,
        description: editingCategory.description || '',
        order_index: Number(editingCategory.order_index) || 0,
        is_active: editingCategory.is_active === true,
        parent_id: editingCategory.parent_id || null,
        icon: editingCategory.icon || '',
      }

      if (editingCategory.id) {
        await storeService.adminUpdateCategory(editingCategory.id, payload)
        toast({ title: 'Categoria atualizada com sucesso!' })
      } else {
        await storeService.adminCreateCategory(payload)
        toast({ title: 'Categoria criada com sucesso!' })
      }
      setCategoryDialogOpen(false)
      loadAll()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar categoria', description: err.message, variant: 'destructive' })
    }
  }

  const handleDeleteCategory = async (cat: StoreCategory) => {
    if (cat.is_active) {
      const deact = confirm(
        `Deseja DESATIVAR a categoria "${cat.name}"? Os produtos vinculados não serão perdidos.`,
      )
      if (deact) {
        await storeService.adminUpdateCategory(cat.id, { is_active: false })
        toast({ title: 'Categoria desativada com sucesso.' })
        loadAll()
      }
      return
    }

    if (!confirm(`Remover permanentemente a categoria "${cat.name}"?`)) return
    try {
      await storeService.adminDeleteCategory(cat.id)
      toast({ title: 'Categoria removida.' })
      loadAll()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir categoria',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // ====================
  // BANNERS CRUD
  // ====================
  const handleOpenNewBanner = () => {
    setEditingBanner({
      title: '',
      subtitle: '',
      description: '',
      cta_text: 'Ver Produtos',
      link_url: '/loja',
      badge: 'Destaque',
      bg_color: 'from-emerald-900 to-slate-900',
      order_index: (banners.length + 1) * 10,
      is_active: true,
      image_url: '',
      mobile_image_url: '',
    })
    setBannerDialogOpen(true)
  }

  const handleSaveBanner = async () => {
    if (!editingBanner || !editingBanner.title) {
      toast({ title: 'Informe o título do banner', variant: 'destructive' })
      return
    }

    try {
      const payload: any = {
        title: editingBanner.title,
        subtitle: editingBanner.subtitle || '',
        description: editingBanner.description || '',
        cta_text: editingBanner.cta_text || 'Ver Mais',
        link_url: editingBanner.link_url || '/loja',
        badge: editingBanner.badge || '',
        bg_color: editingBanner.bg_color || 'from-emerald-900 to-slate-900',
        order_index: Number(editingBanner.order_index) || 0,
        is_active: editingBanner.is_active === true,
      }

      if (editingBanner.id) {
        await storeService.adminUpdateBanner(editingBanner.id, payload)
        toast({ title: 'Banner atualizado com sucesso!' })
      } else {
        await storeService.adminCreateBanner(payload)
        toast({ title: 'Banner adicionado com sucesso!' })
      }
      setBannerDialogOpen(false)
      loadAll()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar banner', description: err.message, variant: 'destructive' })
    }
  }

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('Remover este banner?')) return
    try {
      await storeService.adminDeleteBanner(id)
      toast({ title: 'Banner removido.' })
      loadAll()
    } catch (err: any) {
      toast({ title: 'Erro ao excluir banner', description: err.message, variant: 'destructive' })
    }
  }

  const formatCurrency = (val?: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)
  }

  // Lista de categorias pai para seleção de subcategoria
  const parentCategoryOptions = categories.filter((c) => !c.parent_id)

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Store className="w-6 h-6 text-emerald-600" />
              Central de Configurações da Laletra Store
            </h1>
            <Badge className="bg-emerald-100 text-emerald-800 text-xs font-bold">
              Painel Completo Fase 5B
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Personalize a identidade visual, banners, catálogo de produtos, hierarquia de categorias
            e informações comerciais em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a href="/loja" target="_blank" rel="noreferrer">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Pré-visualizar Loja Pública
            </Button>
          </a>
        </div>
      </div>

      {/* Tabs Principais com as 6 Abas Exigidas */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="appearance" className="text-xs font-semibold gap-1.5 py-2">
            <Palette className="w-3.5 h-3.5 text-emerald-600" /> Aparência & Cores
          </TabsTrigger>
          <TabsTrigger value="banners" className="text-xs font-semibold gap-1.5 py-2">
            <ImageIcon className="w-3.5 h-3.5 text-blue-600" /> Banners ({banners.length})
          </TabsTrigger>
          <TabsTrigger value="products" className="text-xs font-semibold gap-1.5 py-2">
            <Tag className="w-3.5 h-3.5 text-purple-600" /> Produtos ({products.length})
          </TabsTrigger>
          <TabsTrigger value="categories" className="text-xs font-semibold gap-1.5 py-2">
            <FolderTree className="w-3.5 h-3.5 text-amber-600" /> Categorias ({categories.length})
          </TabsTrigger>
          <TabsTrigger value="home" className="text-xs font-semibold gap-1.5 py-2">
            <Home className="w-3.5 h-3.5 text-rose-600" /> Página Inicial
          </TabsTrigger>
          <TabsTrigger value="commercial" className="text-xs font-semibold gap-1.5 py-2">
            <PhoneCall className="w-3.5 h-3.5 text-teal-600" /> Informações Comerciais
          </TabsTrigger>
        </TabsList>

        {/* ========================================================
            ABA A: APARÊNCIA & CORES
        ======================================================== */}
        <TabsContent value="appearance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-8 border-slate-200 dark:border-slate-800">
              <CardHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Palette className="w-4 h-4 text-emerald-600" />
                  Personalização de Cores e Identidade Visual
                </CardTitle>
                <CardDescription className="text-xs">
                  Ajuste a paleta de cores da loja. As alterações são gravadas no PocketBase e
                  aplicadas em tempo real.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Cor Principal */}
                  <div>
                    <Label className="text-xs font-semibold">
                      Cor Principal (Destaque e Marca)
                    </Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <input
                        type="color"
                        value={settings.appearance.primary_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, primary_color: e.target.value },
                          }))
                        }
                        className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                      />
                      <Input
                        className="text-xs font-mono"
                        value={settings.appearance.primary_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, primary_color: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Cor Secundária */}
                  <div>
                    <Label className="text-xs font-semibold">
                      Cor Secundária (Rodapé / Elementos escuros)
                    </Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <input
                        type="color"
                        value={settings.appearance.secondary_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, secondary_color: e.target.value },
                          }))
                        }
                        className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                      />
                      <Input
                        className="text-xs font-mono"
                        value={settings.appearance.secondary_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, secondary_color: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Cor dos Botões */}
                  <div>
                    <Label className="text-xs font-semibold">Cor dos Botões (CTA Principal)</Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <input
                        type="color"
                        value={settings.appearance.button_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, button_color: e.target.value },
                          }))
                        }
                        className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                      />
                      <Input
                        className="text-xs font-mono"
                        value={settings.appearance.button_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, button_color: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Cor do Cabeçalho */}
                  <div>
                    <Label className="text-xs font-semibold">Cor de Fundo do Cabeçalho</Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <input
                        type="color"
                        value={settings.appearance.header_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, header_color: e.target.value },
                          }))
                        }
                        className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                      />
                      <Input
                        className="text-xs font-mono"
                        value={settings.appearance.header_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, header_color: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Cor de Fundo da Loja */}
                  <div>
                    <Label className="text-xs font-semibold">Cor de Fundo da Loja</Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <input
                        type="color"
                        value={settings.appearance.bg_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, bg_color: e.target.value },
                          }))
                        }
                        className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                      />
                      <Input
                        className="text-xs font-mono"
                        value={settings.appearance.bg_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, bg_color: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Cor dos Textos */}
                  <div>
                    <Label className="text-xs font-semibold">Cor dos Textos Principais</Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <input
                        type="color"
                        value={settings.appearance.text_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, text_color: e.target.value },
                          }))
                        }
                        className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                      />
                      <Input
                        className="text-xs font-mono"
                        value={settings.appearance.text_color}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, text_color: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Upload de Logotipo e Favicon */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Logotipo Oficial & Favicon
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <ImageUploader
                      label="Logotipo Oficial da Loja"
                      purpose="logo"
                      valueUrl={settings.appearance.logo_url}
                      onChangeUrl={(url) =>
                        setSettings((prev) => ({
                          ...prev,
                          appearance: { ...prev.appearance, logo_url: url },
                        }))
                      }
                      helperText="Recomendado: PNG ou WebP com fundo transparente (300x80px)"
                    />

                    <ImageUploader
                      label="Favicon da Loja (Ícone de Aba)"
                      purpose="favicon"
                      valueUrl={settings.appearance.favicon_url}
                      onChangeUrl={(url) =>
                        setSettings((prev) => ({
                          ...prev,
                          appearance: { ...prev.appearance, favicon_url: url },
                        }))
                      }
                      helperText="Recomendado: PNG ou ICO quadrado (32x32 ou 64x64px)"
                      previewAspect="square"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetDefaultColors}
                    className="text-xs gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restaurar Cores Padrão
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    disabled={savingSettings}
                    onClick={handleSaveAppearance}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Salvar Aparência
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Painel Lateral de Pré-Visualização das Cores */}
            <Card className="lg:col-span-4 border-slate-200 dark:border-slate-800 bg-slate-50/50">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pré-visualização da Identidade
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div
                  className="p-4 rounded-2xl border shadow-xs transition-colors space-y-3"
                  style={{
                    backgroundColor: settings.appearance.header_color,
                    color: settings.appearance.text_color,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {settings.appearance.logo_url ? (
                        <img
                          src={settings.appearance.logo_url}
                          alt="Logo"
                          className="h-7 object-contain"
                        />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-lg text-white flex items-center justify-center font-bold text-xs"
                          style={{ backgroundColor: settings.appearance.primary_color }}
                        >
                          L
                        </div>
                      )}
                      <span className="font-bold text-xs">LaLetra Store</span>
                    </div>
                    <Badge
                      style={{
                        backgroundColor: settings.appearance.primary_color,
                        color: '#ffffff',
                      }}
                      className="text-[10px]"
                    >
                      Online
                    </Badge>
                  </div>

                  <p className="text-[11px] opacity-80 leading-relaxed">
                    Impressão gráfica de alta resolução com orçamento ágil e acabamentos especiais.
                  </p>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition-transform active:scale-95"
                      style={{ backgroundColor: settings.appearance.button_color }}
                    >
                      Botão de Ação
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border opacity-90"
                      style={{
                        borderColor: settings.appearance.primary_color,
                        color: settings.appearance.primary_color,
                      }}
                    >
                      Secundário
                    </button>
                  </div>
                </div>

                <div
                  className="p-3 rounded-xl text-[11px] text-white flex items-center justify-between"
                  style={{ backgroundColor: settings.appearance.secondary_color }}
                >
                  <span>Rodapé da Loja</span>
                  <span className="opacity-70 text-[10px]">© LaLetra</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ========================================================
            ABA B: BANNERS
        ======================================================== */}
        <TabsContent value="banners" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Gerencie os banners rotativos da vitrine principal, com versões desktop e celular.
            </p>
            <Button
              size="sm"
              onClick={handleOpenNewBanner}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-4 h-4" /> Novo Banner
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {banners.map((b) => (
              <Card key={b.id} className="border-slate-200 dark:border-slate-800">
                <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between">
                  <div>
                    {b.badge && <Badge className="text-[10px] mb-1">{b.badge}</Badge>}
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold">{b.title}</CardTitle>
                      {!b.image_url && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40"
                        >
                          Sem imagem
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs text-slate-500">
                      {b.subtitle}
                    </CardDescription>
                  </div>
                  <Badge variant={b.is_active ? 'default' : 'secondary'} className="text-[10px]">
                    {b.is_active ? 'Ativo' : 'Pausado'}
                  </Badge>
                </CardHeader>
                <CardContent className="p-4 pt-1 space-y-3">
                  {b.image_url && (
                    <div className="w-full h-24 rounded-lg overflow-hidden bg-slate-100 border">
                      <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="text-xs text-slate-400 flex flex-wrap gap-2">
                    <span>Link: {b.link_url}</span> • <span>CTA: {b.cta_text}</span>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        setEditingBanner(b)
                        setBannerDialogOpen(true)
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-rose-500"
                      onClick={() => handleDeleteBanner(b.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ========================================================
            ABA C: PRODUTOS
        ======================================================== */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Produtos cadastrados com precificação pública oficial e recálculo 100% no servidor.
            </p>
            <Button
              size="sm"
              onClick={handleOpenNewProduct}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-4 h-4" /> Novo Produto na Loja
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Tipo Precificação</th>
                  <th className="py-3 px-4">Preço Base</th>
                  <th className="py-3 px-4">Prazo</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {p.name}
                        {p.featured && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-amber-100 text-amber-800"
                          >
                            Destaque
                          </Badge>
                        )}
                        {!p.main_image_url && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40"
                          >
                            Sem foto
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        /loja/produto/{p.seo_slug}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {p.category_name || '-'}
                    </td>
                    <td className="py-3 px-4">
                      {p.quote_only ? (
                        <Badge
                          variant="outline"
                          className="text-amber-600 border-amber-300 text-[10px]"
                        >
                          Sob Orçamento
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-slate-700 dark:text-slate-300 text-[10px]"
                        >
                          {p.pricing_type === 'quantity_tiers'
                            ? 'Faixas de Quantidade'
                            : p.pricing_type === 'square_meter'
                              ? 'Metro Quadrado (m²)'
                              : 'Preço Fixo'}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {p.quote_only
                        ? 'Sob Consulta'
                        : p.pricing_type === 'square_meter'
                          ? `${formatCurrency(p.sqm_base_price || p.store_price)}/m²`
                          : formatCurrency(p.store_price)}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{p.lead_time_days || 3} dias</td>
                    <td className="py-3 px-4">
                      {p.published ? (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-slate-500 text-[10px]">
                          Desativado
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleTogglePublishProduct(p)}
                        title={p.published ? 'Desativar da loja' : 'Ativar na loja'}
                        className="h-7 w-7 text-slate-500 hover:text-slate-700"
                      >
                        {p.published ? (
                          <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEditProduct(p)}
                        className="h-7 w-7 text-slate-500 hover:text-slate-700"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteProduct(p)}
                        className="h-7 w-7 text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ========================================================
            ABA D: CATEGORIAS E SUBCATEGORIAS
        ======================================================== */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Gerencie a árvore de departamentos e subcategorias expansíveis da loja pública.
            </p>
            <Button
              size="sm"
              onClick={handleOpenNewCategory}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-4 h-4" /> Nova Categoria
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {categories.map((c) => {
              const parentCat = categories.find((it) => it.id === c.parent_id)

              return (
                <Card key={c.id} className="border-slate-200 dark:border-slate-800">
                  <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-bold">{c.name}</CardTitle>
                        {parentCat && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-blue-600 border-blue-200"
                          >
                            Subcategoria de {parentCat.name}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs font-mono text-emerald-600">
                        /loja/categoria/{c.slug}
                      </CardDescription>
                    </div>
                    <Badge variant={c.is_active ? 'default' : 'secondary'} className="text-[10px]">
                      {c.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 space-y-3">
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {c.description || 'Sem descrição cadastrada'}
                    </p>
                    <div className="flex justify-between items-center pt-2 border-t text-[11px] text-slate-400">
                      <span>Ordem: {c.order_index}</span>
                      <div className="space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            setEditingCategory(c)
                            setCategoryDialogOpen(true)
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-rose-500"
                          onClick={() => handleDeleteCategory(c)}
                        >
                          Desativar / Excluir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ========================================================
            ABA E: PÁGINA INICIAL
        ======================================================== */}
        <TabsContent value="home" className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Home className="w-4 h-4 text-emerald-600" />
                Organização das Seções da Página Inicial
              </CardTitle>
              <CardDescription className="text-xs">
                Controle quais blocos são exibidos e edite os textos institucionais de chamada.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Visibilidade das Seções
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.home_layout.show_hero_banners}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          home_layout: { ...prev.home_layout, show_hero_banners: e.target.checked },
                        }))
                      }
                    />
                    <span>Carrossel de Banners</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.home_layout.show_advantages_bar}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          home_layout: {
                            ...prev.home_layout,
                            show_advantages_bar: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Barra de Vantagens (Prazos/Arte)</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.home_layout.show_categories_grid}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          home_layout: {
                            ...prev.home_layout,
                            show_categories_grid: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Grade de Categorias em Destaque</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.home_layout.show_featured_products}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          home_layout: {
                            ...prev.home_layout,
                            show_featured_products: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Vitrine de Produtos Mais Populares</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.home_layout.show_custom_quote_cta}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          home_layout: {
                            ...prev.home_layout,
                            show_custom_quote_cta: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Bloco CTA Orçamento Sob Medida</span>
                  </label>
                </div>
              </div>

              {/* Textos da Seção CTA */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Textos do Bloco de Orçamento Personalizado
                </h4>
                <div>
                  <Label className="text-xs font-semibold">Título do Bloco</Label>
                  <Input
                    className="mt-1 text-xs"
                    value={settings.home_layout.custom_quote_title || ''}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        home_layout: { ...prev.home_layout, custom_quote_title: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Descrição / Subtítulo</Label>
                  <Textarea
                    className="mt-1 text-xs h-20"
                    value={settings.home_layout.custom_quote_subtitle || ''}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        home_layout: { ...prev.home_layout, custom_quote_subtitle: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t">
                <Button
                  size="sm"
                  disabled={savingSettings}
                  onClick={handleSaveHomeLayout}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Salvar Layout da Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================
            ABA F: INFORMAÇÕES COMERCIAIS
        ======================================================== */}
        <TabsContent value="commercial" className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-emerald-600" />
                Informações de Atendimento e Rodapé
              </CardTitle>
              <CardDescription className="text-xs">
                Canais de contato oficiais. Não alteramos valores reais da gráfica; campos vazios
                utilizam valores padrão do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">WhatsApp de Atendimento</Label>
                  <Input
                    className="mt-1 text-xs font-mono"
                    value={settings.commercial_info.whatsapp}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        commercial_info: { ...prev.commercial_info, whatsapp: e.target.value },
                      }))
                    }
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Telefone Fixo / Comercial</Label>
                  <Input
                    className="mt-1 text-xs font-mono"
                    value={settings.commercial_info.phone}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        commercial_info: { ...prev.commercial_info, phone: e.target.value },
                      }))
                    }
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">E-mail Comercial</Label>
                  <Input
                    className="mt-1 text-xs"
                    value={settings.commercial_info.email}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        commercial_info: { ...prev.commercial_info, email: e.target.value },
                      }))
                    }
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Horário de Funcionamento</Label>
                  <Input
                    className="mt-1 text-xs"
                    value={settings.commercial_info.business_hours}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        commercial_info: {
                          ...prev.commercial_info,
                          business_hours: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Endereço Comercial Completo</Label>
                <Input
                  className="mt-1 text-xs"
                  value={settings.commercial_info.address}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      commercial_info: { ...prev.commercial_info, address: e.target.value },
                    }))
                  }
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Texto Institucional do Rodapé</Label>
                <Textarea
                  className="mt-1 text-xs h-20"
                  value={settings.commercial_info.footer_text}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      commercial_info: { ...prev.commercial_info, footer_text: e.target.value },
                    }))
                  }
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Texto de Copyright</Label>
                <Input
                  className="mt-1 text-xs"
                  value={settings.commercial_info.copyright_text}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      commercial_info: {
                        ...prev.commercial_info,
                        copyright_text: e.target.value,
                      },
                    }))
                  }
                />
              </div>

              <div className="flex justify-end pt-3 border-t">
                <Button
                  size="sm"
                  disabled={savingSettings}
                  onClick={handleSaveCommercialInfo}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Salvar Informações Comerciais
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ========================================================
          DIALOG DE PRODUTO
      ======================================================== */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingProduct?.id ? 'Editar Produto da Loja' : 'Novo Produto da Loja'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <ImageUploader
              label="Foto Principal do Produto"
              purpose="product"
              valueUrl={editingProduct?.main_image_url}
              onChangeUrl={(url) => setEditingProduct((prev) => ({ ...prev, main_image_url: url }))}
              helperText="Upload direto do computador (JPG, PNG, WebP até 10MB)"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Nome do Produto *</Label>
                <Input
                  className="mt-1 text-xs"
                  value={editingProduct?.name || ''}
                  onChange={(e) =>
                    setEditingProduct((prev) => ({
                      ...prev,
                      name: e.target.value,
                      seo_slug:
                        prev?.seo_slug ||
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, ''),
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Slug SEO (URL) *</Label>
                <Input
                  className="mt-1 text-xs font-mono"
                  value={editingProduct?.seo_slug || ''}
                  onChange={(e) =>
                    setEditingProduct((prev) => ({ ...prev, seo_slug: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Categoria / Subcategoria</Label>
                <Select
                  value={editingProduct?.category_id || ''}
                  onValueChange={(val) =>
                    setEditingProduct((prev) => ({ ...prev, category_id: val }))
                  }
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.parent_id ? `↳ ${c.name}` : c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Tipo de Precificação</Label>
                <Select
                  value={editingProduct?.pricing_type || 'quantity_tiers'}
                  onValueChange={(val: PricingType) =>
                    setEditingProduct((prev) => ({ ...prev, pricing_type: val }))
                  }
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quantity_tiers">Faixas de Quantidade (Tiragem)</SelectItem>
                    <SelectItem value="square_meter">Metro Quadrado (m²)</SelectItem>
                    <SelectItem value="fixed">Preço Unitário Fixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">Preço Base (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="mt-1 text-xs"
                  value={editingProduct?.store_price || 0}
                  onChange={(e) =>
                    setEditingProduct((prev) => ({
                      ...prev,
                      store_price: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Preço Base m² (se m²)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="mt-1 text-xs"
                  value={editingProduct?.sqm_base_price || 0}
                  onChange={(e) =>
                    setEditingProduct((prev) => ({
                      ...prev,
                      sqm_base_price: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Área Mínima m²</Label>
                <Input
                  type="number"
                  step="0.1"
                  className="mt-1 text-xs"
                  value={editingProduct?.sqm_min_area || 0.5}
                  onChange={(e) =>
                    setEditingProduct((prev) => ({
                      ...prev,
                      sqm_min_area: parseFloat(e.target.value) || 0.5,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Subtítulo / Resumo Comercial</Label>
              <Input
                className="mt-1 text-xs"
                value={editingProduct?.subtitle || ''}
                onChange={(e) =>
                  setEditingProduct((prev) => ({ ...prev, subtitle: e.target.value }))
                }
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">
                Descrição Pública Completa (HTML / Texto)
              </Label>
              <Textarea
                className="mt-1 text-xs font-mono h-24"
                value={editingProduct?.description_public || ''}
                onChange={(e) =>
                  setEditingProduct((prev) => ({ ...prev, description_public: e.target.value }))
                }
              />
            </div>

            {/* Configurações em JSON estruturado */}
            <div className="space-y-3 pt-2 border-t">
              <div>
                <Label className="text-xs font-semibold">
                  Faixas de Quantidade (JSON price_tiers)
                </Label>
                <Textarea
                  className="mt-1 text-xs font-mono h-20"
                  value={priceTiersJson}
                  onChange={(e) => setPriceTiersJson(e.target.value)}
                />
                <span className="text-[10px] text-slate-400">
                  Ex: [{`{"quantity": 500, "price": 135.00, "label": "500 un"}`}]
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold">Variações / Opções (JSON options)</Label>
                <Textarea
                  className="mt-1 text-xs font-mono h-20"
                  value={optionsJson}
                  onChange={(e) => setOptionsJson(e.target.value)}
                />
                <span className="text-[10px] text-slate-400">
                  Ex: [
                  {`{"name": "Cantos", "values": [{"id": "retos", "label": "Cantos Retos", "price_modifier": 0}]}`}
                  ]
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold">
                  Acabamentos Adicionais (JSON finishings)
                </Label>
                <Textarea
                  className="mt-1 text-xs font-mono h-20"
                  value={finishingsJson}
                  onChange={(e) => setFinishingsJson(e.target.value)}
                />
                <span className="text-[10px] text-slate-400">
                  Ex: [{`{"id": "verniz", "name": "Verniz Localizado", "price": 75.00}`}]
                </span>
              </div>
            </div>

            {/* Checkboxes de flags */}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct?.published === true}
                  onChange={(e) =>
                    setEditingProduct((prev) => ({ ...prev, published: e.target.checked }))
                  }
                />
                <span>Publicado na Loja</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct?.featured === true}
                  onChange={(e) =>
                    setEditingProduct((prev) => ({ ...prev, featured: e.target.checked }))
                  }
                />
                <span>Destaque Home</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct?.quote_only === true}
                  onChange={(e) =>
                    setEditingProduct((prev) => ({ ...prev, quote_only: e.target.checked }))
                  }
                />
                <span>Somente Orçamento</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProductDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveProduct}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              Salvar Produto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================
          DIALOG DE CATEGORIA (com suporte a parent_id)
      ======================================================== */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingCategory?.id ? 'Editar Categoria' : 'Nova Categoria'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <ImageUploader
              label="Ícone / Foto da Categoria"
              purpose="product"
              valueUrl={editingCategory?.image_url}
              onChangeUrl={(url) => setEditingCategory((prev) => ({ ...prev, image_url: url }))}
              helperText="Ícone exibido no menu lateral e vitrine de categorias"
              previewAspect="square"
            />

            <div>
              <Label className="text-xs font-semibold">Categoria Pai (para Subcategoria)</Label>
              <Select
                value={editingCategory?.parent_id || 'none'}
                onValueChange={(val) =>
                  setEditingCategory((prev) => ({
                    ...prev,
                    parent_id: val === 'none' ? null : val,
                  }))
                }
              >
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Nenhuma (Categoria Principal)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (Categoria Principal)</SelectItem>
                  {parentCategoryOptions
                    .filter((c) => c.id !== editingCategory?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Nome da Categoria *</Label>
              <Input
                className="mt-1 text-xs"
                value={editingCategory?.name || ''}
                onChange={(e) =>
                  setEditingCategory((prev) => ({
                    ...prev,
                    name: e.target.value,
                    slug:
                      prev?.slug ||
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-|-$)/g, ''),
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Slug (URL) *</Label>
              <Input
                className="mt-1 text-xs font-mono"
                value={editingCategory?.slug || ''}
                onChange={(e) => setEditingCategory((prev) => ({ ...prev, slug: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Descrição</Label>
              <Textarea
                className="mt-1 text-xs h-20"
                value={editingCategory?.description || ''}
                onChange={(e) =>
                  setEditingCategory((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="cat_active"
                checked={editingCategory?.is_active === true}
                onChange={(e) =>
                  setEditingCategory((prev) => ({ ...prev, is_active: e.target.checked }))
                }
              />
              <Label htmlFor="cat_active" className="text-xs font-semibold cursor-pointer">
                Categoria Ativa na Loja
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCategoryDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCategory}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              Salvar Categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================
          DIALOG DE BANNER (Desktop + Celular)
      ======================================================== */}
      <Dialog open={bannerDialogOpen} onOpenChange={setBannerDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingBanner?.id ? 'Editar Banner' : 'Novo Banner'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <ImageUploader
              label="Imagem para Desktop (Panorâmica)"
              purpose="banner"
              valueUrl={editingBanner?.image_url}
              onChangeUrl={(url) => setEditingBanner((prev) => ({ ...prev, image_url: url }))}
              helperText="Recomendado: 1200x500px JPG/PNG/WebP"
              previewAspect="banner"
            />

            <ImageUploader
              label="Imagem para Celular / Mobile (Opcional)"
              purpose="banner"
              valueUrl={editingBanner?.mobile_image_url}
              onChangeUrl={(url) =>
                setEditingBanner((prev) => ({ ...prev, mobile_image_url: url }))
              }
              helperText="Recomendado: 600x600px ou formato vertical"
              previewAspect="square"
            />

            <div>
              <Label className="text-xs font-semibold">Título Principal *</Label>
              <Input
                className="mt-1 text-xs"
                value={editingBanner?.title || ''}
                onChange={(e) => setEditingBanner((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Subtítulo</Label>
              <Input
                className="mt-1 text-xs"
                value={editingBanner?.subtitle || ''}
                onChange={(e) =>
                  setEditingBanner((prev) => ({ ...prev, subtitle: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Texto do Botão</Label>
                <Input
                  className="mt-1 text-xs"
                  value={editingBanner?.cta_text || ''}
                  onChange={(e) =>
                    setEditingBanner((prev) => ({ ...prev, cta_text: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Link de Destino</Label>
                <Input
                  className="mt-1 text-xs"
                  value={editingBanner?.link_url || ''}
                  onChange={(e) =>
                    setEditingBanner((prev) => ({ ...prev, link_url: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Badge de Destaque</Label>
              <Input
                className="mt-1 text-xs"
                placeholder="Ex: Mais Vendido, Oferta Especial"
                value={editingBanner?.badge || ''}
                onChange={(e) => setEditingBanner((prev) => ({ ...prev, badge: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="banner_active"
                checked={editingBanner?.is_active === true}
                onChange={(e) =>
                  setEditingBanner((prev) => ({ ...prev, is_active: e.target.checked }))
                }
              />
              <Label htmlFor="banner_active" className="text-xs font-semibold cursor-pointer">
                Banner Ativo
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBannerDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveBanner}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              Salvar Banner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
