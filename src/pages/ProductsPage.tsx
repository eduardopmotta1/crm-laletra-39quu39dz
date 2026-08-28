import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Package,
  Plus,
  Search,
  Edit2,
  Power,
  PowerOff,
  Image as ImageIcon,
  Calculator,
  Upload,
  Check,
  Layers,
  Sparkles,
  Info,
  DollarSign,
  TrendingUp,
  Percent,
  CheckCircle2,
  X,
  FileText,
  Scissors,
  Eye,
} from 'lucide-react'
import { productsService } from '@/services/quoteProducts'
import { materialsService } from '@/services/quoteMaterials'
import { additionalsService } from '@/services/quoteAdditionals'
import type { QuoteProduct, QuoteMaterial, QuoteAdditional, ProductCalcRule } from '@/types/quotes'
import { CALC_RULE_LABELS, CALC_UNIT_LABELS } from '@/types/quotes'
import { calculateQuoteItem } from '@/lib/quoteCalculator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/hooks/use-toast'

export default function ProductsPage() {
  const [products, setProducts] = useState<QuoteProduct[]>([])
  const [materials, setMaterials] = useState<QuoteMaterial[]>([])
  const [additionals, setAdditionals] = useState<QuoteAdditional[]>([])
  const [loading, setLoading] = useState(true)

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedCalcRule, setSelectedCalcRule] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Product Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<QuoteProduct | null>(null)
  const [saving, setSaving] = useState(false)

  // Interactive Calculator Simulation Modal
  const [calcModalOpen, setCalcModalOpen] = useState(false)
  const [simProduct, setSimProduct] = useState<QuoteProduct | null>(null)
  const [simWidth, setSimWidth] = useState<number>(1.0)
  const [simHeight, setSimHeight] = useState<number>(1.0)
  const [simQuantity, setSimQuantity] = useState<number>(1)
  const [simSelectedAdds, setSimSelectedAdds] = useState<Record<string, number>>({})

  // Form State
  const [form, setForm] = useState<{
    name: string
    category: string
    description: string
    main_material_id: string
    calc_rule: ProductCalcRule
    sale_unit: string
    has_default_dimensions: boolean
    default_width: number | string
    default_height: number | string
    default_quantity: number | string
    min_price: number | string
    fixed_price: number | string
    fixed_cost: number | string
    internal_notes: string
    is_active: boolean
    additionals: string[]
  }>({
    name: '',
    category: 'Comunicação Visual',
    description: '',
    main_material_id: '',
    calc_rule: 'm2',
    sale_unit: 'm²',
    has_default_dimensions: false,
    default_width: '',
    default_height: '',
    default_quantity: '1',
    min_price: '',
    fixed_price: '',
    fixed_cost: '',
    internal_notes: '',
    is_active: true,
    additionals: [],
  })

  // File Upload State
  const [mainImageFile, setMainImageFile] = useState<File | null>(null)
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [prods, mats, adds] = await Promise.all([
        productsService.getAll(undefined, 'name'),
        materialsService.getActive(),
        additionalsService.getActive(),
      ])
      setProducts(prods)
      setMaterials(mats)
      setAdditionals(adds)
    } catch (err) {
      console.error('Error loading products data:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar o catálogo de produtos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Categories list
  const productCategories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [products])

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory
      const matchesRule = selectedCalcRule === 'all' || p.calc_rule === selectedCalcRule

      const matchesStatus =
        statusFilter === 'all' ? true : statusFilter === 'active' ? p.is_active : !p.is_active

      return matchesSearch && matchesCat && matchesRule && matchesStatus
    })
  }, [products, searchQuery, selectedCategory, selectedCalcRule, statusFilter])

  // Open Modal for Create or Edit
  const handleOpenModal = (prod?: QuoteProduct) => {
    setMainImageFile(null)
    if (prod) {
      setEditingProduct(prod)
      setForm({
        name: prod.name,
        category: prod.category,
        description: prod.description || '',
        main_material_id: prod.main_material_id || '',
        calc_rule: prod.calc_rule,
        sale_unit: prod.sale_unit || 'unidade',
        has_default_dimensions: !!prod.has_default_dimensions,
        default_width: prod.default_width || '',
        default_height: prod.default_height || '',
        default_quantity: prod.default_quantity || 1,
        min_price: prod.min_price || '',
        fixed_price: prod.fixed_price || '',
        fixed_cost: prod.fixed_cost || '',
        internal_notes: prod.internal_notes || '',
        is_active: prod.is_active,
        additionals: prod.additionals || [],
      })
      setMainImagePreview(prod.main_image ? productsService.getImageUrl(prod) : null)
    } else {
      setEditingProduct(null)
      setForm({
        name: '',
        category: productCategories[0] || 'Comunicação Visual',
        description: '',
        main_material_id: materials[0]?.id || '',
        calc_rule: 'm2',
        sale_unit: 'm²',
        has_default_dimensions: false,
        default_width: '',
        default_height: '',
        default_quantity: '1',
        min_price: '',
        fixed_price: '',
        fixed_cost: '',
        internal_notes: '',
        is_active: true,
        additionals: [],
      })
      setMainImagePreview(null)
    }
    setModalOpen(true)
  }

  // Handle Image Selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setMainImageFile(file)
      const previewUrl = URL.createObjectURL(file)
      setMainImagePreview(previewUrl)
    }
  }

  const handleToggleAdditionalInForm = (addId: string) => {
    setForm((prev) => {
      const exists = prev.additionals.includes(addId)
      return {
        ...prev,
        additionals: exists
          ? prev.additionals.filter((id) => id !== addId)
          : [...prev.additionals, addId],
      }
    })
  }

  // Save Product (Create or Update) with FormData for image upload
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', form.name.trim())
      formData.append('category', form.category.trim() || 'Geral')
      formData.append('description', form.description.trim())
      formData.append('calc_rule', form.calc_rule)
      formData.append('sale_unit', form.sale_unit)
      formData.append('is_active', String(form.is_active))
      formData.append('has_default_dimensions', String(form.has_default_dimensions))
      formData.append('internal_notes', form.internal_notes.trim())

      if (form.main_material_id) {
        formData.append('main_material_id', form.main_material_id)
      }
      if (form.default_width) {
        formData.append('default_width', String(form.default_width))
      }
      if (form.default_height) {
        formData.append('default_height', String(form.default_height))
      }
      if (form.default_quantity) {
        formData.append('default_quantity', String(form.default_quantity))
      }
      if (form.min_price) {
        formData.append('min_price', String(form.min_price))
      }
      if (form.fixed_price) {
        formData.append('fixed_price', String(form.fixed_price))
      }
      if (form.fixed_cost) {
        formData.append('fixed_cost', String(form.fixed_cost))
      }

      // Append additionals relations array
      for (const addId of form.additionals) {
        formData.append('additionals', addId)
      }

      // If new image uploaded
      if (mainImageFile) {
        formData.append('main_image', mainImageFile)
      }

      if (editingProduct) {
        await productsService.update(editingProduct.id, formData)
        toast({
          title: 'Produto atualizado!',
          description: `"${form.name}" salvo com sucesso.`,
        })
      } else {
        await productsService.create(formData)
        toast({
          title: 'Produto cadastrado!',
          description: `"${form.name}" criado com sucesso no catálogo.`,
        })
      }

      setModalOpen(false)
      loadAll()
    } catch (err) {
      console.error('Error saving product:', err)
      toast({
        title: 'Erro ao salvar produto',
        description: 'Verifique se os dados e arquivos enviados são válidos.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Toggle logical active status
  const handleToggleProductStatus = async (prod: QuoteProduct) => {
    const newStatus = !prod.is_active
    try {
      await productsService.setActiveStatus(prod.id, newStatus)
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, is_active: newStatus } : p)),
      )
      toast({
        title: newStatus ? 'Produto reativado' : 'Produto desativado',
        description: `O produto "${prod.name}" foi ${newStatus ? 'reativado' : 'desativado'}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao alterar status',
        variant: 'destructive',
      })
    }
  }

  // Open Live Price Calculation Simulator for a Product
  const handleOpenCalcModal = (prod: QuoteProduct) => {
    setSimProduct(prod)
    setSimWidth(prod.default_width || 1.0)
    setSimHeight(prod.default_height || 1.5)
    setSimQuantity(prod.default_quantity || 1)

    // Pre-populate available additionals
    const initialAdds: Record<string, number> = {}
    if (prod.additionals) {
      for (const addId of prod.additionals) {
        initialAdds[addId] = 1 // default 1 unit or metric
      }
    }
    setSimSelectedAdds(initialAdds)
    setCalcModalOpen(true)
  }

  // Computed Live Calculation for Simulation
  const liveCalcResult = useMemo(() => {
    if (!simProduct) return null

    // Find main material
    const mat = materials.find((m) => m.id === simProduct.main_material_id)

    // Build additionals selection
    const additionalsSelection = Object.entries(simSelectedAdds)
      .filter(([_, qty]) => qty > 0)
      .map(([addId, qty]) => {
        const additional = additionals.find((a) => a.id === addId)
        if (!additional) return null
        return {
          additional,
          quantity: qty,
        }
      })
      .filter(Boolean) as Array<{ additional: QuoteAdditional; quantity: number }>

    return calculateQuoteItem({
      product: simProduct,
      material: mat,
      width: simWidth,
      height: simHeight,
      quantity: simQuantity,
      additionalsSelection,
    })
  }, [simProduct, simWidth, simHeight, simQuantity, simSelectedAdds, materials, additionals])

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Package className="h-4 w-4" />
            Catálogo & Orçamentos
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Catálogo de Produtos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Cadastre banners, lonas, adesivos, brindes e configure regras de cálculo por m², metro
            linear ou unidade.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleOpenModal()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo Produto
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="sm:col-span-5 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar produtos por nome, categoria..."
            className="pl-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
          />
        </div>

        <div className="sm:col-span-3">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {productCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Select value={selectedCalcRule} onValueChange={setSelectedCalcRule}>
            <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
              <SelectValue placeholder="Regra de cálculo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regras</SelectItem>
              <SelectItem value="m2">Metro Quadrado (m²)</SelectItem>
              <SelectItem value="metro_linear">Metro Linear</SelectItem>
              <SelectItem value="unidade">Por Unidade</SelectItem>
              <SelectItem value="preco_fixo">Preço Fixo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
            <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mr-3" />
          Carregando catálogo de produtos...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Nenhum produto cadastrado
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Crie produtos como Banners, Lonas, Painéis ou Brindes para simular orçamentos.
          </p>
          <Button onClick={() => handleOpenModal()} variant="outline" className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Cadastrar Produto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((prod) => {
            const mat =
              prod.expand?.main_material_id || materials.find((m) => m.id === prod.main_material_id)
            const imgUrl = prod.main_image ? productsService.getImageUrl(prod) : null

            return (
              <Card
                key={prod.id}
                className={`overflow-hidden transition-all duration-200 flex flex-col justify-between ${
                  prod.is_active
                    ? 'border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/60 shadow-xs'
                    : 'opacity-70 bg-slate-50/70 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-800'
                }`}
              >
                <div>
                  {/* Card Image Banner */}
                  <div className="h-40 bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center overflow-hidden border-b border-slate-100 dark:border-slate-800">
                    {imgUrl ? (
                      <img src={imgUrl} alt={prod.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="h-10 w-10 stroke-1 mb-1" />
                        <span className="text-[11px] font-medium">Sem imagem</span>
                      </div>
                    )}

                    {/* Category & Status Overlay Badges */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <Badge className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 backdrop-blur-xs text-[10px] font-semibold uppercase shadow-xs">
                        {prod.category}
                      </Badge>
                    </div>

                    <div className="absolute top-2.5 right-2.5">
                      <Badge
                        variant={prod.is_active ? 'default' : 'secondary'}
                        className={`text-[10px] uppercase font-bold shadow-xs ${
                          prod.is_active
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800/80 text-slate-300 backdrop-blur-xs'
                        }`}
                      >
                        {prod.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>

                    {/* Rule Badge Bottom */}
                    <div className="absolute bottom-2 left-2.5">
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-slate-900/80 text-white backdrop-blur-xs font-mono font-normal"
                      >
                        {CALC_RULE_LABELS[prod.calc_rule] || prod.calc_rule}
                      </Badge>
                    </div>
                  </div>

                  <CardHeader className="pb-2 pt-3.5">
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                      {prod.name}
                    </CardTitle>
                    {prod.description && (
                      <CardDescription className="text-xs text-slate-500 line-clamp-2 mt-1">
                        {prod.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    {/* Material & Base Info */}
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-100 dark:border-slate-800/80 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[11px]">Material Base:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {mat?.name || 'Não vinculado'}
                        </span>
                      </div>

                      {mat && (
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Preço Mat. (Venda):</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            R$ {mat.sale_price.toFixed(2)} / {CALC_UNIT_LABELS[mat.calc_unit]}
                          </span>
                        </div>
                      )}

                      {prod.min_price && prod.min_price > 0 ? (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-amber-600 font-medium">Preço Mínimo:</span>
                          <span className="font-bold text-amber-700 dark:text-amber-400">
                            R$ {prod.min_price.toFixed(2)}
                          </span>
                        </div>
                      ) : null}

                      {prod.has_default_dimensions && (
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/50 dark:border-slate-800">
                          <span>Medidas padrão:</span>
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            {prod.default_width}m × {prod.default_height}m
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Linked Additionals count */}
                    {prod.additionals && prod.additionals.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Scissors className="h-3 w-3 text-teal-600" />
                        <span>
                          <strong>{prod.additionals.length}</strong> acabamento(s) disponível(is)
                        </span>
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 pt-0">
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenCalcModal(prod)}
                      className="h-8 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100 gap-1.5 flex-1"
                    >
                      <Calculator className="h-3.5 w-3.5 text-emerald-600" />
                      Simular Cálculo
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenModal(prod)}
                      className="h-8 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 px-2.5"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleProductStatus(prod)}
                      className={`h-8 text-xs px-2.5 ${
                        prod.is_active
                          ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {prod.is_active ? (
                        <PowerOff className="h-3.5 w-3.5" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* MODAL: CREATE / EDIT PRODUCT */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Package className="h-5 w-5 text-emerald-600" />
              {editingProduct ? 'Editar Produto do Catálogo' : 'Cadastrar Novo Produto'}
            </DialogTitle>
            <DialogDescription>
              Configure regras de cálculo, material vinculado, medidas padrão e fotos do item.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProduct} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Image Upload Box */}
              <div className="sm:col-span-4 flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950/50">
                {mainImagePreview ? (
                  <div className="relative w-full h-36 rounded-lg overflow-hidden group">
                    <img
                      src={mainImagePreview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setMainImageFile(null)
                        setMainImagePreview(null)
                      }}
                      className="absolute top-1 right-1 bg-black/70 hover:bg-rose-600 text-white p-1 rounded-full text-xs"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center text-center cursor-pointer p-4 hover:opacity-80 transition-opacity"
                  >
                    <Upload className="h-8 w-8 text-emerald-600 mb-2" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Upload da Foto
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1">PNG, JPG, WebP até 10MB</span>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  className="hidden"
                />
                {!mainImagePreview && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 text-xs w-full"
                  >
                    Selecionar Arquivo
                  </Button>
                )}
              </div>

              {/* Basic Fields */}
              <div className="sm:col-span-8 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nome do Produto *
                  </label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Banner Promocional, Painel Redondo, Lona 440g..."
                    required
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Categoria *
                    </label>
                    <Input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Ex: Comunicação Visual, Adesivos..."
                      required
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Unidade de Venda
                    </label>
                    <Input
                      value={form.sale_unit}
                      onChange={(e) => setForm({ ...form, sale_unit: e.target.value })}
                      placeholder="Ex: m², metro, unidade, kit"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Descrição do Produto
                  </label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Detalhes para a proposta e ficha técnica do produto..."
                    rows={2}
                    className="mt-1 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Pricing and Calculation Rule Box */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-emerald-600" />
                Regra de Cálculo e Material Principal
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Forma de Cálculo *
                  </label>
                  <Select
                    value={form.calc_rule}
                    onValueChange={(val: any) => setForm({ ...form, calc_rule: val })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m2">TIPO 1 — Metro Quadrado (m²)</SelectItem>
                      <SelectItem value="metro_linear">TIPO 2 — Metro Linear</SelectItem>
                      <SelectItem value="unidade">TIPO 3 — Por Unidade</SelectItem>
                      <SelectItem value="preco_fixo">TIPO 4 — Preço Fixo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Material Base Vinculado
                  </label>
                  <Select
                    value={form.main_material_id}
                    onValueChange={(val) => setForm({ ...form, main_material_id: val })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione um material..." />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((mat) => (
                        <SelectItem key={mat.id} value={mat.id}>
                          {mat.name} (R$ {mat.sale_price.toFixed(2)}/{mat.calc_unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    TIPO 5 — Preço Mínimo (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.min_price}
                    onChange={(e) => setForm({ ...form, min_price: e.target.value })}
                    placeholder="Ex: 30.00 (mínimo garantido)"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Fixed Price & Cost fields when calc_rule is preco_fixo or unidade */}
              {(form.calc_rule === 'preco_fixo' || form.calc_rule === 'unidade') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Custo Fixo do Item (R$)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.fixed_cost}
                      onChange={(e) => setForm({ ...form, fixed_cost: e.target.value })}
                      placeholder="0.00"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Preço de Venda Fixo / Unitário (R$)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.fixed_price}
                      onChange={(e) => setForm({ ...form, fixed_price: e.target.value })}
                      placeholder="0.00"
                      className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Default Dimensions Box */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.has_default_dimensions}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, has_default_dimensions: !!checked })
                    }
                  />
                  Definir Medidas e Quantidade Padrão
                </label>
              </div>

              {form.has_default_dimensions && (
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Largura padrão (metros)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_width}
                      onChange={(e) => setForm({ ...form, default_width: e.target.value })}
                      placeholder="Ex: 1.00"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Altura padrão (metros)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_height}
                      onChange={(e) => setForm({ ...form, default_height: e.target.value })}
                      placeholder="Ex: 1.50"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Quantidade padrão
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={form.default_quantity}
                      onChange={(e) => setForm({ ...form, default_quantity: e.target.value })}
                      placeholder="Ex: 1"
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Additionals & Finishes selection */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Scissors className="h-4 w-4 text-teal-600" />
                Vincular Acabamentos e Adicionais Permitidos
              </span>
              <p className="text-xs text-slate-500">
                Selecione quais adicionais podem ser incluídos pelo vendedor neste produto.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {additionals.map((add) => {
                  const isChecked = form.additionals.includes(add.id)
                  return (
                    <div
                      key={add.id}
                      onClick={() => handleToggleAdditionalInForm(add.id)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-teal-50 border-teal-300 dark:bg-teal-950/40 dark:border-teal-800 font-medium'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox checked={isChecked} />
                        <div>
                          <span className="text-slate-800 dark:text-slate-200">{add.name}</span>
                          <span className="text-[10px] text-slate-400 block">
                            {add.category || 'Geral'} • {add.calc_unit}
                          </span>
                        </div>
                      </div>
                      <span className="font-semibold text-teal-700 dark:text-teal-400">
                        +R$ {add.sale_price.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Internal Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Observações Internas (Não visível ao cliente)
              </label>
              <Textarea
                value={form.internal_notes}
                onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
                placeholder="Instruções para impressão, acabamentos especiais, fornecedores de tecido..."
                rows={2}
                className="mt-1 resize-none"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Salvando...' : editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SIMULATOR MODAL: REAL-TIME CALCULATION TESTER */}
      <Dialog open={calcModalOpen} onOpenChange={setCalcModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Calculator className="h-5 w-5 text-emerald-600" />
              Simulador de Cálculo: {simProduct?.name}
            </DialogTitle>
            <DialogDescription>
              Valide as fórmulas de m², metro linear, adicionais e preço mínimo configuradas para
              este produto.
            </DialogDescription>
          </DialogHeader>

          {simProduct && liveCalcResult && (
            <div className="space-y-4 pt-2">
              {/* Rule description badge */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs">
                <div>
                  <span className="font-bold text-emerald-900 dark:text-emerald-200">Regra: </span>
                  <span className="text-emerald-800 dark:text-emerald-300">
                    {CALC_RULE_LABELS[simProduct.calc_rule]}
                  </span>
                </div>
                {simProduct.min_price && simProduct.min_price > 0 ? (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                    Preço Mínimo: R$ {simProduct.min_price.toFixed(2)}
                  </Badge>
                ) : null}
              </div>

              {/* Input Dimensions and Quantities */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                {simProduct.calc_rule === 'm2' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Largura (m)
                      </label>
                      <Input
                        type="number"
                        step="0.05"
                        min="0"
                        value={simWidth}
                        onChange={(e) => setSimWidth(Number(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Altura (m)
                      </label>
                      <Input
                        type="number"
                        step="0.05"
                        min="0"
                        value={simHeight}
                        onChange={(e) => setSimHeight(Number(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}

                {simProduct.calc_rule === 'metro_linear' && (
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Metragem Linear / Comprimento (m)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={simWidth}
                      onChange={(e) => setSimWidth(Number(e.target.value) || 0)}
                      className="mt-1"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Quantidade de Peças
                  </label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={simQuantity}
                    onChange={(e) => setSimQuantity(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Additionals selection in simulation */}
              {simProduct.additionals && simProduct.additionals.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Acabamentos Inclusos na Simulação:
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {simProduct.additionals.map((addId) => {
                      const add = additionals.find((a) => a.id === addId)
                      if (!add) return null
                      const currentQty = simSelectedAdds[addId] || 0
                      return (
                        <div
                          key={add.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                        >
                          <div>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {add.name}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              +R$ {add.sale_price.toFixed(2)} por {add.calc_unit}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-[11px]">Qtd:</span>
                            <Input
                              type="number"
                              min="0"
                              value={currentQty}
                              onChange={(e) =>
                                setSimSelectedAdds({
                                  ...simSelectedAdds,
                                  [addId]: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="h-7 w-16 text-center text-xs"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Calculation Output Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {simProduct.calc_rule === 'm2' && (
                  <>
                    <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">
                        Área Individual
                      </span>
                      <strong className="text-xs text-slate-900 dark:text-white">
                        {liveCalcResult.individual_area} m²
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Área Total</span>
                      <strong className="text-xs text-slate-900 dark:text-white">
                        {liveCalcResult.total_area} m²
                      </strong>
                    </div>
                  </>
                )}

                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Preço Unitário</span>
                  <strong className="text-xs text-slate-900 dark:text-white">
                    R$ {liveCalcResult.applied_unit_price.toFixed(2)}
                  </strong>
                  {liveCalcResult.is_min_price_applied && (
                    <span className="text-[9px] text-amber-600 block font-semibold">
                      (Preço Mínimo)
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-bold block">
                    Total da Venda
                  </span>
                  <strong className="text-sm text-emerald-700 dark:text-emerald-400 font-black">
                    R$ {liveCalcResult.item_total_sale.toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Cost vs Sale Breakdown (Internal Only) */}
              <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2">
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Custo Total Interno:</span>
                  <span className="font-semibold text-slate-200">
                    R$ {liveCalcResult.item_total_cost.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Preço de Venda Final:</span>
                  <span className="font-bold text-emerald-400">
                    R$ {liveCalcResult.item_total_sale.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-300 font-semibold flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    Lucro Bruto:
                  </span>
                  <span className="font-bold text-emerald-400">
                    R$ {liveCalcResult.item_gross_profit.toFixed(2)} (
                    {liveCalcResult.item_margin_pct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setCalcModalOpen(false)}>
              Fechar Simulação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
