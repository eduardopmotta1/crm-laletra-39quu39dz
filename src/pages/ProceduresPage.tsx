import React, { useState, useEffect, useMemo } from 'react'
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  Archive,
  RotateCcw,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCode,
  Tag,
  User as UserIcon,
  Calendar,
  Layers,
  ChevronRight,
  ListOrdered,
  List,
  StickyNote,
  Paperclip,
  Download,
  ExternalLink,
  Trash2,
  HelpCircle,
  Sparkles,
  Info,
  Check,
  X,
  FileImage,
  AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  proceduresService,
  INITIAL_PROCEDURE_CATEGORIES,
  type Procedure,
  type ProcedureStatus,
  type ProcedureStep,
} from '@/services/procedures'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

export default function ProceduresPage() {
  const { user, isAdmin, hasPermission } = useAuth()

  // Permissions check
  const canView = isAdmin || hasPermission('procedures_view')
  const canCreate = isAdmin || hasPermission('procedures_create')
  const canEdit = isAdmin || hasPermission('procedures_edit')
  const canArchive = isAdmin || hasPermission('procedures_archive')

  // State
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>([...INITIAL_PROCEDURE_CATEGORIES])

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [showArchived, setShowArchived] = useState(false)

  // View Modal State
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [activeProcedure, setActiveProcedure] = useState<Procedure | null>(null)

  // Edit/Create Modal State
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null>(null)
  const [saving, setSaving] = useState(false)

  // Form State
  const [formData, setFormData] = useState<{
    title: string
    category: string
    customCategory: string
    summary: string
    content: string
    notes: string
    version: string
    status: ProcedureStatus
    reviewer_name: string
    last_reviewed_at: string
    steps: ProcedureStep[]
  }>({
    title: '',
    category: 'Atendimento',
    customCategory: '',
    summary: '',
    content: '',
    notes: '',
    version: '1.0',
    status: 'Ativo',
    reviewer_name: '',
    last_reviewed_at: new Date().toISOString().split('T')[0],
    steps: [],
  })

  // Attachments State
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [existingAttachments, setExistingAttachments] = useState<string[]>([])

  // Step builder input
  const [stepTitle, setStepTitle] = useState('')
  const [stepDesc, setStepDesc] = useState('')

  useEffect(() => {
    loadProcedures()
  }, [selectedCategory, selectedStatus, showArchived])

  const loadProcedures = async () => {
    setLoading(true)
    try {
      const [list, cats] = await Promise.all([
        proceduresService.getAll({
          category: selectedCategory !== 'all' ? selectedCategory : undefined,
          status: selectedStatus !== 'all' ? (selectedStatus as ProcedureStatus) : undefined,
          includeArchived: showArchived || selectedStatus === 'Arquivado',
        }),
        proceduresService.getCategories(),
      ])
      setProcedures(list)
      setCategories(cats)
    } catch (err) {
      console.error('Error loading procedures:', err)
      toast({
        title: 'Erro ao carregar procedimentos',
        description: 'Não foi possível buscar a lista de procedimentos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Filtered by Search Query
  const filteredProcedures = useMemo(() => {
    if (!searchQuery.trim()) return procedures
    const q = searchQuery.toLowerCase().trim()
    return procedures.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.summary && p.summary.toLowerCase().includes(q)) ||
        (p.content && p.content.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q)) ||
        (p.reviewer_name && p.reviewer_name.toLowerCase().includes(q)) ||
        (p.steps &&
          p.steps.some(
            (s) =>
              s.title.toLowerCase().includes(q) ||
              (s.description && s.description.toLowerCase().includes(q)),
          )),
    )
  }, [procedures, searchQuery])

  // Open Details Modal
  const handleViewProcedure = (proc: Procedure) => {
    setActiveProcedure(proc)
    setViewModalOpen(true)
  }

  // Open Create/Edit Modal
  const handleOpenEditModal = (proc?: Procedure) => {
    if (proc) {
      setEditingProcedure(proc)
      const isKnownCat = categories.includes(proc.category)
      setFormData({
        title: proc.title || '',
        category: isKnownCat ? proc.category : 'Outros',
        customCategory: isKnownCat ? '' : proc.category,
        summary: proc.summary || '',
        content: proc.content || '',
        notes: proc.notes || '',
        version: proc.version || '1.0',
        status: proc.status || 'Ativo',
        reviewer_name: proc.reviewer_name || user?.name || '',
        last_reviewed_at: proc.last_reviewed_at
          ? proc.last_reviewed_at.split('T')[0]
          : new Date().toISOString().split('T')[0],
        steps: Array.isArray(proc.steps) ? [...proc.steps] : [],
      })
      setExistingAttachments(proc.attachments || [])
    } else {
      setEditingProcedure(null)
      setFormData({
        title: '',
        category: 'Atendimento',
        customCategory: '',
        summary: '',
        content: '',
        notes: '',
        version: '1.0',
        status: 'Ativo',
        reviewer_name: user?.name || '',
        last_reviewed_at: new Date().toISOString().split('T')[0],
        steps: [],
      })
      setExistingAttachments([])
    }
    setNewFiles([])
    setStepTitle('')
    setStepDesc('')
    setEditModalOpen(true)
  }

  // Add Step to list
  const handleAddStep = () => {
    if (!stepTitle.trim()) {
      toast({ title: 'Título do passo é obrigatório', variant: 'destructive' })
      return
    }
    setFormData((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          id: String(Date.now()),
          title: stepTitle.trim(),
          description: stepDesc.trim(),
          order: prev.steps.length + 1,
        },
      ],
    }))
    setStepTitle('')
    setStepDesc('')
  }

  // Remove Step
  const handleRemoveStep = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }))
  }

  // Save Procedure
  const handleSaveProcedure = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      toast({ title: 'Título é obrigatório', variant: 'destructive' })
      return
    }

    const finalCategory =
      formData.category === 'Outros' && formData.customCategory.trim()
        ? formData.customCategory.trim()
        : formData.category

    setSaving(true)
    try {
      const payloadFormData = new FormData()
      payloadFormData.append('title', formData.title.trim())
      payloadFormData.append('category', finalCategory)
      payloadFormData.append('summary', formData.summary.trim())
      payloadFormData.append('content', formData.content.trim())
      payloadFormData.append('notes', formData.notes.trim())
      payloadFormData.append('version', formData.version.trim() || '1.0')
      payloadFormData.append('status', formData.status)
      payloadFormData.append('reviewer_name', formData.reviewer_name.trim())
      payloadFormData.append('last_reviewed_at', formData.last_reviewed_at)

      if (user?.id) {
        payloadFormData.append('reviewer_id', user.id)
      }

      // Steps as JSON string
      payloadFormData.append('steps', JSON.stringify(formData.steps))

      // Append new files
      for (const file of newFiles) {
        payloadFormData.append('attachments', file)
      }

      if (editingProcedure) {
        await proceduresService.update(editingProcedure.id, payloadFormData)
        toast({
          title: 'Procedimento atualizado!',
          description: `"${formData.title}" salvo com sucesso.`,
        })
      } else {
        await proceduresService.create(payloadFormData)
        toast({
          title: 'Procedimento cadastrado!',
          description: `"${formData.title}" criado com sucesso.`,
        })
      }

      setEditModalOpen(false)
      loadProcedures()
    } catch (err) {
      console.error('Error saving procedure:', err)
      toast({
        title: 'Erro ao salvar procedimento',
        description: 'Verifique se os dados preenchidos são válidos.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Archive / Reactivate
  const handleToggleArchive = async (proc: Procedure) => {
    try {
      if (proc.status === 'Arquivado') {
        await proceduresService.reactivate(proc.id)
        toast({
          title: 'Procedimento reativado!',
          description: `"${proc.title}" agora está Ativo.`,
        })
      } else {
        await proceduresService.archive(proc.id)
        toast({
          title: 'Procedimento arquivado!',
          description: `"${proc.title}" foi movido para o arquivo.`,
        })
      }
      loadProcedures()
      if (activeProcedure?.id === proc.id) {
        setViewModalOpen(false)
      }
    } catch (err) {
      toast({
        title: 'Erro ao alterar status',
        variant: 'destructive',
      })
    }
  }

  // Status Badge Helper
  const getStatusBadge = (status: ProcedureStatus) => {
    switch (status) {
      case 'Ativo':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold uppercase tracking-wider">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        )
      case 'Em revisão':
        return (
          <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold uppercase tracking-wider">
            <Clock className="h-3 w-3 mr-1" />
            Em revisão
          </Badge>
        )
      case 'Rascunho':
        return (
          <Badge
            variant="secondary"
            className="text-[10px] font-semibold uppercase tracking-wider bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <FileCode className="h-3 w-3 mr-1" />
            Rascunho
          </Badge>
        )
      case 'Arquivado':
        return (
          <Badge
            variant="outline"
            className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-slate-300"
          >
            <Archive className="h-3 w-3 mr-1" />
            Arquivado
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  // Quick formatting helpers for text content
  const insertFormatting = (tagType: 'h2' | 'bold' | 'list' | 'note') => {
    const textarea = document.getElementById('procedure-content-area') as HTMLTextAreaElement
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = formData.content.substring(start, end)
    let replacement = ''

    switch (tagType) {
      case 'h2':
        replacement = `\n### ${selectedText || 'Título da Seção'}\n`
        break
      case 'bold':
        replacement = `**${selectedText || 'texto em destaque'}**`
        break
      case 'list':
        replacement = `\n- ${selectedText || 'Item 1'}\n- Item 2\n- Item 3\n`
        break
      case 'note':
        replacement = `\n⚠️ OBSERVAÇÃO IMPORTANTE: ${selectedText || 'Atenção a este detalhe de segurança/qualidade.'}\n`
        break
    }

    const newContent =
      formData.content.substring(0, start) + replacement + formData.content.substring(end)
    setFormData((prev) => ({ ...prev, content: newContent }))
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="h-12 w-12 text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Acesso Restrito</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md">
          Você não possui permissão para visualizar o módulo de Procedimentos. Entre em contato com
          o administrador do CRM.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <BookOpen className="h-4 w-4" />
            Base de Conhecimento & POPs
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Procedimentos Operacionais Padrão (POPs)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manuais passo a passo, checklists de qualidade e rotinas organizadas por setor e
            categoria.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Button
              onClick={() => handleOpenEditModal()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              Novo Procedimento
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="sm:col-span-5 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por título, passos, observações..."
            className="pl-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-xs"
          />
        </div>

        <div className="sm:col-span-3">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-xs">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Todas as categorias ({categories.length})
              </SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat} className="text-xs">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Todos os status
              </SelectItem>
              <SelectItem value="Ativo" className="text-xs">
                Ativo
              </SelectItem>
              <SelectItem value="Em revisão" className="text-xs">
                Em revisão
              </SelectItem>
              <SelectItem value="Rascunho" className="text-xs">
                Rascunho
              </SelectItem>
              <SelectItem value="Arquivado" className="text-xs">
                Arquivado
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2 flex items-center justify-end">
          <Button
            type="button"
            variant={showArchived ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className="w-full text-xs h-9 border-slate-200 text-slate-600 dark:text-slate-300"
          >
            <Archive className="h-3.5 w-3.5 mr-1.5" />
            {showArchived ? 'Ocultar Arquivados' : 'Ver Arquivados'}
          </Button>
        </div>
      </div>

      {/* Procedures List / Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mr-3" />
          Carregando base de procedimentos...
        </div>
      ) : filteredProcedures.length === 0 ? (
        <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <BookOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Nenhum procedimento encontrado
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'
              ? 'Tente ajustar os filtros ou o termo de busca para encontrar o POP desejado.'
              : 'Cadastre o primeiro procedimento operacional padrão para padronizar as rotinas da gráfica.'}
          </p>
          {canCreate && (
            <Button
              onClick={() => handleOpenEditModal()}
              variant="outline"
              className="mt-4 gap-2 text-xs"
            >
              <Plus className="h-4 w-4" />
              Cadastrar Procedimento
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProcedures.map((proc) => {
            const stepsCount = Array.isArray(proc.steps) ? proc.steps.length : 0
            const hasAttachments = proc.attachments && proc.attachments.length > 0
            const formattedDate = proc.last_reviewed_at
              ? new Date(proc.last_reviewed_at).toLocaleDateString('pt-BR')
              : proc.updated
                ? new Date(proc.updated).toLocaleDateString('pt-BR')
                : 'Não informada'

            return (
              <Card
                key={proc.id}
                className={`overflow-hidden transition-all duration-200 flex flex-col justify-between hover:shadow-md cursor-pointer group ${
                  proc.status === 'Arquivado'
                    ? 'opacity-65 bg-slate-100/60 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-800'
                    : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/60 shadow-xs'
                }`}
                onClick={() => handleViewProcedure(proc)}
              >
                <div>
                  {/* Card Header Top */}
                  <div className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className="bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 text-[10px] font-semibold border-slate-200 dark:border-slate-700"
                    >
                      <Tag className="h-3 w-3 mr-1 text-emerald-600" />
                      {proc.category}
                    </Badge>
                    <div className="flex items-center gap-1.5">{getStatusBadge(proc.status)}</div>
                  </div>

                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-bold text-slate-900 dark:text-white leading-snug group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                        {proc.title}
                      </CardTitle>
                    </div>

                    {proc.summary && (
                      <CardDescription className="text-xs text-slate-500 line-clamp-2 mt-1.5">
                        {proc.summary}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="p-4 pt-1 space-y-3 text-xs">
                    {/* Meta info tags */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500">
                      <div>
                        <span className="block text-slate-400 text-[10px]">Versão:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                          v{proc.version || '1.0'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-slate-400 text-[10px]">Última Revisão:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {formattedDate}
                        </span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-slate-200/50 dark:border-slate-800">
                        <span className="block text-slate-400 text-[10px]">Responsável:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">
                          {proc.reviewer_name || proc.expand?.reviewer_id?.name || 'Equipe Gráfica'}
                        </span>
                      </div>
                    </div>

                    {/* Step & Attachment counts */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <div className="flex items-center gap-1">
                        <ListOrdered className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{stepsCount} passo(s) estruturado(s)</span>
                      </div>
                      {hasAttachments && (
                        <div className="flex items-center gap-1 text-slate-500 font-medium">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                          <span>{proc.attachments?.length} anexo(s)</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </div>

                {/* Card Actions Footer */}
                <div
                  className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 flex items-center justify-between gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewProcedure(proc)}
                    className="h-8 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 gap-1 flex-1 justify-center"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Visualizar POP
                  </Button>

                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditModal(proc)}
                      className="h-8 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 px-2.5"
                      title="Editar Procedimento"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {canArchive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleArchive(proc)}
                      className={`h-8 text-xs px-2.5 ${
                        proc.status === 'Arquivado'
                          ? 'text-emerald-600 hover:bg-emerald-50'
                          : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                      title={proc.status === 'Arquivado' ? 'Reativar POP' : 'Arquivar POP'}
                    >
                      {proc.status === 'Arquivado' ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* =========================================================================
       * MODAL: VISUALIZAÇÃO DETALHADA E LIMPA DO PROCEDIMENTO (Requirement 7)
       * ========================================================================= */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          {activeProcedure && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* Header Hero */}
              <div className="p-6 bg-slate-900 text-white relative">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <Badge className="bg-emerald-600 text-white text-[10px] uppercase font-bold tracking-wider">
                    {activeProcedure.category}
                  </Badge>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(activeProcedure.status)}
                    <Badge
                      variant="outline"
                      className="text-white border-white/20 font-mono text-[10px]"
                    >
                      Versão {activeProcedure.version || '1.0'}
                    </Badge>
                  </div>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold leading-tight mt-2">
                  {activeProcedure.title}
                </h2>

                {activeProcedure.summary && (
                  <p className="text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
                    {activeProcedure.summary}
                  </p>
                )}

                {/* Metadata row */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-4 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5 text-emerald-400" />
                    <span>
                      Revisado por:{' '}
                      <strong className="text-white">
                        {activeProcedure.reviewer_name ||
                          activeProcedure.expand?.reviewer_id?.name ||
                          'Administração'}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                    <span>
                      Data de Revisão:{' '}
                      <strong className="text-white">
                        {activeProcedure.last_reviewed_at
                          ? new Date(activeProcedure.last_reviewed_at).toLocaleDateString('pt-BR')
                          : 'Não informada'}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Content Body */}
              <div className="p-6 space-y-6">
                {/* Passo a Passo Estruturado */}
                {Array.isArray(activeProcedure.steps) && activeProcedure.steps.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                      <ListOrdered className="h-4 w-4 text-emerald-600" />
                      Passo a Passo de Execução ({activeProcedure.steps.length})
                    </h3>

                    <div className="space-y-2.5">
                      {activeProcedure.steps.map((step, idx) => (
                        <div
                          key={step.id || idx}
                          className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                        >
                          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-600 text-white font-bold text-[11px] shrink-0 mt-0.5 shadow-xs">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                              {step.title}
                            </h4>
                            {step.description && (
                              <p className="text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                                {step.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conteúdo / Detalhamento Técnico */}
                {activeProcedure.content && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      Instruções Detalhadas & Diretrizes
                    </h3>
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                      {activeProcedure.content}
                    </div>
                  </div>
                )}

                {/* Observações e Cuidados Críticos */}
                {activeProcedure.notes && (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs sm:text-sm text-amber-900 dark:text-amber-200 space-y-1.5">
                    <div className="font-bold flex items-center gap-2 text-amber-800 dark:text-amber-300 uppercase tracking-wider text-xs">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Observações Importantes & Pontos de Atenção
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{activeProcedure.notes}</p>
                  </div>
                )}

                {/* Anexos e Arquivos de Referência */}
                {activeProcedure.attachments && activeProcedure.attachments.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-emerald-600" />
                      Arquivos e Documentos de Referência ({activeProcedure.attachments.length})
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeProcedure.attachments.map((fileName, idx) => {
                        const fileUrl = proceduresService.getFileUrl(activeProcedure, fileName)
                        const isImage = /\.(jpg|jpeg|png|webp|svg)$/i.test(fileName)
                        const isPdf = /\.pdf$/i.test(fileName)

                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                              {isImage ? (
                                <FileImage className="h-4 w-4 text-blue-500 shrink-0" />
                              ) : isPdf ? (
                                <FileText className="h-4 w-4 text-rose-500 shrink-0" />
                              ) : (
                                <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />
                              )}
                              <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                                {fileName}
                              </span>
                            </div>

                            {fileUrl && (
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline shrink-0"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Abrir
                              </a>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setViewModalOpen(false)}>
                  Fechar
                </Button>

                <div className="flex items-center gap-2">
                  {canArchive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleArchive(activeProcedure)}
                      className="text-xs"
                    >
                      <Archive className="h-3.5 w-3.5 mr-1.5" />
                      {activeProcedure.status === 'Arquivado' ? 'Reativar POP' : 'Arquivar POP'}
                    </Button>
                  )}

                  {canEdit && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setViewModalOpen(false)
                        handleOpenEditModal(activeProcedure)
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                      Editar POP
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =========================================================================
       * MODAL: CADASTRO / EDIÇÃO DE PROCEDIMENTO (Requirement 3, 4, 8)
       * ========================================================================= */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              {editingProcedure
                ? 'Editar Procedimento Operacional'
                : 'Novo Procedimento Operacional'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre o título, setor/categoria, passos sequenciais, notas importantes e anexos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProcedure} className="space-y-4 pt-2">
            {/* Row 1: Title & Version */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-9 space-y-1">
                <Label className="text-xs font-semibold">Título do Procedimento *</Label>
                <Input
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Padrão de Fechamento de Arquivos para Impressão UV"
                  className="text-xs"
                />
              </div>

              <div className="sm:col-span-3 space-y-1">
                <Label className="text-xs font-semibold">Versão *</Label>
                <Input
                  required
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="1.0"
                  className="text-xs font-mono"
                />
              </div>
            </div>

            {/* Row 2: Category, Status & Reviewer */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Categoria / Setor *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs">
                        {cat}
                      </SelectItem>
                    ))}
                    <SelectItem value="Outros" className="text-xs">
                      + Outra categoria personalizada
                    </SelectItem>
                  </SelectContent>
                </Select>

                {formData.category === 'Outros' && (
                  <Input
                    placeholder="Digite o nome do novo setor/categoria"
                    value={formData.customCategory}
                    onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                    className="text-xs mt-1.5"
                    required
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Status do Procedimento *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val: any) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo" className="text-xs">
                      Ativo
                    </SelectItem>
                    <SelectItem value="Em revisão" className="text-xs">
                      Em revisão
                    </SelectItem>
                    <SelectItem value="Rascunho" className="text-xs">
                      Rascunho
                    </SelectItem>
                    <SelectItem value="Arquivado" className="text-xs">
                      Arquivado
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Responsável pela Revisão</Label>
                <Input
                  value={formData.reviewer_name}
                  onChange={(e) => setFormData({ ...formData, reviewer_name: e.target.value })}
                  placeholder="Ex: Carlos - Gerente de Produção"
                  className="text-xs"
                />
              </div>
            </div>

            {/* Row 3: Summary / Objective */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Descrição / Resumo do Procedimento</Label>
              <Input
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                placeholder="Breve resumo do objetivo deste POP e quando ele deve ser aplicado..."
                className="text-xs"
              />
            </div>

            {/* Row 4: Interactive Step-by-Step Builder (Requirement 4) */}
            <div className="space-y-2 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ListOrdered className="h-4 w-4 text-emerald-600" />
                  Passo a Passo Estruturado ({formData.steps.length})
                </Label>
                <span className="text-[11px] text-slate-500">
                  Adicione etapas sequenciais de execução clara.
                </span>
              </div>

              {/* Current steps list */}
              {formData.steps.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {formData.steps.map((st, idx) => (
                    <div
                      key={st.id || idx}
                      className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <strong className="block text-slate-900 dark:text-white">
                            {st.title}
                          </strong>
                          {st.description && (
                            <p className="text-slate-500 text-[11px] truncate">{st.description}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveStep(idx)}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Step adder form */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5">
                    <Input
                      value={stepTitle}
                      onChange={(e) => setStepTitle(e.target.value)}
                      placeholder="Título do passo (ex: Checar resolução em 300 DPI)"
                      className="text-xs bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <Input
                      value={stepDesc}
                      onChange={(e) => setStepDesc(e.target.value)}
                      placeholder="Detalhes ou instrução de como executar (opcional)"
                      className="text-xs bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddStep}
                      className="w-full text-xs h-9 bg-white dark:bg-slate-950 font-semibold text-emerald-700 dark:text-emerald-400 border-emerald-200"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 5: Detailed Content & Formatting Toolbar (Requirement 4) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Conteúdo / Instruções Gerais Detalhadas
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertFormatting('h2')}
                    className="h-6 text-[10px] px-2 py-0"
                    title="Inserir Subtítulo"
                  >
                    Título (###)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertFormatting('bold')}
                    className="h-6 text-[10px] px-2 py-0"
                    title="Inserir Destaque em Negrito"
                  >
                    Negrito (**)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertFormatting('list')}
                    className="h-6 text-[10px] px-2 py-0"
                    title="Inserir Lista com marcadores"
                  >
                    Lista (-)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertFormatting('note')}
                    className="h-6 text-[10px] px-2 py-0 text-amber-700 border-amber-300"
                    title="Inserir Aviso/Destaque"
                  >
                    Aviso (⚠️)
                  </Button>
                </div>
              </div>

              <Textarea
                id="procedure-content-area"
                rows={5}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Insira detalhes técnicos, diretrizes, parâmetros de máquina ou referências de atendimento..."
                className="text-xs font-sans leading-relaxed"
              />
            </div>

            {/* Row 6: Observations & Warnings */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Observações Críticas & Cuidados de Qualidade
              </Label>
              <Textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Ex: Nunca utilizar solvente puro na cabeça; sempre conferir medidas finais antes de cortar na guilhotina."
                className="text-xs bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
              />
            </div>

            {/* Row 7: Attachments Upload (Requirement 5) */}
            <div className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-emerald-600" />
                Anexar Arquivos, Imagens ou PDFs de Referência
              </Label>

              <Input
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  if (e.target.files) {
                    setNewFiles(Array.from(e.target.files))
                  }
                }}
                className="text-xs bg-white dark:bg-slate-950 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700"
              />

              {existingAttachments.length > 0 && (
                <div className="pt-2 text-[11px] text-slate-500">
                  <span className="font-semibold block mb-1">Anexos já salvos:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {existingAttachments.map((f, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800"
                      >
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {saving ? 'Gravando...' : 'Salvar Procedimento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
