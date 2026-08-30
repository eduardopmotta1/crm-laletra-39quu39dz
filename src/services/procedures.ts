import pb from '@/lib/pocketbase/client'
import type { User } from '@/types/crm'

export type ProcedureStatus = 'Rascunho' | 'Ativo' | 'Em revisão' | 'Arquivado'

export const INITIAL_PROCEDURE_CATEGORIES = [
  'Atendimento',
  'Comercial',
  'Orçamentos',
  'Design / Arte',
  'Produção',
  'Impressão',
  'Sublimação',
  'Acabamento',
  'Expedição',
  'Administrativo',
  'Organização e Limpeza',
  'Manutenção',
] as const

export type ProcedureCategory = (typeof INITIAL_PROCEDURE_CATEGORIES)[number] | 'Outros' | string

export interface ProcedureStep {
  id?: string
  title: string
  description?: string
  order?: number
}

export interface Procedure {
  id: string
  title: string
  category: ProcedureCategory
  summary?: string
  content?: string
  steps?: ProcedureStep[]
  notes?: string
  reviewer_id?: string
  reviewer_name?: string
  status: ProcedureStatus
  last_reviewed_at?: string
  version?: string
  attachments?: string[]
  expand?: {
    reviewer_id?: User
  }
  created: string
  updated: string
}

export interface ProcedureFilterOptions {
  search?: string
  category?: string
  status?: ProcedureStatus | 'all'
  includeArchived?: boolean
}

export const proceduresService = {
  /**
   * Fetch procedures list with optional filters
   */
  async getAll(options?: ProcedureFilterOptions): Promise<Procedure[]> {
    try {
      const filters: string[] = []

      if (options?.category && options.category !== 'all') {
        filters.push(`category = "${options.category}"`)
      }

      if (options?.status && options.status !== 'all') {
        filters.push(`status = "${options.status}"`)
      } else if (!options?.includeArchived) {
        // By default show active, draft and in review
        filters.push(`status != "Arquivado"`)
      }

      if (options?.search && options.search.trim()) {
        const query = options.search.trim().replace(/"/g, '\\"')
        filters.push(
          `(title ~ "${query}" || summary ~ "${query}" || content ~ "${query}" || notes ~ "${query}")`,
        )
      }

      const filterStr = filters.length > 0 ? filters.join(' && ') : undefined

      return await pb.collection('procedures').getFullList<Procedure>({
        filter: filterStr,
        sort: '-updated,-created',
        expand: 'reviewer_id',
        requestKey: null,
      })
    } catch (err) {
      console.error('Error fetching procedures:', err)
      return []
    }
  },

  /**
   * Fetch single procedure by ID
   */
  async getById(id: string): Promise<Procedure | null> {
    try {
      return await pb.collection('procedures').getOne<Procedure>(id, {
        expand: 'reviewer_id',
        requestKey: null,
      })
    } catch (err) {
      console.error(`Error fetching procedure ${id}:`, err)
      return null
    }
  },

  /**
   * Distinct categories in use + defaults
   */
  async getCategories(): Promise<string[]> {
    try {
      const list = await pb.collection('procedures').getFullList<Procedure>({
        fields: 'category',
        requestKey: null,
      })
      const found = list.map((p) => p.category).filter(Boolean)
      const merged = Array.from(new Set([...INITIAL_PROCEDURE_CATEGORIES, ...found]))
      return merged
    } catch (err) {
      return [...INITIAL_PROCEDURE_CATEGORIES]
    }
  },

  /**
   * Create new procedure
   */
  async create(data: FormData | Partial<Procedure>): Promise<Procedure> {
    const record = await pb.collection('procedures').create<Procedure>(data as any, {
      expand: 'reviewer_id',
    })
    return record
  },

  /**
   * Update existing procedure
   */
  async update(id: string, data: FormData | Partial<Procedure>): Promise<Procedure> {
    const record = await pb.collection('procedures').update<Procedure>(id, data as any, {
      expand: 'reviewer_id',
    })
    return record
  },

  /**
   * Archive procedure (preferred over hard delete)
   */
  async archive(id: string): Promise<Procedure> {
    return this.update(id, { status: 'Arquivado' })
  },

  /**
   * Reactivate procedure
   */
  async reactivate(id: string): Promise<Procedure> {
    return this.update(id, { status: 'Ativo' })
  },

  /**
   * Hard delete (only when strictly requested by admin)
   */
  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('procedures').delete(id)
      return true
    } catch (err) {
      console.error(`Error deleting procedure ${id}:`, err)
      return false
    }
  },

  /**
   * Get file URL for an attachment
   */
  getFileUrl(procedure: Procedure, fileName: string): string {
    if (!fileName) return ''
    return pb.files.getURL(procedure, fileName)
  },
}
