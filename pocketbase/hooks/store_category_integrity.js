/**
 * Hook para validações de integridade e unicidade de categorias na Laletra Store
 *
 * Garante:
 * - Validação de slug obrigatório e formato limpo
 * - Unicidade de slug no backend PocketBase: impede cadastro/edição com slugs duplicados
 * - Não modifica slugs existentes automaticamente
 *
 * Atenção: PocketBase JSVM exige funções auxiliares inline dentro do corpo do callback.
 */

onRecordCreateRequest((e) => {
  const sanitizeSlug = function (raw) {
    if (!raw) return ''
    return String(raw)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&+/g, '-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const record = e.record
  if (!record) return e.next()

  let slug = record.getString('slug')
  const name = record.getString('name')

  if (!slug && name) {
    slug = sanitizeSlug(name)
    record.set('slug', slug)
  } else if (slug) {
    slug = sanitizeSlug(slug)
    record.set('slug', slug)
  }

  if (!slug) {
    throw new BadRequestError('O campo slug (URL) é obrigatório para a categoria.')
  }

  // Validação anti-circular e existência do parent_id na criação
  let parentId = ''
  try {
    parentId = (record.getString('parent_id') || '').trim()
  } catch (_) {}

  if (parentId) {
    try {
      const parentRecord = $app.findRecordById('store_categories', parentId)
      if (!parentRecord) {
        throw new BadRequestError('A categoria pai selecionada não foi encontrada.')
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err
      throw new BadRequestError('A categoria pai selecionada não existe no cadastro.')
    }
  }

  // Verifica unicidade do slug
  try {
    const existing = $app.findFirstRecordByData('store_categories', 'slug', slug)
    if (existing) {
      throw new BadRequestError(
        'O slug "' + slug + '" já está em uso por outra categoria. Escolha um slug único.',
      )
    }
  } catch (err) {
    if (err && err.message && err.message.indexOf('já está em uso') !== -1) {
      throw err
    }
    // Record not found -> slug disponível, prossegue normalmente
  }

  return e.next()
}, 'store_categories')

onRecordUpdateRequest((e) => {
  const sanitizeSlug = function (raw) {
    if (!raw) return ''
    return String(raw)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&+/g, '-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const record = e.record
  if (!record) return e.next()

  let slug = record.getString('slug')
  const name = record.getString('name')

  if (!slug && name) {
    slug = sanitizeSlug(name)
    record.set('slug', slug)
  } else if (slug) {
    slug = sanitizeSlug(slug)
    record.set('slug', slug)
  }

  if (!slug) {
    throw new BadRequestError('O campo slug (URL) é obrigatório para a categoria.')
  }

  // Validação anti-circular estrita no update
  let parentId = ''
  try {
    parentId = (record.getString('parent_id') || '').trim()
  } catch (_) {}

  if (parentId) {
    // 1. Auto-vinculação proibida
    if (parentId === record.id) {
      throw new BadRequestError('Uma categoria não pode ser subcategoria de si mesma.')
    }

    // 2. A categoria pai deve existir
    let parentRecord = null
    try {
      parentRecord = $app.findRecordById('store_categories', parentId)
    } catch (_) {}

    if (!parentRecord) {
      throw new BadRequestError('A categoria pai selecionada não existe no cadastro.')
    }

    // 3. Proibição de ciclos na árvore: percorrer os ancestrais de parentId
    // Se o próprio record.id for encontrado nos ancestrais de parentId, significa que parentId é descendente de record.id
    let curr = parentRecord
    let safetyCounter = 0
    const visited = {}
    visited[parentRecord.id] = true

    while (curr && safetyCounter < 100) {
      safetyCounter++
      let nextParentId = ''
      try {
        nextParentId = (curr.getString('parent_id') || '').trim()
      } catch (_) {}

      if (!nextParentId) {
        break
      }

      if (nextParentId === record.id) {
        throw new BadRequestError(
          'Referência circular detectada: a categoria pai selecionada é descendente desta categoria.',
        )
      }

      if (visited[nextParentId]) {
        // Ciclo preexistente na cadeia
        throw new BadRequestError(
          'Estrutura hierárquica corrompida: ciclo detectado na linhagem da categoria selecionada.',
        )
      }
      visited[nextParentId] = true

      try {
        curr = $app.findRecordById('store_categories', nextParentId)
      } catch (_) {
        curr = null
      }
    }
  }

  // Verifica unicidade com outros registros
  try {
    const records = $app.findRecordsByFilter(
      'store_categories',
      'slug = {:slug} && id != {:id}',
      '',
      1,
      0,
      { slug: slug, id: record.id },
    )
    if (records && records.length > 0) {
      throw new BadRequestError(
        'O slug "' + slug + '" já está em uso por outra categoria. Escolha um slug único.',
      )
    }
  } catch (err) {
    if (err && err.message && err.message.indexOf('já está em uso') !== -1) {
      throw err
    }
  }

  return e.next()
}, 'store_categories')

console.log('[STORE CATEGORY INTEGRITY] Hook de unicidade de slugs carregado com sucesso.')
