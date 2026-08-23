import pb from '@/lib/pocketbase/client'
import type { SystemSetting, SlaConfig, AutoArchiveConfig } from '@/types/crm'
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
        config.enabled ? 'true' : 'false',
        'Habilita arquivamento automático de atendimentos finalizados',
      ),
      this.setKey(
        'auto_archive_won_hours',
        String(config.wonHours || 24),
        'Horas para arquivar vendas fechadas',
      ),
      this.setKey(
        'auto_archive_lost_hours',
        String(config.lostHours || 24),
        'Horas para arquivar vendas perdidas',
      ),
    ])
  },
}
