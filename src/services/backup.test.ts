import { describe, it, expect, vi } from 'vitest'
import { backupService } from './backup'
import pb from '@/lib/pocketbase/client'

describe('backupService', () => {
  it('formata bytes corretamente', () => {
    expect(backupService.formatBytes(0)).toBe('0 Bytes')
    expect(backupService.formatBytes(1024)).toBe('1 KB')
    expect(backupService.formatBytes(1048576)).toBe('1 MB')
    expect(backupService.formatBytes(1073741824)).toBe('1 GB')
  })

  it('chama pb.send para listBackups', async () => {
    const mockBackups = [
      {
        key: 'pb_backup_20250101120000.zip',
        size: 2048,
        modified: '2025-01-01T12:00:00.000Z',
        status: 'ready',
      },
    ]
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      items: mockBackups,
    } as any)

    const result = await backupService.listBackups()
    expect(sendSpy).toHaveBeenCalledWith('/backend/v1/crm/admin/backups', { method: 'GET' })
    expect(result).toEqual(mockBackups)
  })

  it('chama pb.send para createBackup e retorna o novo item', async () => {
    const mockCreated = {
      key: 'pb_backup_20250101130000.zip',
      size: 4096,
      modified: '2025-01-01T13:00:00.000Z',
      status: 'ready',
    }
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      backup: mockCreated,
    } as any)

    const result = await backupService.createBackup()
    expect(sendSpy).toHaveBeenCalledWith('/backend/v1/crm/admin/backups', { method: 'POST' })
    expect(result).toEqual(mockCreated)
  })

  it('dispara exceção quando createBackup falha', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: false,
      error: 'Erro de permissão no servidor',
    } as any)

    await expect(backupService.createBackup()).rejects.toThrow('Erro de permissão no servidor')
  })
})
