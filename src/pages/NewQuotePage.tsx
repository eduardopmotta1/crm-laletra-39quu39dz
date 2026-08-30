import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import {
  Calculator,
  Plus,
  Trash2,
  Package,
  Layers,
  Scissors,
  CheckCircle2,
  FileText,
  DollarSign,
  TrendingUp,
  Percent,
  Info,
  ArrowRight,
  ShieldCheck,
  User,
  Phone,
  Mail,
  Tag,
  AlertCircle,
  Copy,
  Check,
  AlertTriangle,
  Edit3,
  Lock,
  ArrowLeft,
} from 'lucide-react'
import { productsService } from '@/services/quoteProducts'
import { materialsService } from '@/services/quoteMaterials'
import { additionalsService } from '@/services/quoteAdditionals'
import { clientsService } from '@/services/clients'
import { quotesService } from '@/services/quotes'
import type {
  Quote,
  QuoteProduct,
  QuoteMaterial,
  QuoteAdditional,
  QuoteCalculationItem,
  ProductCalcRule,
  AdditionalCalcUnit,
} from '@/types/quotes'
import { CALC_RULE_LABELS, CALC_UNIT_LABELS, ADDITIONAL_UNIT_LABELS } from '@/types/quotes'
import { calculateQuoteItem, calculateQuoteSummary } from '@/lib/quoteCalculator'
import type { Client } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/hooks/use-toast'

export default function NewQuotePage() {
  const navigate = useNavigate()
  const params = useParams<{ quoteId?: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()

  // Identify edit mode: from path param (/orcamentos/:quoteId/editar) or query param (?quote_id=... / ?editQuoteId=...)
  const editQuoteId =
    params.quoteId ||
    searchParams.get('quote_id') ||
    searchParams.get('quoteId') ||
    searchParams.get('editQuoteId') ||
    (location.state as any)?.quoteId ||
    (location.state as any)?.quote_id ||
    ''

  const isEditing = Boolean(editQuoteId)

  // Immutable original quote code and status when editing
  const { isAdmin } = useAuth()
  const [quoteCode, setQuoteCode] = useState<string>('')
  const [quoteStatus, setQuoteStatus] = useState<Quote['status']>('rascunho')

  // Delete Confirmation Dialog when in Edit mode
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [products, setProducts] = useState<QuoteProduct[]>([])
  const [materials, setMaterials] = useState<QuoteMaterial[]>([])
  const [additionals, setAdditionals] = useState<QuoteAdditional[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveErrorInfo, setSaveErrorInfo] = useState<{
    status: number | null
    message: string
    data: any
    rawJson: string
  } | null>(null)
  const [copiedError, setCopiedError] = useState(false)

  // Explicit attendance_id from navigation (query param, router state, or existing quote)
  const [attendanceId, setAttendanceId] = useState<string>(() => {
    const fromQuery = searchParams.get('attendance_id') || searchParams.get('attendanceId')
    const fromState =
      (location.state as any)?.attendance_id || (location.state as any)?.attendanceId
    return fromQuery || fromState || ''
  })

  // Header form: Client & Info
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    const fromQuery = searchParams.get('client_id') || searchParams.get('clientId')
    const fromState = (location.state as any)?.client_id || (location.state as any)?.clientId
    return fromQuery || fromState || ''
  })
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [discountAmount, setDiscountAmount] = useState<number | string>('0')

  // Items in Quote
  const [items, setItems] = useState<QuoteCalculationItem[]>([])

  // Item Builder Inputs
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [itemCalcRule, setItemCalcRule] = useState<ProductCalcRule>('m2')
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('')
  const [itemWidth, setItemWidth] = useState<number | string>(1.0)
  const [itemHeight, setItemHeight] = useState<number | string>(1.5)
  const [itemQuantity, setItemQuantity] = useState<number | string>(1)
  const [itemNotes, setItemNotes] = useState('')
  const [builderAdds, setBuilderAdds] = useState<Record<string, number>>({})

  const loadData = async () => {
    setLoading(true)
    try {
      const [prods, mats, adds, cls] = await Promise.all([
        productsService.getActive(),
        materialsService.getActive(),
        additionalsService.getActive(),
        clientsService.getAll('is_archived = false', 'name'),
      ])
      setProducts(prods)
      setMaterials(mats)
      setAdditionals(adds)
      setClients(cls)

      if (prods.length > 0) {
        selectProductForBuilder(prods[0])
      }

      // If in edit mode, load the quote explicitly by its ID
      if (editQuoteId) {
        const existingQuote = await quotesService.getById(editQuoteId)
        if (existingQuote) {
          setQuoteCode(existingQuote.code)
          setQuoteStatus(existingQuote.status || 'rascunho')
          setSelectedClientId(existingQuote.client_id || '')
          setAttendanceId(existingQuote.attendance_id || '')
          setClientName(existingQuote.client_name || '')
          setClientPhone(existingQuote.client_phone || '')
          setClientEmail(existingQuote.client_email || '')
          setQuoteNotes(existingQuote.notes || '')
          setDiscountAmount(existingQuote.discount_amount ?? 0)
          if (Array.isArray(existingQuote.items)) {
            setItems(existingQuote.items)
          }
        } else {
          toast({
            title: 'Orçamento não encontrado',
            description: `Não foi possível encontrar o orçamento ID "${editQuoteId}".`,
            variant: 'destructive',
          })
          navigate('/orcamentos')
          return
        }
      } else {
        // Create mode: If clientId was passed via query params or state, prefill client details
        const initialClientId =
          searchParams.get('client_id') ||
          searchParams.get('clientId') ||
          (location.state as any)?.client_id ||
          (location.state as any)?.clientId

        if (initialClientId) {
          const found = cls.find((c) => c.id === initialClientId)
          if (found) {
            setSelectedClientId(found.id)
            setClientName(found.name)
            setClientPhone(found.phone || '')
            setClientEmail(found.email || '')
          }
        }
      }
    } catch (err) {
      console.error('Error loading quote builder data:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar o catálogo de produtos e materiais.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [editQuoteId])

  // When selecting a client from CRM
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId)
    const found = clients.find((c) => c.id === clientId)
    if (found) {
      setClientName(found.name)
      setClientPhone(found.phone || '')
      setClientEmail(found.email || '')
    }
  }

  // When selecting a product for the builder
  const selectProductForBuilder = (prod: QuoteProduct) => {
    setSelectedProductId(prod.id)
    setItemCalcRule(prod.calc_rule)
    setSelectedMaterialId(prod.main_material_id || '')
    setItemWidth(prod.default_width || 1.0)
    setItemHeight(prod.default_height || 1.5)
    setItemQuantity(prod.default_quantity || 1)

    // Reset additionals
    const initialAdds: Record<string, number> = {}
    if (prod.additionals) {
      for (const aId of prod.additionals) {
        initialAdds[aId] = 0 // start at 0 until checked
      }
    }
    setBuilderAdds(initialAdds)
  }

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null
  }, [products, selectedProductId])

  const selectedMaterial = useMemo(() => {
    return (
      materials.find((m) => m.id === selectedMaterialId) ||
      selectedProduct?.expand?.main_material_id ||
      null
    )
  }, [materials, selectedMaterialId, selectedProduct])

  // Live calculation of current item in the builder
  const currentItemPreview = useMemo(() => {
    if (!selectedProduct && !selectedMaterial) return null

    const additionalsSelection = Object.entries(builderAdds)
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
      product: selectedProduct,
      material: selectedMaterial,
      width: Number(itemWidth) || 0,
      height: Number(itemHeight) || 0,
      quantity: Math.max(1, Number(itemQuantity) || 1),
      additionalsSelection,
    })
  }, [
    selectedProduct,
    selectedMaterial,
    itemWidth,
    itemHeight,
    itemQuantity,
    builderAdds,
    additionals,
  ])

  // Add calculated item to the quote list
  const handleAddItemToQuote = () => {
    if (!currentItemPreview) return

    setItems((prev) => [
      ...prev,
      {
        ...currentItemPreview,
        notes: itemNotes,
      },
    ])

    setItemNotes('')
    toast({
      title: 'Item adicionado',
      description: `"${currentItemPreview.product_name}" adicionado à proposta.`,
    })
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Summary calculation for the entire quote
  const quoteSummary = useMemo(() => {
    return calculateQuoteSummary(items, Number(discountAmount) || 0)
  }, [items, discountAmount])

  // Save the full quote (Create or Update)
  const handleSaveQuote = async (statusOverride?: Quote['status']) => {
    if (!clientName.trim()) {
      toast({
        title: 'Nome do cliente obrigatório',
        description: 'Informe o nome do cliente antes de salvar o orçamento.',
        variant: 'destructive',
      })
      return
    }

    if (items.length === 0) {
      toast({
        title: 'Nenhum item no orçamento',
        description: 'Adicione pelo menos um produto antes de salvar.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    setSaveErrorInfo(null)
    try {
      const finalStatus = statusOverride || quoteStatus || 'rascunho'

      let savedQuote: Quote

      if (isEditing && editQuoteId) {
        // UPDATE existing quote:
        // Rule: Do NOT call quotesService.create(). Use quotesService.update(editQuoteId, ...)
        // Rule: Do NOT pass code in payload (quotesService.update also strips code to guarantee immutability)
        // Rule: Preserve quote.id, quote.code, attendance_id, client_id
        savedQuote = await quotesService.update(editQuoteId, {
          client_id: selectedClientId || undefined,
          attendance_id: attendanceId.trim() || undefined,
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
          client_email: clientEmail.trim(),
          status: finalStatus,
          items,
          total_cost: quoteSummary.subtotal_cost,
          total_sale: quoteSummary.subtotal_sale,
          discount_amount: quoteSummary.discount_amount,
          final_total: quoteSummary.final_total,
          gross_profit: quoteSummary.gross_profit,
          profit_margin_pct: quoteSummary.profit_margin_pct,
          notes: quoteNotes.trim(),
        })

        toast({
          title: 'Orçamento atualizado com sucesso',
          description: `O orçamento ${quoteCode || savedQuote.code} foi alterado sem modificar seu número.`,
        })
      } else {
        // CREATE new quote:
        // Rule: Only now generate ORC-YYYY-XXXX
        savedQuote = await quotesService.create({
          client_id: selectedClientId || undefined,
          attendance_id: attendanceId.trim() || undefined,
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
          client_email: clientEmail.trim(),
          status: finalStatus,
          items,
          total_cost: quoteSummary.subtotal_cost,
          total_sale: quoteSummary.subtotal_sale,
          discount_amount: quoteSummary.discount_amount,
          final_total: quoteSummary.final_total,
          gross_profit: quoteSummary.gross_profit,
          profit_margin_pct: quoteSummary.profit_margin_pct,
          notes: quoteNotes.trim(),
        })

        toast({
          title: 'Orçamento salvo!',
          description: `Proposta gerada com sucesso (${savedQuote.code}) para "${clientName}".`,
        })
      }

      // Return to attendance conversation if attendance_id is present
      const targetAttendanceId = savedQuote?.attendance_id || attendanceId.trim()
      if (targetAttendanceId) {
        navigate(`/kanban?attendance_id=${encodeURIComponent(targetAttendanceId)}`)
      } else {
        navigate('/orcamentos')
      }
    } catch (err: any) {
      console.error('Error saving quote:', err)

      // PocketBase ClientResponseError structure:
      const errorStatus =
        typeof err?.status === 'number'
          ? err.status
          : typeof err?.response?.status === 'number'
            ? err.response.status
            : null
      const errorMessage =
        err?.message || err?.response?.message || 'Erro desconhecido ao salvar orçamento'
      const errorData =
        err?.data !== undefined
          ? err.data
          : err?.response?.data !== undefined
            ? err.response.data
            : err?.response !== undefined
              ? err.response
              : null

      const structuredPayload = {
        status: errorStatus,
        message: errorMessage,
        data: errorData,
      }

      setSaveErrorInfo({
        status: errorStatus,
        message: errorMessage,
        data: errorData,
        rawJson: JSON.stringify(structuredPayload, null, 2),
      })

      toast({
        title: isEditing ? 'Erro ao atualizar orçamento' : 'Erro ao salvar orçamento',
        description: 'Não foi possível persistir as alterações.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCopyError = () => {
    if (!saveErrorInfo) return
    navigator.clipboard.writeText(saveErrorInfo.rawJson)
    setCopiedError(true)
    setTimeout(() => setCopiedError(false), 2000)
    toast({
      title: 'Erro copiado!',
      description: 'JSON do erro copiado para a área de transferência.',
    })
  }

  const handleConfirmDelete = async () => {
    if (!editQuoteId || isDeleting) return

    setIsDeleting(true)
    try {
      await quotesService.delete(editQuoteId)

      toast({
        title: 'Orçamento excluído',
        description: `Orçamento ${quoteCode || editQuoteId} excluído com sucesso.`,
      })

      setDeleteDialogOpen(false)

      if (attendanceId) {
        navigate(`/kanban?attendance_id=${encodeURIComponent(attendanceId)}`)
      } else {
        navigate('/orcamentos')
      }
    } catch (err: any) {
      console.error('Error deleting quote:', err)
      const errorMsg =
        err?.message ||
        err?.response?.message ||
        (typeof err?.data === 'object' ? JSON.stringify(err.data) : null) ||
        'Não foi possível excluir o orçamento.'
      toast({
        title: 'Erro ao excluir orçamento',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {isEditing ? <Edit3 className="h-4 w-4" /> : <Calculator className="h-4 w-4" />}
            Módulo Orçamentos {isEditing ? '• Edição' : '• Novo'}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {isEditing ? 'Alterar Orçamento' : 'Calculadora & Novo Orçamento'}
            </h1>
            {isEditing && quoteCode && (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 font-mono text-sm px-2.5 py-1 flex items-center gap-1.5 shadow-xs">
                <Lock className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>
                  Número do orçamento: <strong>{quoteCode}</strong>
                </span>
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isEditing
              ? `Editando proposta existente. O código "${quoteCode}" é fixo e permanente no banco de dados.`
              : 'Selecione produtos, insira medidas e acabamentos com cálculo automático de m², custos e preço de venda.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {attendanceId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/kanban?attendance_id=${encodeURIComponent(attendanceId)}`)}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Atendimento
            </Button>
          ) : null}
          <Link to="/orcamentos">
            <Button variant="outline" size="sm">
              Ver Todos os Orçamentos
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: BUILDER & CLIENT (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Client Selection Card */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-600" />
                1. Dados do Cliente
              </CardTitle>
              <CardDescription className="text-xs">
                Vincule a um contato existente no CRM ou digite os dados diretamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Vincular Cliente do CRM (Opcional)
                  </label>
                  <Select value={selectedClientId} onValueChange={handleClientSelect}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione um cliente cadastrado no CRM..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {attendanceId && (
                  <div className="sm:col-span-3">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                        <Tag className="h-3.5 w-3.5" />
                        <span>
                          Vinculado ao Atendimento:{' '}
                          <strong className="font-mono">{attendanceId}</strong>
                        </span>
                      </div>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => setAttendanceId('')}
                          className="text-emerald-600 hover:text-emerald-800 text-[11px] underline"
                        >
                          Desvincular
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nome do Cliente *
                  </label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex: Carlos Silva"
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Telefone / WhatsApp
                  </label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+55 11 99999-9999"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Email
                  </label>
                  <Input
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Item Builder Card */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-600" />
                2. Configurar Item / Produto
              </CardTitle>
              <CardDescription className="text-xs">
                Escolha o produto, informe as dimensões e selecione os acabamentos adicionais.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Product Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Produto do Catálogo
                  </label>
                  <Select
                    value={selectedProductId}
                    onValueChange={(val) => {
                      const prod = products.find((p) => p.id === val)
                      if (prod) selectProductForBuilder(prod)
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione o produto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Material Vinculado
                  </label>
                  <Select
                    value={selectedMaterialId}
                    onValueChange={(val) => setSelectedMaterialId(val)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione o material..." />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} — R$ {m.sale_price.toFixed(2)}/{m.calc_unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dimensions Input depending on calculation rule */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Calculator className="h-4 w-4 text-emerald-600" />
                    Regra:{' '}
                    {selectedProduct
                      ? CALC_RULE_LABELS[selectedProduct.calc_rule]
                      : 'Metro Quadrado'}
                  </span>

                  {selectedProduct?.min_price && selectedProduct.min_price > 0 ? (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                      Preço Mínimo: R$ {selectedProduct.min_price.toFixed(2)}
                    </Badge>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {selectedProduct?.calc_rule === 'm2' && (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Largura (metros) *
                        </label>
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          value={itemWidth}
                          onChange={(e) => setItemWidth(e.target.value)}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Altura (metros) *
                        </label>
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          value={itemHeight}
                          onChange={(e) => setItemHeight(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </>
                  )}

                  {selectedProduct?.calc_rule === 'metro_linear' && (
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Metragem Linear (metros) *
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={itemWidth}
                        onChange={(e) => setItemWidth(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Quantidade de Peças *
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(e.target.value)}
                      className="mt-1 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Additionals & Finishes Selector */}
              {selectedProduct?.additionals && selectedProduct.additionals.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Scissors className="h-4 w-4 text-teal-600" />
                    Acabamentos & Adicionais Disponíveis
                  </span>

                  <div className="space-y-2">
                    {selectedProduct.additionals.map((addId) => {
                      const add = additionals.find((a) => a.id === addId)
                      if (!add) return null
                      const currentQty = builderAdds[addId] || 0

                      return (
                        <div
                          key={add.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {add.name}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              +R$ {add.sale_price.toFixed(2)} ({add.calc_unit})
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-[11px]">Qtd:</span>
                            <Input
                              type="number"
                              min="0"
                              value={currentQty}
                              onChange={(e) =>
                                setBuilderAdds({
                                  ...builderAdds,
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

              {/* Item Calculation Preview & Add Button */}
              {currentItemPreview && (
                <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    {selectedProduct?.calc_rule === 'm2' && (
                      <>
                        <div className="p-2 rounded-lg bg-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase block">
                            Área Un.
                          </span>
                          <strong className="text-xs">
                            {currentItemPreview.individual_area} m²
                          </strong>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase block">
                            Área Total
                          </span>
                          <strong className="text-xs">{currentItemPreview.total_area} m²</strong>
                        </div>
                      </>
                    )}

                    <div className="p-2 rounded-lg bg-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">
                        Preço Unitário
                      </span>
                      <strong className="text-xs text-emerald-400">
                        R$ {currentItemPreview.applied_unit_price.toFixed(2)}
                      </strong>
                      {currentItemPreview.is_min_price_applied && (
                        <span className="text-[9px] text-amber-400 block">(Mínimo)</span>
                      )}
                    </div>

                    <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800">
                      <span className="text-[10px] text-emerald-400 uppercase font-bold block">
                        Total Item
                      </span>
                      <strong className="text-sm text-emerald-300 font-black">
                        R$ {currentItemPreview.item_total_sale.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <span className="text-slate-400">
                      Custo Interno: R$ {currentItemPreview.item_total_cost.toFixed(2)} | Lucro
                      Bruto: R$ {currentItemPreview.item_gross_profit.toFixed(2)} (
                      {currentItemPreview.item_margin_pct.toFixed(1)}%)
                    </span>

                    <Button
                      type="button"
                      onClick={handleAddItemToQuote}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-9"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar ao Orçamento
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: PROPOSAL SUMMARY & FINANCIALS (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Temporary Diagnostic Error Card for PocketBase */}
          {saveErrorInfo && (
            <Card className="border-rose-300 dark:border-rose-900 bg-rose-50/90 dark:bg-rose-950/40 shadow-md">
              <CardHeader className="pb-2 border-b border-rose-200 dark:border-rose-900/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-sm">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    <span>Diagnóstico de Erro (PocketBase)</span>
                  </div>
                  <Badge variant="destructive" className="font-mono text-xs">
                    HTTP {saveErrorInfo.status ?? 'N/A'}
                  </Badge>
                </div>
                <CardDescription className="text-xs text-rose-600/90 dark:text-rose-400/90">
                  Retorno completo capturado no salvamento do orçamento.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-3 text-xs">
                <div>
                  <span className="font-semibold text-rose-900 dark:text-rose-200 block mb-0.5">
                    HTTP STATUS:
                  </span>
                  <div className="font-mono font-bold text-rose-800 dark:text-rose-300 px-2.5 py-1 bg-white/80 dark:bg-slate-900 rounded border border-rose-200 dark:border-rose-900">
                    {saveErrorInfo.status !== null ? saveErrorInfo.status : 'N/A'}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-rose-900 dark:text-rose-200 block mb-0.5">
                    MESSAGE:
                  </span>
                  <div className="font-mono text-rose-800 dark:text-rose-300 px-2.5 py-1 bg-white/80 dark:bg-slate-900 rounded border border-rose-200 dark:border-rose-900 break-words">
                    {saveErrorInfo.message}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-rose-900 dark:text-rose-200 block mb-0.5">
                    ERROR.DATA:
                  </span>
                  <pre className="font-mono text-[11px] p-2.5 bg-slate-950 text-rose-300 rounded-lg border border-rose-900/50 overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(saveErrorInfo.data, null, 2)}
                  </pre>
                </div>

                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyError}
                    className="w-full bg-white dark:bg-slate-900 border-rose-300 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    {copiedError ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Copiado com sucesso!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copiar erro
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm sticky top-6">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center justify-between">
                <span>Resumo da Proposta</span>
                <Badge variant="secondary">{items.length} item(ns)</Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {/* Items List */}
              {items.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhum item adicionado ainda. Configure ao lado e clique em "Adicionar ao
                  Orçamento".
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <strong className="text-slate-900 dark:text-white block truncate">
                          {item.product_name}
                        </strong>
                        <span className="text-[11px] text-slate-500 block">
                          {item.quantity}x • R$ {item.applied_unit_price.toFixed(2)}/un
                        </span>
                        {item.total_area && (
                          <span className="text-[10px] text-slate-400 block">
                            Área total: {item.total_area} m²
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-600 text-xs">
                          R$ {item.item_total_sale.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Discount and Totals */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal da Venda:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    R$ {quoteSummary.subtotal_sale.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-400">
                    Desconto Comercial (R$):
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="h-7 w-24 text-right text-xs"
                  />
                </div>

                <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                  <span>Valor Final da Proposta:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 text-lg">
                    R$ {quoteSummary.final_total.toFixed(2)}
                  </span>
                </div>
              </div>
              {/* Admin Cost vs Sale Box (Requirement 5) */}
              <div className="p-3 rounded-xl bg-slate-900 text-white space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Custo Total de Materiais:</span>
                  <span className="font-semibold text-slate-200">
                    R$ {quoteSummary.subtotal_cost.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Lucro Bruto Previsto:</span>
                  <span className="font-bold text-emerald-400">
                    R$ {quoteSummary.gross_profit.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-300 font-semibold">Margem de Lucro:</span>
                  <span className="font-bold text-emerald-400">
                    {quoteSummary.profit_margin_pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              {/* Observations */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Condições / Observações do Orçamento
                </label>
                <Textarea
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  placeholder="Prazo de produção, condições de pagamento (ex: 50% entrada), validade da proposta..."
                  rows={2}
                  className="mt-1 resize-none text-xs"
                />
              </div>
              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={() => handleSaveQuote(isEditing ? quoteStatus : 'rascunho')}
                  disabled={saving || items.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-10 shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {saving
                    ? 'Salvando Proposta...'
                    : isEditing
                      ? 'Salvar Alterações do Orçamento'
                      : 'Salvar Orçamento'}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => handleSaveQuote('enviado')}
                  disabled={saving || items.length === 0}
                  className="w-full text-xs"
                >
                  {isEditing
                    ? 'Salvar e Marcar como Enviado ao Cliente'
                    : 'Salvar como Enviado ao Cliente'}
                </Button>

                {isEditing && isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={saving || isDeleting}
                    className="w-full text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 gap-1.5 mt-2"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    Excluir orçamento
                  </Button>
                )}
              </div>{' '}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* DIALOG DE CONFIRMAÇÃO DE EXCLUSÃO DE ORÇAMENTO */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" />
              <span>Excluir orçamento {quoteCode}?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="block">Esta ação excluirá somente este orçamento.</span>
              <span className="block">
                Cliente, atendimento, mensagens e pedidos não serão excluídos.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-600"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir orçamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
