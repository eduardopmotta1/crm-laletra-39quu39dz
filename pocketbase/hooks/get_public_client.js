/**
 * Hook para obter dados públicos do cliente através do public_token
 * NÃO requer autenticação.
 * Retorna EXCLUSIVAMENTE os 17 campos de perfil cadastral:
 * name, trade_name, client_type, cpf_cnpj, birth_date, phone, secondary_phone,
 * email, instagram, how_found, address_zip, address_street, address_number,
 * address_complement, address_neighborhood, address_city, address_state.
 *
 * NUNCA retorna: assigned_to, notes, is_vip, is_archived, stage, product_interest,
 * quote_value, priority, last_message_*, next_action*, métricas comerciais ou
 * qualquer campo interno (nem id explorável).
 */
routerAdd('GET', '/backend/v1/public/clients/{token}', (c) => {
  try {
    const token = c.request.pathValue('token')
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
      return c.json(404, { error: 'Cliente não encontrado ou token inválido' })
    }

    const client = clients[0]

    let birthDateStr = ''
    try {
      const rawDate = client.getString('birth_date') || ''
      if (rawDate) {
        // Suporta tanto YYYY-MM-DD como YYYY-MM-DD 00:00:00.000Z ou ISO com T
        birthDateStr = rawDate.replace('T', ' ').split(' ')[0].trim()
      }
    } catch (_) {}

    const safeClientData = {
      name: client.getString('name') || '',
      trade_name: client.getString('trade_name') || '',
      client_type: client.getString('client_type') || 'pessoa_fisica',
      cpf_cnpj: client.getString('cpf_cnpj') || '',
      birth_date: birthDateStr,
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
    }

    return c.json(200, { data: safeClientData })
  } catch (err) {
    return c.json(500, {
      error:
        'Erro ao consultar dados cadastrais do cliente: ' +
        (err && err.message ? err.message : String(err)),
    })
  }
})
