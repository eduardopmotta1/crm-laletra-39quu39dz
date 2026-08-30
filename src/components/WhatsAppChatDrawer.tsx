import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRealtime } from '@/hooks/use-realtime'
import { useNavigate } from 'react-router-dom'
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
  Calculator,
  FileText,
  Eye,
  Edit3,
  ChevronDown,
  ChevronRight,
  Trash2,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import type {
  Client,
  Attendance,
  Message,
  Task,
  SlaConfig,
  ArchivedDeal,
  StageTransition,
  Evaluation,
  PostSale,
  ProductionOrder,
} from '@/types/crm'
import type { Quote } from '@/types/quotes'
import { isWithin24HourWindow } from '@/types/crm'
import { whatsappService } from '@/services/whatsapp'
import { tasksService } from '@/services/tasks'
import { clientsService } from '@/services/clients'
import { dealsService } from '@/services/deals'
import { evaluationsService } from '@/services/evaluations'
import { postSalesService } from '@/services/postSales'
import { productionService } from '@/services/production'
import { quotesService } from '@/services/quotes'
import ProductionOrderModal from './ProductionOrderModal'
import {
  calculateSlaInfo,
  formatCurrency,
  formatDateTime,
  formatQuoteWhatsAppMessage,
  getWhatsAppDirectUrl,
} from '@/lib/sla'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/context/AuthContext'
import StartWhatsAppConversationModal from './StartWhatsAppConversationModal'
import CompleteAndArchiveModal from './CompleteAndArchiveModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
} from '@/components/ui/dialog'
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

interface WhatsAppChatDrawerProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  activeAttendance?: Attendance | null
  slaConfig?: SlaConfig
  onClientUpdated?: () => void
}
export default function WhatsAppChatDrawer({
  isOpen,
  onClose,
  client,
  activeAttendance,
  slaConfig = { urgentMinutes: 1440, warningMinutes: 720, noticeMinutes: 360 },
  onClientUpdated,
}: WhatsAppChatDrawerProps) {
  const navigate = useNavigate()
  const { user, isAdmin, hasPermission, canViewFinancials } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [archivedDeals, setArchivedDeals] = useState<ArchivedDeal[]>([])
  const [stageTransitions, setStageTransitions] = useState<StageTransition[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [postSales, setPostSales] = useState<PostSale[]>([])
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([])
  const [attendanceQuotes, setAttendanceQuotes] = useState<Quote[]>([])
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

  // Quote View Details Modal
  const [selectedQuoteToView, setSelectedQuoteToView] = useState<Quote | null>(null)
  const [quoteDetailsOpen, setQuoteDetailsOpen] = useState(false)

  // Quote Delete Confirmation Dialog
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null)
  const [deleteQuoteDialogOpen, setDeleteQuoteDialogOpen] = useState(false)
  const [isDeletingQuote, setIsDeletingQuote] = useState(false)

  // Quote Approve Modal State
  const [quoteToApprove, setQuoteToApprove] = useState<Quote | null>(null)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [isApprovingQuote, setIsApprovingQuote] = useState(false)

  // Quote Reject Modal State
  const [quoteToReject, setQuoteToReject] = useState<Quote | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState<string>('')
  const [rejectNotes, setRejectNotes] = useState<string>('')
  const [isRejectingQuote, setIsRejectingQuote] = useState(false)

  // Send Quote Modal
  const [selectedQuoteToSend, setSelectedQuoteToSend] = useState<Quote | null>(null)
  const [sendQuoteModalOpen, setSendQuoteModalOpen] = useState(false)
  const [isSendingQuote, setIsSendingQuote] = useState(false)
  const [startModalInitialQuote, setStartModalInitialQuote] = useState<Quote | null>(null)
  const [startModalInitialTemplateName, setStartModalInitialTemplateName] = useState<
    string | undefined
  >(undefined)

  // New task inline
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [isAddingTask, setIsAddingTask] = useState(false)

  // Modals state
  const [startModalOpen, setStartModalOpen] = useState(false)
  const [archiveModalOpen, setArchiveModalOpen] = useState(false)

  // Collapsible sections state
  const [quotesExpanded, setQuotesExpanded] = useState(true)
  const [ordersExpanded, setOrdersExpanded] = useState(true)

  // Right sidebar tab
  const [rightTab, setRightTab] = useState<'info' | 'relationship' | 'orders' | 'history'>('info')

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Effective client to reference
  const displayClient = currentClient || client
  const activeClientId = displayClient?.id

  // Track scroll state and navigation triggers
  const isNearBottomRef = useRef<boolean>(true)
  const previousMessagesCountRef = useRef<number>(0)
  const lastConversationKeyRef = useRef<string | null>(null)
  const shouldAutoScrollNextRef = useRef<boolean>(false)

  // Function to check if user is near bottom of the message container (~150px threshold)
  const checkIfNearBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true
    const threshold = 150
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    return distanceToBottom <= threshold
  }, [])

  const handleScroll = useCallback(() => {
    isNearBottomRef.current = checkIfNearBottom()
  }, [checkIfNearBottom])

  // Scroll smoothly or immediately to the bottom of the messages container
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = messagesContainerRef.current
    if (!container) return
    // Scroll container specifically to prevent entire page/drawer scrolling
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    })
  }, [])

  // ESC key handler to close drawer (only if no nested modals/dialogs are open)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If any internal dialog/modal is open, let that dialog handle the ESC key
        if (
          startModalOpen ||
          archiveModalOpen ||
          orderModalOpen ||
          quoteDetailsOpen ||
          deleteQuoteDialogOpen ||
          sendQuoteModalOpen ||
          approveDialogOpen ||
          rejectDialogOpen
        ) {
          return
        }
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    startModalOpen,
    archiveModalOpen,
    orderModalOpen,
    quoteDetailsOpen,
    deleteQuoteDialogOpen,
    sendQuoteModalOpen,
    onClose,
  ])

  useEffect(() => {
    if (client && isOpen) {
      setCurrentClient(client)
      loadClientData(client.id, activeAttendance?.id)
    }
  }, [client, isOpen, activeAttendance?.id])

  // Real-time listener for incoming/updated messages and client events while drawer is open
  useEffect(() => {
    if (!isOpen || !activeClientId) return

    const handleWindowUpdate = () => {
      // Reload client and messages when simulation or external event triggers
      loadClientData(activeClientId, activeAttendance?.id)
    }

    window.addEventListener('crm-client-updated', handleWindowUpdate)
    return () => window.removeEventListener('crm-client-updated', handleWindowUpdate)
  }, [isOpen, activeClientId, activeAttendance?.id])

  // Real-time listener for incoming/created messages in PocketBase collection
  useRealtime(
    'messages',
    (data: any) => {
      if (data.action === 'create' && activeClientId && data.record?.client_id === activeClientId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.record.id)) return prev
          return [...prev, data.record as Message]
        })
      }
    },
    isOpen && !!activeClientId,
  )

  // Handle auto-scroll on messages change, conversation switch, or send
  useEffect(() => {
    if (!isOpen) return

    const currentKey = `${activeClientId || ''}_${activeAttendance?.id || ''}`
    const isNewConversation = lastConversationKeyRef.current !== currentKey
    const prevCount = previousMessagesCountRef.current
    const currentCount = messages.length
    const hasNewMessages = currentCount > prevCount

    if (isNewConversation) {
      // Switched conversation or opened drawer: scroll to bottom immediately (instant)
      lastConversationKeyRef.current = currentKey
      previousMessagesCountRef.current = currentCount
      isNearBottomRef.current = true
      shouldAutoScrollNextRef.current = false

      // Use a short timeout to ensure DOM has rendered messages
      const timer = setTimeout(() => {
        scrollToBottom('auto')
      }, 50)
      return () => clearTimeout(timer)
    }

    // Existing conversation: check if user just sent a message or received new message
    if (shouldAutoScrollNextRef.current) {
      // Sent message: always scroll smoothly to bottom
      shouldAutoScrollNextRef.current = false
      previousMessagesCountRef.current = currentCount
      const timer = setTimeout(() => {
        scrollToBottom('smooth')
      }, 50)
      return () => clearTimeout(timer)
    }

    if (hasNewMessages) {
      // New incoming message: only scroll if user is near bottom
      if (isNearBottomRef.current) {
        const timer = setTimeout(() => {
          scrollToBottom('smooth')
        }, 50)
        previousMessagesCountRef.current = currentCount
        return () => clearTimeout(timer)
      }
    }

    previousMessagesCountRef.current = currentCount
  }, [messages, isOpen, activeClientId, activeAttendance?.id, scrollToBottom])

  const loadClientData = async (clientId: string, attendanceId?: string) => {
    setLoading(true)
    try {
      const targetAttId = attendanceId || activeAttendance?.id

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
        quotesList,
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
        targetAttId ? quotesService.getByAttendanceId(targetAttId) : Promise.resolve([]),
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
      setAttendanceQuotes(quotesList)
    } catch (err) {
      console.error('Error loading chat drawer data:', err)
    } finally {
      setLoading(false)
    }
  }

  const getQuoteStatusBadge = (status: Quote['status']) => {
    switch (status) {
      case 'aprovado':
        return (
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] px-1.5 py-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Aprovado
          </Badge>
        )
      case 'enviado':
        return (
          <Badge className="bg-blue-600 text-white hover:bg-blue-700 text-[10px] px-1.5 py-0">
            <Clock className="h-3 w-3 mr-1" />
            Enviado
          </Badge>
        )
      case 'recusado':
        return (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            <AlertCircle className="h-3 w-3 mr-1" />
            Recusado
          </Badge>
        )
      case 'expirado':
        return (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Expirado
          </Badge>
        )
      default:
        return (
          <Badge
            variant="outline"
            className="text-slate-600 dark:text-slate-400 text-[10px] px-1.5 py-0"
          >
            Rascunho
          </Badge>
        )
    }
  }

  if (!isOpen || !client) return null

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

      shouldAutoScrollNextRef.current = true
      await loadClientData(displayClient.id, activeAttendance?.id)
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

    if (!activeAttendance) {
      toast({
        title: 'Atendimento não encontrado',
        description: 'Não há atendimento ativo vinculado para associar esta tarefa comercial.',
        variant: 'destructive',
      })
      return
    }

    try {
      await tasksService.create({
        title: newTaskTitle.trim(),
        client_id: displayClient.id,
        attendance_id: activeAttendance.id,
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

  const handleOpenApproveQuote = (quote: Quote) => {
    setQuoteToApprove(quote)
    setApproveDialogOpen(true)
  }

  const handleConfirmApproveQuote = async () => {
    if (!quoteToApprove || isApprovingQuote) return
    setIsApprovingQuote(true)
    const quoteCode = quoteToApprove.code
    const quoteId = quoteToApprove.id

    try {
      const updated = await quotesService.approve(quoteId)

      // Update state in list and view modal
      setAttendanceQuotes((prev) => prev.map((q) => (q.id === quoteId ? updated : q)))
      if (selectedQuoteToView?.id === quoteId) {
        setSelectedQuoteToView(updated)
      }

      toast({
        title: 'Orçamento Aprovado!',
        description: `O orçamento ${quoteCode} foi aprovado com sucesso.`,
      })

      setApproveDialogOpen(false)
      setQuoteToApprove(null)
    } catch (err: any) {
      console.error('Error approving quote:', err)
      toast({
        title: 'Erro ao aprovar orçamento',
        description: err?.message || 'Não foi possível aprovar a proposta.',
        variant: 'destructive',
      })
    } finally {
      setIsApprovingQuote(false)
    }
  }

  const handleOpenRejectQuote = (quote: Quote) => {
    setQuoteToReject(quote)
    setRejectReason('')
    setRejectNotes('')
    setRejectDialogOpen(true)
  }

  const handleConfirmRejectQuote = async () => {
    if (!quoteToReject || isRejectingQuote) return
    setIsRejectingQuote(true)
    const quoteCode = quoteToReject.code
    const quoteId = quoteToReject.id

    try {
      const updated = await quotesService.reject(
        quoteId,
        rejectReason || undefined,
        rejectNotes.trim() || undefined,
      )

      // Update state in list and view modal
      setAttendanceQuotes((prev) => prev.map((q) => (q.id === quoteId ? updated : q)))
      if (selectedQuoteToView?.id === quoteId) {
        setSelectedQuoteToView(updated)
      }

      toast({
        title: 'Orçamento Recusado',
        description: `O orçamento ${quoteCode} foi registrado como recusado.`,
      })

      setRejectDialogOpen(false)
      setQuoteToReject(null)
      setRejectReason('')
      setRejectNotes('')
    } catch (err: any) {
      console.error('Error rejecting quote:', err)
      toast({
        title: 'Erro ao recusar orçamento',
        description: err?.message || 'Não foi possível recusar a proposta.',
        variant: 'destructive',
      })
    } finally {
      setIsRejectingQuote(false)
    }
  }

  const handleOpenDeleteQuote = (quote: Quote) => {
    setQuoteToDelete(quote)
    setDeleteQuoteDialogOpen(true)
  }

  const handleConfirmDeleteQuote = async () => {
    if (!quoteToDelete || isDeletingQuote) return

    setIsDeletingQuote(true)
    const quoteCode = quoteToDelete.code
    const quoteId = quoteToDelete.id

    try {
      await quotesService.delete(quoteId)

      // Only on success: update state, list and counter
      setAttendanceQuotes((prev) => prev.filter((q) => q.id !== quoteId))
      if (selectedQuoteToView?.id === quoteId) {
        setQuoteDetailsOpen(false)
        setSelectedQuoteToView(null)
      }

      toast({
        title: 'Orçamento excluído',
        description: `Orçamento ${quoteCode} excluído com sucesso.`,
      })

      setDeleteQuoteDialogOpen(false)
      setQuoteToDelete(null)
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
      setIsDeletingQuote(false)
    }
  }

  const handleOpenSendQuote = (quote: Quote) => {
    setSelectedQuoteToSend(quote)
    setSendQuoteModalOpen(true)
  }

  const handleConfirmSendQuote = async () => {
    if (!selectedQuoteToSend || isSendingQuote || !displayClient) return

    // Verify 24h window
    if (!within24h) {
      toast({
        title: 'Janela de 24h fechada',
        description: 'Para enviar este orçamento é necessário utilizar um Template Oficial.',
        variant: 'destructive',
      })
      return
    }

    setIsSendingQuote(true)
    try {
      const formattedText = formatQuoteWhatsAppMessage(selectedQuoteToSend, displayClient.name)

      // Send the WhatsApp message using existing mechanism
      const res = await whatsappService.sendMessage(displayClient.id, formattedText)

      if (res.error) {
        throw new Error(res.error)
      }

      // Update quote status to "enviado" using UPDATE/PATCH on the same quote.id
      await quotesService.updateStatus(selectedQuoteToSend.id, 'enviado')

      toast({
        title: 'Orçamento enviado!',
        description: `Orçamento ${selectedQuoteToSend.code} enviado para ${displayClient.name} via WhatsApp.`,
      })

      setSendQuoteModalOpen(false)
      setSelectedQuoteToSend(null)

      // Trigger auto-scroll and refresh client & messages
      shouldAutoScrollNextRef.current = true
      await loadClientData(displayClient.id, activeAttendance?.id)
      if (onClientUpdated) onClientUpdated()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar orçamento',
        description: err?.message || 'Não foi possível enviar o orçamento pelo WhatsApp.',
        variant: 'destructive',
      })
    } finally {
      setIsSendingQuote(false)
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
      <div
        className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose()
          }
        }}
      >
        <div
          className="w-full max-w-4xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300 cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                {displayClient.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base truncate max-w-[200px] sm:max-w-xs">
                    {displayClient.name}
                  </h3>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {activeAttendance?.stage || displayClient.stage}
                  </Badge>
                  {(displayClient.total_purchases !== undefined &&
                    displayClient.total_purchases > 0) ||
                  displayClient.has_returned === true ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 text-[10px] px-1.5 py-0 font-bold flex items-center gap-0.5 shrink-0">
                      <span>🔁 Recorrente</span>
                    </Badge>
                  ) : (
                    <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 text-[10px] px-1.5 py-0 font-bold flex items-center gap-0.5 shrink-0">
                      <span>🆕 Novo</span>
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1 shrink-0">
                    <Phone className="h-3 w-3 text-emerald-600 shrink-0" />
                    {displayClient.phone}
                  </span>
                  {displayClient.email && (
                    <span className="hidden md:flex items-center gap-1 truncate max-w-[180px]">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{displayClient.email}</span>
                    </span>
                  )}
                  {within24h ? (
                    <span className="flex items-center gap-1 text-emerald-600 font-medium shrink-0">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      Janela 24h aberta
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 font-medium shrink-0">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Janela 24h fechada
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {activeAttendance?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const clientId = displayClient.id
                    const attId = activeAttendance.id
                    navigate(
                      `/orcamentos/novo?attendance_id=${encodeURIComponent(attId)}&client_id=${encodeURIComponent(clientId)}`,
                    )
                  }}
                  className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 font-semibold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  <span className="hidden sm:inline">Novo orçamento</span>
                  <span className="sm:hidden">Orçamento</span>
                </Button>
              )}

              {displayClient.is_archived ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await dealsService.reopenClient(
                      displayClient.id,
                      'Precisa responder',
                      activeAttendance?.id,
                    )
                    toast({
                      title: 'Atendimento Reaberto!',
                      description: 'Cliente retornado ao funil ativo na etapa "Precisa responder".',
                    })
                    if (onClientUpdated) onClientUpdated()
                    loadClientData(displayClient.id)
                  }}
                  className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 font-semibold shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  <span className="hidden sm:inline">Reabrir Atendimento</span>
                  <span className="sm:hidden">Reabrir</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArchiveModalOpen(true)}
                  className="text-xs border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 shrink-0"
                >
                  <Archive className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  <span className="hidden md:inline">Concluir e Arquivar</span>
                  <span className="md:hidden">Arquivar</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartModalInitialQuote(null)
                  setStartModalInitialTemplateName(undefined)
                  setStartModalOpen(true)
                }}
                className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Template Oficial</span>
                <span className="sm:hidden">Template</span>
              </Button>

              <a
                href={getWhatsAppDirectUrl(displayClient.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                title="Abrir WhatsApp Web"
              >
                <ExternalLink className="h-4 w-4" />
              </a>

              <button
                type="button"
                onClick={onClose}
                title="Fechar conversa"
                aria-label="Fechar conversa"
                className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
            {/* LEFT SIDE: WhatsApp Chat Conversation */}
            <div className="md:col-span-7 flex flex-col h-full min-h-0 overflow-hidden bg-[#efeae2]/40 dark:bg-slate-950/40">
              {/* Bloco Orçamento Vinculado ao Atendimento Atual */}
              {attendanceQuotes.length > 0 && (
                <div className="shrink-0 px-3 py-2 bg-emerald-50/90 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60">
                  <button
                    type="button"
                    onClick={() => setQuotesExpanded(!quotesExpanded)}
                    className="w-full flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200 hover:opacity-80 transition-opacity"
                    title={quotesExpanded ? 'Recolher orçamentos' : 'Expandir orçamentos'}
                  >
                    <div className="flex items-center gap-1.5">
                      {quotesExpanded ? (
                        <ChevronDown className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                      )}
                      <Calculator className="h-4 w-4 text-emerald-600" />
                      <span>
                        ORÇAMENTO{attendanceQuotes.length > 1 ? 'S' : ''} VINCULADO
                        {attendanceQuotes.length > 1 ? 'S' : ''} ({attendanceQuotes.length})
                      </span>
                    </div>
                    <Badge className="bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100 text-[10px] font-semibold border-emerald-300">
                      Atendimento Atual
                    </Badge>
                  </button>

                  {quotesExpanded && (
                    <div className="mt-2 space-y-1.5 max-h-32 sm:max-h-40 overflow-y-auto pr-0.5">
                      {attendanceQuotes.map((quote) => (
                        <div
                          key={quote.id}
                          className="p-1.5 px-2 rounded-md bg-white/95 dark:bg-slate-900/95 border border-emerald-200 dark:border-emerald-800/80 hover:border-emerald-400 transition-all text-xs shadow-xs flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="font-mono font-bold text-emerald-900 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded text-[11px] border border-emerald-200 dark:border-emerald-800 shrink-0">
                              {quote.code}
                            </span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs shrink-0">
                              {formatCurrency(quote.final_total ?? quote.total_sale ?? 0)}
                            </span>
                            <div className="shrink-0">{getQuoteStatusBadge(quote.status)}</div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-auto">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedQuoteToView(quote)
                                setQuoteDetailsOpen(true)
                              }}
                              className="h-6 px-2 text-[11px] font-semibold border-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 gap-1"
                              title="Ver orçamento"
                            >
                              <Eye className="h-3 w-3 text-emerald-600" />
                              <span>Ver</span>
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const clientId = displayClient.id
                                const attId = activeAttendance?.id || quote.attendance_id || ''
                                navigate(
                                  `/orcamentos/${quote.id}/editar?attendance_id=${encodeURIComponent(attId)}&client_id=${encodeURIComponent(clientId)}`,
                                )
                              }}
                              className="h-6 px-2 text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 gap-1"
                              title="Alterar orçamento"
                            >
                              <Edit3 className="h-3 w-3 text-amber-600" />
                              <span>Alterar</span>
                            </Button>

                            {quote.status === 'enviado' ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleOpenApproveQuote(quote)}
                                  className="h-6 px-2 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-xs"
                                  title={`Aprovar orçamento ${quote.code}`}
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                  <span>Aprovar</span>
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenRejectQuote(quote)}
                                  className="h-6 px-2 text-[11px] font-semibold bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 gap-1"
                                  title={`Recusar orçamento ${quote.code}`}
                                >
                                  <ThumbsDown className="h-3 w-3" />
                                  <span>Recusar</span>
                                </Button>
                              </>
                            ) : quote.status === 'rascunho' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenSendQuote(quote)}
                                className="h-6 px-2 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 gap-1"
                                title={`Enviar orçamento ${quote.code} por WhatsApp`}
                              >
                                <Send className="h-3 w-3" />
                                <span>Enviar</span>
                              </Button>
                            ) : null}

                            {isAdmin && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDeleteQuote(quote)}
                                className="h-6 px-2 text-[11px] font-semibold bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 gap-1"
                                title={`Excluir orçamento ${quote.code}`}
                              >
                                <Trash2 className="h-3 w-3 text-rose-600" />
                                <span>Excluir</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Bloco Pedido em Andamento / Pedido Ativo */}
              {(() => {
                const activeProductionOrders = productionOrders.filter(
                  (o) => !o.is_completed && !o.is_archived,
                )
                if (activeProductionOrders.length === 0) return null

                return (
                  <div className="shrink-0 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60">
                    <button
                      type="button"
                      onClick={() => setOrdersExpanded(!ordersExpanded)}
                      className="w-full flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200 hover:opacity-80 transition-opacity"
                      title={ordersExpanded ? 'Recolher pedidos' : 'Expandir pedidos'}
                    >
                      <div className="flex items-center gap-1.5">
                        {ordersExpanded ? (
                          <ChevronDown className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                        )}
                        <Package className="h-4 w-4 text-amber-600" />
                        <span>
                          PEDIDO{activeProductionOrders.length > 1 ? 'S' : ''} EM ANDAMENTO (
                          {activeProductionOrders.length})
                        </span>
                      </div>
                      <Badge className="bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100 text-[10px] font-semibold border-amber-300">
                        Produção Ativa
                      </Badge>
                    </button>

                    {ordersExpanded && (
                      <div className="mt-2 space-y-1.5 max-h-32 sm:max-h-40 overflow-y-auto pr-0.5">
                        {activeProductionOrders.map((ord) => (
                          <div
                            key={ord.id}
                            onClick={() => {
                              setSelectedOrderToEdit(ord)
                              setOrderModalOpen(true)
                            }}
                            className="p-1.5 px-2 rounded-md bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-800/80 hover:border-amber-400 cursor-pointer transition-all text-xs shadow-xs flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                              <span className="font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                                {ord.order_number}
                              </span>
                              <span
                                className="font-semibold text-slate-800 dark:text-slate-100 truncate text-xs"
                                title={ord.product}
                              >
                                {ord.product}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-auto">
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 py-0 px-1.5"
                              >
                                {ord.stage_name}
                              </Badge>

                              <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
                                <Clock className="h-3 w-3 text-amber-600" />
                                {ord.promised_deadline
                                  ? new Date(ord.promised_deadline).toLocaleDateString('pt-BR')
                                  : 'Sem prazo'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Message List */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
              >
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
                      onClick={() => {
                        setStartModalInitialQuote(null)
                        setStartModalInitialTemplateName('primeiro_contato_lead')
                        setStartModalOpen(true)
                      }}
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
                <div className="shrink-0 px-3.5 py-2 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-amber-800 dark:text-amber-300 gap-2">
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
                <div className="shrink-0 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 gap-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      Janela de 24h fechada. A Meta exige template aprovado para reabrir contato.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStartModalInitialQuote(null)
                      setStartModalInitialTemplateName(undefined)
                      setStartModalOpen(true)
                    }}
                    className="h-6 text-[10px] bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                  >
                    Usar Template
                  </Button>
                </div>
              )}

              {/* Quick Template Chips */}
              <div className="shrink-0 px-3 py-2 bg-white/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 overflow-x-auto flex gap-1.5 scrollbar-none items-center">
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
                <div className="shrink-0 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-t border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
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

              {/* Chat Input / Composer */}
              <form
                onSubmit={handleSendMessage}
                className="shrink-0 p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
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
            <div className="md:col-span-5 flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 overflow-y-auto">
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
                          {activeAttendance?.product_interest !== undefined
                            ? activeAttendance.product_interest || 'Não informado'
                            : displayClient.product_interest || 'Não informado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Valor do Orçamento</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {(
                            activeAttendance?.quote_value !== undefined
                              ? activeAttendance.quote_value
                              : displayClient.quote_value
                          )
                            ? formatCurrency(
                                (activeAttendance?.quote_value !== undefined
                                  ? activeAttendance.quote_value
                                  : displayClient.quote_value) || 0,
                              )
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
        onClose={() => {
          setStartModalOpen(false)
          setStartModalInitialQuote(null)
          setStartModalInitialTemplateName(undefined)
        }}
        client={displayClient}
        initialQuote={startModalInitialQuote}
        initialTemplateName={startModalInitialTemplateName}
        onSuccess={() => {
          setStartModalOpen(false)
          setStartModalInitialQuote(null)
          setStartModalInitialTemplateName(undefined)
          loadClientData(displayClient.id, activeAttendance?.id)
          if (onClientUpdated) onClientUpdated()
        }}
      />

      {/* Complete and Archive Modal */}
      <CompleteAndArchiveModal
        isOpen={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        client={displayClient}
        attendanceId={activeAttendance?.id}
        onSuccess={() => {
          if (onClientUpdated) onClientUpdated()
          loadClientData(displayClient.id, activeAttendance?.id)
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
          loadClientData(displayClient.id, activeAttendance?.id)
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

      {/* Send Quote Modal / Preview */}
      <Dialog
        open={sendQuoteModalOpen}
        onOpenChange={(open) => {
          if (!isSendingQuote) {
            setSendQuoteModalOpen(open)
            if (!open) setSelectedQuoteToSend(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Send className="h-5 w-5 text-emerald-600" />
              Enviar orçamento
            </DialogTitle>
            <DialogDescription>
              Confirme a mensagem que será enviada para o cliente pelo WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {selectedQuoteToSend && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Orçamento</span>
                  <strong className="font-mono text-emerald-700 dark:text-emerald-300 text-sm">
                    {selectedQuoteToSend.code}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Cliente</span>
                  <strong className="text-slate-900 dark:text-white text-sm">
                    {displayClient.name}
                  </strong>
                  <span className="text-slate-400 block text-[10px]">{displayClient.phone}</span>
                </div>
              </div>

              {!within24h ? (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs space-y-2">
                  <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Janela de 24h fechada.</p>
                      <p className="text-amber-800 dark:text-amber-300 text-[11px] mt-0.5">
                        Para enviar este orçamento é necessário utilizar um Template Oficial
                        aprovado pela Meta.
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const quote = selectedQuoteToSend
                        setSendQuoteModalOpen(false)
                        setSelectedQuoteToSend(null)
                        setStartModalInitialQuote(quote)
                        setStartModalInitialTemplateName('envio_orcamento_express')
                        setStartModalOpen(true)
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3 gap-1"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Usar Template Oficial
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Prévia da Mensagem
                  </label>
                  <div className="p-3.5 rounded-xl bg-[#d9fdd3]/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap font-sans leading-relaxed shadow-inner max-h-64 overflow-y-auto">
                    {formatQuoteWhatsAppMessage(selectedQuoteToSend, displayClient.name)}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSendingQuote}
                  onClick={() => {
                    setSendQuoteModalOpen(false)
                    setSelectedQuoteToSend(null)
                  }}
                  className="text-xs"
                >
                  Cancelar
                </Button>

                {within24h && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSendingQuote}
                    onClick={handleConfirmSendQuote}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-medium"
                  >
                    {isSendingQuote ? (
                      <>
                        <Clock className="h-3.5 w-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Enviar orçamento</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quote Details View Modal */}
      <Dialog open={quoteDetailsOpen} onOpenChange={setQuoteDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white font-mono">
              <FileText className="h-5 w-5 text-emerald-600" />
              {selectedQuoteToView?.code} — {selectedQuoteToView?.client_name}
            </DialogTitle>
            <DialogDescription>
              Resumo dos itens calculados e composição financeira do orçamento vinculado.
            </DialogDescription>
          </DialogHeader>

          {selectedQuoteToView && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block">Cliente</span>
                  <strong className="text-slate-900 dark:text-white text-sm">
                    {selectedQuoteToView.client_name}
                  </strong>
                  {selectedQuoteToView.client_phone && (
                    <span className="text-slate-400 block">{selectedQuoteToView.client_phone}</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Status</span>
                  {getQuoteStatusBadge(selectedQuoteToView.status)}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Itens da Proposta
                </h4>
                {Array.isArray(selectedQuoteToView.items) &&
                selectedQuoteToView.items.length > 0 ? (
                  selectedQuoteToView.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 dark:text-white text-sm">
                          {item.product_name}
                        </strong>
                        <span className="font-bold text-emerald-600 text-sm">
                          {formatCurrency(Number(item.item_total_sale || 0))}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-slate-500 text-[11px]">
                        <span>Qtd: {item.quantity}</span>
                        {item.width && item.height && (
                          <span>
                            Medidas: {item.width}m × {item.height}m (Área: {item.total_area} m²)
                          </span>
                        )}
                        <span>Unit: {formatCurrency(Number(item.applied_unit_price || 0))}</span>
                      </div>

                      {item.additionals && item.additionals.length > 0 && (
                        <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] text-teal-600 font-medium block">
                            Adicionais:{' '}
                            {item.additionals
                              .map((a: any) => `${a.name} (${a.quantity} un)`)
                              .join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Nenhum item discriminado.</p>
                )}
              </div>

              {/* Total proposal summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal da Venda:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(Number(selectedQuoteToView.total_sale || 0))}
                  </span>
                </div>
                {Number(selectedQuoteToView.discount_amount || 0) > 0 && (
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                    <span>Desconto Comercial:</span>
                    <span className="font-semibold">
                      - {formatCurrency(Number(selectedQuoteToView.discount_amount))}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                  <span>Valor Total da Proposta:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 text-lg">
                    {formatCurrency(
                      Number(
                        selectedQuoteToView.final_total ?? selectedQuoteToView.total_sale ?? 0,
                      ),
                    )}
                  </span>
                </div>
              </div>

              {/* Internal Cost x Sale Financial Box (for admin/permission) */}
              {canViewFinancials && (
                <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                    Visão Administrativa (Custo x Venda)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2">
                    <div className="p-2 rounded-lg bg-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">
                        Custo Total
                      </span>
                      <strong className="text-xs text-slate-200">
                        {formatCurrency(Number(selectedQuoteToView.total_cost || 0))}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">
                        Venda Total
                      </span>
                      <strong className="text-xs text-emerald-400">
                        {formatCurrency(Number(selectedQuoteToView.total_sale || 0))}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">
                        Lucro Bruto
                      </span>
                      <strong className="text-xs text-emerald-400">
                        {formatCurrency(Number(selectedQuoteToView.gross_profit || 0))}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase block">Margem %</span>
                      <strong className="text-xs text-emerald-400">
                        {Number(selectedQuoteToView.profit_margin_pct || 0).toFixed(1)}%
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {selectedQuoteToView.notes && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                  <span className="font-semibold block text-[10px] uppercase text-slate-400 mb-1">
                    Condições & Observações:
                  </span>
                  <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    {selectedQuoteToView.notes}
                  </p>
                </div>
              )}

              <div className="pt-2 flex justify-between items-center gap-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDeleteQuote(selectedQuoteToView)}
                      className="text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      Excluir orçamento
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  {selectedQuoteToView.status === 'enviado' && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleOpenApproveQuote(selectedQuoteToView)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Aprovar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRejectQuote(selectedQuoteToView)}
                        className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 text-xs gap-1.5 font-semibold"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        Recusar
                      </Button>
                    </>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuoteDetailsOpen(false)}
                    className="text-xs"
                  >
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setQuoteDetailsOpen(false)
                      const clientId = displayClient.id
                      const attId = activeAttendance?.id || selectedQuoteToView.attendance_id || ''
                      navigate(
                        `/orcamentos/${selectedQuoteToView.id}/editar?attendance_id=${encodeURIComponent(attId)}&client_id=${encodeURIComponent(clientId)}`,
                      )
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Alterar este orçamento
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: CONFIRMAÇÃO DE APROVAÇÃO DE ORÇAMENTO */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Aprovar orçamento {quoteToApprove?.code}?
            </DialogTitle>
            <DialogDescription>
              Confirme a aprovação da proposta comercial para o cliente.
            </DialogDescription>
          </DialogHeader>

          {quoteToApprove && (
            <div className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Código:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {quoteToApprove.code}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {quoteToApprove.client_name || displayClient.name}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    Valor Total:
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base">
                    {formatCurrency(
                      Number(quoteToApprove.final_total ?? quoteToApprove.total_sale ?? 0),
                    )}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                O orçamento será atualizado com status <strong>Aprovado</strong> e registrado na
                trilha de auditoria.
              </p>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isApprovingQuote}
                  onClick={() => {
                    setApproveDialogOpen(false)
                    setQuoteToApprove(null)
                  }}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isApprovingQuote}
                  onClick={handleConfirmApproveQuote}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-semibold"
                >
                  {isApprovingQuote ? (
                    <>
                      <Clock className="h-3.5 w-3.5 animate-spin" />
                      <span>Aprovando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Confirmar aprovação</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: RECUSA DE ORÇAMENTO */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <XCircle className="h-5 w-5 text-rose-600" />
              Recusar orçamento {quoteToReject?.code}?
            </DialogTitle>
            <DialogDescription>
              Informe o motivo da recusa para histórico comercial e auditoria.
            </DialogDescription>
          </DialogHeader>

          {quoteToReject && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Orçamento:</span>
                  <span className="font-mono font-bold">{quoteToReject.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-semibold">
                    {quoteToReject.client_name || displayClient.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor Total:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {formatCurrency(
                      Number(quoteToReject.final_total ?? quoteToReject.total_sale ?? 0),
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Motivo da recusa (opcional)
                </label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione um motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Preço">Preço</SelectItem>
                    <SelectItem value="Prazo de entrega">Prazo de entrega</SelectItem>
                    <SelectItem value="Cliente desistiu">Cliente desistiu</SelectItem>
                    <SelectItem value="Fechou com concorrente">Fechou com concorrente</SelectItem>
                    <SelectItem value="Especificação técnica / Material">
                      Especificação técnica / Material
                    </SelectItem>
                    <SelectItem value="Sem retorno do cliente">Sem retorno do cliente</SelectItem>
                    <SelectItem value="Outro">Outro motivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Observações adicionais (opcional)
                </label>
                <Textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Ex: Cliente achou o frete alto ou preferiu adiar para o próximo mês..."
                  className="text-xs min-h-[70px]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRejectingQuote}
                  onClick={() => {
                    setRejectDialogOpen(false)
                    setQuoteToReject(null)
                  }}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isRejectingQuote}
                  onClick={handleConfirmRejectQuote}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs gap-1.5 font-semibold"
                >
                  {isRejectingQuote ? (
                    <>
                      <Clock className="h-3.5 w-3.5 animate-spin" />
                      <span>Registrando recusa...</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Confirmar recusa</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* DIALOG DE CONFIRMAÇÃO DE EXCLUSÃO DE ORÇAMENTO */}
      <AlertDialog open={deleteQuoteDialogOpen} onOpenChange={setDeleteQuoteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" />
              <span>Excluir orçamento {quoteToDelete?.code}?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="block">Esta ação excluirá somente este orçamento.</span>
              <span className="block">
                Cliente, atendimento, mensagens e pedidos não serão excluídos.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingQuote}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteQuote}
              disabled={isDeletingQuote}
              className="bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-600"
            >
              {isDeletingQuote ? 'Excluindo...' : 'Excluir orçamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
