import pb from '@/lib/pocketbase/client'
import type { Task } from '@/types/crm'

export const tasksService = {
  async getAll(filter?: string, sort = 'due_date'): Promise<Task[]> {
    try {
      return await pb.collection('tasks').getFullList<Task>({
        filter,
        sort,
        expand: 'client_id,assigned_to',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching tasks:', error)
      return []
    }
  },

  async getByClientId(clientId: string): Promise<Task[]> {
    try {
      return await pb.collection('tasks').getFullList<Task>({
        filter: `client_id = "${clientId}"`,
        sort: 'due_date',
        expand: 'assigned_to',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching tasks for client ${clientId}:`, error)
      return []
    }
  },

  async create(data: Partial<Task>): Promise<Task> {
    const sanitized = { ...data }

    // Se attendance_id NÃO foi informado mas client_id existe, NÃO usar '-created' para adivinhar.
    // SOMENTE vincular automaticamente se existir EXATAMENTE UM atendimento ativo (100% não ambíguo).
    // Se houver 0 ou mais de 1 atendimento ativo, NÃO vincular por adivinhação.
    if (!sanitized.attendance_id && sanitized.client_id) {
      try {
        const activeAtts = await pb.collection('attendances').getList(1, 2, {
          filter: `client_id = "${sanitized.client_id}" && is_archived != true`,
          requestKey: null,
        })
        if (activeAtts.totalItems === 1 && activeAtts.items.length === 1) {
          sanitized.attendance_id = activeAtts.items[0].id
        }
      } catch (attErr) {
        console.error('Error checking active attendance for task fallback:', attErr)
      }
    }

    return await pb.collection('tasks').create<Task>(sanitized)
  },

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const sanitized = { ...data }
    return await pb.collection('tasks').update<Task>(id, sanitized)
  },

  async toggleStatus(
    id: string,
    currentStatus: 'pendente' | 'concluida' | 'cancelada',
  ): Promise<Task> {
    const nextStatus = currentStatus === 'concluida' ? 'pendente' : 'concluida'
    return await pb.collection('tasks').update<Task>(id, { status: nextStatus })
  },

  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('tasks').delete(id)
      return true
    } catch (error) {
      console.error(`Error deleting task ${id}:`, error)
      return false
    }
  },

  /**
   * Encerramento automático de follow-ups quando um atendimento é efetivamente arquivado (is_archived = true).
   *
   * Regras de negócio obrigatórias:
   * 1. Cancela SOMENTE tasks que satisfaçam: attendance_id = ID EXATO && status = "pendente".
   * 2. Tasks com attendance_id vazio/null NUNCA são canceladas (tarefas independentes).
   * 3. NÃO localizar cliente por nome, telefone, client_id ou usuário. Associação exclusivamente attendance_id = id.
   * 4. NÃO deletar nenhuma task fisicamente: marca status = "cancelada" (histórico preservado).
   * 5. Proteção de pós-venda: exclui qualquer task com título iniciado em "⭐ Pós-venda" ou vinculada em post_sales.task_id.
   * 6. Volume baixo: utiliza paginação com getList(1, 50).
   */
  async cancelPendingFollowUpsForAttendance(
    attendanceId: string,
    _ctx?: { reason?: string; source?: string },
  ): Promise<{ canceledCount: number; taskIds: string[] }> {
    if (!attendanceId || typeof attendanceId !== 'string' || !attendanceId.trim()) {
      return { canceledCount: 0, taskIds: [] }
    }

    const cleanAttendanceId = attendanceId.trim()

    try {
      // 1. Buscar tasks pendentes vinculadas estritamente a este attendance_id
      const pendingTasksResponse = await pb.collection('tasks').getList<Task>(1, 50, {
        filter: `attendance_id = "${cleanAttendanceId}" && status = "pendente"`,
        requestKey: null,
      })

      const tasksToCancel = pendingTasksResponse.items || []
      if (tasksToCancel.length === 0) {
        return { canceledCount: 0, taskIds: [] }
      }

      // 2. Guarda extra para Pós-venda: identificar IDs de tasks referenciadas em post_sales
      let postSaleTaskIds = new Set<string>()
      try {
        const linkedPostSales = await pb.collection('post_sales').getList(1, 50, {
          filter: `attendance_id = "${cleanAttendanceId}" && task_id != ""`,
          requestKey: null,
        })
        for (const ps of linkedPostSales.items || []) {
          if (ps.task_id) {
            postSaleTaskIds.add(ps.task_id)
          }
        }
      } catch {
        /* se a busca em post_sales falhar, a guarda por título prefixado atua como defesa adicional */
      }

      const canceledIds: string[] = []

      for (const task of tasksToCancel) {
        // Validação estrita: attendance_id deve bater com o ID exato
        if (!task.attendance_id || task.attendance_id !== cleanAttendanceId) {
          continue
        }

        // Defesa extra de pós-venda
        if (
          postSaleTaskIds.has(task.id) ||
          (typeof task.title === 'string' && task.title.trim().startsWith('⭐ Pós-venda'))
        ) {
          continue
        }

        try {
          await pb.collection('tasks').update<Task>(task.id, {
            status: 'cancelada',
          })
          canceledIds.push(task.id)
        } catch (updateErr) {
          console.error(
            `[cancelPendingFollowUpsForAttendance] Erro ao cancelar task ${task.id}:`,
            updateErr,
          )
        }
      }

      return {
        canceledCount: canceledIds.length,
        taskIds: canceledIds,
      }
    } catch (err) {
      console.error(
        `[cancelPendingFollowUpsForAttendance] Erro ao consultar tasks para attendance ${cleanAttendanceId}:`,
        err,
      )
      return { canceledCount: 0, taskIds: [] }
    }
  },
}
