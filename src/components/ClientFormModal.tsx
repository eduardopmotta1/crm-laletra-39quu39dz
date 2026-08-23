import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KANBAN_STAGES, type Client, type KanbanStage, type Priority, type User } from '@/types/crm'
import { clientsService } from '@/services/clients'
import { usersService } from '@/services/whatsapp'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/hooks/use-toast'
import { UserPlus, UserCheck, Trash2, MessageSquare, Sparkles } from 'lucide-react'
import StartWhatsAppConversationModal from './StartWhatsAppConversationModal'

interface ClientFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: (client: Client) => void
  clientToEdit?: Client | null
  initialStage?: KanbanStage
}

export default function ClientFormModal({
  isOpen,
  onClose,
  onSaved,
  clientToEdit,
  initialStage,
}: ClientFormModalProps) {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [startChatModalOpen, setStartChatModalOpen] = useState(false)

  const [formData, setFormData] = useState<{
    name: string
    phone: string
    email: string
    stage: KanbanStage
    product_interest: string
    quote_value: string
    priority: Priority
    assigned_to: string
    notes: string
    next_action: string
    next_action_date: string
  }>({
    name: '',
    phone: '',
    email: '',
    stage: initialStage || 'Novo contato',
    product_interest: '',
    quote_value: '',
    priority: 'media',
    assigned_to: user?.id || '',
    notes: '',
    next_action: '',
    next_action_date: '',
  })

  useEffect(() => {
    if (isOpen) {
      usersService.getAll().then((data) => {
        setUsers(data)
      })

      if (clientToEdit) {
        setFormData({
          name: clientToEdit.name || '',
          phone: clientToEdit.phone || '',
          email: clientToEdit.email || '',
          stage: clientToEdit.stage || 'Novo contato',
          product_interest: clientToEdit.product_interest || '',
          quote_value:
            clientToEdit.quote_value !== undefined ? String(clientToEdit.quote_value) : '',
          priority: clientToEdit.priority || 'media',
          assigned_to: clientToEdit.assigned_to || user?.id || '',
          notes: clientToEdit.notes || '',
          next_action: clientToEdit.next_action || '',
          next_action_date: clientToEdit.next_action_date
            ? clientToEdit.next_action_date.split('T')[0]
            : '',
        })
      } else {
        setFormData({
          name: '',
          phone: '+55 ',
          email: '',
          stage: initialStage || 'Novo contato',
          product_interest: '',
          quote_value: '',
          priority: 'media',
          assigned_to: user?.id || '',
          notes: '',
          next_action: '',
          next_action_date: '',
        })
      }
      setDeleteConfirm(false)
    }
  }, [isOpen, clientToEdit, initialStage, user?.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe pelo menos o nome e o telefone do cliente.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const payload: Partial<Client> = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        stage: formData.stage,
        product_interest: formData.product_interest.trim() || undefined,
        quote_value: formData.quote_value ? Number(formData.quote_value) : undefined,
        priority: formData.priority,
        assigned_to: formData.assigned_to || undefined,
        notes: formData.notes.trim() || undefined,
        next_action: formData.next_action.trim() || undefined,
        next_action_date: formData.next_action_date
          ? new Date(formData.next_action_date).toISOString()
          : undefined,
      }

      let saved: Client
      if (clientToEdit) {
        saved = await clientsService.update(clientToEdit.id, payload)
        toast({
          title: 'Cliente atualizado',
          description: `Os dados de "${saved.name}" foram salvos com sucesso.`,
        })
      } else {
        // New client: set last message timestamp to now if not provided
        payload.last_message_at = new Date().toISOString()
        payload.last_message_direction = 'inbound'
        payload.last_message_text = 'Cadastro inicial manual'
        saved = await clientsService.create(payload)
        toast({
          title: 'Cliente cadastrado',
          description: `Novo atendimento adicionado ao funil: "${saved.name}".`,
        })
      }

      onSaved(saved)
      onClose()
    } catch (err: any) {
      console.error('Error saving client:', err)
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Verifique os dados informados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!clientToEdit) return
    setLoading(true)
    try {
      await clientsService.delete(clientToEdit.id)
      toast({
        title: 'Cliente excluído',
        description: `O cliente "${clientToEdit.name}" foi removido do funil.`,
      })
      onSaved(clientToEdit)
      onClose()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err?.message || 'Falha ao remover cliente.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between gap-4">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              {clientToEdit ? (
                <>
                  <UserCheck className="h-5 w-5 text-emerald-600" />
                  Editar Atendimento / Cliente
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5 text-emerald-600" />
                  Novo Atendimento / Cliente
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Row 1: Nome e Telefone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nome do Cliente / Empresa *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: João Silva - Café Central"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  WhatsApp / Telefone *
                </label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+55 11 99999-8888"
                    required
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Quick Action Button to Start WhatsApp Template Conversation directly from client details */}
            {clientToEdit && (
              <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-sm">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-emerald-950 dark:text-emerald-100 block">
                      Iniciar conversa no WhatsApp com este cliente
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Dispare um template aprovado da Meta e mova para "Contato iniciado".
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => setStartChatModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 shadow-sm shrink-0 font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Iniciar conversa no WhatsApp
                </Button>
              </div>
            )}

            {/* Row 2: Email e Etapa do Funil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  E-mail (opcional)
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contato@empresa.com.br"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Etapa do Funil Kanban *
                </label>
                <Select
                  value={formData.stage}
                  onValueChange={(val: KanbanStage) => setFormData({ ...formData, stage: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {KANBAN_STAGES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Produto de Interesse e Valor Orçamento */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Produto / Serviço de Interesse
                </label>
                <Input
                  value={formData.product_interest}
                  onChange={(e) => setFormData({ ...formData, product_interest: e.target.value })}
                  placeholder="Ex: 1.000 Panfletos 4x4 + 500 Cartões de Visita"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Valor do Orçamento (R$)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.quote_value}
                  onChange={(e) => setFormData({ ...formData, quote_value: e.target.value })}
                  placeholder="0,00"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Row 4: Prioridade e Responsável */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Prioridade
                </label>
                <Select
                  value={formData.priority}
                  onValueChange={(val: Priority) => setFormData({ ...formData, priority: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                    <SelectItem value="media">🟡 Média</SelectItem>
                    <SelectItem value="alta">🟠 Alta</SelectItem>
                    <SelectItem value="urgente">🔴 Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Atendente Responsável
                </label>
                <Select
                  value={formData.assigned_to}
                  onValueChange={(val) => setFormData({ ...formData, assigned_to: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecionar atendente" />
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
            </div>

            {/* Row 5: Próxima Ação e Data */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Próxima Ação
                </label>
                <Input
                  value={formData.next_action}
                  onChange={(e) => setFormData({ ...formData, next_action: e.target.value })}
                  placeholder="Ex: Enviar prova digital em PDF via WhatsApp"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Data Prevista
                </label>
                <Input
                  type="date"
                  value={formData.next_action_date}
                  onChange={(e) => setFormData({ ...formData, next_action_date: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Row 6: Observações */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Observações e Detalhes Gráficos
              </label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Especificações do papel (Couché 300g, Verniz Localizado, Laminação Soft Touch, Faca Especial, etc.)"
                rows={3}
                className="mt-1 resize-none"
              />
            </div>

            {/* Actions & Delete Confirmation */}
            <DialogFooter className="pt-3 flex flex-col sm:flex-row sm:justify-between items-center gap-2">
              {clientToEdit ? (
                deleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-600 font-medium">Tem certeza?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={loading}
                    >
                      Confirmar Exclusão
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteConfirm(true)}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Excluir Cliente
                  </Button>
                )
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[120px]"
                >
                  {loading ? 'Salvando...' : clientToEdit ? 'Atualizar' : 'Criar Atendimento'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Start WhatsApp Conversation Modal */}
      <StartWhatsAppConversationModal
        isOpen={startChatModalOpen}
        onClose={() => setStartChatModalOpen(false)}
        client={clientToEdit || null}
        onSuccess={(updated) => {
          onSaved(updated)
          onClose()
        }}
      />
    </>
  )
}
