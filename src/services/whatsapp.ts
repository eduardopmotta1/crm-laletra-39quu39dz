import pb from '@/lib/pocketbase/client'
import type { Message, User } from '@/types/crm'

export interface SendWhatsAppParams {
  clientId: string
  messageText?: string
  templateName?: string
  templateLanguage?: string
  templateVariables?: Record<string, string>
  changeStageTo?: string
  enforce24hWindow?: boolean
}

export const whatsappService = {
  async getMessages(clientId: string): Promise<Message[]> {
    try {
      return await pb.collection('messages').getFullList<Message>({
        filter: `client_id = "${clientId}"`,
        sort: 'created',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching messages for client ${clientId}:`, error)
      return []
    }
  },

  /**
   * Send WhatsApp message (text or template) through backend hook / Cloud API
   */
  async sendMessage(
    clientId: string,
    messageText: string,
    options?: {
      templateName?: string
      templateLanguage?: string
      templateVariables?: Record<string, string>
      changeStageTo?: string
      enforce24hWindow?: boolean
    },
  ): Promise<{
    success: boolean
    api_dispatched?: boolean
    message_id?: string
    template_used?: string
    client?: any
    error?: string
  }> {
    try {
      const response = await pb.send<{
        success: boolean
        api_dispatched?: boolean
        message_id?: string
        template_used?: string
        client?: any
      }>('/api/crm/whatsapp-send', {
        method: 'POST',
        body: {
          client_id: clientId,
          message_text: messageText,
          template_name: options?.templateName,
          template_language: options?.templateLanguage || 'pt_BR',
          template_variables: options?.templateVariables,
          change_stage_to: options?.changeStageTo,
          enforce_24h_window: options?.enforce24hWindow,
        },
      })
      return response
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error)
      return {
        success: false,
        error: error?.data?.error || error?.message || 'Falha ao enviar mensagem',
      }
    }
  },

  /**
   * Send WhatsApp approved template explicitly (for starting new conversations)
   */
  async sendTemplateMessage(params: {
    clientId: string
    templateName: string
    templateLanguage?: string
    templateVariables?: Record<string, string>
    renderedText?: string
    changeStageTo?: string
  }): Promise<{
    success: boolean
    api_dispatched?: boolean
    message_id?: string
    client?: any
    error?: string
  }> {
    return this.sendMessage(params.clientId, params.renderedText || '', {
      templateName: params.templateName,
      templateLanguage: params.templateLanguage || 'pt_BR',
      templateVariables: params.templateVariables,
      changeStageTo: params.changeStageTo || 'Contato iniciado',
    })
  },

  /**
   * Check production webhook publication and health status
   */
  async checkPublicationStatus(
    url = 'https://crm-grafica-whatsapp-7b1a5.goskip.app/api/crm/whatsapp-webhook',
  ): Promise<{
    isPublished: boolean
    isJson: boolean
    status: string
    service?: string
    timestamp?: string
    error?: string
    rawResponse?: string
  }> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      })

      const contentType = response.headers.get('content-type') || ''
      const text = await response.text()

      if (contentType.includes('application/json')) {
        try {
          const data = JSON.parse(text)
          if (data && (data.status === 'active' || data.service)) {
            return {
              isPublished: true,
              isJson: true,
              status: data.status || 'active',
              service: data.service,
              timestamp: data.timestamp,
              rawResponse: text,
            }
          }
        } catch {
          /* intentionally ignored */
        }
      }

      // Check if response text is valid JSON with status active
      try {
        const parsed = JSON.parse(text)
        if (parsed && (parsed.status === 'active' || parsed.service)) {
          return {
            isPublished: true,
            isJson: true,
            status: parsed.status || 'active',
            service: parsed.service,
            timestamp: parsed.timestamp,
            rawResponse: text,
          }
        }
      } catch {
        /* intentionally ignored */
      }

      // If returned HTML (e.g. Builder/non-published placeholder) or non-JSON
      return {
        isPublished: false,
        isJson: false,
        status: response.status === 200 ? 'html_or_invalid_json' : `http_${response.status}`,
        error:
          'Resposta recebida não é o JSON ativo do webhook (projeto não publicado no Builder ou em manutenção)',
        rawResponse: text.slice(0, 300),
      }
    } catch (err: any) {
      return {
        isPublished: false,
        isJson: false,
        status: 'network_or_cors_error',
        error: err?.message || 'Falha na conexão de rede / CORS',
      }
    }
  },

  /**
   * Get Webhook Diagnostics data from backend
   */
  /**
   * Check if WhatsApp API credentials are configured in system_settings
   */
  async getApiStatus(): Promise<{
    configured: boolean
    hasToken: boolean
    hasPhoneNumberId: boolean
    phoneNumberId?: string
    displayPhone?: string
    isDemoToken: boolean
  }> {
    try {
      const list = await pb
        .collection('system_settings')
        .getFullList<{ setting_key: string; setting_value: string }>({
          requestKey: null,
        })
      const map: Record<string, string> = {}
      for (const item of list) {
        map[item.setting_key] = item.setting_value
      }

      const token = map['whatsapp_access_token'] || ''
      const phoneId = map['whatsapp_phone_number_id'] || ''
      const isDemo = !token || token.includes('DEMO_TOKEN') || token.length < 20
      const configured = Boolean(token && phoneId && !isDemo)

      return {
        configured,
        hasToken: Boolean(token),
        hasPhoneNumberId: Boolean(phoneId),
        phoneNumberId: phoneId || undefined,
        displayPhone: map['whatsapp_display_phone'] || undefined,
        isDemoToken: isDemo,
      }
    } catch (err) {
      console.error('Error fetching WhatsApp API status:', err)
      return {
        configured: false,
        hasToken: false,
        hasPhoneNumberId: false,
        isDemoToken: true,
      }
    }
  },

  async getWebhookDiagnostics(): Promise<{
    published: boolean
    webhook_url: string
    last_meta_event_at: string | null
    last_meta_event_type?: string
    total_inbound_messages?: number
    total_meta_messages?: number
    server_time: string
  }> {
    try {
      const res = await pb.send<{
        published: boolean
        webhook_url: string
        last_meta_event_at: string | null
        last_meta_event_type?: string
        total_inbound_messages?: number
        total_meta_messages?: number
        server_time: string
      }>('/api/crm/webhook-diagnostics', {
        method: 'GET',
      })
      return res
    } catch (error) {
      console.error('Error fetching webhook diagnostics:', error)
      return {
        published: false,
        webhook_url: 'https://crm-grafica-whatsapp-7b1a5.goskip.app/api/crm/whatsapp-webhook',
        last_meta_event_at: null,
        server_time: new Date().toISOString(),
      }
    }
  },

  /**
   * Simulate or trigger incoming webhook message from customer
   */
  async simulateInboundMessage(
    phone: string,
    message: string,
    senderName?: string,
  ): Promise<{ success: boolean; client_id?: string; error?: string }> {
    try {
      const response = await pb.send<{ success: boolean; client_id: string; stage: string }>(
        '/api/crm/whatsapp-webhook',
        {
          method: 'POST',
          body: {
            phone,
            text: message,
            sender_name: senderName,
          },
        },
      )
      return response
    } catch (error: any) {
      console.error('Error simulating incoming WhatsApp message:', error)
      return { success: false, error: error?.message || 'Falha ao simular mensagem' }
    }
  },
}

export const usersService = {
  async getAll(): Promise<User[]> {
    try {
      return await pb.collection('users').getFullList<User>({
        sort: 'name',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching users:', error)
      return []
    }
  },
}
