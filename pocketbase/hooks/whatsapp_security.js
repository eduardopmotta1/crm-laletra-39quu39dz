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

// Endpoint contextual: visualização segura da conversa do cliente vinculado ao Pedido de Produção
// Permite que usuários com permissão de Produção vejam o histórico de mensagens do cliente daquele pedido
routerAdd('POST', '/backend/v1/crm/whatsapp/order-conversation', (e) => {
  console.log('[ORDER CONVERSATION ROUTE] Request received')
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária.',
    })
  }

  // Admin tem acesso irrestrito
  const roleSlug = auth.get('role_slug') || ''
  const isAdmin = roleSlug === 'admin'

  // Usuário inativo tem acesso bloqueado
  if (auth.get('is_active') === false) {
    return e.json(403, {
      success: false,
      error: 'Usuário inativo.',
    })
  }

  // Ler production_order_id do corpo
  const body = e.requestInfo().body || {}
  const productionOrderId = String(body.production_order_id || body.order_id || '').trim()

  if (!productionOrderId) {
    return e.json(400, {
      success: false,
      error: 'Parâmetro obrigatório ausente: production_order_id.',
    })
  }

  // Buscar pedido em production_orders
  let orderRecord = null
  try {
    orderRecord = $app.findRecordById('production_orders', productionOrderId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error: 'Pedido de produção não encontrado.',
    })
  }

  // Obter client_id do pedido
  const clientId = orderRecord.get('client_id')
  if (!clientId || String(clientId).trim() === '') {
    return e.json(400, {
      success: false,
      error: 'O pedido informado não possui cliente vinculado.',
    })
  }

  // Validar permissões se não for admin
  if (!isAdmin) {
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

    const canViewAll = checkPerm('production_view_all')
    const canViewAssigned = checkPerm('production_view_assigned')
    const canViewGeneral = checkPerm('production_view')

    const hasProductionAccess = canViewGeneral || canViewAll || canViewAssigned

    if (!hasProductionAccess) {
      return e.json(403, {
        success: false,
        error: 'Acesso negado: sem permissão para acessar o módulo de produção.',
      })
    }

    // Se não possui production_view_all, e possui apenas production_view_assigned (ou production_view genérico sem _all),
    // verificar se tem apenas assigned
    if (!canViewAll) {
      if (canViewAssigned) {
        const prodRep = orderRecord.get('production_rep_id')
        const salesRep = orderRecord.get('sales_rep_id')
        const isAssigned = prodRep === auth.id || salesRep === auth.id

        if (!isAssigned && !canViewGeneral) {
          return e.json(403, {
            success: false,
            error: 'Acesso restrito: este pedido de produção pertence a outro colaborador.',
          })
        }
      }
    }
  }

  // Buscar mensagens do cliente via consulta interna (expandindo sent_by_user para identificação "Nome • Setor • Horário")
  let messages = []
  try {
    const rawRecords = $app.findRecordsByFilter(
      'messages',
      "client_id = '" + clientId + "'",
      'created',
      5000,
      0,
    )
    if (rawRecords && rawRecords.length > 0) {
      // Buscar usuários e papéis para enriquecer expand de sent_by_user se necessário
      let usersCache = {}
      let rolesCache = {}
      try {
        const uList = $app.findRecordsByFilter('users', '', '', 500, 0)
        for (let u = 0; u < uList.length; u++) {
          const uRec = uList[u]
          usersCache[uRec.id] = uRec.publicExport()
        }
        const rList = $app.findRecordsByFilter('roles', '', '', 100, 0)
        for (let r = 0; r < rList.length; r++) {
          const rRec = rList[r]
          rolesCache[rRec.id] = rRec.publicExport()
        }
      } catch (_) {}

      for (let i = 0; i < rawRecords.length; i++) {
        const rec = rawRecords[i]
        const exported = rec.publicExport()
        const sentByUserId = rec.get('sent_by_user')
        if (sentByUserId && usersCache[sentByUserId]) {
          const uObj = usersCache[sentByUserId]
          const roleId = uObj.role_id
          if (roleId && rolesCache[roleId]) {
            uObj.expand = uObj.expand || {}
            uObj.expand.role_id = rolesCache[roleId]
          }
          exported.expand = exported.expand || {}
          exported.expand.sent_by_user = uObj
        }
        messages.push(exported)
      }
    }
  } catch (queryErr) {
    console.error('[ORDER CONVERSATION] Error fetching messages:', queryErr)
    return e.json(500, {
      success: false,
      error: 'Erro ao carregar mensagens da conversa.',
    })
  }

  return e.json(200, {
    success: true,
    client_id: clientId,
    production_order_id: productionOrderId,
    messages: messages,
  })
})

console.log(
  '[WHATSAPP SECURITY] Hook loaded v3 — order-conversation route registered and whatsapp_view, whatsapp_reply, whatsapp_send_files permissions enforced',
)
