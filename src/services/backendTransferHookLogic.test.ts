import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Simulação e testes da lógica de negócio do endpoint backend
 * POST /backend/v1/crm/transfer-user-workload
 */

interface MockUser {
  id: string
  name: string
  email: string
  role_slug: string
  is_active: boolean
}

interface MockRecord {
  id: string
  [key: string]: any
}

class MockPocketBaseContext {
  users: MockUser[] = []
  clients: MockRecord[] = []
  tasks: MockRecord[] = []
  attendances: MockRecord[] = []
  production_orders: MockRecord[] = []
  pending_resolutions: MockRecord[] = []
  procedure_executions: MockRecord[] = []
  messages: MockRecord[] = []
  quotes: MockRecord[] = []
  archived_deals: MockRecord[] = []
  audit_logs: MockRecord[] = []

  findUser(id: string) {
    return this.users.find((u) => u.id === id) || null
  }

  executeTransferHook(
    auth: MockUser | null,
    body: {
      from_user_id?: string
      source_user_id?: string
      to_user_id?: string
      target_user_id?: string
      deactivate_from_user?: boolean
      deactivateFromUser?: boolean
    },
    remoteIP = '127.0.0.1',
  ) {
    // 1. Autorização
    if (!auth) {
      return { status: 401, data: { success: false, error: 'Autenticação necessária.' } }
    }
    if (auth.is_active === false) {
      return { status: 403, data: { success: false, error: 'Usuário inativo.' } }
    }
    if (auth.role_slug !== 'admin') {
      return {
        status: 403,
        data: {
          success: false,
          error:
            'Acesso restrito: apenas administradores podem transferir carteira ou desativar colaboradores.',
        },
      }
    }

    // 2. Body parsing
    const fromUserId = String(body.from_user_id || body.source_user_id || '').trim()
    const toUserId = String(body.to_user_id || body.target_user_id || '').trim()
    const deactivateFromUser =
      body.deactivate_from_user !== false && body.deactivateFromUser !== false

    if (!fromUserId) {
      return {
        status: 400,
        data: {
          success: false,
          error: 'Identificador do usuário de origem (from_user_id) não informado.',
        },
      }
    }

    // 3. Validar source
    const sourceUser = this.findUser(fromUserId)
    if (!sourceUser) {
      return { status: 404, data: { success: false, error: 'Usuário de origem não encontrado.' } }
    }

    if (toUserId && fromUserId === toUserId) {
      return {
        status: 400,
        data: {
          success: false,
          error: 'O usuário de destino não pode ser o mesmo usuário de origem.',
        },
      }
    }

    if (deactivateFromUser && fromUserId === auth.id) {
      return {
        status: 400,
        data: { success: false, error: 'Você não pode desativar seu próprio usuário conectado.' },
      }
    }

    if (deactivateFromUser && sourceUser.role_slug === 'admin') {
      const otherActiveAdmins = this.users.filter(
        (u) => u.role_slug === 'admin' && u.is_active && u.id !== fromUserId,
      )
      if (otherActiveAdmins.length === 0) {
        return {
          status: 400,
          data: {
            success: false,
            error: 'Operação cancelada: o sistema precisa manter ao menos um administrador ativo.',
          },
        }
      }
    }

    // 4. Validar target
    let targetUser: MockUser | null = null
    if (toUserId) {
      targetUser = this.findUser(toUserId)
      if (!targetUser) {
        return {
          status: 404,
          data: { success: false, error: 'Usuário de destino não encontrado.' },
        }
      }
      if (targetUser.is_active === false) {
        return {
          status: 400,
          data: {
            success: false,
            error: 'O usuário de destino está inativo e não pode receber atendimentos ou tarefas.',
          },
        }
      }
    }

    // 5. Sem destino
    if (!toUserId) {
      const openClients = this.clients.filter((c) => c.assigned_to === fromUserId && !c.is_archived)
      const openTasks = this.tasks.filter(
        (t) => t.assigned_to === fromUserId && t.status !== 'concluida' && t.status !== 'cancelada',
      )
      const openAttendances = this.attendances.filter(
        (a) => a.assigned_to === fromUserId && !a.is_archived,
      )
      const openOrders = this.production_orders.filter(
        (o) =>
          (o.sales_rep_id === fromUserId || o.production_rep_id === fromUserId) &&
          !o.is_completed &&
          !o.is_archived,
      )
      const openPendingRes = this.pending_resolutions.filter(
        (p) => p.assigned_to === fromUserId && !p.resolved_at,
      )

      const hasOpen =
        openClients.length > 0 ||
        openTasks.length > 0 ||
        openAttendances.length > 0 ||
        openOrders.length > 0 ||
        openPendingRes.length > 0

      if (hasOpen) {
        return {
          status: 400,
          data: {
            success: false,
            error:
              'O colaborador possui atendimentos, pedidos ou tarefas em aberto. Selecione um colaborador destino para transferir a carteira antes de desativar.',
          },
        }
      }

      if (deactivateFromUser) {
        sourceUser.is_active = false
        this.audit_logs.push({
          id: 'aud_' + Date.now(),
          user_id: auth.id,
          action: 'user_deactivate',
          module: 'users',
          record_id: fromUserId,
          details:
            'Usuário desativado sem necessidade de transferência (nenhuma responsabilidade ativa aberta).',
          ip_address: remoteIP,
        })
        return {
          status: 200,
          data: {
            success: true,
            transferred_clients: 0,
            transferred_tasks: 0,
            transferred_orders: 0,
            transferred_attendances: 0,
            transferred_pending_resolutions: 0,
            deactivated: true,
            message: 'Usuário desativado com sucesso (sem registros abertos para transferir).',
          },
        }
      }

      return {
        status: 200,
        data: {
          success: true,
          transferred_clients: 0,
          transferred_tasks: 0,
          transferred_orders: 0,
          transferred_attendances: 0,
          transferred_pending_resolutions: 0,
          deactivated: false,
        },
      }
    }

    // 6. Transferência atômica
    let countClients = 0
    let countTasks = 0
    let countOrders = 0
    let countAttendances = 0
    let countPending = 0
    let countProcedures = 0

    // 6.1 Clients
    this.clients.forEach((c) => {
      if (c.assigned_to === fromUserId && !c.is_archived) {
        c.assigned_to = toUserId
        countClients++
      }
    })

    // 6.2 Tasks
    this.tasks.forEach((t) => {
      if (t.assigned_to === fromUserId && t.status !== 'concluida' && t.status !== 'cancelada') {
        t.assigned_to = toUserId
        countTasks++
      }
    })

    // 6.3 Attendances
    this.attendances.forEach((a) => {
      if (a.assigned_to === fromUserId && !a.is_archived) {
        a.assigned_to = toUserId
        countAttendances++
      }
    })

    // 6.4 Production Orders
    this.production_orders.forEach((o) => {
      if (!o.is_completed && !o.is_archived) {
        let changed = false
        if (o.sales_rep_id === fromUserId) {
          o.sales_rep_id = toUserId
          changed = true
        }
        if (o.production_rep_id === fromUserId) {
          o.production_rep_id = toUserId
          changed = true
        }
        if (changed) countOrders++
      }
    })

    // 6.5 Pending Resolutions
    this.pending_resolutions.forEach((p) => {
      if (p.assigned_to === fromUserId && !p.resolved_at) {
        p.assigned_to = toUserId
        p.assigned_name = targetUser?.name || ''
        countPending++
      }
    })

    // 6.6 Procedure Executions
    this.procedure_executions.forEach((pe) => {
      if (pe.assigned_to_user_id === fromUserId && pe.status === 'Pendente') {
        pe.assigned_to_user_id = toUserId
        countProcedures++
      }
    })

    // 6.7 Desativação
    if (deactivateFromUser) {
      sourceUser.is_active = false
    }

    // 6.8 Auditoria
    this.audit_logs.push({
      id: 'aud_' + Date.now(),
      user_id: auth.id,
      action: 'user_workload_transfer',
      module: 'users',
      record_id: fromUserId,
      details: `Transferência de carteira concluída com sucesso. Destino: ${targetUser?.name}. Clientes: ${countClients}, Tarefas: ${countTasks}, Pedidos: ${countOrders}, Atendimentos: ${countAttendances}, Pendências: ${countPending}. Origem desativado: ${deactivateFromUser ? 'SIM' : 'NÃO'}.`,
      ip_address: remoteIP,
    })

    return {
      status: 200,
      data: {
        success: true,
        transferred_clients: countClients,
        transferred_tasks: countTasks,
        transferred_orders: countOrders,
        transferred_attendances: countAttendances,
        transferred_pending_resolutions: countPending,
        transferred_procedures: countProcedures,
        deactivated: deactivateFromUser,
        message: 'Carteira transferida e colaborador desativado com sucesso.',
      },
    }
  }
}

describe('Backend Hook /backend/v1/crm/transfer-user-workload (Mock Unit & Integration)', () => {
  let ctx: MockPocketBaseContext

  beforeEach(() => {
    ctx = new MockPocketBaseContext()

    ctx.users = [
      {
        id: 'usr_admin_1',
        name: 'Admin Principal',
        email: 'admin@laletra.com',
        role_slug: 'admin',
        is_active: true,
      },
      {
        id: 'usr_admin_2',
        name: 'Admin Secundario',
        email: 'admin2@laletra.com',
        role_slug: 'admin',
        is_active: true,
      },
      {
        id: 'usr_source',
        name: 'Vendedor Saindo',
        email: 'vendedor@laletra.com',
        role_slug: 'comercial',
        is_active: true,
      },
      {
        id: 'usr_target',
        name: 'Vendedor Novo',
        email: 'novo@laletra.com',
        role_slug: 'comercial',
        is_active: true,
      },
      {
        id: 'usr_inactive_target',
        name: 'Vendedor Inativo',
        email: 'inativo@laletra.com',
        role_slug: 'comercial',
        is_active: false,
      },
    ]

    // Dados abertos associados a usr_source
    ctx.clients = [
      { id: 'cli_1', name: 'Cliente Ativo 1', assigned_to: 'usr_source', is_archived: false },
      { id: 'cli_2', name: 'Cliente Ativo 2', assigned_to: 'usr_source', is_archived: false },
      {
        id: 'cli_archived',
        name: 'Cliente Arquivado',
        assigned_to: 'usr_source',
        is_archived: true,
      },
    ]

    ctx.tasks = [
      { id: 'tsk_1', title: 'Ligar para cliente', assigned_to: 'usr_source', status: 'pendente' },
      {
        id: 'tsk_done',
        title: 'Tarefa antiga feita',
        assigned_to: 'usr_source',
        status: 'concluida',
      },
      {
        id: 'tsk_cancelled',
        title: 'Tarefa cancelada',
        assigned_to: 'usr_source',
        status: 'cancelada',
      },
    ]

    ctx.attendances = [
      { id: 'att_1', assigned_to: 'usr_source', is_archived: false, stage: 'Em atendimento' },
      { id: 'att_archived', assigned_to: 'usr_source', is_archived: true, stage: 'Venda fechada' },
    ]

    ctx.production_orders = [
      {
        id: 'ord_1',
        order_number: '#1001',
        sales_rep_id: 'usr_source',
        production_rep_id: '',
        is_completed: false,
        is_archived: false,
      },
      {
        id: 'ord_2',
        order_number: '#1002',
        sales_rep_id: '',
        production_rep_id: 'usr_source',
        is_completed: false,
        is_archived: false,
      },
      {
        id: 'ord_done',
        order_number: '#999',
        sales_rep_id: 'usr_source',
        production_rep_id: '',
        is_completed: true,
        is_archived: false,
      },
    ]

    ctx.pending_resolutions = [
      {
        id: 'pen_1',
        assigned_to: 'usr_source',
        assigned_name: 'Vendedor Saindo',
        resolved_at: null,
      },
      {
        id: 'pen_done',
        assigned_to: 'usr_source',
        assigned_name: 'Vendedor Saindo',
        resolved_at: '2026-09-10',
      },
    ]

    ctx.procedure_executions = [
      { id: 'pe_1', assigned_to_user_id: 'usr_source', status: 'Pendente' },
      { id: 'pe_done', assigned_to_user_id: 'usr_source', status: 'Concluído' },
    ]

    // Histórico intocado
    ctx.messages = [{ id: 'msg_1', sent_by_user: 'usr_source', message_text: 'Olá tudo bem' }]
    ctx.quotes = [{ id: 'q_1', user_id: 'usr_source', code: 'ORC-001' }]
    ctx.archived_deals = [{ id: 'ad_1', closed_by: 'usr_source', result: 'Venda fechada' }]
  })

  it('exige autenticação para acessar o endpoint', () => {
    const res = ctx.executeTransferHook(null, {
      from_user_id: 'usr_source',
      to_user_id: 'usr_target',
    })
    expect(res.status).toBe(401)
    expect(res.data.error).toBe('Autenticação necessária.')
  })

  it('bloqueia usuário inativo', () => {
    const inactiveAdmin = { ...ctx.users[0], is_active: false }
    const res = ctx.executeTransferHook(inactiveAdmin, {
      from_user_id: 'usr_source',
      to_user_id: 'usr_target',
    })
    expect(res.status).toBe(403)
    expect(res.data.error).toBe('Usuário inativo.')
  })

  it('bloqueia usuário não-admin', () => {
    const regularUser = ctx.users[2] // comercial
    const res = ctx.executeTransferHook(regularUser, {
      from_user_id: 'usr_source',
      to_user_id: 'usr_target',
    })
    expect(res.status).toBe(403)
    expect(res.data.error).toContain('apenas administradores')
  })

  it('rejeita quando source == target', () => {
    const admin = ctx.users[0]
    const res = ctx.executeTransferHook(admin, {
      from_user_id: 'usr_source',
      to_user_id: 'usr_source',
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toContain('não pode ser o mesmo usuário')
  })

  it('rejeita quando usuário de origem não existe', () => {
    const admin = ctx.users[0]
    const res = ctx.executeTransferHook(admin, {
      from_user_id: 'usr_non_existent',
      to_user_id: 'usr_target',
    })
    expect(res.status).toBe(404)
    expect(res.data.error).toContain('Usuário de origem não encontrado')
  })

  it('rejeita quando target está inativo', () => {
    const admin = ctx.users[0]
    const res = ctx.executeTransferHook(admin, {
      from_user_id: 'usr_source',
      to_user_id: 'usr_inactive_target',
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toContain('está inativo e não pode receber atendimentos')
  })

  it('rejeita desativar o próprio usuário conectado', () => {
    const admin = ctx.users[0]
    const res = ctx.executeTransferHook(admin, {
      from_user_id: admin.id,
      to_user_id: 'usr_target',
      deactivate_from_user: true,
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toContain('não pode desativar seu próprio usuário')
  })

  it('impede desativar o único admin restante', () => {
    // Manter apenas um admin ativo
    ctx.users = ctx.users.filter((u) => u.id !== 'usr_admin_2')
    const callerAdmin = { ...ctx.users[0], id: 'temp_caller', role_slug: 'admin', is_active: true }
    const soleAdmin = ctx.users[0]

    const res = ctx.executeTransferHook(callerAdmin, {
      from_user_id: soleAdmin.id,
      to_user_id: 'usr_target',
      deactivate_from_user: true,
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toContain('precisa manter ao menos um administrador ativo')
  })

  it('bloqueia desativação sem target quando há responsabilidades abertas', () => {
    const admin = ctx.users[0]
    const res = ctx.executeTransferHook(admin, {
      from_user_id: 'usr_source',
      to_user_id: '',
      deactivate_from_user: true,
    })
    expect(res.status).toBe(400)
    expect(res.data.error).toContain('Selecione um colaborador destino para transferir a carteira')
  })

  it('permite desativação sem target quando o usuário não possui pendências abertas', () => {
    const admin = ctx.users[0]
    // Criar um usuário sem nada atribuído
    ctx.users.push({
      id: 'usr_clean',
      name: 'Usuário Sem Tarefas',
      email: 'clean@laletra.com',
      role_slug: 'comercial',
      is_active: true,
    })
    const res = ctx.executeTransferHook(admin, {
      from_user_id: 'usr_clean',
      to_user_id: '',
      deactivate_from_user: true,
    })

    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    expect(res.data.deactivated).toBe(true)

    const user = ctx.findUser('usr_clean')
    expect(user?.is_active).toBe(false)
  })

  it('transfere com sucesso todas as responsabilidades abertas, preserva histórico e marca is_active=false', () => {
    const admin = ctx.users[0]
    const res = ctx.executeTransferHook(admin, {
      from_user_id: 'usr_source',
      to_user_id: 'usr_target',
      deactivate_from_user: true,
    })

    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    expect(res.data.transferred_clients).toBe(2) // 2 ativos (cli_archived não transferido)
    expect(res.data.transferred_tasks).toBe(1) // 1 pendente (feita e cancelada não transferidas)
    expect(res.data.transferred_orders).toBe(2) // 2 ordens ativas (concluída não transferida)
    expect(res.data.transferred_attendances).toBe(1) // 1 ativo (arquivado não transferido)
    expect(res.data.transferred_pending_resolutions).toBe(1) // 1 não resolvida
    expect(res.data.transferred_procedures).toBe(1) // 1 execução pendente
    expect(res.data.deactivated).toBe(true)

    // Valida desativação do usuário de origem sem exclusão física
    const sourceUser = ctx.findUser('usr_source')
    expect(sourceUser).not.toBeNull()
    expect(sourceUser?.is_active).toBe(false)

    // Valida que clientes ativos foram transferidos para usr_target
    expect(ctx.clients.find((c) => c.id === 'cli_1')?.assigned_to).toBe('usr_target')
    expect(ctx.clients.find((c) => c.id === 'cli_2')?.assigned_to).toBe('usr_target')
    expect(ctx.clients.find((c) => c.id === 'cli_archived')?.assigned_to).toBe('usr_source') // intocado

    // Valida tasks
    expect(ctx.tasks.find((t) => t.id === 'tsk_1')?.assigned_to).toBe('usr_target')
    expect(ctx.tasks.find((t) => t.id === 'tsk_done')?.assigned_to).toBe('usr_source') // histórico

    // Valida attendances
    expect(ctx.attendances.find((a) => a.id === 'att_1')?.assigned_to).toBe('usr_target')
    expect(ctx.attendances.find((a) => a.id === 'att_archived')?.assigned_to).toBe('usr_source') // histórico

    // Valida production_orders
    expect(ctx.production_orders.find((o) => o.id === 'ord_1')?.sales_rep_id).toBe('usr_target')
    expect(ctx.production_orders.find((o) => o.id === 'ord_2')?.production_rep_id).toBe(
      'usr_target',
    )
    expect(ctx.production_orders.find((o) => o.id === 'ord_done')?.sales_rep_id).toBe('usr_source') // histórico

    // Valida pending_resolutions
    const pen1 = ctx.pending_resolutions.find((p) => p.id === 'pen_1')
    expect(pen1?.assigned_to).toBe('usr_target')
    expect(pen1?.assigned_name).toBe('Vendedor Novo')
    const penDone = ctx.pending_resolutions.find((p) => p.id === 'pen_done')
    expect(penDone?.assigned_to).toBe('usr_source') // histórico

    // Valida procedure_executions
    expect(ctx.procedure_executions.find((pe) => pe.id === 'pe_1')?.assigned_to_user_id).toBe(
      'usr_target',
    )
    expect(ctx.procedure_executions.find((pe) => pe.id === 'pe_done')?.assigned_to_user_id).toBe(
      'usr_source',
    )

    // CRÍTICO: Valida que autoria histórica NUNCA foi alterada
    expect(ctx.messages[0].sent_by_user).toBe('usr_source')
    expect(ctx.quotes[0].user_id).toBe('usr_source')
    expect(ctx.archived_deals[0].closed_by).toBe('usr_source')

    // Valida que o log de auditoria foi criado
    expect(ctx.audit_logs.length).toBe(1)
    expect(ctx.audit_logs[0].action).toBe('user_workload_transfer')
    expect(ctx.audit_logs[0].user_id).toBe(admin.id)
  })
})
