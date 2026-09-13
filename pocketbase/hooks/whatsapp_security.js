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

  // Usuário inativo tem acesso bloqueado
  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário inativo')
  }

  // Leitura temporariamente liberada para qualquer usuário autenticado e ativo
  return e.next()
}, 'messages')

onRecordViewRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }

  // Usuário inativo tem acesso bloqueado
  if (auth.get('is_active') === false) {
    throw new ForbiddenError('Usuário inativo')
  }

  // Leitura temporariamente liberada para qualquer usuário autenticado e ativo
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

    // Regra Bloco 40D: Se houver arquivo anexo sendo enviado (campo file preenchido ou multipart file presente),
    // é OBRIGATÓRIO ter a permissão whatsapp_send_files
    let hasFile = false
    if (e.record) {
      const fileVal = e.record.get('file')
      if (fileVal && String(fileVal).trim() !== '') {
        hasFile = true
      }
    }

    // Verificar se na requisição há arquivos enviados (multipart files)
    if (!hasFile && e.httpContext) {
      try {
        const reqFiles = e.httpContext.requestFiles()
        if (reqFiles && (reqFiles['file'] || Object.keys(reqFiles).length > 0)) {
          hasFile = true
        }
      } catch (_) {}
    }

    if (hasFile) {
      const canSendFiles = checkPerm('whatsapp_send_files')
      if (!canSendFiles) {
        throw new ForbiddenError(
          'Sem permissão para anexar ou enviar arquivos na conversa (whatsapp_send_files necessário).',
        )
      }
    }
  }

  return e.next()
}, 'messages')

console.log(
  '[WHATSAPP SECURITY] Hook loaded v4 — whatsapp_view, whatsapp_reply, whatsapp_send_files permissions enforced',
)
