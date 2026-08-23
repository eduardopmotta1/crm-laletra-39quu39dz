import pb from '@/lib/pocketbase/client'
import type { Message, User } from '@/types/crm'

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
   * Send WhatsApp message through backend hook / Cloud API
   */
  async sendMessage(
    clientId: string,
    messageText: string,
  ): Promise<{ success: boolean; api_dispatched?: boolean; error?: string }> {
    try {
      const response = await pb.send<{
        success: boolean
        api_dispatched?: boolean
        message_id?: string
      }>('/api/crm/whatsapp-send', {
        method: 'POST',
        body: {
          client_id: clientId,
          message_text: messageText,
        },
      })
      return response
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error)
      return { success: false, error: error?.message || 'Falha ao enviar mensagem' }
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
