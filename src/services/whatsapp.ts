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
