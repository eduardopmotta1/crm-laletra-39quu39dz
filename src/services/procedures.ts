import pb from '@/lib/pocketbase/client'
import type { User, Role } from '@/types/crm'

export type ProcedureStatus = 'Rascunho' | 'Ativo' | 'Em revisão' | 'Arquivado'

export type RecurrenceFrequency =
  | 'daily'
  | 'weekdays'
  | 'specific_days'
  | 'weekly'
  | 'monthly'
  | 'custom_interval'

export type AssigneeType = 'user' | 'multiple_users' | 'role' | 'all'

export type ExecutionStatus = 'Pendente' | 'Concluído' | 'Atrasado'

export interface ProcedureCategoryRecord {
  id: string
  name: string
  order_index?: number
  is_active?: boolean
  is_archived?: boolean
  created?: string
  updated?: string
}

export interface ProcedureStep {
  id?: string
  title: string
  description?: string
  order?: number
}

export interface Procedure {
  id: string
  title: string
  category: string
  category_id?: string
  summary?: string
  content?: string
  steps?: ProcedureStep[]
  notes?: string
  reviewer_id?: string
  reviewer_name?: string
  status: ProcedureStatus
  last_reviewed_at?: string
  version?: string
  attachments?: string[]
  // Recurrence configuration
  is_recurring?: boolean
  recurrence_frequency?: RecurrenceFrequency
  recurrence_time?: string // HH:mm format, e.g., "08:00"
  tolerance_minutes?: number // e.g., 60
  assignee_type?: AssigneeType
  assigned_user_ids?: string[] // user IDs
  assigned_role_slug?: string // e.g. "producao", "comercial", "admin"
  recurrence_days_of_week?: number[] // 0 (Sun) to 6 (Sat)
  recurrence_interval_days?: number // e.g. every 2 days, 15 days
  expand?: {
    reviewer_id?: User
    category_id?: ProcedureCategoryRecord
  }
  created: string
  updated: string
}

export interface ProcedureExecution {
  id: string
  procedure_id: string
  occurrence_date: string // YYYY-MM-DD
  scheduled_at?: string // HH:mm, e.g. "08:00"
  tolerance_minutes?: number
  assigned_to_user_id?: string
  assigned_role_slug?: string
  status: ExecutionStatus
  completed_at?: string // ISO string or date
  completed_by?: string
  completed_by_name?: string
  notes?: string
  checked_step_ids?: string[]
  expand?: {
    procedure_id?: Procedure
    assigned_to_user_id?: User
    completed_by?: User
  }
  created: string
  updated: string
}

export interface ProcedureFilterOptions {
  search?: string
  category?: string
  category_id?: string
  status?: ProcedureStatus | 'all'
  includeArchived?: boolean
}

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Todos os dias',
  weekdays: 'Dias úteis (Seg a Sex)',
  specific_days: 'Dias específicos da semana',
  weekly: 'Semanal (1x por semana)',
  monthly: 'Mensal',
  custom_interval: 'Intervalo personalizado',
}

export const proceduresService = {
  // ==========================================
  // CATEGORIES MANAGEMENT (Requirements 1)
  // ==========================================

  async getCategoriesList(includeArchived = false): Promise<ProcedureCategoryRecord[]> {
    try {
      const filters: string[] = []
      if (!includeArchived) {
        filters.push('is_archived != true')
      }
      const filterStr = filters.length > 0 ? filters.join(' && ') : undefined

      return await pb.collection('procedure_categories').getFullList<ProcedureCategoryRecord>({
        filter: filterStr,
        sort: 'order_index,name',
        requestKey: null,
      })
    } catch (err) {
      console.error('Error fetching procedure categories:', err)
      return []
    }
  },

  async getCategoryById(id: string): Promise<ProcedureCategoryRecord | null> {
    try {
      return await pb
        .collection('procedure_categories')
        .getOne<ProcedureCategoryRecord>(id, { requestKey: null })
    } catch (err) {
      return null
    }
  },

  async createCategory(data: {
    name: string
    order_index?: number
    is_active?: boolean
  }): Promise<ProcedureCategoryRecord> {
    const list = await this.getCategoriesList(true)
    const nextOrder = data.order_index ?? list.length + 1
    return await pb.collection('procedure_categories').create<ProcedureCategoryRecord>({
      name: data.name.trim(),
      order_index: nextOrder,
      is_active: data.is_active ?? true,
      is_archived: false,
    })
  },

  async updateCategory(
    id: string,
    data: Partial<ProcedureCategoryRecord>,
  ): Promise<ProcedureCategoryRecord> {
    return await pb.collection('procedure_categories').update<ProcedureCategoryRecord>(id, data)
  },

  async reorderCategories(orderedIds: string[]): Promise<boolean> {
    try {
      await Promise.all(
        orderedIds.map((id, index) =>
          pb.collection('procedure_categories').update(id, { order_index: index + 1 }),
        ),
      )
      return true
    } catch (err) {
      console.error('Error reordering categories:', err)
      return false
    }
  },

  async isCategoryInUse(categoryId: string): Promise<{ inUse: boolean; count: number }> {
    try {
      const list = await pb.collection('procedures').getFullList<Procedure>({
        filter: `category_id = "${categoryId}"`,
        fields: 'id',
        requestKey: null,
      })
      return { inUse: list.length > 0, count: list.length }
    } catch (err) {
      return { inUse: false, count: 0 }
    }
  },

  async deleteCategory(
    id: string,
  ): Promise<{ success: boolean; message?: string; blocked?: boolean }> {
    try {
      const { inUse, count } = await this.isCategoryInUse(id)
      if (inUse) {
        return {
          success: false,
          blocked: true,
          message: `Esta categoria está vinculada a ${count} procedimento(s) e não pode ser excluída permanentemente. Em vez disso, você pode desativá-la ou arquivá-la.`,
        }
      }
      await pb.collection('procedure_categories').delete(id)
      return { success: true }
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Erro ao excluir categoria.',
      }
    }
  },

  async archiveCategory(id: string): Promise<ProcedureCategoryRecord> {
    return await this.updateCategory(id, { is_archived: true })
  },

  async reactivateCategory(id: string): Promise<ProcedureCategoryRecord> {
    return await this.updateCategory(id, { is_archived: false, is_active: true })
  },

  // ==========================================
  // PROCEDURES CRUD
  // ==========================================

  async getAll(options?: ProcedureFilterOptions): Promise<Procedure[]> {
    try {
      const filters: string[] = []

      if (options?.category_id && options.category_id !== 'all') {
        filters.push(`category_id = "${options.category_id}"`)
      } else if (options?.category && options.category !== 'all') {
        filters.push(`category = "${options.category}"`)
      }

      if (options?.status && options.status !== 'all') {
        filters.push(`status = "${options.status}"`)
      } else if (!options?.includeArchived) {
        filters.push(`status != "Arquivado"`)
      }

      if (options?.search && options.search.trim()) {
        const query = options.search.trim().replace(/"/g, '\\"')
        filters.push(
          `(title ~ "${query}" || summary ~ "${query}" || content ~ "${query}" || notes ~ "${query}")`,
        )
      }

      const filterStr = filters.length > 0 ? filters.join(' && ') : undefined

      return await pb.collection('procedures').getFullList<Procedure>({
        filter: filterStr,
        sort: '-updated,-created',
        expand: 'reviewer_id,category_id',
        requestKey: null,
      })
    } catch (err) {
      console.error('Error fetching procedures:', err)
      return []
    }
  },

  async getById(id: string): Promise<Procedure | null> {
    try {
      return await pb.collection('procedures').getOne<Procedure>(id, {
        expand: 'reviewer_id,category_id',
        requestKey: null,
      })
    } catch (err) {
      console.error(`Error fetching procedure ${id}:`, err)
      return null
    }
  },

  async create(data: FormData | Partial<Procedure>): Promise<Procedure> {
    return await pb.collection('procedures').create<Procedure>(data as any, {
      expand: 'reviewer_id,category_id',
    })
  },

  async update(id: string, data: FormData | Partial<Procedure>): Promise<Procedure> {
    return await pb.collection('procedures').update<Procedure>(id, data as any, {
      expand: 'reviewer_id,category_id',
    })
  },

  async archive(id: string): Promise<Procedure> {
    return this.update(id, { status: 'Arquivado' })
  },

  async reactivate(id: string): Promise<Procedure> {
    return this.update(id, { status: 'Ativo' })
  },

  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('procedures').delete(id)
      return true
    } catch (err) {
      console.error(`Error deleting procedure ${id}:`, err)
      return false
    }
  },

  getFileUrl(procedure: Procedure, fileName: string): string {
    if (!fileName) return ''
    return pb.files.getURL(procedure, fileName)
  },

  // ==========================================
  // RECURRENCE & EXECUTIONS (Requirements 2..7, 10..14)
  // ==========================================

  /**
   * Generates needed executions for a target date (default today) in an idempotent way.
   * Does NOT generate hundreds of records in advance.
   */
  async ensureExecutionsForDate(
    targetDate: string = new Date().toISOString().split('T')[0],
  ): Promise<void> {
    try {
      // 1. Fetch all active procedures that are recurring
      const recurringProcedures = await pb.collection('procedures').getFullList<Procedure>({
        filter: 'status = "Ativo" && is_recurring = true',
        requestKey: null,
      })

      if (recurringProcedures.length === 0) return

      // Parse targetDate components
      const [year, month, day] = targetDate.split('-').map(Number)
      const targetDateObj = new Date(year, month - 1, day)
      const dayOfWeek = targetDateObj.getDay() // 0 (Sun) to 6 (Sat)
      const dayOfMonth = targetDateObj.getDate()

      // 2. Fetch existing executions for target date
      const existingExecutions = await pb
        .collection('procedure_executions')
        .getFullList<ProcedureExecution>({
          filter: `occurrence_date ~ "${targetDate}"`,
          requestKey: null,
        })

      for (const proc of recurringProcedures) {
        // Check if procedure applies to targetDate according to its frequency
        let applies = false
        const freq = proc.recurrence_frequency || 'daily'

        if (freq === 'daily') {
          applies = true
        } else if (freq === 'weekdays') {
          // Mon-Fri: 1, 2, 3, 4, 5
          applies = dayOfWeek >= 1 && dayOfWeek <= 5
        } else if (freq === 'specific_days') {
          const days = proc.recurrence_days_of_week || []
          applies = days.includes(dayOfWeek)
        } else if (freq === 'weekly') {
          // Default to Monday (1) or configured day
          const days = proc.recurrence_days_of_week || [1]
          applies = days.includes(dayOfWeek)
        } else if (freq === 'monthly') {
          // Default to 1st of month or proc creation day
          const targetDayOfMonth =
            (proc.recurrence_days_of_week && proc.recurrence_days_of_week[0]) || 1
          applies = dayOfMonth === targetDayOfMonth
        } else if (freq === 'custom_interval') {
          const intervalDays = proc.recurrence_interval_days || 1
          const createdDate = new Date(proc.created.split('T')[0])
          const diffTime = targetDateObj.getTime() - createdDate.getTime()
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
          applies = diffDays >= 0 && diffDays % intervalDays === 0
        }

        if (!applies) continue

        // Determine who needs an occurrence:
        // assignee_type: 'user' | 'multiple_users' | 'role' | 'all'
        const assigneeType = proc.assignee_type || (proc.assigned_role_slug ? 'role' : 'all')

        if (assigneeType === 'role' && proc.assigned_role_slug) {
          // Role-based occurrence
          const alreadyExists = existingExecutions.some(
            (ex) =>
              ex.procedure_id === proc.id && ex.assigned_role_slug === proc.assigned_role_slug,
          )

          if (!alreadyExists) {
            await pb.collection('procedure_executions').create({
              procedure_id: proc.id,
              occurrence_date: `${targetDate} 00:00:00.000Z`,
              scheduled_at: proc.recurrence_time || '08:00',
              tolerance_minutes: proc.tolerance_minutes ?? 60,
              assigned_role_slug: proc.assigned_role_slug,
              status: 'Pendente',
              checked_step_ids: [],
            })
          }
        } else if (assigneeType === 'user' || assigneeType === 'multiple_users') {
          const userIds = proc.assigned_user_ids || []
          for (const uId of userIds) {
            const alreadyExists = existingExecutions.some(
              (ex) => ex.procedure_id === proc.id && ex.assigned_to_user_id === uId,
            )

            if (!alreadyExists) {
              await pb.collection('procedure_executions').create({
                procedure_id: proc.id,
                occurrence_date: `${targetDate} 00:00:00.000Z`,
                scheduled_at: proc.recurrence_time || '08:00',
                tolerance_minutes: proc.tolerance_minutes ?? 60,
                assigned_to_user_id: uId,
                status: 'Pendente',
                checked_step_ids: [],
              })
            }
          }
        } else {
          // Generic / All occurrence
          const alreadyExists = existingExecutions.some(
            (ex) =>
              ex.procedure_id === proc.id && !ex.assigned_to_user_id && !ex.assigned_role_slug,
          )

          if (!alreadyExists) {
            await pb.collection('procedure_executions').create({
              procedure_id: proc.id,
              occurrence_date: `${targetDate} 00:00:00.000Z`,
              scheduled_at: proc.recurrence_time || '08:00',
              tolerance_minutes: proc.tolerance_minutes ?? 60,
              status: 'Pendente',
              checked_step_ids: [],
            })
          }
        }
      }
    } catch (err) {
      console.error('Error ensuring executions for date:', err)
    }
  },

  /**
   * Helper to evaluate if a pending occurrence is delayed according to current time and tolerance.
   * e.g., scheduled_at: 08:00, tolerance: 60 min -> delayed after 09:00 on occurrence date, or anytime after occurrence date.
   */
  evaluateExecutionStatus(execution: ProcedureExecution, now: Date = new Date()): ExecutionStatus {
    if (execution.status === 'Concluído') return 'Concluído'

    const occDateStr = execution.occurrence_date.split('T')[0]
    const todayStr = now.toISOString().split('T')[0]

    // If occurrence is from a past date and not completed -> Atrasado
    if (occDateStr < todayStr) {
      return 'Atrasado'
    }

    // If occurrence is for today, evaluate scheduled_at + tolerance_minutes
    if (occDateStr === todayStr && execution.scheduled_at) {
      const [hours, mins] = execution.scheduled_at.split(':').map(Number)
      if (!isNaN(hours) && !isNaN(mins)) {
        const scheduledTime = new Date(now)
        scheduledTime.setHours(hours, mins, 0, 0)

        const toleranceMinutes = execution.tolerance_minutes ?? 60
        const deadlineTime = new Date(scheduledTime.getTime() + toleranceMinutes * 60 * 1000)

        if (now.getTime() > deadlineTime.getTime()) {
          return 'Atrasado'
        }
      }
    }

    return 'Pendente'
  },

  /**
   * Sync and fetch all executions for a specific date or overall filter.
   */
  async getExecutions(options?: {
    date?: string
    userId?: string
    roleSlug?: string
    procedureId?: string
    status?: ExecutionStatus | 'all'
  }): Promise<ProcedureExecution[]> {
    try {
      const targetDate = options?.date || new Date().toISOString().split('T')[0]
      await this.ensureExecutionsForDate(targetDate)

      const filters: string[] = []

      if (options?.date) {
        filters.push(`occurrence_date ~ "${options.date}"`)
      }

      if (options?.procedureId) {
        filters.push(`procedure_id = "${options.procedureId}"`)
      }

      if (options?.status && options.status !== 'all') {
        filters.push(`status = "${options.status}"`)
      }

      const filterStr = filters.length > 0 ? filters.join(' && ') : undefined

      const list = await pb.collection('procedure_executions').getFullList<ProcedureExecution>({
        filter: filterStr,
        sort: '-occurrence_date,scheduled_at',
        expand: 'procedure_id,procedure_id.category_id,assigned_to_user_id,completed_by',
        requestKey: null,
      })

      // Dynamically calculate and update real-time 'Atrasado' statuses
      const now = new Date()
      return list.map((exec) => {
        const computedStatus = this.evaluateExecutionStatus(exec, now)
        return {
          ...exec,
          status: computedStatus,
        }
      })
    } catch (err) {
      console.error('Error fetching procedure executions:', err)
      return []
    }
  },

  /**
   * Fetch "Minhas Rotinas" for a specific user and their role for today or active period.
   */
  async getMyRoutines(user: User | null, date?: string): Promise<ProcedureExecution[]> {
    const targetDate = date || new Date().toISOString().split('T')[0]
    const allExecutions = await this.getExecutions({ date: targetDate })

    if (!user) return allExecutions

    const userRoleSlug = user.role_slug || 'comercial'
    const isAdmin = userRoleSlug === 'admin'

    if (isAdmin) {
      return allExecutions
    }

    return allExecutions.filter((exec) => {
      // 1. Directly assigned to user
      if (exec.assigned_to_user_id === user.id) return true
      // 2. Assigned to user's role/sector
      if (exec.assigned_role_slug && exec.assigned_role_slug === userRoleSlug) return true
      // 3. Assigned to all / unassigned
      if (!exec.assigned_to_user_id && !exec.assigned_role_slug) return true
      return false
    })
  },

  /**
   * Concludes a specific procedure occurrence.
   * Records completed_at, completed_by, notes and status.
   */
  async completeExecution(
    executionId: string,
    data: {
      completedByUserId: string
      completedByName: string
      notes?: string
      checkedStepIds?: string[]
    },
  ): Promise<ProcedureExecution> {
    const completedAt = new Date().toISOString()

    const updated = await pb.collection('procedure_executions').update<ProcedureExecution>(
      executionId,
      {
        status: 'Concluído',
        completed_at: completedAt,
        completed_by: data.completedByUserId,
        completed_by_name: data.completedByName,
        notes: data.notes?.trim() || '',
        checked_step_ids: data.checkedStepIds || [],
      },
      {
        expand: 'procedure_id,completed_by',
      },
    )

    return updated
  },

  /**
   * Get overall execution history for auditing (Requirement 6)
   */
  async getExecutionHistory(limit = 100, procedureId?: string): Promise<ProcedureExecution[]> {
    try {
      const filters: string[] = []
      if (procedureId) {
        filters.push(`procedure_id = "${procedureId}"`)
      }
      const filterStr = filters.length > 0 ? filters.join(' && ') : undefined

      return await pb
        .collection('procedure_executions')
        .getList<ProcedureExecution>(1, limit, {
          filter: filterStr,
          sort: '-occurrence_date,-completed_at,-created',
          expand: 'procedure_id,assigned_to_user_id,completed_by',
          requestKey: null,
        })
        .then((res) => res.items)
    } catch (err) {
      console.error('Error fetching execution history:', err)
      return []
    }
  },
}
