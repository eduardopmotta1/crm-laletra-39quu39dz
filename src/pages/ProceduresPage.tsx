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
  FolderTree,
  Repeat,
  Users,
  CheckSquare,
  PlayCircle,
  History,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import pb from '@/lib/pocketbase/client'
import {
  proceduresService,
  FREQUENCY_LABELS,
  type Procedure,
  type ProcedureStatus,
  type ProcedureStep,
  type ProcedureCategoryRecord,
  type ProcedureExecution,
  type RecurrenceFrequency,
  type AssigneeType,
} from '@/services/procedures'
import type { User, Role } from '@/types/crm'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import ManageCategoriesModal from '@/components/ManageCategoriesModal'
import ExecuteRoutineModal from '@/components/ExecuteRoutineModal'

export default function ProceduresPage() {
  const { user, isAdmin, hasPermission } = useAuth()

  // Permissions check
  const canView = isAdmin || hasPermission('procedures_view')
  const canCreate = isAdmin || hasPermission('procedures_create')
  const canEdit = isAdmin || hasPermission('procedures_edit')
  const canArchive = isAdmin || hasPermission('procedures_archive')

  // Top Tabs
  const [activeMainTab, setActiveMainTab] = useState<'routines' | 'procedures' | 'history'>(
    'routines',
  )

  // State
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [categories, setCategories] = useState<ProcedureCategoryRecord[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [rolesList, setRolesList] = useState<Role[]>([])
  const [routines, setRoutines] = useState<ProcedureExecution[]>([])
  const [historyExecutions, setHistoryExecutions] = useState<ProcedureExecution[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [routinesDateFilter, setRoutinesDateFilter] = useState(
    new Date().toISOString().split('T')[0],
  )

  // Modals
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)
  const [executeModalOpen, setExecuteModalOpen] = useState(false)
  const [selectedExecution, setSelectedExecution] = useState<ProcedureExecution | null>(null)

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
    category_id: string
    summary: string
    content: string
    notes: string
    version: string
    status: ProcedureStatus
    reviewer_name: string
    last_reviewed_at: string
    steps: ProcedureStep[]
    // Recurrence
    is_recurring: boolean
    recurrence_frequency: RecurrenceFrequency
    recurrence_time: string
    tolerance_minutes: number
    assignee_type: AssigneeType
    assigned_user_ids: string[]
    assigned_role_slug: string
    recurrence_days_of_week: number[]
    recurrence_interval_days: number
  }>({
    title: '',
    category_id: '',
    summary: '',
    content: '',
    notes: '',
    version: '1.0',
    status: 'Ativo',
    reviewer_name: '',
    last_reviewed_at: new Date().toISOString().split('T')[0],
    steps: [],
    is_recurring: false,
    recurrence_frequency: 'daily',
    recurrence_time: '08:00',
    tolerance_minutes: 60,
    assignee_type: 'role',
    assigned_user_ids: [],
    assigned_role_slug: 'producao',
    recurrence_days_of_week: [1, 2, 3, 4, 5],
    recurrence_interval_days: 1,
  })

  // Attachments State
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [existingAttachments, setExistingAttachments] = useState<string[]>([])

  // Step builder input
  const [stepTitle, setStepTitle] = useState('')
  const [stepDesc, setStepDesc] = useState('')

  useEffect(() => {
    loadAllData()
  }, [selectedCategoryId, selectedStatus, showArchived, routinesDateFilter, activeMainTab])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const [cats, uList, rList] = await Promise.all([
        proceduresService.getCategoriesList(true),
        pb.collection('users').getFullList<User>({ requestKey: null }),
        pb.collection('roles').getFullList<Role>({ requestKey: null }),
      ])

      setCategories(cats)
      setUsersList(uList)
      setRolesList(rList)

      if (activeMainTab === 'procedures') {
        const list = await proceduresService.getAll({
          category_id: selectedCategoryId !== 'all' ? selectedCategoryId : undefined,
          status: selectedStatus !== 'all' ? (selectedStatus as ProcedureStatus) : undefined,
          includeArchived: showArchived || selectedStatus === 'Arquivado',
        })
        setProcedures(list)
      } else if (activeMainTab === 'routines') {
        const myRoutines = await proceduresService.getMyRoutines(user, routinesDateFilter)
        setRoutines(myRoutines)
      } else if (activeMainTab === 'history') {
        const hist = await proceduresService.getExecutionHistory(50)
        setHistoryExecutions(hist)
      }
    } catch (err) {
      console.error('Error loading procedures data:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível sincronizar o módulo de procedimentos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Filtered Procedures by Search Query
  const filteredProcedures = useMemo(() => {
    if (!searchQuery.trim()) return procedures
    const q = searchQuery.toLowerCase().trim()
    return procedures.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.expand?.category_id?.name && p.expand.category_id.name.toLowerCase().includes(q)) ||
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
      const matchingCat = categories.find(
        (c) => c.id === proc.category_id || c.name === proc.category,
      )
      const catId = matchingCat ? matchingCat.id : categories[0]?.id || ''

      setFormData({
        title: proc.title || '',
        category_id: catId,
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
        is_recurring: proc.is_recurring ?? false,
        recurrence_frequency: proc.recurrence_frequency || 'daily',
        recurrence_time: proc.recurrence_time || '08:00',
        tolerance_minutes: proc.tolerance_minutes ?? 60,
        assignee_type: proc.assignee_type || (proc.assigned_role_slug ? 'role' : 'all'),
        assigned_user_ids: Array.isArray(proc.assigned_user_ids) ? proc.assigned_user_ids : [],
        assigned_role_slug: proc.assigned_role_slug || 'producao',
        recurrence_days_of_week: Array.isArray(proc.recurrence_days_of_week)
          ? proc.recurrence_days_of_week
          : [1, 2, 3, 4, 5],
        recurrence_interval_days: proc.recurrence_interval_days || 1,
      })
      setExistingAttachments(proc.attachments || [])
    } else {
      setEditingProcedure(null)
      setFormData({
        title: '',
        category_id: categories[0]?.id || '',
        summary: '',
        content: '',
        notes: '',
        version: '1.0',
        status: 'Ativo',
        reviewer_name: user?.name || '',
        last_reviewed_at: new Date().toISOString().split('T')[0],
        steps: [],
        is_recurring: false,
        recurrence_frequency: 'daily',
        recurrence_time: '08:00',
        tolerance_minutes: 60,
        assignee_type: 'role',
        assigned_user_ids: [],
        assigned_role_slug: 'producao',
        recurrence_days_of_week: [1, 2, 3, 4, 5],
        recurrence_interval_days: 1,
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

    const selectedCatObj = categories.find((c) => c.id === formData.category_id)
    const finalCategoryName = selectedCatObj ? selectedCatObj.name : 'Geral'

    setSaving(true)
    try {
      const payloadFormData = new FormData()
      payloadFormData.append('title', formData.title.trim())
      payloadFormData.append('category_id', formData.category_id)
      payloadFormData.append('category', finalCategoryName)
      payloadFormData.append('summary', formData.summary.trim())
      payloadFormData.append('content', formData.content.trim())
      payloadFormData.append('notes', formData.notes.trim())
      payloadFormData.append('version', formData.version.trim() || '1.0')
      payloadFormData.append('status', formData.status)
      payloadFormData.append('reviewer_name', formData.reviewer_name.trim())
      payloadFormData.append('last_reviewed_at', formData.last_reviewed_at)

      // Recurrence
      payloadFormData.append('is_recurring', String(formData.is_recurring))
      if (formData.is_recurring) {
        payloadFormData.append('recurrence_frequency', formData.recurrence_frequency)
        payloadFormData.append('recurrence_time', formData.recurrence_time)
        payloadFormData.append('tolerance_minutes', String(formData.tolerance_minutes))
        payloadFormData.append('assignee_type', formData.assignee_type)
        payloadFormData.append('assigned_role_slug', formData.assigned_role_slug)
        payloadFormData.append('assigned_user_ids', JSON.stringify(formData.assigned_user_ids))
        payloadFormData.append(
          'recurrence_days_of_week',
          JSON.stringify(formData.recurrence_days_of_week),
        )
        payloadFormData.append(
          'recurrence_interval_days',
          String(formData.recurrence_interval_days),
        )
      }

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
      loadAllData()
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
      loadAllData()
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

  const handleOpenExecuteModal = (routine: ProcedureExecution) => {
    setSelectedExecution(routine)
    setExecuteModalOpen(true)
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

  const todayStr = new Date().toISOString().split('T')[0]
  const pendingRoutinesCount = routines.filter(
    (r) => r.status === 'Pendente' || r.status === 'Atrasado',
  ).length
  const delayedRoutinesCount = routines.filter((r) => r.status === 'Atrasado').length

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <BookOpen className="h-4 w-4" />
            Base de Conhecimento, POPs & Rotinas Periódicas
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Procedimentos Operacionais Padrão (POPs)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manuais passo a passo, checklists de qualidade e rotinas periódicas com controle de
            ocorrências diárias.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setManageCategoriesOpen(true)}
              className="gap-2 text-xs h-9 border-slate-300 dark:border-slate-700 font-semibold"
            >
              <FolderTree className="h-4 w-4 text-emerald-600" />
              Gerenciar Categorias
            </Button>
          )}

          {canCreate && (
            <Button
              onClick={() => handleOpenEditModal()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm font-semibold text-xs h-9"
            >
              <Plus className="h-4 w-4" />
              Novo POP
            </Button>
          )}
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 flex-wrap gap-2">
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveMainTab('routines')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeMainTab === 'routines'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="h-4 w-4 text-emerald-600" />
            Minhas Rotinas
            {pendingRoutinesCount > 0 && (
              <Badge
                variant={delayedRoutinesCount > 0 ? 'destructive' : 'secondary'}
                className="text-[10px] px-1.5 py-0 font-black ml-1"
              >
                {pendingRoutinesCount}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setActiveMainTab('procedures')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeMainTab === 'procedures'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <BookOpen className="h-4 w-4 text-blue-600" />
            Todos os Procedimentos (POPs)
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveMainTab('history')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeMainTab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <History className="h-4 w-4 text-purple-600" />
              Histórico Geral de Execuções
            </button>
          )}
        </div>

        {activeMainTab === 'routines' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-semibold hidden sm:inline">Data da Agenda:</span>
            <Input
              type="date"
              value={routinesDateFilter}
              onChange={(e) => setRoutinesDateFilter(e.target.value)}
              className="text-xs h-8 w-36 bg-white dark:bg-slate-900"
            />
            {routinesDateFilter !== todayStr && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRoutinesDateFilter(todayStr)}
                className="h-8 text-[11px] text-emerald-600 font-semibold"
              >
                Hoje
              </Button>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
       * TAB 1: MINHAS ROTINAS (Requirement 4, 5, 6, 7, 9, 10)
       * ========================================================================= */}
      {activeMainTab === 'routines' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-emerald-600" />
                Rotinas Operacionais Programadas —{' '}
                {new Date(routinesDateFilter + 'T12:00:00').toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                })}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ocorrências diárias e periódicas designadas para você ou seu setor. Abra o
                procedimento, confira o passo a passo e registre a conclusão.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="bg-white dark:bg-slate-900 text-xs px-2.5 py-1">
                Total: <strong>{routines.length}</strong>
              </Badge>
              {delayedRoutinesCount > 0 && (
                <Badge
                  variant="destructive"
                  className="text-xs px-2.5 py-1 animate-pulse font-bold"
                >
                  {delayedRoutinesCount} ATRASADA(S)
                </Badge>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mr-3" />
              Carregando rotinas programadas...
            </div>
          ) : routines.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                Nenhuma rotina pendente para este dia
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Não há procedimentos periódicos agendados para sua equipe nesta data. Você pode
                cadastrar novas rotinas periódicas na aba "Todos os Procedimentos".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {routines.map((routine) => {
                const proc = routine.expand?.procedure_id
                if (!proc) return null

                const isCompleted = routine.status === 'Concluído'
                const isDelayed = routine.status === 'Atrasado'
                const stepsCount = Array.isArray(proc.steps) ? proc.steps.length : 0
                const checkedStepsCount = Array.isArray(routine.checked_step_ids)
                  ? routine.checked_step_ids.length
                  : 0

                return (
                  <Card
                    key={routine.id}
                    className={`overflow-hidden transition-all flex flex-col justify-between ${
                      isCompleted
                        ? 'border-emerald-200 bg-emerald-50/20 dark:bg-emerald-950/10'
                        : isDelayed
                          ? 'border-rose-400 bg-rose-50/10 ring-2 ring-rose-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300'
                    } shadow-xs`}
                  >
                    <div>
                      {/* Header */}
                      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className="bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 text-[10px] font-semibold"
                        >
                          <Tag className="h-3 w-3 mr-1 text-emerald-600" />
                          {proc.category || proc.expand?.category_id?.name || 'Geral'}
                        </Badge>

                        <div className="flex items-center gap-1.5">
                          <Badge
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isCompleted
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : isDelayed
                                  ? 'bg-rose-600 text-white hover:bg-rose-700 animate-pulse'
                                  : 'bg-amber-500 text-white hover:bg-amber-600'
                            }`}
                          >
                            {isCompleted && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {isDelayed && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {!isCompleted && !isDelayed && <Clock className="h-3 w-3 mr-1" />}
                            {routine.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Body */}
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                          {proc.title}
                        </CardTitle>
                        {proc.summary && (
                          <CardDescription className="text-xs text-slate-500 line-clamp-2 mt-1">
                            {proc.summary}
                          </CardDescription>
                        )}
                      </CardHeader>

                      <CardContent className="p-4 pt-1 space-y-2.5 text-xs">
                        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500">
                          <div>
                            <span className="block text-slate-400 text-[10px]">
                              Horário Programado:
                            </span>
                            <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
                              {routine.scheduled_at || '08:00'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-slate-400 text-[10px]">Tolerância:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {routine.tolerance_minutes ?? 60} min
                            </span>
                          </div>
                          <div className="col-span-2 pt-1 border-t border-slate-200/50 dark:border-slate-800">
                            <span className="block text-slate-400 text-[10px]">Responsável:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate block">
                              {routine.expand?.assigned_to_user_id?.name ||
                                (routine.assigned_role_slug === 'producao'
                                  ? 'Equipe de Produção'
                                  : routine.assigned_role_slug === 'comercial'
                                    ? 'Equipe Comercial'
                                    : routine.assigned_role_slug === 'admin'
                                      ? 'Administração'
                                      : 'Todos os Colaboradores')}
                            </span>
                          </div>
                        </div>

                        {stepsCount > 0 && (
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                            <span className="flex items-center gap-1 font-medium">
                              <ListOrdered className="h-3.5 w-3.5 text-emerald-600" />
                              {stepsCount} passo(s) estruturado(s)
                            </span>
                            {isCompleted ? (
                              <span className="text-emerald-600 font-bold">100% concluído</span>
                            ) : (
                              <span>
                                {checkedStepsCount}/{stepsCount} marcados
                              </span>
                            )}
                          </div>
                        )}

                        {isCompleted && (
                          <div className="p-2 rounded-lg bg-emerald-100/60 dark:bg-emerald-950/40 text-[11px] text-emerald-800 dark:text-emerald-300">
                            <strong>Concluído por:</strong>{' '}
                            {routine.completed_by_name || 'Colaborador'} às{' '}
                            {routine.completed_at
                              ? new Date(routine.completed_at).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                            {routine.notes && (
                              <p className="italic mt-1 text-slate-600 dark:text-slate-400">
                                "{routine.notes}"
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleOpenExecuteModal(routine)}
                        className={`w-full text-xs font-bold gap-1.5 shadow-sm ${
                          isCompleted
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            Ver Execução Realizada
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-3.5 w-3.5" />
                            Executar & Concluir POP
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
       * TAB 2: TODOS OS PROCEDIMENTOS (POPs)
       * ========================================================================= */}
      {activeMainTab === 'procedures' && (
        <div className="space-y-4">
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
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-xs">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    Todas as categorias ({categories.length})
                  </SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="text-xs">
                      {cat.name} {!cat.is_active ? '(Inativa)' : ''}
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
                {searchQuery || selectedCategoryId !== 'all' || selectedStatus !== 'all'
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

                const isRecurring = proc.is_recurring

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
                          {proc.expand?.category_id?.name || proc.category || 'Geral'}
                        </Badge>
                        <div className="flex items-center gap-1.5">
                          {isRecurring && (
                            <Badge className="bg-blue-600 text-white text-[9px] uppercase font-bold tracking-wider">
                              <Repeat className="h-2.5 w-2.5 mr-1" />
                              Recorrente
                            </Badge>
                          )}
                          {getStatusBadge(proc.status)}
                        </div>
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
                            <span className="block text-slate-400 text-[10px]">
                              Última Revisão:
                            </span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {formattedDate}
                            </span>
                          </div>
                          {isRecurring && (
                            <div className="col-span-2 pt-1 border-t border-slate-200/50 dark:border-slate-800">
                              <span className="block text-slate-400 text-[10px]">
                                Frequência & Horário:
                              </span>
                              <span className="font-semibold text-blue-700 dark:text-blue-400 truncate block">
                                {FREQUENCY_LABELS[proc.recurrence_frequency || 'daily']} às{' '}
                                {proc.recurrence_time || '08:00'} (Tol.{' '}
                                {proc.tolerance_minutes ?? 60}m)
                              </span>
                            </div>
                          )}
                          <div className="col-span-2 pt-1 border-t border-slate-200/50 dark:border-slate-800">
                            <span className="block text-slate-400 text-[10px]">Responsável:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">
                              {proc.reviewer_name ||
                                proc.expand?.reviewer_id?.name ||
                                'Equipe Gráfica'}
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
        </div>
      )}

      {/* =========================================================================
       * TAB 3: HISTÓRICO GERAL DE EXECUÇÕES (Requirement 6, 11)
       * ========================================================================= */}
      {activeMainTab === 'history' && isAdmin && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="h-5 w-5 text-purple-600" />
                Histórico Geral de Execuções e Auditoria de POPs
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Registro de cada ocorrência executada pela equipe com data, horário, responsável e
                observações gravadas.
              </p>
            </div>
          </div>

          {historyExecutions.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-xl border">
              Nenhuma execução registrada no histórico ainda.
            </div>
          ) : (
            <div className="space-y-2.5">
              {historyExecutions.map((exec) => {
                const proc = exec.expand?.procedure_id
                const isCompleted = exec.status === 'Concluído'

                return (
                  <div
                    key={exec.id}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {proc?.title || 'Procedimento'}
                        </span>
                        <Badge
                          variant={isCompleted ? 'secondary' : 'destructive'}
                          className={`text-[10px] px-1.5 py-0 font-bold ${
                            isCompleted ? 'bg-emerald-100 text-emerald-800' : ''
                          }`}
                        >
                          {exec.status}
                        </Badge>
                        <span className="text-slate-400 font-mono text-[11px]">
                          Previsto: {exec.scheduled_at || '08:00'} (Data:{' '}
                          {new Date(exec.occurrence_date).toLocaleDateString('pt-BR')})
                        </span>
                      </div>

                      {exec.notes && (
                        <p className="text-slate-600 dark:text-slate-400 italic">"{exec.notes}"</p>
                      )}
                    </div>

                    <div className="text-right shrink-0 text-[11px] text-slate-400">
                      <span className="block font-semibold text-slate-700 dark:text-slate-300">
                        {exec.completed_by_name
                          ? `Executado por: ${exec.completed_by_name}`
                          : 'Aguardando conclusão'}
                      </span>
                      <span>
                        {exec.completed_at
                          ? new Date(exec.completed_at).toLocaleString('pt-BR')
                          : 'Pendente'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
       * MODAL: VISUALIZAÇÃO DETALHADA DO PROCEDIMENTO
       * ========================================================================= */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          {activeProcedure && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* Header Hero */}
              <div className="p-6 bg-slate-900 text-white relative">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <Badge className="bg-emerald-600 text-white text-[10px] uppercase font-bold tracking-wider">
                    {activeProcedure.expand?.category_id?.name ||
                      activeProcedure.category ||
                      'Geral'}
                  </Badge>
                  <div className="flex items-center gap-2">
                    {activeProcedure.is_recurring && (
                      <Badge className="bg-blue-600 text-white text-[10px] uppercase font-bold">
                        <Repeat className="h-3 w-3 mr-1" />
                        Recorrente
                      </Badge>
                    )}
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

                {/* Recurrence summary info */}
                {activeProcedure.is_recurring && (
                  <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs space-y-2">
                    <h4 className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2 uppercase">
                      <Repeat className="h-4 w-4 text-blue-600" />
                      Configuração de Recorrência
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                      <div>
                        <strong>Frequência:</strong>{' '}
                        {FREQUENCY_LABELS[activeProcedure.recurrence_frequency || 'daily']}
                      </div>
                      <div>
                        <strong>Horário Previsto:</strong>{' '}
                        {activeProcedure.recurrence_time || '08:00'} (Tolerância:{' '}
                        {activeProcedure.tolerance_minutes ?? 60}m)
                      </div>
                      <div>
                        <strong>Responsável:</strong>{' '}
                        {activeProcedure.assigned_role_slug
                          ? `Setor: ${activeProcedure.assigned_role_slug}`
                          : 'Colaborador(es) Específico(s)'}
                      </div>
                    </div>
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
       * MODAL: CADASTRO / EDIÇÃO DE PROCEDIMENTO (COM RECORRÊNCIA CONFIGURÁVEL)
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
              Cadastre o título, categoria por ID interno, passos sequenciais, notas importantes e
              periodicidade de execução.
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
                  placeholder="Ex: Manutenção diária da máquina de impressão"
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Categoria / Setor *</Label>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setManageCategoriesOpen(true)}
                      className="text-[10px] text-emerald-600 hover:underline font-semibold"
                    >
                      + Gerenciar
                    </button>
                  )}
                </div>
                <Select
                  value={formData.category_id}
                  onValueChange={(val) => setFormData({ ...formData, category_id: val })}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c) => !c.is_archived || c.id === formData.category_id)
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.id} className="text-xs">
                          {cat.name} {!cat.is_active ? '(Inativa)' : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
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

            {/* Row 3.5: Periodic / Recurrence Configuration (Requirement 2, 7, 11, 13, 14) */}
            <div className="space-y-3 p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-blue-600" />
                  <div>
                    <Label className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer">
                      Executar periodicamente (Rotina Recorrente)
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      Gera ocorrências diárias independentes para os responsáveis concluírem em
                      "Minhas Rotinas".
                    </p>
                  </div>
                </div>

                <Switch
                  checked={formData.is_recurring}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_recurring: checked }))
                  }
                />
              </div>

              {formData.is_recurring && (
                <div className="space-y-3 pt-3 border-t border-blue-200/60 dark:border-blue-900/40">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Frequência */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Frequência *</Label>
                      <Select
                        value={formData.recurrence_frequency}
                        onValueChange={(val: RecurrenceFrequency) =>
                          setFormData((prev) => ({ ...prev, recurrence_frequency: val }))
                        }
                      >
                        <SelectTrigger className="text-xs bg-white dark:bg-slate-900">
                          <SelectValue placeholder="Frequência" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily" className="text-xs">
                            Todos os dias
                          </SelectItem>
                          <SelectItem value="weekdays" className="text-xs">
                            Dias específicos da semana (Seg a Sex)
                          </SelectItem>
                          <SelectItem value="weekly" className="text-xs">
                            Semanal (1x por semana)
                          </SelectItem>
                          <SelectItem value="monthly" className="text-xs">
                            Mensal
                          </SelectItem>
                          <SelectItem value="custom_interval" className="text-xs">
                            Intervalo personalizado (dias)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Horário */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Horário Previsto *</Label>
                      <Input
                        type="time"
                        value={formData.recurrence_time}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, recurrence_time: e.target.value }))
                        }
                        className="text-xs bg-white dark:bg-slate-900"
                        required
                      />
                    </div>

                    {/* Tolerância de Atraso */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">
                        Tolerância para Atraso (minutos) *
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={1440}
                        value={formData.tolerance_minutes}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            tolerance_minutes: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        placeholder="60"
                        className="text-xs bg-white dark:bg-slate-900"
                      />
                      <span className="text-[10px] text-slate-500">
                        Ex: 08:00 + 60min → atrasa às 09:00
                      </span>
                    </div>
                  </div>

                  {/* Intervalo personalizado em dias */}
                  {formData.recurrence_frequency === 'custom_interval' && (
                    <div className="space-y-1 max-w-xs">
                      <Label className="text-xs font-semibold">A cada quantos dias?</Label>
                      <Input
                        type="number"
                        min={1}
                        value={formData.recurrence_interval_days}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            recurrence_interval_days: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="text-xs bg-white dark:bg-slate-900"
                      />
                    </div>
                  )}

                  {/* Responsável */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Tipo de Atribuição *</Label>
                      <Select
                        value={formData.assignee_type}
                        onValueChange={(val: AssigneeType) =>
                          setFormData((prev) => ({ ...prev, assignee_type: val }))
                        }
                      >
                        <SelectTrigger className="text-xs bg-white dark:bg-slate-900">
                          <SelectValue placeholder="Tipo de responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="role" className="text-xs">
                            Setor / Perfil (Produção, Comercial, etc)
                          </SelectItem>
                          <SelectItem value="user" className="text-xs">
                            Colaborador específico
                          </SelectItem>
                          <SelectItem value="multiple_users" className="text-xs">
                            Vários colaboradores
                          </SelectItem>
                          <SelectItem value="all" className="text-xs">
                            Toda a equipe da gráfica
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Setor */}
                    {formData.assignee_type === 'role' && (
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Setor Responsável *</Label>
                        <Select
                          value={formData.assigned_role_slug}
                          onValueChange={(val) =>
                            setFormData((prev) => ({ ...prev, assigned_role_slug: val }))
                          }
                        >
                          <SelectTrigger className="text-xs bg-white dark:bg-slate-900">
                            <SelectValue placeholder="Selecione o setor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="producao" className="text-xs">
                              Produção / Impressão / Acabamento
                            </SelectItem>
                            <SelectItem value="comercial" className="text-xs">
                              Atendimento / Comercial
                            </SelectItem>
                            <SelectItem value="admin" className="text-xs">
                              Administração
                            </SelectItem>
                            {rolesList
                              .filter((r) => !['producao', 'comercial', 'admin'].includes(r.slug))
                              .map((r) => (
                                <SelectItem key={r.id} value={r.slug} className="text-xs">
                                  {r.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Colaborador único */}
                    {formData.assignee_type === 'user' && (
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Colaborador *</Label>
                        <Select
                          value={formData.assigned_user_ids[0] || ''}
                          onValueChange={(val) =>
                            setFormData((prev) => ({ ...prev, assigned_user_ids: [val] }))
                          }
                        >
                          <SelectTrigger className="text-xs bg-white dark:bg-slate-900">
                            <SelectValue placeholder="Selecione o colaborador" />
                          </SelectTrigger>
                          <SelectContent>
                            {usersList.map((u) => (
                              <SelectItem key={u.id} value={u.id} className="text-xs">
                                {u.name || u.email} ({u.role_slug || 'Geral'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Múltiplos colaboradores */}
                    {formData.assignee_type === 'multiple_users' && (
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs font-semibold">Colaboradores Selecionados</Label>
                        <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border">
                          {usersList.map((u) => {
                            const isSelected = formData.assigned_user_ids.includes(u.id)
                            return (
                              <Badge
                                key={u.id}
                                variant={isSelected ? 'default' : 'outline'}
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    assigned_user_ids: isSelected
                                      ? prev.assigned_user_ids.filter((id) => id !== u.id)
                                      : [...prev.assigned_user_ids, u.id],
                                  }))
                                }}
                                className={`cursor-pointer text-xs ${
                                  isSelected ? 'bg-emerald-600 text-white' : 'hover:bg-slate-100'
                                }`}
                              >
                                {u.name || u.email}
                              </Badge>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Row 4: Interactive Step-by-Step Builder */}
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
                      placeholder="Título do passo (ex: Checar nível de solvente)"
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

            {/* Row 5: Detailed Content & Formatting Toolbar */}
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
                rows={4}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Insira diretrizes técnicas, parâmetros de máquina ou referências operacionais..."
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
                placeholder="Ex: Nunca tocar na cabeça de impressão com solvente puro..."
                className="text-xs bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
              />
            </div>

            {/* Row 7: Attachments Upload */}
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

      {/* Manage Categories Modal */}
      <ManageCategoriesModal
        open={manageCategoriesOpen}
        onClose={() => setManageCategoriesOpen(false)}
        onCategoriesUpdated={() => loadAllData()}
      />

      {/* Execute Routine Modal */}
      <ExecuteRoutineModal
        open={executeModalOpen}
        onClose={() => {
          setExecuteModalOpen(false)
          setSelectedExecution(null)
        }}
        execution={selectedExecution}
        onExecutionCompleted={() => loadAllData()}
      />
    </div>
  )
}
