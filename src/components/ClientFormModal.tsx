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
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Client, type KanbanStage, type User } from '@/types/crm'
import { clientsService, type FindClientByPhoneResult } from '@/services/clients'
import { usersService } from '@/services/whatsapp'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/hooks/use-toast'
import { normalizePhone } from '@/lib/utils'
import { formatCurrency, formatDateTime } from '@/lib/sla'
import {
  UserCheck,
  UserPlus,
  Trash2,
  MessageSquare,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Building2,
  MapPin,
  FileText,
  ShoppingBag,
  FileSpreadsheet,
  Star,
  Search,
  Crown,
} from 'lucide-react'
import StartWhatsAppConversationModal from './StartWhatsAppConversationModal'
import ClientPurchaseHistoryModal from './ClientPurchaseHistoryModal'
import ClientQuotesModal from './ClientQuotesModal'
import ClientEvaluationsModal from './ClientEvaluationsModal'

interface ClientFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: (client: Client) => void
  clientToEdit?: Client | null
  initialStage?: KanbanStage
}

interface ClientFormData {
  // Seção 1: Dados Principais
  name: string
  trade_name: string
  client_type: 'pessoa_fisica' | 'pessoa_juridica'
  cpf_cnpj: string
  birth_date: string
  phone: string
  secondary_phone: string
  email: string
  instagram: string
  assigned_to: string

  // Seção 2: Endereço
  address_zip: string
  address_street: string
  address_number: string
  address_complement: string
  address_neighborhood: string
  address_city: string
  address_state: string

  // Seção 3: Atendimento & Observações Permanentes
  how_found: string
  is_vip: boolean
  notes: string
}

const INITIAL_FORM_DATA: ClientFormData = {
  name: '',
  trade_name: '',
  client_type: 'pessoa_fisica',
  cpf_cnpj: '',
  birth_date: '',
  phone: '+55 ',
  secondary_phone: '',
  email: '',
  instagram: '',
  assigned_to: '',

  address_zip: '',
  address_street: '',
  address_number: '',
  address_complement: '',
  address_neighborhood: '',
  address_city: '',
  address_state: '',

  how_found: '',
  is_vip: false,
  notes: '',
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
  const [purchaseHistoryModalOpen, setPurchaseHistoryModalOpen] = useState(false)
  const [quotesModalOpen, setQuotesModalOpen] = useState(false)
  const [evaluationsModalOpen, setEvaluationsModalOpen] = useState(false)
  const [searchingCep, setSearchingCep] = useState(false)

  // Phone lookup detection state (para evitar duplicidade em novos cadastros)
  const [checkingPhone, setCheckingPhone] = useState(false)
  const [phoneMatch, setPhoneMatch] = useState<FindClientByPhoneResult | null>(null)
  const phoneDebounceRef = useRef<any>(null)

  const [formData, setFormData] = useState<ClientFormData>(INITIAL_FORM_DATA)

  useEffect(() => {
    if (isOpen) {
      usersService.getAll().then((data) => {
        setUsers(data)
      })

      if (clientToEdit) {
        setFormData({
          name: clientToEdit.name || '',
          trade_name: clientToEdit.trade_name || '',
          client_type: clientToEdit.client_type || 'pessoa_fisica',
          cpf_cnpj: clientToEdit.cpf_cnpj || '',
          birth_date: clientToEdit.birth_date ? clientToEdit.birth_date.split('T')[0] : '',
          phone: clientToEdit.phone || '',
          secondary_phone: clientToEdit.secondary_phone || '',
          email: clientToEdit.email || '',
          instagram: clientToEdit.instagram || '',
          assigned_to: clientToEdit.assigned_to || '',

          address_zip: clientToEdit.address_zip || '',
          address_street: clientToEdit.address_street || '',
          address_number: clientToEdit.address_number || '',
          address_complement: clientToEdit.address_complement || '',
          address_neighborhood: clientToEdit.address_neighborhood || '',
          address_city: clientToEdit.address_city || '',
          address_state: clientToEdit.address_state || '',

          how_found: clientToEdit.how_found || '',
          is_vip: Boolean(clientToEdit.is_vip),
          notes: clientToEdit.notes || '',
        })
        setPhoneMatch(null)
      } else {
        setFormData({
          ...INITIAL_FORM_DATA,
          assigned_to: user?.id || '',
        })
        setPhoneMatch(null)
      }
      setDeleteConfirm(false)
    }
  }, [isOpen, clientToEdit, user?.id])

  // Phone lookup effect on change (when creating new client)
  const handlePhoneChange = (newPhone: string) => {
    setFormData((prev) => ({ ...prev, phone: newPhone }))

    if (clientToEdit) return // Não dispara verificação na edição de cadastro existente

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
        if (result.canonicalClient) {
          const canonical = result.canonicalClient
          setFormData((prev) => ({
            ...prev,
            name: prev.name.trim() ? prev.name : canonical.name || '',
            email: prev.email.trim() ? prev.email : canonical.email || '',
            trade_name: prev.trade_name.trim() ? prev.trade_name : canonical.trade_name || '',
            cpf_cnpj: prev.cpf_cnpj.trim() ? prev.cpf_cnpj : canonical.cpf_cnpj || '',
            secondary_phone: prev.secondary_phone.trim()
              ? prev.secondary_phone
              : canonical.secondary_phone || '',
            instagram: prev.instagram.trim() ? prev.instagram : canonical.instagram || '',
            address_zip: prev.address_zip.trim() ? prev.address_zip : canonical.address_zip || '',
            address_street: prev.address_street.trim()
              ? prev.address_street
              : canonical.address_street || '',
            address_number: prev.address_number.trim()
              ? prev.address_number
              : canonical.address_number || '',
            address_complement: prev.address_complement.trim()
              ? prev.address_complement
              : canonical.address_complement || '',
            address_neighborhood: prev.address_neighborhood.trim()
              ? prev.address_neighborhood
              : canonical.address_neighborhood || '',
            address_city: prev.address_city.trim()
              ? prev.address_city
              : canonical.address_city || '',
            address_state: prev.address_state.trim()
              ? prev.address_state
              : canonical.address_state || '',
            how_found: prev.how_found.trim() ? prev.how_found : canonical.how_found || '',
            is_vip: prev.is_vip || Boolean(canonical.is_vip),
          }))
        }
      } catch (err) {
        console.error('Error checking phone duplicate:', err)
      } finally {
        setCheckingPhone(false)
      }
    }, 400)
  }

  // Consulta automática de CEP via ViaCEP
  const handleCepBlur = async () => {
    const rawCep = formData.address_zip.replace(/\D/g, '')
    if (rawCep.length !== 8) return

    setSearchingCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setFormData((prev) => ({
          ...prev,
          address_street: data.logradouro || prev.address_street,
          address_neighborhood: data.bairro || prev.address_neighborhood,
          address_city: data.localidade || prev.address_city,
          address_state: data.uf || prev.address_state,
          address_complement: data.complemento || prev.address_complement,
        }))
        toast({
          title: 'Endereço localizado',
          description: `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`,
        })
      }
    } catch (err) {
      console.warn('Falha na consulta de CEP:', err)
    } finally {
      setSearchingCep(false)
    }
  }

  const existingClient = phoneMatch?.canonicalClient || null
  const isRecurring =
    existingClient &&
    ((existingClient.total_purchases !== undefined && existingClient.total_purchases > 0) ||
      existingClient.has_returned === true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe pelo menos o Nome completo / Razão social e o WhatsApp do cliente.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const payload: Record<string, any> = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        trade_name: formData.trade_name.trim(),
        client_type: formData.client_type,
        cpf_cnpj: formData.cpf_cnpj.trim(),
        birth_date: formData.birth_date ? formData.birth_date.split('T')[0] : '',
        secondary_phone: formData.secondary_phone.trim(),
        email: formData.email.trim(),
        instagram: formData.instagram.trim(),
        assigned_to: formData.assigned_to ? formData.assigned_to.trim() : '',

        address_zip: formData.address_zip.trim(),
        address_street: formData.address_street.trim(),
        address_number: formData.address_number.trim(),
        address_complement: formData.address_complement.trim(),
        address_neighborhood: formData.address_neighborhood.trim(),
        address_city: formData.address_city.trim(),
        address_state: formData.address_state.trim(),

        how_found: formData.how_found.trim(),
        is_vip: Boolean(formData.is_vip),
        notes: formData.notes.trim(),
      }

      let savedClient: Client

      if (clientToEdit) {
        // MODO EDIÇÃO: Atualizar dados cadastrais permanentes do cliente
        savedClient = await clientsService.update(clientToEdit.id, payload)

        toast({
          title: 'Cadastro atualizado com sucesso',
          description: `A ficha de "${savedClient.name}" foi salva com sucesso.`,
        })
      } else if (existingClient) {
        // CLIENTE JÁ EXISTENTE: Atualizar cadastro existente
        savedClient = await clientsService.update(existingClient.id, payload)

        toast({
          title: 'Cadastro do cliente atualizado',
          description: `Os dados da ficha de "${savedClient.name}" foram atualizados.`,
        })
      } else {
        // NOVO CADASTRO DE CLIENTE:
        // Cria o registro na collection clients + atendimento inicial padrão
        payload.stage = initialStage || 'Novo contato'
        payload.priority = 'media'
        payload.last_message_at = new Date().toISOString().split('T')[0]
        payload.last_message_direction = 'inbound'
        payload.last_message_text = 'Cadastro inicial manual'

        const result = await clientsService.createClientWithInitialAttendance(payload)
        savedClient = result.client

        toast({
          title: 'Cliente cadastrado com sucesso',
          description: `Ficha de "${savedClient.name}" criada no sistema.`,
        })
      }

      window.dispatchEvent(new CustomEvent('crm-client-updated'))
      onSaved(savedClient)
      onClose()
    } catch (err: any) {
      console.error('Error saving client form:', err)
      const fieldErrors = err?.response?.data || err?.data
      let detailedMsg = err?.message || 'Verifique os dados informados.'
      if (fieldErrors && typeof fieldErrors === 'object') {
        const details = Object.entries(fieldErrors)
          .map(([k, v]: [string, any]) => `${k}: ${v?.message || JSON.stringify(v)}`)
          .join(', ')
        if (details) detailedMsg = `${detailedMsg} (${details})`
      }
      toast({
        title: 'Erro ao salvar ficha cadastral',
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
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
          {/* Header da Ficha */}
          <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                  {clientToEdit ? (
                    <>
                      <UserCheck className="h-5 w-5 text-emerald-600" />
                      <span>Ficha do Cliente</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-5 w-5 text-emerald-600" />
                      <span>Novo Cadastro de Cliente</span>
                    </>
                  )}
                  {formData.is_vip && (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <Crown className="h-3 w-3" /> VIP
                    </Badge>
                  )}
                </DialogTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Cadastro permanente do cliente. Informações comerciais e de funil pertencem aos
                  atendimentos.
                </p>
              </div>

              {/* Botões de Ações do Cliente */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Botão Histórico de Compras Ativado */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!clientToEdit && !existingClient}
                  title={
                    clientToEdit || existingClient
                      ? 'Ver histórico completo de compras e pedidos deste cliente'
                      : 'Salve o cadastro do cliente para visualizar o histórico de compras'
                  }
                  onClick={() => setPurchaseHistoryModalOpen(true)}
                  className={`h-8 text-xs font-semibold ${
                    clientToEdit || existingClient
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 hover:text-emerald-800 dark:hover:bg-emerald-900/60 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <ShoppingBag className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                  Histórico de Compras
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!clientToEdit && !existingClient}
                  title={
                    clientToEdit || existingClient
                      ? 'Ver todos os orçamentos deste cliente'
                      : 'Salve o cadastro do cliente para visualizar os orçamentos'
                  }
                  onClick={() => setQuotesModalOpen(true)}
                  className={`h-8 text-xs font-semibold ${
                    clientToEdit || existingClient
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 hover:text-emerald-800 dark:hover:bg-emerald-900/60 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                  Orçamentos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!clientToEdit && !existingClient}
                  title={
                    clientToEdit || existingClient
                      ? 'Ver todas as avaliações deste cliente'
                      : 'Salve o cadastro do cliente para visualizar as avaliações'
                  }
                  onClick={() => setEvaluationsModalOpen(true)}
                  className={`h-8 text-xs font-semibold ${
                    clientToEdit || existingClient
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-900/60 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <Star className="h-3.5 w-3.5 mr-1.5 text-amber-500 fill-amber-400" />
                  Avaliações
                </Button>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Banner informativo de detecção de cliente existente */}
            {!clientToEdit && existingClient && (
              <div className="p-3.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-blue-900 dark:text-blue-100 font-bold text-xs">
                    <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
                    <span>Telefone já cadastrado na base de clientes</span>
                    {phoneMatch?.isMerged && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-purple-50 text-purple-700 border-purple-300"
                      >
                        Registro canônico
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
                    Ciclos de atendimento: <strong>{phoneMatch?.attendancesCount || 0}</strong>
                  </span>
                </div>

                <div className="text-xs text-blue-800 dark:text-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  <div>
                    <span className="text-slate-500">Nome cadastrado: </span>
                    <strong>{existingClient.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">WhatsApp: </span>
                    <span className="font-mono">{existingClient.phone}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Action para WhatsApp direto do cadastro */}
            {clientToEdit && (
              <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-xs">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-emerald-950 dark:text-emerald-100 block">
                      Canal de Atendimento WhatsApp
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Dispare templates oficiais da Meta ou visualize o histórico completo no chat.
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => setStartChatModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 shadow-xs shrink-0 font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Template Oficial Meta
                </Button>
              </div>
            )}

            <form id="client-profile-form" onSubmit={handleSubmit} className="space-y-6">
              {/* SEÇÃO 1: DADOS PRINCIPAIS */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                    Seção 1 — Dados Principais
                  </h3>
                  <Badge variant="outline" className="text-[10px] text-slate-500">
                    Identificação & Contato
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Tipo de cliente */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Tipo de Cliente
                    </label>
                    <Select
                      value={formData.client_type}
                      onValueChange={(val: 'pessoa_fisica' | 'pessoa_juridica') =>
                        setFormData({ ...formData, client_type: val })
                      }
                    >
                      <SelectTrigger className="mt-1 bg-white dark:bg-slate-900">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pessoa_fisica">Pessoa Física (PF)</SelectItem>
                        <SelectItem value="pessoa_juridica">Pessoa Jurídica (PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* CPF / CNPJ */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {formData.client_type === 'pessoa_juridica' ? 'CNPJ' : 'CPF'}
                    </label>
                    <Input
                      value={formData.cpf_cnpj}
                      onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                      placeholder={
                        formData.client_type === 'pessoa_juridica'
                          ? '00.000.000/0001-00'
                          : '000.000.000-00'
                      }
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Nome Completo / Razão Social */}
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {formData.client_type === 'pessoa_juridica'
                        ? 'Razão Social *'
                        : 'Nome Completo *'}
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={
                        formData.client_type === 'pessoa_juridica'
                          ? 'Ex: Café Central e Eventos Ltda'
                          : 'Ex: João da Silva Santos'
                      }
                      required
                      className="mt-1 bg-white dark:bg-slate-900 font-medium"
                    />
                  </div>

                  {/* Nome Fantasia */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nome Fantasia
                    </label>
                    <Input
                      value={formData.trade_name}
                      onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })}
                      placeholder="Ex: Café Central"
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Data de Nascimento / Fundação */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {formData.client_type === 'pessoa_juridica'
                        ? 'Data de Fundação'
                        : 'Data de Nascimento'}
                    </label>
                    <Input
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* WhatsApp Principal */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        WhatsApp / Telefone Principal *
                      </label>
                      {checkingPhone && (
                        <span className="text-[10px] text-blue-600 animate-pulse font-medium">
                          Verificando...
                        </span>
                      )}
                    </div>
                    <Input
                      value={formData.phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="+55 11 99999-8888"
                      required
                      className="mt-1 bg-white dark:bg-slate-900 font-medium font-mono text-xs"
                    />
                  </div>

                  {/* Telefone Secundário */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Telefone Secundário / Fixo
                    </label>
                    <Input
                      value={formData.secondary_phone}
                      onChange={(e) =>
                        setFormData({ ...formData, secondary_phone: e.target.value })
                      }
                      placeholder="+55 11 3333-2222"
                      className="mt-1 bg-white dark:bg-slate-900 font-mono text-xs"
                    />
                  </div>

                  {/* E-mail */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      E-mail
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="contato@empresa.com.br"
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Instagram */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Instagram
                    </label>
                    <Input
                      value={formData.instagram}
                      onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                      placeholder="@perfil_cliente"
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Atendente Responsável Permanente */}
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Atendente Responsável (Permanente)
                    </label>
                    <Select
                      value={formData.assigned_to}
                      onValueChange={(val) => setFormData({ ...formData, assigned_to: val })}
                    >
                      <SelectTrigger className="mt-1 bg-white dark:bg-slate-900">
                        <SelectValue placeholder="Selecione o atendente responsável pela conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Responsável comercial fixo pelo cliente na carteira.
                    </p>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 2: ENDEREÇO */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                    Seção 2 — Endereço
                  </h3>
                  <Badge variant="outline" className="text-[10px] text-slate-500">
                    Localização & Entrega
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* CEP */}
                  <div className="sm:col-span-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        CEP
                      </label>
                      {searchingCep && (
                        <span className="text-[10px] text-emerald-600 animate-pulse">
                          Buscando CEP...
                        </span>
                      )}
                    </div>
                    <div className="relative mt-1">
                      <Input
                        value={formData.address_zip}
                        onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                        onBlur={handleCepBlur}
                        placeholder="00000-000"
                        className="bg-white dark:bg-slate-900 font-mono text-xs pr-8"
                      />
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Logradouro */}
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Logradouro (Rua, Avenida, etc.)
                    </label>
                    <Input
                      value={formData.address_street}
                      onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                      placeholder="Ex: Av. Paulista"
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Número */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Número
                    </label>
                    <Input
                      value={formData.address_number}
                      onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                      placeholder="Ex: 1500"
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Complemento */}
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Complemento
                    </label>
                    <Input
                      value={formData.address_complement}
                      onChange={(e) =>
                        setFormData({ ...formData, address_complement: e.target.value })
                      }
                      placeholder="Ex: Sala 42 / Bloco B"
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Bairro */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Bairro
                    </label>
                    <Input
                      value={formData.address_neighborhood}
                      onChange={(e) =>
                        setFormData({ ...formData, address_neighborhood: e.target.value })
                      }
                      placeholder="Ex: Bela Vista"
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Cidade */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Cidade
                    </label>
                    <Input
                      value={formData.address_city}
                      onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                      placeholder="Ex: São Paulo"
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Estado (UF) */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Estado (UF)
                    </label>
                    <Input
                      value={formData.address_state}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          address_state: e.target.value.toUpperCase().slice(0, 2),
                        })
                      }
                      maxLength={2}
                      placeholder="SP"
                      className="mt-1 bg-white dark:bg-slate-900 font-mono text-center uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO 3: INFORMAÇÕES DE ATENDIMENTO & OBSERVAÇÕES PERMANENTES */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    Seção 3 — Informações de Atendimento
                  </h3>
                  <Badge variant="outline" className="text-[10px] text-slate-500">
                    Origem & Observações
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  {/* Como conheceu a empresa */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Como conheceu a empresa?
                    </label>
                    <Input
                      value={formData.how_found}
                      onChange={(e) => setFormData({ ...formData, how_found: e.target.value })}
                      placeholder="Ex: Indicação, Google, Instagram, Fachada, Feira..."
                      className="mt-1 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* Cliente VIP Switch */}
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Crown className="h-4 w-4 text-amber-500" />
                        Cliente VIP
                      </span>
                      <p className="text-[11px] text-slate-400">
                        Prioridade de atendimento e condições especiais
                      </p>
                    </div>
                    <Switch
                      checked={formData.is_vip}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_vip: checked })}
                    />
                  </div>

                  {/* Observações permanentes (campo notes) */}
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Observações Permanentes do Cliente
                    </label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Informações cadastrais perenes, preferências gráficas, exigências de entrega, regras financeiras ou particularidades do cliente..."
                      rows={4}
                      className="mt-1 bg-white dark:bg-slate-900 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Soft-delete confirmation alert inside form */}
              {clientToEdit && deleteConfirm && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs space-y-2">
                  <div className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>Excluir cliente (preservando histórico)</span>
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    O cliente será removido da lista visível. Todo o histórico de mensagens,
                    atendimentos, pedidos e orçamentos permanecerá intacto. Se ele mandar nova
                    mensagem no WhatsApp, retornará automaticamente pelo mesmo número.
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
            </form>
          </div>

          {/* Footer Fixo */}
          <div className="sticky bottom-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 px-6 py-3.5 flex flex-col sm:flex-row sm:justify-between items-center gap-3">
            {clientToEdit && !deleteConfirm ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirm(true)}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900"
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
                form="client-profile-form"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[150px] font-semibold shadow-xs"
              >
                {loading
                  ? 'Salvando...'
                  : clientToEdit
                    ? 'Atualizar Cadastro'
                    : 'Cadastrar Cliente'}
              </Button>
            </div>
          </div>
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

      {/* Histórico de Compras do Cliente (Pedidos de Produção) */}
      <ClientPurchaseHistoryModal
        isOpen={purchaseHistoryModalOpen}
        onClose={() => setPurchaseHistoryModalOpen(false)}
        client={clientToEdit || existingClient || null}
        zIndexClass="z-[70]"
      />

      {/* Orçamentos do Cliente */}
      <ClientQuotesModal
        isOpen={quotesModalOpen}
        onClose={() => setQuotesModalOpen(false)}
        client={clientToEdit || existingClient || null}
        zIndexClass="z-[70]"
      />

      {/* Avaliações de Satisfação do Cliente */}
      <ClientEvaluationsModal
        isOpen={evaluationsModalOpen}
        onClose={() => setEvaluationsModalOpen(false)}
        client={clientToEdit || existingClient || null}
        zIndexClass="z-[70]"
      />
    </>
  )
}
