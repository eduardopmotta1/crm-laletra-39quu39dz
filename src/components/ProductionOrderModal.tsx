import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Package,
  Calendar,
  Layers,
  FileText,
  Upload,
  User,
  Phone,
  Mail,
  ShieldCheck,
  Truck,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  MessageSquare,
  History,
  Link2,
  Download,
  Eye,
  File,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  Paperclip,
  Lock,
  Unlock,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import type {
  ProductionOrder,
  ProductionStage,
  ProductionLog,
  ProductionProof,
  User as UserType,
  Client,
  Priority,
  ProductionDeliveryType,
} from '@/types/crm'
import type { Quote } from '@/types/quotes'
import { productionService } from '@/services/production'
import { productionStagesService } from '@/services/productionStages'
import { usersService } from '@/services/whatsapp'
import { clientsService } from '@/services/clients'
import { extractQuoteLinkFromOrder } from '@/lib/productionItemParser'
import { formatCurrency, formatDateTime, getWhatsAppDirectUrl } from '@/lib/sla'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import WhatsAppChatDrawer from '@/components/WhatsAppChatDrawer'

interface ProductionOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  orderToEdit?: ProductionOrder | null
  initialClientId?: string
  initialStageId?: string
  prefillData?: {
    clientId?: string
    attendanceId?: string
    clientName?: string
    clientPhone?: string
    clientEmail?: string
    dealOriginId?: string
    product?: string
    description?: string
    quoteValue?: number
    notes?: string
  }
  onOpenChat?: (client: Client, orderContext: { id: string; orderNumber: string }) => void
  zIndexClass?: string
}

export default function ProductionOrderModal({
  isOpen,
  onClose,
  onSaved,
  orderToEdit,
  initialClientId,
  initialStageId,
  prefillData,
  onOpenChat,
  zIndexClass = 'z-50',
}: ProductionOrderModalProps) {
  const [stages, setStages] = useState<ProductionStage[]>([])
  const [users, setUsers] = useState<UserType[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'proofs'>('details')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<ProductionLog[]>([])
  const [proofs, setProofs] = useState<ProductionProof[]>([])
  const [linkedQuote, setLinkedQuote] = useState<Quote | null>(null)

  // Form states
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [product, setProduct] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState<string>('1000')
  const [dimensions, setDimensions] = useState('')
  const [totalValue, setTotalValue] = useState<string>('')
  const [salesRepId, setSalesRepId] = useState('')
  const [productionRepId, setProductionRepId] = useState('')
  const [promisedDeadline, setPromisedDeadline] = useState('')
  const [deliveryType, setDeliveryType] = useState<ProductionDeliveryType>('retirada')
  const [trackingCode, setTrackingCode] = useState('')
  const [notes, setNotes] = useState('')
  const [stageInternalId, setStageInternalId] = useState('order_received')
  const [priority, setPriority] = useState<Priority>('media')
  const [requiresArtApproval, setRequiresArtApproval] = useState<boolean>(true)
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)

  // Proof submission inside modal
  const [proofUrl, setProofUrl] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [proofFiles, setProofFiles] = useState<FileList | null>(null)

  // WhatsApp Chat Drawer for this order's client
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [chatClient, setChatClient] = useState<Client | null>(null)
  const [loadingChatClient, setLoadingChatClient] = useState(false)

  const { isAdmin, roleSlug, hasPermission } = useAuth()
  const canManageArtRequirement =
    isAdmin ||
    roleSlug === 'admin' ||
    roleSlug === 'producao' ||
    roleSlug === 'gestao' ||
    hasPermission('settings_config_production') ||
    hasPermission('production_edit')

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        productionStagesService.getAll(),
        usersService.getAll(),
        clientsService.getAll(),
      ]).then(([st, u, cl]) => {
        setStages(st)
        setUsers(u)
        setClients(cl)
      })

      if (orderToEdit) {
        setClientId(orderToEdit.client_id)
        setClientName(orderToEdit.client_name)
        setClientPhone(orderToEdit.client_phone)
        setClientEmail(orderToEdit.client_email || '')
        setProduct(orderToEdit.product)
        setDescription(orderToEdit.description || '')
        setQuantity(orderToEdit.quantity ? String(orderToEdit.quantity) : '')
        setDimensions(orderToEdit.dimensions || '')
        setTotalValue(orderToEdit.total_value ? String(orderToEdit.total_value) : '')
        setSalesRepId(orderToEdit.sales_rep_id || '')
        setProductionRepId(orderToEdit.production_rep_id || '')
        setPromisedDeadline(
          orderToEdit.promised_deadline ? orderToEdit.promised_deadline.substring(0, 10) : '',
        )
        setDeliveryType(orderToEdit.delivery_type || 'retirada')
        setTrackingCode(orderToEdit.tracking_code || '')
        setNotes(orderToEdit.notes || '')
        setStageInternalId(orderToEdit.stage_internal_id)
        setPriority(orderToEdit.priority || 'media')
        setRequiresArtApproval(
          orderToEdit.requires_art_approval !== undefined &&
            orderToEdit.requires_art_approval !== null
            ? Boolean(orderToEdit.requires_art_approval)
            : false,
        )

        // Fetch logs and proofs
        productionService.getLogs(orderToEdit.id).then(setLogs)
        productionService.getProofs(orderToEdit.id).then(setProofs)

        // Fetch linked quote if available
        const qLink = extractQuoteLinkFromOrder(orderToEdit)
        if (qLink.quoteId) {
          pb.collection('quotes')
            .getOne<Quote>(qLink.quoteId)
            .then(setLinkedQuote)
            .catch(() => setLinkedQuote(null))
        } else {
          setLinkedQuote(null)
        }
      } else {
        // New order / prefilled from deal
        setClientId(prefillData?.clientId || initialClientId || '')
        setClientName(prefillData?.clientName || '')
        setClientPhone(prefillData?.clientPhone || '')
        setClientEmail(prefillData?.clientEmail || '')
        setProduct(prefillData?.product || '')
        setDescription(prefillData?.description || '')
        setQuantity('1000')
        setDimensions('')
        setTotalValue(prefillData?.quoteValue ? String(prefillData.quoteValue) : '')
        setSalesRepId(pb.authStore.record?.id || '')
        setProductionRepId('')
        // default deadline 3 days from now
        const d = new Date()
        d.setDate(d.getDate() + 3)
        setPromisedDeadline(d.toISOString().substring(0, 10))
        setDeliveryType('retirada')
        setTrackingCode('')
        setNotes(prefillData?.notes || '')
        setStageInternalId(initialStageId || 'order_received')
        setPriority('media')
        setRequiresArtApproval(true)
        setLogs([])
        setProofs([])
        setLinkedQuote(null)
      }
      setActiveTab('details')
    }
  }, [isOpen, orderToEdit, prefillData, initialClientId, initialStageId])

  const handleClientSelect = (id: string) => {
    setClientId(id)
    const cl = clients.find((c) => c.id === id)
    if (cl) {
      setClientName(cl.name)
      setClientPhone(cl.phone)
      setClientEmail(cl.email || '')
      if (cl.product_interest && !product) setProduct(cl.product_interest)
      if (cl.quote_value && !totalValue) setTotalValue(String(cl.quote_value))
      if (cl.assigned_to) setSalesRepId(cl.assigned_to)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product.trim() || !clientName.trim() || !clientPhone.trim()) {
      toast({
        title: 'Preencha os campos obrigatórios',
        description: 'Informe pelo menos o cliente, WhatsApp e produto.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      if (orderToEdit) {
        // Central validation before allowing transition to 'in_production'
        if (stageInternalId === 'in_production') {
          const effectiveRequiresApproval = requiresArtApproval
          const isArtApproved =
            Boolean(orderToEdit.art_approved) &&
            Boolean(orderToEdit.approved_proof_id && orderToEdit.approved_proof_id.trim())

          if (effectiveRequiresApproval && !isArtApproved) {
            toast({
              title: 'Bloqueio de Produção',
              description:
                'Este pedido exige aprovação de arte antes de entrar em produção. Aprove a arte na aba "Aprovação de Arte" primeiro.',
              variant: 'destructive',
            })
            setLoading(false)
            return
          }
        }

        // Update existing order
        const currentStageObj = stages.find((s) => s.internal_id === stageInternalId)
        const updatePayload: Record<string, any> = {
          client_id: clientId,
          client_name: clientName,
          client_phone: clientPhone,
          client_email: clientEmail || undefined,
          product: product.trim(),
          description: description.trim() || undefined,
          quantity: quantity ? Number(quantity) : undefined,
          dimensions: dimensions.trim() || undefined,
          total_value: totalValue ? Number(totalValue) : undefined,
          sales_rep_id: salesRepId || undefined,
          production_rep_id: productionRepId || undefined,
          delivery_type: deliveryType,
          tracking_code: trackingCode.trim() || undefined,
          notes: notes.trim() || undefined,
          priority: priority,
          requires_art_approval: requiresArtApproval,
          stage_internal_id: stageInternalId,
          stage_name: currentStageObj?.name || orderToEdit.stage_name,
        }

        if (promisedDeadline && promisedDeadline.trim()) {
          updatePayload.promised_deadline = promisedDeadline.substring(0, 10)
        }

        await productionService.update(orderToEdit.id, updatePayload)

        // Audit toggle change if changed
        const prevToggle =
          orderToEdit.requires_art_approval !== undefined &&
          orderToEdit.requires_art_approval !== null
            ? Boolean(orderToEdit.requires_art_approval)
            : false
        if (prevToggle !== requiresArtApproval) {
          try {
            await pb.collection('audit_logs').create({
              action: 'order_requires_art_toggle',
              module: 'production',
              record_id: orderToEdit.id,
              record_title: `Pedido ${orderToEdit.order_number}`,
              user_id: pb.authStore.record?.id || undefined,
              user_name:
                pb.authStore.record?.name || pb.authStore.record?.email || 'Produção Laletra',
              details: `Exigência de aprovação de arte alterada de ${
                prevToggle ? 'SIM' : 'NÃO'
              } para ${requiresArtApproval ? 'SIM' : 'NÃO'} no pedido ${orderToEdit.order_number}.`,
            })
          } catch (auditErr) {
            console.error('Error recording audit log for art requirement toggle:', auditErr)
          }
        }

        // If stage changed, trigger updateStage flow with notification
        if (orderToEdit.stage_internal_id !== stageInternalId) {
          await productionService.updateStage(orderToEdit.id, stageInternalId, {
            notes: `Etapa alterada no formulário de edição para "${currentStageObj?.name}".`,
            trackingCode: trackingCode || undefined,
          })
        }

        toast({
          title: 'Pedido Atualizado',
          description: `Alterações no pedido ${orderToEdit.order_number} foram salvas.`,
        })
      } else {
        // Create new order
        const filesArray: File[] = []
        if (selectedFiles) {
          for (let i = 0; i < selectedFiles.length; i++) {
            filesArray.push(selectedFiles[i])
          }
        }

        const targetClientId = clientId || clients[0]?.id
        if (!targetClientId) {
          toast({
            title: 'Cliente obrigatório',
            description: 'Selecione ou cadastre um cliente antes de criar o pedido de produção.',
            variant: 'destructive',
          })
          setLoading(false)
          return
        }

        const created = await productionService.create({
          clientId: targetClientId,
          attendanceId: prefillData?.attendanceId,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientEmail: clientEmail.trim() || undefined,
          dealOriginId: prefillData?.dealOriginId,
          product: product.trim(),
          description: description.trim() || undefined,
          quantity: quantity ? Number(quantity) : undefined,
          dimensions: dimensions.trim() || undefined,
          totalValue: totalValue ? Number(totalValue) : undefined,
          salesRepId: salesRepId || undefined,
          productionRepId: productionRepId || undefined,
          promisedDeadline: promisedDeadline ? promisedDeadline.substring(0, 10) : undefined,
          deliveryType,
          notes: notes.trim() || undefined,
          initialStageId: stageInternalId,
          priority,
          requiresArtApproval,
          attachments: filesArray,
        })

        // If this order originated from a commercial deal, register last_archived_deal_id on client without archiving the client record
        if (prefillData?.dealOriginId) {
          try {
            await pb.collection('clients').update(targetClientId, {
              last_archived_deal_id: prefillData.dealOriginId,
            })
          } catch (archiveErr) {
            console.error('Error updating client after production order creation:', archiveErr)
          }
        }

        toast({
          title: '🎉 Pedido de Produção Criado!',
          description: `Pedido ${created.order_number} gerado com sucesso para "${clientName}".`,
        })
      }

      onSaved()
      onClose()
      window.dispatchEvent(new CustomEvent('production-order-updated'))
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
      window.dispatchEvent(new CustomEvent('deal-updated'))
    } catch (err: any) {
      console.error(
        'Error saving production order:',
        {
          message: err?.message,
          status: err?.status,
          url: err?.url,
          data: err?.data || err?.response?.data,
          response: err?.response,
        },
        err,
      )
      const fieldErrors = err?.response?.data || err?.data
      let detailedMsg = err?.message || 'Verifique os campos preenchidos.'
      if (fieldErrors && typeof fieldErrors === 'object') {
        const details = Object.entries(fieldErrors)
          .map(([k, v]: [string, any]) => `${k}: ${v?.message || JSON.stringify(v)}`)
          .join(', ')
        if (details) detailedMsg = `${detailedMsg} (${details})`
      }
      toast({
        title: 'Erro ao salvar pedido',
        description: detailedMsg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSendProof = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderToEdit) return

    setLoading(true)
    try {
      const filesArray: File[] = []
      if (proofFiles) {
        for (let i = 0; i < proofFiles.length; i++) {
          filesArray.push(proofFiles[i])
        }
      }

      await productionService.registerProofSent(
        orderToEdit.id,
        proofUrl,
        filesArray,
        proofNotes || 'Prova enviada para aprovação do cliente.',
      )

      toast({
        title: 'Prova Digital Enviada!',
        description:
          'Pedido movido para "Aguardando aprovação do cliente" e notificação disparada.',
      })

      const updatedProofs = await productionService.getProofs(orderToEdit.id)
      setProofs(updatedProofs)
      setProofUrl('')
      setProofNotes('')
      setProofFiles(null)
      onSaved()
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar prova',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const isOrderArtApproved =
    orderToEdit &&
    Boolean(orderToEdit.art_approved) &&
    Boolean(orderToEdit.approved_proof_id && orderToEdit.approved_proof_id.trim())

  const handleOpenWhatsAppChat = async () => {
    // Validação de permissão de visualização do WhatsApp:
    // 1. Admin -> permite
    // 2. hasPermission('whatsapp_view') || hasPermission('whatsapp_view_own') -> permite (fluxo comercial)
    // 3. orderToEdit existente E possui permissão de produção (production_view / production_view_all / production_view_assigned) -> permite (acesso contextual de Produção)
    const canViewProductionContext =
      Boolean(orderToEdit) &&
      (hasPermission('production_view') ||
        hasPermission('production_view_all') ||
        hasPermission('production_view_assigned'))

    const canViewWhatsApp =
      isAdmin ||
      hasPermission('whatsapp_view') ||
      hasPermission('whatsapp_view_own') ||
      canViewProductionContext

    if (!canViewWhatsApp) {
      toast({
        title: 'Acesso negado',
        description: 'Você não possui permissão para visualizar esta conversa.',
        variant: 'destructive',
      })
      return
    }

    const targetClientId = orderToEdit?.client_id || clientId
    if (!targetClientId) {
      toast({
        title: 'Cliente não identificado',
        description: 'Não foi possível encontrar o cliente associado a este pedido.',
        variant: 'destructive',
      })
      return
    }

    setLoadingChatClient(true)
    try {
      const clientRecord = await clientsService.getById(targetClientId)
      if (!clientRecord) {
        throw new Error('Cliente não encontrado no sistema.')
      }

      const ctx = orderToEdit
        ? { id: orderToEdit.id, orderNumber: orderToEdit.order_number }
        : { id: '', orderNumber: '' }

      if (onOpenChat) {
        onOpenChat(clientRecord, ctx)
        // Se onOpenChat foi fornecido, o pai cuida de renderizar o drawer no topo mantendo o modal aberto
        return
      }

      // Caso não tenha handler externo de chat, abre o drawer embutido
      setChatClient(clientRecord)
      setChatDrawerOpen(true)
    } catch (err: any) {
      console.error('Error fetching client for WhatsApp chat:', err)
      toast({
        title: 'Erro ao carregar cliente',
        description: err?.message || 'Não foi possível abrir o chat do WhatsApp.',
        variant: 'destructive',
      })
    } finally {
      setLoadingChatClient(false)
    }
  }

  const handleProductionOrderOpenChange = (open: boolean) => {
    if (!open) {
      if (chatDrawerOpen) {
        return
      }
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleProductionOrderOpenChange}>
      <DialogContent
        zIndexClass={zIndexClass}
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => {
          if (chatDrawerOpen) {
            e.preventDefault()
            return
          }
          e.stopPropagation()
        }}
        onInteractOutside={(e) => {
          if (chatDrawerOpen) {
            e.preventDefault()
          }
        }}
        onPointerDownOutside={(e) => {
          if (chatDrawerOpen) {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-lg">
                  <Package className="h-5 w-5 text-emerald-600" />
                  {orderToEdit ? `Pedido ${orderToEdit.order_number}` : 'Novo Pedido de Produção'}
                </DialogTitle>
                {orderToEdit && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isOrderArtApproved ? (
                      <Badge className="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />✅ Arte final aprovada
                      </Badge>
                    ) : requiresArtApproval ? (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 text-[11px] font-bold px-2 py-0.5 flex items-center gap-1"
                      >
                        <Lock className="h-3 w-3 text-amber-600" />🔒 Exige aprovação de arte
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-slate-300 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 text-[11px] px-2 py-0.5"
                      >
                        Não exige aprovação de arte
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-mono text-xs">
                      Token: {orderToEdit.tracking_token.substring(0, 8)}...
                    </Badge>
                  </div>
                )}
              </div>
              <DialogDescription className="text-xs">
                {orderToEdit
                  ? 'Gerencie prazos, especificações técnicas, provas de arte e histórico de produção.'
                  : 'Preencha os dados da ordem de serviço para enviar à esteira de produção.'}
              </DialogDescription>
            </div>

            {orderToEdit && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenWhatsAppChat}
                  disabled={loading || loadingChatClient}
                  className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300 font-semibold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 shadow-sm"
                  title="Abrir histórico e conversar com o cliente pelo WhatsApp"
                >
                  <MessageSquare className="h-4 w-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                  {loadingChatClient ? 'Carregando...' : 'Falar com o cliente'}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>
        {/* Tab switch */}
        {orderToEdit && (
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'details'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Especificações & Dados
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('proofs')}
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'proofs'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
              Aprovação de Arte ({proofs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <History className="h-3.5 w-3.5 text-blue-600" />
              Histórico & Auditoria ({logs.length})
            </button>
          </div>
        )}

        {/* TAB 1: ORDER DETAILS FORM */}
        {activeTab === 'details' && (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* SEÇÃO SEPARADA: SITUAÇÃO COMERCIAL & SITUAÇÃO DA ARTE */}
            {orderToEdit && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. SITUAÇÃO COMERCIAL */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    1. Situação Comercial
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {linkedQuote ? `Orçamento ${linkedQuote.code}` : 'Orçamento / Venda'}
                    </span>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 text-[10px] font-bold px-2 py-0.5">
                      ✓ Orçamento Aprovado
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Venda fechada comercialmente. Permite a criação da ordem de produção.
                  </p>
                </div>

                {/* 2. SITUAÇÃO DA ARTE */}
                <div
                  className={`p-3 rounded-xl border space-y-1.5 transition-all ${
                    orderToEdit.art_approved && orderToEdit.approved_proof_id
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                      : !requiresArtApproval
                        ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                        : orderToEdit.stage_internal_id === 'awaiting_approval'
                          ? 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-300 dark:border-purple-800'
                          : orderToEdit.stage_internal_id === 'art_preparation'
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800'
                            : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    2. Situação da Arte
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Aprovação Visual
                    </span>
                    {orderToEdit.art_approved && orderToEdit.approved_proof_id ? (
                      <Badge className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />✅ Arte aprovada
                      </Badge>
                    ) : !requiresArtApproval ? (
                      <Badge
                        variant="outline"
                        className="text-slate-600 dark:text-slate-400 border-slate-300 text-[10px] font-bold px-2 py-0.5"
                      >
                        Não exige aprovação de arte
                      </Badge>
                    ) : orderToEdit.stage_internal_id === 'awaiting_approval' ? (
                      <Badge className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5">
                        ⏳ Aguardando aprovação
                      </Badge>
                    ) : orderToEdit.stage_internal_id === 'art_preparation' ? (
                      <Badge className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5">
                        🎨 Em preparação
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-amber-800 dark:text-amber-300 border-amber-300 text-[10px] font-bold px-2 py-0.5"
                      >
                        ⏳ Aguardando criação / envio
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {orderToEdit.art_approved && orderToEdit.approved_proof_id
                      ? 'Prova digital confirmada e aprovada pelo cliente.'
                      : !requiresArtApproval
                        ? 'Pedido liberado diretamente para produção sem necessidade de aprovação de prova.'
                        : 'A aprovação comercial não aprova a arte automaticamente.'}
                  </p>
                </div>
              </div>
            )}
            {/* SEÇÃO OFICIAL: ARTE FINAL APROVADA / ARQUIVO OFICIAL PARA PRODUÇÃO */}
            {orderToEdit &&
              (() => {
                const approvedProof =
                  proofs.find((p) => p.id === orderToEdit.approved_proof_id) ||
                  orderToEdit.expand?.approved_proof_id
                const hasApprovedProof = Boolean(orderToEdit.approved_proof_id && approvedProof)

                return (
                  <div
                    className={`p-4 rounded-xl border transition-all space-y-3 ${
                      hasApprovedProof
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/20'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck
                          className={`h-5 w-5 ${hasApprovedProof ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
                        />
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                            {hasApprovedProof
                              ? 'ARQUIVO OFICIAL PARA PRODUÇÃO (ARTE FINAL APROVADA)'
                              : 'ARQUIVO OFICIAL PARA PRODUÇÃO'}
                          </h4>
                          {hasApprovedProof && approvedProof?.approved_at && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                              Aprovada em{' '}
                              {new Date(approvedProof.approved_at).toLocaleDateString('pt-BR')}{' '}
                              {approvedProof.approved_by_contact
                                ? `por ${approvedProof.approved_by_contact}`
                                : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {hasApprovedProof ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2 py-0.5 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />✅ Arte final aprovada (V
                          {approvedProof?.version_number || 1})
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-slate-500 border-slate-300 dark:border-slate-700"
                        >
                          Nenhuma arte final aprovada ainda
                        </Badge>
                      )}
                    </div>

                    {hasApprovedProof && approvedProof ? (
                      <div className="space-y-2 pt-1">
                        {approvedProof.proof_file &&
                        (Array.isArray(approvedProof.proof_file)
                          ? approvedProof.proof_file
                          : [approvedProof.proof_file]
                        ).filter(Boolean).length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {(Array.isArray(approvedProof.proof_file)
                              ? approvedProof.proof_file
                              : [approvedProof.proof_file]
                            )
                              .filter(Boolean)
                              .map((pFileName, pIdx) => {
                                const pFileUrl = productionService.getProofFileUrl(
                                  approvedProof,
                                  pFileName,
                                )
                                const pExt = pFileName.split('.').pop()?.toLowerCase() || ''
                                const pIsImage = [
                                  'png',
                                  'jpg',
                                  'jpeg',
                                  'webp',
                                  'gif',
                                  'svg',
                                ].includes(pExt)
                                const pIsPdf = pExt === 'pdf'

                                return (
                                  <div
                                    key={pIdx}
                                    className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800/80 flex items-center justify-between gap-2.5 shadow-sm"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      {pIsImage ? (
                                        <div className="h-12 w-12 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                          <img
                                            src={pFileUrl}
                                            alt={pFileName}
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                          />
                                        </div>
                                      ) : (
                                        <div
                                          className={`h-12 w-12 rounded-lg flex flex-col items-center justify-center shrink-0 border ${
                                            pIsPdf
                                              ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400'
                                              : 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-400'
                                          }`}
                                        >
                                          {pIsPdf ? (
                                            <FileText className="h-5 w-5" />
                                          ) : (
                                            <File className="h-5 w-5" />
                                          )}
                                          <span className="text-[8px] font-mono font-bold uppercase mt-0.5">
                                            {pExt}
                                          </span>
                                        </div>
                                      )}

                                      <div className="min-w-0 flex-1">
                                        <span
                                          className="font-bold text-slate-900 dark:text-slate-100 block truncate text-xs"
                                          title={pFileName}
                                        >
                                          {pFileName}
                                        </span>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                          <span className="font-mono uppercase font-semibold">
                                            .{pExt}
                                          </span>
                                          <span>• Prova V{approvedProof.version_number || 1}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <a
                                        href={pFileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-semibold text-xs transition-colors"
                                        title="Abrir arquivo oficial em nova aba"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Abrir
                                      </a>
                                      <a
                                        href={`${pFileUrl}?download=1`}
                                        download
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                                        title="Baixar arquivo oficial para produção"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                        Baixar
                                      </a>
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        ) : approvedProof.proof_url ? (
                          <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <Link2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              <span className="text-slate-700 dark:text-slate-300 truncate font-mono">
                                {approvedProof.proof_url}
                              </span>
                            </div>
                            <a
                              href={approvedProof.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shrink-0"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Abrir Link Oficial
                            </a>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border text-xs text-slate-500">
                            A prova V{approvedProof.version_number || 1} foi aprovada, mas não
                            contém arquivo físico anexado.
                          </div>
                        )}

                        {approvedProof.client_comment && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/70 p-2 rounded-lg border border-emerald-200/50">
                            <strong>Comentário de aprovação:</strong> "
                            {approvedProof.client_comment}"
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 flex items-center justify-between gap-2">
                        <span>
                          Arte final ainda não aprovada. Envie uma prova e registre a decisão na aba
                          "Aprovação de Arte".
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('proofs')}
                          className="text-purple-600 dark:text-purple-400 font-semibold hover:underline shrink-0 text-xs"
                        >
                          Ir para Provas →
                        </button>
                      </div>
                    )}
                  </div>
                )
              })()}
            {/* SEÇÃO: CONFIGURAÇÃO DE EXIGÊNCIA DE APROVAÇÃO DE ARTE (TOGGLE) */}
            <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    {requiresArtApproval ? (
                      <Lock className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Unlock className="h-4 w-4 text-slate-500" />
                    )}
                    Exige aprovação de arte: {requiresArtApproval ? 'SIM' : 'NÃO'}
                  </span>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                    {requiresArtApproval
                      ? 'Este pedido exige aprovação de arte formal antes de entrar na etapa "Em produção".'
                      : 'Não exige aprovação de arte. Permite avançar diretamente para "Em produção" (reimpressão ou arquivo pronto).'}
                  </p>
                </div>

                {canManageArtRequirement ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant={requiresArtApproval ? 'default' : 'outline'}
                      onClick={() => setRequiresArtApproval(true)}
                      className={`text-xs h-7 px-3 font-semibold ${
                        requiresArtApproval
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'border-amber-300 text-amber-900 dark:text-amber-200'
                      }`}
                    >
                      SIM
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!requiresArtApproval ? 'default' : 'outline'}
                      onClick={() => setRequiresArtApproval(false)}
                      className={`text-xs h-7 px-3 font-semibold ${
                        !requiresArtApproval
                          ? 'bg-slate-700 hover:bg-slate-800 text-white'
                          : 'border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      NÃO
                    </Button>
                  </div>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-semibold border-slate-300 shrink-0"
                  >
                    {requiresArtApproval ? '🔒 Exige aprovação' : 'Não exige aprovação'}
                  </Badge>
                )}
              </div>

              {/* Dynamic warning if attempting to select 'in_production' with pending approval */}
              {stageInternalId === 'in_production' &&
                requiresArtApproval &&
                !isOrderArtApproved && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>Este pedido exige aprovação de arte antes de entrar em produção.</span>
                    </div>
                    {orderToEdit && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setActiveTab('proofs')}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-[11px] h-6 px-2 shrink-0 font-semibold"
                      >
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Abrir aprovação de arte
                      </Button>
                    )}
                  </div>
                )}
            </div>
            {/* Section 1: Client Selection */}{' '}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                1. Cliente & Atendimento de Origem
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Vincular Cliente
                  </label>
                  <Select value={clientId} onValueChange={handleClientSelect}>
                    <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Selecione o cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nome do Cliente *
                  </label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Nome ou Razão Social"
                    className="mt-1 text-xs bg-white dark:bg-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    WhatsApp / Telefone *
                  </label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+55 11 99999-9999"
                    className="mt-1 text-xs bg-white dark:bg-slate-900 font-mono"
                    required
                  />
                </div>
              </div>
            </div>
            {/* Section 2: Product & Technical Specs */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                2. Especificações Gráficas do Produto
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Produto *
                  </label>
                  <Input
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    placeholder="Ex: 1.000 Cartões de Visita 4x4"
                    className="mt-1 text-xs bg-white dark:bg-slate-900 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Valor Total (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={totalValue}
                    onChange={(e) => setTotalValue(e.target.value)}
                    placeholder="0,00"
                    className="mt-1 text-xs bg-white dark:bg-slate-900 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Quantidade
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Ex: 500"
                    className="mt-1 text-xs bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Medidas / Formato
                  </label>
                  <Input
                    value={dimensions}
                    onChange={(e) => setDimensions(e.target.value)}
                    placeholder="Ex: 9x5 cm, A4, 100x200 cm"
                    className="mt-1 text-xs bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Descrição Técnica / Acabamento
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Papel Couché 300g, Verniz Localizado, Laminação Soft Touch, Faca Especial, Vinco central..."
                  rows={2}
                  className="mt-1 text-xs bg-white dark:bg-slate-900 resize-none"
                />
              </div>
            </div>
            {/* Section 3: Production Flow, Responsibles & Deadlines */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                3. Responsáveis, Etapa & Prazo
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Etapa Atual
                  </label>
                  <Select value={stageInternalId} onValueChange={setStageInternalId}>
                    <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Selecione a etapa..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((st) => (
                        <SelectItem key={st.internal_id} value={st.internal_id}>
                          {st.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Prioridade
                  </label>
                  <Select value={priority} onValueChange={(val: Priority) => setPriority(val)}>
                    <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Prioridade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">🟢 Baixa</SelectItem>
                      <SelectItem value="media">🟡 Média</SelectItem>
                      <SelectItem value="alta">🟠 Alta</SelectItem>
                      <SelectItem value="urgente">🔴 Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Prazo Prometido *
                  </label>
                  <Input
                    type="date"
                    value={promisedDeadline}
                    onChange={(e) => setPromisedDeadline(e.target.value)}
                    className="mt-1 text-xs bg-white dark:bg-slate-900 font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Resp. Atendimento Comercial
                  </label>
                  <Select value={salesRepId} onValueChange={setSalesRepId}>
                    <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Atendente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Resp. Produção / Design
                  </label>
                  <Select value={productionRepId} onValueChange={setProductionRepId}>
                    <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Designer/Produtor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tipo de Entrega
                  </label>
                  <Select
                    value={deliveryType}
                    onValueChange={(val: ProductionDeliveryType) => setDeliveryType(val)}
                  >
                    <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Entrega..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retirada">🏬 Retirada no Balcão</SelectItem>
                      <SelectItem value="envio">📦 Envio / Transportadora</SelectItem>
                      <SelectItem value="entrega_propria">🛵 Entrega Própria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {deliveryType === 'envio' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Código de Rastreamento (se houver)
                  </label>
                  <Input
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="Ex: BR1234567890X"
                    className="mt-1 text-xs bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              )}
            </div>
            {/* Section 4: Customer Files / Order Attachments (Arquivos do Cliente / Anexos do Pedido) */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-emerald-600" />
                  4. Arquivos do Cliente / Anexos do Pedido
                </span>
                {orderToEdit && orderToEdit.attachments && orderToEdit.attachments.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0">
                    {orderToEdit.attachments.length} arquivo(s) salvo(s)
                  </Badge>
                )}
              </div>

              {/* Display existing attachments for this order */}
              {orderToEdit && (
                <div>
                  {!orderToEdit.attachments || orderToEdit.attachments.length === 0 ? (
                    <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                      Nenhum arquivo anexado a este pedido.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {orderToEdit.attachments.map((fileName, idx) => {
                        const fileUrl = productionService.getAttachmentUrl(orderToEdit, fileName)
                        const ext = fileName.split('.').pop()?.toLowerCase() || ''
                        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)
                        const isPdf = ext === 'pdf'
                        const isVector = ['ai', 'cdr', 'psd', 'eps'].includes(ext)
                        const isZip = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)

                        // Clean display name (remove pocketbase random hash suffix if present)
                        const displayName = fileName

                        return (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2.5 text-xs shadow-sm hover:border-emerald-500/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {/* Preview Thumbnail or Extension Icon */}
                              {isImage ? (
                                <div className="h-11 w-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative group/img">
                                  <img
                                    src={fileUrl}
                                    alt={displayName}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              ) : (
                                <div
                                  className={`h-11 w-11 rounded-lg flex flex-col items-center justify-center shrink-0 border ${
                                    isPdf
                                      ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400'
                                      : isVector
                                        ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-400'
                                        : isZip
                                          ? 'bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-950/40 dark:border-purple-900 dark:text-purple-400'
                                          : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                                  }`}
                                >
                                  {isPdf ? (
                                    <FileText className="h-5 w-5" />
                                  ) : isVector ? (
                                    <Layers className="h-5 w-5" />
                                  ) : isZip ? (
                                    <FileArchive className="h-5 w-5" />
                                  ) : (
                                    <File className="h-5 w-5" />
                                  )}
                                  <span className="text-[8px] font-mono font-bold uppercase mt-0.5">
                                    {ext}
                                  </span>
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <span
                                  className="font-medium text-slate-800 dark:text-slate-200 block truncate"
                                  title={displayName}
                                >
                                  {displayName}
                                </span>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <span className="font-mono uppercase font-semibold">
                                    {ext ? `.${ext}` : 'Arquivo'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons: Abrir & Baixar */}
                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition-colors"
                                title="Abrir arquivo em nova aba"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </a>
                              <a
                                href={`${fileUrl}?download=1`}
                                download
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition-colors"
                                title="Baixar arquivo"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Upload New Attachments & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Upload className="h-3.5 w-3.5 text-slate-400" />
                    {orderToEdit ? 'Adicionar Novos Arquivos / Artes' : 'Anexar Arquivos / Artes'}
                  </label>
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => setSelectedFiles(e.target.files)}
                    className="mt-1 text-xs bg-white dark:bg-slate-900"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    PDF, AI, CDR, PSD, PNG, JPG, ZIP até 50MB
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Observações Internas
                  </label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Instruções de impressão, refile ou transporte..."
                    rows={2}
                    className="mt-1 text-xs bg-white dark:bg-slate-900 resize-none"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="pt-3 flex flex-row items-center justify-between">
              {orderToEdit && (
                <a
                  href={`${window.location.origin}/acompanhar/${orderToEdit.tracking_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir Página Pública
                </a>
              )}
              <div className="flex items-center gap-2 ml-auto flex-wrap sm:flex-nowrap">
                {orderToEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleOpenWhatsAppChat}
                    disabled={loading || loadingChatClient}
                    className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300 font-semibold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                    title="Abrir histórico e conversar com o cliente pelo WhatsApp"
                  >
                    <MessageSquare className="h-4 w-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                    {loadingChatClient ? 'Carregando...' : 'Falar com o cliente'}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold min-w-[120px]"
                >
                  {loading
                    ? 'Salvando...'
                    : orderToEdit
                      ? 'Salvar Alterações'
                      : 'Criar Pedido de Produção'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}

        {/* TAB 2: PROOFS & ART APPROVAL */}
        {activeTab === 'proofs' && orderToEdit && (
          <div className="space-y-4 pt-1">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenWhatsAppChat}
                disabled={loading || loadingChatClient}
                className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300 font-semibold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                title="Abrir histórico e conversar com o cliente pelo WhatsApp"
              >
                <MessageSquare className="h-4 w-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                {loadingChatClient ? 'Carregando...' : 'Falar com o cliente'}
              </Button>
            </div>
            {/* Submit new proof banner */}
            <form
              onSubmit={handleSendProof}
              className="p-3.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-purple-950 dark:text-purple-200 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-purple-600" />
                  Enviar Nova Versão da Arte para Aprovação do Cliente
                </h4>
                <Badge className="bg-purple-600 text-white text-[10px]">
                  Versão {proofs.length + 1}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-purple-900 dark:text-purple-300">
                    Link da Prova Digital / Mockup (Canva, Drive, Cloud)
                  </label>
                  <Input
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1 text-xs bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-purple-900 dark:text-purple-300">
                    Arquivo da Prova / PDF / Imagem
                  </label>
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => setProofFiles(e.target.files)}
                    className="mt-1 text-xs bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-purple-900 dark:text-purple-300">
                  Instruções para o Cliente
                </label>
                <Textarea
                  value={proofNotes}
                  onChange={(e) => setProofNotes(e.target.value)}
                  placeholder="Ex: Segue a prova digital com a correção do telefone solicitada. Por favor conferir os textos antes de aprovar."
                  rows={2}
                  className="mt-1 text-xs bg-white dark:bg-slate-900 resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8 font-semibold w-full sm:w-auto"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Disparar Prova e Mover para "Aguardando Aprovação"
              </Button>
            </form>

            {/* List of existing proof versions */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Histórico de Versões & Decisões ({proofs.length})
              </h4>

              {proofs.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  Nenhuma prova digital foi registrada para este pedido ainda.
                </p>
              ) : (
                proofs.map((proof) => (
                  <div
                    key={proof.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Versão #{proof.version_number || 1}
                        </span>
                        <Badge
                          variant={
                            proof.status === 'aprovado'
                              ? 'default'
                              : proof.status === 'alteracao_solicitada'
                                ? 'destructive'
                                : 'outline'
                          }
                          className="text-[10px] px-2 py-0"
                        >
                          {proof.status === 'aprovado' && '✓ Aprovado pelo Cliente'}
                          {proof.status === 'alteracao_solicitada' && '⚠️ Alteração Solicitada'}
                          {proof.status === 'aguardando_aprovacao' && '⏳ Aguardando Aprovação'}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {formatDateTime(proof.created)}
                      </span>
                    </div>

                    {proof.feedback_notes && (
                      <p className="text-slate-600 dark:text-slate-300">
                        <strong>Envio:</strong> {proof.feedback_notes}
                      </p>
                    )}

                    {proof.proof_url && (
                      <a
                        href={proof.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Link2 className="h-3 w-3" />
                        Ver Prova Digital Externa ({proof.proof_url})
                      </a>
                    )}

                    {/* Proof Files (arquivos anexos salvos na prova) */}
                    {proof.proof_file &&
                      (Array.isArray(proof.proof_file)
                        ? proof.proof_file
                        : [proof.proof_file]
                      ).filter(Boolean).length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300 block">
                            Arquivos da Prova:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(Array.isArray(proof.proof_file)
                              ? proof.proof_file
                              : [proof.proof_file]
                            )
                              .filter(Boolean)
                              .map((pFileName, pIdx) => {
                                const pFileUrl = productionService.getProofFileUrl(proof, pFileName)
                                const pExt = pFileName.split('.').pop()?.toLowerCase() || ''
                                const pIsImage = [
                                  'png',
                                  'jpg',
                                  'jpeg',
                                  'webp',
                                  'gif',
                                  'svg',
                                ].includes(pExt)
                                const pIsPdf = pExt === 'pdf'

                                return (
                                  <div
                                    key={pIdx}
                                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/60 flex items-center justify-between gap-2"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {pIsImage ? (
                                        <div className="h-9 w-9 rounded border bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                          <img
                                            src={pFileUrl}
                                            alt={pFileName}
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                          />
                                        </div>
                                      ) : (
                                        <div
                                          className={`h-9 w-9 rounded flex flex-col items-center justify-center shrink-0 border ${
                                            pIsPdf
                                              ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/40'
                                              : 'bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-950/40'
                                          }`}
                                        >
                                          {pIsPdf ? (
                                            <FileText className="h-4 w-4" />
                                          ) : (
                                            <File className="h-4 w-4" />
                                          )}
                                          <span className="text-[7px] font-mono font-bold uppercase">
                                            {pExt}
                                          </span>
                                        </div>
                                      )}

                                      <div className="min-w-0 flex-1">
                                        <span
                                          className="font-medium text-slate-800 dark:text-slate-200 block truncate text-[11px]"
                                          title={pFileName}
                                        >
                                          {pFileName}
                                        </span>
                                        <span className="text-[9px] text-slate-400 uppercase font-mono">
                                          .{pExt}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <a
                                        href={pFileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-purple-600 transition-colors"
                                        title="Abrir arquivo de prova"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </a>
                                      <a
                                        href={`${pFileUrl}?download=1`}
                                        download
                                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-purple-600 transition-colors"
                                        title="Baixar arquivo de prova"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </a>
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      )}

                    {proof.client_comment && (
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border text-[11px] italic">
                        <strong>Comentário do cliente:</strong> "{proof.client_comment}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT & HISTORICAL LOGS */}
        {activeTab === 'history' && orderToEdit && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-blue-600" />
                Linha do Tempo de Auditoria Completa
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenWhatsAppChat}
                disabled={loading || loadingChatClient}
                className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300 font-semibold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                title="Abrir histórico e conversar com o cliente pelo WhatsApp"
              >
                <MessageSquare className="h-4 w-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                {loadingChatClient ? 'Carregando...' : 'Falar com o cliente'}
              </Button>
            </div>

            <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="relative">
                  <div className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {log.from_stage_name ? `${log.from_stage_name} → ` : ''}
                        <span className="text-emerald-600 font-bold">{log.to_stage_name}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDateTime(log.created)}
                      </span>
                    </div>

                    {log.notes && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">{log.notes}</p>
                    )}

                    {log.whatsapp_sent && (
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-1.5 rounded-lg">
                        <MessageSquare className="h-3 w-3 text-emerald-600" />
                        <span>
                          Notificação WhatsApp disparada ao cliente ({log.whatsapp_status})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>

      {/* WhatsApp Chat Drawer vinculado ao cliente do pedido */}
      {orderToEdit && chatClient && (
        <WhatsAppChatDrawer
          isOpen={chatDrawerOpen}
          onClose={() => {
            setChatDrawerOpen(false)
            setChatClient(null)
          }}
          client={chatClient}
          orderContext={{
            id: orderToEdit.id,
            orderNumber: orderToEdit.order_number,
          }}
          onClientUpdated={() => {
            if (chatClient?.id) {
              clientsService.getById(chatClient.id).then((fresh) => {
                if (fresh) setChatClient(fresh)
              })
            }
          }}
        />
      )}
    </Dialog>
  )
}
