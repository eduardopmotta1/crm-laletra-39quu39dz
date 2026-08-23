import pb from '@/lib/pocketbase/client'
import type { WhatsAppTemplate } from '@/types/crm'

export const whatsappTemplatesService = {
  async getAll(): Promise<WhatsAppTemplate[]> {
    try {
      return await pb.collection('whatsapp_templates').getFullList<WhatsAppTemplate>({
        sort: 'name',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching WhatsApp templates:', error)
      return []
    }
  },

  async getApproved(): Promise<WhatsAppTemplate[]> {
    try {
      return await pb.collection('whatsapp_templates').getFullList<WhatsAppTemplate>({
        filter: 'status = "APPROVED"',
        sort: 'name',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching approved WhatsApp templates:', error)
      return []
    }
  },

  async getById(id: string): Promise<WhatsAppTemplate | null> {
    try {
      return await pb.collection('whatsapp_templates').getOne<WhatsAppTemplate>(id, {
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching template ${id}:`, error)
      return null
    }
  },

  async create(data: {
    name: string
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
    language: string
    status: 'APPROVED' | 'PENDING' | 'REJECTED'
    body: string
    variables?: string[]
  }): Promise<WhatsAppTemplate> {
    // Extract variables automatically from body if not explicitly provided
    const variables = data.variables || extractVariablesFromBody(data.body)
    return await pb.collection('whatsapp_templates').create<WhatsAppTemplate>({
      ...data,
      variables,
    })
  },

  async update(id: string, data: Partial<WhatsAppTemplate>): Promise<WhatsAppTemplate> {
    if (data.body && !data.variables) {
      data.variables = extractVariablesFromBody(data.body)
    }
    return await pb.collection('whatsapp_templates').update<WhatsAppTemplate>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('whatsapp_templates').delete(id)
      return true
    } catch (error) {
      console.error(`Error deleting template ${id}:`, error)
      return false
    }
  },

  /**
   * Sincroniza templates diretamente com a API Oficial da Meta WABA
   */
  async syncMetaTemplates(): Promise<{
    synced: boolean
    count?: number
    message?: string
    error?: string
  }> {
    try {
      const response = await pb.send<{
        synced: boolean
        count?: number
        message?: string
        error?: string
      }>('/api/crm/whatsapp-sync-templates', {
        method: 'POST',
      })
      return response
    } catch (error: any) {
      console.error('Error syncing Meta templates:', error)
      return {
        synced: false,
        error: error?.message || 'Falha ao sincronizar templates com a Meta',
      }
    }
  },
}

export function extractVariablesFromBody(body: string): string[] {
  const matches = body.match(/\{\{([a-zA-Z0-9_]+|[0-9]+)\}\}/g) || []
  const vars: string[] = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const clean = m.replace(/[{}]/g, '').trim()
    if (!vars.includes(clean)) {
      vars.push(clean)
    }
  }
  return vars
}

export function renderTemplatePreview(body: string, variablesMap: Record<string, string>): string {
  let rendered = body
  Object.keys(variablesMap).forEach((key) => {
    const val = variablesMap[key] || `{{${key}}}`
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
  })
  return rendered
}
