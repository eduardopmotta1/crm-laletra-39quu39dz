import React, { useState, useEffect, useRef } from 'react'
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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  KANBAN_STAGES,
  type Attendance,
  type Client,
  type KanbanStage,
  type Priority,
  type User,
} from '@/types/crm'
import { clientsService, type FindClientByPhoneResult } from '@/services/clients'
import { attendancesService } from '@/services/attendances'
import { usersService } from '@/services/whatsapp'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/hooks/use-toast'
import { normalizePhone } from '@/lib/utils'
import { formatCurrency, formatDateTime } from '@/lib/sla'
import {
  UserPlus,
  UserCheck,
  Trash2,
  MessageSquare,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
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

  // Phone lookup detection state
  const [checkingPhone, setCheckingPhone] = useState(false)
  const [phoneMatch, setPhoneMatch] = useState<FindClientByPhoneResult | null>(null)
  const [confirmMultipleAttendance, setConfirmMultipleAttendance] = useState(false)
  const phoneDebounceRef = useRef<any>(null)

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
        setPhoneMatch(null)
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
        setPhoneMatch(null)
      }
      setDeleteConfirm(false)
      setConfirmMultipleAttendance(false)
    }
  }, [isOpen, clientToEdit, initialStage, user?.id])

  // Phone lookup effect on change (when creating new attendance)
  const handlePhoneChange = (newPhone: string) => {
    setFormData((prev) => ({ ...prev, phone: newPhone }))
    setConfirmMultipleAttendance(false)

    if (clientToEdit) return // Do not trigger auto-lookup when editing existing client

    if (phoneDebounceRef.current) {
      clearTimeout(phoneDebounceRef.current)
    }

    const norm = normalizePhone(newPhone)
    if (norm.length < 8) {
      setPhoneMatch(null)
      return
    }

    phoneDebounceRef.current = setTimeout(async () => {
      setCheckingPhone(true)
      try {
        const result = await clientsService.findByNormalizedPhone(newPhone)
        setPhoneMatch(result)
        // If exact canonical client found and name field is empty, suggest existing client name/email
        if (result.canonicalClient) {
          const canonical = result.canonicalClient
          setFormData((prev) => ({
            ...prev,
            name: prev.name.trim() ? prev.name : canonical.name || '',
            email: prev.email.trim() ? prev.email : canonical.email || '',
          }))
        }
      } catch (err) {
        console.error('Error checking phone duplicate:', err)
      } finally {
        setCheckingPhone(false)
      }
    }, 400)
  }

  const existingClient = phoneMatch?.canonicalClient || null
  const hasActiveAttendance = Boolean(phoneMatch?.activeAttendance)
  const activeAtt = phoneMatch?.activeAttendance || null
  const isRecurring =
    existingClient &&
    ((existingClient.total_purchases !== undefined && existingClient.total_purchases > 0) ||
      existingClient.has_returned === true)

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

    // Se cliente já tem atendimento ativo e usuário não confirmou explicitamente a criação de outro
    if (!clientToEdit && hasActiveAttendance && !confirmMultipleAttendance) {
      toast({
        title: 'Cliente com atendimento ativo',
        description:
          'Este cliente já possui um atendimento em andamento. Abra o existente ou confirme a criação de outro atendimento.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const payload: Record<string, any> = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        stage: formData.stage,
        priority: formData.priority,
        email: formData.email.trim(),
        product_interest: formData.product_interest.trim(),
        quote_value:
          formData.quote_value !== '' && !isNaN(Number(formData.quote_value))
            ? Number(formData.quote_value)
            : 0,
        assigned_to: formData.assigned_to ? formData.assigned_to.trim() : '',
        notes: formData.notes.trim(),
        next_action: formData.next_action.trim(),
        next_action_date:
          formData.next_action_date && formData.next_action_date.trim()
            ? formData.next_action_date.includes('T')
              ? formData.next_action_date.split('T')[0]
              : formData.next_action_date.trim()
            : '',
      }

      let savedClient: Client

      if (clientToEdit) {
        // MODO EDIÇÃO: Atualizar dados do cliente e do atendimento ativo
        savedClient = await clientsService.update(clientToEdit.id, payload)

        try {
          const activeAtts = await pb.collection('attendances').getList(1, 1, {
            filter: `client_id = "${clientToEdit.id}" && is_archived != true`,
            sort: '-created',
            requestKey: null,
          })
          if (activeAtts.items.length > 0) {
            await attendancesService.update(activeAtts.items[0].id, {
              product_interest: payload.product_interest,
              quote_value: payload.quote_value,
              assigned_to: payload.assigned_to,
              stage: payload.stage,
            })
          }
        } catch (attErr) {
          console.error('Error updating active attendance on client edit:', attErr)
        }

        toast({
          title: 'Cliente atualizado',
          description: `Os dados de "${savedClient.name}" foram salvos com sucesso.`,
        })
      } else if (existingClient) {
        // CLIENTE EXISTENTE ENCONTRADO:
        // NÃO CRIA CLIENT (+0 clients). Cria somente o novo attendance (+1 attendance).
        const newAttendance = await clientsService.createAttendanceForExistingClient(
          existingClient.id,
          {
            stage: formData.stage,
            assigned_to: formData.assigned_to || existingClient.assigned_to || '',
            product_interest: formData.product_interest || '',
            quote_value: payload.quote_value || 0,
            notes: formData.notes || '',
            source: 'manual',
          },
        )

        // Atualizar campos complementares de identidade se informados
        const clientUpdateData: Partial<Client> = {}
        if (formData.name.trim() && formData.name.trim() !== existingClient.name) {
          clientUpdateData.name = formData.name.trim()
        }
        if (formData.email.trim() && !existingClient.email) {
          clientUpdateData.email = formData.email.trim()
        }
        if (formData.product_interest.trim()) {
          clientUpdateData.product_interest = formData.product_interest.trim()
        }
        if (Object.keys(clientUpdateData).length > 0) {
          try {
            await clientsService.update(existingClient.id, clientUpdateData)
          } catch {
            /* non-fatal */
          }
        }

        const freshClient = (await clientsService.getById(existingClient.id)) || existingClient
        savedClient = freshClient

        toast({
          title: 'Novo Atendimento Criado!',
          description: `Novo ciclo comercial vinculado ao cliente existente "${freshClient.name}".`,
        })
      } else {
        // NOVO CLIENTE REAL:
        // Cria 1 client + 1 attendance inicial vinculado
        payload.last_message_at = new Date().toISOString().split('T')[0]
        payload.last_message_direction = 'inbound'
        payload.last_message_text = 'Cadastro inicial manual'

        const result = await clientsService.createClientWithInitialAttendance(payload)
        savedClient = result.client

        toast({
          title: 'Novo Cliente Cadastrado',
          description: `Cliente "${savedClient.name}" e atendimento inicial criados no funil.`,
        })
      }

      window.dispatchEvent(new CustomEvent('crm-client-updated'))
      onSaved(savedClient)
      onClose()
    } catch (err: any) {
      console.error('Error saving client / attendance:', err)
      const fieldErrors = err?.response?.data || err?.data
      let detailedMsg = err?.message || 'Verifique os dados informados.'
      if (fieldErrors && typeof fieldErrors === 'object') {
        const details = Object.entries(fieldErrors)
          .map(([k, v]: [string, any]) => `${k}: ${v?.message || JSON.stringify(v)}`)
          .join(', ')
        if (details) detailedMsg = `${detailedMsg} (${details})`
      }
      toast({
        title: 'Erro ao salvar',
        description: detailedMsg,
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
      const success = await clientsService.delete(clientToEdit.id)
      if (!success) {
        throw new Error('Falha ao ocultar cliente.')
      }
      toast({
        title: 'Cliente excluído com sucesso',
        description: `O cliente "${clientToEdit.name}" foi ocultado da lista. Histórico e atendimentos preservados com segurança.`,
      })
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
      onSaved(clientToEdit)
      onClose()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err?.message || 'Falha ao remover cliente da lista.',
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
                  Editar Dados do Cliente
                </>
              ) : existingClient ? (
                <>
                  <Layers className="h-5 w-5 text-blue-600" />
                  Novo Atendimento para Cliente Existente
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5 text-emerald-600" />
                  Novo Cliente & Atendimento
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Banner informativo de detecção de cliente existente */}
          {!clientToEdit && existingClient && (
            <div className="p-3.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-blue-900 dark:text-blue-100 font-bold text-xs">
                  <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>Cliente já cadastrado na base</span>
                  {phoneMatch?.isMerged && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-purple-50 text-purple-700 border-purple-300"
                    >
                      Registro consolidado (Canônico)
                    </Badge>
                  )}
                  {isRecurring ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 text-[10px] font-bold">
                      🔁 Recorrente ({existingClient.total_purchases}{' '}
                      {existingClient.total_purchases === 1 ? 'compra' : 'compras'})
                    </Badge>
                  ) : (
                    <Badge className="bg-sky-100 text-sky-800 text-[10px] font-bold">
                      🆕 Sem compras anteriores
                    </Badge>
                  )}
                </div>
                <span className="text-[11px] text-blue-700 dark:text-blue-300">
                  Total de ciclos: <strong>{phoneMatch?.attendancesCount || 0}</strong>
                </span>
              </div>

              <div className="text-xs text-blue-800 dark:text-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                <div>
                  <span className="text-slate-500">Nome: </span>
                  <strong>{existingClient.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Telefone: </span>
                  <span className="font-mono">{existingClient.phone}</span>
                </div>
                {existingClient.last_purchase_date && (
                  <div>
                    <span className="text-slate-500">Última compra: </span>
                    <strong>{formatDateTime(existingClient.last_purchase_date)}</strong>
                  </div>
                )}
                {existingClient.total_purchase_value ? (
                  <div>
                    <span className="text-slate-500">Total faturado: </span>
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(existingClient.total_purchase_value)}
                    </strong>
                  </div>
                ) : null}
              </div>

              {/* Alerta de Atendimento Ativo */}
              {hasActiveAttendance && activeAtt && (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200 font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Este cliente já possui um atendimento ativo:</span>
                  </div>
                  <div className="text-[11px] text-amber-900 dark:text-amber-100 pl-5 space-y-0.5">
                    <div>
                      • Etapa: <strong>{activeAtt.stage}</strong>
                    </div>
                    {activeAtt.product_interest && (
                      <div>
                        • Produto: <strong>{activeAtt.product_interest}</strong>
                      </div>
                    )}
                    <div>
                      • Criado em: <strong>{formatDateTime(activeAtt.created)}</strong>
                    </div>
                  </div>

                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onSaved(existingClient)
                        onClose()
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7 font-semibold"
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Abrir Atendimento Existente
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={confirmMultipleAttendance ? 'secondary' : 'outline'}
                      onClick={() => setConfirmMultipleAttendance(!confirmMultipleAttendance)}
                      className="text-xs h-7 border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-200"
                    >
                      {confirmMultipleAttendance
                        ? '✓ Confirmado: Criar outro atendimento legítimo'
                        : 'Criar outro atendimento em paralelo'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Row 1: Telefone e Nome */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    WhatsApp / Telefone *
                  </label>
                  {checkingPhone && (
                    <span className="text-[10px] text-blue-600 animate-pulse font-medium">
                      Verificando base...
                    </span>
                  )}
                </div>
                <Input
                  value={formData.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="+55 11 99999-8888"
                  required
                  className="mt-1 font-medium"
                />
              </div>
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
                      Iniciar conversa com este cliente
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Dispare um template aprovado da Meta ou use o chat interno do CRM.
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => setStartChatModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 shadow-sm shrink-0 font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Iniciar com Template Oficial
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

            {/* Soft-delete confirmation alert inside form */}
            {clientToEdit && deleteConfirm && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs space-y-2">
                <div className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <Trash2 className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>Excluir cliente (preservando histórico)</span>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  O cliente será removido da lista visível. Todo o histórico de mensagens,
                  atendimentos e orçamentos permanecerá intacto. Se ele mandar nova mensagem no
                  WhatsApp, retornará automaticamente pelo mesmo número.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={loading}
                    className="h-8 text-xs font-semibold"
                  >
                    {loading ? 'Excluindo...' : 'Confirmar Exclusão Segura'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(false)}
                    disabled={loading}
                    className="h-8 text-xs"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Actions & Delete Confirmation */}
            <DialogFooter className="pt-3 flex flex-col sm:flex-row sm:justify-between items-center gap-2">
              {clientToEdit && !deleteConfirm ? (
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
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    loading || (!clientToEdit && hasActiveAttendance && !confirmMultipleAttendance)
                  }
                  className={`${
                    existingClient
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  } text-white min-w-[140px] font-semibold shadow-sm`}
                >
                  {loading
                    ? 'Salvando...'
                    : clientToEdit
                      ? 'Atualizar Cadastro'
                      : existingClient
                        ? 'Criar Novo Atendimento'
                        : 'Cadastrar Novo Cliente'}
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
