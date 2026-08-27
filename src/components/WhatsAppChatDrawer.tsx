import React, { useState, useEffect, useRef } from 'react'
import {
  X,
  Send,
  Sparkles,
  Phone,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Check,
  CheckCheck,
  Plus,
  Calendar,
  DollarSign,
  User,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Archive,
  RotateCcw,
  GitCommit,
  XCircle,
  History,
  Star,
  Heart,
  DollarSign as DollarSignIcon,
  ShoppingCart,
  ShieldCheck as ShieldCheckIcon,
  Package,
} from 'lucide-react'
import type {
  Client,
  Message,
  Task,
  SlaConfig,
  ArchivedDeal,
  StageTransition,
  Evaluation,
  PostSale,
  ProductionOrder,
} from '@/types/crm'
import { isWithin24HourWindow } from '@/types/crm'
import { whatsappService } from '@/services/whatsapp'
import { tasksService } from '@/services/tasks'
import { clientsService } from '@/services/clients'
import { dealsService } from '@/services/deals'
import { evaluationsService } from '@/services/evaluations'
import { postSalesService } from '@/services/postSales'
import { productionService } from '@/services/production'
import ProductionOrderModal from './ProductionOrderModal'
import { calculateSlaInfo, formatCurrency, formatDateTime, getWhatsAppDirectUrl } from '@/lib/sla'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/context/AuthContext'
import StartWhatsAppConversationModal from './StartWhatsAppConversationModal'
import CompleteAndArchiveModal from './CompleteAndArchiveModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface WhatsAppChatDrawerProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  slaConfig: SlaConfig
  onClientUpdated?: () => void
}

export default function WhatsAppChatDrawer({
  isOpen,
  onClose,
  client,
  slaConfig,
  onClientUpdated,
}: WhatsAppChatDrawerProps) {
  const { user, isAdmin, hasPermission, canViewFinancials } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [archivedDeals, setArchivedDeals] = useState<ArchivedDeal[]>([])
  const [stageTransitions, setStageTransitions] = useState<StageTransition[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [postSales, setPostSales] = useState<PostSale[]>([])
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [currentClient, setCurrentClient] = useState<Client | null>(client)
  const [apiStatus, setApiStatus] = useState<{
    configured: boolean
    hasToken: boolean
    hasPhoneNumberId: boolean
    isDemoToken: boolean
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Production Order modal from drawer
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [selectedOrderToEdit, setSelectedOrderToEdit] = useState<ProductionOrder | null>(null)

  // New task inline
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [isAddingTask, setIsAddingTask] = useState(false)

  // Modals state
  const [startModalOpen, setStartModalOpen] = useState(false)
  const [archiveModalOpen, setArchiveModalOpen] = useState(false)

  // Right sidebar tab
  const [rightTab, setRightTab] = useState<'info' | 'relationship' | 'orders' | 'history'>('info')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (client && isOpen) {
      setCurrentClient(client)
      loadClientData(client.id)
    }
  }, [client, isOpen])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const loadClientData = async (clientId: string) => {
    setLoading(true)
    try {
      const [
        msgList,
        taskList,
        freshClient,
        pastDeals,
        transitions,
        evals,
        psList,
        ordersList,
        status,
      ] = await Promise.all([
        whatsappService.getMessages(clientId),
        tasksService.getByClientId(clientId),
        clientsService.getById(clientId),
        dealsService.getByClientId(clientId),
        dealsService.getStageTransitions(clientId),
        evaluationsService.getByClientId(clientId),
        postSalesService.getByClientId(clientId),
        productionService.getByClientId(clientId),
        whatsappService.getApiStatus(),
      ])
      setMessages(msgList)
      setTasks(taskList)
      if (freshClient) setCurrentClient(freshClient)
      setArchivedDeals(pastDeals)
      setProductionOrders(ordersList)
      setStageTransitions(transitions)
      setEvaluations(evals)
      setPostSales(psList)
      setApiStatus(status)
    } catch (err) {
      console.error('Error loading chat drawer data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !client) return null

  const displayClient = currentClient || client
  const within24h = isWithin24HourWindow(
    displayClient.last_message_at,
    displayClient.last_message_direction,
  )
  const sla = calculateSlaInfo(
    displayClient.last_message_at,
    displayClient.last_message_direction,
    displayClient.stage,
    slaConfig,
  )

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const textToSend = inputMessage.trim()
    if ((!textToSend && !selectedAttachment) || sending) return

    setSending(true)
    try {
      let finalMessage = textToSend
      if (selectedAttachment) {
        const fileInfo = `[📎 Anexo: ${selectedAttachment.name} (${(selectedAttachment.size / 1024).toFixed(1)} KB)]`
        finalMessage = finalMessage ? `${finalMessage}\n${fileInfo}` : fileInfo
      }

      const res = await whatsappService.sendMessage(displayClient.id, finalMessage)

      if (res.error) {
        throw new Error(res.error)
      }

      setInputMessage('')
      setSelectedAttachment(null)
      setAttachmentNote('')
      if (fileInputRef.current) fileInputRef.current.value = ''

      await loadClientData(displayClient.id)
      if (onClientUpdated) onClientUpdated()
      toast({
        title: 'Mensagem enviada no CRM',
        description: res.api_dispatched
          ? 'Mensagem despachada via WhatsApp Cloud API e registrada no histórico.'
          : 'Mensagem registrada no histórico do CRM e status atualizado.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar mensagem',
        description: err?.message || 'Falha na comunicação com o WhatsApp.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        toast({
          title: 'Arquivo muito grande',
          description: 'O tamanho máximo suportado é de 15MB.',
          variant: 'destructive',
        })
        return
      }
      setSelectedAttachment(file)
      toast({
        title: 'Arquivo anexado',
        description: `${file.name} pronto para envio.`,
      })
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return

    try {
      await tasksService.create({
        title: newTaskTitle.trim(),
        client_id: displayClient.id,
        assigned_to: user?.id,
        due_date: newTaskDueDate || new Date().toISOString().split('T')[0],
        status: 'pendente',
        priority: 'media',
      })
      setNewTaskTitle('')
      setNewTaskDueDate('')
      setIsAddingTask(false)
      const updatedTasks = await tasksService.getByClientId(displayClient.id)
      setTasks(updatedTasks)
      toast({ title: 'Tarefa adicionada' })
    } catch (err) {
      toast({
        title: 'Erro ao criar tarefa',
        variant: 'destructive',
      })
    }
  }

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    try {
      await tasksService.toggleStatus(
        taskId,
        currentStatus as 'pendente' | 'concluida' | 'cancelada',
      )
      const updatedTasks = await tasksService.getByClientId(displayClient.id)
      setTasks(updatedTasks)
    } catch (err) {
      console.error('Error toggling task:', err)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-11 w-11 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                {displayClient.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {displayClient.name}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {displayClient.stage}
                  </Badge>
                  {(displayClient.total_purchases !== undefined &&
                    displayClient.total_purchases > 0) ||
                  displayClient.has_returned === true ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 text-[10px] px-1.5 py-0 font-bold flex items-center gap-0.5">
                      <span>🔁 Recorrente</span>
                    </Badge>
                  ) : (
                    <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 text-[10px] px-1.5 py-0 font-bold flex items-center gap-0.5">
                      <span>🆕 Novo</span>
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-emerald-600" />
                    {displayClient.phone}
                  </span>
                  {displayClient.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {displayClient.email}
                    </span>
                  )}
                  {within24h ? (
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Janela 24h aberta
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Janela 24h fechada
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {displayClient.is_archived ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await dealsService.reopenClient(displayClient.id, 'Precisa responder')
                    toast({
                      title: 'Atendimento Reaberto!',
                      description: 'Cliente retornado ao funil ativo na etapa "Precisa responder".',
                    })
                    if (onClientUpdated) onClientUpdated()
                    loadClientData(displayClient.id)
                  }}
                  className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 font-semibold"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Reabrir Atendimento
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArchiveModalOpen(true)}
                  className="text-xs border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                >
                  <Archive className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Concluir e Arquivar
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setStartModalOpen(true)}
                className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Template Oficial
              </Button>

              <a
                href={getWhatsAppDirectUrl(displayClient.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title="Abrir WhatsApp Web"
              >
                <ExternalLink className="h-4 w-4" />
              </a>

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {/* LEFT SIDE: WhatsApp Chat Conversation */}
            <div className="md:col-span-7 flex flex-col h-full bg-[#efeae2]/40 dark:bg-slate-950/40">
              {/* Bloco Pedido em Andamento / Pedido Ativo */}
              {(() => {
                const activeProductionOrders = productionOrders.filter(
                  (o) => !o.is_completed && !o.is_archived,
                )
                if (activeProductionOrders.length === 0) return null

                return (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                        <Package className="h-4 w-4 text-amber-600" />
                        <span>PEDIDO EM ANDAMENTO ({activeProductionOrders.length})</span>
                      </div>
                      <Badge className="bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100 text-[10px] font-semibold border-amber-300">
                        Produção Ativa
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {activeProductionOrders.map((ord) => {
                        const repUser = ord.expand?.production_rep_id || ord.expand?.sales_rep_id
                        return (
                          <div
                            key={ord.id}
                            onClick={() => {
                              setSelectedOrderToEdit(ord)
                              setOrderModalOpen(true)
                            }}
                            className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-800/80 hover:border-amber-400 cursor-pointer transition-all text-xs shadow-xs"
                          >
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.2 rounded text-[11px]">
                                  {ord.order_number}
                                </span>
                                <span className="font-semibold text-slate-800 dark:text-slate-100">
                                  {ord.product}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200"
                              >
                                {ord.stage_name}
                              </Badge>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-amber-600" />
                                Previsão:{' '}
                                {ord.promised_deadline
                                  ? new Date(ord.promised_deadline).toLocaleDateString('pt-BR')
                                  : 'Sem prazo'}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3 text-slate-400" />
                                {repUser?.name || 'Sem responsável'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading ? (
                  <div className="flex justify-center items-center h-40 text-xs text-slate-500">
                    Carregando mensagens...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <div className="inline-flex p-3 rounded-full bg-emerald-100 text-emerald-700 mb-2">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Nenhuma mensagem trocada ainda
                    </h4>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                      Para iniciar o contato com o cliente via WhatsApp oficial, envie um Template
                      Aprovado pela Meta.
                    </p>
                    <Button
                      onClick={() => setStartModalOpen(true)}
                      size="sm"
                      className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      Iniciar com Template Oficial
                    </Button>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isInbound = msg.direction === 'inbound'
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-sm ${
                            isInbound
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-none border border-slate-100 dark:border-slate-700'
                              : 'bg-[#d9fdd3] dark:bg-emerald-950 text-slate-900 dark:text-emerald-50 rounded-tr-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.message_text}</p>
                          <div
                            className={`flex items-center justify-end space-x-1 mt-1 text-[10px] ${
                              isInbound
                                ? 'text-slate-400'
                                : 'text-emerald-800 dark:text-emerald-300'
                            }`}
                          >
                            <span>{formatDateTime(msg.created).split(' ')[1]}</span>
                            {!isInbound && (
                              <span>
                                {msg.status === 'read' ? (
                                  <CheckCheck className="h-3 w-3 text-blue-500" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 px-1">
                          {msg.sender_name || (isInbound ? displayClient.name : 'Você')}
                        </span>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* API Status / Fallback Notice Banner */}
              {apiStatus && !apiStatus.configured && (
                <div className="px-3.5 py-2 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-amber-800 dark:text-amber-300 gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      <strong>API Oficial não configurada:</strong> as mensagens enviadas ficam
                      registradas no CRM. Como alternativa temporária, use o WhatsApp Web.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={getWhatsAppDirectUrl(displayClient.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Abrir no WhatsApp Web
                    </a>
                  </div>
                </div>
              )}

              {/* 24-Hour Policy Warning Banner */}
              {!within24h && (
                <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 gap-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      Janela de 24h fechada. A Meta exige template aprovado para reabrir contato.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStartModalOpen(true)}
                    className="h-6 text-[10px] bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                  >
                    Usar Template
                  </Button>
                </div>
              )}

              {/* Quick Template Chips */}
              <div className="px-3 py-2 bg-white/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 overflow-x-auto flex gap-1.5 scrollbar-none items-center">
                <span className="text-[10px] font-semibold text-slate-400 uppercase shrink-0">
                  Respostas Rápidas:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setInputMessage(
                      `Olá, ${displayClient.name}! Seu orçamento para ${
                        displayClient.product_interest || 'impressão gráfica'
                      } está pronto${
                        canViewFinancials && displayClient.quote_value
                          ? ` no valor de ${formatCurrency(displayClient.quote_value)}`
                          : ''
                      }. Posso enviar os detalhes?`,
                    )
                  }
                  className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
                >
                  📄 Enviar Orçamento
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setInputMessage(
                      `Olá, ${displayClient.name}! Conseguimos aprovar a arte para envio à produção hoje?`,
                    )
                  }
                  className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
                >
                  🎨 Cobrar Aprovação de Arte
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setInputMessage(
                      `Olá, ${displayClient.name}! Seu material já foi impresso, refilado e está pronto para retirada/envio!`,
                    )
                  }
                  className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors"
                >
                  📦 Material Pronto
                </button>
              </div>

              {/* Selected Attachment Preview */}
              {selectedAttachment && (
                <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-t border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="truncate font-medium">{selectedAttachment.name}</span>
                    <span className="text-[10px] text-emerald-600/80">
                      ({(selectedAttachment.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAttachment(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="p-1 hover:bg-emerald-200/60 rounded text-emerald-700"
                    title="Remover anexo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Chat Input */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ai,.psd,.cdr"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 w-9 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  title="Anexar arquivo, prova ou documento"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={
                    within24h
                      ? 'Digite sua resposta para o cliente...'
                      : 'Janela fechada — use um Template Oficial ou envie texto...'
                  }
                  className="flex-1 text-xs bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
                <Button
                  type="submit"
                  disabled={(!inputMessage.trim() && !selectedAttachment) || sending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4 shrink-0 font-medium"
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Responder
                </Button>
              </form>
            </div>

            {/* RIGHT SIDE: Tabs between Info/Tasks vs History/Audit */}
            <div className="md:col-span-5 flex flex-col h-full bg-white dark:bg-slate-900 overflow-y-auto">
              {/* Tab switch header */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-1">
                <button
                  type="button"
                  onClick={() => setRightTab('info')}
                  className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    rightTab === 'info'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Info & Tarefas ({tasks.filter((t) => t.status === 'pendente').length})
                </button>

                <button
                  type="button"
                  onClick={() => setRightTab('relationship')}
                  className={`flex-1 py-1.5 px-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    rightTab === 'relationship'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Star className="h-3.5 w-3.5 text-amber-500" />
                  Relacionamento
                </button>

                <button
                  type="button"
                  onClick={() => setRightTab('orders')}
                  className={`flex-1 py-1.5 px-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    rightTab === 'orders'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Package className="h-3.5 w-3.5 text-emerald-600" />
                  Pedidos ({productionOrders.length})
                </button>

                <button
                  type="button"
                  onClick={() => setRightTab('history')}
                  className={`flex-1 py-1.5 px-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    rightTab === 'history'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  Histórico ({archivedDeals.length + stageTransitions.length})
                </button>
              </div>

              {/* TAB CONTENT: INFO & TASKS */}
              {rightTab === 'info' && (
                <div className="p-4 space-y-5">
                  {/* Deal info */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Informações do Atendimento
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Produto / Demanda</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {displayClient.product_interest || 'Não informado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Valor do Orçamento</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {displayClient.quote_value
                            ? formatCurrency(displayClient.quote_value)
                            : 'Não cotado'}
                        </span>
                      </div>
                    </div>

                    {displayClient.notes && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        <span className="font-semibold block text-[10px] text-slate-400 uppercase">
                          Observações de Produção:
                        </span>
                        {displayClient.notes}
                      </div>
                    )}
                  </div>

                  {/* Next Action Box */}
                  {displayClient.next_action && (
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          Próxima Ação Agendada
                        </span>
                        {displayClient.next_action_date && (
                          <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                            {formatDateTime(displayClient.next_action_date)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        {displayClient.next_action}
                      </p>
                    </div>
                  )}

                  {/* Follow-up Tasks */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Tarefas & Follow-up ({tasks.length})
                      </h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsAddingTask(!isAddingTask)}
                        className="text-xs text-emerald-600 hover:text-emerald-700 h-7 px-2"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {isAddingTask ? 'Cancelar' : 'Nova Tarefa'}
                      </Button>
                    </div>

                    {/* Inline Add Task Form */}
                    {isAddingTask && (
                      <form
                        onSubmit={handleCreateTask}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs"
                      >
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            Título da Tarefa *
                          </label>
                          <Input
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="Ex: Cobrar aprovação do layout"
                            className="text-xs h-8 bg-white dark:bg-slate-900"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            Data Limite
                          </label>
                          <Input
                            type="date"
                            value={newTaskDueDate}
                            onChange={(e) => setNewTaskDueDate(e.target.value)}
                            className="text-xs h-8 bg-white dark:bg-slate-900"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="submit"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 flex-1"
                          >
                            Salvar Tarefa
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setIsAddingTask(false)}
                            className="text-xs h-8"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Task list */}
                    <div className="space-y-2">
                      {tasks.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">
                          Nenhuma tarefa de follow-up cadastrada.
                        </p>
                      ) : (
                        tasks.map((t) => (
                          <div
                            key={t.id}
                            onClick={() => handleToggleTask(t.id, t.status)}
                            className={`p-2.5 rounded-xl border text-xs flex items-start gap-2.5 cursor-pointer transition-colors ${
                              t.status === 'concluida'
                                ? 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 line-through text-slate-400'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                            }`}
                          >
                            <div
                              className={`h-4 w-4 rounded mt-0.5 border flex items-center justify-center shrink-0 ${
                                t.status === 'concluida'
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {t.status === 'concluida' && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-900 dark:text-white leading-tight">
                                {t.title}
                              </p>
                              {t.due_date && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(t.due_date).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: RELACIONAMENTO & HISTÓRICO COMPLETO DO CLIENTE */}
              {rightTab === 'relationship' && (
                <div className="p-4 space-y-5">
                  {/* Relationship Status Badge */}
                  {(() => {
                    const status = displayClient.relationship_status || 'neutral'
                    const wonDeals = archivedDeals.filter((d) => d.result === 'Venda fechada')
                    const totalPurchases = displayClient.total_purchases || wonDeals.length
                    const totalValue =
                      displayClient.total_purchase_value ||
                      wonDeals.reduce((acc, d) => acc + (d.quote_value || 0), 0)

                    const completedEvals = evaluations.filter((e) => e.overall_rating > 0)
                    const avgRating =
                      completedEvals.length > 0
                        ? (
                            completedEvals.reduce((acc, e) => acc + e.overall_rating, 0) /
                            completedEvals.length
                          ).toFixed(1)
                        : null

                    const lastEval = completedEvals[0]
                    const complaints = evaluations.filter((e) => e.overall_rating <= 3)

                    // First & Last purchase dates
                    const sortedDates = wonDeals
                      .map((d) => d.closed_at)
                      .filter(Boolean)
                      .sort()
                    const firstDate = displayClient.first_purchase_date || sortedDates[0]
                    const lastDate =
                      displayClient.last_purchase_date || sortedDates[sortedDates.length - 1]

                    return (
                      <>
                        {/* Status banner */}
                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Status do Relacionamento
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={`font-bold text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                                  status === 'satisfied'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : status === 'dissatisfied'
                                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                      : status === 'in_recovery'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                        : status === 'recovered'
                                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                          : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {status === 'satisfied' && '⭐ Satisfeito'}
                                {status === 'dissatisfied' && '⚠️ Insatisfeito'}
                                {status === 'in_recovery' && '🔄 Em recuperação'}
                                {status === 'recovered' && '✓ Recuperado'}
                                {status === 'neutral' && '⚪ Neutro'}
                              </span>
                            </div>
                          </div>

                          {avgRating && (
                            <div className="text-right">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                Média de Notas
                              </span>
                              <div className="flex items-center justify-end gap-1 text-sm font-extrabold text-amber-500">
                                <span>{avgRating}</span>
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Customer purchase statistics (Single customer record) */}
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                              Total de Compras
                            </span>
                            <span className="text-base font-bold text-slate-900 dark:text-white">
                              {totalPurchases} {totalPurchases === 1 ? 'venda' : 'vendas'}
                            </span>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                              Valor Total Comprado
                            </span>
                            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(totalValue)}
                            </span>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                              Primeira Compra
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {firstDate ? new Date(firstDate).toLocaleDateString('pt-BR') : '-'}
                            </span>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                              Última Compra
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {lastDate ? new Date(lastDate).toLocaleDateString('pt-BR') : '-'}
                            </span>
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between">
                          <span className="text-slate-500 font-medium">
                            Quantidade de Atendimentos Totais:
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {archivedDeals.length + 1}
                          </span>
                        </div>

                        {/* Evaluations Received */}
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            Avaliações Recebidas ({completedEvals.length})
                          </h4>

                          {completedEvals.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-1">
                              Nenhuma avaliação de satisfação registrada para este cliente.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {completedEvals.map((ev) => (
                                <div
                                  key={ev.id}
                                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1 text-amber-400">
                                      {[1, 2, 3, 4, 5].map((s) => (
                                        <Star
                                          key={s}
                                          className={`h-3 w-3 ${
                                            s <= ev.overall_rating
                                              ? 'fill-amber-400 text-amber-400'
                                              : 'text-slate-200 dark:text-slate-700'
                                          }`}
                                        />
                                      ))}
                                      <span className="font-bold ml-1 text-slate-800 dark:text-slate-200 text-[11px]">
                                        {ev.overall_rating} Estrela(s)
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">
                                      {formatDateTime(ev.created)}
                                    </span>
                                  </div>

                                  {ev.order_number && (
                                    <div className="text-[10px] text-slate-500 font-mono">
                                      Pedido: <strong>{ev.order_number}</strong>
                                    </div>
                                  )}

                                  {ev.comment && (
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                                      "{ev.comment}"
                                    </p>
                                  )}

                                  {ev.overall_rating <= 3 && (
                                    <div className="pt-1 text-[10px] font-semibold">
                                      {ev.resolved ? (
                                        <span className="text-emerald-600">
                                          ✓ Reclamação solucionada
                                        </span>
                                      ) : (
                                        <span className="text-rose-600">
                                          ⚠️ Reclamação aguardando solução
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Post-Sales Routines History */}
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-emerald-600" />
                            Histórico de Pós-Vendas ({postSales.length})
                          </h4>

                          {postSales.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-1">
                              Nenhuma rotina de pós-venda registrada.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {postSales.map((ps) => (
                                <div
                                  key={ps.id}
                                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                      {ps.order_number ? `Pedido ${ps.order_number} • ` : ''}
                                      {new Date(ps.scheduled_date).toLocaleDateString('pt-BR')}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {ps.notes || 'Rotina automática'}
                                    </span>
                                  </div>
                                  <Badge
                                    variant={ps.status === 'completed' ? 'secondary' : 'outline'}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {ps.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Complaints & Problems Registered */}
                        {complaints.length > 0 && (
                          <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 text-xs space-y-2">
                            <h4 className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5 text-xs">
                              <AlertTriangle className="h-4 w-4 text-rose-600" />
                              Problemas / Reclamações Registradas ({complaints.length})
                            </h4>
                            <div className="space-y-1 text-[11px] text-rose-800 dark:text-rose-300">
                              {complaints.map((c) => (
                                <div key={c.id} className="p-2 rounded bg-white dark:bg-slate-900">
                                  <strong>{c.overall_rating}★</strong>:{' '}
                                  {c.comment || 'Sem comentário'} (
                                  {c.resolved ? 'Resolvido' : 'Pendente'})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}

              {/* TAB CONTENT: PEDIDOS DE PRODUÇÃO */}
              {rightTab === 'orders' && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Package className="h-4 w-4 text-emerald-600" />
                      Pedidos de Produção Vinculados ({productionOrders.length})
                    </h4>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedOrderToEdit(null)
                        setOrderModalOpen(true)
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Novo Pedido
                    </Button>
                  </div>

                  {productionOrders.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      Nenhum pedido de produção gerado para este cliente ainda.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {productionOrders.map((ord) => (
                        <div
                          key={ord.id}
                          onClick={() => {
                            setSelectedOrderToEdit(ord)
                            setOrderModalOpen(true)
                          }}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-xs space-y-2 cursor-pointer transition-all shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold font-mono text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border text-[11px]">
                                {ord.order_number}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200"
                              >
                                {ord.stage_name}
                              </Badge>
                            </div>
                            <span className="font-bold text-emerald-600">
                              {ord.total_value ? formatCurrency(ord.total_value) : 'R$ 0,00'}
                            </span>
                          </div>

                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white block">
                              {ord.product}
                            </span>
                            {ord.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {ord.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                            <span>
                              Prazo:{' '}
                              {ord.promised_deadline
                                ? new Date(ord.promised_deadline).toLocaleDateString('pt-BR')
                                : 'Sem prazo'}
                            </span>
                            <a
                              href={`${window.location.origin}/acompanhar/${ord.tracking_token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-emerald-600 hover:underline flex items-center gap-0.5 font-semibold"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Rastreio Público
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB CONTENT: HISTÓRICO DE ATENDIMENTOS E MUDANÇAS DE ETAPA */}
              {rightTab === 'history' && (
                <div className="p-4 space-y-6">
                  {/* Past Finished/Archived Deals Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Archive className="h-4 w-4 text-emerald-600" />
                      Atendimentos Encerrados Anteriores ({archivedDeals.length})
                    </h4>

                    {archivedDeals.length === 0 ? (
                      <div className="p-3.5 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                        Nenhum atendimento anterior arquivado.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {archivedDeals.map((deal) => {
                          const isWon = deal.result === 'Venda fechada'
                          return (
                            <div
                              key={deal.id}
                              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1 ${
                                    isWon
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  }`}
                                >
                                  {isWon ? (
                                    <CheckCircle2 className="h-3 w-3 inline" />
                                  ) : (
                                    <XCircle className="h-3 w-3 inline" />
                                  )}
                                  {deal.result}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {formatDateTime(deal.closed_at)}
                                </span>
                              </div>

                              {deal.product_interest && (
                                <div className="text-slate-700 dark:text-slate-300">
                                  <strong>Produto:</strong> {deal.product_interest}
                                </div>
                              )}

                              {deal.quote_value ? (
                                <div className="text-emerald-600 font-bold">
                                  Valor: {formatCurrency(deal.quote_value)}
                                </div>
                              ) : null}

                              {!isWon && deal.loss_reason && (
                                <div className="text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 p-1.5 rounded text-[11px]">
                                  <strong>Motivo da perda:</strong> {deal.loss_reason}
                                </div>
                              )}

                              {deal.final_notes && (
                                <p className="text-[11px] text-slate-500 italic">
                                  "{deal.final_notes}"
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Audit: Stage Transitions Timeline */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <GitCommit className="h-4 w-4 text-blue-600" />
                      Histórico de Mudança de Etapas
                    </h4>

                    {stageTransitions.length === 0 ? (
                      <div className="p-3.5 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                        Nenhuma mudança registrada.
                      </div>
                    ) : (
                      <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-3">
                        {stageTransitions.map((trans) => (
                          <div key={trans.id} className="relative">
                            <div className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-white dark:ring-slate-900" />
                            <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {trans.from_stage ? `${trans.from_stage} → ` : ''}
                                  <span className="text-emerald-600">{trans.to_stage}</span>
                                </span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                    trans.change_type === 'automatic'
                                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {trans.change_type === 'automatic'
                                    ? '⚡ Automático'
                                    : '👤 Manual'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>{trans.user_name || 'Sistema'}</span>
                                <span>{formatDateTime(trans.created)}</span>
                              </div>

                              {trans.notes && (
                                <p className="text-[11px] text-slate-500 mt-0.5">{trans.notes}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Start Official WhatsApp Template Modal */}
      <StartWhatsAppConversationModal
        isOpen={startModalOpen}
        onClose={() => setStartModalOpen(false)}
        client={displayClient}
        onSuccess={() => {
          setStartModalOpen(false)
          loadClientData(displayClient.id)
          if (onClientUpdated) onClientUpdated()
        }}
      />

      {/* Complete and Archive Modal */}
      <CompleteAndArchiveModal
        isOpen={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        client={displayClient}
        onSuccess={() => {
          if (onClientUpdated) onClientUpdated()
          loadClientData(displayClient.id)
        }}
      />

      {/* Production Order Create/Edit from Drawer */}
      <ProductionOrderModal
        isOpen={orderModalOpen}
        onClose={() => {
          setOrderModalOpen(false)
          setSelectedOrderToEdit(null)
        }}
        onSaved={() => {
          loadClientData(displayClient.id)
          if (onClientUpdated) onClientUpdated()
        }}
        orderToEdit={selectedOrderToEdit}
        initialClientId={displayClient.id}
        prefillData={{
          clientId: displayClient.id,
          clientName: displayClient.name,
          clientPhone: displayClient.phone,
          clientEmail: displayClient.email,
          product: displayClient.product_interest || '',
          quoteValue: displayClient.quote_value,
          notes: displayClient.notes,
        }}
      />
    </>
  )
}
