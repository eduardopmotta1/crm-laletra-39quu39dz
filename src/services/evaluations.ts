import pb from '@/lib/pocketbase/client'
import type { Evaluation, EvaluationStatus } from '@/types/crm'

export interface SubmitEvaluationPayload {
  token: string
  overall_rating: number
  service_rating?: number
  quality_rating?: number
  delivery_rating?: number
  comment?: string
}

export const evaluationsService = {
  /**
   * Get all evaluations with optional filter and sort
   */
  async getAll(filter?: string, sort = '-created'): Promise<Evaluation[]> {
    try {
      return await pb.collection('evaluations').getFullList<Evaluation>({
        filter,
        sort,
        expand: 'client_id,order_id,attendance_id,resolved_by',
        requestKey: null,
      })
    } catch (error) {
      console.error('Error fetching evaluations:', error)
      return []
    }
  },

  /**
   * Get evaluations for a specific client
   */
  async getByClientId(clientId: string): Promise<Evaluation[]> {
    try {
      return await pb.collection('evaluations').getFullList<Evaluation>({
        filter: `client_id = "${clientId}"`,
        sort: '-created',
        expand: 'order_id,attendance_id,resolved_by',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching evaluations for client ${clientId}:`, error)
      return []
    }
  },

  /**
   * Get evaluations for a specific production order
   */
  async getByOrderId(orderId: string): Promise<Evaluation[]> {
    try {
      return await pb.collection('evaluations').getFullList<Evaluation>({
        filter: `order_id = "${orderId}"`,
        sort: '-created',
        expand: 'client_id,order_id,resolved_by',
        requestKey: null,
      })
    } catch (error) {
      console.error(`Error fetching evaluations for order ${orderId}:`, error)
      return []
    }
  },

  /**
   * Get evaluation info by token (for public evaluation page)
   */
  async getByToken(token: string): Promise<{
    valid: boolean
    already_submitted: boolean
    token: string
    order_number?: string | null
    product_name?: string | null
    overall_rating?: number | null
    service_rating?: number | null
    quality_rating?: number | null
    delivery_rating?: number | null
    comment?: string
  }> {
    const res = await fetch(
      `${pb.baseUrl}/api/crm/get-evaluation-token?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Link de avaliação inválido ou expirado.')
    }
    return await res.json()
  },

  /**
   * Submit evaluation from public page
   */
  async submitEvaluation(payload: SubmitEvaluationPayload): Promise<{
    success: boolean
    message: string
    is_dissatisfied: boolean
  }> {
    const res = await fetch(`${pb.baseUrl}/api/crm/submit-evaluation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao enviar avaliação.')
    }
    return data
  },

  /**
   * Mark dissatisfied client evaluation problem as resolved
   */
  async resolveEvaluation(
    evaluationId: string,
    notes: string,
    resolved = true,
  ): Promise<Evaluation> {
    const currentUserId = pb.authStore.record?.id
    const todayDateStr = new Date().toISOString().split('T')[0]

    const updated = await pb.collection('evaluations').update<Evaluation>(
      evaluationId,
      {
        resolved,
        resolved_at: resolved ? todayDateStr : null,
        resolved_notes: notes,
        resolved_by: resolved ? currentUserId : null,
        status: resolved ? 'resolved' : 'in_recovery',
      },
      {
        expand: 'client_id,order_id,attendance_id,resolved_by',
      },
    )

    // Update client relationship status to recovered if resolved
    if (updated.client_id) {
      try {
        await pb.collection('clients').update(updated.client_id, {
          relationship_status: resolved ? 'recovered' : 'in_recovery',
        })
      } catch (err) {
        console.error('Error updating client status on resolve:', err)
      }
    }

    return updated
  },

  /**
   * Update recovery status of evaluation
   */
  async updateStatus(evaluationId: string, status: EvaluationStatus): Promise<Evaluation> {
    const updated = await pb.collection('evaluations').update<Evaluation>(
      evaluationId,
      {
        status,
      },
      {
        expand: 'client_id,order_id,attendance_id,resolved_by',
      },
    )

    if (updated.client_id) {
      try {
        const clientStatus =
          status === 'resolved'
            ? 'recovered'
            : status === 'in_recovery'
              ? 'in_recovery'
              : status === 'satisfied'
                ? 'satisfied'
                : 'dissatisfied'
        await pb.collection('clients').update(updated.client_id, {
          relationship_status: clientStatus,
        })
      } catch (err) {
        console.error('Error updating client status:', err)
      }
    }

    return updated
  },
}
