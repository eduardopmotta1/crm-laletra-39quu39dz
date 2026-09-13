import { describe, it, expect, vi, beforeEach } from 'vitest'
import { attendancesService } from './attendances'
import pb from '@/lib/pocketbase/client'

describe('attendancesService.resolveOrCreateForQuote', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('A) cliente sem atendimento aberto → cria 1 atendimento com stage "Em atendimento" e source "orcamento"', async () => {
    const mockClient = { id: 'client_sem_aberto', name: 'Cliente Teste Sem Aberto', notes: '' }
    const mockCreatedAttendance = {
      id: 'att_novo_1',
      client_id: 'client_sem_aberto',
      stage: 'Em atendimento',
      source: 'orcamento',
      is_archived: false,
    }

    vi.spyOn(pb.collection('clients'), 'getOne').mockResolvedValue(mockClient as any)
    vi.spyOn(pb.collection('clients'), 'update').mockResolvedValue({} as any)
    vi.spyOn(pb.collection('attendances'), 'getFullList').mockResolvedValue([] as any)
    const createSpy = vi
      .spyOn(pb.collection('attendances'), 'create')
      .mockResolvedValue(mockCreatedAttendance as any)

    const result = await attendancesService.resolveOrCreateForQuote('client_sem_aberto')

    expect(result.id).toBe('att_novo_1')
    expect(result.stage).toBe('Em atendimento')
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client_sem_aberto',
        stage: 'Em atendimento',
        source: 'orcamento',
        is_archived: false,
      }),
    )
  })

  it('B) cliente com atendimento aberto → reutiliza o MESMO attendance_id, sem criar novo', async () => {
    const mockClient = { id: 'client_com_aberto', name: 'Cliente Aberto', notes: '' }
    const existingOpenAttendance = {
      id: 'att_existente_99',
      client_id: 'client_com_aberto',
      stage: 'Novo contato',
      is_archived: false,
    }

    vi.spyOn(pb.collection('clients'), 'getOne').mockResolvedValue(mockClient as any)
    vi.spyOn(pb.collection('attendances'), 'getFullList').mockResolvedValue([
      existingOpenAttendance,
    ] as any)
    const createSpy = vi.spyOn(pb.collection('attendances'), 'create')

    const result = await attendancesService.resolveOrCreateForQuote('client_com_aberto')

    expect(result.id).toBe('att_existente_99')
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('C) cliente com atendimento apenas "Venda fechada" → cria NOVO atendimento "Em atendimento"', async () => {
    const mockClient = { id: 'client_won', name: 'Cliente Won', notes: '' }
    const mockNewAttendance = {
      id: 'att_novo_pos_venda',
      client_id: 'client_won',
      stage: 'Em atendimento',
      source: 'orcamento',
      is_archived: false,
    }

    vi.spyOn(pb.collection('clients'), 'getOne').mockResolvedValue(mockClient as any)
    vi.spyOn(pb.collection('clients'), 'update').mockResolvedValue({} as any)
    // O getFullList com filtro (stage != 'Venda fechada' && stage != 'Não fechou' && is_archived != true) retorna vazio
    vi.spyOn(pb.collection('attendances'), 'getFullList').mockResolvedValue([] as any)
    const createSpy = vi
      .spyOn(pb.collection('attendances'), 'create')
      .mockResolvedValue(mockNewAttendance as any)

    const result = await attendancesService.resolveOrCreateForQuote('client_won')

    expect(result.id).toBe('att_novo_pos_venda')
    expect(result.stage).toBe('Em atendimento')
    expect(createSpy).toHaveBeenCalled()
  })

  it('D) cliente com atendimento apenas "Não fechou" → cria NOVO atendimento "Em atendimento"', async () => {
    const mockClient = { id: 'client_lost', name: 'Cliente Lost', notes: '' }
    const mockNewAttendance = {
      id: 'att_novo_pos_perda',
      client_id: 'client_lost',
      stage: 'Em atendimento',
      source: 'orcamento',
      is_archived: false,
    }

    vi.spyOn(pb.collection('clients'), 'getOne').mockResolvedValue(mockClient as any)
    vi.spyOn(pb.collection('clients'), 'update').mockResolvedValue({} as any)
    vi.spyOn(pb.collection('attendances'), 'getFullList').mockResolvedValue([] as any)
    const createSpy = vi
      .spyOn(pb.collection('attendances'), 'create')
      .mockResolvedValue(mockNewAttendance as any)

    const result = await attendancesService.resolveOrCreateForQuote('client_lost')

    expect(result.id).toBe('att_novo_pos_perda')
    expect(result.stage).toBe('Em atendimento')
    expect(createSpy).toHaveBeenCalled()
  })

  it('E) cliente com atendimento arquivado → cria NOVO atendimento "Em atendimento"', async () => {
    const mockClient = { id: 'client_archived', name: 'Cliente Arquivado', notes: '' }
    const mockNewAttendance = {
      id: 'att_novo_pos_arquivo',
      client_id: 'client_archived',
      stage: 'Em atendimento',
      source: 'orcamento',
      is_archived: false,
    }

    vi.spyOn(pb.collection('clients'), 'getOne').mockResolvedValue(mockClient as any)
    vi.spyOn(pb.collection('clients'), 'update').mockResolvedValue({} as any)
    // is_archived != true no filtro elimina atendimentos arquivados
    vi.spyOn(pb.collection('attendances'), 'getFullList').mockResolvedValue([] as any)
    const createSpy = vi
      .spyOn(pb.collection('attendances'), 'create')
      .mockResolvedValue(mockNewAttendance as any)

    const result = await attendancesService.resolveOrCreateForQuote('client_archived')

    expect(result.id).toBe('att_novo_pos_arquivo')
    expect(result.stage).toBe('Em atendimento')
    expect(createSpy).toHaveBeenCalled()
  })

  it('G) criação e resolução de atendimento NÃO invoca collection production_orders', async () => {
    const mockClient = { id: 'client_sem_producao', name: 'Cliente Sem Producao', notes: '' }
    const mockNewAttendance = {
      id: 'att_sem_producao',
      client_id: 'client_sem_producao',
      stage: 'Em atendimento',
      source: 'orcamento',
      is_archived: false,
    }

    vi.spyOn(pb.collection('clients'), 'getOne').mockResolvedValue(mockClient as any)
    vi.spyOn(pb.collection('clients'), 'update').mockResolvedValue({} as any)
    vi.spyOn(pb.collection('attendances'), 'getFullList').mockResolvedValue([] as any)
    vi.spyOn(pb.collection('attendances'), 'create').mockResolvedValue(mockNewAttendance as any)

    const prodOrderSpy = vi.spyOn(pb.collection('production_orders'), 'create')

    await attendancesService.resolveOrCreateForQuote('client_sem_producao')

    expect(prodOrderSpy).not.toHaveBeenCalled()
  })
})
