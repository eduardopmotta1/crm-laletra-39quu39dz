import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import type { User, Role } from '@/types/crm'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  isAdmin: boolean
  roleSlug: string
  permissions: Record<string, boolean>
  hasPermission: (permissionKey: string) => boolean
  canViewFinancials: boolean
  refreshUser: () => Promise<void>
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>
  register: (
    name: string,
    email: string,
    pass: string,
  ) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (pb.authStore.isValid && pb.authStore.record) {
      return (pb.authStore.record as unknown as User) || null
    }
    return null
  })
  const [token, setToken] = useState<string | null>(() => {
    if (pb.authStore.isValid && pb.authStore.token) {
      return pb.authStore.token
    }
    return null
  })
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    if (!pb.authStore.isValid || !pb.authStore.record?.id) {
      pb.authStore.clear()
      setUser(null)
      setToken(null)
      return
    }
    try {
      const freshUser = await pb.collection('users').getOne<User>(pb.authStore.record.id, {
        expand: 'role_id',
        requestKey: null,
      })
      setUser(freshUser)
    } catch (err) {
      console.error('Error refreshing user details:', err)
      // If user fetch fails because session/token is invalid or user was removed
      if (!pb.authStore.isValid) {
        pb.authStore.clear()
        setUser(null)
        setToken(null)
      }
    }
  }, [])

  useEffect(() => {
    // Listen for auth store changes
    const unsubscribe = pb.authStore.onChange((tokenVal, model) => {
      if (pb.authStore.isValid && tokenVal && model) {
        setToken(tokenVal)
        setUser((model as unknown as User) || null)
      } else {
        setUser(null)
        setToken(null)
      }
    })

    // Startup check: if session is valid, load full user profile; otherwise clear invalid session
    if (pb.authStore.isValid && pb.authStore.record && pb.authStore.token) {
      setUser(pb.authStore.record as unknown as User)
      setToken(pb.authStore.token)
      refreshUser().finally(() => setIsLoading(false))
    } else {
      pb.authStore.clear()
      setUser(null)
      setToken(null)
      setIsLoading(false)
    }

    return () => {
      unsubscribe()
    }
  }, [refreshUser])

  // Resolve user permissions
  // 1. If admin => everything true
  // 2. If user has custom_permissions defined => use them
  // 3. Fallback to role_id.permissions if available
  const isAdmin = user?.role_slug === 'admin'
  const roleSlug = user?.role_slug || 'comercial'

  const computePermissions = (): Record<string, boolean> => {
    if (!user) return {}
    if (isAdmin) {
      // Admin has blanket access to every permission
      return new Proxy(
        {},
        {
          get: () => true,
        },
      )
    }

    const roleObj = user.expand?.role_id as Role | undefined
    const rolePerms = roleObj?.permissions || {}
    const customPerms = user.custom_permissions || {}

    // Merge: custom permissions take precedence over role defaults
    return {
      ...rolePerms,
      ...customPerms,
    }
  }

  const permissions = computePermissions()

  const hasPermission = useCallback(
    (permissionKey: string): boolean => {
      if (!user) return false
      if (isAdmin) return true

      // If user is inactive, deny all
      if (user.is_active === false) return false

      const customPerms = user.custom_permissions
      if (customPerms && customPerms[permissionKey] !== undefined) {
        return customPerms[permissionKey] === true
      }

      const roleObj = user.expand?.role_id as Role | undefined
      if (roleObj?.permissions && roleObj.permissions[permissionKey] !== undefined) {
        return roleObj.permissions[permissionKey] === true
      }

      // Default role behaviors if no explicit permission set
      if (roleSlug === 'producao') {
        const prodAllowed = [
          'production_view',
          'production_view_all',
          'production_view_assigned',
          'production_edit',
          'production_move_stages',
          'production_attach_files',
          'production_view_proofs',
          'production_approve_proof',
          'production_change_deadline',
          'production_complete',
          'pending_access',
          'pending_view_sector',
          'pending_claim',
          'pending_mark_resolved',
          'reports_production',
          'procedures_view',
        ]
        return prodAllowed.includes(permissionKey)
      }

      if (roleSlug === 'comercial') {
        const comAllowed = [
          'attendance_view',
          'attendance_create',
          'attendance_edit',
          'attendance_move_kanban',
          'quotes_view',
          'quotes_create',
          'quotes_edit',
          'clients_view',
          'clients_create',
          'clients_edit',
          'procedures_view',
        ]
        return comAllowed.includes(permissionKey)
      }

      return false
    },
    [user, isAdmin, roleSlug],
  )

  const canViewFinancials = isAdmin || hasPermission('financial_view_sale_values')

  const login = async (email: string, pass: string) => {
    try {
      const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
      const u = authData.record as unknown as User

      // Check if user is deactivated
      if (u.is_active === false) {
        pb.authStore.clear()
        return {
          success: false,
          error: 'Esta conta foi desativada pelo administrador. Contate a diretoria.',
        }
      }

      setUser(u)
      setToken(authData.token)

      // Fetch expanded user profile with role permissions
      try {
        const fullUser = await pb.collection('users').getOne<User>(u.id, {
          expand: 'role_id',
        })
        setUser(fullUser)
      } catch {
        /* intentionally ignored */
      }

      // Log login activity
      try {
        await pb.send('/backend/v1/crm/audit-log', {
          method: 'POST',
          body: {
            action: 'user_login',
            module: 'auth',
            record_id: u.id,
            record_title: u.name,
            details: `Usuário ${u.name} (${u.email}) realizou login no CRM.`,
          },
        })
      } catch {
        /* intentionally ignored */
      }

      return { success: true }
    } catch (err: any) {
      console.error('Login error:', err)
      return {
        success: false,
        error:
          err?.data?.message ||
          err?.message ||
          'Email ou senha incorretos. Verifique suas credenciais.',
      }
    }
  }

  const register = async (name: string, email: string, pass: string) => {
    try {
      // Look up default comercial role
      let defaultRoleId = undefined
      try {
        const roles = await pb.collection('roles').getFullList<Role>({
          filter: 'slug = "comercial"',
          limit: 1,
        })
        if (roles.length > 0) defaultRoleId = roles[0].id
      } catch {
        /* intentionally ignored */
      }

      // Create user
      const created = await pb.collection('users').create({
        name: name.trim(),
        email: email.trim(),
        password: pass,
        passwordConfirm: pass,
        verified: true,
        is_active: true,
        role_slug: 'comercial',
        role_id: defaultRoleId,
      })

      // Automatically log in
      const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
      setUser(authData.record as unknown as User)
      setToken(authData.token)

      return { success: true }
    } catch (err: any) {
      console.error('Registration error:', err)
      const msg =
        err?.data?.data?.email?.message ||
        err?.data?.message ||
        err?.message ||
        'Erro ao criar conta.'
      return { success: false, error: msg }
    }
  }

  const logout = () => {
    if (user) {
      try {
        pb.send('/backend/v1/crm/audit-log', {
          method: 'POST',
          body: {
            action: 'user_logout',
            module: 'auth',
            record_id: user.id,
            record_title: user.name,
            details: `Usuário ${user.name} efetuou logout do CRM.`,
          },
        }).catch(() => {})
      } catch {
        /* intentionally ignored */
      }
    }
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }

  const isAuthenticated = Boolean(token && user && pb.authStore.isValid)

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        isAdmin,
        roleSlug,
        permissions,
        hasPermission,
        canViewFinancials,
        refreshUser,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
