/**
 * Hook para cliente atualizar seus próprios dados cadastrais através do public_token
 * NÃO requer autenticação.
 * WHITELIST EXPLÍCITA: Aceita SOMENTE os 17 campos de perfil:
 * name, trade_name, client_type, cpf_cnpj, birth_date, phone, secondary_phone,
 * email, instagram, how_found, address_zip, address_street, address_number,
 * address_complement, address_neighborhood, address_city, address_state.
 *
 * Qualquer outro campo enviado (assigned_to, notes, is_vip, is_archived, stage,
 * product_interest, quote_value, priority, id, etc.) é COMPLETAMENTE IGNORADO.
 * Token reutilizável: pode ser aberto e salvo quantas vezes o cliente precisar.
 */
routerAdd('POST', '/backend/v1/public/clients/{token}', (c) => {
  let token = ''
  try {
    token = c.request.pathValue('token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token inválido ou não fornecido' })
    }

    const clients = $app.findRecordsByFilter(
      'clients',
      'public_token = {:token}',
      '-created',
      1,
      0,
      {
        token: token.trim(),
      },
    )

    if (!clients || clients.length === 0) {
      return c.json(404, { error: 'Cliente não encontrado ou link inválido' })
    }

    const client = clients[0]
    const body = c.requestInfo().body || {}

    // Validações mínimas no backend
    const name = typeof body.name === 'string' ? body.name.trim() : client.getString('name')
    if (!name) {
      return c.json(400, { error: 'O nome / razão social é obrigatório.' })
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : client.getString('phone')
    if (!phone) {
      return c.json(400, { error: 'O telefone / WhatsApp é obrigatório.' })
    }

    const clientType = body.client_type === 'pessoa_juridica' ? 'pessoa_juridica' : 'pessoa_fisica'

    // WHITELIST RIGOROSA: aplicar apenas os 17 campos cadastrais permitidos
    client.set('name', name)
    client.set('phone', phone)
    client.set('client_type', clientType)

    // Se phone mudou, manter normalized_phone atualizado também (dígitos apenas)
    try {
      const cleanDigits = phone.replace(/[^0-9]/g, '')
      if (cleanDigits.length >= 8) {
        // Se começar com 55 e tiver 12 ou 13 dígitos, remove o 55 para padronização DDD+número
        let normPhone = cleanDigits
        if (normPhone.startsWith('55') && (normPhone.length === 12 || normPhone.length === 13)) {
          normPhone = normPhone.slice(2)
        }
        client.set('normalized_phone', normPhone)
      }
    } catch (_) {}

    if (body.trade_name !== undefined) {
      client.set('trade_name', typeof body.trade_name === 'string' ? body.trade_name.trim() : '')
    }

    if (body.cpf_cnpj !== undefined) {
      client.set('cpf_cnpj', typeof body.cpf_cnpj === 'string' ? body.cpf_cnpj.trim() : '')
    }

    if (body.birth_date !== undefined) {
      let bDate = typeof body.birth_date === 'string' ? body.birth_date.trim() : ''
      if (bDate) {
        // Se vier com 'T' ou espaço, extrai apenas a parte da data YYYY-MM-DD
        if (bDate.includes('T')) {
          bDate = bDate.split('T')[0].trim()
        } else if (bDate.includes(' ')) {
          bDate = bDate.split(' ')[0].trim()
        }
        // Valida formato YYYY-MM-DD
        const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bDate)
        if (dateMatch) {
          // Formata para o layout canônico de DateField do PocketBase (UTC midnight sem conversão de timezone)
          client.set('birth_date', `${bDate} 00:00:00.000Z`)
        } else {
          client.set('birth_date', '')
        }
      } else {
        client.set('birth_date', '')
      }
    }

    if (body.secondary_phone !== undefined) {
      client.set(
        'secondary_phone',
        typeof body.secondary_phone === 'string' ? body.secondary_phone.trim() : '',
      )
    }

    if (body.email !== undefined) {
      client.set('email', typeof body.email === 'string' ? body.email.trim() : '')
    }

    if (body.instagram !== undefined) {
      client.set('instagram', typeof body.instagram === 'string' ? body.instagram.trim() : '')
    }

    if (body.how_found !== undefined) {
      client.set('how_found', typeof body.how_found === 'string' ? body.how_found.trim() : '')
    }

    if (body.address_zip !== undefined) {
      client.set('address_zip', typeof body.address_zip === 'string' ? body.address_zip.trim() : '')
    }

    if (body.address_street !== undefined) {
      client.set(
        'address_street',
        typeof body.address_street === 'string' ? body.address_street.trim() : '',
      )
    }

    if (body.address_number !== undefined) {
      client.set(
        'address_number',
        typeof body.address_number === 'string' ? body.address_number.trim() : '',
      )
    }

    if (body.address_complement !== undefined) {
      client.set(
        'address_complement',
        typeof body.address_complement === 'string' ? body.address_complement.trim() : '',
      )
    }

    if (body.address_neighborhood !== undefined) {
      client.set(
        'address_neighborhood',
        typeof body.address_neighborhood === 'string' ? body.address_neighborhood.trim() : '',
      )
    }

    if (body.address_city !== undefined) {
      client.set(
        'address_city',
        typeof body.address_city === 'string' ? body.address_city.trim() : '',
      )
    }

    if (body.address_state !== undefined) {
      client.set(
        'address_state',
        typeof body.address_state === 'string' ? body.address_state.trim().toUpperCase() : '',
      )
    }

    // Persiste o cliente
    $app.save(client)

    // Grava audit_log com identificação segura de autoatendimento público
    try {
      const auditCollection = $app.findCollectionByNameOrId('audit_logs')
      if (auditCollection) {
        const auditRec = new Record(auditCollection)
        auditRec.set('user_name', 'Cliente (Formulário Público)')
        auditRec.set('user_email', client.getString('email') || '')
        auditRec.set('action', 'atualizar')
        auditRec.set('module', 'clients')
        auditRec.set('record_id', client.id)
        auditRec.set('record_title', name)
        auditRec.set(
          'details',
          'Dados cadastrais atualizados pelo próprio cliente através do link público.',
        )
        $app.save(auditRec)
      }
    } catch (audErr) {
      console.error('[PublicClientUpdate] Erro ao gravar audit_log:', audErr)
    }

    // Retorna os dados atualizados somente da whitelist
    let birthDateResp = ''
    try {
      const bStr = client.getString('birth_date') || ''
      if (bStr) {
        // Suporta tanto YYYY-MM-DD como YYYY-MM-DD 00:00:00.000Z ou ISO com T
        birthDateResp = bStr.replace('T', ' ').split(' ')[0].trim()
      }
    } catch (_) {}

    return c.json(200, {
      success: true,
      message: 'Dados cadastrais salvos com sucesso!',
      data: {
        name: client.getString('name') || '',
        trade_name: client.getString('trade_name') || '',
        client_type: client.getString('client_type') || 'pessoa_fisica',
        cpf_cnpj: client.getString('cpf_cnpj') || '',
        birth_date: birthDateResp,
        phone: client.getString('phone') || '',
        secondary_phone: client.getString('secondary_phone') || '',
        email: client.getString('email') || '',
        instagram: client.getString('instagram') || '',
        how_found: client.getString('how_found') || '',
        address_zip: client.getString('address_zip') || '',
        address_street: client.getString('address_street') || '',
        address_number: client.getString('address_number') || '',
        address_complement: client.getString('address_complement') || '',
        address_neighborhood: client.getString('address_neighborhood') || '',
        address_city: client.getString('address_city') || '',
        address_state: client.getString('address_state') || '',
      },
    })
  } catch (err) {
    const masked = token ? token.substring(0, 4) + '...' + token.slice(-4) : 'nenhum'
    console.error(
      `[PublicClientUpdate] Token: ${masked} | Erro: ${err && err.message ? err.message : String(err)}`,
    )
    return c.json(500, {
      error: 'Erro ao atualizar dados: ' + (err && err.message ? err.message : String(err)),
    })
  }
})
