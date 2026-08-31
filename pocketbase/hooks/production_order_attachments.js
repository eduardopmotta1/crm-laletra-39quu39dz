// Production Order Attachments Hook
// Endpoint seguro para adicionar arquivos de mensagens de chat ao Pedido de Produção
// Protege contra duplicidade (production_order_id + message_id) e valida permissão real (production_attach_files / production_edit / admin)

routerAdd('POST', '/backend/v1/crm/production/attach-message-file', (e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária.',
    })
  }

  // 1. Validar Administrador ou Permissão Real de Produção (production_attach_files ou production_edit)
  const roleSlug = auth.get('role_slug') || ''
  const isAdmin = roleSlug === 'admin'

  let customPerms = {}
  try {
    const raw = auth.get('custom_permissions')
    if (typeof raw === 'string' && raw.trim() !== '') {
      customPerms = JSON.parse(raw)
    } else if (raw && typeof raw === 'object') {
      customPerms = raw
    }
  } catch (_) {}

  let rolePerms = {}
  const roleId = auth.get('role_id')
  if (roleId) {
    try {
      const roleRec = $app.findRecordById('roles', roleId)
      if (roleRec) {
        const rawRole = roleRec.get('permissions')
        if (typeof rawRole === 'string' && rawRole.trim() !== '') {
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

  const hasAttachPerm = checkPerm('production_attach_files') || checkPerm('production_edit')
  if (!isAdmin && !hasAttachPerm) {
    return e.json(403, {
      success: false,
      error:
        'Acesso negado: você não possui a permissão de Produção necessária (production_attach_files) para anexar arquivos ao pedido.',
    })
  }

  // 2. Extrair parâmetros do corpo da requisição
  const body = e.requestInfo().body || {}
  const productionOrderId = String(body.production_order_id || body.order_id || '').trim()
  const messageId = String(body.message_id || '').trim()

  if (!productionOrderId || !messageId) {
    return e.json(400, {
      success: false,
      error: 'Parâmetros obrigatórios ausentes: production_order_id e message_id são necessários.',
    })
  }

  // 3. Validar se o Pedido de Produção existe
  let orderRecord = null
  try {
    orderRecord = $app.findRecordById('production_orders', productionOrderId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error: 'Pedido de produção não encontrado.',
    })
  }

  // 4. Validar se a Mensagem existe e possui arquivo
  let messageRecord = null
  try {
    messageRecord = $app.findRecordById('messages', messageId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error: 'Mensagem de origem não encontrada.',
    })
  }

  const messageFile = messageRecord.get('file')
  if (!messageFile || String(messageFile).trim() === '') {
    return e.json(400, {
      success: false,
      error: 'A mensagem informada não possui arquivo para ser transferido.',
    })
  }

  const originalFileName =
    messageRecord.get('file_name') || messageRecord.get('file') || 'arquivo_anexo'

  // 5. Verificar vínculo existente para idempotência/duplicidade
  try {
    const existingLinks = $app.findRecordsByFilter(
      'production_order_message_attachments',
      "production_order_id = '" + productionOrderId + "' && message_id = '" + messageId + "'",
      '',
      1,
      0,
    )
    if (existingLinks && existingLinks.length > 0) {
      return e.json(200, {
        success: true,
        already_added: true,
        already_exists: true,
        message:
          'Este arquivo já foi adicionado ao Pedido #' +
          (orderRecord.get('order_number') || productionOrderId) +
          '.',
        order: orderRecord.publicExport(),
      })
    }
  } catch (_) {}

  // 6. Bloco 40G-B: Autorização concedida e validações OK.
  // O link de vinculação NÃO é criado aqui para evitar estado inconsistente se a cópia falhar.
  // O frontend executa a cópia via FormData attachments+ e em seguida chama /confirm-message-file-attached.
  return e.json(200, {
    success: true,
    already_added: false,
    already_exists: false,
    authorized: true,
    message_file: messageFile,
    file_name: originalFileName,
    file_type: messageRecord.get('file_type') || '',
    order_number: orderRecord.get('order_number') || '',
    order: orderRecord.publicExport(),
  })
})

// 2. Endpoint de confirmação e criação do vínculo após sucesso da cópia
routerAdd('POST', '/backend/v1/crm/production/confirm-message-file-attached', (e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    return e.json(401, {
      success: false,
      error: 'Autenticação necessária.',
    })
  }

  // 1. Validar Administrador ou Permissão Real de Produção
  const roleSlug = auth.get('role_slug') || ''
  const isAdmin = roleSlug === 'admin'

  let customPerms = {}
  try {
    const raw = auth.get('custom_permissions')
    if (typeof raw === 'string' && raw.trim() !== '') {
      customPerms = JSON.parse(raw)
    } else if (raw && typeof raw === 'object') {
      customPerms = raw
    }
  } catch (_) {}

  let rolePerms = {}
  const roleId = auth.get('role_id')
  if (roleId) {
    try {
      const roleRec = $app.findRecordById('roles', roleId)
      if (roleRec) {
        const rawRole = roleRec.get('permissions')
        if (typeof rawRole === 'string' && rawRole.trim() !== '') {
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

  const hasAttachPerm = checkPerm('production_attach_files') || checkPerm('production_edit')
  if (!isAdmin && !hasAttachPerm) {
    return e.json(403, {
      success: false,
      error:
        'Acesso negado: você não possui a permissão de Produção necessária (production_attach_files) para anexar arquivos ao pedido.',
    })
  }

  // 2. Extrair parâmetros
  const body = e.requestInfo().body || {}
  const productionOrderId = String(body.production_order_id || body.order_id || '').trim()
  const messageId = String(body.message_id || '').trim()
  const fileNameParam = String(body.file_name || '').trim()

  if (!productionOrderId || !messageId) {
    return e.json(400, {
      success: false,
      error: 'Parâmetros obrigatórios ausentes: production_order_id e message_id são necessários.',
    })
  }

  // 3. Validar se o Pedido existe
  let orderRecord = null
  try {
    orderRecord = $app.findRecordById('production_orders', productionOrderId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error: 'Pedido de produção não encontrado.',
    })
  }

  // 4. Validar se a Mensagem existe
  let messageRecord = null
  try {
    messageRecord = $app.findRecordById('messages', messageId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error: 'Mensagem de origem não encontrada.',
    })
  }

  const originalFileName =
    fileNameParam || messageRecord.get('file_name') || messageRecord.get('file') || 'arquivo_anexo'

  // 5. Verificar se o vínculo já existe
  try {
    const existingLinks = $app.findRecordsByFilter(
      'production_order_message_attachments',
      "production_order_id = '" + productionOrderId + "' && message_id = '" + messageId + "'",
      '',
      1,
      0,
    )
    if (existingLinks && existingLinks.length > 0) {
      return e.json(200, {
        success: true,
        already_added: true,
        already_exists: true,
        link_id: existingLinks[0].id,
        message: 'Vínculo já registrado anteriormente.',
      })
    }
  } catch (_) {}

  // 6. Criar vínculo no banco com proteção atômica / UNIQUE constraint
  let createdLinkId = ''
  try {
    const linkCollection = $app.findCollectionByNameOrId('production_order_message_attachments')
    const newLink = new Record(linkCollection)
    newLink.set('production_order_id', productionOrderId)
    newLink.set('message_id', messageId)
    newLink.set('created_by', auth.id)
    newLink.set('file_name', originalFileName)
    $app.save(newLink)
    createdLinkId = newLink.id
  } catch (err) {
    // Se falhou por conflito de unicidade (concorrência)
    const errMsg = (err && (err.message || String(err))) || ''
    if (
      errMsg.toLowerCase().indexOf('unique') !== -1 ||
      errMsg.toLowerCase().indexOf('idx_poma_order_message') !== -1
    ) {
      return e.json(200, {
        success: true,
        already_added: true,
        already_exists: true,
        message: 'Vínculo já registrado por requisição concorrente.',
      })
    }
    console.error('[CONFIRM ATTACH MESSAGE FILE] Error creating link record:', errMsg)
    return e.json(500, {
      success: false,
      error: 'Erro ao registrar vínculo definitivo do anexo no pedido.',
    })
  }

  return e.json(200, {
    success: true,
    already_added: false,
    link_id: createdLinkId,
    message: 'Vínculo registrado com sucesso após a cópia do arquivo.',
  })
})
