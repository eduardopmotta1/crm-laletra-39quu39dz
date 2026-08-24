import pb from '@/lib/pocketbase/client'
import type {
  ProductionOrder,
  ProductionLog,
  ProductionProof,
  ProductionDeadlineStatus,
  ProductionStageInternalId,
} from '@/types/crm'
import { productionStagesService } from './productionStages'

export interface CreateProductionOrderPayload {
  clientId: string
  clientName: string
  clientPhone: string
  clientEmail?: string
  dealOriginId?: string
  product: string
  description?: string
  quantity?: number
  dimensions?: string
  totalValue?: number
  salesRepId?: string
  productionRepId?: string
  promisedDeadline?: string
  deliveryType?: 'retirada' | 'envio' | 'entrega_propria'
  notes?: string
  initialStageId?: ProductionStageInternalId
  priority?: 'baixa' | 'media' | 'alta' | 'urgente'
  attachments?: File[]
}

export const productionService = {
  /**
   * Generates next sequential order number (e.g. #001844)
   */
  async getNextOrderNumber(): Promise<string> {
    try {
      const records = await pb.collection('production_orders').getList<ProductionOrder>(1, 1, {
        sort: '-created',
        requestKey: null,
      })
      if (records.items.length === 0) {
        return '#001844'
      }
      const lastNumStr = records.items[0].order_number.replace(/\D/g, '')
      const lastNum = parseInt(lastNumStr, 10)
      if (isNaN(lastNum)) {
        return `#00${Math.floor(1000 + Math.random() * 9000)}`
      }
      const nextNum = lastNum + 1
      return `#${String(nextNum).padStart(6, '0')}`
    } catch {
      return `#00${Math.floor(1000 + Math.random() * 9000)}`
    }
  },

  /**
   * Generates secure tracking token for public order page
   */
  generateTrackingToken(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let token = 'tk_'
    for (let i = 0; i < 24; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return token
  },

  /**
   * Fetch all production orders with filters
   */
  async getAll(filter?: string, sort = '-created'): Promise<ProductionOrder[]> {
    try {
      return await pb.collection('production_orders').getFullList<ProductionOrder>({
        filter,
        sort,
        expand: 'client_id,sales_rep_id,production_rep_id,stage_id,deal_origin_id',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching production orders:', error)
      return []
    }
  },

  /**
   * Get single order by ID
   */
  async getById(id: string): Promise<ProductionOrder | null> {
    try {
      return await pb.collection('production_orders').getOne<ProductionOrder>(id, {
        expand: 'client_id,sales_rep_id,production_rep_id,stage_id,deal_origin_id',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching production order by ID:', error)
      return null
    }
  },

  /**
   * Get single order by secure tracking token (Public tracking page)
   */
  async getByTrackingToken(token: string): Promise<ProductionOrder | null> {
    try {
      return await pb
        .collection('production_orders')
        .getFirstListItem<ProductionOrder>(`tracking_token = "${token}"`, {
          expand: 'stage_id',
          requestKey: null,
        })
    } catch (error) {
      console.error('Error fetching order by tracking token:', error)
      return null
    }
  },

  /**
   * Get all orders for a client
   */
  async getByClientId(clientId: string): Promise<ProductionOrder[]> {
    try {
      return await pb.collection('production_orders').getFullList<ProductionOrder>({
        filter: `client_id = "${clientId}"`,
        sort: '-created',
        expand: 'stage_id,sales_rep_id,production_rep_id',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching orders for client:', error)
      return []
    }
  },

  /**
   * Create a new production order
   */
  async create(payload: CreateProductionOrderPayload): Promise<ProductionOrder> {
    const orderNumber = await this.getNextOrderNumber()
    const trackingToken = this.generateTrackingToken()
    const nowIso = new Date().toISOString()
    const initialStageId = payload.initialStageId || 'order_received'

    const stage = await productionStagesService.getByInternalId(initialStageId)
    const stageName = stage?.name || 'Pedido recebido'

    const formData = new FormData()
    formData.append('order_number', orderNumber)
    formData.append('tracking_token', trackingToken)
    formData.append('client_id', payload.clientId)
    formData.append('client_name', payload.clientName)
    formData.append('client_phone', payload.clientPhone)
    if (payload.clientEmail) formData.append('client_email', payload.clientEmail)
    if (payload.dealOriginId) formData.append('deal_origin_id', payload.dealOriginId)
    formData.append('sale_date', nowIso)
    formData.append('product', payload.product)
    if (payload.description) formData.append('description', payload.description)
    if (payload.quantity !== undefined) formData.append('quantity', String(payload.quantity))
    if (payload.dimensions) formData.append('dimensions', payload.dimensions)
    if (payload.totalValue !== undefined) formData.append('total_value', String(payload.totalValue))
    if (payload.salesRepId) formData.append('sales_rep_id', payload.salesRepId)
    if (payload.productionRepId) formData.append('production_rep_id', payload.productionRepId)
    if (payload.promisedDeadline) formData.append('promised_deadline', payload.promisedDeadline)
    if (payload.deliveryType) formData.append('delivery_type', payload.deliveryType)
    if (payload.notes) formData.append('notes', payload.notes)
    formData.append('art_approved', 'false')
    if (stage?.id) formData.append('stage_id', stage.id)
    formData.append('stage_internal_id', initialStageId)
    formData.append('stage_name', stageName)
    formData.append('priority', payload.priority || 'media')
    formData.append('is_completed', 'false')
    formData.append('is_archived', 'false')

    if (payload.attachments && payload.attachments.length > 0) {
      for (const file of payload.attachments) {
        formData.append('attachments', file)
      }
    }

    const created = await pb.collection('production_orders').create<ProductionOrder>(formData)

    // Log initial creation
    await this.logTransition({
      orderId: created.id,
      toStageId: initialStageId,
      toStageName: stageName,
      changeType: 'automatic',
      notes: `Pedido criado e registrado com sucesso. Número: ${orderNumber}.`,
      whatsappSent: stage?.auto_notify_whatsapp || false,
      whatsappStatus: stage?.auto_notify_whatsapp ? 'enviado' : 'nao_enviado',
      whatsappMessage: stage?.whatsapp_message_template
        ? stage.whatsapp_message_template
            .replace('{{nome}}', payload.clientName)
            .replace('{{pedido}}', orderNumber)
            .replace(
              '{{link_acompanhamento}}',
              `${window.location.origin}/acompanhar/${trackingToken}`,
            )
        : undefined,
    })

    return created
  },

  /**
   * Update order stage (Kanban drag & drop or action)
   */
  async updateStage(
    orderId: string,
    targetStageInternalId: ProductionStageInternalId,
    options?: {
      notes?: string
      changeType?: 'manual' | 'automatic'
      trackingCode?: string
    },
  ): Promise<ProductionOrder> {
    const currentOrder = await this.getById(orderId)
    if (!currentOrder) throw new Error('Pedido não encontrado.')

    const targetStage = await productionStagesService.getByInternalId(targetStageInternalId)
    const targetStageName = targetStage?.name || targetStageInternalId
    const isCompleted = targetStageInternalId === 'completed'
    const nowIso = new Date().toISOString()

    const updatePayload: Partial<ProductionOrder> = {
      stage_internal_id: targetStageInternalId,
      stage_name: targetStageName,
      stage_id: targetStage?.id,
      is_completed: isCompleted,
    }

    if (isCompleted) {
      updatePayload.completed_at = nowIso
    }

    if (targetStageInternalId === 'approved') {
      updatePayload.art_approved = true
      updatePayload.art_approved_at = nowIso
    }

    if (options?.trackingCode) {
      updatePayload.tracking_code = options.trackingCode
    }

    const updated = await pb
      .collection('production_orders')
      .update<ProductionOrder>(orderId, updatePayload)

    // Prepare WhatsApp automated message template
    let whatsappMessage = ''
    let whatsappSent = false
    let whatsappStatus: 'nao_enviado' | 'enviado' | 'entregue' | 'falhou' = 'nao_enviado'

    if (targetStage?.auto_notify_whatsapp && targetStage.whatsapp_message_template) {
      whatsappMessage = targetStage.whatsapp_message_template
        .replace('{{nome}}', currentOrder.client_name)
        .replace('{{pedido}}', currentOrder.order_number)
        .replace(
          '{{link_acompanhamento}}',
          `${window.location.origin}/acompanhar/${currentOrder.tracking_token}`,
        )
        .replace(
          '{{codigo_rastreio}}',
          options?.trackingCode ? `Código de rastreio: ${options.trackingCode}` : '',
        )

      // Simulate sending WhatsApp dispatch
      whatsappSent = true
      whatsappStatus = 'enviado'

      // Also record message in WhatsApp chat if client is linked
      if (currentOrder.client_id) {
        try {
          await pb.collection('messages').create({
            client_id: currentOrder.client_id,
            direction: 'outbound',
            message_text: `📦 [Produção ${currentOrder.order_number}] ${whatsappMessage}`,
            sender_name: 'Produção Laletra',
            sent_by_user: pb.authStore.record?.id || undefined,
            status: 'sent',
          })
        } catch (e) {
          console.error('Error logging WhatsApp notification in messages:', e)
        }
      }
    }

    // Register full audit log
    await this.logTransition({
      orderId: updated.id,
      fromStageId: currentOrder.stage_internal_id,
      fromStageName: currentOrder.stage_name,
      toStageId: targetStageInternalId,
      toStageName: targetStageName,
      changeType: options?.changeType || 'manual',
      notes: options?.notes || `Movido para ${targetStageName}`,
      whatsappSent,
      whatsappStatus,
      whatsappMessage: whatsappMessage || undefined,
    })

    return updated
  },

  /**
   * Update full order details
   */
  async update(id: string, data: Partial<ProductionOrder>): Promise<ProductionOrder> {
    return await pb.collection('production_orders').update<ProductionOrder>(id, data)
  },

  /**
   * Delete order (rare, soft archive preferred)
   */
  async delete(id: string): Promise<boolean> {
    return await pb.collection('production_orders').delete(id)
  },

  /**
   * Audit Log Transition
   */
  async logTransition(data: {
    orderId: string
    fromStageId?: string
    fromStageName?: string
    toStageId: string
    toStageName: string
    changeType?: 'manual' | 'automatic'
    notes?: string
    whatsappSent?: boolean
    whatsappStatus?: 'nao_enviado' | 'enviado' | 'entregue' | 'falhou'
    whatsappMessage?: string
  }): Promise<ProductionLog | null> {
    try {
      return await pb.collection('production_logs').create<ProductionLog>({
        order_id: data.orderId,
        from_stage_id: data.fromStageId || '',
        from_stage_name: data.fromStageName || '',
        to_stage_id: data.toStageId,
        to_stage_name: data.toStageName,
        user_id: pb.authStore.record?.id || undefined,
        user_name: pb.authStore.record?.name || pb.authStore.record?.email || 'Sistema de Produção',
        change_type: data.changeType || 'manual',
        notes: data.notes || '',
        whatsapp_sent: data.whatsappSent || false,
        whatsapp_status: data.whatsappStatus || 'nao_enviado',
        whatsapp_message: data.whatsappMessage || '',
      })
    } catch (err) {
      console.error('Error logging production transition:', err)
      return null
    }
  },

  /**
   * Get audit logs for an order
   */
  async getLogs(orderId: string): Promise<ProductionLog[]> {
    try {
      return await pb.collection('production_logs').getFullList<ProductionLog>({
        filter: `order_id = "${orderId}"`,
        sort: '-created',
        expand: 'user_id',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching production logs:', error)
      return []
    }
  },

  // ----------------------------------------------------
  // Proofs & Art Approval Methods
  // ----------------------------------------------------

  async getProofs(orderId: string): Promise<ProductionProof[]> {
    try {
      return await pb.collection('production_proofs').getFullList<ProductionProof>({
        filter: `order_id = "${orderId}"`,
        sort: '-created',
        expand: 'sent_by',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching proofs:', error)
      return []
    }
  },

  async registerProofSent(
    orderId: string,
    proofUrl: string,
    proofFiles?: File[],
    feedbackNotes?: string,
  ): Promise<ProductionProof> {
    const proofs = await this.getProofs(orderId)
    const versionNumber = proofs.length + 1

    const formData = new FormData()
    formData.append('order_id', orderId)
    formData.append('version_number', String(versionNumber))
    if (proofUrl) formData.append('proof_url', proofUrl)
    formData.append('sent_at', new Date().toISOString())
    if (pb.authStore.record?.id) formData.append('sent_by', pb.authStore.record.id)
    formData.append('status', 'aguardando_aprovacao')
    if (feedbackNotes) formData.append('feedback_notes', feedbackNotes)

    if (proofFiles && proofFiles.length > 0) {
      for (const f of proofFiles) {
        formData.append('proof_file', f)
      }
    }

    const created = await pb.collection('production_proofs').create<ProductionProof>(formData)

    // Move order to awaiting_approval
    await this.updateStage(orderId, 'awaiting_approval', {
      notes: `Prova digital (V${versionNumber}) enviada para aprovação do cliente.`,
    })

    return created
  },

  async recordProofDecision(
    proofId: string,
    orderId: string,
    decision: 'aprovado' | 'alteracao_solicitada',
    clientComment?: string,
    approvedByContact?: string,
  ): Promise<void> {
    const nowIso = new Date().toISOString()
    await pb.collection('production_proofs').update(proofId, {
      status: decision,
      client_comment: clientComment || '',
      approved_at: decision === 'aprovado' ? nowIso : undefined,
      approved_by_contact: approvedByContact || '',
    })

    if (decision === 'aprovado') {
      await pb.collection('production_orders').update(orderId, {
        art_approved: true,
        art_approved_at: nowIso,
      })
      await this.updateStage(orderId, 'approved', {
        notes: `Arte explicitamente aprovada pelo cliente. Comentário: ${clientComment || 'Sem observações'}.`,
      })
    } else {
      // Returned for adjustments
      await pb.collection('production_orders').update(orderId, {
        art_approved: false,
      })
      await this.updateStage(orderId, 'art_preparation', {
        notes: `Cliente solicitou alteração na arte: "${clientComment || 'Revisão necessária'}". Retornado para Arte em preparação.`,
      })
    }
  },

  /**
   * Calculate Deadline Status & Alerts (yellow for today/tomorrow, red for overdue)
   */
  calculateDeadlineStatus(deadline?: string, isCompleted?: boolean): ProductionDeadlineStatus {
    if (isCompleted) {
      return {
        status: 'completed',
        label: 'Concluído',
        badgeClass:
          'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
        cardBorderClass: 'border-slate-200',
      }
    }

    if (!deadline) {
      return {
        status: 'no_date',
        label: 'Sem prazo',
        badgeClass:
          'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
        cardBorderClass: 'border-slate-200',
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const targetDate = new Date(deadline)
    targetDate.setHours(0, 0, 0, 0)

    const diffTime = targetDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return {
        status: 'overdue',
        daysRemaining: diffDays,
        label: `Atrasado há ${Math.abs(diffDays)} dia(s)`,
        badgeClass:
          'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 animate-pulse',
        cardBorderClass: 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/10',
      }
    }

    if (diffDays === 0) {
      return {
        status: 'due_today',
        daysRemaining: 0,
        label: 'Vence HOJE!',
        badgeClass:
          'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 font-bold',
        cardBorderClass: 'border-amber-400 ring-1 ring-amber-400/30 bg-amber-50/10',
      }
    }

    if (diffDays === 1) {
      return {
        status: 'due_tomorrow',
        daysRemaining: 1,
        label: 'Vence amanhã',
        badgeClass:
          'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300',
        cardBorderClass: 'border-amber-300/80',
      }
    }

    return {
      status: 'normal',
      daysRemaining: diffDays,
      label: `Prazo: ${new Date(deadline).toLocaleDateString('pt-BR')}`,
      badgeClass:
        'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
      cardBorderClass: 'border-slate-200/90 hover:border-emerald-500/50',
    }
  },
}
