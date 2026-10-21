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
