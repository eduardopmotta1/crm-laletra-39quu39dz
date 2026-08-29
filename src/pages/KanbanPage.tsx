import React, { useState, useEffect } from 'react'
import type { Attendance, Client, KanbanColumn, KanbanStage, SlaConfig } from '@/types/crm'
import { attendancesService } from '@/services/attendances'
import { clientsService } from '@/services/clients'
import { columnsService } from '@/services/columns'
import { settingsService } from '@/services/settings'
import { calculateSlaInfo, formatCurrency } from '@/lib/sla'
import KanbanCard from '@/components/KanbanCard'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'
import ClientFormModal from '@/components/ClientFormModal'
import EditColumnModal from '@/components/EditColumnModal'
import CompleteAndArchiveModal from '@/components/CompleteAndArchiveModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Plus,
  Layers,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Archive,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function KanbanPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({
    urgentMinutes: 1440,
    warningMinutes: 720,
    noticeMinutes: 360,
  })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [slaFilterOnly, setSlaFilterOnly] = useState(false)
  const [returnedFilterOnly, setReturnedFilterOnly] = useState(false)

  // Drag & drop state
  const [draggedAttendanceId, setDraggedAttendanceId] = useState<string | null>(null)
  const [dragOverStageName, setDragOverStageName] = useState<string | null>(null)

  // Modals state
  const [selectedClientForChat, setSelectedClientForChat] = useState<Client | null>(null)
  const [selectedAttendanceForChat, setSelectedAttendanceForChat] = useState<Attendance | null>(
    null,
  )
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null)
  const [newClientStage, setNewClientStage] = useState<string>('Novo contato')
  const [newClientModalOpen, setNewClientModalOpen] = useState(false)

  // Edit Column Modal
  const [editColumnModalOpen, setEditColumnModalOpen] = useState(false)
  const [columnToEdit, setColumnToEdit] = useState<KanbanColumn | null>(null)

  // Complete & Archive Modal
  const [archiveModalOpen, setArchiveModalOpen] = useState(false)
  const [clientToArchive, setClientToArchive] = useState<Client | null>(null)
  const [attendanceToArchive, setAttendanceToArchive] = useState<Attendance | null>(null)

  const loadData = async () => {
    try {
      const [cols, atts, cfg, autoArchiveCfg] = await Promise.all([
        columnsService.getVisible(),
        attendancesService.getAll(undefined, '-created', { includeArchived: false }),
        settingsService.getSlaConfig(),
        settingsService.getAutoArchiveConfig(),
      ])
      setColumns(cols)
      setAttendances(atts)
      setSlaConfig(cfg)

      // Auto-archive check on attendances if configured
      if (autoArchiveCfg.enabled) {
        const archivedCount = await attendancesService.runAutoArchiveCheck(
          autoArchiveCfg.wonHours,
          autoArchiveCfg.lostHours,
        )
        if (archivedCount > 0) {
          const refreshed = await attendancesService.getAll(undefined, '-created', {
            includeArchived: false,
          })
          setAttendances(refreshed)
        }
      }
    } catch (err) {
      console.error('Error loading kanban board:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const handleUpdate = () => loadData()
    window.addEventListener('crm-client-updated', handleUpdate)
    return () => window.removeEventListener('crm-client-updated', handleUpdate)
  }, [])

  // Auto-open attendance chat drawer if attendance_id / attendanceId query param is present
  useEffect(() => {
    const targetAttendanceId = searchParams.get('attendance_id') || searchParams.get('attendanceId')
    if (!targetAttendanceId) return

    const openAttendanceDrawer = async () => {
      // 1. Check if already loaded in state
      let att = attendances.find((a) => a.id === targetAttendanceId)
      if (!att) {
        try {
          const fetched = await attendancesService.getById(targetAttendanceId)
          if (fetched) {
            att = fetched
          }
        } catch (err) {
          console.error('Error fetching attendance for query param:', err)
        }
      }

      if (att) {
        const clientObj = getClientFromAttendance(att)
        setSelectedClientForChat(clientObj)
        setSelectedAttendanceForChat(att)
        setChatDrawerOpen(true)
      }
    }

    openAttendanceDrawer()
  }, [searchParams, attendances])

  // Helper to get client identity object from attendance expand or fallback
  const getClientFromAttendance = (att: Attendance): Client => {
    if (att.expand?.client_id) {
      const c = att.expand.client_id
      return {
        ...c,
        stage: att.stage,
        product_interest: att.product_interest || c.product_interest,
        quote_value: att.quote_value !== undefined ? att.quote_value : c.quote_value,
        assigned_to: att.assigned_to || c.assigned_to,
        attendance_id: att.id,
      }
    }

    return {
      id: att.client_id,
      name: 'Cliente',
      phone: '',
      stage: att.stage,
      product_interest: att.product_interest,
      quote_value: att.quote_value,
      assigned_to: att.assigned_to,
      attendance_id: att.id,
      created: att.created,
      updated: att.updated,
    }
  }

  // Filter attendances
  const filteredAttendances = attendances.filter((att) => {
    const client = att.expand?.client_id
    const clientName = client?.name || ''
    const clientPhone = client?.phone || ''
    const product = att.product_interest || client?.product_interest || ''

    const matchesSearch =
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clientPhone.includes(searchTerm) ||
      product.toLowerCase().includes(searchTerm.toLowerCase())

    const clientPriority = client?.priority || 'media'
    const matchesPriority = priorityFilter === 'all' || clientPriority === priorityFilter

    if (!matchesSearch || !matchesPriority) return false

    if (returnedFilterOnly && !client?.has_returned) return false

    if (slaFilterOnly) {
      if (att.stage === 'Venda fechada' || att.stage === 'Não fechou') return false
      const lastMsgAt = client?.last_message_at || att.last_customer_message_at || att.created
      const lastDir = client?.last_message_direction || 'inbound'
      const sla = calculateSlaInfo(lastMsgAt, lastDir, att.stage, slaConfig)
      return sla.status === 'urgent' || sla.status === 'warning'
    }

    return true
  })

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent, attendanceId: string) => {
    e.dataTransfer.setData('text/plain', attendanceId)
    setDraggedAttendanceId(attendanceId)
  }

  const handleDragOver = (e: React.DragEvent, stageName: string) => {
    e.preventDefault()
    if (dragOverStageName !== stageName) {
      setDragOverStageName(stageName)
    }
  }

  const handleDragLeave = () => {
    setDragOverStageName(null)
  }

  const handleDrop = async (e: React.DragEvent, targetStageName: string) => {
    e.preventDefault()
    setDragOverStageName(null)
    const attendanceId = e.dataTransfer.getData('text/plain') || draggedAttendanceId
    if (!attendanceId) return

    const currentAttendance = attendances.find((a) => a.id === attendanceId)
    if (!currentAttendance || currentAttendance.stage === targetStageName) return

    const clientName = currentAttendance.expand?.client_id?.name || 'Cliente'

    // Optimistic UI update
    setAttendances((prev) =>
      prev.map((a) =>
        a.id === attendanceId ? { ...a, stage: targetStageName as KanbanStage } : a,
      ),
    )

    try {
      await attendancesService.updateStage(attendanceId, targetStageName as KanbanStage, {
        changeType: 'manual',
        fromStage: currentAttendance.stage,
        notes: `Card arrastado manualmente de "${currentAttendance.stage}" para "${targetStageName}".`,
      })

      toast({
        title: 'Etapa atualizada',
        description: `Atendimento de "${clientName}" movido para "${targetStageName}".`,
      })
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
    } catch (err) {
      console.error('Error updating stage:', err)
      toast({
        title: 'Erro ao mover',
        description: 'Não foi possível atualizar a etapa.',
        variant: 'destructive',
      })
      loadData()
    } finally {
      setDraggedAttendanceId(null)
    }
  }

  const getColumnBadgeColor = (colorName?: string) => {
    switch (colorName) {
      case 'cyan':
        return 'border-cyan-500/30 text-cyan-700 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-300'
      case 'rose':
        return 'border-rose-500/30 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300'
      case 'amber':
        return 'border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300'
      case 'purple':
        return 'border-purple-500/30 text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300'
      case 'indigo':
        return 'border-indigo-500/30 text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300'
      case 'emerald':
        return 'border-emerald-500/30 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300'
      case 'slate':
        return 'border-slate-500/30 text-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-slate-300'
      case 'blue':
      default:
        return 'border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300'
    }
  }

  const returnedAttendancesCount = attendances.filter(
    (a) => a.expand?.client_id?.has_returned,
  ).length

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-xl">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Funil de Atendimentos WhatsApp
              </h1>
              <Badge variant="secondary" className="text-xs font-semibold">
                {attendances.length} ativos
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Atendimentos em andamento por etapa. Ciclos encerrados vão para o histórico.
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente, tel ou produto..."
              className="h-9 pl-9 text-xs bg-slate-50 dark:bg-slate-800"
            />
          </div>

          <Button
            variant={slaFilterOnly ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setSlaFilterOnly(!slaFilterOnly)}
            className="text-xs h-9"
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            SLAs Críticos
          </Button>

          {returnedAttendancesCount > 0 && (
            <Button
              variant={returnedFilterOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReturnedFilterOnly(!returnedFilterOnly)}
              className={`text-xs h-9 ${
                returnedFilterOnly
                  ? 'bg-emerald-600 text-white'
                  : 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Retornaram ({returnedAttendancesCount})
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/arquivados')}
            title="Ver atendimentos encerrados e arquivados"
            className="text-xs h-9 text-slate-600 dark:text-slate-300"
          >
            <Archive className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
            Arquivados
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setColumnToEdit(null)
              setEditColumnModalOpen(true)
            }}
            title="Adicionar ou editar colunas do funil"
            className="text-xs h-9 text-slate-600"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Nova Coluna
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            title="Recarregar dados"
            className="h-9 px-2.5"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          </Button>

          <Button
            onClick={() => {
              setNewClientStage(columns[0]?.name || 'Novo contato')
              setNewClientModalOpen(true)
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Atendimento
          </Button>
        </div>
      </div>

      {/* Kanban Board Horizontal Scroll Container */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
        <div
          className="flex items-start gap-4 h-full"
          style={{ minWidth: `${Math.max(columns.length * 270, 1200)}px` }}
        >
          {columns.map((column) => {
            const stageName = column.name
            const stageItems = filteredAttendances.filter(
              (a) =>
                a.stage === stageName ||
                (column.internal_id === 'new_contact' &&
                  (a.stage === 'Novo contato' || a.stage === stageName)) ||
                (column.internal_id === 'won' &&
                  (a.stage === 'Venda fechada' || a.stage === stageName)) ||
                (column.internal_id === 'lost' &&
                  (a.stage === 'Não fechou' || a.stage === stageName)),
            )

            const totalStageValue = stageItems.reduce((sum, a) => sum + (a.quote_value || 0), 0)
            const isTarget = dragOverStageName === stageName
            const isFinalStage = column.stage_type === 'final'

            // Check if column has urgent attendances
            const urgentInStage = stageItems.filter((a) => {
              if (isFinalStage) return false
              const client = a.expand?.client_id
              const lastMsgAt = client?.last_message_at || a.last_customer_message_at || a.created
              const lastDir = client?.last_message_direction || 'inbound'
              const sla = calculateSlaInfo(lastMsgAt, lastDir, a.stage, slaConfig)
              return sla.status === 'urgent'
            }).length

            return (
              <div
                key={column.id}
                onDragOver={(e) => handleDragOver(e, stageName)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stageName)}
                className={`w-64 shrink-0 flex flex-col max-h-[calc(100vh-210px)] rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 border transition-all duration-200 ${
                  isTarget
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800/80'
                }`}
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {stageName}
                      </span>
                      {urgentInStage > 0 && (
                        <span
                          className="h-2 w-2 rounded-full bg-rose-500 animate-ping shrink-0"
                          title={`${urgentInStage} com SLA estourado`}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 ${getColumnBadgeColor(
                          column.color,
                        )}`}
                      >
                        {stageItems.length}
                      </Badge>

                      {/* Edit Column trigger button */}
                      <button
                        type="button"
                        onClick={() => {
                          setColumnToEdit(column)
                          setEditColumnModalOpen(true)
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                        title="Editar nome, cor ou regras desta coluna"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <span className="truncate text-[10px]" title={column.description}>
                      {column.description ||
                        (isFinalStage ? 'Etapa final do funil' : 'Etapa de atendimento')}
                    </span>
                  </div>

                  {totalStageValue > 0 && (
                    <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Total: {formatCurrency(totalStageValue)}
                    </div>
                  )}
                </div>

                {/* Column Body / Cards List */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[140px]">
                  {stageItems.length === 0 ? (
                    <div
                      onClick={() => {
                        setNewClientStage(stageName)
                        setNewClientModalOpen(true)
                      }}
                      className="h-24 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-center p-3 cursor-pointer hover:bg-white dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <Plus className="h-4 w-4 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-400">Adicionar card</span>
                    </div>
                  ) : (
                    stageItems.map((att) => {
                      const clientObj = getClientFromAttendance(att)
                      return (
                        <KanbanCard
                          key={att.id}
                          client={clientObj}
                          attendance={att}
                          column={column}
                          slaConfig={slaConfig}
                          onDragStart={(e) => handleDragStart(e, att.id)}
                          onClick={() => {
                            setClientToEdit(clientObj)
                            setEditModalOpen(true)
                          }}
                          onOpenChat={(e) => {
                            e.stopPropagation()
                            setSelectedClientForChat(clientObj)
                            setSelectedAttendanceForChat(att)
                            setChatDrawerOpen(true)
                          }}
                          onCompleteAndArchive={(c) => {
                            setClientToArchive(c)
                            setAttendanceToArchive(att)
                            setArchiveModalOpen(true)
                          }}
                        />
                      )
                    })
                  )}
                </div>

                {/* Column Footer: Quick Add Card */}
                <div className="p-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNewClientStage(stageName)
                      setNewClientModalOpen(true)
                    }}
                    className="w-full text-xs text-slate-500 hover:text-emerald-600 hover:bg-white dark:hover:bg-slate-800 h-8 justify-start"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Novo nesta coluna
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* WhatsApp Chat & Interaction Drawer */}
      <WhatsAppChatDrawer
        isOpen={chatDrawerOpen}
        onClose={() => {
          setChatDrawerOpen(false)
          setSelectedAttendanceForChat(null)
          if (searchParams.get('attendance_id') || searchParams.get('attendanceId')) {
            const nextParams = new URLSearchParams(searchParams)
            nextParams.delete('attendance_id')
            nextParams.delete('attendanceId')
            setSearchParams(nextParams, { replace: true })
          }
        }}
        client={selectedClientForChat}
        activeAttendance={selectedAttendanceForChat}
        slaConfig={slaConfig}
        onClientUpdated={() => loadData()}
      />

      {/* Edit Client Modal */}
      <ClientFormModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setClientToEdit(null)
        }}
        onSaved={() => loadData()}
        clientToEdit={clientToEdit}
      />

      {/* Create Client Modal */}
      <ClientFormModal
        isOpen={newClientModalOpen}
        onClose={() => setNewClientModalOpen(false)}
        onSaved={() => loadData()}
        initialStage={newClientStage}
      />

      {/* Edit Column Modal */}
      <EditColumnModal
        isOpen={editColumnModalOpen}
        onClose={() => {
          setEditColumnModalOpen(false)
          setColumnToEdit(null)
        }}
        column={columnToEdit}
        allColumns={columns}
        onSaved={() => loadData()}
      />

      {/* Complete & Archive Modal */}
      <CompleteAndArchiveModal
        isOpen={archiveModalOpen}
        onClose={() => {
          setArchiveModalOpen(false)
          setClientToArchive(null)
          setAttendanceToArchive(null)
        }}
        client={clientToArchive}
        attendanceId={attendanceToArchive?.id}
        onSuccess={() => loadData()}
      />
    </div>
  )
}
