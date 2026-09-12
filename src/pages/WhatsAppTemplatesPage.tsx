import React, { useState, useEffect } from 'react'
import {
  FileText,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Edit2,
  Trash2,
  Copy,
  Sparkles,
  ExternalLink,
  MessageSquare,
  Globe,
  Tag,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import type { WhatsAppTemplate } from '@/types/crm'
import {
  whatsappTemplatesService,
  extractVariablesFromBody,
  renderTemplatePreview,
} from '@/services/whatsappTemplates'

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
    language: string
    status: 'APPROVED' | 'PENDING' | 'REJECTED'
    body: string
  }>({
    name: '',
    category: 'UTILITY',
    language: 'pt_BR',
    status: 'APPROVED',
    body: '',
  })
  const [saving, setSaving] = useState(false)

  // Preview testing state
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({
    nome: 'Carlos Eduardo',
    produto: '1.000 Panfletos Couché 115g',
    orcamento: 'R$ 380,00',
    empresa: 'Laletra Gráfica',
  })

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const data = await whatsappTemplatesService.getAll()
      setTemplates(data)
    } catch (err) {
      console.error('Error loading templates:', err)
      toast({
        title: 'Erro ao carregar',
        description: 'Não foi possível buscar a lista de templates.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleOpenCreate = () => {
    setEditingTemplate(null)
    setFormData({
      name: '',
      category: 'UTILITY',
      language: 'pt_BR',
      status: 'APPROVED',
      body: '',
    })
    setModalOpen(true)
  }

  const handleOpenEdit = (tpl: WhatsAppTemplate) => {
    setEditingTemplate(tpl)
    setFormData({
      name: tpl.name,
      category: tpl.category,
      language: tpl.language || 'pt_BR',
      status: tpl.status || 'APPROVED',
      body: tpl.body,
    })
    setModalOpen(true)
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.body.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o nome identificador e o corpo do template.',
        variant: 'destructive',
      })
      return
    }

    // Format name to lowercase snake_case (Meta standard requirement)
    const formattedName = formData.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')

    setSaving(true)
    try {
      if (editingTemplate) {
        await whatsappTemplatesService.update(editingTemplate.id, {
          name: formattedName,
          category: formData.category,
          language: formData.language,
          status: formData.status,
          body: formData.body.trim(),
        })
        toast({
          title: 'Template atualizado!',
          description: `Template "${formattedName}" salvo com sucesso.`,
        })
      } else {
        await whatsappTemplatesService.create({
          name: formattedName,
          category: formData.category,
          language: formData.language,
          status: formData.status,
          body: formData.body.trim(),
        })
        toast({
          title: 'Template criado!',
          description: `Template "${formattedName}" cadastrado e pronto para uso.`,
        })
      }
      setModalOpen(false)
      loadTemplates()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar template',
        description: err?.message || 'Falha ao salvar no banco de dados.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover o template "${name}"?`)) return
    try {
      await whatsappTemplatesService.delete(id)
      toast({
        title: 'Template excluído',
        description: `O template "${name}" foi removido.`,
      })
      loadTemplates()
    } catch (err) {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível remover o template.',
        variant: 'destructive',
      })
    }
  }

  const handleSyncMeta = async () => {
    setSyncing(true)
    try {
      const res = await whatsappTemplatesService.syncMetaTemplates()
      if (res.synced) {
        toast({
          title: 'Sincronização Concluída!',
          description:
            res.message ||
            `${res.meta_count ?? res.count ?? 0} templates sincronizados com a Meta.`,
          variant: 'default',
        })
        loadTemplates()
      } else {
        toast({
          title: 'Aviso da Sincronização Meta',
          description:
            res.error || res.message || 'Não foi possível sincronizar templates com a conta Meta.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro de sincronização',
        description: err?.message || 'Falha ao comunicar com a API da Meta.',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  const filteredTemplates = templates.filter((tpl) => {
    const matchesSearch =
      tpl.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tpl.body.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tpl.category && tpl.category.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory = categoryFilter === 'all' || tpl.category === categoryFilter
    const matchesStatus = statusFilter === 'all' || tpl.status === statusFilter

    return matchesSearch && matchesCategory && matchesStatus
  })

  const statusBadge = (tpl: WhatsAppTemplate) => {
    const isSyncedWithMeta = Boolean(tpl.meta_template_id && tpl.meta_template_id.trim() !== '')

    if (tpl.status === 'APPROVED' && isSyncedWithMeta) {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 flex items-center gap-1 font-semibold text-[10px]">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          Aprovado (Meta)
        </Badge>
      )
    }

    if (tpl.status === 'APPROVED' && !isSyncedWithMeta) {
      return (
        <Badge
          className="bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 flex items-center gap-1 font-semibold text-[10px]"
          title="Criado localmente sem confirmação da Meta"
        >
          <Clock className="h-3 w-3 text-amber-600" />
          Não Sincronizado
        </Badge>
      )
    }

    switch (tpl.status) {
      case 'PENDING':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 flex items-center gap-1 font-semibold text-[10px]">
            <Clock className="h-3 w-3 text-amber-600" />
            {isSyncedWithMeta ? 'Em Análise (Meta)' : 'Pendente / Não Sincronizado'}
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 flex items-center gap-1 font-semibold text-[10px]">
            <XCircle className="h-3 w-3 text-rose-600" />
            {isSyncedWithMeta ? 'Rejeitado pela Meta' : 'Rejeitado'}
          </Badge>
        )
      default:
        return <Badge variant="outline">{tpl.status}</Badge>
    }
  }

  const currentExtractedVars = extractVariablesFromBody(formData.body)

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-emerald-600" />
            Templates do WhatsApp Business
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Modelos de mensagens aprovados para iniciar conversas com novos clientes e fora da
            janela de 24h.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={handleSyncMeta}
            disabled={syncing}
            className="text-xs border-slate-300 dark:border-slate-700 h-9"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 text-emerald-600 ${syncing ? 'animate-spin' : ''}`}
            />
            {syncing ? 'Sincronizando...' : 'Sincronizar com Meta API'}
          </Button>
          <Button
            onClick={handleOpenCreate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Template
          </Button>
        </div>
      </div>

      {/* Info Notice Box */}
      <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 dark:text-slate-300">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            Regra Oficial do WhatsApp Cloud API (Janela de 24 horas):
          </p>
          <p className="mt-0.5 text-emerald-800 dark:text-emerald-300">
            Para iniciar conversa com clientes novos que ainda não mandaram mensagem, ou responder
            clientes cujo último contato foi há mais de 24h, o WhatsApp exige o uso exclusivo de{' '}
            <strong>Templates Aprovados</strong>. Variáveis no formato{' '}
            <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded text-emerald-700 font-mono text-[11px] font-bold">
              {'{{nome}}'}
            </code>{' '}
            são substituídas automaticamente com os dados do cliente.
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, texto ou variável..."
            className="pl-9 text-xs bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-40 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="UTILITY">Utilidade (Utility)</SelectItem>
              <SelectItem value="MARKETING">Marketing</SelectItem>
              <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36 text-xs h-9 bg-slate-50 dark:bg-slate-800">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="APPROVED">Aprovados</SelectItem>
              <SelectItem value="PENDING">Pendentes</SelectItem>
              <SelectItem value="REJECTED">Rejeitados</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-slate-500 font-medium ml-1">
            {filteredTemplates.length} {filteredTemplates.length === 1 ? 'template' : 'templates'}
          </span>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-emerald-600 mb-2" />
          Carregando templates do WhatsApp...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 flex items-center justify-center mx-auto">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">
            Nenhum template encontrado
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Crie seu primeiro template aprovado ou clique em "Sincronizar com Meta API" para
            carregar seus modelos oficiais.
          </p>
          <Button
            onClick={handleOpenCreate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs mt-2"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Criar Primeiro Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl) => {
            const vars = tpl.variables || extractVariablesFromBody(tpl.body)
            return (
              <Card
                key={tpl.id}
                className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-white dark:bg-slate-900"
              >
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <h3 className="font-bold text-xs text-slate-900 dark:text-white font-mono truncate">
                          {tpl.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                        <span className="capitalize">{tpl.category.toLowerCase()}</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <Globe className="h-3 w-3" />
                          {tpl.language || 'pt_BR'}
                        </span>
                      </div>
                    </div>
                    {statusBadge(tpl)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 flex-1">
                  {/* WhatsApp Preview Bubble */}
                  <div className="p-3.5 rounded-2xl bg-[#efeae2]/50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 shadow-sm leading-relaxed whitespace-pre-wrap rounded-tl-none border border-slate-100 dark:border-slate-700">
                      {tpl.body}
                    </div>
                  </div>

                  {/* Variables badges */}
                  {vars.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Variáveis dinâmicas:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {vars.map((v) => (
                          <span
                            key={v}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-medium border border-emerald-200 dark:border-emerald-800"
                          >
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-slate-400">
                    {tpl.meta_template_id
                      ? 'Meta ID: ' + tpl.meta_template_id
                      : 'Não sincronizado com Meta'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEdit(tpl)}
                      className="h-7 text-xs text-slate-600 hover:text-slate-900"
                      title="Editar template"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / Edit Template Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <FileText className="h-5 w-5 text-emerald-600" />
              {editingTemplate ? 'Editar Template do WhatsApp' : 'Cadastrar Template do WhatsApp'}
            </DialogTitle>
            <DialogDescription>
              Defina o identificador oficial e o texto com placeholders dinâmicos como {'{{nome}}'},{' '}
              {'{{produto}}'}, {'{{orcamento}}'}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTemplate} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nome do Template (snake_case) *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: primeiro_contato_lead"
                  required
                  className="mt-1 font-mono text-xs"
                />
                <span className="text-[10px] text-slate-400">
                  Apenas letras minúsculas e sublinhados
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Categoria Meta *
                </label>
                <Select
                  value={formData.category}
                  onValueChange={(val: any) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">Utilidade (Atendimento & Orçamentos)</SelectItem>
                    <SelectItem value="MARKETING">Marketing (Promoções & Reativação)</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticação (Tokens)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Idioma *
                </label>
                <Select
                  value={formData.language}
                  onValueChange={(val) => setFormData({ ...formData, language: val })}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Idioma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Português (Brasil) - pt_BR</SelectItem>
                    <SelectItem value="en_US">Inglês - en_US</SelectItem>
                    <SelectItem value="es">Espanhol - es</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Status de Aprovação *
                </label>
                <Select
                  value={formData.status}
                  onValueChange={(val: any) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">🟢 Aprovado (Pronto para Envio)</SelectItem>
                    <SelectItem value="PENDING">🟡 Em Análise na Meta</SelectItem>
                    <SelectItem value="REJECTED">🔴 Rejeitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Corpo da Mensagem (Body) *
                </label>
                <span className="text-[11px] text-slate-400">
                  Use {'{{nome}}'}, {'{{produto}}'}, {'{{orcamento}}'}
                </span>
              </div>
              <Textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="Olá {{nome}}! Tudo bem? Recebemos seu interesse em {{produto}} e temos uma condição especial para seu pedido..."
                rows={4}
                required
                className="mt-1 font-sans text-xs"
              />
            </div>

            {/* Live Preview Section */}
            {formData.body && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-emerald-600" />
                    Pré-visualização da mensagem simulada:
                  </span>
                  {currentExtractedVars.length > 0 && (
                    <span className="text-[10px] text-emerald-600 font-medium">
                      {currentExtractedVars.length} variáveis detectadas
                    </span>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-[#efeae2]/60 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
                  {renderTemplatePreview(formData.body, previewVars)}
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving
                  ? 'Salvando...'
                  : editingTemplate
                    ? 'Atualizar Template'
                    : 'Cadastrar Template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
