import React, { useState, useEffect } from 'react'
import {
  Users,
  Shield,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Key,
  Grid,
  List,
  AlertTriangle,
  ArrowRightLeft,
  Search,
  Check,
  X,
  Layers,
  Sparkles,
  UserCheck,
  UserX,
  RefreshCw,
  Phone,
  Mail,
  ShieldAlert,
  Info,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { usersAdminService, rolesService, auditLogsService } from '@/services/rolesPermissions'
import { PERMISSION_MODULES, ALL_PERMISSIONS_KEYS, type ModuleGroup } from '@/types/permissions'
import type { User, Role } from '@/types/crm'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from '@/hooks/use-toast'

export default function UsersPermissionsSettings() {
  const { user: currentUser, isAdmin, refreshUser } = useAuth()

  const [activeSubTab, setActiveSubTab] = useState<'users' | 'roles' | 'matrix'>('users')
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // User modal state
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [userToEdit, setUserToEdit] = useState<User | null>(null)
  const [userFormData, setUserFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role_id: '',
    role_slug: 'comercial',
    is_active: true,
  })

  // Role modal state
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleToEdit, setRoleToEdit] = useState<Role | null>(null)
  const [roleFormData, setRoleFormData] = useState({
    name: '',
    slug: '',
    description: '',
    color: 'purple',
    permissions: {} as Record<string, boolean>,
  })

  // Individual permissions editor modal
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false)
  const [selectedUserForPerms, setSelectedUserForPerms] = useState<User | null>(null)
  const [userEditingPerms, setUserEditingPerms] = useState<Record<string, boolean>>({})

  // Deactivation / Transfer Workload modal
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null)
  const [targetUserId, setTargetUserId] = useState<string>('')
  const [transferring, setTransferring] = useState(false)

  // Matrix edit state: changes map userId -> { permKey: boolean }
  const [matrixChanges, setMatrixChanges] = useState<Record<string, Record<string, boolean>>>({})
  const [savingMatrix, setSavingMatrix] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [uList, rList] = await Promise.all([usersAdminService.getAll(), rolesService.getAll()])
      setUsers(uList)
      setRoles(rList)
    } catch (err) {
      console.error('Error loading users/roles:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível buscar a lista de usuários e perfis.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // --- USER HANDLERS ---
  const handleOpenUserModal = (u?: User) => {
    if (u) {
      setUserToEdit(u)
      setUserFormData({
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        password: '',
        role_id: u.role_id || '',
        role_slug: u.role_slug || 'comercial',
        is_active: u.is_active !== false,
      })
    } else {
      setUserToEdit(null)
      const defaultRole = roles.find((r) => r.slug === 'comercial') || roles[0]
      setUserFormData({
        name: '',
        email: '',
        phone: '',
        password: '',
        role_id: defaultRole?.id || '',
        role_slug: defaultRole?.slug || 'comercial',
        is_active: true,
      })
    }
    setUserModalOpen(true)
  }

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const selectedRole = roles.find((r) => r.id === userFormData.role_id)
      const roleSlug = selectedRole ? selectedRole.slug : userFormData.role_slug

      if (userToEdit) {
        // Update
        const payload: any = {
          name: userFormData.name,
          email: userFormData.email,
          phone: userFormData.phone,
          role_id: userFormData.role_id,
          role_slug: roleSlug,
          is_active: userFormData.is_active,
        }
        if (userFormData.password) payload.password = userFormData.password

        await usersAdminService.update(userToEdit.id, payload)
        toast({
          title: 'Usuário atualizado com sucesso!',
        })
      } else {
        // Create
        // Preset custom_permissions from role default
        const initialPerms = selectedRole ? { ...selectedRole.permissions } : {}
        await usersAdminService.create({
          name: userFormData.name,
          email: userFormData.email,
          phone: userFormData.phone,
          password: userFormData.password || 'Skip@Pass',
          role_id: userFormData.role_id,
          role_slug: roleSlug,
          is_active: userFormData.is_active,
          custom_permissions: initialPerms,
        })
        toast({
          title: 'Usuário cadastrado com sucesso!',
          description: `Perfil padrão "${selectedRole?.name || 'Comercial'}" atribuído.`,
        })
      }

      setUserModalOpen(false)
      loadData()
      refreshUser()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar usuário',
        description: err?.message || 'Verifique se o email já está cadastrado.',
        variant: 'destructive',
      })
    }
  }

  // --- ROLE HANDLERS ---
  const handleOpenRoleModal = (r?: Role) => {
    if (r) {
      setRoleToEdit(r)
      setRoleFormData({
        name: r.name,
        slug: r.slug,
        description: r.description || '',
        color: r.color || 'purple',
        permissions: { ...r.permissions },
      })
    } else {
      setRoleToEdit(null)
      setRoleFormData({
        name: '',
        slug: '',
        description: '',
        color: 'indigo',
        permissions: {},
      })
    }
    setRoleModalOpen(true)
  }

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (roleToEdit) {
        await rolesService.update(roleToEdit.id, {
          name: roleFormData.name,
          description: roleFormData.description,
          color: roleFormData.color,
          permissions: roleFormData.permissions,
        })
        toast({
          title: 'Perfil de acesso atualizado!',
        })
      } else {
        await rolesService.create({
          name: roleFormData.name,
          slug: roleFormData.slug || roleFormData.name.toLowerCase().replace(/\s+/g, '_'),
          description: roleFormData.description,
          color: roleFormData.color,
          permissions: roleFormData.permissions,
          is_system: false,
        })
        toast({
          title: 'Novo perfil personalizado criado!',
        })
      }
      setRoleModalOpen(false)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar perfil',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  const handleDeleteRole = async (role: Role) => {
    if (role.is_system) {
      toast({
        title: 'Perfil protegido',
        description: 'Perfis nativos do sistema não podem ser excluídos.',
        variant: 'destructive',
      })
      return
    }
    if (!confirm(`Tem certeza que deseja remover o perfil "${role.name}"?`)) return

    try {
      await rolesService.delete(role.id)
      toast({ title: 'Perfil removido com sucesso!' })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir perfil',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  // --- PERMISSIONS MODAL HANDLERS (INDIVIDUAL USER) ---
  const handleOpenPermissionsModal = (user: User) => {
    setSelectedUserForPerms(user)

    // Merge user custom perms over role perms
    const userRole = roles.find((r) => r.id === user.role_id) || (user.expand?.role_id as Role)
    const basePerms = userRole?.permissions || {}
    const customPerms = user.custom_permissions || {}

    const resolved: Record<string, boolean> = {}
    ALL_PERMISSIONS_KEYS.forEach((key) => {
      if (user.role_slug === 'admin') {
        resolved[key] = true
      } else if (customPerms[key] !== undefined) {
        resolved[key] = customPerms[key] === true
      } else if (basePerms[key] !== undefined) {
        resolved[key] = basePerms[key] === true
      } else {
        resolved[key] = false
      }
    })

    setUserEditingPerms(resolved)
    setPermissionsModalOpen(true)
  }

  const handleSaveIndividualPermissions = async () => {
    if (!selectedUserForPerms) return
    try {
      await usersAdminService.updateUserPermissions(selectedUserForPerms.id, userEditingPerms)
      toast({
        title: 'Permissões atualizadas!',
        description: `As permissões de ${selectedUserForPerms.name} foram salvas com sucesso.`,
      })
      setPermissionsModalOpen(false)
      loadData()
      refreshUser()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar permissões',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  // --- DEACTIVATION & WORKLOAD TRANSFER ---
  const handleOpenDeactivateModal = (user: User) => {
    if (user.id === currentUser?.id) {
      toast({
        title: 'Operação não permitida',
        description: 'Você não pode desativar seu próprio usuário conectado.',
        variant: 'destructive',
      })
      return
    }
    setUserToDeactivate(user)
    const availableUsers = users.filter((u) => u.id !== user.id && u.is_active !== false)
    setTargetUserId(availableUsers[0]?.id || '')
    setTransferModalOpen(true)
  }

  const handleExecuteTransferAndDeactivate = async () => {
    if (!userToDeactivate) return
    setTransferring(true)
    try {
      if (targetUserId) {
        const res = await usersAdminService.transferWorkload({
          fromUserId: userToDeactivate.id,
          toUserId: targetUserId,
          deactivateFromUser: true,
        })
        if (res.success) {
          toast({
            title: 'Usuário desativado e carteira transferida!',
            description: `${res.transferred_clients || 0} clientes e ${res.transferred_orders || 0} pedidos foram redistribuídos.`,
          })
        } else {
          throw new Error(res.error)
        }
      } else {
        // Just toggle inactive without transfer
        await usersAdminService.toggleActive(userToDeactivate.id, false)
        toast({
          title: 'Usuário desativado com sucesso!',
          description: 'O usuário não poderá mais realizar login no CRM.',
        })
      }

      setTransferModalOpen(false)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro na desativação',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setTransferring(false)
    }
  }

  // --- MATRIX VISUAL HANDLERS ---
  const getUserEffectivePermission = (u: User, permKey: string): boolean => {
    // Check pending matrix edits
    if (matrixChanges[u.id] && matrixChanges[u.id][permKey] !== undefined) {
      return matrixChanges[u.id][permKey]
    }
    if (u.role_slug === 'admin') return true

    const customPerms = u.custom_permissions
    if (customPerms && customPerms[permKey] !== undefined) {
      return customPerms[permKey] === true
    }

    const roleObj = roles.find((r) => r.id === u.role_id) || (u.expand?.role_id as Role)
    if (roleObj?.permissions && roleObj.permissions[permKey] !== undefined) {
      return roleObj.permissions[permKey] === true
    }

    return false
  }

  const toggleMatrixPermission = (u: User, permKey: string) => {
    if (u.role_slug === 'admin') {
      toast({
        title: 'Administrador possui acesso total',
        description: 'Administradores sempre têm todas as permissões ativas.',
      })
      return
    }

    const currentVal = getUserEffectivePermission(u, permKey)
    const newVal = !currentVal

    setMatrixChanges((prev) => {
      const userPrev = prev[u.id] || {}
      return {
        ...prev,
        [u.id]: {
          ...userPrev,
          [permKey]: newVal,
        },
      }
    })
  }

  const handleSaveMatrixChanges = async () => {
    setSavingMatrix(true)
    try {
      const updates: Array<{ userId: string; permissions: Record<string, boolean> }> = []

      for (const userId of Object.keys(matrixChanges)) {
        const targetUser = users.find((u) => u.id === userId)
        if (!targetUser) continue

        const userRole =
          roles.find((r) => r.id === targetUser.role_id) || (targetUser.expand?.role_id as Role)
        const base = { ...(userRole?.permissions || {}), ...(targetUser.custom_permissions || {}) }
        const merged = { ...base, ...matrixChanges[userId] }

        updates.push({
          userId: targetUser.id,
          permissions: merged,
        })
      }

      const ok = await usersAdminService.batchUpdateUserPermissions(updates)
      if (ok) {
        toast({
          title: 'Matriz visual salva com sucesso!',
          description: 'Todas as alterações de permissões foram aplicadas imediatamente.',
        })
        setMatrixChanges({})
        loadData()
        refreshUser()
      } else {
        throw new Error('Falha ao aplicar lote de permissões.')
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar matriz',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setSavingMatrix(false)
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase()
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.role_slug && u.role_slug.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-6">
      {/* Top Header & Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            Controle de Acesso, Usuários & Permissões
          </h2>
          <p className="text-xs text-slate-500">
            Configure perfis modelo (Administrador, Comercial, Produção e Customizados), permissões
            individuais e a matriz visual por usuário.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={activeSubTab === 'users' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSubTab('users')}
            className={`text-xs h-8 ${
              activeSubTab === 'users' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
            }`}
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Usuários ({users.length})
          </Button>
          <Button
            variant={activeSubTab === 'roles' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSubTab('roles')}
            className={`text-xs h-8 ${
              activeSubTab === 'roles' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
            }`}
          >
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Perfis ({roles.length})
          </Button>
          <Button
            variant={activeSubTab === 'matrix' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSubTab('matrix')}
            className={`text-xs h-8 ${
              activeSubTab === 'matrix' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
            }`}
          >
            <Grid className="h-3.5 w-3.5 mr-1.5" />
            Matriz Visual
          </Button>
        </div>
      </div>

      {/* --- SUBTAB 1: USERS LIST & MANAGEMENT --- */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar usuário por nome, email ou perfil..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            {isAdmin && (
              <Button
                onClick={() => handleOpenUserModal()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Novo Usuário
              </Button>
            )}
          </div>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Colaborador</th>
                    <th className="py-3 px-4">Perfil Base</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Acesso Financeiro</th>
                    <th className="py-3 px-4">Exceções Individuais</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => {
                    const role =
                      roles.find((r) => r.id === u.role_id) || (u.expand?.role_id as Role)
                    const roleName =
                      u.role_slug === 'admin'
                        ? 'Administrador'
                        : role?.name || u.role_slug || 'Comercial'
                    const hasCustomExceptions =
                      u.custom_permissions && Object.keys(u.custom_permissions).length > 0
                    const canSeeFinancial =
                      u.role_slug === 'admin' ||
                      u.custom_permissions?.['financial_view_sale_values'] === true ||
                      role?.permissions?.['financial_view_sale_values'] === true

                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                          u.is_active === false
                            ? 'opacity-60 bg-slate-100/50 dark:bg-slate-900/50'
                            : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <Avatar className="h-8 w-8 border border-slate-200 dark:border-slate-700 bg-emerald-100 text-emerald-800">
                              <AvatarFallback className="text-[11px] font-bold">
                                {u.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join('')
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                {u.name}
                                {u.id === currentUser?.id && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1 py-0 text-emerald-600 border-emerald-300"
                                  >
                                    Você
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">{u.email}</div>
                              {u.phone && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {u.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <Badge
                            className={`text-[10px] font-semibold uppercase ${
                              u.role_slug === 'admin'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : u.role_slug === 'producao'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-blue-100 text-blue-800 border-blue-300'
                            }`}
                          >
                            {roleName}
                          </Badge>
                        </td>

                        <td className="py-3 px-4">
                          {u.is_active !== false ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium">
                              <XCircle className="h-3.5 w-3.5" />
                              Desativado
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {canSeeFinancial ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                              <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                              Liberado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                              <Lock className="h-3.5 w-3.5 text-rose-500" />
                              Oculto / Bloqueado
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {hasCustomExceptions && u.role_slug !== 'admin' ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-purple-50 text-purple-700 border-purple-200"
                            >
                              <Sparkles className="h-3 w-3 mr-1 text-purple-500" />
                              {Object.keys(u.custom_permissions || {}).length} regras customizadas
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-slate-400">Padrão do perfil</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right space-x-1">
                          {isAdmin && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPermissionsModal(u)}
                                className="h-7 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                              >
                                <Key className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                                Permissões
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenUserModal(u)}
                                className="h-7 text-xs font-semibold text-slate-600 hover:text-slate-900"
                              >
                                <Edit2 className="h-3.5 w-3.5 mr-1" />
                                Editar
                              </Button>

                              {u.is_active !== false ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenDeactivateModal(u)}
                                  className="h-7 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                  title="Desativar e transferir atendimentos"
                                >
                                  <UserX className="h-3.5 w-3.5 mr-1" />
                                  Desativar
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    await usersAdminService.toggleActive(u.id, true)
                                    toast({ title: 'Usuário reativado!' })
                                    loadData()
                                  }}
                                  className="h-7 text-xs font-semibold text-emerald-600 hover:bg-emerald-50"
                                >
                                  <UserCheck className="h-3.5 w-3.5 mr-1" />
                                  Reativar
                                </Button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* --- SUBTAB 2: ROLES & TEMPLATES --- */}
      {activeSubTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Perfis funcionam como modelos iniciais para novos funcionários. Ao criar um usuário,
              suas permissões padrão são copiadas do perfil e podem ser personalizadas
              individualmente.
            </p>
            {isAdmin && (
              <Button
                onClick={() => handleOpenRoleModal()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Criar Novo Perfil
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((r) => {
              const activeCount = Object.values(r.permissions || {}).filter(Boolean).length
              const usersInRole = users.filter(
                (u) => u.role_id === r.id || u.role_slug === r.slug,
              ).length

              return (
                <Card
                  key={r.id}
                  className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <span
                            className={`h-3 w-3 rounded-full ${
                              r.slug === 'admin'
                                ? 'bg-emerald-500'
                                : r.slug === 'producao'
                                  ? 'bg-amber-500'
                                  : r.slug === 'comercial'
                                    ? 'bg-blue-500'
                                    : 'bg-purple-500'
                            }`}
                          />
                          {r.name}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {r.description || 'Sem descrição cadastrada'}
                        </CardDescription>
                      </div>
                      {r.is_system && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-slate-500 border-slate-300"
                        >
                          Nativo
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pb-3">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg">
                      <span>Permissões ativas:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {r.slug === 'admin'
                          ? 'Acesso Total (100%)'
                          : `${activeCount} de ${ALL_PERMISSIONS_KEYS.length}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Usuários neste cargo:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {usersInRole} colaborador(es)
                      </span>
                    </div>
                  </CardContent>

                  <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    {isAdmin ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenRoleModal(r)}
                          className="h-8 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          Editar Regras
                        </Button>
                        {!r.is_system && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteRole(r)}
                            className="h-8 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Excluir
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-400">Somente leitura</span>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* --- SUBTAB 3: VISUAL PERMISSIONS MATRIX (TABLE VIEW) --- */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Grid className="h-4 w-4 text-emerald-600" />
                Matriz Geral de Permissões
              </h3>
              <p className="text-xs text-slate-500">
                Linhas = Permissões organizadas por módulo. Colunas = Usuários do CRM. Clique nas
                caixas para conceder ou revogar permissões instantaneamente.
              </p>
            </div>

            {isAdmin && Object.keys(matrixChanges).length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="animate-pulse">
                  {Object.keys(matrixChanges).length} usuário(s) com alterações pendentes
                </Badge>
                <Button
                  onClick={handleSaveMatrixChanges}
                  disabled={savingMatrix}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold"
                >
                  <Check className="h-4 w-4 mr-1.5" />
                  {savingMatrix ? 'Gravando...' : 'Salvar Matriz'}
                </Button>
              </div>
            )}
          </div>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[650px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0 z-20 shadow-sm">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 min-w-[280px] bg-slate-100 dark:bg-slate-900 sticky left-0 z-30 font-bold text-slate-800 dark:text-slate-200">
                      Módulo & Permissão
                    </th>
                    {users.map((u) => (
                      <th
                        key={u.id}
                        className="py-3 px-3 min-w-[130px] text-center font-bold text-slate-800 dark:text-slate-200 border-l border-slate-200 dark:border-slate-800"
                      >
                        <div className="truncate font-semibold">{u.name}</div>
                        <span className="text-[10px] font-normal text-slate-500 block truncate">
                          {u.role_slug === 'admin' ? 'Admin' : u.role_slug || 'Comercial'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {PERMISSION_MODULES.map((moduleGroup) => (
                    <React.Fragment key={moduleGroup.id}>
                      {/* Module Header Bar */}
                      <tr className="bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white">
                        <td
                          colSpan={users.length + 1}
                          className="py-2.5 px-4 text-xs tracking-wider uppercase bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-300 border-y border-emerald-100 dark:border-emerald-900/50"
                        >
                          📦 {moduleGroup.title} —{' '}
                          <span className="text-[11px] font-normal text-slate-500">
                            {moduleGroup.description}
                          </span>
                        </td>
                      </tr>

                      {moduleGroup.permissions.map((perm) => (
                        <tr
                          key={perm.key}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 px-4 bg-white dark:bg-slate-950 sticky left-0 z-10 border-r border-slate-100 dark:border-slate-800">
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              {perm.label}
                              {perm.isCritical && (
                                <Badge
                                  variant="destructive"
                                  className="text-[9px] px-1 py-0 uppercase"
                                >
                                  Crítico
                                </Badge>
                              )}
                            </div>
                            <div
                              className="text-[10px] text-slate-500 truncate max-w-xs"
                              title={perm.description}
                            >
                              {perm.description}
                            </div>
                          </td>

                          {users.map((u) => {
                            const isAllowed = getUserEffectivePermission(u, perm.key)
                            const isPending =
                              matrixChanges[u.id] && matrixChanges[u.id][perm.key] !== undefined

                            return (
                              <td
                                key={u.id}
                                className={`py-2 px-3 text-center border-l border-slate-100 dark:border-slate-800 ${
                                  isPending ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                                }`}
                              >
                                {isAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleMatrixPermission(u, perm.key)}
                                    className={`h-7 w-7 rounded-lg inline-flex items-center justify-center transition-all ${
                                      isAllowed
                                        ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                    title={`${isAllowed ? 'Permitido' : 'Bloqueado'} para ${u.name}. Clique para alternar.`}
                                  >
                                    {isAllowed ? (
                                      <Check className="h-4 w-4" />
                                    ) : (
                                      <X className="h-3.5 w-3.5 text-slate-400" />
                                    )}
                                  </button>
                                ) : (
                                  <span
                                    className={`inline-flex items-center justify-center h-6 w-6 rounded-md ${
                                      isAllowed
                                        ? 'text-emerald-600 bg-emerald-50'
                                        : 'text-slate-300 bg-slate-100'
                                    }`}
                                  >
                                    {isAllowed ? (
                                      <Check className="h-3.5 w-3.5" />
                                    ) : (
                                      <X className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* --- MODAL: CREATE / EDIT USER --- */}
      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              {userToEdit ? 'Editar Dados do Colaborador' : 'Cadastrar Novo Usuário no CRM'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Informe os dados de acesso e selecione o perfil inicial de permissões.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveUser} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome Completo *</Label>
              <Input
                required
                value={userFormData.name}
                onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                placeholder="Ex: Pedro Produção Gráfica"
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Email de Acesso *</Label>
                <Input
                  required
                  type="email"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                  placeholder="usuario@grafica.com"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">WhatsApp / Telefone</Label>
                <Input
                  value={userFormData.phone}
                  onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                  placeholder="+55 11 99999-0000"
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                {userToEdit ? 'Alterar Senha (deixe em branco para manter)' : 'Senha de Acesso *'}
              </Label>
              <Input
                type="password"
                required={!userToEdit}
                value={userFormData.password}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                placeholder={userToEdit ? '••••••••' : 'Mínimo 8 caracteres'}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Perfil de Acesso Modelo *</Label>
              <Select
                value={userFormData.role_id}
                onValueChange={(val) => {
                  const sel = roles.find((r) => r.id === val)
                  setUserFormData({
                    ...userFormData,
                    role_id: val,
                    role_slug: sel?.slug || 'comercial',
                  })
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione um perfil..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.name} ({r.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                O perfil define o template inicial. Você poderá conceder exceções individuais
                depois.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">Conta Ativa</Label>
                <p className="text-[11px] text-slate-500">
                  Desativar impede login sem excluir históricos passados.
                </p>
              </div>
              <Switch
                checked={userFormData.is_active}
                onCheckedChange={(checked) =>
                  setUserFormData({ ...userFormData, is_active: checked })
                }
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setUserModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Salvar Colaborador
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- MODAL: CREATE / EDIT ROLE --- */}
      <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              {roleToEdit ? `Editar Perfil: ${roleToEdit.name}` : 'Criar Novo Perfil Personalizado'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Defina o nome, identificador e o conjunto de permissões padrão deste cargo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRole} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Nome do Perfil *</Label>
                <Input
                  required
                  value={roleFormData.name}
                  onChange={(e) =>
                    setRoleFormData({
                      ...roleFormData,
                      name: e.target.value,
                      slug: roleToEdit
                        ? roleFormData.slug
                        : e.target.value.toLowerCase().replace(/\s+/g, '_'),
                    })
                  }
                  placeholder="Ex: Designer Gráfico / Financeiro"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Slug Identificador *</Label>
                <Input
                  required
                  disabled={roleToEdit?.is_system}
                  value={roleFormData.slug}
                  onChange={(e) => setRoleFormData({ ...roleFormData, slug: e.target.value })}
                  placeholder="designer_grafico"
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Descrição do Cargo</Label>
              <Input
                value={roleFormData.description}
                onChange={(e) => setRoleFormData({ ...roleFormData, description: e.target.value })}
                placeholder="Ex: Responsável por criação de artes e fechamento de arquivos."
                className="text-xs"
              />
            </div>

            {/* Permissions Checkboxes grouped by Module */}
            <div className="space-y-3 pt-2">
              <Label className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Permissões Padrão do Perfil:
              </Label>

              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2 border rounded-xl p-3 bg-slate-50/50 dark:bg-slate-900/50">
                {PERMISSION_MODULES.map((mod) => (
                  <div
                    key={mod.id}
                    className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-3 last:border-0"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                        {mod.title}
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...roleFormData.permissions }
                            mod.permissions.forEach((p) => {
                              updated[p.key] = true
                            })
                            setRoleFormData({ ...roleFormData, permissions: updated })
                          }}
                          className="text-[10px] text-emerald-600 hover:underline font-semibold"
                        >
                          Marcar todos
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...roleFormData.permissions }
                            mod.permissions.forEach((p) => {
                              updated[p.key] = false
                            })
                            setRoleFormData({ ...roleFormData, permissions: updated })
                          }}
                          className="text-[10px] text-slate-500 hover:underline"
                        >
                          Desmarcar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {mod.permissions.map((p) => {
                        const checked = roleFormData.permissions[p.key] === true
                        return (
                          <label
                            key={p.key}
                            className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setRoleFormData({
                                  ...roleFormData,
                                  permissions: {
                                    ...roleFormData.permissions,
                                    [p.key]: e.target.checked,
                                  },
                                })
                              }}
                              className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold block">{p.label}</span>
                              <span className="text-[10px] text-slate-500 block truncate">
                                {p.description}
                              </span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setRoleModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Salvar Perfil
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- MODAL: INDIVIDUAL USER PERMISSIONS EDITOR --- */}
      <Dialog open={permissionsModalOpen} onOpenChange={setPermissionsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-emerald-600" />
              Permissões Individuais de {selectedUserForPerms?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Conceda ou bloqueie acessos específicos para este usuário (ex: liberar visualização de
              valores para um membro específico da produção).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 block">Perfil Base:</span>
                <span className="font-bold text-slate-900 dark:text-white uppercase">
                  {selectedUserForPerms?.role_slug || 'Comercial'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const allTrue: Record<string, boolean> = {}
                    ALL_PERMISSIONS_KEYS.forEach((k) => (allTrue[k] = true))
                    setUserEditingPerms(allTrue)
                  }}
                  className="text-[11px] h-7"
                >
                  Liberar Tudo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const allFalse: Record<string, boolean> = {}
                    ALL_PERMISSIONS_KEYS.forEach((k) => (allFalse[k] = false))
                    setUserEditingPerms(allFalse)
                  }}
                  className="text-[11px] h-7"
                >
                  Bloquear Tudo
                </Button>
              </div>
            </div>

            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2 border rounded-xl p-3 bg-slate-50/50 dark:bg-slate-900/50">
              {PERMISSION_MODULES.map((mod) => (
                <div
                  key={mod.id}
                  className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-3 last:border-0"
                >
                  <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>{mod.title}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {mod.permissions.map((p) => {
                      const checked = userEditingPerms[p.key] === true
                      return (
                        <label
                          key={p.key}
                          className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                            checked
                              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setUserEditingPerms({
                                ...userEditingPerms,
                                [p.key]: e.target.checked,
                              })
                            }}
                            className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block">{p.label}</span>
                            <span className="text-[10px] text-slate-500 block truncate">
                              {p.description}
                            </span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPermissionsModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveIndividualPermissions}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Salvar Permissões Individuais
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- MODAL: DEACTIVATE & TRANSFER WORKLOAD --- */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <UserX className="h-5 w-5" />
              Desativar Colaborador e Transferir Carteira
            </DialogTitle>
            <DialogDescription className="text-xs">
              A desativação bloqueia o login de <strong>{userToDeactivate?.name}</strong> sem apagar
              mensagens, pedidos ou avaliações já realizadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Segurança dos dados históricos garantida:
              </div>
              <p className="text-[11px]">
                Nenhum atendimento, mensagem de WhatsApp ou pedido será excluído. Eles serão
                redirecionados para o novo responsável.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Transferir clientes e pendências ativas para:
              </Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione o funcionário destino..." />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => u.id !== userToDeactivate?.id && u.is_active !== false)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.name} ({u.role_slug || 'Comercial'})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setTransferModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleExecuteTransferAndDeactivate}
                disabled={transferring}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {transferring ? 'Transferindo...' : 'Confirmar e Desativar'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
