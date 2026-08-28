migrate(
  (app) => {
    // 1. Helper de normalização (idêntico ao frontend em src/lib/utils.ts)
    const normalizePhone = (rawPhone) => {
      if (!rawPhone) return ''
      let digits = String(rawPhone).replace(/\D/g, '')
      if (digits.startsWith('55') && digits.length >= 12) {
        digits = digits.substring(2)
      }
      return digits
    }

    const col = app.findCollectionByNameOrId('clients')

    // 2. Adicionar o campo normalized_phone se não existir
    if (!col.fields.getByName('normalized_phone')) {
      col.fields.add(
        new TextField({
          name: 'normalized_phone',
          required: false,
        }),
      )
      app.save(col)
    }

    // 3. Varrer todos os clients existentes e popular normalized_phone
    const allClients = app.findRecordsByFilter('clients', '', 'created', 2000, 0)
    console.log(
      '[Migration 0023] Populating normalized_phone for ' + allClients.length + ' clients...',
    )

    for (let i = 0; i < allClients.length; i++) {
      const c = allClients[i]
      const rawPhone = c.getString('phone')
      const notes = c.getString('notes') || ''
      const isMerged = notes.includes('[DUPLICADO_CONSOLIDADO')

      const norm = normalizePhone(rawPhone)

      if (isMerged) {
        // Se já é consolidado/legado, atribuir valor diferenciado para não conflitar com o canônico ativo
        c.set('normalized_phone', 'merged_' + c.id)
      } else if (norm && norm.length >= 8) {
        // Se começar com 55 e tiver 10 ou 11 dígitos restantes, assegura que o prefixo 55 seja removido
        let cleanNorm = norm
        if (cleanNorm.startsWith('55') && cleanNorm.length >= 12) {
          cleanNorm = cleanNorm.substring(2)
        }
        c.set('normalized_phone', cleanNorm)
      } else {
        // Telefone inválido ou em branco histórico: usar id ou vazio único
        if (rawPhone && rawPhone.trim()) {
          c.set('normalized_phone', 'invalid_' + c.id)
        } else {
          c.set('normalized_phone', '')
        }
      }
      app.save(c)
    }

    // 4. Criar índice UNIQUE para normalized_phone onde não for vazio
    // Usando WHERE normalized_phone != '' para permitir múltiplos registros sem telefone se houver
    col.addIndex(
      'idx_clients_normalized_phone_unique',
      true,
      'normalized_phone',
      "normalized_phone != ''",
    )
    app.save(col)

    console.log('[Migration 0023] normalized_phone field and UNIQUE index created successfully.')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('clients')
      col.removeIndex('idx_clients_normalized_phone_unique')
      const field = col.fields.getByName('normalized_phone')
      if (field) {
        col.fields.remove(field)
      }
      app.save(col)
    } catch (_) {}
  },
)
