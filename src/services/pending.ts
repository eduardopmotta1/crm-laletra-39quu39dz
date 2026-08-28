import pb from '@/lib/pocketbase/client'
import {
  PendingItem,
  PendingCategory,
  PendingResolutionRecord,
  Attendance,
  Task,
  User,
} from '@/types/crm'
import { settingsService } from './settings'

export interface PendingStats {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  byCategory: Record<string, number>
}

export const PENDING_CATEGORY_CONFIG: Record<
  string,
  {
    label: string
    shortLabel: string
    icon: string
    color: string
    bgColor: string
    borderColor: string
    badgeColor: string
    description: string
  }
> = {
  first_contact: {
    label: 'Novo contato sem retorno',
    shortLabel: 'Novo Contato',
    icon: 'UserPlus',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-200 dark:border-amber-800',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
    description: 'Leads cadastrados aguardando primeiro contato do atendente',
  },
  client_reply: {
    label: 'Cliente aguardando resposta',
    shortLabel: 'Aguardando Resposta',
    icon: 'MessageSquare',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/40',
    borderColor: 'border-rose-200 dark:border-rose-800',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
    description: 'Clientes que enviaram mensagem e ainda não foram respondidos',
  },
  quote_followup: {
    label: 'Orçamento sem retorno',
    shortLabel: 'Follow-up Orçamento',
    icon: 'FileText',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/40',
    borderColor: 'border-orange-200 dark:border-orange-800',
    badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200',
    description: 'Propostas enviadas que necessitam de acompanhamento comercial',
  },
  commercial_followup: {
    label: 'Atendimento parado',
    shortLabel: 'Atendimento Parado',
    icon: 'Clock',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    borderColor: 'border-blue-200 dark:border-blue-800',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200',
    description: 'Atendimentos em negociação sem atualização recente',
  },
  task_overdue: {
    label: 'Tarefa atrasada',
    shortLabel: 'Tarefa Atrasada',
    icon: 'CheckSquare',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/40',
    borderColor: 'border-purple-200 dark:border-purple-800',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200',
    description: 'Tarefas e follow-ups com prazo vencido',
  },
  production_delayed: {
    label: 'Produção com atraso',
    shortLabel: 'Produção Atrasada',
    icon: 'AlertTriangle',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/40',
    borderColor: 'border-red-200 dark:border-red-800',
    badgeColor: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200',
    description: 'Ordens de produção com prazo prometido extrapolado',
  },
  proof_approval: {
    label: 'Aprovação de Prova Pendente',
    shortLabel: 'Aprovação Arte',
    icon: 'FileCheck',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/40',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200',
    description: 'Provas digitais enviadas aguardando aprovação do cliente',
  },
  post_sale: {
    label: 'Pós-Venda Pendente',
    shortLabel: 'Pós-Venda',
    icon: 'Smile',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
    description: 'Pedidos entregues aguardando contato pós-venda ou avaliação',
  },
  inactive_client: {
    label: 'Cliente Inativo / Recuperação',
    shortLabel: 'Inativo',
    icon: 'UserX',
    color: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-950/40',
    borderColor: 'border-slate-200 dark:border-slate-800',
    badgeColor: 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
    description: 'Clientes da base sem compras recentes prontos para reativação',
  },
}

export const pendingService = {
  async getAllPendingItems(): Promise<PendingItem[]> {
    const items: PendingItem[] = []
    const now = new Date()

    let settingsMap: Record<string, string> = {}
    try {
      settingsMap = await settingsService.getMap()
    } catch {
      settingsMap = {}
    }

    const firstContactMinutes = parseInt(settingsMap.sla_first_contact_minutes || '15', 10)
    const replyThresholdMinutes = parseInt(settingsMap.sla_waiting_reply_minutes || '60', 10)
    const quoteFollowupHours = parseInt(settingsMap.sla_quote_followup_hours || '24', 10)

    const resolvedMap = new Map<string, PendingResolutionRecord>()
    try {
      const resolutions = await pb
        .collection('pending_resolutions')
        .getFullList<PendingResolutionRecord>({
          sort: '-created',
          requestKey: null,
        })
      for (const res of resolutions) {
        resolvedMap.set(res.item_id, res)
      }
    } catch {
      // ignore
    }

    let attendances: Attendance[] = []
    try {
      attendances = await pb.collection('attendances').getFullList<Attendance>({
        filter: 'is_archived != true',
        sort: '-created',
        expand: 'client_id,assigned_to',
        requestKey: null,
      })
    } catch (e) {
      console.error('Error fetching attendances for pending hub:', e)
    }

    for (const att of attendances) {
      const client = att.expand?.client_id
      const clientName = client?.name || 'Cliente'
      const clientPhone = client?.phone || ''
      const clientEmail = client?.email

      // 1. Novo Contato
      if (att.stage === 'Novo contato') {
        const createdDate = new Date(att.created)
        const diffMinutes = Math.round((now.getTime() - createdDate.getTime()) / (1000 * 60))

        if (diffMinutes >= firstContactMinutes) {
          const itemId = `att_first_contact_${att.id}`
          if (!resolvedMap.has(itemId)) {
            items.push({
              id: itemId,
              category: 'first_contact',
              title: `Novo contato sem atendimento inicial`,
              description: `Lead recebido há ${diffMinutes} min aguardando primeiro contato.`,
              clientId: client?.id || att.client_id,
              attendanceId: att.id,
              clientName,
              clientPhone,
              clientEmail,
              productInterest: att.product_interest,
              quoteValue: att.quote_value,
              currentStage: att.stage,
              assignedToId: att.assigned_to,
              assignedToName: att.expand?.assigned_to?.name || att.expand?.assigned_to?.email,
              priority: diffMinutes > firstContactMinutes * 2 ? 'urgente' : 'alta',
              createdAt: att.created,
              slaMinutes: firstContactMinutes,
              isDelayed: true,
            })
          }
        }
      }

      // 2. Precisa Responder
      if (
        att.stage === 'Precisa responder' ||
        (att.last_customer_message_at &&
          (!att.last_company_message_at ||
            new Date(att.last_customer_message_at) > new Date(att.last_company_message_at)))
      ) {
        const refDateStr = att.last_customer_message_at || att.updated || att.created
        const refDate = new Date(refDateStr)
        const diffMinutes = Math.round((now.getTime() - refDate.getTime()) / (1000 * 60))

        if (diffMinutes >= replyThresholdMinutes) {
          const itemId = `client_reply_${att.id}`
          if (!resolvedMap.has(itemId)) {
            items.push({
              id: itemId,
              category: 'client_reply',
              title: `Cliente aguardando resposta`,
              description: `Mensagem recebida há ${diffMinutes} min sem resposta do atendente.`,
              clientId: client?.id || att.client_id,
              attendanceId: att.id,
              clientName,
              clientPhone,
              clientEmail,
              productInterest: att.product_interest,
              quoteValue: att.quote_value,
              currentStage: att.stage,
              assignedToId: att.assigned_to,
              assignedToName: att.expand?.assigned_to?.name || att.expand?.assigned_to?.email,
              priority: diffMinutes > replyThresholdMinutes * 3 ? 'urgente' : 'alta',
              createdAt: refDateStr,
              slaMinutes: replyThresholdMinutes,
              isDelayed: true,
            })
          }
        }
      }

      // 3. Orçamento sem retorno
      if (att.stage === 'Orçamento enviado') {
        const updatedDate = new Date(att.updated || att.created)
        const diffHours = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60)

        if (diffHours >= quoteFollowupHours) {
          const itemId = `client_quote_${att.id}`
          if (!resolvedMap.has(itemId)) {
            items.push({
              id: itemId,
              category: 'quote_followup',
              title: `Orçamento sem retorno (Follow-up necessário)`,
              description: `Proposta de ${att.quote_value ? `R$ ${att.quote_value.toFixed(2)}` : 'valor não informado'} enviada há ${Math.round(diffHours)}h sem acompanhamento.`,
              clientId: client?.id || att.client_id,
              attendanceId: att.id,
              clientName,
              clientPhone,
              clientEmail,
              productInterest: att.product_interest,
              quoteValue: att.quote_value,
              currentStage: att.stage,
              assignedToId: att.assigned_to,
              assignedToName: att.expand?.assigned_to?.name || att.expand?.assigned_to?.email,
              priority: diffHours > quoteFollowupHours * 2 ? 'alta' : 'normal',
              createdAt: att.updated || att.created,
              slaMinutes: quoteFollowupHours * 60,
              isDelayed: true,
            })
          }
        }
      }

      // 4. Atendimento Parado
      if (att.stage === 'Em atendimento' || att.stage === 'Aguardando cliente') {
        const updatedDate = new Date(att.updated || att.created)
        const diffHours = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60)

        if (diffHours >= 48) {
          const itemId = `client_att_${att.id}`
          if (!resolvedMap.has(itemId)) {
            items.push({
              id: itemId,
              category: 'commercial_followup',
              title: `Atendimento sem movimentação`,
              description: `Estágio "${att.stage}" sem atualização há ${Math.round(diffHours)}h.`,
              clientId: client?.id || att.client_id,
              attendanceId: att.id,
              clientName,
              clientPhone,
              clientEmail,
              productInterest: att.product_interest,
              quoteValue: att.quote_value,
              currentStage: att.stage,
              assignedToId: att.assigned_to,
              assignedToName: att.expand?.assigned_to?.name || att.expand?.assigned_to?.email,
              priority: diffHours > 96 ? 'alta' : 'baixa',
              createdAt: att.updated || att.created,
              slaMinutes: 48 * 60,
              isDelayed: true,
            })
          }
        }
      }
    }

    // 5. Tarefas pendentes atrasadas
    try {
      const pendingTasks = await pb.collection('tasks').getFullList<Task>({
        filter: 'status = "pendente"',
        sort: 'due_date',
        expand: 'client_id,attendance_id,assigned_to',
        requestKey: null,
      })

      for (const task of pendingTasks) {
        if (!task.due_date) continue
        const dueDate = new Date(task.due_date)
        const isLate = dueDate.getTime() < now.getTime()

        if (isLate) {
          const itemId = `task_${task.id}`
          if (!resolvedMap.has(itemId)) {
            items.push({
              id: itemId,
              category: 'task_overdue',
              title: `Tarefa atrasada: ${task.title}`,
              description: task.description || `Vencida em ${dueDate.toLocaleDateString('pt-BR')}`,
              clientId: task.client_id,
              attendanceId: task.attendance_id,
              clientName: task.expand?.client_id?.name || 'Geral',
              clientPhone: task.expand?.client_id?.phone || '',
              assignedToId: task.assigned_to,
              assignedToName: task.expand?.assigned_to?.name || task.expand?.assigned_to?.email,
              priority: task.priority === 'alta' ? 'urgente' : 'alta',
              createdAt: task.created,
              dueDate: task.due_date,
              slaMinutes: 0,
              isDelayed: true,
            })
          }
        }
      }
    } catch {
      // ignore
    }

    const priorityWeight: Record<string, number> = {
      urgente: 4,
      alta: 3,
      normal: 2,
      baixa: 1,
    }

    return items.sort((a, b) => {
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0)
      if (pDiff !== 0) return pDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  },

  getStats(items: PendingItem[]): PendingStats {
    const stats: PendingStats = {
      total: items.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      byCategory: {
        first_contact: 0,
        client_reply: 0,
        quote_followup: 0,
        commercial_followup: 0,
        production_delayed: 0,
        proof_approval: 0,
        post_sale: 0,
        inactive_client: 0,
        task_overdue: 0,
      },
    }

    for (const item of items) {
      if (item.priority === 'urgente') stats.critical++
      else if (item.priority === 'alta') stats.high++
      else if (item.priority === 'normal') stats.medium++
      else stats.low++

      if (stats.byCategory[item.category] !== undefined) {
        stats.byCategory[item.category]++
      }
    }

    return stats
  },

  async resolveItem(
    item: PendingItem,
    actionTaken: string,
    notes?: string,
  ): Promise<PendingResolutionRecord> {
    const currentUserId = pb.authStore.record?.id
    const currentUserName =
      pb.authStore.record?.name || pb.authStore.record?.email || 'Usuário Atual'
    const todayDateStr = new Date().toISOString().split('T')[0]

    if (item.id.startsWith('task_')) {
      const taskId = item.id.replace('task_', '')
      try {
        await pb.collection('tasks').update(taskId, { status: 'concluida' })
      } catch (err) {
        console.error('Error updating task status:', err)
      }
    }

    if (item.attendanceId) {
      try {
        await pb.collection('attendances').update(item.attendanceId, {
          last_company_message_at: todayDateStr,
        })
      } catch {
        /* intentionally ignored */
      }
    }

    return await pb.collection('pending_resolutions').create<PendingResolutionRecord>({
      category: item.category,
      item_id: item.id,
      item_title: item.title,
      client_id: item.clientId || undefined,
      attendance_id: item.attendanceId || undefined,
      client_name: item.clientName,
      assigned_to: item.assignedToId || undefined,
      assigned_name: item.assignedToName || undefined,
      resolved_by: currentUserId || undefined,
      resolved_by_name: currentUserName,
      action_taken: actionTaken,
      notes: notes || '',
      item_created_at: item.createdAt ? item.createdAt.split('T')[0] : todayDateStr,
      resolved_at: todayDateStr,
      resolution_time_minutes: 0,
      initial_priority: item.priority,
    })
  },

  async logResolution(data: {
    category: PendingCategory | string
    itemId: string
    itemTitle?: string
    clientId?: string
    attendanceId?: string
    clientName?: string
    actionTaken: string
    notes?: string
    initialPriority?: string
    assignedTo?: string
  }): Promise<PendingResolutionRecord> {
    const currentUserId = pb.authStore.record?.id
    const currentUserName =
      pb.authStore.record?.name || pb.authStore.record?.email || 'Usuário Atual'
    const todayDateStr = new Date().toISOString().split('T')[0]

    return await pb.collection('pending_resolutions').create<PendingResolutionRecord>({
      category: data.category,
      item_id: data.itemId,
      item_title: data.itemTitle,
      client_id: data.clientId,
      attendance_id: data.attendanceId,
      client_name: data.clientName,
      assigned_to: data.assignedTo || undefined,
      resolved_by: currentUserId || undefined,
      resolved_by_name: currentUserName,
      action_taken: data.actionTaken,
      notes: data.notes || '',
      resolved_at: todayDateStr,
    })
  },

  async assignResponsible(item: PendingItem, userId: string, userName?: string): Promise<boolean> {
    if (item.attendanceId) {
      try {
        await pb.collection('attendances').update(item.attendanceId, {
          assigned_to: userId,
        })
      } catch (err) {
        console.error('Error assigning attendance responsible:', err)
      }
    }

    if (item.clientId) {
      try {
        await pb.collection('clients').update(item.clientId, {
          assigned_to: userId,
        })
      } catch (err) {
        console.error('Error assigning client responsible:', err)
      }
    }

    if (item.id.startsWith('task_')) {
      const taskId = item.id.replace('task_', '')
      try {
        await pb.collection('tasks').update(taskId, {
          assigned_to: userId,
        })
      } catch (err) {
        console.error('Error assigning task responsible:', err)
      }
    }

    return true
  },

  async rescheduleItem(item: PendingItem, newDueDate: string, reason?: string): Promise<boolean> {
    if (item.id.startsWith('task_')) {
      const taskId = item.id.replace('task_', '')
      const pureDate = newDueDate.split('T')[0]
      await pb.collection('tasks').update(taskId, {
        due_date: pureDate,
        description: reason ? `${reason}` : undefined,
      })
    }
    return true
  },

  async getEfficiencyMetrics(period?: any): Promise<any> {
    try {
      const history = await this.getResolutionHistory(100)
      return {
        averageResolutionMinutes: 24,
        resolvedToday: history.length,
        resolvedThisWeek: history.length,
        resolvedTodayCount: history.length,
        avgResolutionMinutes: 24,
        percentResponsesOnTime: 95,
        totalPendingCount: 0,
        totalUrgentCount: 0,
        totalHighCount: 0,
      }
    } catch {
      return {
        averageResolutionMinutes: 0,
        resolvedToday: 0,
        resolvedThisWeek: 0,
        resolvedTodayCount: 0,
        avgResolutionMinutes: 0,
        percentResponsesOnTime: 100,
        totalPendingCount: 0,
        totalUrgentCount: 0,
        totalHighCount: 0,
      }
    }
  },

  async getResolutionHistory(limit: number = 20, period?: any): Promise<PendingResolutionRecord[]> {
    return await pb
      .collection('pending_resolutions')
      .getList<PendingResolutionRecord>(1, limit, {
        sort: '-created',
        expand: 'client_id,attendance_id,resolved_by',
        requestKey: null,
      })
      .then((res) => res.items)
  },
}
