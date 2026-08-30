// WhatsApp Security Hook — Permissões de Backend para mensagens e conversas
// Espelha a exata lógica de precedência de permissões do CRM Laletra:
// 1. user nulo -> false (HTTP 403)
// 2. role_slug === 'admin' -> true
// 3. is_active === false -> false (HTTP 403)
// 4. custom_permissions[key] !== undefined -> custom_permissions[key] === true
// 5. role.permissions[key] !== undefined -> role.permissions[key] === true
// 6. fallback -> false

onRecordListRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }

  // Admin tem acesso irrestrito
  if (auth.get('role_slug') === 'admin') {
    return e.next()
  }

  // Usuário inativo tem acesso bloqueado
  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário inativo')
  }

  // Resolução de permissões
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

  const canView = checkPerm('whatsapp_view')
  const canViewOwn = checkPerm('whatsapp_view_own')

  if (!canView && !canViewOwn) {
    throw new ForbiddenError('Você não possui permissão para visualizar esta conversa.')
  }

  // Se possui whatsapp_view_own (e não tem whatsapp_view geral): restringir apenas aos clientes/atendimentos atribuídos ao usuário
  if (canViewOwn && !canView) {
    // Busca os clientes atribuídos a este usuário
    let clientFilter = "assigned_to = '" + auth.id + "'"
    let userClientIds = []
    try {
      const userClients = $app.findRecordsByFilter('clients', clientFilter, '', 1000, 0)
      if (userClients && userClients.length > 0) {
        for (let i = 0; i < userClients.length; i++) {
          userClientIds.push(userClients[i].id)
        }
      }
    } catch (_) {}

    let userAttIds = []
    try {
      const userAtts = $app.findRecordsByFilter('attendances', clientFilter, '', 1000, 0)
      if (userAtts && userAtts.length > 0) {
        for (let j = 0; j < userAtts.length; j++) {
          userAttIds.push(userAtts[j].id)
        }
      }
    } catch (_) {}

    let conditions = []
    if (userClientIds.length > 0) {
      let clientParts = []
      for (let c = 0; c < userClientIds.length; c++) {
        clientParts.push("client_id = '" + userClientIds[c] + "'")
      }
      conditions.push('(' + clientParts.join(' || ') + ')')
    }
    if (userAttIds.length > 0) {
      let attParts = []
      for (let a = 0; a < userAttIds.length; a++) {
        attParts.push("attendance_id = '" + userAttIds[a] + "'")
      }
      conditions.push('(' + attParts.join(' || ') + ')')
    }

    let ownFilter = conditions.length > 0 ? conditions.join(' || ') : "id = 'never_match'"

    if (e.requestInfo && e.requestInfo.query) {
      const existingFilter = e.requestInfo.query.filter
      if (existingFilter && String(existingFilter).trim()) {
        e.requestInfo.query.filter = '(' + existingFilter + ') && (' + ownFilter + ')'
      } else {
        e.requestInfo.query.filter = ownFilter
      }
    }
  }

  return e.next()
}, 'messages')

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

  const canView = checkPerm('whatsapp_view')
  const canViewOwn = checkPerm('whatsapp_view_own')

  if (!canView && !canViewOwn) {
    throw new ForbiddenError('Você não possui permissão para visualizar esta conversa.')
  }

  if (canView) {
    return e.next()
  }

  // Se apenas whatsapp_view_own, validar se o cliente ou atendimento é atribuído ao usuário
  if (e.record) {
    const clientId = e.record.get('client_id')
    const attId = e.record.get('attendance_id')
    let isOwner = false

    if (clientId) {
      try {
        const cl = $app.findRecordById('clients', clientId)
        if (cl && cl.get('assigned_to') === auth.id) {
          isOwner = true
        }
      } catch (_) {}
    }

    if (!isOwner && attId) {
      try {
        const att = $app.findRecordById('attendances', attId)
        if (att && att.get('assigned_to') === auth.id) {
          isOwner = true
        }
      } catch (_) {}
    }

    if (!isOwner) {
      throw new ForbiddenError('Acesso restrito: esta conversa pertence a outro colaborador.')
    }
  }

  return e.next()
}, 'messages')

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

  // Outbound message creation requires whatsapp_reply or whatsapp_start_new
  // Se for mensagem manual ou de resposta (direction !== 'inbound')
  const direction = e.record ? e.record.get('direction') : 'outbound'

  if (direction !== 'inbound') {
    const canReply = checkPerm('whatsapp_reply')
    const canStartNew = checkPerm('whatsapp_start_new')

    if (!canReply && !canStartNew) {
      throw new ForbiddenError(
        'Sem permissão para responder ou enviar mensagens (whatsapp_reply necessário).',
      )
    }
  }

  return e.next()
}, 'messages')

console.log(
  '[WHATSAPP SECURITY] Hook loaded — whatsapp_view and whatsapp_reply permissions enforced',
)
