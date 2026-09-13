/**
 * Sanitizador de objetos e erros para diagnóstico e exibição segura.
 * Oculta valores sensíveis (senhas, tokens, cookies, secrets, authorization headers),
 * mas preserva estruturas e mensagens de validação (ex: { code: '...', message: '...' } do PocketBase).
 */
export function sanitizeObject(obj: any, seen = new WeakSet()): any {
  if (obj === null || typeof obj !== 'object') return obj
  if (seen.has(obj)) return '[Circular]'
  seen.add(obj)
  if (Array.isArray(obj)) return obj.map((item) => sanitizeObject(item, seen))
  const clean: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    const lowerKey = key.toLowerCase()
    const isSensitiveKey =
      lowerKey.includes('password') ||
      lowerKey.includes('authorization') ||
      lowerKey.includes('token') ||
      lowerKey.includes('cookie') ||
      lowerKey.includes('secret')

    // Se for objeto de erro de validação (ex: { code: 'validation_min_text_constraint', message: '...' })
    // ou contiver mensagem de validação, preservamos o objeto com suas mensagens visíveis
    const isValidationDetailObject =
      val && typeof val === 'object' && !Array.isArray(val) && ('message' in val || 'code' in val)

    if (isSensitiveKey && !isValidationDetailObject) {
      clean[key] = '[REDACTED]'
    } else {
      clean[key] = sanitizeObject(val, seen)
    }
  }
  return clean
}

/**
 * Extrai e sanitiza a mensagem amigável de erro retornada pelo PocketBase ou Error JS,
 * sem valores sensíveis e sem fallback genérico enganoso.
 */
export function getSanitizedErrorMessage(err: any): string {
  if (!err) return 'Erro desconhecido ao processar requisição.'

  // Se houver erros específicos por campo no formato PocketBase (err.data.data ou err.response.data)
  const data = err?.data?.data || err?.response?.data || err?.data
  if (data && typeof data === 'object') {
    const fieldMessages: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      if (detail && typeof detail === 'object' && 'message' in (detail as any)) {
        const msg = String((detail as any).message || '').trim()
        if (msg) {
          fieldMessages.push(`${field}: ${msg}`)
        }
      } else if (typeof detail === 'string' && detail.trim()) {
        fieldMessages.push(`${field}: ${detail.trim()}`)
      }
    }
    if (fieldMessages.length > 0) {
      return fieldMessages.join(' | ')
    }
  }

  // Mensagem do próprio erro ou response
  const rawMsg = err?.data?.message || err?.response?.message || err?.message
  if (typeof rawMsg === 'string' && rawMsg.trim()) {
    return rawMsg.trim()
  }

  return 'Ocorreu um erro ao salvar o usuário no servidor.'
}
