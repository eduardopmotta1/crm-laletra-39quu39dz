// Audit & Security Hook — v2 segura
// NUNCA intercepta nem modifica request body

// Automation trigger test on serve
// Removido testes serve
// ===== CONTROLE DE ACESSO =====// Bloquear não-admins de modificar roles
onRecordCreateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth || !auth.get('role_slug')) {
    throw new ForbiddenError('Apenas administradores podem criar funções')
  }
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem criar funções')
  }
  return e.next()
}, 'roles')

onRecordUpdateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth || !auth.get('role_slug')) {
    throw new ForbiddenError('Apenas administradores podem editar funções')
  }
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem editar funções')
  }
  return e.next()
}, 'roles')

onRecordDeleteRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth || !auth.get('role_slug')) {
    throw new ForbiddenError('Apenas administradores podem excluir funções')
  }
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem excluir funções')
  }
  return e.next()
}, 'roles')

// Bloquear não-admins de modificar usuários (exceto a si mesmo)
// Controle de Criação de Usuários via API:
// Permite se:
// 1. Requisição pública não autenticada (cadastro/register público do CRM)
// 2. OU se autenticada, o usuário precisa ser administrador (role_slug === 'admin')
onRecordCreateRequest((e) => {
  const tStart = Date.now()
  const recId = (e.record && e.record.id) || ''
  console.log(
    '[INSTR-USERS] onRecordCreateRequest ENTER | timestamp=' +
      tStart +
      (recId ? ' | recordId=' + recId : ''),
  )

  try {
    const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
    if (auth) {
      // Se autenticado, somente admin pode criar novos usuários via painel/settings
      if (auth.get('role_slug') !== 'admin') {
        throw new ForbiddenError('Apenas administradores podem criar novos usuários')
      }
    }
  } catch (err) {
    const tErr = Date.now()
    const errMsg = (err && (err.message || String(err))) || 'unknown error'
    console.log(
      '[INSTR-USERS] onRecordCreateRequest ERROR | timestamp=' +
        tErr +
        ' | duration=' +
        (tErr - tStart) +
        'ms' +
        (recId ? ' | recordId=' + recId : '') +
        ' | error=' +
        errMsg,
    )
    throw err
  }

  const tBeforeNext = Date.now()
  console.log(
    '[INSTR-USERS] onRecordCreateRequest BEFORE_NEXT | timestamp=' +
      tBeforeNext +
      ' | duration_so_far=' +
      (tBeforeNext - tStart) +
      'ms' +
      (recId ? ' | recordId=' + recId : ''),
  )

  let nextRes = null
  let nextErr = null
  try {
    nextRes = e.next()
  } catch (err) {
    nextErr = err
  }

  const tAfterNext = Date.now()
  const durationTotal = tAfterNext - tStart
  const nextDuration = tAfterNext - tBeforeNext
  const afterRecId = (e.record && e.record.id) || recId

  if (nextErr) {
    const errMsg = (nextErr && (nextErr.message || String(nextErr))) || 'unknown error'
    console.log(
      '[INSTR-USERS] onRecordCreateRequest AFTER_NEXT (FAILED) | timestamp=' +
        tAfterNext +
        ' | next_duration=' +
        nextDuration +
        'ms | total_duration=' +
        durationTotal +
        'ms' +
        (afterRecId ? ' | recordId=' + afterRecId : '') +
        ' | error=' +
        errMsg,
    )
    throw nextErr
  }

  console.log(
    '[INSTR-USERS] onRecordCreateRequest AFTER_NEXT (SUCCESS) | timestamp=' +
      tAfterNext +
      ' | next_duration=' +
      nextDuration +
      'ms | total_duration=' +
      durationTotal +
      'ms' +
      (afterRecId ? ' | recordId=' + afterRecId : ''),
  )

  return nextRes
}, 'users')

// Bloquear não-admins de modificar usuários (exceto a si mesmo)
onRecordUpdateRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth) {
    throw new ForbiddenError('Autenticação necessária')
  }
  // Se for o próprio usuário se atualizando, permite
  if (e.record && auth.id === e.record.id) {
    return e.next()
  }
  if (auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem editar outros usuários')
  }
  return e.next()
}, 'users')

onRecordDeleteRequest((e) => {
  const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
  if (!auth || auth.get('role_slug') !== 'admin') {
    throw new ForbiddenError('Apenas administradores podem excluir usuários')
  }
  return e.next()
}, 'users')

// ===== INSTRUMENTAÇÃO MODEL HOOKS USERS =====
onRecordValidate((e) => {
  const tStart = Date.now()
  const recId = (e.record && e.record.id) || ''
  console.log(
    '[INSTR-USERS] onRecordValidate ENTER | timestamp=' +
      tStart +
      (recId ? ' | recordId=' + recId : ''),
  )

  let nextRes = null
  let nextErr = null
  try {
    nextRes = e.next()
  } catch (err) {
    nextErr = err
  }

  const tEnd = Date.now()
  const duration = tEnd - tStart
  const afterRecId = (e.record && e.record.id) || recId

  if (nextErr) {
    const errMsg = (nextErr && (nextErr.message || String(nextErr))) || 'unknown error'
    console.log(
      '[INSTR-USERS] onRecordValidate EXIT (FAILED) | timestamp=' +
        tEnd +
        ' | duration=' +
        duration +
        'ms' +
        (afterRecId ? ' | recordId=' + afterRecId : '') +
        ' | error=' +
        errMsg,
    )
    throw nextErr
  }

  console.log(
    '[INSTR-USERS] onRecordValidate EXIT (SUCCESS) | timestamp=' +
      tEnd +
      ' | duration=' +
      duration +
      'ms' +
      (afterRecId ? ' | recordId=' + afterRecId : ''),
  )

  return nextRes
}, 'users')

onRecordCreate((e) => {
  const tStart = Date.now()
  const recId = (e.record && e.record.id) || ''
  console.log(
    '[INSTR-USERS] onRecordCreate ENTER | timestamp=' +
      tStart +
      (recId ? ' | recordId=' + recId : ''),
  )

  let nextRes = null
  let nextErr = null
  try {
    nextRes = e.next()
  } catch (err) {
    nextErr = err
  }

  const tEnd = Date.now()
  const duration = tEnd - tStart
  const afterRecId = (e.record && e.record.id) || recId

  if (nextErr) {
    const errMsg = (nextErr && (nextErr.message || String(nextErr))) || 'unknown error'
    console.log(
      '[INSTR-USERS] onRecordCreate EXIT (FAILED) | timestamp=' +
        tEnd +
        ' | duration=' +
        duration +
        'ms' +
        (afterRecId ? ' | recordId=' + afterRecId : '') +
        ' | error=' +
        errMsg,
    )
    throw nextErr
  }

  console.log(
    '[INSTR-USERS] onRecordCreate EXIT (SUCCESS) | timestamp=' +
      tEnd +
      ' | duration=' +
      duration +
      'ms' +
      (afterRecId ? ' | recordId=' + afterRecId : ''),
  )

  return nextRes
}, 'users')

onRecordCreateError((e) => {
  const tStart = Date.now()
  const recId = (e.record && e.record.id) || ''
  const errMsg =
    (e.error &&
      (e.error.message || (e.error.data && JSON.stringify(e.error.data)) || String(e.error))) ||
    'unknown error'

  console.log(
    '[INSTR-USERS] onRecordCreateError ENTER | timestamp=' +
      tStart +
      (recId ? ' | recordId=' + recId : '') +
      ' | error=' +
      errMsg,
  )

  let nextRes = null
  let nextErr = null
  try {
    nextRes = e.next()
  } catch (err) {
    nextErr = err
  }

  const tEnd = Date.now()
  const duration = tEnd - tStart
  const afterRecId = (e.record && e.record.id) || recId

  if (nextErr) {
    const exitErrMsg = (nextErr && (nextErr.message || String(nextErr))) || errMsg
    console.log(
      '[INSTR-USERS] onRecordCreateError EXIT (FAILED) | timestamp=' +
        tEnd +
        ' | duration=' +
        duration +
        'ms' +
        (afterRecId ? ' | recordId=' + afterRecId : '') +
        ' | error=' +
        exitErrMsg,
    )
    throw nextErr
  }

  console.log(
    '[INSTR-USERS] onRecordCreateError EXIT (SUCCESS) | timestamp=' +
      tEnd +
      ' | duration=' +
      duration +
      'ms' +
      (afterRecId ? ' | recordId=' + afterRecId : '') +
      ' | error=' +
      errMsg,
  )

  return nextRes
}, 'users')

routerAdd('POST', '/api/debug-test-user-create', (e) => {
  try {
    const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
    const body = (e.requestInfo && e.requestInfo().body) || {}
    const adminToken = $os.getenv('PB_SUPERUSER_TOKEN')
    const pbUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'
    const headers = { 'Content-Type': 'application/json' }
    if (adminToken) {
      headers['Authorization'] = adminToken
    }
    const res = $http.send({
      url: pbUrl + '/api/collections/users/records',
      method: 'POST',
      body: JSON.stringify(body),
      headers: headers,
      timeout: 10,
    })
    return e.json(res.statusCode, {
      requestPayload: body,
      statusCode: res.statusCode,
      responseJson: res.json,
      rawBody: res.raw,
    })
  } catch (err) {
    return e.json(500, { error: err.message })
  }
})

routerAdd('GET', '/api/run-all-user-tests-matrix', (e) => {
  const adminToken = $os.getenv('PB_SUPERUSER_TOKEN')
  const pbUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'
  const baseHeaders = { 'Content-Type': 'application/json' }
  const authHeaders = { 'Content-Type': 'application/json', Authorization: adminToken || '' }

  const results = []

  // Test cases:
  // 1. Minimum payload (email, password, passwordConfirm) without auth
  const t1_email = 't1_min_' + Date.now() + '@test.com'
  const t1 = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t1_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
    }),
    headers: baseHeaders,
    timeout: 5,
  })
  results.push({
    test: '1. Minimum payload (anon)',
    status: t1.statusCode,
    json: t1.json,
    body: t1.raw,
  })
  if (t1.json && t1.json.id) {
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t1.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })
  }

  // 2. Minimum payload (email, password, passwordConfirm) with admin auth
  const t2_email = 't2_min_auth_' + Date.now() + '@test.com'
  const t2 = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t2_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({
    test: '2. Minimum payload (admin auth)',
    status: t2.statusCode,
    json: t2.json,
    body: t2.raw,
  })
  if (t2.json && t2.json.id) {
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t2.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })
  }

  // 3. Frontend exact payload with admin auth
  const t3_email = 't3_front_' + Date.now() + '@test.com'
  const t3_payload = {
    name: 'Teste Frontend User',
    email: t3_email,
    password: 'Skip@Pass',
    passwordConfirm: 'Skip@Pass',
    verified: true,
    phone: '',
    role_id: null,
    role_slug: 'comercial',
    is_active: true,
    custom_permissions: {},
  }
  const t3 = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify(t3_payload),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({
    test: '3. Frontend payload (role_id null, password "Skip@Pass")',
    status: t3.statusCode,
    json: t3.json,
    body: t3.raw,
  })
  if (t3.json && t3.json.id) {
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t3.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })
  }

  // 4. Test field by field additions to minimum payload:
  // 4a. + name
  const t4a_email = 't4a_' + Date.now() + '@test.com'
  const t4a = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4a_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      name: 'Nome Teste',
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({ test: '4a. + name', status: t4a.statusCode, json: t4a.json })
  if (t4a.json && t4a.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4a.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4b. + phone
  const t4b_email = 't4b_' + Date.now() + '@test.com'
  const t4b = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4b_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      phone: '+55 11 99999-9999',
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({ test: '4b. + phone', status: t4b.statusCode, json: t4b.json })
  if (t4b.json && t4b.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4b.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4c. + role_slug
  const t4c_email = 't4c_' + Date.now() + '@test.com'
  const t4c = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4c_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      role_slug: 'comercial',
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({ test: '4c. + role_slug', status: t4c.statusCode, json: t4c.json })
  if (t4c.json && t4c.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4c.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4d. + is_active
  const t4d_email = 't4d_' + Date.now() + '@test.com'
  const t4d = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4d_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      is_active: true,
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({ test: '4d. + is_active', status: t4d.statusCode, json: t4d.json })
  if (t4d.json && t4d.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4d.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4e. + custom_permissions ({})
  const t4e_email = 't4e_' + Date.now() + '@test.com'
  const t4e = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4e_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      custom_permissions: {},
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({ test: '4e. + custom_permissions {}', status: t4e.statusCode, json: t4e.json })
  if (t4e.json && t4e.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4e.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4f. + custom_permissions with keys
  const t4f_email = 't4f_' + Date.now() + '@test.com'
  const t4f = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4f_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      custom_permissions: { attendance_view: true },
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({ test: '4f. + custom_permissions filled', status: t4f.statusCode, json: t4f.json })
  if (t4f.json && t4f.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4f.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4g. + verified: true
  const t4g_email = 't4g_' + Date.now() + '@test.com'
  const t4g = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4g_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      verified: true,
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({
    test: '4g. + verified: true',
    status: t4g.statusCode,
    json: t4g.json,
    body: t4g.raw,
  })
  if (t4g.json && t4g.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4g.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4h. + role_id: "jp4xwmxgw4dpw50" (valid role ID)
  const t4h_email = 't4h_' + Date.now() + '@test.com'
  const t4h = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4h_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      role_id: 'jp4xwmxgw4dpw50',
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({
    test: '4h. + role_id valid',
    status: t4h.statusCode,
    json: t4h.json,
    body: t4h.raw,
  })
  if (t4h.json && t4h.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4h.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4i. + role_id: null
  const t4i_email = 't4i_' + Date.now() + '@test.com'
  const t4i = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4i_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      role_id: null,
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({
    test: '4i. + role_id null',
    status: t4i.statusCode,
    json: t4i.json,
    body: t4i.raw,
  })
  if (t4i.json && t4i.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4i.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 4j. + role_id: "" (empty string)
  const t4j_email = 't4j_' + Date.now() + '@test.com'
  const t4j = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({
      email: t4j_email,
      password: 'Skip@Pass123',
      passwordConfirm: 'Skip@Pass123',
      role_id: '',
    }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({
    test: '4j. + role_id empty string',
    status: t4j.statusCode,
    json: t4j.json,
    body: t4j.raw,
  })
  if (t4j.json && t4j.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t4j.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 5. Test password lengths/patterns:
  // 5a. password: 'Skip@Pass' (9 chars)
  const t5a_email = 't5a_' + Date.now() + '@test.com'
  const t5a = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({ email: t5a_email, password: 'Skip@Pass', passwordConfirm: 'Skip@Pass' }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({
    test: '5a. password "Skip@Pass"',
    status: t5a.statusCode,
    json: t5a.json,
    body: t5a.raw,
  })
  if (t5a.json && t5a.json.id)
    $http.send({
      url: pbUrl + '/api/collections/users/records/' + t5a.json.id,
      method: 'DELETE',
      headers: authHeaders,
    })

  // 5b. password empty ''
  const t5b_email = 't5b_' + Date.now() + '@test.com'
  const t5b = $http.send({
    url: pbUrl + '/api/collections/users/records',
    method: 'POST',
    body: JSON.stringify({ email: t5b_email, password: '', passwordConfirm: '' }),
    headers: authHeaders,
    timeout: 5,
  })
  results.push({
    test: '5b. password empty',
    status: t5b.statusCode,
    json: t5b.json,
    body: t5b.raw,
  })

  return e.json(200, { results: results })
})

routerAdd('POST', '/backend/v1/crm/audit-log', (e) => {
  try {
    const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
    const body = e.requestInfo().body || {}
    const coll = $app.findCollectionByNameOrId('audit_logs')
    const rec = new Record(coll)
    rec.set('user_id', auth ? auth.id : null)
    rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
    rec.set('user_email', auth ? auth.get('email') || '' : '')
    rec.set('action', String(body.action || 'custom_action'))
    rec.set('module', String(body.module || 'geral'))
    rec.set('record_id', String(body.record_id || ''))
    rec.set('record_title', String(body.record_title || ''))
    rec.set('details', String(body.details || ''))
    if (body.previous_value !== undefined) {
      rec.set('previous_value', body.previous_value)
    }
    if (body.new_value !== undefined) {
      rec.set('new_value', body.new_value)
    }
    const ip = e.requestInfo().remoteIP || ''
    rec.set('ip_address', ip)
    $app.save(rec)
    return e.json(200, { success: true, id: rec.id })
  } catch (err) {
    return e.json(500, { error: 'Failed to record audit log' })
  }
})

// ===== AUDITORIA (pós-execução, nunca bloqueia) =====
// Registrar CREATES
onRecordAfterCreateSuccess(
  (e) => {
    try {
      const record = e.record
      if (!record) return e.next()
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      const col =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      let title = record.id || ''
      if (col === 'clients') title = record.get('name') || record.id
      else if (col === 'archived_deals') title = record.get('client_name') || record.id
      else if (col === 'production_orders') title = record.get('order_number') || record.id
      else if (col === 'tasks') title = record.get('title') || record.id
      else if (col === 'messages') title = (record.get('message_text') || '').substring(0, 50)
      else if (col === 'production_proofs') title = 'Prova #' + (record.get('version_number') || '')
      else if (col === 'evaluations') title = 'Avaliação ' + record.id
      else if (col === 'post_sales') title = 'Pós-venda ' + record.id

      const coll = $app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(coll)
      rec.set('user_id', auth ? auth.id : null)
      rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
      rec.set('user_email', auth ? auth.get('email') || '' : '')
      rec.set('action', 'create')
      rec.set('module', col)
      rec.set('record_id', record.id || '')
      rec.set('record_title', title || '')
      rec.set('details', 'Registro criado')
      rec.set('previous_value', null)
      rec.set('new_value', record.publicExport())
      rec.set('ip_address', '')
      $app.save(rec)
    } catch (err) {
      console.error('[AUDIT] Failed to log create:', err && err.message ? err.message : err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'tasks',
  'messages',
  'production_proofs',
  'evaluations',
  'post_sales',
  'attendances',
)

// Registrar UPDATES (com previous/new)
onRecordAfterUpdateSuccess(
  (e) => {
    try {
      const record = e.record
      if (!record) return e.next()
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      const col =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      let title = record.id || ''
      if (col === 'clients') title = record.get('name') || record.id
      else if (col === 'archived_deals') title = record.get('client_name') || record.id
      else if (col === 'production_orders') title = record.get('order_number') || record.id
      else if (col === 'tasks') title = record.get('title') || record.id
      else if (col === 'messages') title = (record.get('message_text') || '').substring(0, 50)
      else if (col === 'production_proofs') title = 'Prova #' + (record.get('version_number') || '')
      else if (col === 'evaluations') title = 'Avaliação ' + record.id
      else if (col === 'post_sales') title = 'Pós-venda ' + record.id

      const prev = record.original() ? record.original().publicExport() : null
      const curr = record.publicExport()

      const coll = $app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(coll)
      rec.set('user_id', auth ? auth.id : null)
      rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
      rec.set('user_email', auth ? auth.get('email') || '' : '')
      rec.set('action', 'update')
      rec.set('module', col)
      rec.set('record_id', record.id || '')
      rec.set('record_title', title || '')
      rec.set('details', 'Registro atualizado')
      rec.set('previous_value', prev)
      rec.set('new_value', curr)
      rec.set('ip_address', '')
      $app.save(rec)
    } catch (err) {
      console.error('[AUDIT] Failed to log update:', err && err.message ? err.message : err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'tasks',
  'messages',
  'production_proofs',
  'evaluations',
  'post_sales',
  'attendances',
)

// Registrar DELETES
onRecordAfterDeleteSuccess(
  (e) => {
    try {
      const record = e.record
      if (!record) return e.next()
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      const col =
        (record.collection && record.collection().name) ||
        (e.collection && e.collection.name) ||
        'unknown'
      let title = record.id || ''
      if (col === 'clients') title = record.get('name') || record.id
      else if (col === 'archived_deals') title = record.get('client_name') || record.id
      else if (col === 'production_orders') title = record.get('order_number') || record.id
      else if (col === 'tasks') title = record.get('title') || record.id
      else if (col === 'messages') title = (record.get('message_text') || '').substring(0, 50)
      else if (col === 'production_proofs') title = 'Prova #' + (record.get('version_number') || '')
      else if (col === 'evaluations') title = 'Avaliação ' + record.id
      else if (col === 'post_sales') title = 'Pós-venda ' + record.id

      const coll = $app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(coll)
      rec.set('user_id', auth ? auth.id : null)
      rec.set('user_name', auth ? auth.get('name') || auth.get('email') || '' : '')
      rec.set('user_email', auth ? auth.get('email') || '' : '')
      rec.set('action', 'delete')
      rec.set('module', col)
      rec.set('record_id', record.id || '')
      rec.set('record_title', title || '')
      rec.set('details', 'Registro excluído')
      rec.set('previous_value', record.publicExport())
      rec.set('new_value', null)
      rec.set('ip_address', '')
      $app.save(rec)
    } catch (err) {
      console.error('[AUDIT] Failed to log delete:', err && err.message ? err.message : err)
    }
    return e.next()
  },
  'clients',
  'archived_deals',
  'production_orders',
  'tasks',
  'messages',
  'production_proofs',
  'evaluations',
  'post_sales',
  'attendances',
)

console.log('[AUDIT SECURITY] v2 loaded — safe mode')
