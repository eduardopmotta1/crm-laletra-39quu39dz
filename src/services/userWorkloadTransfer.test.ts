import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usersAdminService } from './rolesPermissions'
import pb from '@/lib/pocketbase/client'

describe('usersAdminService - transferWorkload contract & business logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('chama POST /backend/v1/crm/transfer-user-workload com os parâmetros esperados pelo backend', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      transferred_clients: 5,
      transferred_tasks: 3,
      transferred_orders: 2,
      transferred_attendances: 5,
      transferred_pending_resolutions: 1,
      deactivated: true,
    } as any)

    const result = await usersAdminService.transferWorkload({
      fromUserId: 'usr_source_1',
      toUserId: 'usr_target_2',
      deactivateFromUser: true,
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith('/backend/v1/crm/transfer-user-workload', {
      method: 'POST',
      body: {
        from_user_id: 'usr_source_1',
        to_user_id: 'usr_target_2',
        deactivate_from_user: true,
      },
    })

    expect(result.success).toBe(true)
    expect(result.transferred_clients).toBe(5)
    expect(result.transferred_tasks).toBe(3)
    expect(result.transferred_orders).toBe(2)
    expect(result.deactivated).toBe(true)
  })

  it('lida com erro retornado pelo backend preservando a mensagem amigável', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce({
      status: 400,
      data: {
        error: 'O usuário de destino não pode ser o mesmo usuário de origem.',
      },
      message: 'ClientResponseError 400',
    })

    const result = await usersAdminService.transferWorkload({
      fromUserId: 'usr_source_1',
      toUserId: 'usr_source_1',
      deactivateFromUser: true,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('O usuário de destino não pode ser o mesmo usuário de origem.')
  })

  it('lida com erro de bloqueio quando não há destino e existem pendências em aberto', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce({
      status: 400,
      data: {
        error:
          'O colaborador possui atendimentos, pedidos ou tarefas em aberto. Selecione um colaborador destino para transferir a carteira antes de desativar.',
      },
    })

    const result = await usersAdminService.transferWorkload({
      fromUserId: 'usr_source_1',
      toUserId: '',
      deactivateFromUser: true,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Selecione um colaborador destino')
  })

  it('chama toggleActive corretamente sem apagar fisicamente o usuário', async () => {
    const updateSpy = vi.spyOn(pb.collection('users'), 'update').mockResolvedValueOnce({
      id: 'usr_source_1',
      is_active: false,
    } as any)

    const deleteSpy = vi.spyOn(pb.collection('users'), 'delete')

    const updatedUser = await usersAdminService.toggleActive('usr_source_1', false)

    expect(updateSpy).toHaveBeenCalledWith('usr_source_1', { is_active: false })
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(updatedUser.is_active).toBe(false)
  })
})
