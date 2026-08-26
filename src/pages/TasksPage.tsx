import React, { useState, useEffect } from 'react'
import {
  CheckSquare,
  Plus,
  Search,
  Clock,
  Calendar,
  User,
  AlertCircle,
  Trash2,
  CheckCircle2,
  Filter,
} from 'lucide-react'
import { tasksService } from '@/services/tasks'
import { clientsService } from '@/services/clients'
import { usersService } from '@/services/whatsapp'
import { useAuth } from '@/context/AuthContext'
import { formatDateTime } from '@/lib/sla'
import type { Task, Client, User as CrmUser } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'

export default function TasksPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<CrmUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('pendente')

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [taskForm, setTaskForm] = useState<{
    title: string
    description: string
    client_id: string
    assigned_to: string
    due_date: string
    priority: 'baixa' | 'media' | 'alta'
  }>({
    title: '',
    description: '',
    client_id: '',
    assigned_to: user?.id || '',
    due_date: new Date().toISOString().split('T')[0],
    priority: 'alta',
  })

  const loadData = async () => {
    try {
      const [allTasks, allClients, allUsers] = await Promise.all([
        tasksService.getAll(),
        clientsService.getAll(),
        usersService.getAll(),
      ])
      setTasks(allTasks)
      setClients(allClients)
      setUsers(allUsers)
    } catch (err) {
      console.error('Error loading tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleToggleStatus = async (
    taskId: string,
    currentStatus: 'pendente' | 'concluida' | 'cancelada',
  ) => {
    try {
      const updated = await tasksService.toggleStatus(taskId, currentStatus)
      setTasks(tasks.map((t) => (t.id === taskId ? updated : t)))
      toast({
        title: updated.status === 'concluida' ? 'Tarefa concluída!' : 'Tarefa reaberta',
        description: updated.title,
      })
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o status.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return
    try {
      await tasksService.delete(taskId)
      setTasks(tasks.filter((t) => t.id !== taskId))
      toast({ title: 'Tarefa removida' })
    } catch (err) {
      toast({ title: 'Erro ao excluir', variant: 'destructive' })
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskForm.title.trim() || !taskForm.client_id) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Selecione um cliente e informe o título da tarefa.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const created = await tasksService.create({
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || undefined,
        client_id: taskForm.client_id,
        assigned_to: taskForm.assigned_to || undefined,
        due_date: taskForm.due_date
          ? taskForm.due_date.split('T')[0]
          : new Date().toISOString().split('T')[0],
        status: 'pendente',
        priority: taskForm.priority,
      })
      setTasks([created, ...tasks])
      setModalOpen(false)
      setTaskForm({
        title: '',
        description: '',
        client_id: '',
        assigned_to: user?.id || '',
        due_date: new Date().toISOString().split('T')[0],
        priority: 'alta',
      })
      toast({
        title: 'Tarefa criada com sucesso!',
        description: 'Follow-up agendado no CRM.',
      })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar',
        description: err?.message || 'Falha ao salvar tarefa.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.expand?.client_id?.name &&
        t.expand.client_id.name.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="h-6 w-6 text-emerald-600" />
            Tarefas & Follow-up de Atendimento
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Organize prazos de envio de orçamentos, aprovação de provas e retornos para clientes.
          </p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-sm"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nova Tarefa
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por tarefa ou cliente..."
            className="pl-9 text-xs bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Status da Tarefa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="concluida">Concluídas</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-xs">Carregando tarefas...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
            Nenhuma tarefa de follow-up encontrada.
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isCompleted = task.status === 'concluida'
            const isOverdue = !isCompleted && new Date(task.due_date).getTime() < Date.now()

            return (
              <div
                key={task.id}
                className={`p-4 rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow ${
                  isOverdue
                    ? 'border-rose-300 bg-rose-50/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={() => handleToggleStatus(task.id, task.status)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-semibold text-sm ${
                          isCompleted
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-bold px-1.5 py-0 ${
                          task.priority === 'alta'
                            ? 'border-rose-300 text-rose-700 bg-rose-50'
                            : task.priority === 'media'
                              ? 'border-amber-300 text-amber-700 bg-amber-50'
                              : 'border-slate-300 text-slate-600'
                        }`}
                      >
                        {task.priority}
                      </Badge>
                      {isOverdue && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] px-1.5 py-0 animate-pulse"
                        >
                          Atrasada
                        </Badge>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-500 line-clamp-2">{task.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        Cliente: {task.expand?.client_id?.name || 'Cliente'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Vencimento: {formatDateTime(task.due_date)}
                      </span>
                      {task.expand?.assigned_to && (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {task.expand.assigned_to.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteTask(task.id)}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal Create Task */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-emerald-600" />
              Nova Tarefa de Follow-up
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateTask} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Cliente Relacionado *</label>
              <Select
                value={taskForm.client_id}
                onValueChange={(val) => setTaskForm({ ...taskForm, client_id: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Título da Tarefa *</label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Ex: Ligar para confirmar aprovação do orçamento #3021"
                required
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Data de Vencimento</label>
                <Input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Prioridade</label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(val: any) => setTaskForm({ ...taskForm, priority: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                    <SelectItem value="media">🟡 Média</SelectItem>
                    <SelectItem value="alta">🔴 Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Atribuído para</label>
              <Select
                value={taskForm.assigned_to}
                onValueChange={(val) => setTaskForm({ ...taskForm, assigned_to: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o atendente" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Descrição / Instruções</label>
              <Textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Detalhes adicionais para a equipe..."
                rows={2}
                className="mt-1 resize-none"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Salvando...' : 'Criar Tarefa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
