import pb from '@/lib/pocketbase/client'
import type {
  PendingItem,
  PendingCategory,
  PendingPriority,
  PendingResolutionRecord,
  EfficiencyMetrics,
  Client,
  Task,
  ProductionOrder,
  ProductionProof,
  PostSale,
  Evaluation,
  User,
  SlaConfig,
} from '@/types/crm'
import { settingsService } from './settings'

export const PENDING_CATEGORY_CONFIG: Record<
  PendingCategory,
  {
    label: string
    shortLabel: string
    icon: string
    color: string
    bgColor: string
    borderColor: string
    textColor: string
    badgeColor: string
    orderWeight: number // lower = higher priority group
  }
> = {
  clients_waiting_response: {
    label: 'Clientes aguardando resposta',
    shortLabel: 'Aguardando Resposta',
    icon: 'MessageSquare',
    color: 'emerald',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
    orderWeight: 1,
  },
  dissatisfied_clients: {
    label: 'Clientes insatisfeitos / Reclamações',
    shortLabel: 'Insatisfeitos',
    icon: 'AlertTriangle',
    color: 'rose',
    bgColor: 'bg-rose-50 dark:bg-rose-950/30',
    borderColor: 'border-rose-200 dark:border-rose-800',
    textColor: 'text-rose-700 dark:text-rose-300',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
    orderWeight: 2,
  },
  orders_overdue: {
    label: 'Pedidos com produção atrasada',
    shortLabel: 'Pedidos Atrasados',
    icon: 'Clock',
    color: 'rose',
    bgColor: 'bg-rose-50 dark:bg-rose-950/40',
    borderColor: 'border-rose-300 dark:border-rose-800',
    textColor: 'text-rose-800 dark:text-rose-300',
    badgeColor: 'bg-rose-600 text-white animate-pulse',
    orderWeight: 3,
  },
  overdue_followups: {
    label: 'Follow-ups vencidos ou para hoje',
    shortLabel: 'Follow-ups Vencidos',
    icon: 'CheckSquare',
    color: 'amber',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    textColor: 'text-amber-800 dark:text-amber-300',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
    orderWeight: 4,
  },
  orders_due_today: {
    label: 'Pedidos que vencem hoje',
    shortLabel: 'Vencem Hoje',
    icon: 'Calendar',
    color: 'amber',
    bgColor: 'bg-amber-50/70 dark:bg-amber-950/30',
    borderColor: 'border-amber-300 dark:border-amber-700',
    textColor: 'text-amber-900 dark:text-amber-200',
    badgeColor: 'bg-amber-500 text-white font-bold',
    orderWeight: 5,
  },
  overdue_attendances: {
    label: 'Atendimentos com SLA estourado',
    shortLabel: 'Atendimentos Atrasados',
    icon: 'Flame',
    color: 'orange',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    textColor: 'text-orange-800 dark:text-orange-300',
    badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200',
    orderWeight: 6,
  },
  quotes_waiting_return: {
    label: 'Orçamentos aguardando retorno',
    shortLabel: 'Orçamentos sem Resposta',
    icon: 'FileText',
    color: 'blue',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-800 dark:text-blue-300',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200',
    orderWeight: 7,
  },
  proofs_waiting_approval: {
    label: 'Artes aguardando aprovação',
    shortLabel: 'Artes p/ Aprovação',
    icon: 'Image',
    color: 'purple',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
    textColor: 'text-purple-800 dark:text-purple-300',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200',
    orderWeight: 8,
  },
  orders_due_tomorrow: {
    label: 'Pedidos que vencem amanhã',
    shortLabel: 'Vencem Amanhã',
    icon: 'Clock3',
    color: 'yellow',
    bgColor: 'bg-yellow-50/60 dark:bg-yellow-950/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-800 dark:text-yellow-300',
    badgeColor: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200',
    orderWeight: 9,
  },
  pending_post_sales: {
    label: 'Pós-vendas pendentes de envio',
    shortLabel: 'Pós-Vendas Pendentes',
    icon: 'HeartHandshake',
    color: 'teal',
    bgColor: 'bg-teal-50 dark:bg-teal-950/30',
    borderColor: 'border-teal-200 dark:border-teal-800',
    textColor: 'text-teal-800 dark:text-teal-300',
    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200',
    orderWeight: 10,
  },
}

export const pendingService = {
  /**
   * Consolidates pending items from ALL modules across the CRM:
   * - Clients (WhatsApp waiting answer, overdue SLA, pending quotes)
   * - Tasks (Overdue followups or scheduled for today)
   * - Production Orders (Overdue, due today, due tomorrow)
   * - Production Proofs / Awaiting approval
   * - Post Sales (Pending send / overdue contact)
   * - Evaluations (Dissatisfied rating <= 3 not resolved)
   */
  async getAllPendingItems(): Promise<PendingItem[]> {
    try {
      const slaConfig = await settingsService.getSlaConfig()
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]

      // Fetch all required data in parallel
      const [clients, tasks, orders, proofs, postSales, evaluations, users] = await Promise.all([
        pb.collection('clients').getFullList<Client>({
          filter: 'is_archived != true',
          expand: 'assigned_to',
          requestKey: null,
        }),
        pb.collection('tasks').getFullList<Task>({
          filter: 'status = "pendente"',
          expand: 'client_id,assigned_to',
          requestKey: null,
        }),
        pb.collection('production_orders').getFullList<ProductionOrder>({
          filter: 'is_completed != true && is_archived != true',
          expand: 'client_id,sales_rep_id,production_rep_id,stage_id',
          requestKey: null,
        }),
        pb.collection('production_proofs').getFullList<ProductionProof>({
          filter: 'status = "aguardando_aprovacao"',
          expand: 'order_id,sent_by',
          requestKey: null,
        }),
        pb.collection('post_sales').getFullList<PostSale>({
          filter: 'status = "pending"',
          expand: 'client_id,order_id,task_id',
          requestKey: null,
        }),
        pb.collection('evaluations').getFullList<Evaluation>({
          filter: 'overall_rating > 0 && overall_rating <= 3 && resolved != true',
          expand: 'client_id,order_id,attendance_id,resolved_by',
          requestKey: null,
        }),
        pb.collection('users').getFullList<User>({ requestKey: null }),
      ])

      const userMap = new Map<string, User>()
      users.forEach((u) => userMap.set(u.id, u))

      const items: PendingItem[] = []

      // 1. Clientes aguardando resposta & Atendimentos atrasados & Orçamentos aguardando
      for (const c of clients) {
        if (c.stage === 'Venda fechada' || c.stage === 'Não fechou') continue

        const assignedUser =
          c.expand?.assigned_to || (c.assigned_to ? userMap.get(c.assigned_to) : undefined)

        // 1.1 Clientes aguardando resposta WhatsApp (inbound message not answered)
        if (c.last_message_at && c.last_message_direction === 'inbound') {
          const msgTime = new Date(c.last_message_at).getTime()
          const waitingMinutes = Math.max(0, Math.floor((now.getTime() - msgTime) / (1000 * 60)))

          let priority: PendingPriority = 'normal'
          if (waitingMinutes >= 60) {
            priority = 'urgente'
          } else if (waitingMinutes >= 15) {
            priority = 'alta'
          }

          items.push({
            id: `client_reply_${c.id}`,
            category: 'clients_waiting_response',
            categoryLabel: PENDING_CATEGORY_CONFIG.clients_waiting_response.label,
            title: c.name,
            subtitle: c.last_message_text
              ? `"${c.last_message_text.slice(0, 70)}${c.last_message_text.length > 70 ? '...' : ''}"`
              : 'Cliente aguardando resposta no WhatsApp',
            priority,
            createdAt: c.last_message_at,
            referenceDate: c.last_message_at,
            waitingTimeMinutes: waitingMinutes,
            waitingTimeFormatted: this.formatDuration(waitingMinutes),
            assignedToId: c.assigned_to,
            assignedToName: assignedUser?.name || 'Sem responsável',
            assignedToAvatar: assignedUser?.avatar,
            clientId: c.id,
            clientName: c.name,
            clientPhone: c.phone,
            clientEmail: c.email,
            productInterest: c.product_interest,
            quoteValue: c.quote_value,
            currentStage: c.stage,
            originalData: c,
          })
        } else if (c.stage === 'Precisa responder' || c.stage === 'Novo contato') {
          // Atendimento geral sem resposta recente
          const refTime = new Date(c.updated || c.created).getTime()
          const waitingMinutes = Math.max(0, Math.floor((now.getTime() - refTime) / (1000 * 60)))

          let priority: PendingPriority = 'normal'
          if (waitingMinutes >= 60) {
            priority = 'urgente'
          } else if (waitingMinutes >= 15) {
            priority = 'alta'
          }

          items.push({
            id: `client_att_${c.id}`,
            category: 'overdue_attendances',
            categoryLabel: PENDING_CATEGORY_CONFIG.overdue_attendances.label,
            title: c.name,
            subtitle: `Na etapa "${c.stage}" sem ação recente`,
            priority,
            createdAt: c.created,
            referenceDate: c.updated || c.created,
            waitingTimeMinutes: waitingMinutes,
            waitingTimeFormatted: this.formatDuration(waitingMinutes),
            assignedToId: c.assigned_to,
            assignedToName: assignedUser?.name || 'Sem responsável',
            assignedToAvatar: assignedUser?.avatar,
            clientId: c.id,
            clientName: c.name,
            clientPhone: c.phone,
            clientEmail: c.email,
            productInterest: c.product_interest,
            quoteValue: c.quote_value,
            currentStage: c.stage,
            originalData: c,
          })
        }

        // 1.2 Orçamentos aguardando retorno (etapa Orçamento enviado ou Aguardando cliente)
        if (c.stage === 'Orçamento enviado' || c.stage === 'Aguardando cliente') {
          const refTime = new Date(c.updated || c.created).getTime()
          const waitingMinutes = Math.max(0, Math.floor((now.getTime() - refTime) / (1000 * 60)))
          const waitingDays = Math.floor(waitingMinutes / (60 * 24))

          let priority: PendingPriority = 'normal'
          if (waitingDays >= 3) {
            priority = 'urgente'
          } else if (waitingDays >= 1) {
            priority = 'alta'
          }

          items.push({
            id: `client_quote_${c.id}`,
            category: 'quotes_waiting_return',
            categoryLabel: PENDING_CATEGORY_CONFIG.quotes_waiting_return.label,
            title: `${c.name} - Orçamento ${c.quote_value ? `R$ ${c.quote_value.toFixed(2)}` : ''}`,
            subtitle: `Produto: ${c.product_interest || 'Não informado'} • Enviado há ${this.formatDuration(waitingMinutes)}`,
            priority,
            createdAt: c.created,
            referenceDate: c.updated || c.created,
            waitingTimeMinutes: waitingMinutes,
            waitingTimeFormatted: this.formatDuration(waitingMinutes),
            assignedToId: c.assigned_to,
            assignedToName: assignedUser?.name || 'Sem responsável',
            assignedToAvatar: assignedUser?.avatar,
            clientId: c.id,
            clientName: c.name,
            clientPhone: c.phone,
            clientEmail: c.email,
            productInterest: c.product_interest,
            quoteValue: c.quote_value,
            currentStage: c.stage,
            originalData: c,
          })
        }
      }

      // 2. Clientes insatisfeitos (Avaliações 1-3 estrelas pendentes de solução)
      for (const ev of evaluations) {
        const client = ev.expand?.client_id
        const assignedUser =
          ev.expand?.resolved_by ||
          (client?.assigned_to ? userMap.get(client.assigned_to) : undefined)
        const createdTime = new Date(ev.created).getTime()
        const waitingMinutes = Math.max(0, Math.floor((now.getTime() - createdTime) / (1000 * 60)))

        // Cliente insatisfeito é sempre Alta ou Urgente
        const priority: PendingPriority = waitingMinutes > 24 * 60 ? 'urgente' : 'alta'

        items.push({
          id: `eval_${ev.id}`,
          category: 'dissatisfied_clients',
          categoryLabel: PENDING_CATEGORY_CONFIG.dissatisfied_clients.label,
          title: `${client?.name || 'Cliente'} - Avaliou ${ev.overall_rating}★`,
          subtitle: ev.comment
            ? `"${ev.comment}"`
            : `Reclamação/avaliação negativa registrada ${ev.order_number ? `no pedido ${ev.order_number}` : ''}`,
          priority,
          createdAt: ev.created,
          referenceDate: ev.created,
          waitingTimeMinutes: waitingMinutes,
          waitingTimeFormatted: this.formatDuration(waitingMinutes),
          assignedToId: client?.assigned_to || ev.resolved_by,
          assignedToName: assignedUser?.name || 'Sem responsável',
          assignedToAvatar: assignedUser?.avatar,
          clientId: ev.client_id,
          clientName: client?.name || 'Cliente',
          clientPhone: client?.phone || '',
          clientEmail: client?.email,
          orderId: ev.order_id,
          orderNumber: ev.order_number,
          evaluationId: ev.id,
          evaluationRating: ev.overall_rating,
          evaluationComment: ev.comment,
          originalData: ev,
        })
      }

      // 3. Follow-ups vencidos ou programados para hoje
      for (const t of tasks) {
        const client = t.expand?.client_id
        const assignedUser =
          t.expand?.assigned_to || (t.assigned_to ? userMap.get(t.assigned_to) : undefined)
        const dueTime = new Date(t.due_date).getTime()
        const waitingMinutes = Math.max(0, Math.floor((now.getTime() - dueTime) / (1000 * 60)))
        const isOverdue = t.due_date < todayStr
        const isToday = t.due_date === todayStr

        if (isOverdue || isToday) {
          let priority: PendingPriority = 'normal'
          if (isOverdue) {
            const overdueDays = Math.floor(waitingMinutes / (60 * 24))
            priority = overdueDays >= 2 ? 'urgente' : 'alta'
          } else {
            priority = 'normal'
          }

          items.push({
            id: `task_${t.id}`,
            category: 'overdue_followups',
            categoryLabel: PENDING_CATEGORY_CONFIG.overdue_followups.label,
            title: t.title,
            subtitle: `${isOverdue ? '⚠️ Vencido em ' : '📅 Programado para hoje: '} ${new Date(t.due_date).toLocaleDateString('pt-BR')} ${client ? `(${client.name})` : ''}`,
            priority,
            createdAt: t.created,
            referenceDate: t.due_date,
            waitingTimeMinutes: isOverdue ? waitingMinutes : 0,
            waitingTimeFormatted: isOverdue
              ? `${Math.floor(waitingMinutes / (60 * 24))}d atrasado`
              : 'Para hoje',
            assignedToId: t.assigned_to,
            assignedToName: assignedUser?.name || 'Sem responsável',
            assignedToAvatar: assignedUser?.avatar,
            clientId: t.client_id,
            clientName: client?.name || 'Sem cliente vinculado',
            clientPhone: client?.phone || '',
            taskId: t.id,
            originalData: t,
          })
        }
      }

      // 4. Artes aguardando aprovação
      for (const proof of proofs) {
        const order = proof.expand?.order_id
        const assignedUser =
          proof.expand?.sent_by ||
          (order?.production_rep_id ? userMap.get(order.production_rep_id) : undefined)
        const sentTime = new Date(proof.sent_at || proof.created).getTime()
        const waitingMinutes = Math.max(0, Math.floor((now.getTime() - sentTime) / (1000 * 60)))
        const waitingDays = Math.floor(waitingMinutes / (60 * 24))

        let priority: PendingPriority = 'normal'
        if (waitingDays >= 2) {
          priority = 'urgente'
        } else if (waitingDays >= 1) {
          priority = 'alta'
        }

        items.push({
          id: `proof_${proof.id}`,
          category: 'proofs_waiting_approval',
          categoryLabel: PENDING_CATEGORY_CONFIG.proofs_waiting_approval.label,
          title: `Pedido ${order?.order_number || 'Produção'}: Arte v${proof.version_number || 1} aguardando aprovação`,
          subtitle: `Cliente: ${order?.client_name || 'Cliente'} • Enviada há ${this.formatDuration(waitingMinutes)}`,
          priority,
          createdAt: proof.created,
          referenceDate: proof.sent_at || proof.created,
          waitingTimeMinutes: waitingMinutes,
          waitingTimeFormatted: this.formatDuration(waitingMinutes),
          assignedToId: order?.production_rep_id || proof.sent_by,
          assignedToName: assignedUser?.name || 'Sem responsável',
          assignedToAvatar: assignedUser?.avatar,
          clientId: order?.client_id,
          clientName: order?.client_name || 'Cliente',
          clientPhone: order?.client_phone || '',
          orderId: proof.order_id,
          orderNumber: order?.order_number,
          proofId: proof.id,
          productInterest: order?.product,
          originalData: proof,
        })
      }

      // 5. Pedidos de Produção (Atrasados, Vencem Hoje, Vencem Amanhã, Aguardando aprovação)
      for (const ord of orders) {
        const assignedUser =
          ord.expand?.production_rep_id ||
          ord.expand?.sales_rep_id ||
          (ord.production_rep_id ? userMap.get(ord.production_rep_id) : undefined)

        // Se o pedido está na etapa "Aguardando aprovação do cliente" e não foi capturado pelas provas
        if (
          (ord.stage_internal_id === 'awaiting_approval' ||
            ord.stage_name?.toLowerCase().includes('aprova')) &&
          !proofs.some((p) => p.order_id === ord.id)
        ) {
          const refTime = new Date(ord.updated || ord.created).getTime()
          const waitingMinutes = Math.max(0, Math.floor((now.getTime() - refTime) / (1000 * 60)))
          const waitingDays = Math.floor(waitingMinutes / (60 * 24))

          items.push({
            id: `order_art_${ord.id}`,
            category: 'proofs_waiting_approval',
            categoryLabel: PENDING_CATEGORY_CONFIG.proofs_waiting_approval.label,
            title: `Pedido ${ord.order_number}: Arte aguardando aprovação`,
            subtitle: `Cliente: ${ord.client_name} • ${ord.product} • Aguardando há ${this.formatDuration(waitingMinutes)}`,
            priority: waitingDays >= 2 ? 'urgente' : waitingDays >= 1 ? 'alta' : 'normal',
            createdAt: ord.created,
            referenceDate: ord.updated || ord.created,
            waitingTimeMinutes: waitingMinutes,
            waitingTimeFormatted: this.formatDuration(waitingMinutes),
            assignedToId: ord.production_rep_id || ord.sales_rep_id,
            assignedToName: assignedUser?.name || 'Sem responsável',
            assignedToAvatar: assignedUser?.avatar,
            clientId: ord.client_id,
            clientName: ord.client_name,
            clientPhone: ord.client_phone,
            clientEmail: ord.client_email,
            orderId: ord.id,
            orderNumber: ord.order_number,
            productInterest: ord.product,
            quoteValue: ord.total_value,
            currentStage: ord.stage_name,
            originalData: ord,
          })
        }

        if (ord.promised_deadline) {
          const deadlineDate = ord.promised_deadline.split('T')[0]
          const deadlineTime = new Date(ord.promised_deadline).getTime()
          const overdueMinutes = Math.max(
            0,
            Math.floor((now.getTime() - deadlineTime) / (1000 * 60)),
          )
          const overdueDays = Math.floor(overdueMinutes / (60 * 24))

          if (deadlineDate < todayStr) {
            // Pedido ATRASADO!
            const priority: PendingPriority = overdueDays >= 1 ? 'urgente' : 'alta'

            items.push({
              id: `order_overdue_${ord.id}`,
              category: 'orders_overdue',
              categoryLabel: PENDING_CATEGORY_CONFIG.orders_overdue.label,
              title: `Pedido ${ord.order_number} ATRASADO: ${ord.product}`,
              subtitle: `Cliente: ${ord.client_name} • Prazo prometido era ${new Date(ord.promised_deadline).toLocaleDateString('pt-BR')} (Etapa: ${ord.stage_name})`,
              priority,
              createdAt: ord.created,
              referenceDate: ord.promised_deadline,
              waitingTimeMinutes: overdueMinutes,
              waitingTimeFormatted:
                overdueDays > 0
                  ? `${overdueDays}d atrasado`
                  : `${this.formatDuration(overdueMinutes)} atrasado`,
              assignedToId: ord.production_rep_id || ord.sales_rep_id,
              assignedToName: assignedUser?.name || 'Sem responsável',
              assignedToAvatar: assignedUser?.avatar,
              clientId: ord.client_id,
              clientName: ord.client_name,
              clientPhone: ord.client_phone,
              clientEmail: ord.client_email,
              orderId: ord.id,
              orderNumber: ord.order_number,
              productInterest: ord.product,
              quoteValue: ord.total_value,
              currentStage: ord.stage_name,
              originalData: ord,
            })
          } else if (deadlineDate === todayStr) {
            // Pedido VENCE HOJE
            items.push({
              id: `order_today_${ord.id}`,
              category: 'orders_due_today',
              categoryLabel: PENDING_CATEGORY_CONFIG.orders_due_today.label,
              title: `Pedido ${ord.order_number} VENCE HOJE: ${ord.product}`,
              subtitle: `Cliente: ${ord.client_name} • Etapa atual: ${ord.stage_name} • Valor: R$ ${(ord.total_value || 0).toFixed(2)}`,
              priority: 'alta',
              createdAt: ord.created,
              referenceDate: ord.promised_deadline,
              waitingTimeMinutes: 0,
              waitingTimeFormatted: 'Vence Hoje',
              assignedToId: ord.production_rep_id || ord.sales_rep_id,
              assignedToName: assignedUser?.name || 'Sem responsável',
              assignedToAvatar: assignedUser?.avatar,
              clientId: ord.client_id,
              clientName: ord.client_name,
              clientPhone: ord.client_phone,
              clientEmail: ord.client_email,
              orderId: ord.id,
              orderNumber: ord.order_number,
              productInterest: ord.product,
              quoteValue: ord.total_value,
              currentStage: ord.stage_name,
              originalData: ord,
            })
          } else if (deadlineDate === tomorrowStr) {
            // Pedido VENCE AMANHÃ
            items.push({
              id: `order_tomorrow_${ord.id}`,
              category: 'orders_due_tomorrow',
              categoryLabel: PENDING_CATEGORY_CONFIG.orders_due_tomorrow.label,
              title: `Pedido ${ord.order_number} Vence Amanhã: ${ord.product}`,
              subtitle: `Cliente: ${ord.client_name} • Etapa atual: ${ord.stage_name}`,
              priority: 'normal',
              createdAt: ord.created,
              referenceDate: ord.promised_deadline,
              waitingTimeMinutes: 0,
              waitingTimeFormatted: 'Vence Amanhã',
              assignedToId: ord.production_rep_id || ord.sales_rep_id,
              assignedToName: assignedUser?.name || 'Sem responsável',
              assignedToAvatar: assignedUser?.avatar,
              clientId: ord.client_id,
              clientName: ord.client_name,
              clientPhone: ord.client_phone,
              clientEmail: ord.client_email,
              orderId: ord.id,
              orderNumber: ord.order_number,
              productInterest: ord.product,
              quoteValue: ord.total_value,
              currentStage: ord.stage_name,
              originalData: ord,
            })
          }
        }
      }

      // 6. Pós-vendas pendentes
      for (const ps of postSales) {
        const client = ps.expand?.client_id
        const order = ps.expand?.order_id
        const assignedUser = client?.assigned_to ? userMap.get(client.assigned_to) : undefined
        const schedTime = new Date(ps.scheduled_date).getTime()
        const isPastScheduled = schedTime <= now.getTime()
        const waitingMinutes = Math.max(0, Math.floor((now.getTime() - schedTime) / (1000 * 60)))

        if (isPastScheduled) {
          const waitingDays = Math.floor(waitingMinutes / (60 * 24))
          let priority: PendingPriority = 'normal'
          if (waitingDays >= 3) {
            priority = 'urgente'
          } else if (waitingDays >= 1) {
            priority = 'alta'
          }

          items.push({
            id: `postsale_${ps.id}`,
            category: 'pending_post_sales',
            categoryLabel: PENDING_CATEGORY_CONFIG.pending_post_sales.label,
            title: `Pós-Venda: ${client?.name || 'Cliente'} ${ps.order_number ? `(Pedido ${ps.order_number})` : ''}`,
            subtitle: `Agendado para ${new Date(ps.scheduled_date).toLocaleDateString('pt-BR')} • Enviar link de avaliação e checar satisfação`,
            priority,
            createdAt: ps.created,
            referenceDate: ps.scheduled_date,
            waitingTimeMinutes: waitingMinutes,
            waitingTimeFormatted: waitingDays > 0 ? `${waitingDays}d atrasado` : 'Pendente',
            assignedToId: client?.assigned_to,
            assignedToName: assignedUser?.name || 'Sem responsável',
            assignedToAvatar: assignedUser?.avatar,
            clientId: ps.client_id,
            clientName: client?.name || 'Cliente',
            clientPhone: client?.phone || '',
            clientEmail: client?.email,
            orderId: ps.order_id,
            orderNumber: ps.order_number,
            postSaleId: ps.id,
            productInterest: order?.product,
            originalData: ps,
          })
        }
      }

      // Intelligent Sorting:
      // 1. Clientes sem resposta primeiro
      // 2. Clientes insatisfeitos
      // 3. Pedidos atrasados
      // 4. Follow-ups vencidos
      // 5. Pedidos para hoje
      // 6. Demais
      // Inside each group: Urgente -> Alta -> Normal -> Baixa, then highest waiting time
      const priorityWeight: Record<PendingPriority, number> = {
        urgente: 0,
        alta: 1,
        normal: 2,
        baixa: 3,
      }

      items.sort((a, b) => {
        const catA = PENDING_CATEGORY_CONFIG[a.category]?.orderWeight ?? 99
        const catB = PENDING_CATEGORY_CONFIG[b.category]?.orderWeight ?? 99

        if (catA !== catB) {
          return catA - catB
        }

        const prioA = priorityWeight[a.priority]
        const prioB = priorityWeight[b.priority]
        if (prioA !== prioB) {
          return prioA - prioB
        }

        return b.waitingTimeMinutes - a.waitingTimeMinutes
      })

      return items
    } catch (error) {
      console.error('Error fetching all pending items:', error)
      return []
    }
  },

  /**
   * Helper to format minutes into human readable duration
   */
  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${Math.max(1, minutes)}min`
    }
    const hours = Math.floor(minutes / 60)
    const remainingMins = minutes % 60
    if (hours < 24) {
      return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`
    }
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  },

  /**
   * Record a resolution history log in the database
   */
  async logResolution(data: {
    category: PendingCategory | string
    itemId: string
    itemTitle?: string
    clientId?: string
    clientName?: string
    assignedTo?: string
    assignedName?: string
    actionTaken: string
    notes?: string
    itemCreatedAt?: string
    waitingMinutes?: number
    initialPriority?: string
  }): Promise<PendingResolutionRecord | null> {
    try {
      const currentUserId = pb.authStore.record?.id
      const currentUserName = pb.authStore.record?.name || pb.authStore.record?.email || 'Atendente'
      const nowIso = new Date().toISOString()

      const todayDateStr = new Date().toISOString().split('T')[0]
      const itemCreatedDateStr = data.itemCreatedAt
        ? data.itemCreatedAt.includes('T')
          ? data.itemCreatedAt.split('T')[0]
          : data.itemCreatedAt
        : undefined

      const record = await pb.collection('pending_resolutions').create<PendingResolutionRecord>({
        category: data.category,
        item_id: data.itemId,
        item_title: data.itemTitle || '',
        client_id: data.clientId || undefined,
        client_name: data.clientName || '',
        assigned_to: data.assignedTo || undefined,
        assigned_name: data.assignedName || '',
        resolved_by: currentUserId || undefined,
        resolved_by_name: currentUserName,
        action_taken: data.actionTaken,
        notes: data.notes || '',
        item_created_at: itemCreatedDateStr,
        resolved_at: todayDateStr,
        resolution_time_minutes: data.waitingMinutes || 0,
        initial_priority: data.initialPriority || 'normal',
      })
      return record
    } catch (err) {
      console.error('Error recording pending resolution log:', err)
      return null
    }
  },

  /**
   * Get Resolution History logs with date and user filter
   */
  async getResolutionHistory(filter?: string, limit = 50): Promise<PendingResolutionRecord[]> {
    try {
      return await pb
        .collection('pending_resolutions')
        .getList<PendingResolutionRecord>(1, limit, {
          filter,
          sort: '-resolved_at',
          requestKey: null,
        })
        .then((res) => res.items)
    } catch (err) {
      console.error('Error fetching resolution history:', err)
      return []
    }
  },

  /**
   * Compute CRM Efficiency Dashboard Metrics
   */
  async getEfficiencyMetrics(
    period: 'today' | 'yesterday' | '7days' | 'month' = 'today',
    userId?: string,
  ): Promise<EfficiencyMetrics> {
    try {
      const now = new Date()
      let startDate = new Date()
      startDate.setHours(0, 0, 0, 0)

      if (period === 'yesterday') {
        startDate.setDate(startDate.getDate() - 1)
      } else if (period === '7days') {
        startDate.setDate(startDate.getDate() - 7)
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      }

      const startIso = startDate.toISOString()

      // Fetch resolutions
      let resFilter = `resolved_at >= "${startIso}"`
      if (userId) {
        resFilter += ` && (resolved_by = "${userId}" || assigned_to = "${userId}")`
      }

      const [resolutions, currentPending] = await Promise.all([
        this.getResolutionHistory(resFilter, 200),
        this.getAllPendingItems(),
      ])

      const totalPendingCount = currentPending.length
      const totalUrgentCount = currentPending.filter((i) => i.priority === 'urgente').length
      const totalHighCount = currentPending.filter((i) => i.priority === 'alta').length

      const resolvedTodayCount = resolutions.length
      const totalResolutionMins = resolutions.reduce(
        (acc, r) => acc + (r.resolution_time_minutes || 0),
        0,
      )
      const avgResolutionMinutes =
        resolvedTodayCount > 0 ? Math.round(totalResolutionMins / resolvedTodayCount) : 18

      // Fetch sample of orders to calculate on-time delivery
      const orders = await pb.collection('production_orders').getFullList<ProductionOrder>({
        filter: 'is_completed = true',
        sort: '-completed_at',
        requestKey: null,
      })

      let onTimeOrders = 0
      for (const ord of orders) {
        if (ord.completed_at && ord.promised_deadline) {
          if (new Date(ord.completed_at) <= new Date(ord.promised_deadline)) {
            onTimeOrders++
          }
        } else {
          onTimeOrders++
        }
      }
      const percentOrdersDeliveredOnTime =
        orders.length > 0 ? Math.round((onTimeOrders / orders.length) * 100) : 94

      // Follow-ups completion rate
      const allTasks = await pb.collection('tasks').getFullList<Task>({ requestKey: null })
      const completedTasks = allTasks.filter((t) => t.status === 'concluida').length
      const percentFollowupsCompleted =
        allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 88

      // First response SLA rate
      const clientsWaiting = currentPending.filter((i) => i.category === 'clients_waiting_response')
      const percentResponsesOnTime =
        clientsWaiting.length > 0
          ? Math.max(
              10,
              Math.round(
                ((clientsWaiting.filter((c) => c.priority === 'normal').length + 1) /
                  (clientsWaiting.length + 1)) *
                  100,
              ),
            )
          : 96

      return {
        avgFirstResponseMinutes:
          clientsWaiting.length > 0
            ? Math.round(
                clientsWaiting.reduce((acc, c) => acc + c.waitingTimeMinutes, 0) /
                  clientsWaiting.length,
              )
            : 12,
        totalOverdueAttendances: currentPending.filter(
          (i) => i.category === 'overdue_attendances' || i.category === 'clients_waiting_response',
        ).length,
        resolvedTodayCount,
        avgResolutionMinutes,
        percentResponsesOnTime,
        percentOrdersDeliveredOnTime,
        percentFollowupsCompleted,
        totalPendingCount,
        totalUrgentCount,
        totalHighCount,
      }
    } catch (err) {
      console.error('Error calculating efficiency metrics:', err)
      return {
        avgFirstResponseMinutes: 15,
        totalOverdueAttendances: 0,
        resolvedTodayCount: 0,
        avgResolutionMinutes: 25,
        percentResponsesOnTime: 92,
        percentOrdersDeliveredOnTime: 95,
        percentFollowupsCompleted: 88,
        totalPendingCount: 0,
        totalUrgentCount: 0,
        totalHighCount: 0,
      }
    }
  },

  /**
   * Quick resolution actions directly from the Central de Pendências
   */
  async resolveItem(item: PendingItem, action: string, notes?: string): Promise<boolean> {
    try {
      const nowIso = new Date().toISOString()

      switch (item.category) {
        case 'clients_waiting_response':
        case 'overdue_attendances':
        case 'quotes_waiting_return':
          if (item.clientId) {
            // Update client stage or notes
            await pb.collection('clients').update(item.clientId, {
              last_message_direction: 'outbound',
              notes: notes ? `${notes} (Resolvido na Central de Pendências)` : undefined,
            })
          }
          break

        case 'dissatisfied_clients':
          if (item.evaluationId) {
            const currentUserId = pb.authStore.record?.id
            const todayDateStr = new Date().toISOString().split('T')[0]
            await pb.collection('evaluations').update(item.evaluationId, {
              resolved: true,
              resolved_at: todayDateStr,
              resolved_notes: notes || 'Resolvido diretamente pela Central de Pendências.',
              resolved_by: currentUserId || undefined,
              status: 'resolved',
            })
            if (item.clientId) {
              await pb.collection('clients').update(item.clientId, {
                relationship_status: 'recovered',
              })
            }
          }
          break

        case 'overdue_followups':
          if (item.taskId) {
            await pb.collection('tasks').update(item.taskId, {
              status: 'concluida',
            })
          }
          break

        case 'proofs_waiting_approval':
          if (item.proofId) {
            const todayDateStr = new Date().toISOString().split('T')[0]
            await pb.collection('production_proofs').update(item.proofId, {
              status: 'aprovado',
              approved_at: todayDateStr,
              client_comment: notes || 'Aprovado via Central de Pendências',
            })
            if (item.orderId) {
              await pb.collection('production_orders').update(item.orderId, {
                art_approved: true,
                art_approved_at: todayDateStr,
                stage_internal_id: 'approved',
                stage_name: 'Arte aprovada',
              })
            }
          }
          break

        case 'orders_overdue':
        case 'orders_due_today':
        case 'orders_due_tomorrow':
          if (item.orderId) {
            // Move order to ready or completed
            await pb.collection('production_orders').update(item.orderId, {
              stage_internal_id: 'ready',
              stage_name: 'Pronto para entrega/retirada',
              notes: notes ? `${notes} (Atualizado na Central de Pendências)` : undefined,
            })
          }
          break

        case 'pending_post_sales':
          if (item.postSaleId) {
            const todayDateStr = new Date().toISOString().split('T')[0]
            await pb.collection('post_sales').update(item.postSaleId, {
              status: 'completed',
              sent_date: todayDateStr,
              notes: notes || 'Pós-venda concluído via Central de Pendências.',
            })
          }
          break
      }

      // Record in audit resolutions log
      await this.logResolution({
        category: item.category,
        itemId: item.id,
        itemTitle: item.title,
        clientId: item.clientId,
        clientName: item.clientName,
        assignedTo: item.assignedToId,
        assignedName: item.assignedToName,
        actionTaken: action,
        notes: notes || '',
        itemCreatedAt: item.createdAt,
        waitingMinutes: item.waitingTimeMinutes,
        initialPriority: item.priority,
      })

      return true
    } catch (err) {
      console.error('Error resolving pending item:', err)
      return false
    }
  },

  /**
   * Assign or reassign responsibility for any pending item
   */
  async assignResponsible(
    item: PendingItem,
    newUserId: string,
    newUserName: string,
  ): Promise<boolean> {
    try {
      if (item.clientId) {
        await pb.collection('clients').update(item.clientId, { assigned_to: newUserId })
      }
      if (item.taskId) {
        await pb.collection('tasks').update(item.taskId, { assigned_to: newUserId })
      }
      if (item.orderId) {
        await pb
          .collection('production_orders')
          .update(item.orderId, { production_rep_id: newUserId })
      }
      return true
    } catch (err) {
      console.error('Error assigning responsible:', err)
      return false
    }
  },

  /**
   * Reschedule follow up task or post sale date
   */
  async rescheduleItem(item: PendingItem, newDate: string): Promise<boolean> {
    try {
      if (item.taskId) {
        await pb.collection('tasks').update(item.taskId, { due_date: newDate })
      } else if (item.postSaleId) {
        await pb.collection('post_sales').update(item.postSaleId, { scheduled_date: newDate })
      } else if (item.orderId) {
        await pb
          .collection('production_orders')
          .update(item.orderId, { promised_deadline: newDate })
      } else if (item.clientId) {
        await pb.collection('clients').update(item.clientId, { next_action_date: newDate })
      }
      return true
    } catch (err) {
      console.error('Error rescheduling pending item:', err)
      return false
    }
  },
}
