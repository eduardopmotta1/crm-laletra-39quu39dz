import pb from '@/lib/pocketbase/client'
import type {
  ProductionOrder,
  ProductionLog,
  ProductionProof,
  ProductionDeadlineStatus,
  ProductionStageInternalId,
} from '@/types/crm'
import { productionStagesService } from './productionStages'
import { settingsService } from './settings'

export interface CreateProductionOrderPayload {
  clientId: string
  attendanceId?: string
  quoteId?: string
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
      const records = await pb.collection('production_orders').getFullList<ProductionOrder>({
        sort: '-created',
        fields: 'order_number',
        requestKey: null,
      })
      if (records.length === 0) {
        return '#001844'
      }
      let maxNum = 0
      for (const r of records) {
        const num = parseInt(r.order_number.replace(/\D/g, ''), 10)
        if (!isNaN(num) && num > maxNum) {
          maxNum = num
        }
      }
      const nextNum = Math.max(maxNum + 1, 1844)
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
   * Get production orders by quote code or ID tag in notes/description (defense-in-depth helper)
   */
  async getByQuoteCode(quoteCode: string): Promise<ProductionOrder[]> {
    if (!quoteCode) return []
    try {
      const cleanCode = quoteCode.replace(/[\\"]/g, '')
      return await pb.collection('production_orders').getFullList<ProductionOrder>({
        filter: `notes ~ "[ORC:${cleanCode}]" || description ~ "[ORC:${cleanCode}]"`,
        sort: '-created',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error finding order by quote code:', error)
      return []
    }
  },

  /**
   * Get production order directly linked to a quote by quote ID / code
   */
  async getByQuoteId(quoteId: string, quoteCode?: string): Promise<ProductionOrder | null> {
    if (!quoteId && !quoteCode) return null
    try {
      // 1. Primary official search by field quote_id
      if (quoteId) {
        const cleanId = quoteId.replace(/[\\"]/g, '')
        const ordersByField = await pb
          .collection('production_orders')
          .getFullList<ProductionOrder>({
            filter: `quote_id = "${cleanId}"`,
            sort: '-created',
            requestKey: null,
          })
        if (ordersByField.length > 0) {
          return ordersByField[0]
        }
      }

      // 2. Fallback search by legacy notes/description tag
      const filters: string[] = []
      if (quoteId) {
        const cleanId = quoteId.replace(/[\\"]/g, '')
        filters.push(`notes ~ "[QUOTE_ID:${cleanId}]"`)
        filters.push(`description ~ "[QUOTE_ID:${cleanId}]"`)
      }
      if (quoteCode) {
        const cleanCode = quoteCode.replace(/[\\"]/g, '')
        filters.push(`notes ~ "[ORC:${cleanCode}]"`)
        filters.push(`description ~ "[ORC:${cleanCode}]"`)
      }
      if (filters.length > 0) {
        const filterStr = filters.join(' || ')
        const orders = await pb.collection('production_orders').getFullList<ProductionOrder>({
          filter: filterStr,
          sort: '-created',
          requestKey: null,
        })
        return orders.length > 0 ? orders[0] : null
      }
      return null
    } catch (error) {
      console.error('Error finding order by quote ID:', error)
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
    const trackingToken = this.generateTrackingToken()
    const todayDateStr = new Date().toISOString().split('T')[0]
    const initialStageId = payload.initialStageId || 'order_received'

    const stage = await productionStagesService.getByInternalId(initialStageId)
    const stageName = stage?.name || 'Pedido recebido'

    const maxRetries = 5
    let created: ProductionOrder | null = null
    let usedOrderNumber = ''

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const orderNumber = await this.getNextOrderNumber()
      usedOrderNumber = orderNumber

      const formData = new FormData()
      formData.append('order_number', orderNumber)
      formData.append('tracking_token', trackingToken)
      if (payload.clientId && payload.clientId.trim()) {
        formData.append('client_id', payload.clientId.trim())
      }
      if (payload.attendanceId && payload.attendanceId.trim()) {
        formData.append('attendance_id', payload.attendanceId.trim())
      }
      if (payload.quoteId && payload.quoteId.trim()) {
        formData.append('quote_id', payload.quoteId.trim())
      }
      formData.append('client_name', payload.clientName.trim())
      formData.append('client_phone', payload.clientPhone.trim())
      if (payload.clientEmail && payload.clientEmail.trim()) {
        formData.append('client_email', payload.clientEmail.trim())
      }
      if (payload.dealOriginId && payload.dealOriginId.trim()) {
        formData.append('deal_origin_id', payload.dealOriginId.trim())
      }
      formData.append('sale_date', todayDateStr)
      formData.append('product', payload.product.trim())
      if (payload.description && payload.description.trim()) {
        formData.append('description', payload.description.trim())
      }
      if (
        payload.quantity !== undefined &&
        payload.quantity !== null &&
        !isNaN(Number(payload.quantity))
      ) {
        formData.append('quantity', String(Number(payload.quantity)))
      }
      if (payload.dimensions && payload.dimensions.trim()) {
        formData.append('dimensions', payload.dimensions.trim())
      }
      if (
        payload.totalValue !== undefined &&
        payload.totalValue !== null &&
        !isNaN(Number(payload.totalValue))
      ) {
        formData.append('total_value', String(Number(payload.totalValue)))
      }
      if (payload.salesRepId && payload.salesRepId.trim()) {
        formData.append('sales_rep_id', payload.salesRepId.trim())
      }
      if (payload.productionRepId && payload.productionRepId.trim()) {
        formData.append('production_rep_id', payload.productionRepId.trim())
      }
      if (payload.promisedDeadline && payload.promisedDeadline.trim()) {
        const deadlineDateStr = payload.promisedDeadline.includes('T')
          ? payload.promisedDeadline.split('T')[0]
          : payload.promisedDeadline.trim()
        formData.append('promised_deadline', deadlineDateStr)
      }
      if (payload.deliveryType) {
        formData.append('delivery_type', payload.deliveryType)
      }
      if (payload.notes && payload.notes.trim()) {
        formData.append('notes', payload.notes.trim())
      }
      formData.append('art_approved', 'false')
      if (stage?.id) formData.append('stage_id', stage.id)
      formData.append('stage_internal_id', initialStageId)
      formData.append('stage_name', stageName)
      formData.append('priority', payload.priority || 'media')
      formData.append('is_completed', 'false')
      formData.append('is_archived', 'false')

      if (payload.attachments && payload.attachments.length > 0) {
        for (const file of payload.attachments) {
          if (file instanceof File) {
            formData.append('attachments', file)
          }
        }
      }

      try {
        created = await pb.collection('production_orders').create<ProductionOrder>(formData)
        break
      } catch (err: any) {
        const orderNumberError = err?.data?.order_number || err?.response?.data?.order_number
        const isUniqueConflict =
          err?.status === 400 &&
          (orderNumberError?.code === 'validation_not_unique' ||
            (typeof orderNumberError?.message === 'string' &&
              orderNumberError.message.toLowerCase().includes('unique')))

        if (isUniqueConflict && attempt < maxRetries - 1) {
          console.warn(
            `[OrderNumber] Collision detected for ${orderNumber}, retrying (${attempt + 1}/${maxRetries})...`,
          )
          continue
        }

        console.error(
          'Error creating production order in PocketBase:',
          {
            message: err?.message,
            status: err?.status,
            url: err?.url,
            data: err?.data || err?.response?.data,
            response: err?.response,
          },
          err,
        )
        throw err
      }
    }

    if (!created) {
      throw new Error('Falha ao criar o pedido de produção.')
    }

    // Log initial creation
    await this.logTransition({
      orderId: created.id,
      toStageId: initialStageId,
      toStageName: stageName,
      changeType: 'automatic',
      notes: `Pedido criado e registrado com sucesso. Número: ${usedOrderNumber}.`,
      whatsappSent: stage?.auto_notify_whatsapp || false,
      whatsappStatus: stage?.auto_notify_whatsapp ? 'enviado' : 'nao_enviado',
      whatsappMessage: stage?.whatsapp_message_template
        ? stage.whatsapp_message_template
            .replace('{{nome}}', payload.clientName)
            .replace('{{pedido}}', usedOrderNumber)
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
    const todayDateStr = new Date().toISOString().split('T')[0]

    const updatePayload: Partial<ProductionOrder> = {
      stage_internal_id: targetStageInternalId,
      stage_name: targetStageName,
      stage_id: targetStage?.id,
      is_completed: isCompleted,
    }

    if (isCompleted) {
      updatePayload.completed_at = todayDateStr
    }

    if (targetStageInternalId === 'approved') {
      updatePayload.art_approved = true
      updatePayload.art_approved_at = todayDateStr
    }

    if (options?.trackingCode) {
      updatePayload.tracking_code = options.trackingCode
    }

    const updated = await pb
      .collection('production_orders')
      .update<ProductionOrder>(orderId, updatePayload)

    // Trigger Post-Sales automatically ONLY when order enters 'completed' stage
    if (isCompleted) {
      try {
        await this.triggerPostSaleForOrder(updated)
      } catch (err) {
        console.error('Error triggering post sale for completed order:', err)
      }
    }

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
   * Trigger Post-Sales routine and generate exclusive evaluation link when order is completed
   * Checks for duplicate post-sales for the same production order.
   */
  async triggerPostSaleForOrder(order: ProductionOrder): Promise<void> {
    const postSaleCfg = await settingsService.getPostSaleConfig()

    if (!postSaleCfg.enabled) {
      return
    }

    // 1. Check if post-sales already exists for this order to prevent duplicates
    try {
      const existing = await pb.collection('post_sales').getFullList({
        filter: `order_id = "${order.id}"`,
        requestKey: null,
      })
      if (existing && existing.length > 0) {
        // Already initiated post sale for this order
        return
      }
    } catch {
      /* intentionally ignored */
    }

    // 2. Compute scheduled date based on delay days setting
    const delayDays = postSaleCfg.delayDays || 3
    const scheduledDateObj = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000)
    const scheduledDateStr = scheduledDateObj.toISOString().split('T')[0]

    // 3. Generate secure evaluation token
    const evalToken =
      'eval_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36)

    // 4. Pre-create evaluation record linked to client and order
    try {
      await pb.collection('evaluations').create({
        token: evalToken,
        client_id: order.client_id,
        order_id: order.id,
        order_number: order.order_number,
        attendance_id: order.deal_origin_id || undefined,
        overall_rating: 0,
      })
    } catch (e) {
      console.error('Error pre-creating evaluation record for order:', e)
    }

    // 5. Create follow-up Task in CRM if autoTask is enabled
    let taskId: string | undefined = undefined
    if (postSaleCfg.autoTask) {
      try {
        const task = await pb.collection('tasks').create({
          title: `⭐ Pós-venda [Pedido ${order.order_number}]: ${order.client_name}`,
          description: `Realizar contato de pós-venda para verificar entrega do pedido ${order.order_number} (${order.product}) e coletar avaliação do cliente. Link de avaliação: ${window.location.origin}/avaliacao/${evalToken}`,
          client_id: order.client_id,
          assigned_to: order.sales_rep_id || pb.authStore.record?.id,
          due_date: scheduledDateStr,
          status: 'pendente',
          priority: 'media',
        })
        taskId = task.id
      } catch (err) {
        console.error('Error creating post sale task for order:', err)
      }
    }

    // 6. Create post_sales record linked to order
    await pb.collection('post_sales').create({
      client_id: order.client_id,
      order_id: order.id,
      order_number: order.order_number,
      attendance_id: order.deal_origin_id || undefined,
      scheduled_date: scheduledDateStr,
      status: 'pending',
      task_id: taskId,
      evaluation_token: evalToken,
      channel: 'whatsapp',
      notes: `Agendado para ${delayDays} dia(s) após conclusão do pedido de produção ${order.order_number}.`,
    })
  },

  /**
   * Update full order details
   */
  async update(id: string, data: Partial<ProductionOrder>): Promise<ProductionOrder> {
    const sanitizedData = { ...data }
    const dateFields = [
      'sale_date',
      'promised_deadline',
      'estimated_delivery_date',
      'completed_at',
      'art_approved_at',
    ]

    for (const key of dateFields) {
      const val = (sanitizedData as any)[key]
      if (typeof val === 'string' && val.includes('T')) {
        ;(sanitizedData as any)[key] = val.split('T')[0]
      }
    }

    return await pb.collection('production_orders').update<ProductionOrder>(id, sanitizedData)
  },

  /**
   * Archive a production order (soft archive)
   */
  async archiveOrder(id: string, notes?: string): Promise<ProductionOrder> {
    const currentOrder = await this.getById(id)
    if (!currentOrder) throw new Error('Pedido não encontrado.')

    const updated = await pb.collection('production_orders').update<ProductionOrder>(id, {
      is_archived: true,
    })

    await this.logTransition({
      orderId: updated.id,
      fromStageId: currentOrder.stage_internal_id,
      fromStageName: currentOrder.stage_name,
      toStageId: 'archived',
      toStageName: 'Arquivado',
      changeType: 'manual',
      notes:
        notes ||
        `Pedido arquivado. Status anterior: ${currentOrder.stage_name || currentOrder.stage_internal_id}.`,
    })

    return updated
  },

  /**
   * Reopen an archived production order into a specific target stage
   */
  async reopenOrder(
    id: string,
    targetStageInternalId: ProductionStageInternalId = 'order_received',
    notes?: string,
  ): Promise<ProductionOrder> {
    const currentOrder = await this.getById(id)
    if (!currentOrder) throw new Error('Pedido não encontrado.')

    const targetStage = await productionStagesService.getByInternalId(targetStageInternalId)
    const targetStageName = targetStage?.name || targetStageInternalId
    const isCompleted = targetStageInternalId === 'completed'

    const updatePayload: Partial<ProductionOrder> = {
      is_archived: false,
      stage_internal_id: targetStageInternalId,
      stage_name: targetStageName,
      stage_id: targetStage?.id,
      is_completed: isCompleted,
    }

    const updated = await pb
      .collection('production_orders')
      .update<ProductionOrder>(id, updatePayload)

    await this.logTransition({
      orderId: updated.id,
      fromStageId: 'archived',
      fromStageName: 'Arquivado',
      toStageId: targetStageInternalId,
      toStageName: targetStageName,
      changeType: 'manual',
      notes:
        notes ||
        `Pedido reaberto da lixeira/arquivo para a etapa "${targetStageName}". Status anterior: Arquivado.`,
    })

    return updated
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

  /**
   * Get file URL for production order attachment
   */
  getAttachmentUrl(order: ProductionOrder, fileName: string): string {
    if (!order || !fileName) return ''
    return pb.files.getURL(order, fileName)
  },

  /**
   * Get file URL for production proof file
   */
  getProofFileUrl(proof: ProductionProof, fileName: string): string {
    if (!proof || !fileName) return ''
    return pb.files.getURL(proof, fileName)
  },

  async getProofs(orderId: string): Promise<ProductionProof[]> {
    try {
      return await pb.collection('production_proofs').getFullList<ProductionProof>({
        filter: `order_id = "${orderId}"`,
        sort: 'created',
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
    formData.append('sent_at', new Date().toISOString().split('T')[0])
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
    const todayDateStr = new Date().toISOString().split('T')[0]
    await pb.collection('production_proofs').update(proofId, {
      status: decision,
      client_comment: clientComment || '',
      approved_at: decision === 'aprovado' ? todayDateStr : undefined,
      approved_by_contact: approvedByContact || '',
    })

    if (decision === 'aprovado') {
      await pb.collection('production_orders').update(orderId, {
        art_approved: true,
        art_approved_at: todayDateStr,
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
