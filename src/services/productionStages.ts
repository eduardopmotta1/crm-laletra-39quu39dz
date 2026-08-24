import pb from '@/lib/pocketbase/client'
import type { ProductionStage, ProductionStageInternalId } from '@/types/crm'

export const defaultProductionStages: Omit<ProductionStage, 'id'>[] = [
  {
    internal_id: 'order_received',
    name: 'Pedido recebido',
    description: 'Pedido confirmado e registrado no sistema',
    color: 'blue',
    order_index: 0,
    is_visible: true,
    auto_notify_whatsapp: true,
    whatsapp_message_template:
      'Olá, {{nome}}! Seu pedido #{{pedido}} foi confirmado e já entrou em nosso sistema. Você receberá atualizações por aqui conforme ele avançar.',
  },
  {
    internal_id: 'awaiting_info',
    name: 'Aguardando informações/arquivo',
    description: 'Aguardando envio de arquivos, logos ou informações adicionais',
    color: 'amber',
    order_index: 1,
    is_visible: true,
    auto_notify_whatsapp: true,
    whatsapp_message_template:
      'Olá, {{nome}}! Para darmos andamento ao pedido #{{pedido}}, precisamos que envie as informações/arquivos pendentes.',
  },
  {
    internal_id: 'art_preparation',
    name: 'Arte em preparação',
    description: 'Equipe de design diagramando e ajustando arte/prova digital',
    color: 'indigo',
    order_index: 2,
    is_visible: true,
    auto_notify_whatsapp: false,
    whatsapp_message_template: '',
  },
  {
    internal_id: 'awaiting_approval',
    name: 'Aguardando aprovação do cliente',
    description: 'Prova digital enviada ao cliente aguardando OK final',
    color: 'purple',
    order_index: 3,
    is_visible: true,
    auto_notify_whatsapp: true,
    whatsapp_message_template:
      'Olá, {{nome}}! A arte do seu pedido #{{pedido}} está pronta para aprovação. Por favor, confira para podermos continuar a produção. Link de acompanhamento: {{link_acompanhamento}}',
  },
  {
    internal_id: 'approved',
    name: 'Aprovado',
    description: 'Arte e especificações aprovadas pelo cliente',
    color: 'cyan',
    order_index: 4,
    is_visible: true,
    auto_notify_whatsapp: true,
    whatsapp_message_template:
      'Tudo certo! A arte do seu pedido #{{pedido}} foi aprovada e seguirá para produção.',
  },
  {
    internal_id: 'in_production',
    name: 'Em produção',
    description: 'Impressão, laminação, corte, vinco e acabamentos',
    color: 'amber',
    order_index: 5,
    is_visible: true,
    auto_notify_whatsapp: true,
    whatsapp_message_template:
      'Seu pedido #{{pedido}} entrou em produção. Avisaremos assim que estiver pronto.',
  },
  {
    internal_id: 'ready',
    name: 'Pronto',
    description: 'Material pronto no setor de expedição / balcão',
    color: 'emerald',
    order_index: 6,
    is_visible: true,
    auto_notify_whatsapp: true,
    whatsapp_message_template: 'Boas notícias! Seu pedido #{{pedido}} está pronto.',
  },
  {
    internal_id: 'shipped',
    name: 'Enviado / Aguardando retirada',
    description: 'Despachado para entrega ou aguardando cliente retirar',
    color: 'blue',
    order_index: 7,
    is_visible: true,
    auto_notify_whatsapp: true,
    whatsapp_message_template: 'Seu pedido #{{pedido}} foi enviado! {{codigo_rastreio}}',
  },
  {
    internal_id: 'completed',
    name: 'Concluído',
    description: 'Pedido entregue e finalizado com sucesso',
    color: 'slate',
    order_index: 8,
    is_visible: true,
    auto_notify_whatsapp: true,
    whatsapp_message_template:
      'Pedido #{{pedido}} concluído com sucesso! Agradecemos a preferência pela Gráfica Laletra.',
  },
]

export const productionStagesService = {
  async getAll(): Promise<ProductionStage[]> {
    try {
      const records = await pb.collection('production_stages').getFullList<ProductionStage>({
        sort: 'order_index',
        requestKey: null,
      })
      if (records.length === 0) {
        // Self-heal default production stages
        const created: ProductionStage[] = []
        for (const st of defaultProductionStages) {
          const rec = await pb.collection('production_stages').create<ProductionStage>(st)
          created.push(rec)
        }
        return created
      }
      return records
    } catch (error) {
      console.error('Error fetching production stages:', error)
      return defaultProductionStages.map((s, i) => ({ ...s, id: `stage_${i}` }))
    }
  },

  async getVisible(): Promise<ProductionStage[]> {
    const all = await this.getAll()
    return all.filter((s) => s.is_visible !== false)
  },

  async getByInternalId(internalId: ProductionStageInternalId): Promise<ProductionStage | null> {
    try {
      return await pb
        .collection('production_stages')
        .getFirstListItem<ProductionStage>(`internal_id = "${internalId}"`)
    } catch {
      return null
    }
  },

  async create(data: Partial<ProductionStage>): Promise<ProductionStage> {
    return await pb.collection('production_stages').create<ProductionStage>({
      internal_id:
        data.internal_id || `stage_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: data.name || 'Nova Etapa de Produção',
      description: data.description || '',
      color: data.color || 'blue',
      order_index: data.order_index ?? 99,
      is_visible: data.is_visible !== false,
      auto_notify_whatsapp: data.auto_notify_whatsapp || false,
      whatsapp_message_template: data.whatsapp_message_template || '',
    })
  },

  async update(id: string, data: Partial<ProductionStage>): Promise<ProductionStage> {
    return await pb.collection('production_stages').update<ProductionStage>(id, data)
  },

  async safeDelete(
    stageId: string,
    stageInternalId: string,
    moveOrdersToStageInternalId?: string,
  ): Promise<{ success: boolean; movedCount: number; error?: string }> {
    try {
      const linkedOrders = await pb.collection('production_orders').getFullList({
        filter: `stage_internal_id = "${stageInternalId}"`,
        requestKey: null,
      })

      if (linkedOrders.length > 0) {
        if (!moveOrdersToStageInternalId) {
          return {
            success: false,
            movedCount: 0,
            error: `Existem ${linkedOrders.length} pedidos nesta etapa. Escolha outra etapa de destino antes de excluir.`,
          }
        }

        const targetStage = await this.getByInternalId(moveOrdersToStageInternalId)
        for (const order of linkedOrders) {
          await pb.collection('production_orders').update(order.id, {
            stage_internal_id: moveOrdersToStageInternalId,
            stage_name: targetStage?.name || moveOrdersToStageInternalId,
            stage_id: targetStage?.id,
          })
        }
      }

      await pb.collection('production_stages').delete(stageId)
      return { success: true, movedCount: linkedOrders.length }
    } catch (err: any) {
      console.error('Error deleting production stage:', err)
      return { success: false, movedCount: 0, error: err?.message || 'Erro ao excluir etapa.' }
    }
  },

  async reorder(orderedIds: string[]): Promise<void> {
    for (let index = 0; index < orderedIds.length; index++) {
      const id = orderedIds[index]
      await pb.collection('production_stages').update(id, { order_index: index })
    }
  },
}
