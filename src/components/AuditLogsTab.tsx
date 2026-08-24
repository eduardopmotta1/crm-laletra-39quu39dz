import React, { useState, useEffect } from 'react'
import {
  ShieldAlert,
  Search,
  Filter,
  Download,
  Calendar,
  User,
  Clock,
  Layers,
  FileText,
  Activity,
  ArrowRight,
  Eye,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { auditLogsService, usersAdminService } from '@/services/rolesPermissions'
import type { AuditLog, User as CRMUser } from '@/types/crm'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

export default function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [users, setUsers] = useState<CRMUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedModule, setSelectedModule] = useState('all')
  const [selectedUserId, setSelectedUserId] = useState('all')
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLog | null>(null)

  useEffect(() => {
    loadAuditData()
  }, [selectedModule, selectedUserId])

  const loadAuditData = async () => {
    setLoading(true)
    try {
      const [logsRes, usersList] = await Promise.all([
        auditLogsService.getAll({
          module: selectedModule,
          userId: selectedUserId,
          limit: 100,
        }),
        usersAdminService.getAll(),
      ])
      setLogs(logsRes.items)
      setUsers(usersList)
    } catch (err) {
      console.error('Error fetching audit logs:', err)
      toast({
        title: 'Erro ao carregar logs de auditoria',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const formatTimestamp = (ts?: string) => {
    if (!ts) return '-'
    const d = new Date(ts)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getActionBadge = (action: string) => {
    const act = action.toLowerCase()
    if (act.includes('login')) {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
          🔑 Login
        </Badge>
      )
    }
    if (act.includes('delete') || act.includes('deactivat')) {
      return (
        <Badge variant="destructive" className="text-[10px]">
          🗑️ Exclusão / Desativação
        </Badge>
      )
    }
    if (act.includes('stage') || act.includes('kanban')) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px]">
          🔄 Mudança de Etapa
        </Badge>
      )
    }
    if (act.includes('quote') || act.includes('discount')) {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
          💰 Orçamento / Desconto
        </Badge>
      )
    }
    if (act.includes('order')) {
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-[10px]">
          📦 Produção / Pedido
        </Badge>
      )
    }
    if (act.includes('permission') || act.includes('role')) {
      return (
        <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px]">
          🛡️ Permissões & Segurança
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="text-[10px]">
        📝 {action}
      </Badge>
    )
  }

  const filteredLogs = logs.filter((log) => {
    const q = searchTerm.toLowerCase()
    return (
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.user_name && log.user_name.toLowerCase().includes(q)) ||
      (log.record_title && log.record_title.toLowerCase().includes(q)) ||
      (log.details && log.details.toLowerCase().includes(q))
    )
  })

  const exportAuditCSV = () => {
    try {
      const headers = [
        'Data/Hora',
        'Usuário',
        'Ação',
        'Módulo',
        'Registro Afetado',
        'Detalhes',
        'IP',
      ]
      const rows = filteredLogs.map((l) => [
        `"${formatTimestamp(l.created)}"`,
        `"${l.user_name || l.user_email || 'Sistema'}"`,
        `"${l.action}"`,
        `"${l.module || '-'}"`,
        `"${(l.record_title || l.record_id || '-').replace(/"/g, '""')}"`,
        `"${(l.details || '-').replace(/"/g, '""')}"`,
        `"${l.ip_address || '-'}"`,
      ])

      const csvContent =
        'data:text/csv;charset=utf-8,\uFEFF' +
        [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement('a')
      link.setAttribute('href', encodedUri)
      link.setAttribute(
        'download',
        `audit_logs_crm_laletra_${new Date().toISOString().slice(0, 10)}.csv`,
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast({
        title: 'Exportação concluída!',
        description: 'Planilha de auditoria gerada com sucesso.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao exportar',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-600" />
            Trilha de Auditoria & Histórico de Atividades
          </h2>
          <p className="text-xs text-slate-500">
            Registro detalhado e imutável de todas as ações no sistema: logins, descontos,
            orçamentos, mudanças de prazos, alterações de permissões e atendimentos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAuditData}
            disabled={loading}
            className="text-xs h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={exportAuditCSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por usuário, ação ou registro afetado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div>
          <Select value={selectedModule} onValueChange={setSelectedModule}>
            <SelectTrigger className="text-xs h-9">
              <SelectValue placeholder="Filtrar por Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Todos os Módulos
              </SelectItem>
              <SelectItem value="clients" className="text-xs">
                Clientes
              </SelectItem>
              <SelectItem value="attendance" className="text-xs">
                Atendimento & Funil
              </SelectItem>
              <SelectItem value="whatsapp" className="text-xs">
                WhatsApp API
              </SelectItem>
              <SelectItem value="quotes" className="text-xs">
                Orçamentos & Vendas
              </SelectItem>
              <SelectItem value="production" className="text-xs">
                Produção Gráfica
              </SelectItem>
              <SelectItem value="financial" className="text-xs">
                Financeiro
              </SelectItem>
              <SelectItem value="postsale" className="text-xs">
                Pós-Venda
              </SelectItem>
              <SelectItem value="users" className="text-xs">
                Usuários & Permissões
              </SelectItem>
              <SelectItem value="settings" className="text-xs">
                Configurações
              </SelectItem>
              <SelectItem value="auth" className="text-xs">
                Autenticação (Login/Logout)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="text-xs h-9">
              <SelectValue placeholder="Filtrar por Colaborador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Todos os Colaboradores
              </SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id} className="text-xs">
                  {u.name} ({u.role_slug || 'Comercial'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Logs Table */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Data e Horário</th>
                <th className="py-3 px-4">Colaborador</th>
                <th className="py-3 px-4">Ação Realizada</th>
                <th className="py-3 px-4">Módulo</th>
                <th className="py-3 px-4">Registro Afetado</th>
                <th className="py-3 px-4">Detalhes</th>
                <th className="py-3 px-4 text-right">Comparativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    Nenhum registro de auditoria encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatTimestamp(log.created)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {log.user_name || 'Sistema / Webhook'}
                      </div>
                      {log.user_email && (
                        <div className="text-[10px] text-slate-400">{log.user_email}</div>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">{getActionBadge(log.action)}</td>

                    <td className="py-3 px-4 uppercase text-[10px] font-semibold text-slate-500">
                      {log.module || '-'}
                    </td>

                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 max-w-[200px] truncate">
                      {log.record_title || log.record_id || '-'}
                    </td>

                    <td
                      className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-[250px] truncate"
                      title={log.details}
                    >
                      {log.details || '-'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {(log.previous_value || log.new_value) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedLogForDetails(log)}
                          className="h-7 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Ver Diff
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Diff Inspector Modal */}
      <Dialog open={!!selectedLogForDetails} onOpenChange={() => setSelectedLogForDetails(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-emerald-600" />
              Auditoria: {selectedLogForDetails?.action}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Detalhes da transação executada por{' '}
              <strong>{selectedLogForDetails?.user_name}</strong> em{' '}
              {formatTimestamp(selectedLogForDetails?.created)}.
            </DialogDescription>
          </DialogHeader>

          {selectedLogForDetails && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border space-y-1">
                <div>
                  <span className="text-slate-500">Registro Afetado: </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedLogForDetails.record_title || selectedLogForDetails.record_id}
                  </span>
                </div>
                {selectedLogForDetails.details && (
                  <div>
                    <span className="text-slate-500">Resumo: </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {selectedLogForDetails.details}
                    </span>
                  </div>
                )}
                {selectedLogForDetails.ip_address && (
                  <div>
                    <span className="text-slate-500">IP de Origem: </span>
                    <span className="font-mono text-slate-600">
                      {selectedLogForDetails.ip_address}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Valor Anterior:
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-60 border border-slate-800">
                    {selectedLogForDetails.previous_value
                      ? JSON.stringify(selectedLogForDetails.previous_value, null, 2)
                      : 'Nenhum valor anterior (Criação inicial)'}
                  </pre>
                </div>

                <div className="space-y-1">
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Novo Valor Persistido:
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-60 border border-slate-800">
                    {selectedLogForDetails.new_value
                      ? JSON.stringify(selectedLogForDetails.new_value, null, 2)
                      : 'Sem registro de novo valor'}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
