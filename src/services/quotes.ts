import pb from '@/lib/pocketbase/client'
import type { Quote } from '@/types/quotes'

export const quotesService = {
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
    return await pb.collection('quotes').create<Quote>(
      {
        ...data,
        code,
        status: data.status || 'rascunho',
      },
      {
        expand: 'client_id,attendance_id,user_id',
      },
    )
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
      .update<Quote>(id, { status: 'aprovado' }, { expand: 'client_id,attendance_id,user_id' })

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
      .update<Quote>(id, { status: 'recusado' }, { expand: 'client_id,attendance_id,user_id' })

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
