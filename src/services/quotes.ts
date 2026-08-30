import pb from '@/lib/pocketbase/client'
import type { Quote, PublicQuoteData, QuoteStatus } from '@/types/quotes'

export const quotesService = {
  /**
   * Gera um token público aleatório e difícil de adivinhar
   */
  generatePublicToken(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let token = 'qtk_'
    for (let i = 0; i < 24; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return token
  },

  /**
   * Retorna a URL pública completa para o cliente visualizar/aprovar o orçamento
   */
  getPublicQuoteUrl(quote: Quote | { public_token?: string; id?: string }): string {
    const token = quote.public_token
    if (!token) return ''
    const origin =
      typeof window !== 'undefined' && window.location.origin ? window.location.origin : ''
    return `${origin}/orcamento/${token}`
  },
  async getAll(filter?: string, sort = '-created'): Promise<Quote[]> {
    try {
      return await pb.collection('quotes').getFullList<Quote>({
        filter,
        sort,
        expand: 'client_id,attendance_id,user_id',
      })
    } catch (err) {
      console.error('Error fetching quotes:', err)
      return []
    }
  },

  async getById(id: string): Promise<Quote | null> {
    try {
      return await pb.collection('quotes').getOne<Quote>(id, {
        expand: 'client_id,attendance_id,user_id',
      })
    } catch (err) {
      console.error(`Error fetching quote ${id}:`, err)
      return null
    }
  },

  async getByAttendanceId(attendanceId: string): Promise<Quote[]> {
    if (!attendanceId) return []
    try {
      return await pb.collection('quotes').getFullList<Quote>({
        filter: `attendance_id = "${attendanceId}"`,
        sort: '-created',
        expand: 'client_id,attendance_id,user_id',
      })
    } catch (err) {
      console.error(`Error fetching quotes for attendance ${attendanceId}:`, err)
      return []
    }
  },

  async generateNextCode(): Promise<string> {
    try {
      const year = new Date().getFullYear()
      // Sort by code descending to find the highest code of the current year if any
      const list = await pb.collection('quotes').getList(1, 1, {
        sort: '-created',
      })

      // Look for latest code matching ORC-YYYY-XXXX pattern
      let maxNum = 0
      try {
        const latestQuotes = await pb.collection('quotes').getList(1, 20, {
          sort: '-created',
        })
        for (const q of latestQuotes.items) {
          const match = q.code?.match(new RegExp(`^ORC-${year}-(\\d+)$`))
          if (match && match[1]) {
            const parsed = parseInt(match[1], 10)
            if (!isNaN(parsed) && parsed > maxNum) {
              maxNum = parsed
            }
          }
        }
      } catch (_) {
        // Fallback to totalItems
      }

      const nextNum =
        maxNum > 0
          ? (maxNum + 1).toString().padStart(4, '0')
          : (list.totalItems + 1).toString().padStart(4, '0')
      return `ORC-${year}-${nextNum}`
    } catch (err) {
      const random = Math.floor(1000 + Math.random() * 9000)
      return `ORC-${new Date().getFullYear()}-${random}`
    }
  },

  async create(data: Partial<Quote>): Promise<Quote> {
    const code = data.code || (await this.generateNextCode())
    const public_token = data.public_token || this.generatePublicToken()
    return await pb.collection('quotes').create<Quote>(
      {
        ...data,
        code,
        public_token,
        status: data.status || 'rascunho',
      },
      {
        expand: 'client_id,attendance_id,user_id',
      },
    )
  },

  /**
   * Garante que um orçamento tenha public_token (se criado anteriormente sem token)
   */
  async ensurePublicToken(quote: Quote): Promise<Quote> {
    if (quote.public_token && quote.public_token.trim() !== '') {
      return quote
    }
    const token = this.generatePublicToken()
    return await pb.collection('quotes').update<Quote>(quote.id, { public_token: token })
  },

  /**
   * Busca dados públicos do orçamento através do token seguro (sem login)
   */
  async getByPublicToken(token: string): Promise<PublicQuoteData> {
    const res = await pb.send<{ data: PublicQuoteData }>(
      `/api/public/quotes/${encodeURIComponent(token)}`,
      {
        method: 'GET',
      },
    )
    return res.data
  },

  /**
   * Aprova orçamento via endpoint público (sem login, idempotente)
   */
  async approvePublicQuote(token: string): Promise<{
    success: boolean
    already_approved?: boolean
    message: string
    approved_at?: string
    status: QuoteStatus
    code: string
  }> {
    return await pb.send(`/api/public/quotes/${encodeURIComponent(token)}/approve`, {
      method: 'POST',
    })
  },

  /**
   * Solicita alteração via endpoint público com justificativa/comentário
   */
  async requestChangePublicQuote(
    token: string,
    notes: string,
  ): Promise<{
    success: boolean
    message: string
    status: QuoteStatus
    customer_notes: string
    code: string
  }> {
    return await pb.send(`/api/public/quotes/${encodeURIComponent(token)}/request-change`, {
      method: 'POST',
      body: { customer_notes: notes },
    })
  },

  async update(id: string, data: Partial<Quote>): Promise<Quote> {
    // Explicitly omit 'code' and 'id' so that the original quote number and record ID remain completely immutable
    const { code: _omitCode, id: _omitId, ...payload } = data as any
    return await pb.collection('quotes').update<Quote>(id, payload, {
      expand: 'client_id,attendance_id,user_id',
    })
  },

  async updateStatus(id: string, status: Quote['status']): Promise<Quote> {
    return this.update(id, { status })
  },

  async approve(id: string): Promise<Quote> {
    // 1. Fetch current quote to preserve immutability and record audit log
    const existing = await this.getById(id)
    if (!existing) {
      throw new Error(`Orçamento com ID ${id} não encontrado.`)
    }

    const previousStatus = existing.status || 'rascunho'

    // 2. Update ONLY status to 'aprovado' on the EXACT same quote.id
    // code, items, total, client_id, attendance_id remain 100% immutable
    const updatedQuote = await pb
      .collection('quotes')
      .update<Quote>(
        id,
        { status: 'aprovado', approved_at: new Date().toISOString() },
        { expand: 'client_id,attendance_id,user_id' },
      )

    // 3. Register audit log
    try {
      const currentUser = pb.authStore.record
      await pb.collection('audit_logs').create({
        user_id: currentUser ? currentUser.id : null,
        user_name: currentUser ? currentUser.name || currentUser.email || '' : '',
        user_email: currentUser ? currentUser.email || '' : '',
        action: 'aprovar',
        module: 'quotes',
        record_id: updatedQuote.id,
        record_title: updatedQuote.code,
        details: `Orçamento ${updatedQuote.code} aprovado com sucesso. Valor total: R$ ${Number(updatedQuote.final_total || updatedQuote.total_sale || 0).toFixed(2)}.`,
        previous_value: {
          status: previousStatus,
        },
        new_value: {
          status: 'aprovado',
          code: updatedQuote.code,
          final_total: updatedQuote.final_total || updatedQuote.total_sale || 0,
          client_id: updatedQuote.client_id,
          attendance_id: updatedQuote.attendance_id,
        },
        ip_address: '',
      })
    } catch (auditErr) {
      console.error('Falha ao registrar audit_log de aprovação do orçamento:', auditErr)
    }

    return updatedQuote
  },

  async reject(id: string, reason?: string, notes?: string): Promise<Quote> {
    // 1. Fetch current quote
    const existing = await this.getById(id)
    if (!existing) {
      throw new Error(`Orçamento com ID ${id} não encontrado.`)
    }

    const previousStatus = existing.status || 'rascunho'

    // 2. Update ONLY status to 'recusado' on the EXACT same quote.id
    const updatedQuote = await pb
      .collection('quotes')
      .update<Quote>(
        id,
        { status: 'recusado', rejected_at: new Date().toISOString() },
        { expand: 'client_id,attendance_id,user_id' },
      )

    // 3. Register audit log with reason and free-form notes
    try {
      const currentUser = pb.authStore.record
      const reasonText = reason ? `Motivo: ${reason}` : 'Sem motivo informado'
      const notesText = notes ? ` Observação: ${notes}` : ''
      await pb.collection('audit_logs').create({
        user_id: currentUser ? currentUser.id : null,
        user_name: currentUser ? currentUser.name || currentUser.email || '' : '',
        user_email: currentUser ? currentUser.email || '' : '',
        action: 'recusar',
        module: 'quotes',
        record_id: updatedQuote.id,
        record_title: updatedQuote.code,
        details: `Orçamento ${updatedQuote.code} recusado. ${reasonText}.${notesText}`,
        previous_value: {
          status: previousStatus,
        },
        new_value: {
          status: 'recusado',
          reason: reason || null,
          notes: notes || null,
          code: updatedQuote.code,
          final_total: updatedQuote.final_total || updatedQuote.total_sale || 0,
          client_id: updatedQuote.client_id,
          attendance_id: updatedQuote.attendance_id,
        },
        ip_address: '',
      })
    } catch (auditErr) {
      console.error('Falha ao registrar audit_log de recusa do orçamento:', auditErr)
    }

    return updatedQuote
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('quotes').delete(id)
  },
}
