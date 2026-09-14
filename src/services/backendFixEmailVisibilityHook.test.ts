import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Simulação e testes da lógica de negócio do endpoint backend
 * POST /backend/v1/crm/fix-users-email-visibility
 */

interface MockUserRecord {
  id: string
  name: string
  email: string
  role_slug: string
  is_active: boolean
  emailVisibility: boolean
  phone?: string
  passwordHash?: string
  custom_permissions?: Record<string, boolean>
  verified?: boolean
}

interface MockAuditLog {
  id: string
  user_id: string
  user_name: string
  user_email: string
  action: string
  module: string
  record_id: string
  record_title: string
  details: string
  ip_address: string
}

class MockPocketBaseFixEmailVisibilityContext {
  users: MockUserRecord[] = []
  auditLogs: MockAuditLog[] = []

  findUser(id: string) {
    return this.users.find((u) => u.id === id) || null
  }

  executeFixEmailVisibilityHook(
    auth: {
      id: string
      role_slug: string
      is_active: boolean
      name?: string
      email?: string
    } | null,
    remoteIP = '127.0.0.1',
  ) {
    // 1. AUTORIZAÇÃO: Apenas admin autenticado e ativo
    if (!auth) {
      return {
        status: 401,
        data: {
          success: false,
          error: 'Autenticação necessária.',
        },
      }
    }

    if (auth.is_active === false) {
      return {
        status: 403,
        data: {
          success: false,
          error: 'Usuário inativo.',
        },
      }
    }

    const roleSlug = auth.role_slug || ''
    if (roleSlug !== 'admin') {
      return {
        status: 403,
        data: {
          success: false,
          error:
            'Acesso restrito: apenas administradores podem executar a sincronização de visibilidade de e-mails.',
        },
      }
    }

    // 2. BUSCAR TODOS OS USUÁRIOS
    let alreadyTrueCount = 0
    let updatedCount = 0
    let failedCount = 0

    for (let i = 0; i < this.users.length; i++) {
      const user = this.users[i]
      const currentVisibility = user.emailVisibility === true

      if (currentVisibility) {
        alreadyTrueCount++
        continue
      }

      try {
        // Atualiza SOMENTE emailVisibility
        user.emailVisibility = true
        updatedCount++
      } catch (errUser: any) {
        failedCount++
      }
    }

    // 3. REGISTRAR AUDITORIA
    if (updatedCount > 0) {
      this.auditLogs.push({
        id: 'aud_' + Date.now(),
        user_id: auth.id,
        user_name: auth.name || auth.email || '',
        user_email: auth.email || '',
        action: 'fix_users_email_visibility',
        module: 'users',
        record_id: auth.id,
        record_title: 'Sincronização de Visibilidade de E-mails',
        details: `Visibilidade de e-mail atualizada para ${updatedCount} usuário(s). Já visíveis: ${alreadyTrueCount}. Falhas: ${failedCount}.`,
        ip_address: remoteIP,
      })
    }

    return {
      status: 200,
      data: {
        success: true,
        already_visible: alreadyTrueCount,
        updated_count: updatedCount,
        failed_count: failedCount,
        total_users: this.users.length,
        message: 'Sincronização de visibilidade de e-mails concluída com sucesso.',
      },
    }
  }
}

describe('Backend Hook /backend/v1/crm/fix-users-email-visibility', () => {
  let ctx: MockPocketBaseFixEmailVisibilityContext

  beforeEach(() => {
    ctx = new MockPocketBaseFixEmailVisibilityContext()

    ctx.users = [
      {
        id: 'usr_admin',
        name: 'Admin Motta',
        email: 'admin@laletra.com',
        role_slug: 'admin',
        is_active: true,
        emailVisibility: false,
        phone: '',
        passwordHash: 'hash_original_admin',
        custom_permissions: { admin: true },
        verified: true,
      },
      {
        id: 'usr_comercial',
        name: 'Mariana Atendimento',
        email: 'mariana@laletra.com',
        role_slug: 'comercial',
        is_active: true,
        emailVisibility: false,
        phone: '11988887777',
        passwordHash: 'hash_original_mariana',
        custom_permissions: { attendance_view: true },
        verified: true,
      },
      {
        id: 'usr_producao',
        name: 'Carlos Produção',
        email: 'carlos@laletra.com',
        role_slug: 'producao',
        is_active: true,
        emailVisibility: true, // Já estava true
        phone: '',
        passwordHash: 'hash_original_carlos',
        custom_permissions: { production_view: true },
        verified: true,
      },
      {
        id: 'usr_inativo',
        name: 'Vendedor Antigo',
        email: 'antigo@laletra.com',
        role_slug: 'comercial',
        is_active: false,
        emailVisibility: false,
        phone: '',
        passwordHash: 'hash_original_antigo',
        custom_permissions: {},
        verified: false,
      },
    ]
  })

  it('exige autenticação: rejeita requisições anônimas com 401', () => {
    const res = ctx.executeFixEmailVisibilityHook(null)
    expect(res.status).toBe(401)
    expect(res.data.success).toBe(false)
    expect(res.data.error).toBe('Autenticação necessária.')
  })

  it('rejeita usuário inativo com 403', () => {
    const res = ctx.executeFixEmailVisibilityHook({
      id: 'usr_inativo',
      role_slug: 'admin',
      is_active: false,
    })
    expect(res.status).toBe(403)
    expect(res.data.success).toBe(false)
    expect(res.data.error).toBe('Usuário inativo.')
  })

  it('rejeita usuário sem role_slug === admin com 403', () => {
    const res = ctx.executeFixEmailVisibilityHook({
      id: 'usr_comercial',
      role_slug: 'comercial',
      is_active: true,
    })
    expect(res.status).toBe(403)
    expect(res.data.success).toBe(false)
    expect(res.data.error).toContain('apenas administradores podem executar')
  })

  it('atualiza SOMENTE emailVisibility de false para true sem alterar emails, senhas, telefones, roles ou permissões', () => {
    const adminUser = ctx.findUser('usr_admin')!
    const marianaUser = ctx.findUser('usr_comercial')!

    const originalEmail = marianaUser.email
    const originalPhone = marianaUser.phone
    const originalHash = marianaUser.passwordHash
    const originalRole = marianaUser.role_slug
    const originalPerms = { ...marianaUser.custom_permissions }
    const originalVerified = marianaUser.verified

    const res = ctx.executeFixEmailVisibilityHook(adminUser)

    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    expect(res.data.updated_count).toBe(3) // admin, comercial, inativo
    expect(res.data.already_visible).toBe(1) // producao
    expect(res.data.failed_count).toBe(0)
    expect(res.data.total_users).toBe(4)

    // Verifica que mariana agora tem emailVisibility = true
    expect(marianaUser.emailVisibility).toBe(true)

    // Verifica que ABSOLUTAMENTE NENHUM outro campo foi alterado
    expect(marianaUser.email).toBe(originalEmail)
    expect(marianaUser.phone).toBe(originalPhone)
    expect(marianaUser.passwordHash).toBe(originalHash)
    expect(marianaUser.role_slug).toBe(originalRole)
    expect(marianaUser.custom_permissions).toEqual(originalPerms)
    expect(marianaUser.verified).toBe(originalVerified)
    expect(marianaUser.is_active).toBe(true)

    // Telefone vazio continua vazio
    expect(adminUser.phone).toBe('')
    expect(adminUser.emailVisibility).toBe(true)
  })

  it('é estritamente idempotente: registros já true não são alterados em execuções subsequentes', () => {
    const adminUser = ctx.findUser('usr_admin')!

    // Primeira execução: 3 atualizados, 1 já visível
    const firstRun = ctx.executeFixEmailVisibilityHook(adminUser)
    expect(firstRun.data.updated_count).toBe(3)
    expect(firstRun.data.already_visible).toBe(1)

    // Segunda execução: 0 atualizados, 4 já visíveis
    const secondRun = ctx.executeFixEmailVisibilityHook(adminUser)
    expect(secondRun.data.updated_count).toBe(0)
    expect(secondRun.data.already_visible).toBe(4)
    expect(secondRun.data.failed_count).toBe(0)
  })

  it('registra log de auditoria ao atualizar registros', () => {
    const adminUser = ctx.findUser('usr_admin')!
    ctx.executeFixEmailVisibilityHook(adminUser)

    expect(ctx.auditLogs.length).toBe(1)
    const log = ctx.auditLogs[0]
    expect(log.action).toBe('fix_users_email_visibility')
    expect(log.module).toBe('users')
    expect(log.user_id).toBe(adminUser.id)
    expect(log.details).toContain('Visibilidade de e-mail atualizada para 3 usuário(s)')
  })
})
