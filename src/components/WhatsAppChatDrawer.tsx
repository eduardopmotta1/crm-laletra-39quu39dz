import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  MessageSquare,
  Send,
  ExternalLink,
  Clock,
  Phone,
  Mail,
  DollarSign,
  AlertTriangle,
  User,
  Plus,
  CheckCircle2,
  Calendar,
  Sparkles,
  FileText,
  ShieldAlert,
} from 'lucide-react'
import type { Client, Message, Task, SlaConfig } from '@/types/crm'
import { isWithin24HourWindow } from '@/types/crm'
import { whatsappService } from '@/services/whatsapp'
import { tasksService } from '@/services/tasks'
import { clientsService } from '@/services/clients'
import { calculateSlaInfo, formatCurrency, formatDateTime, getWhatsAppDirectUrl } from '@/lib/sla'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/context/AuthContext'
import StartWhatsAppConversationModal from './StartWhatsAppConversationModal'

interface WhatsAppChatDrawerProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  slaConfig: SlaConfig
  onClientUpdated?: (updated: Client) => void
}

export default function WhatsAppChatDrawer({
  isOpen,
  onClose,
  client,
  slaConfig,
  onClientUpdated,
}: WhatsAppChatDrawerProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [currentClient, setCurrentClient] = useState<Client | null>(client)

  // New task inline
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [isAddingTask, setIsAddingTask] = useState(false)

  // Template Start Modal trigger
  const [startModalOpen, setStartModalOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrentClient(client)
    if (isOpen && client) {
      loadClientData(client.id)
    }
  }, [isOpen, client])

  const loadClientData = async (clientId: string) => {
    setLoading(true)
    try {
      const [msgList, taskList, freshClient] = await Promise.all([
        whatsappService.getMessages(clientId),
        tasksService.getByClientId(clientId),
        clientsService.getById(clientId),
      ])
      setMessages(msgList)
      setTasks(taskList)
      if (freshClient) {
        setCurrentClient(freshClient)
      }
    } catch (err) {
      console.error('Error loading drawer data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputMessage.trim() || !currentClient) return

    const textToSend = inputMessage.trim()
    setInputMessage('')
    setSending(true)

    try {
      const result = await whatsappService.sendMessage(currentClient.id, textToSend)
      if (result.success) {
        toast({
          title: 'Mensagem Enviada!',
          description: result.api_dispatched
            ? 'Enviada diretamente via WhatsApp Cloud API.'
            : 'Registrada e vinculada ao histórico do cliente.',
          variant: 'default',
        })
        // Reload messages and client to get updated SLA and stage
        await loadClientData(currentClient.id)
        const fresh = await clientsService.getById(currentClient.id)
        if (fresh && onClientUpdated) {
          onClientUpdated(fresh)
        }
      } else {
        toast({
          title: 'Erro no envio',
          description: result.error || 'Não foi possível despachar a mensagem.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Falha ao enviar mensagem.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim() || !currentClient) return

    try {
      const created = await tasksService.create({
        title: newTaskTitle.trim(),
        client_id: currentClient.id,
        due_date: newTaskDueDate
          ? new Date(newTaskDueDate).toISOString()
          : new Date().toISOString(),
        status: 'pendente',
        priority: 'alta',
        assigned_to: user?.id,
      })
      setTasks([...tasks, created])
      setNewTaskTitle('')
      setNewTaskDueDate('')
      setIsAddingTask(false)
      toast({
        title: 'Tarefa criada',
        description: 'Follow-up adicionado para este cliente.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar a tarefa.',
        variant: 'destructive',
      })
    }
  }

  const handleToggleTask = async (
    taskId: string,
    currentStatus: 'pendente' | 'concluida' | 'cancelada',
  ) => {
    try {
      const updated = await tasksService.toggleStatus(taskId, currentStatus)
      setTasks(tasks.map((t) => (t.id === taskId ? updated : t)))
    } catch (err) {
      console.error('Error toggling task:', err)
    }
  }

  // Quick reply snippets for graphic shop
  const quickTemplates = [
    'Olá! Seu orçamento da gráfica já está pronto. Segue a proposta!',
    'Poderia me enviar o arquivo em PDF ou Illustrator com as cores em CMYK?',
    'A prova digital foi gerada! Podemos rodar a impressão?',
    'Seu pedido está pronto para retirada ou envio com motoboy!',
  ]

  if (!currentClient) return null

  const slaInfo = calculateSlaInfo(
    currentClient.last_message_at,
    currentClient.last_message_direction,
    currentClient.stage,
    slaConfig,
  )

  const within24h = isWithin24HourWindow(
    currentClient.last_message_at,
    currentClient.last_message_direction,
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-slate-900">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-11 w-11 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
              {currentClient.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 dark:text-white text-base">
                  {currentClient.name}
                </h2>
                <Badge className={slaInfo.colorBadgeClass}>{slaInfo.label}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  {currentClient.phone}
                </span>
                {currentClient.quote_value ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(currentClient.quote_value)}
                  </span>
                ) : null}
                <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-medium">
                  {currentClient.stage}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setStartModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 shadow-sm flex items-center gap-1.5 font-semibold"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Iniciar conversa no WhatsApp
            </Button>
            <a
              href={getWhatsAppDirectUrl(currentClient.phone, inputMessage || undefined)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
              title="Abrir diretamente no WhatsApp Web"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              WhatsApp Web
            </a>
          </div>
        </div>

        {/* Content Body: 2 columns on desktop (Chat + Client Info & Tasks) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          {/* Left Column: WhatsApp Messages & Live Composer (md:col-span-7) */}
          <div className="md:col-span-7 flex flex-col h-full bg-[#efeae2]/40 dark:bg-slate-950/40">
            {/* Message History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="flex justify-center items-center h-40 text-xs text-slate-500">
                  Carregando mensagens...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="inline-flex p-3 rounded-full bg-emerald-100 text-emerald-700 mb-2">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Nenhuma mensagem anterior no histórico
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Última mensagem registrada: "{currentClient.last_message_text || 'Sem registro'}
                    "
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isOut = m.direction === 'outbound'
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
                          isOut
                            ? 'bg-emerald-600 text-white rounded-br-none'
                            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none border border-slate-100 dark:border-slate-700'
                        }`}
                      >
                        <p className="leading-relaxed whitespace-pre-wrap">{m.message_text}</p>
                        <div
                          className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                            isOut ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          <span>{formatDateTime(m.created)}</span>
                          {isOut && <span className="font-bold">✓✓</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 px-1 mt-0.5">
                        {isOut ? 'Você (Gráfica)' : m.sender_name || currentClient.name}
                      </span>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 24-hour window status alert banner */}
            {!within24h && (
              <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 gap-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Fora da janela de 24h:</strong> Envie um template aprovado para reabrir
                    a conversa.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStartModalOpen(true)}
                  className="h-7 text-xs bg-white dark:bg-slate-900 border-amber-300 text-amber-900 dark:text-amber-200 font-semibold hover:bg-amber-100"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Escolher Template
                </Button>
              </div>
            )}

            {/* Quick response snippets */}
            <div className="px-3 py-2 bg-white/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 overflow-x-auto flex gap-1.5 scrollbar-none items-center">
              <span className="text-[10px] text-slate-400 font-medium shrink-0">
                Respostas rápidas:
              </span>
              {quickTemplates.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setInputMessage(tpl)}
                  className="whitespace-nowrap text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  ⚡ {tpl.slice(0, 28)}...
                </button>
              ))}
            </div>

            {/* Send Box */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
            >
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  within24h
                    ? 'Escreva a resposta para o cliente no WhatsApp...'
                    : 'Dentro da janela 24h: texto livre. Fora: use template aprovado.'
                }
                className="flex-1 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <Button
                type="submit"
                disabled={sending || !inputMessage.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 px-4"
              >
                {sending ? (
                  <Clock className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1.5" />
                    Enviar
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Right Column: Customer Graphic Specifications & Tasks (md:col-span-5) */}
          <div className="md:col-span-5 flex flex-col h-full bg-white dark:bg-slate-900 overflow-y-auto p-4 space-y-5">
            {/* Product Interest & Graphic Specs */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Produto & Detalhes Gráficos
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {currentClient.product_interest || 'Nenhum produto especificado ainda'}
              </p>
              {currentClient.notes && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Notas: </span>
                  {currentClient.notes}
                </div>
              )}
            </div>

            {/* Next Action Box */}
            {currentClient.next_action && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Próxima Ação Programada
                </span>
                <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                  {currentClient.next_action}
                </p>
                {currentClient.next_action_date && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Data: {formatDateTime(currentClient.next_action_date)}
                  </p>
                )}
              </div>
            )}

            {/* Follow-up Tasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Tarefas de Follow-up ({tasks.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingTask(!isAddingTask)}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </button>
              </div>

              {/* Add task form */}
              {isAddingTask && (
                <form
                  onSubmit={handleCreateTask}
                  className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2 text-xs"
                >
                  <Input
                    placeholder="Título da tarefa (ex: Enviar mockup 3D)"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-slate-800"
                    required
                  />
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-slate-800 flex-1"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                    >
                      Salvar
                    </Button>
                  </div>
                </form>
              )}

              {/* Task list */}
              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">
                    Nenhuma tarefa de follow-up criada para este cliente.
                  </p>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={task.status === 'concluida'}
                        onChange={() => handleToggleTask(task.id, task.status)}
                        className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-medium ${
                            task.status === 'concluida'
                              ? 'line-through text-slate-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {task.title}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Vencimento: {formatDateTime(task.due_date)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Start WhatsApp Conversation Modal */}
      <StartWhatsAppConversationModal
        isOpen={startModalOpen}
        onClose={() => setStartModalOpen(false)}
        client={currentClient}
        onSuccess={(fresh) => {
          setCurrentClient(fresh)
          if (onClientUpdated) {
            onClientUpdated(fresh)
          }
          loadClientData(fresh.id)
        }}
      />
    </Dialog>
  )
}
