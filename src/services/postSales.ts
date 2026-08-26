import pb from '@/lib/pocketbase/client'
import type { PostSale, PostSaleStatus } from '@/types/crm'

export const postSalesService = {
  /**
   * Get all post sales routines with optional filter
   */
  async getAll(filter?: string, sort = '-scheduled_date'): Promise<PostSale[]> {
    try {
      return await pb.collection('post_sales').getFullList<PostSale>({
        filter,
        sort,
        expand: 'client_id,order_id,attendance_id,task_id',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching post sales:', error)
      return []
    }
  },

  /**
   * Get post sales for a client
   */
  async getByClientId(clientId: string): Promise<PostSale[]> {
    try {
      return await pb.collection('post_sales').getFullList<PostSale>({
        filter: `client_id = "${clientId}"`,
        sort: '-scheduled_date',
        expand: 'order_id,attendance_id,task_id',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching post sales for client ${clientId}:`, error)
      return []
    }
  },

  /**
   * Get post sales for a specific production order
   */
  async getByOrderId(orderId: string): Promise<PostSale[]> {
    try {
      return await pb.collection('post_sales').getFullList<PostSale>({
        filter: `order_id = "${orderId}"`,
        sort: '-scheduled_date',
        expand: 'client_id,order_id,task_id',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching post sales for order ${orderId}:`, error)
      return []
    }
  },

  /**
   * Create a post sale record
   */
  async create(data: {
    clientId: string
    orderId?: string
    orderNumber?: string
    attendanceId?: string
    scheduledDate: string
    status?: PostSaleStatus
    taskId?: string
    evaluationToken?: string
    channel?: string
    notes?: string
  }): Promise<PostSale> {
    return await pb.collection('post_sales').create<PostSale>({
      client_id: data.clientId,
      order_id: data.orderId || undefined,
      order_number: data.orderNumber || undefined,
      attendance_id: data.attendanceId || undefined,
      scheduled_date: data.scheduledDate,
      status: data.status || 'pending',
      task_id: data.taskId || undefined,
      evaluation_token: data.evaluationToken || undefined,
      channel: data.channel || 'whatsapp',
      notes: data.notes || '',
    })
  },

  /**
   * Mark post sale message as sent
   */
  async markAsSent(id: string, notes?: string): Promise<PostSale> {
    return await pb.collection('post_sales').update<PostSale>(id, {
      status: 'sent',
      sent_date: new Date().toISOString().split('T')[0],
      notes: notes || undefined,
    })
  },

  /**
   * Update status
   */
  async updateStatus(id: string, status: PostSaleStatus): Promise<PostSale> {
    return await pb.collection('post_sales').update<PostSale>(id, { status })
  },
}
