import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usersAdminService } from './rolesPermissions'
import pb from '@/lib/pocketbase/client'

describe('usersAdminService password validation and confirmation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejeita criação com senha inferior a 8 caracteres', async () => {
    const createSpy = vi.spyOn(pb.collection('users'), 'create')

    await expect(
      usersAdminService.create({
        name: 'Teste Curto',
        email: 'curto@teste.com',
        password: '12345',
        passwordConfirm: '12345',
      }),
    ).rejects.toThrow('A senha deve ter pelo menos 8 caracteres.')

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('rejeita criação quando password e passwordConfirm divergem', async () => {
    const createSpy = vi.spyOn(pb.collection('users'), 'create')

    await expect(
      usersAdminService.create({
        name: 'Teste Divergente',
        email: 'divergente@teste.com',
        password: 'SenhaSegura123',
        passwordConfirm: 'SenhaDiferente123',
      }),
    ).rejects.toThrow('A confirmação de senha não confere com a senha informada.')

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('envia dados corretos e completos ao criar usuário com senha válida (10+ caracteres)', async () => {
    const mockUser = {
      id: 'usr_mock_123',
      name: 'Novo Atendente',
      email: 'atendente@empresa.com',
      role_id: 'role_comercial_1',
      role_slug: 'comercial',
      is_active: true,
      custom_permissions: { view_dashboard: true },
    }

    const createSpy = vi
      .spyOn(pb.collection('users'), 'create')
      .mockResolvedValueOnce(mockUser as any)

    const result = await usersAdminService.create({
      name: 'Novo Atendente',
      email: 'atendente@empresa.com',
      phone: '11999998888',
      password: 'SenhaSegura10Plus!',
      passwordConfirm: 'SenhaSegura10Plus!',
      role_id: 'role_comercial_1',
      role_slug: 'comercial',
      is_active: true,
      custom_permissions: { view_dashboard: true },
    })

    expect(createSpy).toHaveBeenCalledWith({
      name: 'Novo Atendente',
      email: 'atendente@empresa.com',
      phone: '11999998888',
      password: 'SenhaSegura10Plus!',
      passwordConfirm: 'SenhaSegura10Plus!',
      role_id: 'role_comercial_1',
      role_slug: 'comercial',
      is_active: true,
      custom_permissions: { view_dashboard: true },
    })
    expect(result.role_id).toBe('role_comercial_1')
    expect(result.role_slug).toBe('comercial')
    expect(result.is_active).toBe(true)
  })

  it('permite atualizar dados do usuário existente mantendo o mesmo ID e SEM enviar password/passwordConfirm/oldPassword', async () => {
    const updateSpy = vi.spyOn(pb.collection('users'), 'update').mockResolvedValueOnce({
      id: 'usr_123',
      name: 'Nome Atualizado',
      email: 'atualizado@empresa.com',
      phone: '11888887777',
      role_id: 'role_designer_1',
      role_slug: 'designer',
      is_active: true,
      custom_permissions: { view_dashboard: true },
    } as any)

    const res = await usersAdminService.update('usr_123', {
      name: 'Nome Atualizado',
      email: 'atualizado@empresa.com',
      phone: '11888887777',
      role_id: 'role_designer_1',
      role_slug: 'designer',
      is_active: true,
      custom_permissions: { view_dashboard: true },
    })

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith('usr_123', {
      name: 'Nome Atualizado',
      email: 'atualizado@empresa.com',
      phone: '11888887777',
      role_id: 'role_designer_1',
      role_slug: 'designer',
      is_active: true,
      custom_permissions: { view_dashboard: true },
    })

    // Garante categoricamente que campos de senha não foram enviados no payload
    const calledPayload = updateSpy.mock.calls[0][1] as any
    expect(calledPayload).not.toHaveProperty('password')
    expect(calledPayload).not.toHaveProperty('passwordConfirm')
    expect(calledPayload).not.toHaveProperty('oldPassword')

    expect(res.id).toBe('usr_123')
    expect(res.name).toBe('Nome Atualizado')
  })

  it('permite atualizar apenas telefone ou role mantendo ID e sem tocar em senhas', async () => {
    const updateSpy = vi.spyOn(pb.collection('users'), 'update').mockResolvedValueOnce({
      id: 'usr_456',
      name: 'Atendente Existente',
      email: 'atendente@empresa.com',
      phone: '11977776666',
      role_id: 'role_comercial_2',
      role_slug: 'comercial',
    } as any)

    const res = await usersAdminService.update('usr_456', {
      phone: '11977776666',
      role_id: 'role_comercial_2',
      role_slug: 'comercial',
    })

    expect(updateSpy).toHaveBeenCalledWith('usr_456', {
      phone: '11977776666',
      role_id: 'role_comercial_2',
      role_slug: 'comercial',
    })
    const payload = updateSpy.mock.calls[0][1] as any
    expect(payload).not.toHaveProperty('password')
    expect(payload).not.toHaveProperty('passwordConfirm')
    expect(payload).not.toHaveProperty('oldPassword')
    expect(res.id).toBe('usr_456')
  })
})
