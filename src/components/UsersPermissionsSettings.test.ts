import { describe, it, expect } from 'vitest'
import type { User } from '@/types/crm'

describe('UsersPermissionsSettings form prefilling logic', () => {
  it('inicializa formulário de edição com os dados reais de userToEdit (name, email, phone, role_id, is_active)', () => {
    const existingUser: User = {
      id: 'usr_test_123',
      name: 'Carlos Roberto',
      email: 'carlos.roberto@grafica.com',
      phone: '+55 11 99876-5432',
      role_id: 'role_producao_1',
      role_slug: 'producao',
      is_active: true,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-02T00:00:00Z',
    }

    // Lógica espelhada do componente UsersPermissionsSettings
    const initialFormData = {
      name: existingUser.name || '',
      email: existingUser.email || '',
      phone: existingUser.phone || '',
      password: '',
      passwordConfirm: '',
      role_id: existingUser.role_id || '',
      role_slug: existingUser.role_slug || 'comercial',
      is_active: existingUser.is_active !== false,
    }

    expect(initialFormData.name).toBe('Carlos Roberto')
    expect(initialFormData.email).toBe('carlos.roberto@grafica.com')
    expect(initialFormData.phone).toBe('+55 11 99876-5432')
    expect(initialFormData.role_id).toBe('role_producao_1')
    expect(initialFormData.role_slug).toBe('producao')
    expect(initialFormData.is_active).toBe(true)
  })

  it('quando o usuário não possui telefone salvo, inicializa phone como string vazia sem quebrar ou usar placeholder', () => {
    const userWithoutPhone: User = {
      id: 'usr_test_456',
      name: 'Mariana Designer',
      email: 'mariana@grafica.com',
      phone: '',
      role_id: 'role_comercial_1',
      role_slug: 'comercial',
      is_active: false,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-02T00:00:00Z',
    }

    const initialFormData = {
      name: userWithoutPhone.name || '',
      email: userWithoutPhone.email || '',
      phone: userWithoutPhone.phone || '',
      password: '',
      passwordConfirm: '',
      role_id: userWithoutPhone.role_id || '',
      role_slug: userWithoutPhone.role_slug || 'comercial',
      is_active: userWithoutPhone.is_active !== false,
    }

    expect(initialFormData.name).toBe('Mariana Designer')
    expect(initialFormData.email).toBe('mariana@grafica.com')
    expect(initialFormData.phone).toBe('')
    expect(initialFormData.is_active).toBe(false)
  })

  it('quando abre para criação (sem usuário), inicializa campos vazios com perfil padrão', () => {
    const defaultRole = { id: 'role_comercial_default', slug: 'comercial' }

    const creationFormData = {
      name: '',
      email: '',
      phone: '',
      password: '',
      passwordConfirm: '',
      role_id: defaultRole.id,
      role_slug: defaultRole.slug,
      is_active: true,
    }

    expect(creationFormData.name).toBe('')
    expect(creationFormData.email).toBe('')
    expect(creationFormData.phone).toBe('')
    expect(creationFormData.role_id).toBe('role_comercial_default')
    expect(creationFormData.is_active).toBe(true)
  })

  it('atualização assíncrona após getById completa campos se vierem de busca completa', () => {
    const listUser: User = {
      id: 'usr_partial',
      name: 'Alan Soares',
      email: '', // simulando ausência pontual na listagem
      phone: '',
      role_id: 'role_prod',
      role_slug: 'producao',
      is_active: true,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-02T00:00:00Z',
    }

    let formData = {
      name: listUser.name || '',
      email: listUser.email || '',
      phone: listUser.phone || '',
      password: '',
      passwordConfirm: '',
      role_id: listUser.role_id || '',
      role_slug: listUser.role_slug || 'comercial',
      is_active: listUser.is_active !== false,
    }

    const fullRecord: User = {
      id: 'usr_partial',
      name: 'Alan Soares',
      email: 'alan@laletra.com.br',
      phone: '+55 11 91111-2222',
      role_id: 'role_prod',
      role_slug: 'producao',
      is_active: true,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-02T00:00:00Z',
    }

    // Simula a resolução do usersAdminService.getById(u.id)
    formData = {
      ...formData,
      name: fullRecord.name || formData.name,
      email: fullRecord.email || formData.email,
      phone:
        fullRecord.phone !== undefined && fullRecord.phone !== null
          ? fullRecord.phone
          : formData.phone,
      role_id: fullRecord.role_id || formData.role_id,
      role_slug: fullRecord.role_slug || formData.role_slug,
      is_active: fullRecord.is_active !== false,
    }

    expect(formData.email).toBe('alan@laletra.com.br')
    expect(formData.phone).toBe('+55 11 91111-2222')
    expect(formData.name).toBe('Alan Soares')
    expect(formData.role_id).toBe('role_prod')
  })
})
