import React, { useState, useEffect } from 'react'
import { KANBAN_STAGES, type Client, type KanbanStage, type SlaConfig } from '@/types/crm'
import { clientsService } from '@/services/clients'
import { settingsService } from '@/services/settings'
import { calculateSlaInfo, formatCurrency } from '@/lib/sla'
import KanbanCard from '@/components/KanbanCard'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'
import ClientFormModal from '@/components/ClientFormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Plus,
  Filter,
  Layers,
  AlertTriangle,
  Clock,
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function KanbanPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({
    urgentMinutes: 1440,
    warningMinutes: 720,
    noticeMinutes: 360,
  })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [slaFilterOnly, setSlaFilterOnly] = useState(false)

  // Drag & drop state
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<KanbanStage | null>(null)

  // Modals state
  const [selectedClientForChat, setSelectedClientForChat] = useState<Client | null>(null)
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null)
  const [newClientStage, setNewClientStage] = useState<KanbanStage>('Novo contato')
  const [newClientModalOpen, setNewClientModalOpen] = useState(false)

  const loadClients = async () => {
    try {
      const [list, cfg] = await Promise.all([
        clientsService.getAll(),
        settingsService.getSlaConfig(),
      ])
      setClients(list)
      setSlaConfig(cfg)
    } catch (err) {
      console.error('Error loading kanban clients:', err)
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

  // Filter clients
  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.product_interest && c.product_interest.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesPriority = priorityFilter === 'all' || c.priority === priorityFilter

    if (!matchesSearch || !matchesPriority) return false

    if (slaFilterOnly) {
      if (c.stage === 'Venda fechada' || c.stage === 'Não fechou') return false
      const sla = calculateSlaInfo(c.last_message_at, c.last_message_direction, c.stage, slaConfig)
      return sla.status === 'urgent' || sla.status === 'warning'
    }

    return true
  })

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent, clientId: string) => {
    e.dataTransfer.setData('text/plain', clientId)
    setDraggedClientId(clientId)
  }

  const handleDragOver = (e: React.DragEvent, stage: KanbanStage) => {
    e.preventDefault()
    if (dragOverStage !== stage) {
      setDragOverStage(stage)
    }
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = async (e: React.DragEvent, targetStage: KanbanStage) => {
    e.preventDefault()
    setDragOverStage(null)
    const clientId = e.dataTransfer.getData('text/plain') || draggedClientId
    if (!clientId) return

    const currentClient = clients.find((c) => c.id === clientId)
    if (!currentClient || currentClient.stage === targetStage) return

    // Optimistic UI update
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, stage: targetStage } : c)))

    try {
      await clientsService.updateStage(clientId, targetStage)
      toast({
        title: 'Etapa atualizada',
        description: `Cliente "${currentClient.name}" movido para "${targetStage}".`,
      })
      // trigger global update for badge counters
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
    } catch (err) {
      console.error('Error updating stage:', err)
      toast({
        title: 'Erro ao mover',
        description: 'Não foi possível atualizar a etapa.',
        variant: 'destructive',
      })
      loadClients()
    } finally {
      setDraggedClientId(null)
    }
  }

  const stageColorBadges: Record<KanbanStage, string> = {
    'Novo contato':
      'border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300',
    'Contato iniciado':
      'border-cyan-500/30 text-cyan-700 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-300',
    'Precisa responder':
      'border-rose-500/30 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300',
    'Em atendimento':
      'border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300',
    'Orçamento enviado':
      'border-purple-500/30 text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300',
    'Aguardando cliente':
      'border-indigo-500/30 text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300',
    'Venda fechada':
      'border-emerald-500/30 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300',
    'Não fechou':
      'border-slate-500/30 text-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-slate-300',
  }

  const stageDescriptions: Record<KanbanStage, string> = {
    'Novo contato': 'Novas mensagens ou leads cadastrados',
    'Contato iniciado': 'Template WhatsApp enviado ao cliente',
    'Precisa responder': 'Clientes aguardando nossa resposta (SLA ativo)',
    'Em atendimento': 'Briefing e especificações técnicas',
    'Orçamento enviado': 'Proposta de preços encaminhada',
    'Aguardando cliente': 'Aguardando aprovação ou arte final',
    'Venda fechada': 'PIX/Pagamento aprovado & em produção',
    'Não fechou': 'Orçamento recusado ou adiado',
  }

  // Count clients for badge counters
  const contactInitiatedCount = clients.filter((c) => c.stage === 'Contato iniciado').length

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-xl">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Funil de Atendimentos WhatsApp
            </h1>
            <p className="text-xs text-slate-500">
              Arraste os cards entre as colunas para atualizar o status do cliente.
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
            Apenas SLAs Críticos
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadClients}
            title="Recarregar dados"
            className="h-9 px-2.5"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          </Button>

          <Button
            onClick={() => {
              setNewClientStage('Novo contato')
              setNewClientModalOpen(true)
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Kanban Board Horizontal Scroll Container */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
        <div className="flex items-start gap-4 min-w-[1960px] h-full">
          {KANBAN_STAGES.map((stage) => {
            const stageItems = filteredClients.filter((c) => c.stage === stage)
            const totalStageValue = stageItems.reduce((sum, c) => sum + (c.quote_value || 0), 0)
            const isTarget = dragOverStage === stage

            // Check if stage has urgent clients
            const urgentInStage = stageItems.filter((c) => {
              if (stage === 'Venda fechada' || stage === 'Não fechou') return false
              const sla = calculateSlaInfo(
                c.last_message_at,
                c.last_message_direction,
                stage,
                slaConfig,
              )
              return sla.status === 'urgent'
            }).length

            return (
              <div
                key={stage}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
                className={`w-64 shrink-0 flex flex-col max-h-[calc(100vh-210px)] rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 border transition-all duration-200 ${
                  isTarget
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800/80'
                }`}
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {stage}
                      </span>
                      {urgentInStage > 0 && (
                        <span
                          className="h-2 w-2 rounded-full bg-rose-500 animate-ping"
                          title={`${urgentInStage} com SLA estourado`}
                        />
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold px-1.5 py-0 ${stageColorBadges[stage]}`}
                    >
                      {stageItems.length}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span className="truncate text-[10px]">{stageDescriptions[stage]}</span>
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
                        setNewClientStage(stage)
                        setNewClientModalOpen(true)
                      }}
                      className="h-24 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-center p-3 cursor-pointer hover:bg-white dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <Plus className="h-4 w-4 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-400">Adicionar card</span>
                    </div>
                  ) : (
                    stageItems.map((client) => (
                      <KanbanCard
                        key={client.id}
                        client={client}
                        slaConfig={slaConfig}
                        onDragStart={(e) => handleDragStart(e, client.id)}
                        onClick={() => {
                          setClientToEdit(client)
                          setEditModalOpen(true)
                        }}
                        onOpenChat={(e) => {
                          e.stopPropagation()
                          setSelectedClientForChat(client)
                          setChatDrawerOpen(true)
                        }}
                      />
                    ))
                  )}
                </div>

                {/* Column Footer: Quick Add Card */}
                <div className="p-2 border-t border-slate-200/60 dark:border-slate-800">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNewClientStage(stage)
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
        onClose={() => setChatDrawerOpen(false)}
        client={selectedClientForChat}
        slaConfig={slaConfig}
        onClientUpdated={() => loadClients()}
      />

      {/* Edit Client Modal */}
      <ClientFormModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setClientToEdit(null)
        }}
        onSaved={() => loadClients()}
        clientToEdit={clientToEdit}
      />

      {/* Create Client Modal */}
      <ClientFormModal
        isOpen={newClientModalOpen}
        onClose={() => setNewClientModalOpen(false)}
        onSaved={() => loadClients()}
        initialStage={newClientStage}
      />
    </div>
  )
}
