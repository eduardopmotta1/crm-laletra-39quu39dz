import { describe, it, expect } from 'vitest'

describe('Users diagnostic error sanitizer', () => {
  const sanitizeObject = (obj: any, seen = new WeakSet()): any => {
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

  it('mascara senhas e tokens reais nos payloads e headers', () => {
    const raw = {
      password: 'minhasenhasecreta123',
      passwordConfirm: 'minhasenhasecreta123',
      headers: {
        authorization: 'Bearer secret_token_xyz',
        cookie: 'session=123456',
      },
      apiSecret: 'super_secret_value',
    }

    const sanitized = sanitizeObject(raw)
    expect(sanitized.password).toBe('[REDACTED]')
    expect(sanitized.passwordConfirm).toBe('[REDACTED]')
    expect(sanitized.headers.authorization).toBe('[REDACTED]')
    expect(sanitized.headers.cookie).toBe('[REDACTED]')
    expect(sanitized.apiSecret).toBe('[REDACTED]')
  })

  it('preserva mensagens de validação do PocketBase para campos de senha', () => {
    const pocketbaseErrorData = {
      data: {
        password: {
          code: 'validation_min_text_constraint',
          message: 'Must be at least 8 characters.',
        },
        email: {
          code: 'validation_required',
          message: 'Cannot be blank.',
        },
      },
      message: 'Failed to create record.',
      status: 400,
    }

    const sanitized = sanitizeObject(pocketbaseErrorData)
    expect(sanitized.data.password).toEqual({
      code: 'validation_min_text_constraint',
      message: 'Must be at least 8 characters.',
    })
    expect(sanitized.data.password.message).toBe('Must be at least 8 characters.')
    expect(sanitized.data.email.message).toBe('Cannot be blank.')
    expect(sanitized.status).toBe(400)
  })

  it('trata referências circulares de forma segura', () => {
    const circularObj: any = { name: 'Teste' }
    circularObj.self = circularObj

    const sanitized = sanitizeObject(circularObj)
    expect(sanitized.self).toBe('[Circular]')
    expect(sanitized.name).toBe('Teste')
  })
})
