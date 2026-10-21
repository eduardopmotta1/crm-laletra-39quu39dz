import React, { useState, useEffect } from 'react'
import {
  Store,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Image,
  FolderTree,
  Tag,
  Sliders,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Layers,
  Sparkles,
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
import type {
  StoreCategory,
  StoreProduct,
  StoreBanner,
  PricingType,
  StorePriceTier,
  StoreProductOption,
  StoreProductFinishing,
} from '@/types/store'

export default function StoreAdminPage() {
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState('products')
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [banners, setBanners] = useState<StoreBanner[]>([])
  const [loading, setLoading] = useState(true)

  // Dialogs
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false)

  // Form States
  const [editingProduct, setEditingProduct] = useState<Partial<StoreProduct> | null>(null)
  const [editingCategory, setEditingCategory] = useState<Partial<StoreCategory> | null>(null)
  const [editingBanner, setEditingBanner] = useState<Partial<StoreBanner> | null>(null)

  // JSON string helpers for complex product fields
  const [priceTiersJson, setPriceTiersJson] = useState('[]')
  const [optionsJson, setOptionsJson] = useState('[]')
  const [finishingsJson, setFinishingsJson] = useState('[]')

  const loadAll = async () => {
    try {
      setLoading(true)
      const [cats, prods, bans] = await Promise.all([
        storeService.adminGetAllCategories(),
        storeService.adminGetAllProducts(),
        storeService.adminGetAllBanners(),
      ])
      setCategories(cats)
      setProducts(prods)
      setBanners(bans)
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
        ...editingProduct,
        price_tiers: parsedTiers,
        options: parsedOptions,
        finishings: parsedFinishings,
        store_price: Number(editingProduct.store_price) || 0,
        sqm_base_price: Number(editingProduct.sqm_base_price) || 0,
        sqm_min_area: Number(editingProduct.sqm_min_area) || 0,
        lead_time_days: Number(editingProduct.lead_time_days) || 3,
        order_index: Number(editingProduct.order_index) || 0,
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
        title: prod.published ? 'Produto despublicado da loja.' : 'Produto publicado na loja!',
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

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Deseja realmente remover este produto da Loja?')) return
    try {
      await storeService.adminDeleteProduct(id)
      toast({ title: 'Produto removido com sucesso.' })
      loadAll()
    } catch (err: any) {
      toast({ title: 'Erro ao excluir produto', description: err.message, variant: 'destructive' })
    }
  }

  // ====================
  // CATEGORIAS CRUD
  // ====================
  const handleOpenNewCategory = () => {
    setEditingCategory({
      name: '',
      slug: '',
      description: '',
      order_index: (categories.length + 1) * 10,
      is_active: true,
    })
    setCategoryDialogOpen(true)
  }

  const handleSaveCategory = async () => {
    if (!editingCategory || !editingCategory.name || !editingCategory.slug) {
      toast({ title: 'Preencha o Nome e o Slug da Categoria', variant: 'destructive' })
      return
    }

    try {
      if (editingCategory.id) {
        await storeService.adminUpdateCategory(editingCategory.id, editingCategory)
        toast({ title: 'Categoria atualizada com sucesso!' })
      } else {
        await storeService.adminCreateCategory(editingCategory)
        toast({ title: 'Categoria criada com sucesso!' })
      }
      setCategoryDialogOpen(false)
      loadAll()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar categoria', description: err.message, variant: 'destructive' })
    }
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Remover esta categoria da loja?')) return
    try {
      await storeService.adminDeleteCategory(id)
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
      cta_text: 'Ver Produtos',
      link_url: '/loja',
      badge: 'Destaque',
      bg_color: 'from-emerald-900 to-slate-900',
      order_index: (banners.length + 1) * 10,
      is_active: true,
    })
    setBannerDialogOpen(true)
  }

  const handleSaveBanner = async () => {
    if (!editingBanner || !editingBanner.title) {
      toast({ title: 'Informe o título do banner', variant: 'destructive' })
      return
    }

    try {
      if (editingBanner.id) {
        await storeService.adminUpdateBanner(editingBanner.id, editingBanner)
        toast({ title: 'Banner atualizado com sucesso!' })
      } else {
        await storeService.adminCreateBanner(editingBanner)
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

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Store className="w-6 h-6 text-emerald-600" />
              Gestão da Laletra Store
            </h1>
            <Badge className="bg-emerald-100 text-emerald-800 text-xs font-bold">
              Catálogo & Precificação
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Administre os produtos, categorias, banners e parâmetros de cálculo da loja pública
            Laletra.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a href="/loja" target="_blank" rel="noreferrer">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver Loja Pública
            </Button>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <TabsTrigger value="products" className="text-xs font-semibold gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Produtos ({products.length})
          </TabsTrigger>
          <TabsTrigger value="categories" className="text-xs font-semibold gap-1.5">
            <FolderTree className="w-3.5 h-3.5" /> Categorias ({categories.length})
          </TabsTrigger>
          <TabsTrigger value="banners" className="text-xs font-semibold gap-1.5">
            <Image className="w-3.5 h-3.5" /> Banners ({banners.length})
          </TabsTrigger>
        </TabsList>

        {/* 1. ABA DE PRODUTOS */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Produtos cadastrados com precificação pública (preço fixo, faixas de tiragem ou m²).
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
                          Publicado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-slate-500 text-[10px]">
                          Rascunho
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleTogglePublishProduct(p)}
                        title={p.published ? 'Despublicar' : 'Publicar'}
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
                        onClick={() => handleDeleteProduct(p.id)}
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

        {/* 2. ABA DE CATEGORIAS */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Categorias organizam a navegação da loja e facilitam a busca dos clientes.
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
            {categories.map((c) => (
              <Card key={c.id} className="border-slate-200 dark:border-slate-800">
                <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold">{c.name}</CardTitle>
                      {!c.image_url && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40"
                        >
                          Sem ícone
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
                    {c.description || 'Sem descrição'}
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
                        onClick={() => handleDeleteCategory(c.id)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* 3. ABA DE BANNERS */}
        <TabsContent value="banners" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Banners rotativos da página inicial da Laletra Store com chamadas para ação.
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
                          Sem imagem de fundo
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
                  <div className="text-xs text-slate-400">
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
      </Tabs>

      {/* DIALOG DE PRODUTO */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingProduct?.id ? 'Editar Produto da Loja' : 'Novo Produto da Loja'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">URL da Imagem Principal</Label>
              <Input
                className="mt-1 text-xs"
                placeholder="https://... ou caminho de imagem"
                value={editingProduct?.main_image_url || ''}
                onChange={(e) =>
                  setEditingProduct((prev) => ({ ...prev, main_image_url: e.target.value }))
                }
              />
              <span className="text-[10px] text-slate-400">
                Link direto para foto do produto no catálogo ou upload pelo storage.
              </span>
            </div>

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
                <Label className="text-xs font-semibold">Categoria</Label>
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
                        {c.name}
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

      {/* DIALOG DE CATEGORIA */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingCategory?.id ? 'Editar Categoria' : 'Nova Categoria'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">URL do Ícone/Imagem da Categoria</Label>
              <Input
                className="mt-1 text-xs"
                placeholder="https://..."
                value={editingCategory?.image_url || ''}
                onChange={(e) =>
                  setEditingCategory((prev) => ({ ...prev, image_url: e.target.value }))
                }
              />
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

      {/* DIALOG DE BANNER */}
      <Dialog open={bannerDialogOpen} onOpenChange={setBannerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingBanner?.id ? 'Editar Banner' : 'Novo Banner'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">URL da Imagem de Fundo do Banner</Label>
              <Input
                className="mt-1 text-xs"
                placeholder="https://..."
                value={editingBanner?.image_url || ''}
                onChange={(e) =>
                  setEditingBanner((prev) => ({ ...prev, image_url: e.target.value }))
                }
              />
            </div>
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
