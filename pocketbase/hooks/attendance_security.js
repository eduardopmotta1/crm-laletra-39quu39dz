// Attendance Security Hook — Permissões de Backend para attendances
// Espelha a exata lógica de precedência de permissões do CRM:
// 1. user nulo -> false
// 2. role_slug === 'admin' -> true
// 3. is_active === false -> false
// 4. custom_permissions[key] !== undefined -> custom_permissions[key] === true
// 5. role.permissions[key] !== undefined -> role.permissions[key] === true
// 6. se role_slug === 'producao' -> false para attendances
// 7. fallback -> false

onRecordListRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }

  // Se admin, acesso completo
  if (auth.get('role_slug') === 'admin') {
    return e.next()
  }

  // Se usuário inativo, negar tudo
  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário inativo')
  }

  // Resolver permissões com precedência
  let customPerms = {}
  try {
    const rawCustom = auth.get('custom_permissions')
    if (typeof rawCustom === 'string' && rawCustom.trim()) {
      customPerms = JSON.parse(rawCustom)
    } else if (rawCustom && typeof rawCustom === 'object') {
      customPerms = rawCustom
    }
  } catch (_) {}

  let rolePerms = {}
  const roleId = auth.get('role_id')
  if (roleId) {
    try {
      const roleRec = $app.findRecordById('roles', roleId)
      if (roleRec) {
        const rawRole = roleRec.get('permissions')
        if (typeof rawRole === 'string' && rawRole.trim()) {
          rolePerms = JSON.parse(rawRole)
        } else if (rawRole && typeof rawRole === 'object') {
          rolePerms = rawRole
        }
      }
    } catch (_) {}
  }

  const checkPerm = function (key) {
    if (customPerms && customPerms[key] !== undefined) {
      return customPerms[key] === true
    }
    if (rolePerms && rolePerms[key] !== undefined) {
      return rolePerms[key] === true
    }
    return false
  }

  const canViewAll = checkPerm('attendance_view_all')
  const canViewOwn = checkPerm('attendance_view_own')
  const canView = checkPerm('attendance_view')

  // Se não tem nem view_all nem view_own e nem attendance_view geral, bloqueia
  if (!canViewAll && !canViewOwn && !canView) {
    throw new ForbiddenError('Sem permissão para visualizar atendimentos')
  }

  // Se tem attendance_view_all -> pode ver tudo
  if (canViewAll) {
    return e.next()
  }

  // Se tem attendance_view_own (ou view geral sem view_all) -> restringe apenas aos atribuídos a ele
  if (canViewOwn || canView) {
    // Adiciona / compõe filtro assigned_to = auth.id
    const ownFilter = "assigned_to = '" + auth.id + "'"
    if (e.requestInfo && e.requestInfo.query) {
      const existingFilter = e.requestInfo.query.filter
      if (existingFilter && String(existingFilter).trim()) {
        e.requestInfo.query.filter = '(' + existingFilter + ') && (' + ownFilter + ')'
      } else {
        e.requestInfo.query.filter = ownFilter
      }
    }
    return e.next()
  }

  throw new ForbiddenError('Sem permissão para visualizar atendimentos')
}, 'attendances')

onRecordViewRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }

  if (auth.get('role_slug') === 'admin') {
    return e.next()
  }

  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário inativo')
  }

  let customPerms = {}
  try {
    const rawCustom = auth.get('custom_permissions')
    if (typeof rawCustom === 'string' && rawCustom.trim()) {
      customPerms = JSON.parse(rawCustom)
    } else if (rawCustom && typeof rawCustom === 'object') {
      customPerms = rawCustom
    }
  } catch (_) {}

  let rolePerms = {}
  const roleId = auth.get('role_id')
  if (roleId) {
    try {
      const roleRec = $app.findRecordById('roles', roleId)
      if (roleRec) {
        const rawRole = roleRec.get('permissions')
        if (typeof rawRole === 'string' && rawRole.trim()) {
          rolePerms = JSON.parse(rawRole)
        } else if (rawRole && typeof rawRole === 'object') {
          rolePerms = rawRole
        }
      }
    } catch (_) {}
  }

  const checkPerm = function (key) {
    if (customPerms && customPerms[key] !== undefined) {
      return customPerms[key] === true
    }
    if (rolePerms && rolePerms[key] !== undefined) {
      return rolePerms[key] === true
    }
    return false
  }

  const canViewAll = checkPerm('attendance_view_all')
  const canViewOwn = checkPerm('attendance_view_own')
  const canView = checkPerm('attendance_view')

  if (!canViewAll && !canViewOwn && !canView) {
    throw new ForbiddenError('Sem permissão para visualizar atendimentos')
  }

  if (canViewAll) {
    return e.next()
  }

  // Se só tem view_own / view geral, verificar se o registro pertence ao usuário
  if (e.record) {
    const assignedTo = e.record.get('assigned_to')
    if (assignedTo !== auth.id) {
      throw new ForbiddenError('Acesso restrito: este atendimento pertence a outro usuário')
    }
  }

  return e.next()
}, 'attendances')

onRecordCreateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }

  if (auth.get('role_slug') === 'admin') {
    return e.next()
  }

  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário inativo')
  }

  let customPerms = {}
  try {
    const rawCustom = auth.get('custom_permissions')
    if (typeof rawCustom === 'string' && rawCustom.trim()) {
      customPerms = JSON.parse(rawCustom)
    } else if (rawCustom && typeof rawCustom === 'object') {
      customPerms = rawCustom
    }
  } catch (_) {}

  let rolePerms = {}
  const roleId = auth.get('role_id')
  if (roleId) {
    try {
      const roleRec = $app.findRecordById('roles', roleId)
      if (roleRec) {
        const rawRole = roleRec.get('permissions')
        if (typeof rawRole === 'string' && rawRole.trim()) {
          rolePerms = JSON.parse(rawRole)
        } else if (rawRole && typeof rawRole === 'object') {
          rolePerms = rawRole
        }
      }
    } catch (_) {}
  }

  const checkPerm = function (key) {
    if (customPerms && customPerms[key] !== undefined) {
      return customPerms[key] === true
    }
    if (rolePerms && rolePerms[key] !== undefined) {
      return rolePerms[key] === true
    }
    return false
  }

  const canCreate = checkPerm('attendance_create')
  if (!canCreate) {
    throw new ForbiddenError('Sem permissão para criar atendimentos (attendance_create)')
  }

  return e.next()
}, 'attendances')

onRecordUpdateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }

  if (auth.get('role_slug') === 'admin') {
    return e.next()
  }

  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário inativo')
  }

  let customPerms = {}
  try {
    const rawCustom = auth.get('custom_permissions')
    if (typeof rawCustom === 'string' && rawCustom.trim()) {
      customPerms = JSON.parse(rawCustom)
    } else if (rawCustom && typeof rawCustom === 'object') {
      customPerms = rawCustom
    }
  } catch (_) {}

  let rolePerms = {}
  const roleId = auth.get('role_id')
  if (roleId) {
    try {
      const roleRec = $app.findRecordById('roles', roleId)
      if (roleRec) {
        const rawRole = roleRec.get('permissions')
        if (typeof rawRole === 'string' && rawRole.trim()) {
          rolePerms = JSON.parse(rawRole)
        } else if (rawRole && typeof rawRole === 'object') {
          rolePerms = rawRole
        }
      }
    } catch (_) {}
  }

  const checkPerm = function (key) {
    if (customPerms && customPerms[key] !== undefined) {
      return customPerms[key] === true
    }
    if (rolePerms && rolePerms[key] !== undefined) {
      return rolePerms[key] === true
    }
    return false
  }

  const canEdit = checkPerm('attendance_edit')
  if (!canEdit) {
    throw new ForbiddenError('Sem permissão para editar atendimentos (attendance_edit)')
  }

  const canViewAll = checkPerm('attendance_view_all')
  // Se não tem permissão para ver todos, só pode editar atendimento que é atribuído a ele
  if (!canViewAll && e.record) {
    const assignedTo = e.record.get('assigned_to')
    if (assignedTo !== auth.id) {
      throw new ForbiddenError(
        'Acesso restrito: você só pode editar atendimentos atribuídos a você',
      )
    }
  }

  return e.next()
}, 'attendances')

onRecordDeleteRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }

  // DELETE de attendances é permitido EXCLUSIVAMENTE para administradores
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem excluir atendimentos permanentemente')
  }

  return e.next()
}, 'attendances')

console.log('[ATTENDANCE SECURITY] Hook loaded — attendance permissions enforced')
