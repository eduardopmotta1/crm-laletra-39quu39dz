import pb from '@/lib/pocketbase/client'
import type { Role, User, AuditLog } from '@/types/crm'

export interface CreateUserData {
  name: string
  email: string
  password?: string
  phone?: string
  role_id?: string
  role_slug?: string
  is_active?: boolean
  custom_permissions?: Record<string, boolean>
}

export interface UpdateUserData {
  name?: string
  email?: string
  password?: string
  phone?: string
  role_id?: string
  role_slug?: string
  is_active?: boolean
  custom_permissions?: Record<string, boolean>
}

export interface CreateRoleData {
  name: string
  slug: string
  description?: string
  color?: string
  permissions: Record<string, boolean>
  is_system?: boolean
}

export const usersAdminService = {
  /**
   * Fetch all system users with their linked role expanded
   */
  async getAll(): Promise<User[]> {
    try {
      return await pb.collection('users').getFullList<User>({
        sort: 'name',
        expand: 'role_id',
        requestKey: null,
      })
    } catch (err) {
      console.error('Error fetching users:', err)
      return []
    }
  },

  async getById(id: string): Promise<User | null> {
    try {
      return await pb.collection('users').getOne<User>(id, {
        expand: 'role_id',
        requestKey: null,
      })
    } catch (err) {
      console.error('Error fetching user by id:', err)
      return null
    }
  },

  async create(data: CreateUserData): Promise<User> {
    const payload: any = {
      name: data.name.trim(),
      email: data.email.trim(),
      password: data.password || 'Skip@Pass',
      passwordConfirm: data.password || 'Skip@Pass',
      verified: true,
      phone: data.phone || '',
      role_id: data.role_id || null,
      role_slug: data.role_slug || 'custom',
      is_active: data.is_active !== undefined ? data.is_active : true,
      custom_permissions: data.custom_permissions || {},
    }
    return await pb.collection('users').create<User>(payload)
  },

  async update(id: string, data: UpdateUserData): Promise<User> {
    const payload: any = { ...data }
    if (data.password) {
      payload.password = data.password
      payload.passwordConfirm = data.password
    }
    return await pb.collection('users').update<User>(id, payload)
  },

  /**
   * Updates only permissions for an individual user
   */
  async updateUserPermissions(userId: string, permissions: Record<string, boolean>): Promise<User> {
    return await pb.collection('users').update<User>(userId, {
      custom_permissions: permissions,
    })
  },

  /**
   * Batch update permissions across multiple users (Matrix Visual update)
   */
  async batchUpdateUserPermissions(
    updates: Array<{ userId: string; permissions: Record<string, boolean> }>,
  ): Promise<boolean> {
    try {
      await Promise.all(
        updates.map((u) =>
          pb.collection('users').update(u.userId, {
            custom_permissions: u.permissions,
          }),
        ),
      )
      return true
    } catch (err) {
      console.error('Error batch updating permissions:', err)
      return false
    }
  },

  /**
   * Safe deactivation and transfer of workload
   */
  async transferWorkload(params: {
    fromUserId: string
    toUserId: string
    deactivateFromUser: boolean
  }): Promise<{
    success: boolean
    transferred_clients?: number
    transferred_tasks?: number
    transferred_orders?: number
    deactivated?: boolean
    error?: string
  }> {
    try {
      const res = await pb.send<{
        success: boolean
        transferred_clients?: number
        transferred_tasks?: number
        transferred_orders?: number
        deactivated?: boolean
      }>('/api/crm/transfer-user-workload', {
        method: 'POST',
        body: {
          from_user_id: params.fromUserId,
          to_user_id: params.toUserId,
          deactivate_from_user: params.deactivateFromUser,
        },
      })
      return res
    } catch (err: any) {
      console.error('Error transferring workload:', err)
      return {
        success: false,
        error: err?.data?.error || err?.message || 'Falha ao transferir atendimentos',
      }
    }
  },

  /**
   * Toggle user active status
   */
  async toggleActive(id: string, isActive: boolean): Promise<User> {
    return await pb.collection('users').update<User>(id, {
      is_active: isActive,
    })
  },
}

export const rolesService = {
  async getAll(): Promise<Role[]> {
    try {
      return await pb.collection('roles').getFullList<Role>({
        sort: 'name',
        requestKey: null,
      })
    } catch (err) {
      console.error('Error fetching roles:', err)
      return []
    }
  },

  async getById(id: string): Promise<Role | null> {
    try {
      return await pb.collection('roles').getOne<Role>(id, {
        requestKey: null,
      })
    } catch (err) {
      console.error('Error fetching role by id:', err)
      return null
    }
  },

  async create(data: CreateRoleData): Promise<Role> {
    return await pb.collection('roles').create<Role>({
      name: data.name.trim(),
      slug: data.slug.trim().toLowerCase().replace(/\s+/g, '_'),
      description: data.description || '',
      color: data.color || 'purple',
      permissions: data.permissions || {},
      is_system: data.is_system || false,
    })
  },

  async update(id: string, data: Partial<CreateRoleData>): Promise<Role> {
    const payload: any = { ...data }
    if (data.slug) {
      payload.slug = data.slug.trim().toLowerCase().replace(/\s+/g, '_')
    }
    return await pb.collection('roles').update<Role>(id, payload)
  },

  async delete(id: string): Promise<boolean> {
    try {
      await pb.collection('roles').delete(id)
      return true
    } catch (err) {
      console.error('Error deleting role:', err)
      return false
    }
  },
}

export const auditLogsService = {
  async getAll(options?: {
    module?: string
    userId?: string
    action?: string
    limit?: number
    page?: number
  }): Promise<{ items: AuditLog[]; totalItems: number }> {
    try {
      const filters: string[] = []
      if (options?.module && options.module !== 'all') {
        filters.push(`module = "${options.module}"`)
      }
      if (options?.userId && options.userId !== 'all') {
        filters.push(`user_id = "${options.userId}"`)
      }
      if (options?.action && options.action !== 'all') {
        filters.push(`action = "${options.action}"`)
      }

      const res = await pb
        .collection('audit_logs')
        .getList<AuditLog>(options?.page || 1, options?.limit || 50, {
          filter: filters.join(' && '),
          sort: '-created',
          expand: 'user_id',
          requestKey: null,
        })
      return {
        items: res.items,
        totalItems: res.totalItems,
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err)
      return { items: [], totalItems: 0 }
    }
  },

  /**
   * Record custom action (login, manual export, matrix edit, etc.)
   */
  async logAction(params: {
    action: string
    module?: string
    recordId?: string
    recordTitle?: string
    details?: string
    previousValue?: any
    newValue?: any
  }): Promise<boolean> {
    try {
      await pb.send('/api/crm/audit-log', {
        method: 'POST',
        body: {
          action: params.action,
          module: params.module || 'geral',
          record_id: params.recordId,
          record_title: params.recordTitle,
          details: params.details,
          previous_value: params.previousValue,
          new_value: params.newValue,
        },
      })
      return true
    } catch (err) {
      console.error('Error recording audit log:', err)
      return false
    }
  },
}
