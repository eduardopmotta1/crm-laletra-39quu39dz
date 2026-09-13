import pb from '@/lib/pocketbase/client'

export interface BackupItem {
  key: string
  size: number
  modified: string
  status: 'ready' | 'generating' | 'error'
}

export interface BackupListResponse {
  success: boolean
  items: BackupItem[]
  source?: string
  error?: string
}

export interface BackupCreateResponse {
  success: boolean
  backup?: BackupItem
  error?: string
}

export const backupService = {
  /**
   * Lista todos os backups nativos existentes do PocketBase.
   * Endpoint protegido exclusivamente para administradores.
   */
  async listBackups(): Promise<BackupItem[]> {
    const res = await pb.send<BackupListResponse>('/backend/v1/crm/admin/backups', {
      method: 'GET',
    })
    return res.items || []
  },

  /**
   * Solicita ao backend a criação de um backup nativo completo do PocketBase (snapshot do pb_data).
   */
  async createBackup(): Promise<BackupItem> {
    const res = await pb.send<BackupCreateResponse>('/backend/v1/crm/admin/backups', {
      method: 'POST',
    })
    if (!res.success || !res.backup) {
      throw new Error(res.error || 'Falha ao gerar backup nativo.')
    }
    return res.backup
  },

  /**
   * Realiza o download autenticado do arquivo ZIP original gerado pelo sistema nativo.
   * Transfere o arquivo binário diretamente ao navegador com nome original.
   */
  async downloadBackup(key: string): Promise<void> {
    const url = `${pb.baseUrl}/backend/v1/crm/admin/backups/${encodeURIComponent(key)}`
    const token = pb.authStore.token

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    })

    if (!response.ok) {
      let errMsg = `Falha ao baixar backup (HTTP ${response.status})`
      try {
        const errJson = await response.json()
        if (errJson?.error) errMsg = errJson.error
      } catch {
        /* intentionally ignored */
      }
      throw new Error(errMsg)
    }

    const blob = await response.blob()
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = key
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)
  },

  /**
   * Formata bytes em formato legível (KB, MB, GB).
   */
  formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  },
}
