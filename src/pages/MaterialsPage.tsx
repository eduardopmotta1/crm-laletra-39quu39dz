import React, { useState, useEffect, useMemo } from 'react'
import {
  Layers,
  Plus,
  Search,
  Filter,
  Edit2,
  Power,
  PowerOff,
  Tag,
  DollarSign,
  TrendingUp,
  Percent,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Scissors,
  Package,
} from 'lucide-react'
import { materialsService } from '@/services/quoteMaterials'
import { additionalsService } from '@/services/quoteAdditionals'
import type {
  QuoteMaterial,
  QuoteAdditional,
  MaterialCalcUnit,
  AdditionalCalcUnit,
} from '@/types/quotes'
import { CALC_UNIT_LABELS, ADDITIONAL_UNIT_LABELS } from '@/types/quotes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import { toast } from '@/hooks/use-toast'

export default function MaterialsPage() {
  const [activeTab, setActiveTab] = useState<'materials' | 'additionals'>('materials')
  const [materials, setMaterials] = useState<QuoteMaterial[]>([])
  const [additionals, setAdditionals] = useState<QuoteAdditional[]>([])
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Material Modal State
  const [materialModalOpen, setMaterialModalOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<QuoteMaterial | null>(null)
  const [materialForm, setMaterialForm] = useState<{
    name: string
    description: string
    category: string
    calc_unit: MaterialCalcUnit
    cost_price: number | string
    sale_price: number | string
    min_price: number | string
    is_active: boolean
  }>({
    name: '',
    description: '',
    category: 'Lonas e Tecidos',
    calc_unit: 'm2',
    cost_price: '',
    sale_price: '',
    min_price: '',
    is_active: true,
  })

  // Additional Modal State
  const [additionalModalOpen, setAdditionalModalOpen] = useState(false)
  const [editingAdditional, setEditingAdditional] = useState<QuoteAdditional | null>(null)
  const [additionalForm, setAdditionalForm] = useState<{
    name: string
    description: string
    category: string
    calc_unit: AdditionalCalcUnit
    cost_price: number | string
    sale_price: number | string
    min_price: number | string
    is_active: boolean
  }>({
    name: '',
    description: '',
    category: 'Acabamentos',
    calc_unit: 'unidade',
    cost_price: '',
    sale_price: '',
    min_price: '',
    is_active: true,
  })

  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [mats, adds] = await Promise.all([
        materialsService.getAll(undefined, 'name'),
        additionalsService.getAll(undefined, 'name'),
      ])
      setMaterials(mats)
      setAdditionals(adds)
    } catch (err) {
      console.error('Error loading materials & additionals:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar os materiais e acabamentos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Categories list
  const materialCategories = useMemo(() => {
    const cats = new Set(materials.map((m) => m.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [materials])

  const additionalCategories = useMemo(() => {
    const cats = new Set(additionals.map((a) => a.category).filter(Boolean) as string[])
    return Array.from(cats).sort()
  }, [additionals])

  // Filtered Materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        m.category.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCat = selectedCategory === 'all' || m.category === selectedCategory

      const matchesStatus =
        statusFilter === 'all' ? true : statusFilter === 'active' ? m.is_active : !m.is_active

      return matchesSearch && matchesCat && matchesStatus
    })
  }, [materials, searchQuery, selectedCategory, statusFilter])

  // Filtered Additionals
  const filteredAdditionals = useMemo(() => {
    return additionals.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.description && a.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (a.category && a.category.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesCat = selectedCategory === 'all' || a.category === selectedCategory

      const matchesStatus =
        statusFilter === 'all' ? true : statusFilter === 'active' ? a.is_active : !a.is_active

      return matchesSearch && matchesCat && matchesStatus
    })
  }, [additionals, searchQuery, selectedCategory, statusFilter])

  // Material Modal Handlers
  const handleOpenMaterialModal = (item?: QuoteMaterial) => {
    if (item) {
      setEditingMaterial(item)
      setMaterialForm({
        name: item.name,
        description: item.description || '',
        category: item.category,
        calc_unit: item.calc_unit,
        cost_price: item.cost_price,
        sale_price: item.sale_price,
        min_price: item.min_price || '',
        is_active: item.is_active,
      })
    } else {
      setEditingMaterial(null)
      setMaterialForm({
        name: '',
        description: '',
        category: materialCategories[0] || 'Lonas e Tecidos',
        calc_unit: 'm2',
        cost_price: '',
        sale_price: '',
        min_price: '',
        is_active: true,
      })
    }
    setMaterialModalOpen(true)
  }

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!materialForm.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const payload: Partial<QuoteMaterial> = {
        name: materialForm.name.trim(),
        description: materialForm.description.trim(),
        category: materialForm.category.trim() || 'Geral',
        calc_unit: materialForm.calc_unit,
        cost_price: Number(materialForm.cost_price || 0),
        sale_price: Number(materialForm.sale_price || 0),
        min_price: Number(materialForm.min_price || 0),
        is_active: materialForm.is_active,
      }

      if (editingMaterial) {
        await materialsService.update(editingMaterial.id, payload)
        toast({
          title: 'Material atualizado',
          description: `"${payload.name}" atualizado com sucesso.`,
        })
      } else {
        await materialsService.create(payload)
        toast({
          title: 'Material criado',
          description: `"${payload.name}" cadastrado com sucesso.`,
        })
      }
      setMaterialModalOpen(false)
      loadData()
    } catch (err) {
      console.error('Error saving material:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Verifique os dados e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Toggle active status logically (Requirements 1: desativação lógica)
  const handleToggleMaterialStatus = async (item: QuoteMaterial) => {
    const newStatus = !item.is_active
    try {
      await materialsService.setActiveStatus(item.id, newStatus)
      setMaterials((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, is_active: newStatus } : m)),
      )
      toast({
        title: newStatus ? 'Material reativado' : 'Material desativado',
        description: `O material "${item.name}" foi ${newStatus ? 'reativado' : 'desativado com segurança'}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao alterar status',
        variant: 'destructive',
      })
    }
  }

  // Additional Modal Handlers
  const handleOpenAdditionalModal = (item?: QuoteAdditional) => {
    if (item) {
      setEditingAdditional(item)
      setAdditionalForm({
        name: item.name,
        description: item.description || '',
        category: item.category || 'Acabamentos',
        calc_unit: item.calc_unit,
        cost_price: item.cost_price,
        sale_price: item.sale_price,
        min_price: item.min_price || '',
        is_active: item.is_active,
      })
    } else {
      setEditingAdditional(null)
      setAdditionalForm({
        name: '',
        description: '',
        category: 'Acabamentos',
        calc_unit: 'unidade',
        cost_price: '',
        sale_price: '',
        min_price: '',
        is_active: true,
      })
    }
    setAdditionalModalOpen(true)
  }

  const handleSaveAdditional = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!additionalForm.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const payload: Partial<QuoteAdditional> = {
        name: additionalForm.name.trim(),
        description: additionalForm.description.trim(),
        category: additionalForm.category.trim() || 'Acabamentos',
        calc_unit: additionalForm.calc_unit,
        cost_price: Number(additionalForm.cost_price || 0),
        sale_price: Number(additionalForm.sale_price || 0),
        min_price: Number(additionalForm.min_price || 0),
        is_active: additionalForm.is_active,
      }

      if (editingAdditional) {
        await additionalsService.update(editingAdditional.id, payload)
        toast({
          title: 'Adicional atualizado',
          description: `"${payload.name}" atualizado com sucesso.`,
        })
      } else {
        await additionalsService.create(payload)
        toast({
          title: 'Adicional criado',
          description: `"${payload.name}" cadastrado com sucesso.`,
        })
      }
      setAdditionalModalOpen(false)
      loadData()
    } catch (err) {
      console.error('Error saving additional:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Verifique os dados e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAdditionalStatus = async (item: QuoteAdditional) => {
    const newStatus = !item.is_active
    try {
      await additionalsService.setActiveStatus(item.id, newStatus)
      setAdditionals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, is_active: newStatus } : a)),
      )
      toast({
        title: newStatus ? 'Adicional reativado' : 'Adicional desativado',
        description: `O acabamento "${item.name}" foi ${newStatus ? 'reativado' : 'desativado'}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao alterar status',
        variant: 'destructive',
      })
    }
  }

  // Margin Calculation Helper
  const calcMargin = (cost: number, sale: number) => {
    if (!sale || sale <= 0) return { profit: 0, pct: 0 }
    const profit = sale - cost
    const pct = (profit / sale) * 100
    return { profit, pct }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Layers className="h-4 w-4" />
            Módulo Orçamentos
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Materiais e Preços
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Gerencie o custo, preço de venda, regras de unidade e acabamentos adicionais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'materials' ? (
            <Button
              onClick={() => handleOpenMaterialModal()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Novo Material
            </Button>
          ) : (
            <Button
              onClick={() => handleOpenAdditionalModal()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Novo Acabamento / Adicional
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Switcher: Materiais x Acabamentos & Adicionais */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          setActiveTab(val as any)
          setSelectedCategory('all')
        }}
        className="space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
            <TabsTrigger value="materials" className="gap-2 px-4">
              <Package className="h-4 w-4 text-emerald-600" />
              Materiais Base ({materials.length})
            </TabsTrigger>
            <TabsTrigger value="additionals" className="gap-2 px-4">
              <Scissors className="h-4 w-4 text-teal-600" />
              Acabamentos & Adicionais ({additionals.length})
            </TabsTrigger>
          </TabsList>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>
                Ativos:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {activeTab === 'materials'
                    ? materials.filter((m) => m.is_active).length
                    : additionals.filter((a) => a.is_active).length}
                </strong>
              </span>
            </div>
            <div className="h-3 w-[1px] bg-slate-200 dark:bg-slate-700"></div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600"></span>
              <span>
                Inativos:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {activeTab === 'materials'
                    ? materials.filter((m) => !m.is_active).length
                    : additionals.filter((a) => !a.is_active).length}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="sm:col-span-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Pesquisar ${
                activeTab === 'materials' ? 'materiais' : 'adicionais'
              } por nome, descrição ou categoria...`}
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
                {(activeTab === 'materials' ? materialCategories : additionalCategories).map(
                  (cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-3">
            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Apenas Ativos</SelectItem>
                <SelectItem value="inactive">Apenas Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* TAB 1: MATERIAIS */}
        <TabsContent value="materials" className="m-0 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mr-3" />
              Carregando materiais...
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                Nenhum material encontrado
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Tente ajustar os filtros ou cadastre um novo material.
              </p>
              <Button
                onClick={() => handleOpenMaterialModal()}
                variant="outline"
                className="mt-4 gap-2"
              >
                <Plus className="h-4 w-4" />
                Cadastrar Material
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterials.map((mat) => {
                const margin = calcMargin(mat.cost_price, mat.sale_price)
                return (
                  <Card
                    key={mat.id}
                    className={`transition-all duration-200 flex flex-col justify-between ${
                      mat.is_active
                        ? 'border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/60 shadow-xs'
                        : 'opacity-70 bg-slate-50/70 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                            >
                              {mat.category}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                            >
                              {CALC_UNIT_LABELS[mat.calc_unit] || mat.calc_unit}
                            </Badge>
                          </div>
                          <CardTitle className="text-base font-bold text-slate-900 dark:text-white mt-2">
                            {mat.name}
                          </CardTitle>
                        </div>

                        <Badge
                          variant={mat.is_active ? 'default' : 'secondary'}
                          className={`text-[10px] uppercase font-bold shrink-0 ${
                            mat.is_active
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {mat.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>

                      {mat.description && (
                        <CardDescription className="text-xs text-slate-500 line-clamp-2 mt-1">
                          {mat.description}
                        </CardDescription>
                      )}
                    </CardHeader>

                    <CardContent className="space-y-4 pt-0">
                      {/* Price Matrix Grid */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-100 dark:border-slate-800/80 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-medium block">
                            Custo
                          </span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            R$ {mat.cost_price.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold block">
                            Venda
                          </span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                            R$ {mat.sale_price.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-amber-600 uppercase font-medium block">
                            Mínimo
                          </span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {mat.min_price ? `R$ ${mat.min_price.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Financial Margin & Profit Indicator */}
                      <div className="flex items-center justify-between text-xs px-1 text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                          Lucro Bruto: <strong>R$ {margin.profit.toFixed(2)}</strong>
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                          <Percent className="h-3 w-3" />
                          Margem: {margin.pct.toFixed(1)}%
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenMaterialModal(mat)}
                          className="h-8 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 gap-1.5"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Editar
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleMaterialStatus(mat)}
                          className={`h-8 text-xs gap-1.5 ${
                            mat.is_active
                              ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                              : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                          }`}
                        >
                          {mat.is_active ? (
                            <>
                              <PowerOff className="h-3.5 w-3.5 text-rose-500" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <Power className="h-3.5 w-3.5 text-emerald-500" />
                              Reativar
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: ACABAMENTOS & ADICIONAIS */}
        <TabsContent value="additionals" className="m-0 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mr-3" />
              Carregando acabamentos e adicionais...
            </div>
          ) : filteredAdditionals.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <Scissors className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                Nenhum adicional encontrado
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Cadastre ilhós, bastão, costura, frete ou serviços para vincular aos produtos.
              </p>
              <Button
                onClick={() => handleOpenAdditionalModal()}
                variant="outline"
                className="mt-4 gap-2"
              >
                <Plus className="h-4 w-4" />
                Cadastrar Adicional
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAdditionals.map((add) => {
                const margin = calcMargin(add.cost_price, add.sale_price)
                return (
                  <Card
                    key={add.id}
                    className={`transition-all duration-200 flex flex-col justify-between ${
                      add.is_active
                        ? 'border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/60 shadow-xs'
                        : 'opacity-70 bg-slate-50/70 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            {add.category && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                              >
                                {add.category}
                              </Badge>
                            )}
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-medium bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800"
                            >
                              {ADDITIONAL_UNIT_LABELS[add.calc_unit] || add.calc_unit}
                            </Badge>
                          </div>
                          <CardTitle className="text-base font-bold text-slate-900 dark:text-white mt-2">
                            {add.name}
                          </CardTitle>
                        </div>

                        <Badge
                          variant={add.is_active ? 'default' : 'secondary'}
                          className={`text-[10px] uppercase font-bold shrink-0 ${
                            add.is_active
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {add.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>

                      {add.description && (
                        <CardDescription className="text-xs text-slate-500 line-clamp-2 mt-1">
                          {add.description}
                        </CardDescription>
                      )}
                    </CardHeader>

                    <CardContent className="space-y-4 pt-0">
                      {/* Price Matrix Grid */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-100 dark:border-slate-800/80 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-medium block">
                            Custo
                          </span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            R$ {add.cost_price.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-teal-600 dark:text-teal-400 uppercase font-semibold block">
                            Venda
                          </span>
                          <span className="font-bold text-teal-700 dark:text-teal-400 text-sm">
                            R$ {add.sale_price.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-amber-600 uppercase font-medium block">
                            Mínimo
                          </span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {add.min_price ? `R$ ${add.min_price.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Margin & Profit Indicator */}
                      <div className="flex items-center justify-between text-xs px-1 text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3.5 w-3.5 text-teal-500" />
                          Lucro: <strong>R$ {margin.profit.toFixed(2)}</strong>
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400">
                          <Percent className="h-3 w-3" />
                          Margem: {margin.pct.toFixed(1)}%
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenAdditionalModal(add)}
                          className="h-8 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 gap-1.5"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Editar
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleAdditionalStatus(add)}
                          className={`h-8 text-xs gap-1.5 ${
                            add.is_active
                              ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                              : 'text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30'
                          }`}
                        >
                          {add.is_active ? (
                            <>
                              <PowerOff className="h-3.5 w-3.5 text-rose-500" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <Power className="h-3.5 w-3.5 text-teal-500" />
                              Reativar
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* DIALOG: CREATE / EDIT MATERIAL */}
      <Dialog open={materialModalOpen} onOpenChange={setMaterialModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Package className="h-5 w-5 text-emerald-600" />
              {editingMaterial ? 'Editar Material e Preço' : 'Cadastrar Novo Material'}
            </DialogTitle>
            <DialogDescription>
              Configure os custos internos e preços de venda do material por unidade de cálculo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveMaterial} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nome do Material *
                </label>
                <Input
                  value={materialForm.name}
                  onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                  placeholder="Ex: Lona 440g, Adesivo Brilho, Caneca Branca..."
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Categoria
                </label>
                <Input
                  value={materialForm.category}
                  onChange={(e) => setMaterialForm({ ...materialForm, category: e.target.value })}
                  placeholder="Ex: Lonas e Tecidos, Adesivos, Papéis..."
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Unidade de Cálculo *
                </label>
                <Select
                  value={materialForm.calc_unit}
                  onValueChange={(val: any) => setMaterialForm({ ...materialForm, calc_unit: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="m2">Metro quadrado (m²)</SelectItem>
                    <SelectItem value="metro_linear">Metro linear (m)</SelectItem>
                    <SelectItem value="unidade">Unidade (un)</SelectItem>
                    <SelectItem value="centimetro">Centímetro (cm)</SelectItem>
                    <SelectItem value="quilo">Quilo (kg)</SelectItem>
                    <SelectItem value="valor_fixo">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Descrição Técnica
                </label>
                <Textarea
                  value={materialForm.description}
                  onChange={(e) =>
                    setMaterialForm({ ...materialForm, description: e.target.value })
                  }
                  placeholder="Especificações do fabricante, durabilidade, gramatura ou recomendações de uso..."
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
            </div>

            {/* Financial Block */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                Matriz de Preços (por {CALC_UNIT_LABELS[materialForm.calc_unit] || 'unidade'})
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Custo Interno (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={materialForm.cost_price}
                    onChange={(e) =>
                      setMaterialForm({ ...materialForm, cost_price: e.target.value })
                    }
                    placeholder="0.00"
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Preço de Venda (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={materialForm.sale_price}
                    onChange={(e) =>
                      setMaterialForm({ ...materialForm, sale_price: e.target.value })
                    }
                    placeholder="0.00"
                    required
                    className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Preço Mínimo (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={materialForm.min_price}
                    onChange={(e) =>
                      setMaterialForm({ ...materialForm, min_price: e.target.value })
                    }
                    placeholder="Opcional"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Profit Preview */}
              {Number(materialForm.sale_price) > 0 && (
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <span>
                    Lucro Bruto Unitário:{' '}
                    <strong className="text-slate-900 dark:text-white">
                      R${' '}
                      {(
                        Number(materialForm.sale_price || 0) - Number(materialForm.cost_price || 0)
                      ).toFixed(2)}
                    </strong>
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    Margem:{' '}
                    {(
                      ((Number(materialForm.sale_price || 0) -
                        Number(materialForm.cost_price || 0)) /
                        Number(materialForm.sale_price || 1)) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setMaterialModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Salvando...' : editingMaterial ? 'Salvar Alterações' : 'Criar Material'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG: CREATE / EDIT ADDITIONAL */}
      <Dialog open={additionalModalOpen} onOpenChange={setAdditionalModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Scissors className="h-5 w-5 text-teal-600" />
              {editingAdditional ? 'Editar Acabamento / Adicional' : 'Cadastrar Novo Acabamento'}
            </DialogTitle>
            <DialogDescription>
              Adicionais e acabamentos (como Ilhós, Costura, Bastão, Instalação) que podem ser
              vinculados aos produtos orçados.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAdditional} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nome do Acabamento / Adicional *
                </label>
                <Input
                  value={additionalForm.name}
                  onChange={(e) => setAdditionalForm({ ...additionalForm, name: e.target.value })}
                  placeholder="Ex: Ilhós metálico, Bainha de reforço, Bastão com ponteira..."
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Categoria
                </label>
                <Input
                  value={additionalForm.category}
                  onChange={(e) =>
                    setAdditionalForm({ ...additionalForm, category: e.target.value })
                  }
                  placeholder="Ex: Acabamentos, Acessórios, Serviços..."
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Unidade de Cálculo *
                </label>
                <Select
                  value={additionalForm.calc_unit}
                  onValueChange={(val: any) =>
                    setAdditionalForm({ ...additionalForm, calc_unit: val })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unidade">Por Unidade (un)</SelectItem>
                    <SelectItem value="metro_linear">Por Metro Linear (m)</SelectItem>
                    <SelectItem value="m2">Por Metro Quadrado (m²)</SelectItem>
                    <SelectItem value="valor_fixo">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Descrição
                </label>
                <Textarea
                  value={additionalForm.description}
                  onChange={(e) =>
                    setAdditionalForm({ ...additionalForm, description: e.target.value })
                  }
                  placeholder="Informações sobre a aplicação e maquinário do acabamento..."
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
            </div>

            {/* Financial Block */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-teal-600" />
                Matriz de Preços do Adicional
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Custo Interno (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={additionalForm.cost_price}
                    onChange={(e) =>
                      setAdditionalForm({ ...additionalForm, cost_price: e.target.value })
                    }
                    placeholder="0.00"
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                    Preço de Venda (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={additionalForm.sale_price}
                    onChange={(e) =>
                      setAdditionalForm({ ...additionalForm, sale_price: e.target.value })
                    }
                    placeholder="0.00"
                    required
                    className="mt-1 font-semibold text-teal-700 dark:text-teal-300"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Preço Mínimo (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={additionalForm.min_price}
                    onChange={(e) =>
                      setAdditionalForm({ ...additionalForm, min_price: e.target.value })
                    }
                    placeholder="Opcional"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAdditionalModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {saving
                  ? 'Salvando...'
                  : editingAdditional
                    ? 'Salvar Alterações'
                    : 'Criar Adicional'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
