import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { productionService } from './production'

describe('productionService Kanban Performance Optimizations', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getAllActiveForKanban requests only active orders with fields and light expand', async () => {
    const getFullListSpy = vi
      .spyOn(pb.collection('production_orders'), 'getFullList')
      .mockResolvedValueOnce([
        { id: 'ord_active_1', order_number: '#001863', is_archived: false } as any,
      ])

    const result = await productionService.getAllActiveForKanban('-created')

    expect(getFullListSpy).toHaveBeenCalledTimes(1)
    const callArgs = (getFullListSpy.mock.calls as any)[0]?.[0]
    expect(callArgs?.filter).toBe('is_archived != true')
    expect(callArgs?.sort).toBe('-created')
    expect(callArgs?.fields).toBe(productionService.KANBAN_FIELDS)
    expect(callArgs?.expand).toBe('sales_rep_id,production_rep_id')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ord_active_1')
  })

  it('getAllArchivedForList requests only archived orders with fields and light expand', async () => {
    const getFullListSpy = vi
      .spyOn(pb.collection('production_orders'), 'getFullList')
      .mockResolvedValueOnce([
        { id: 'ord_archived_1', order_number: '#001842', is_archived: true } as any,
      ])

    const result = await productionService.getAllArchivedForList('-created')

    expect(getFullListSpy).toHaveBeenCalledTimes(1)
    const callArgs = (getFullListSpy.mock.calls as any)[0]?.[0]
    expect(callArgs?.filter).toBe('is_archived = true')
    expect(callArgs?.sort).toBe('-created')
    expect(callArgs?.fields).toBe(productionService.KANBAN_FIELDS)
    expect(callArgs?.expand).toBe('sales_rep_id,production_rep_id')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ord_archived_1')
  })

  it('getForKanbanById fetches single order with Kanban fields and light expand', async () => {
    const getOneSpy = vi.spyOn(pb.collection('production_orders'), 'getOne').mockResolvedValueOnce({
      id: 'ord_123',
      order_number: '#001850',
      is_archived: false,
    } as any)

    const result = await productionService.getForKanbanById('ord_123')

    expect(getOneSpy).toHaveBeenCalledTimes(1)
    expect(getOneSpy).toHaveBeenCalledWith('ord_123', {
      fields: productionService.KANBAN_FIELDS,
      expand: 'sales_rep_id,production_rep_id',
      requestKey: null,
    })
    expect(result?.id).toBe('ord_123')
  })

  it('preserves existing getAll signature and behavior for other screens', async () => {
    const getFullListSpy = vi
      .spyOn(pb.collection('production_orders'), 'getFullList')
      .mockResolvedValueOnce([{ id: 'ord_legacy_1' } as any])

    const result = await productionService.getAll('stage_internal_id = "ready"')

    expect(getFullListSpy).toHaveBeenCalledTimes(1)
    const callArgs = (getFullListSpy.mock.calls as any)[0]?.[0]
    expect(callArgs?.filter).toBe('stage_internal_id = "ready"')
    expect(callArgs?.expand).toBe(
      'client_id,sales_rep_id,production_rep_id,stage_id,deal_origin_id,approved_proof_id',
    )
    expect(result).toHaveLength(1)
  })

  it('calculates deadline status accurately', () => {
    // Completed status
    const completedStatus = productionService.calculateDeadlineStatus('2026-09-01', true)
    expect(completedStatus.status).toBe('completed')

    // No date status
    const noDateStatus = productionService.calculateDeadlineStatus(undefined, false)
    expect(noDateStatus.status).toBe('no_date')

    // Past date (overdue)
    const overdueStatus = productionService.calculateDeadlineStatus('2020-01-01', false)
    expect(overdueStatus.status).toBe('overdue')
    expect(overdueStatus.daysRemaining).toBeLessThan(0)
  })
})
