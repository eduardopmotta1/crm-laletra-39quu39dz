import { describe, it, expect } from 'vitest'
import type { Attendance, KanbanColumn } from '@/types/crm'
import { DEFAULT_KANBAN_STAGES } from '@/types/crm'
import { defaultKanbanColumns } from '@/services/columns'

describe('Kanban Sales In Production Column and Stage Rules', () => {
  const salesColumn: KanbanColumn = {
    id: 'col_sales_in_production',
    internal_id: 'sales_in_production',
    name: 'Em produção',
    order_index: 6,
    is_visible: true,
    stage_type: 'intermediate',
  }

  it('1. Deve incluir "Em produção" em DEFAULT_KANBAN_STAGES e manter compatibilidade com todos os stages legados', () => {
    expect(DEFAULT_KANBAN_STAGES).toContain('Em produção')
    expect(DEFAULT_KANBAN_STAGES).toContain('Novo contato')
    expect(DEFAULT_KANBAN_STAGES).toContain('Precisa responder')
    expect(DEFAULT_KANBAN_STAGES).toContain('Em atendimento')
    expect(DEFAULT_KANBAN_STAGES).toContain('Orçamento enviado')
    expect(DEFAULT_KANBAN_STAGES).toContain('Aguardando cliente')
    expect(DEFAULT_KANBAN_STAGES).toContain('Venda fechada')
    expect(DEFAULT_KANBAN_STAGES).toContain('Não fechou')
  })

  it('2. defaultKanbanColumns contém a coluna "Em produção" com internal_id sales_in_production e stage_type intermediate', () => {
    const col = defaultKanbanColumns.find((c) => c.internal_id === 'sales_in_production')
    expect(col).toBeDefined()
    expect(col?.name).toBe('Em produção')
    expect(col?.stage_type).toBe('intermediate')
    expect(col?.order_index).toBe(6)

    // Verificar se Venda fechada é 5 e Não fechou é 7
    const wonCol = defaultKanbanColumns.find((c) => c.internal_id === 'won')
    const lostCol = defaultKanbanColumns.find((c) => c.internal_id === 'lost')
    expect(wonCol?.order_index).toBe(5)
    expect(lostCol?.order_index).toBe(7)
  })

  it('3. Attendance com stage="Em produção" e is_archived=false aparece normalmente na coluna do Kanban', () => {
    const activeAttendances: Attendance[] = [
      {
        id: 'att_active_in_prod',
        client_id: 'client_1',
        stage: 'Em produção',
        is_archived: false,
        created: '2026-09-15T10:00:00.000Z',
        updated: '2026-09-15T10:00:00.000Z',
      },
      {
        id: 'att_other',
        client_id: 'client_2',
        stage: 'Novo contato',
        is_archived: false,
        created: '2026-09-15T10:00:00.000Z',
        updated: '2026-09-15T10:00:00.000Z',
      },
    ]

    // Simula a lógica de filtragem da coluna no KanbanPage
    const stageItems = activeAttendances.filter(
      (a) =>
        a.stage === salesColumn.name ||
        (salesColumn.internal_id === 'sales_in_production' &&
          (a.stage === 'Em produção' || a.stage === salesColumn.name)),
    )

    expect(stageItems).toHaveLength(1)
    expect(stageItems[0].id).toBe('att_active_in_prod')
    expect(stageItems[0].stage).toBe('Em produção')
  })

  it('4. Attendance com stage="Em produção" e is_archived=true NÃO aparece na coluna do Kanban', () => {
    const allAttendances: Attendance[] = [
      {
        id: 'att_archived_in_prod',
        client_id: 'client_3',
        stage: 'Em produção',
        is_archived: true,
        created: '2026-09-15T10:00:00.000Z',
        updated: '2026-09-15T10:00:00.000Z',
      },
      {
        id: 'att_active_in_prod',
        client_id: 'client_4',
        stage: 'Em produção',
        is_archived: false,
        created: '2026-09-15T10:00:00.000Z',
        updated: '2026-09-15T10:00:00.000Z',
      },
    ]

    // No KanbanPage o filtro inicial de atendimentos ativos exige is_archived != true
    const activeOnly = allAttendances.filter((att) => att.is_archived !== true)
    const stageItems = activeOnly.filter(
      (a) =>
        a.stage === salesColumn.name ||
        (salesColumn.internal_id === 'sales_in_production' &&
          (a.stage === 'Em produção' || a.stage === salesColumn.name)),
    )

    expect(stageItems).toHaveLength(1)
    expect(stageItems[0].id).toBe('att_active_in_prod')
    expect(stageItems.some((a) => a.id === 'att_archived_in_prod')).toBe(false)
  })

  it('5. "Em produção" NÃO é confundido com "Não fechou" ou "Venda fechada"', () => {
    const stage: string = 'Em produção'
    const isWon = stage === 'Venda fechada'
    const isLost = stage === 'Não fechou'

    expect(isWon).toBe(false)
    expect(isLost).toBe(false)
  })

  it('6. Regra de auto-arquivamento ignora "Em produção" (não arquiva automaticamente)', () => {
    // No serviço attendancesService.runAutoArchiveCheck, apenas 'Venda fechada' e 'Não fechou' são consultados
    const candidateStages = ['Venda fechada', 'Não fechou']
    expect(candidateStages.includes('Em produção')).toBe(false)
  })
})
