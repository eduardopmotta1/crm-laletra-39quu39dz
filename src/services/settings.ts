import pb from '@/lib/pocketbase/client'
import type {
  SystemSetting,
  SlaConfig,
  AutoArchiveConfig,
  PostSaleConfig,
  AutomationConfig,
} from '@/types/crm'
import { DEFAULT_SLA_CONFIG } from '@/lib/sla'

export const settingsService = {
  async getAll(): Promise<SystemSetting[]> {
    try {
      return await pb.collection('system_settings').getFullList<SystemSetting>({
        sort: 'setting_key',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching settings:', error)
      return []
    }
  },

  async getMap(): Promise<Record<string, string>> {
    const list = await this.getAll()
    const map: Record<string, string> = {}
    for (const item of list) {
      map[item.setting_key] = item.setting_value
    }
    return map
  },

  async setKey(key: string, value: string, description?: string): Promise<void> {
    try {
      const existing = await pb
        .collection('system_settings')
        .getFirstListItem<SystemSetting>(`setting_key = "${key}"`)
      await pb.collection('system_settings').update(existing.id, { setting_value: value })
    } catch {
      await pb.collection('system_settings').create({
        setting_key: key,
        setting_value: value,
        description: description || '',
      })
    }
  },

  async getSlaConfig(): Promise<SlaConfig> {
    try {
      const map = await this.getMap()
      // Support new minute keys as priority, fallback to old hour keys * 60 if present
      const urgentMinutes =
        Number(map['sla_urgent_minutes']) ||
        (map['sla_urgent_hours']
          ? Number(map['sla_urgent_hours']) * 60
          : DEFAULT_SLA_CONFIG.urgentMinutes)
      const warningMinutes =
        Number(map['sla_warning_minutes']) ||
        (map['sla_warning_hours']
          ? Number(map['sla_warning_hours']) * 60
          : DEFAULT_SLA_CONFIG.warningMinutes)
      const noticeMinutes =
        Number(map['sla_notice_minutes']) ||
        (map['sla_notice_hours']
          ? Number(map['sla_notice_hours']) * 60
          : DEFAULT_SLA_CONFIG.noticeMinutes)

      return {
        urgentMinutes,
        warningMinutes,
        noticeMinutes,
        urgentHours: Math.round(urgentMinutes / 60),
        warningHours: Math.round(warningMinutes / 60),
        noticeHours: Math.round(noticeMinutes / 60),
      }
    } catch {
      return DEFAULT_SLA_CONFIG
    }
  },

  async saveSlaConfig(config: SlaConfig): Promise<void> {
    const urgentVal = config.urgentMinutes ?? (config.urgentHours ? config.urgentHours * 60 : 1440)
    const warningVal =
      config.warningMinutes ?? (config.warningHours ? config.warningHours * 60 : 720)
    const noticeVal = config.noticeMinutes ?? (config.noticeHours ? config.noticeHours * 60 : 360)

    await Promise.all([
      this.setKey('sla_urgent_minutes', String(urgentVal), 'Minutos para SLA Crítico (Vermelho)'),
      this.setKey('sla_warning_minutes', String(warningVal), 'Minutos para SLA Alerta (Laranja)'),
      this.setKey('sla_notice_minutes', String(noticeVal), 'Minutos para SLA Atenção (Amarelo)'),
    ])
  },

  async getAutoArchiveConfig(): Promise<AutoArchiveConfig> {
    try {
      const map = await this.getMap()
      return {
        enabled: map['auto_archive_enabled'] !== 'false',
        wonHours: Number(map['auto_archive_won_hours']) || 24,
        lostHours: Number(map['auto_archive_lost_hours']) || 24,
      }
    } catch {
      return {
        enabled: true,
        wonHours: 24,
        lostHours: 24,
      }
    }
  },

  async saveAutoArchiveConfig(config: AutoArchiveConfig): Promise<void> {
    await Promise.all([
      this.setKey(
        'auto_archive_enabled',
        String(config.enabled),
        'Habilita arquivamento automático de atendimentos finalizados',
      ),
      this.setKey(
        'auto_archive_won_hours',
        String(config.wonHours),
        'Horas após fechamento para arquivar venda fechada',
      ),
      this.setKey(
        'auto_archive_lost_hours',
        String(config.lostHours),
        'Horas após encerramento para arquivar venda perdida',
      ),
    ])
  },

  /**
   * Get post sale configuration
   */
  async getPostSaleConfig(): Promise<PostSaleConfig> {
    const map = await this.getMap()
    return {
      enabled: map['post_sale_enabled'] !== 'false',
      delayDays: Number(map['post_sale_delay_days']) || 3,
      autoTask: map['post_sale_auto_task'] !== 'false',
      whatsappTemplate: map['post_sale_whatsapp_template'] || 'avaliacao_atendimento',
      customMessage:
        map['post_sale_custom_message'] ||
        'Olá {{nome}}! Seu pedido foi entregue recentemente pela Laletra. Poderia avaliar sua experiência conosco no link: {{link_avaliacao}} ? Agradecemos muito!',
    }
  },

  /**
   * Save post sale configuration
   */
  async savePostSaleConfig(config: PostSaleConfig): Promise<void> {
    await Promise.all([
      this.setKey(
        'post_sale_enabled',
        String(config.enabled),
        'Habilita a rotina e agendamento automático de pós-venda',
      ),
      this.setKey(
        'post_sale_delay_days',
        String(config.delayDays),
        'Dias após conclusão da venda para realizar o pós-venda',
      ),
      this.setKey(
        'post_sale_auto_task',
        String(config.autoTask),
        'Cria automaticamente uma tarefa no CRM na data agendada do pós-venda',
      ),
      this.setKey(
        'post_sale_whatsapp_template',
        config.whatsappTemplate,
        'Template padrão de WhatsApp para convite de avaliação',
      ),
      this.setKey(
        'post_sale_custom_message',
        config.customMessage,
        'Mensagem de pós-venda padrão com link dinâmico de avaliação',
      ),
    ])
  },

  /**
   * Get automation configuration
   */
  async getAutomationConfig(): Promise<AutomationConfig> {
    try {
      const map = await this.getMap()
      return {
        waitingResponseAltaMinutes: Number(map['automation_waiting_response_alta_min']) || 15,
        waitingResponseUrgenteMinutes: Number(map['automation_waiting_response_urgente_min']) || 60,
        quoteNoReturnAltaDays: Number(map['automation_quote_no_return_alta_days']) || 1,
        quoteNoReturnUrgenteDays: Number(map['automation_quote_no_return_urgente_days']) || 3,
        followupOverdueUrgenteDays: Number(map['automation_followup_overdue_urgente_days']) || 2,
        proofWaitingAltaDays: Number(map['automation_proof_waiting_alta_days']) || 1,
        proofWaitingUrgenteDays: Number(map['automation_proof_waiting_urgente_days']) || 2,
        orderOverdueUrgenteDays: Number(map['automation_order_overdue_urgente_days']) || 1,
        dissatisfiedUrgenteHours: Number(map['automation_dissatisfied_urgente_hours']) || 24,
        postSaleAltaDays: Number(map['automation_postsale_alta_days']) || 1,
        postSaleUrgenteDays: Number(map['automation_postsale_urgente_days']) || 3,
        executionModes: {
          waiting_response: 'page_load',
          quote_no_return: 'page_load',
          followup_overdue: 'page_load',
          proof_waiting: 'page_load',
          order_overdue: 'page_load',
          dissatisfied: 'page_load',
          post_sale: 'event',
          sla_visual: 'visual',
        },
      }
    } catch {
      return {
        waitingResponseAltaMinutes: 15,
        waitingResponseUrgenteMinutes: 60,
        quoteNoReturnAltaDays: 1,
        quoteNoReturnUrgenteDays: 3,
        followupOverdueUrgenteDays: 2,
        proofWaitingAltaDays: 1,
        proofWaitingUrgenteDays: 2,
        orderOverdueUrgenteDays: 1,
        dissatisfiedUrgenteHours: 24,
        postSaleAltaDays: 1,
        postSaleUrgenteDays: 3,
        executionModes: {
          waiting_response: 'page_load',
          quote_no_return: 'page_load',
          followup_overdue: 'page_load',
          proof_waiting: 'page_load',
          order_overdue: 'page_load',
          dissatisfied: 'page_load',
          post_sale: 'event',
          sla_visual: 'visual',
        },
      }
    }
  },

  /**
   * Save automation configuration
   */
  async saveAutomationConfig(config: AutomationConfig): Promise<void> {
    await Promise.all([
      this.setKey(
        'automation_waiting_response_alta_min',
        String(config.waitingResponseAltaMinutes),
        'Minutos para prioridade Alta em Cliente aguardando resposta',
      ),
      this.setKey(
        'automation_waiting_response_urgente_min',
        String(config.waitingResponseUrgenteMinutes),
        'Minutos para prioridade Urgente em Cliente aguardando resposta',
      ),
      this.setKey(
        'automation_quote_no_return_alta_days',
        String(config.quoteNoReturnAltaDays),
        'Dias para prioridade Alta em Orçamento sem retorno',
      ),
      this.setKey(
        'automation_quote_no_return_urgente_days',
        String(config.quoteNoReturnUrgenteDays),
        'Dias para prioridade Urgente em Orçamento sem retorno',
      ),
      this.setKey(
        'automation_followup_overdue_urgente_days',
        String(config.followupOverdueUrgenteDays),
        'Dias de atraso para prioridade Urgente em Follow-up vencido',
      ),
      this.setKey(
        'automation_proof_waiting_alta_days',
        String(config.proofWaitingAltaDays),
        'Dias para prioridade Alta em Arte aguardando aprovação',
      ),
      this.setKey(
        'automation_proof_waiting_urgente_days',
        String(config.proofWaitingUrgenteDays),
        'Dias para prioridade Urgente em Arte aguardando aprovação',
      ),
      this.setKey(
        'automation_order_overdue_urgente_days',
        String(config.orderOverdueUrgenteDays),
        'Dias de atraso para prioridade Urgente em Pedido atrasado',
      ),
      this.setKey(
        'automation_dissatisfied_urgente_hours',
        String(config.dissatisfiedUrgenteHours),
        'Horas para prioridade Urgente em Cliente insatisfeito',
      ),
      this.setKey(
        'automation_postsale_alta_days',
        String(config.postSaleAltaDays),
        'Dias para prioridade Alta em Pós-venda pendente',
      ),
      this.setKey(
        'automation_postsale_urgente_days',
        String(config.postSaleUrgenteDays),
        'Dias para prioridade Urgente em Pós-venda pendente',
      ),
    ])
  },
}
