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
}
