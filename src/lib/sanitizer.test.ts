import { describe, it, expect } from 'vitest'

import { sanitizeObject, getSanitizedErrorMessage } from './sanitizer'

describe('Users diagnostic error sanitizer', () => {
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

  it('extrai mensagens específicas de validação sem fallback genérico enganoso', () => {
    const errorWithFields = {
      message: 'Failed to update record.',
      data: {
        data: {
          name: { message: 'Cannot be blank.' },
          email: { message: 'Must be a valid email address.' },
        },
      },
    }
    const msg = getSanitizedErrorMessage(errorWithFields)
    expect(msg).toBe('name: Cannot be blank. | email: Must be a valid email address.')
    expect(msg).not.toContain('Verifique se o email já está cadastrado')
  })

  it('extrai mensagem principal quando não há data por campo', () => {
    const errorSimple = {
      message: 'PocketBase request failed with status 400',
    }
    expect(getSanitizedErrorMessage(errorSimple)).toBe('PocketBase request failed with status 400')
  })
})
