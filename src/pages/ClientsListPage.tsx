import React, { useState, useEffect } from 'react'
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MessageSquare,
  Clock,
  Edit,
  ExternalLink,
  ChevronDown,
  Filter,
  Trash2,
  Calendar,
  Sparkles,
  Archive,
  RotateCcw,
  MoreVertical,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
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
import pb from '@/lib/pocketbase/client'
import { clientsService } from '@/services/clients'
import { settingsService } from '@/services/settings'
import { dealsService } from '@/services/deals'
import { calculateSlaInfo, formatCurrency, formatDateTime, getWhatsAppDirectUrl } from '@/lib/sla'
import { useAuth } from '@/context/AuthContext'
import type { Client, KanbanStage, SlaConfig } from '@/types/crm'
import { KANBAN_STAGES } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'
import ClientFormModal from '@/components/ClientFormModal'
import StartWhatsAppConversationModal from '@/components/StartWhatsAppConversationModal'
import { toast } from '@/hooks/use-toast'

export default function ClientsListPage() {
  const { isAdmin, hasPermission, canViewFinancials } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({
    urgentMinutes: 1440,
    warningMinutes: 720,
    noticeMinutes: 360,
  })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [completenessFilter, setCompletenessFilter] = useState<'all' | 'complete' | 'incomplete'>(
    'all',
  )
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'created_desc' | 'created_asc'>(
    'name_asc',
  )

  // Selected client for Drawer & Modal
  const [selectedClientForChat, setSelectedClientForChat] = useState<Client | null>(null)
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [startChatModalOpen, setStartChatModalOpen] = useState(false)
  const [clientForStartChat, setClientForStartChat] = useState<Client | null>(null)
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [attendancesByClient, setAttendancesByClient] = useState<
    Record<string, { total: number; active: number }>
  >({})

  const loadClients = async () => {
    try {
      const [cls, cfg, atts] = await Promise.all([
        clientsService.getAll(undefined, '-last_message_at', { includeArchived: false }),
        settingsService.getSlaConfig(),
        pb.collection('attendances').getFullList({ requestKey: null }),
      ])

      const attMap: Record<string, { total: number; active: number }> = {}
      for (const a of atts) {
        const cId = (a as any).client_id
        if (!cId) continue
        if (!attMap[cId]) attMap[cId] = { total: 0, active: 0 }
        attMap[cId].total++
        if (!(a as any).is_archived) {
          attMap[cId].active++
        }
      }
      setAttendancesByClient(attMap)
      setClients(cls)
      setSlaConfig(cfg)
    } catch (err) {
      console.error('Error loading clients:', err)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    loadClients()
    const handleUpdate = () => loadClients()
    window.addEventListener('crm-client-updated', handleUpdate)
    return () => window.removeEventListener('crm-client-updated', handleUpdate)
  }, [])

  const filteredClients = clients
    .filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.product_interest && c.product_interest.toLowerCase().includes(searchTerm.toLowerCase()))

      const matchesStage = stageFilter === 'all' || c.stage === stageFilter
      const matchesPriority = priorityFilter === 'all' || c.priority === priorityFilter

      const comp = clientsService.calculateCompleteness(c)
      const matchesCompleteness =
        completenessFilter === 'all' ||
        (completenessFilter === 'complete' && comp.isComplete) ||
        (completenessFilter === 'incomplete' && !comp.isComplete)

      return matchesSearch && matchesStage && matchesPriority && matchesCompleteness
    })
    .sort((a, b) => {
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })
      }
      if (sortBy === 'name_desc') {
        return (b.name || '').localeCompare(a.name || '', 'pt-BR', { sensitivity: 'base' })
      }
      if (sortBy === 'created_desc') {
        const timeA = a.created ? new Date(a.created).getTime() : 0
        const timeB = b.created ? new Date(b.created).getTime() : 0
        return timeB - timeA
      }
      if (sortBy === 'created_asc') {
        const timeA = a.created ? new Date(a.created).getTime() : 0
        const timeB = b.created ? new Date(b.created).getTime() : 0
        return timeA - timeB
      }
      return 0
    })

  const handleConfirmDelete = async () => {
    if (!clientToDelete) return
    const id = clientToDelete.id
    const name = clientToDelete.name
    setDeleting(true)
    try {
      // Soft-delete imediato na UI para resposta instantânea
      setClients((prev) => prev.filter((c) => c.id !== id))
      const success = await clientsService.delete(id)
      if (success) {
        toast({
          title: 'Cliente excluído com sucesso',
          description: `O cliente "${name}" foi ocultado da lista. Histórico e atendimentos preservados com segurança.`,
        })
        window.dispatchEvent(new CustomEvent('crm-client-updated'))
      } else {
        throw new Error('Falha ao marcar cliente como arquivado.')
      }
    } catch (err) {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível remover o cliente da lista.',
        variant: 'destructive',
      })
      loadClients()
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setClientToDelete(null)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600" />
            Cadastro de Clientes & Atendimentos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerencie contatos, pedidos gráficos, responsáveis e histórico de WhatsApp.
          </p>
        </div>
        <Button
          onClick={() => {
            setClientToEdit(null)
            setModalOpen(true)
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-sm"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Atendimento
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, telefone, email, produto..."
            className="pl-9 text-xs bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Stage Filter */}
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-full sm:w-44 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Etapa do Atendimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {KANBAN_STAGES.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority Filter */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-36 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>

          {/* Completeness Filter (Etapa 2) */}
          <Select
            value={completenessFilter}
            onValueChange={(val: 'all' | 'complete' | 'incomplete') => setCompletenessFilter(val)}
          >
            <SelectTrigger className="w-full sm:w-44 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Status do Cadastro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cadastros</SelectItem>
              <SelectItem value="complete">Cadastro completo</SelectItem>
              <SelectItem value="incomplete">Cadastro incompleto</SelectItem>
            </SelectContent>
          </Select>
          {/* Sort Selector */}
          <Select
            value={sortBy}
            onValueChange={(val: 'name_asc' | 'name_desc' | 'created_desc' | 'created_asc') =>
              setSortBy(val)
            }
          >
            <SelectTrigger className="w-full sm:w-40 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">Nome A → Z</SelectItem>
              <SelectItem value="name_desc">Nome Z → A</SelectItem>
              <SelectItem value="created_desc">Mais recentes</SelectItem>
              <SelectItem value="created_asc">Mais antigos</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-slate-500 font-medium ml-1">
            {filteredClients.length} {filteredClients.length === 1 ? 'cliente' : 'clientes'}
          </span>
        </div>
      </div>

      {/* Clients Table / Cards Responsive */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Cliente & Contato</th>
                <th className="py-3.5 px-4">Atendimentos & Status</th>
                <th className="py-3.5 px-4">Histórico de Compras</th>
                <th className="py-3.5 px-4">Última Msg & SLA</th>
                <th className="py-3.5 px-4">Responsável</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Carregando atendimentos...
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Nenhum cliente encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => {
                  const sla = calculateSlaInfo(
                    client.last_message_at,
                    client.last_message_direction,
                    client.stage,
                    slaConfig,
                  )
                  const completeness = clientsService.calculateCompleteness(client)

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Name & Phone & Badges */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm">
                            {client.name}
                          </span>
                          {/* Badge de Completude Cadastral */}
                          {completeness.isComplete ? (
                            <Badge
                              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 text-[9px] px-1.5 py-0 font-semibold shadow-2xs"
                              title="Todos os dados essenciais estão preenchidos"
                            >
                              Completo
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 text-[9px] px-1.5 py-0 font-semibold shadow-2xs cursor-pointer"
                              title={`Faltando: ${completeness.missingFields.join(', ')}`}
                              onClick={() => {
                                setClientToEdit(client)
                                setModalOpen(true)
                              }}
                            >
                              Incompleto ({completeness.missingFields.length})
                            </Badge>
                          )}
                          {client.is_vip && (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] px-1.5 py-0 font-bold shadow-xs">
                              ⭐ VIP
                            </Badge>
                          )}
                          {client.trade_name && (
                            <span className="text-slate-400 text-xs">({client.trade_name})</span>
                          )}
                          {client.has_returned && (
                            <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 flex items-center gap-0.5 font-bold">
                              <RotateCcw className="h-2.5 w-2.5" />
                              Retornou
                            </Badge>
                          )}
                          {client.is_archived && (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-amber-300 text-amber-800 bg-amber-50"
                            >
                              <Archive className="h-2.5 w-2.5 mr-0.5" />
                              Arquivado
                            </Badge>
                          )}
                          {client.relationship_status === 'dissatisfied' && (
                            <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[9px] px-1.5 py-0 font-bold animate-pulse">
                              ⚠️ Insatisfeito
                            </Badge>
                          )}
                          {client.relationship_status === 'in_recovery' && (
                            <Badge className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0 font-bold">
                              🔄 Em Recuperação
                            </Badge>
                          )}
                          {client.relationship_status === 'recovered' && (
                            <Badge className="bg-purple-100 text-purple-800 text-[9px] px-1.5 py-0 font-bold">
                              ✓ Recuperado
                            </Badge>
                          )}
                          {client.relationship_status === 'satisfied' && (
                            <Badge className="bg-emerald-50 text-emerald-800 text-[9px] px-1.5 py-0 font-bold">
                              ⭐ Satisfeito
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-[11px] mt-0.5">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-emerald-600" />
                            {client.phone}
                          </span>
                          {client.email && (
                            <span className="flex items-center gap-1 truncate max-w-[140px]">
                              <Mail className="h-3 w-3 text-slate-400" />
                              {client.email}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Atendimentos & Status */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="secondary"
                            className="font-medium text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 w-fit"
                          >
                            {client.stage}
                          </Badge>
                          <span className="text-[11px] text-slate-500">
                            {attendancesByClient[client.id]?.active ? (
                              <span className="text-emerald-600 font-semibold">
                                ● 1 ativo ({attendancesByClient[client.id]?.total || 1} no total)
                              </span>
                            ) : attendancesByClient[client.id]?.total ? (
                              <span>
                                ○ {attendancesByClient[client.id]?.total} ciclo
                                {attendancesByClient[client.id]?.total === 1 ? '' : 's'} arquivado
                                {attendancesByClient[client.id]?.total === 1 ? '' : 's'}
                              </span>
                            ) : (
                              <span className="text-slate-400">Sem atendimento ativo</span>
                            )}
                          </span>{' '}
                        </div>
                      </td>

                      {/* Histórico de Compras & Faturamento */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {client.total_purchases ? (
                              <span>
                                {client.total_purchases}{' '}
                                {client.total_purchases === 1
                                  ? 'compra concluída'
                                  : 'compras concluídas'}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">Nenhuma compra</span>
                            )}
                          </span>
                          <div className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                            {canViewFinancials
                              ? client.total_purchase_value
                                ? `Total: ${formatCurrency(client.total_purchase_value)}`
                                : client.quote_value
                                  ? `Orçamento: ${formatCurrency(client.quote_value)}`
                                  : 'R$ 0,00'
                              : 'Valor restrito'}
                          </div>
                          {client.last_purchase_date && (
                            <span className="text-[10px] text-slate-400">
                              Última: {formatDateTime(client.last_purchase_date)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Last Message & SLA */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Badge className={`text-[10px] px-2 py-0 ${sla.colorBadgeClass}`}>
                            {sla.label}
                          </Badge>
                        </div>
                        {client.last_message_text && (
                          <p className="text-[10px] text-slate-400 italic line-clamp-1 max-w-[180px] mt-1">
                            "{client.last_message_text}"
                          </p>
                        )}
                      </td>

                      {/* Assigned User */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {client.expand?.assigned_to?.name || 'Não atribuído'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedClientForChat(client)
                              setChatDrawerOpen(true)
                            }}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                            title="Abrir e responder conversa no CRM"
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1" />
                            Responder no CRM
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setClientToEdit(client)
                              setModalOpen(true)
                            }}
                            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
                            title="Editar dados"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 text-xs">
                              <DropdownMenuItem
                                onClick={() => {
                                  setClientForStartChat(client)
                                  setStartChatModalOpen(true)
                                }}
                                className="cursor-pointer"
                              >
                                <Sparkles className="h-3.5 w-3.5 text-emerald-600 mr-2" />
                                <span>Iniciar com Template Oficial</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a
                                  href={getWhatsAppDirectUrl(client.phone)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center cursor-pointer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5 text-emerald-600 mr-2" />
                                  <span>Abrir no WhatsApp Web</span>
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setClientToDelete(client)
                                  setDeleteDialogOpen(true)
                                }}
                                className="cursor-pointer text-rose-600 dark:text-rose-400 focus:text-rose-700 focus:bg-rose-50 dark:focus:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                <span>Excluir cliente</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* WhatsApp Chat & Interaction Drawer */}
      <WhatsAppChatDrawer
        isOpen={chatDrawerOpen}
        onClose={() => setChatDrawerOpen(false)}
        client={selectedClientForChat}
        slaConfig={slaConfig}
        onClientUpdated={() => loadClients()}
      />

      {/* Edit / Create Client Modal */}
      <ClientFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setClientToEdit(null)
        }}
        onSaved={() => loadClients()}
        clientToEdit={clientToEdit}
      />

      {/* Start WhatsApp Conversation Modal */}
      <StartWhatsAppConversationModal
        isOpen={startChatModalOpen}
        onClose={() => {
          setStartChatModalOpen(false)
          setClientForStartChat(null)
        }}
        client={clientForStartChat}
        onSuccess={() => loadClients()}
      />

      {/* Confirmação Segura de Exclusão (Soft-Delete) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Trash2 className="h-5 w-5 text-rose-600" />
              Excluir cliente
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600 dark:text-slate-300 space-y-2 pt-1 text-left">
              <p>
                Tem certeza de que deseja excluir o cliente{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">
                  "{clientToDelete?.name}"
                </strong>
                ?
              </p>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Archive className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  Preservação Total do Histórico
                </p>
                <p>
                  O cliente será removido imediatamente da lista visível, mas todo o histórico
                  (mensagens, atendimentos, orçamentos e pedidos) será preservado com segurança.
                </p>
                <p className="text-amber-800 dark:text-amber-300">
                  Se ele voltar a mandar mensagem pelo WhatsApp, o cadastro será reativado
                  automaticamente pelo mesmo número, sem duplicidades.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleting} onClick={() => setClientToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDelete()
              }}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {deleting ? 'Removendo...' : 'Excluir cliente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
