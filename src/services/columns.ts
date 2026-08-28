import pb from '@/lib/pocketbase/client'
import type { Attendance, KanbanColumn, KanbanStage } from '@/types/crm'
import { attendancesService } from './attendances'

export const defaultKanbanColumns: Omit<KanbanColumn, 'id'>[] = [
  {
    internal_id: 'new_contact',
    name: 'Novo contato',
    description: 'Novas mensagens ou leads cadastrados',
    color: 'blue',
    order_index: 0,
    is_visible: true,
    stage_type: 'initial',
  },
  {
    internal_id: 'contact_initiated',
    name: 'Contato iniciado',
    description: 'Template WhatsApp enviado ao cliente',
    color: 'cyan',
    order_index: 1,
    is_visible: true,
    stage_type: 'intermediate',
  },
  {
    internal_id: 'needs_response',
    name: 'Precisa responder',
    description: 'Clientes aguardando nossa resposta (SLA ativo)',
    color: 'rose',
    order_index: 2,
    is_visible: true,
    stage_type: 'intermediate',
  },
  {
    internal_id: 'in_service',
    name: 'Em atendimento',
    description: 'Briefing e especificações técnicas',
    color: 'amber',
    order_index: 3,
    is_visible: true,
    stage_type: 'intermediate',
  },
  {
    internal_id: 'quote_sent',
    name: 'Orçamento enviado',
    description: 'Proposta de preços encaminhada',
    color: 'purple',
    order_index: 4,
    is_visible: true,
    stage_type: 'intermediate',
  },
  {
    internal_id: 'waiting_customer',
    name: 'Aguardando cliente',
    description: 'Aguardando aprovação ou arte final',
    color: 'indigo',
    order_index: 5,
    is_visible: true,
    stage_type: 'intermediate',
  },
  {
    internal_id: 'won',
    name: 'Venda fechada',
    description: 'PIX/Pagamento aprovado & em produção',
    color: 'emerald',
    order_index: 6,
    is_visible: true,
    stage_type: 'final',
  },
  {
    internal_id: 'lost',
    name: 'Não fechou',
    description: 'Orçamento recusado ou cancelado',
    color: 'slate',
    order_index: 7,
    is_visible: true,
    stage_type: 'final',
  },
]

export const columnsService = {
  async getAll(): Promise<KanbanColumn[]> {
    try {
      const records = await pb.collection('kanban_columns').getFullList<KanbanColumn>({
        sort: 'order_index',
        requestKey: null,
      })
      if (records.length === 0) {
        // Self-heal default columns
        const created: KanbanColumn[] = []
        for (const col of defaultKanbanColumns) {
          const rec = await pb.collection('kanban_columns').create<KanbanColumn>(col)
          created.push(rec)
        }
        return created
      }
      return records
    } catch (error) {
      console.error('Error fetching kanban columns:', error)
      return defaultKanbanColumns.map((c, i) => ({ ...c, id: `col_${i}` }))
    }
  },

  async getVisible(): Promise<KanbanColumn[]> {
    const all = await this.getAll()
    return all.filter((c) => c.is_visible !== false)
  },

  async getByInternalId(internalId: string): Promise<KanbanColumn | null> {
    try {
      return await pb
        .collection('kanban_columns')
        .getFirstListItem<KanbanColumn>(`internal_id = "${internalId}"`)
    } catch {
      return null
    }
  },

  async create(data: Partial<KanbanColumn>): Promise<KanbanColumn> {
    return await pb.collection('kanban_columns').create<KanbanColumn>({
      internal_id:
        data.internal_id || `stage_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: data.name || 'Nova Etapa',
      description: data.description || '',
      color: data.color || 'blue',
      order_index: data.order_index ?? 99,
      is_visible: data.is_visible !== false,
      stage_type: data.stage_type || 'intermediate',
    })
  },

  async update(id: string, data: Partial<KanbanColumn>): Promise<KanbanColumn> {
    return await pb.collection('kanban_columns').update<KanbanColumn>(id, data)
  },

  /**
   * Safe deletion: Checks if there are active attendances linked to this column stage.
   * If moveClientsToStageName is supplied, it moves only the active attendances linked
   * to this column to the target stage, recording stage_transitions with attendance_id.
   * Client legacy stage is mirrored for compatibility without deleting any attendance or client.
   */
  async safeDelete(
    columnId: string,
    columnName: string,
    moveClientsToStageName?: string,
  ): Promise<{ success: boolean; movedCount: number; error?: string }> {
    try {
      // Find active attendances linked to this column stage
      const activeAttendances = await pb.collection('attendances').getFullList<Attendance>({
        filter: `is_archived != true && stage = "${columnName}"`,
        requestKey: null,
      })

      if (activeAttendances.length > 0) {
        if (!moveClientsToStageName) {
          return {
            success: false,
            movedCount: 0,
            error: `Existem ${activeAttendances.length} atendimentos ativos nesta coluna. Escolha outra etapa para movê-los antes de excluir.`,
          }
        }

        // Move each active attendance to target stage using attendancesService.updateStage
        for (const attendance of activeAttendances) {
          await attendancesService.updateStage(
            attendance.id,
            moveClientsToStageName as KanbanStage,
            {
              changeType: 'manual',
              fromStage: columnName,
              notes: `Atendimento remanejado devido à exclusão da coluna "${columnName}".`,
            },
          )

          // Mirror stage on client record for legacy compatibility
          if (attendance.client_id) {
            try {
              await pb.collection('clients').update(attendance.client_id, {
                stage: moveClientsToStageName,
              })
            } catch {
              /* non-fatal legacy mirror */
            }
          }
        }
      }

      await pb.collection('kanban_columns').delete(columnId)
      return { success: true, movedCount: activeAttendances.length }
    } catch (error: any) {
      console.error('Error safe deleting column:', error)
      return {
        success: false,
        movedCount: 0,
        error: error?.message || 'Falha ao excluir coluna.',
      }
    }
  },

  async reorder(orderedIds: string[]): Promise<void> {
    for (let index = 0; index < orderedIds.length; index++) {
      const id = orderedIds[index]
      await pb.collection('kanban_columns').update(id, { order_index: index })
    }
  },
}
