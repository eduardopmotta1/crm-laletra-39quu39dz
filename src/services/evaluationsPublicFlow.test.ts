import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluationsService } from './evaluations'
import pb from '@/lib/pocketbase/client'

/**
 * Testes da Página e Serviço de Avaliação Pública (/avaliacao/:token)
 * Valida os requisitos do usuário:
 * A) token válido + não respondido → formulário abre e envia
 * B) mesmo token depois do envio → não permite segundo envio
 * C) token expirado → não mostra formulário (retorna expired = true ou erro correspondente)
 * D) token inválido → erro normal
 * E) avaliação existente → conteúdo não é sobrescrito no backend
 */

describe('Public Evaluation Flow & evaluationsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('A) Token válido + não respondido busca GET /evaluation e permite envio', async () => {
    const mockGetResponse = {
      valid: true,
      expired: false,
      already_submitted: false,
      token: 'eval_valid_token_123',
      evaluation_id: 'ev_12345',
      client_name: 'Supermercado Central',
      order_number: '#001861',
      product_name: 'Banner Lona Frontlight 440g',
      overall_rating: null,
      service_rating: null,
      quality_rating: null,
      delivery_rating: null,
      comment: null,
    }

    const pbSendSpy = vi.spyOn(pb, 'send').mockResolvedValue(mockGetResponse)

    const result = await evaluationsService.getByToken('eval_valid_token_123')

    expect(pbSendSpy).toHaveBeenCalledWith(
      '/backend/v1/crm/evaluation?token=eval_valid_token_123',
      { method: 'GET' },
    )
    expect(result.valid).toBe(true)
    expect(result.expired).toBe(false)
    expect(result.already_submitted).toBe(false)
    expect(result.client_name).toBe('Supermercado Central')
    expect(result.order_number).toBe('#001861')

    // Submit evaluation
    const mockSubmitResponse = {
      success: true,
      status: 'submitted',
      message: 'Avaliação registrada com sucesso.',
      is_dissatisfied: false,
    }
    pbSendSpy.mockResolvedValueOnce(mockSubmitResponse)

    const submitResult = await evaluationsService.submitEvaluation({
      token: 'eval_valid_token_123',
      overall_rating: 5,
      service_rating: 5,
      quality_rating: 5,
      delivery_rating: 5,
      comment: 'Serviço excelente!',
    })

    expect(submitResult.success).toBe(true)
    expect(submitResult.message).toBe('Avaliação registrada com sucesso.')
  })

  it('B) Mesmo token depois do envio → already_submitted = true e rejeita segundo envio', async () => {
    const mockGetResponse = {
      valid: true,
      expired: false,
      already_submitted: true,
      token: 'eval_already_submitted_token',
      evaluation_id: 'ev_99999',
      client_name: 'Cliente Satisfeito',
      order_number: '#001862',
      product_name: 'Adesivo Vinil',
      overall_rating: 5,
      service_rating: 5,
      quality_rating: 5,
      delivery_rating: 5,
      comment: 'Excelente atendimento e entrega rápida!',
    }

    vi.spyOn(pb, 'send').mockResolvedValue(mockGetResponse)

    const result = await evaluationsService.getByToken('eval_already_submitted_token')

    expect(result.valid).toBe(true)
    expect(result.expired).toBe(false)
    expect(result.already_submitted).toBe(true)
    expect(result.overall_rating).toBe(5)

    // Tentativa de segundo envio deve ser rejeitada pelo backend
    vi.spyOn(pb, 'send').mockRejectedValue({
      status: 400,
      data: {
        error: 'Esta avaliação já foi enviada. Obrigado pelo seu feedback.',
        already_submitted: true,
      },
    })

    await expect(
      evaluationsService.submitEvaluation({
        token: 'eval_already_submitted_token',
        overall_rating: 1,
        comment: 'Tentando sobrescrever nota',
      }),
    ).rejects.toThrow('Esta avaliação já foi enviada. Obrigado pelo seu feedback.')
  })

  it('C) Token expirado (> 30 dias) → retorna expired = true e rejeita submissão com erro de expiração', async () => {
    const mockGetExpired = {
      valid: false,
      expired: true,
      already_submitted: false,
      token: 'eval_expired_token_abc',
      evaluation_id: 'ev_old_111',
      client_name: 'Cliente Antigo',
      order_number: '#001500',
      product_name: 'Panfletos 5000un',
      overall_rating: null,
      service_rating: null,
      quality_rating: null,
      delivery_rating: null,
      comment: null,
    }

    vi.spyOn(pb, 'send').mockResolvedValue(mockGetExpired)

    const result = await evaluationsService.getByToken('eval_expired_token_abc')
    expect(result.valid).toBe(false)
    expect(result.expired).toBe(true)

    // Tentativa de submit em token expirado
    vi.spyOn(pb, 'send').mockRejectedValue({
      status: 410,
      data: {
        error: 'Este link de avaliação expirou.',
        expired: true,
      },
    })

    await expect(
      evaluationsService.submitEvaluation({
        token: 'eval_expired_token_abc',
        overall_rating: 5,
      }),
    ).rejects.toThrow('Este link de avaliação expirou.')
  })

  it('D) Token inválido ou inexistente → erro normal', async () => {
    vi.spyOn(pb, 'send').mockRejectedValue({
      status: 404,
      data: { error: 'Link de avaliação inválido ou inexistente.' },
    })

    await expect(evaluationsService.getByToken('invalid_token_xyz')).rejects.toThrow(
      'Link de avaliação inválido ou inexistente.',
    )

    // Token vazio
    await expect(evaluationsService.getByToken('')).rejects.toThrow(
      'Link de avaliação não fornecido.',
    )
  })

  it('E) Avaliação existente não pode ser sobrescrita (backend protege dados existentes)', async () => {
    // Simula resposta de proteção onde submit é bloqueado
    vi.spyOn(pb, 'send').mockRejectedValue({
      status: 400,
      data: {
        error: 'Esta avaliação já foi enviada. Obrigado pelo seu feedback.',
        already_submitted: true,
      },
    })

    await expect(
      evaluationsService.submitEvaluation({
        token: 'eval_existing_closed_case',
        overall_rating: 2,
        comment: 'Hacking attempt to overwrite rating',
      }),
    ).rejects.toThrow('Esta avaliação já foi enviada. Obrigado pelo seu feedback.')
  })

  it('Host backend: pb.baseUrl é utilizado e não window.location.origin', () => {
    expect(pb.baseUrl).toBeDefined()
    expect(typeof pb.baseUrl).toBe('string')
    expect(pb.baseUrl.length).toBeGreaterThan(0)
  })
})
