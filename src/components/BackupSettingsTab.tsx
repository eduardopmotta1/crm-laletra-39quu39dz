import { useState, useEffect, useCallback } from 'react'
import {
  Database,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileArchive,
  HardDrive,
  Calendar,
  Lock,
  ShieldCheck,
  Server,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from '@/hooks/use-toast'
import { backupService, type BackupItem } from '@/services/backup'
import { useAuth } from '@/context/AuthContext'

export default function BackupSettingsTab() {
  const { isAdmin } = useAuth()
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<BackupItem | null>(null)

  const fetchBackups = useCallback(async () => {
    if (!isAdmin) return
    try {
      setLoading(true)
      const items = await backupService.listBackups()
      setBackups(items)
    } catch (err: any) {
      console.error('Erro ao carregar backups:', err)
      toast({
        title: 'Erro ao carregar lista de backups',
        description: err?.message || 'Não foi possível buscar a lista de backups do servidor.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin) {
      fetchBackups()
    }
  }, [isAdmin, fetchBackups])

  const handleCreateBackup = async () => {
    if (!isAdmin || creating) return

    setCreating(true)
    try {
      toast({
        title: 'Gerando backup...',
        description:
          'O PocketBase está criando o snapshot ZIP completo do pb_data (banco de dados + uploads). Aguarde...',
      })

      const newBackup = await backupService.createBackup()
      setLastCreated(newBackup)

      toast({
        title: 'Backup concluído com sucesso!',
        description: `Arquivo ${newBackup.key} gerado (${backupService.formatBytes(newBackup.size)}).`,
      })

      // Atualiza lista
      await fetchBackups()
    } catch (err: any) {
      console.error('Erro ao gerar backup:', err)
      toast({
        title: 'Falha ao gerar backup',
        description: err?.message || 'Ocorreu um erro interno ao criar o arquivo de backup.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDownload = async (item: BackupItem) => {
    if (downloadingKey) return
    setDownloadingKey(item.key)
    try {
      toast({
        title: 'Iniciando download...',
        description: `Preparando transferência do arquivo ${item.key}.`,
      })
      await backupService.downloadBackup(item.key)
      toast({
        title: 'Download iniciado',
        description: `O arquivo ${item.key} foi baixado com sucesso.`,
      })
    } catch (err: any) {
      console.error('Erro ao baixar backup:', err)
      toast({
        title: 'Erro no download',
        description: err?.message || 'Não foi possível baixar o arquivo de backup.',
        variant: 'destructive',
      })
    } finally {
      setDownloadingKey(null)
    }
  }

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '-'
    try {
      const d = new Date(isoString)
      if (isNaN(d.getTime())) return isoString
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(d)
    } catch (_) {
      return isoString
    }
  }

  // Bloqueio explícito e seguro para usuários não-administradores
  if (!isAdmin) {
    return (
      <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/40 rounded-full text-amber-600 dark:text-amber-400">
              <Lock className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Acesso Restrito a Administradores
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md">
              A área de gestão de backups nativos do PocketBase contém snapshots completos do banco
              de dados e arquivos do sistema, sendo restrita exclusivamente para usuários com o
              perfil de Administrador do CRM.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Informações Gerais & Ação Principal */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg text-emerald-700 dark:text-emerald-400">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Backup Manual do PocketBase
                  <Badge
                    variant="outline"
                    className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950 border-emerald-300"
                  >
                    Nativo PocketBase
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Gere e baixe snapshots ZIP completos do diretório{' '}
                  <code className="font-mono text-emerald-600">pb_data</code> (banco de dados SQLite
                  + arquivos anexados).
                </CardDescription>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchBackups}
              disabled={loading || creating}
              className="text-xs h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleCreateBackup}
              disabled={creating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold shadow-sm"
            >
              {creating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Gerando backup...
                </>
              ) : (
                <>
                  <HardDrive className="h-4 w-4 mr-2" />
                  Gerar backup agora
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert className="bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <AlertTitle className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              Segurança & Integridade dos Dados
            </AlertTitle>
            <AlertDescription className="text-[11px] space-y-1">
              <p>
                • O backup utiliza exclusivamente o sistema nativo do PocketBase (
                <code className="font-mono">/api/backups</code>).
              </p>
              <p>
                • O arquivo gerado é um snapshot ZIP completo com o banco SQLite (
                <code className="font-mono">data.db</code>) e todos os anexos e arquivos da pasta{' '}
                <code className="font-mono">storage/</code>.
              </p>
              <p>
                • Todas as operações privilegiadas utilizam credenciais do servidor. Nenhuma
                credencial superuser é exposta ao navegador.
              </p>
            </AlertDescription>
          </Alert>

          {/* Último backup gerado nesta sessão */}
          {lastCreated && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Último backup gerado:{' '}
                    <span className="font-mono text-emerald-700 dark:text-emerald-400">
                      {lastCreated.key}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Tamanho: {backupService.formatBytes(lastCreated.size)} • Data:{' '}
                    {formatDateTime(lastCreated.modified)} • Status:{' '}
                    <span className="text-emerald-600 font-semibold uppercase">
                      {lastCreated.status}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(lastCreated)}
                disabled={downloadingKey === lastCreated.key}
                className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs h-8"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {downloadingKey === lastCreated.key ? 'Baixando...' : 'Baixar este backup'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Backups Armazenados */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-emerald-600" />
                Snapshots de Backup Disponíveis ({backups.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Arquivos ZIP originais armazenados no diretório seguro de backups do sistema.
              </CardDescription>
            </div>
            <div className="text-xs text-slate-500">
              Total ocupado:{' '}
              {backupService.formatBytes(backups.reduce((acc, b) => acc + (b.size || 0), 0))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {loading && backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-2 text-slate-500">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
              <p className="text-xs">Carregando lista de backups do servidor...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2 text-center">
              <Server className="h-8 w-8 text-slate-400" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nenhum backup encontrado no servidor
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm">
                Clique no botão "Gerar backup agora" acima para criar o primeiro snapshot ZIP nativo
                do seu banco de dados e arquivos.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Arquivo de Backup</th>
                    <th className="py-3 px-4">Data / Hora de Criação</th>
                    <th className="py-3 px-4">Tamanho</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {backups.map((item) => (
                    <tr
                      key={item.key}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <FileArchive className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="font-mono font-medium text-slate-900 dark:text-white">
                            {item.key}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{formatDateTime(item.modified)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {backupService.formatBytes(item.size)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 font-semibold"
                        >
                          ● Pronto
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownload(item)}
                          disabled={downloadingKey === item.key}
                          className="h-8 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                        >
                          {downloadingKey === item.key ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Baixando...
                            </>
                          ) : (
                            <>
                              <Download className="h-3.5 w-3.5 mr-1.5" />
                              Baixar backup
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
