import pb from '@/lib/pocketbase/client'
import type { SystemSetting, SlaConfig } from '@/types/crm'
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
      return {
        urgentHours: Number(map['sla_urgent_hours']) || DEFAULT_SLA_CONFIG.urgentHours,
        warningHours: Number(map['sla_warning_hours']) || DEFAULT_SLA_CONFIG.warningHours,
        noticeHours: Number(map['sla_notice_hours']) || DEFAULT_SLA_CONFIG.noticeHours,
      }
    } catch {
      return DEFAULT_SLA_CONFIG
    }
  },

  async saveSlaConfig(config: SlaConfig): Promise<void> {
    await Promise.all([
      this.setKey(
        'sla_urgent_hours',
        String(config.urgentHours),
        'Horas para SLA Crítico (Vermelho)',
      ),
      this.setKey(
        'sla_warning_hours',
        String(config.warningHours),
        'Horas para SLA Alerta (Laranja)',
      ),
      this.setKey(
        'sla_notice_hours',
        String(config.noticeHours),
        'Horas para SLA Atenção (Amarelo)',
      ),
    ])
  },
}
