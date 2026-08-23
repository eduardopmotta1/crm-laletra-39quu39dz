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
} from 'lucide-react'
import { clientsService } from '@/services/clients'
import { settingsService } from '@/services/settings'
import { dealsService } from '@/services/deals'
import { calculateSlaInfo, formatCurrency, formatDateTime, getWhatsAppDirectUrl } from '@/lib/sla'
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

  // Selected client for Drawer & Modal
  const [selectedClientForChat, setSelectedClientForChat] = useState<Client | null>(null)
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [startChatModalOpen, setStartChatModalOpen] = useState(false)
  const [clientForStartChat, setClientForStartChat] = useState<Client | null>(null)
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const [showArchived, setShowArchived] = useState(false)

  const loadClients = async () => {
    try {
      const [cls, cfg] = await Promise.all([
        clientsService.getAll(undefined, '-last_message_at', { includeArchived: true }),
        settingsService.getSlaConfig(),
      ])
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

  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.product_interest && c.product_interest.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesArchived = showArchived || !c.is_archived
    const matchesStage = stageFilter === 'all' || c.stage === stageFilter
    const matchesPriority = priorityFilter === 'all' || c.priority === priorityFilter

    return matchesSearch && matchesArchived && matchesStage && matchesPriority
  })

  const handleDeleteClient = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover o cliente "${name}"?`)) return
    try {
      await clientsService.delete(id)
      toast({
        title: 'Cliente excluído',
        description: `O cadastro de "${name}" foi removido com sucesso.`,
      })
      loadClients()
    } catch (err) {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível remover o cliente.',
        variant: 'destructive',
      })
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
              <SelectValue placeholder="Etapa do Funil" />
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
                <th className="py-3.5 px-4">Etapa do Funil</th>
                <th className="py-3.5 px-4">Produto & Orçamento</th>
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

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Name & Phone */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm">
                            {client.name}
                          </span>
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
                      {/* Stage Badge */}
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className="font-medium text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          {client.stage}
                        </Badge>
                      </td>

                      {/* Product & Value */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1 max-w-[220px]">
                          {client.product_interest || '-'}
                        </div>
                        <div className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px] mt-0.5">
                          {client.quote_value ? formatCurrency(client.quote_value) : 'Sem valor'}
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
                              setClientForStartChat(client)
                              setStartChatModalOpen(true)
                            }}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                            title="Iniciar conversa no WhatsApp com template oficial"
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1" />
                            Iniciar conversa no WhatsApp
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedClientForChat(client)
                              setChatDrawerOpen(true)
                            }}
                            className="h-8 text-xs text-slate-700 hover:text-emerald-700 hover:bg-slate-50 border-slate-200"
                            title="Ver histórico de mensagens e tarefas"
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                            Histórico
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
    </div>
  )
}
