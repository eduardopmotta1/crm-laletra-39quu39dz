import React, { useState, useEffect } from 'react'
import {
  Save,
  MessageSquare,
  Clock,
  Building2,
  ShieldAlert,
  Info,
  Check,
  Copy,
  ExternalLink,
  AlertCircle,
  Archive,
  Layers,
  Plus,
  Edit2,
  Eye,
  EyeOff,
  CheckCircle2,
  Star,
  Sparkles,
} from 'lucide-react'
import { settingsService } from '@/services/settings'
import { columnsService } from '@/services/columns'
import type { SlaConfig, AutoArchiveConfig, KanbanColumn, PostSaleConfig } from '@/types/crm'
import EditColumnModal from '@/components/EditColumnModal'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'

export default function SettingsPage() {
  // WhatsApp Settings
  const [companyName, setCompanyName] = useState('Laletra Gráfica Rápida')
  const [displayPhone, setDisplayPhone] = useState('+55 11 99999-0000')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [verifyToken, setVerifyToken] = useState('laletra_crm_secret_token_2025')

  // SLA Settings (in hours)
  const [slaNoticeHours, setSlaNoticeHours] = useState(6)
  const [slaWarningHours, setSlaWarningHours] = useState(12)
  const [slaUrgentHours, setSlaUrgentHours] = useState(24)

  // Auto-Archive configuration
  const [autoArchive, setAutoArchive] = useState<AutoArchiveConfig>({
    enabled: true,
    wonHours: 24,
    lostHours: 24,
  })

  // Post-Sale configuration
  const [postSaleConfig, setPostSaleConfig] = useState<PostSaleConfig>({
    enabled: true,
    delayDays: 3,
    autoTask: true,
    whatsappTemplate: 'avaliacao_atendimento',
    customMessage:
      'Olá {{nome}}! Seu pedido foi entregue recentemente pela Laletra. Poderia avaliar sua experiência conosco no link: {{link_avaliacao}} ? Agradecemos muito!',
  })

  // Kanban Columns Management
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [editColumnModalOpen, setEditColumnModalOpen] = useState(false)
  const [columnToEdit, setColumnToEdit] = useState<KanbanColumn | null>(null)

  const [saving, setSaving] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)

  const webhookUrl = `${window.location.origin}/api/crm/whatsapp-webhook`

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const [map, sla, autoArch, psCfg, cols] = await Promise.all([
        settingsService.getMap(),
        settingsService.getSlaConfig(),
        settingsService.getAutoArchiveConfig(),
        settingsService.getPostSaleConfig(),
        columnsService.getAll(),
      ])

      if (map['company_name']) setCompanyName(map['company_name'])
      if (map['whatsapp_display_phone']) setDisplayPhone(map['whatsapp_display_phone'])
      if (map['whatsapp_phone_number_id']) setPhoneNumberId(map['whatsapp_phone_number_id'])
      if (map['whatsapp_business_account_id']) setWabaId(map['whatsapp_business_account_id'])
      if (map['whatsapp_access_token']) setAccessToken(map['whatsapp_access_token'])
      if (map['whatsapp_verify_token']) setVerifyToken(map['whatsapp_verify_token'])

      setSlaNoticeHours(
        sla.noticeHours || (sla.noticeMinutes ? Math.round(sla.noticeMinutes / 60) : 6),
      )
      setSlaWarningHours(
        sla.warningHours || (sla.warningMinutes ? Math.round(sla.warningMinutes / 60) : 12),
      )
      setSlaUrgentHours(
        sla.urgentHours || (sla.urgentMinutes ? Math.round(sla.urgentMinutes / 60) : 24),
      )

      setAutoArchive(autoArch)
      setPostSaleConfig(psCfg)
      setColumns(cols)
    } catch (err) {
      console.error('Error loading settings:', err)
    }
  }

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await Promise.all([
        settingsService.setKey('company_name', companyName, 'Nome fantasia da gráfica'),
        settingsService.setKey('whatsapp_display_phone', displayPhone, 'Número WhatsApp visível'),
        settingsService.setKey('whatsapp_phone_number_id', phoneNumberId, 'Meta Phone Number ID'),
        settingsService.setKey(
          'whatsapp_business_account_id',
          wabaId,
          'Meta WhatsApp Business Account ID',
        ),
        settingsService.setKey(
          'whatsapp_access_token',
          accessToken,
          'Token de Acesso Permanente Meta Cloud API',
        ),
        settingsService.setKey(
          'whatsapp_verify_token',
          verifyToken,
          'Token de verificação do Webhook Meta',
        ),
      ])
      toast({
        title: 'Configurações do WhatsApp salvas!',
        description: 'Credenciais da Meta Cloud API atualizadas com sucesso.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao salvar configurações',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSavePostSale = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await settingsService.savePostSaleConfig(postSaleConfig)
      toast({
        title: 'Configurações de Pós-Venda salvas!',
        description: 'As regras de pós-venda automático e avaliação foram atualizadas com sucesso.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar configurações de pós-venda',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSla = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await settingsService.saveSlaConfig({
        noticeMinutes: slaNoticeHours * 60,
        warningMinutes: slaWarningHours * 60,
        urgentMinutes: slaUrgentHours * 60,
        noticeHours: slaNoticeHours,
        warningHours: slaWarningHours,
        urgentHours: slaUrgentHours,
      })
      toast({
        title: 'Regras de SLA salvas!',
        description: 'Prazos de tempo de resposta da equipe atualizados com sucesso.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao salvar SLA',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedWebhook(true)
    setTimeout(() => setCopiedWebhook(false), 2000)
    toast({
      title: 'Copiado para a área de transferência',
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Configurações do CRM Laletra
        </h1>
        <p className="text-sm text-slate-500">
          Gerencie colunas do Kanban, arquivamento automático, WhatsApp Cloud API e SLAs de
          atendimento.
        </p>
      </div>

      <Tabs defaultValue="kanban" className="w-full">
        <TabsList className="grid w-full grid-cols-6 max-w-3xl mb-6">
          <TabsTrigger value="kanban" className="flex items-center gap-1.5 text-xs">
            <Layers className="h-4 w-4" />
            <span>Colunas</span>
          </TabsTrigger>
          <TabsTrigger value="postsale" className="flex items-center gap-1.5 text-xs">
            <Star className="h-4 w-4 text-amber-500" />
            <span>Pós-Venda</span>
          </TabsTrigger>
          <TabsTrigger value="autoarchive" className="flex items-center gap-1.5 text-xs">
            <Archive className="h-4 w-4" />
            <span>Arquivamento</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-1.5 text-xs">
            <MessageSquare className="h-4 w-4" />
            <span>WhatsApp API</span>
          </TabsTrigger>
          <TabsTrigger value="sla" className="flex items-center gap-1.5 text-xs">
            <Clock className="h-4 w-4" />
            <span>SLA</span>
          </TabsTrigger>
          <TabsTrigger value="company" className="flex items-center gap-1.5 text-xs">
            <Building2 className="h-4 w-4" />
            <span>Empresa</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB: PÓS-VENDA & AVALIAÇÃO DO CLIENTE */}
        <TabsContent value="postsale" className="space-y-6">
          <form onSubmit={handleSavePostSale} className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                      Pós-Venda Automático & Convite de Avaliação
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Configure o agendamento de rotinas de pós-venda quando um atendimento for
                      concluído na etapa "Venda fechada".
                    </CardDescription>
                  </div>
                  <Switch
                    checked={postSaleConfig.enabled}
                    onCheckedChange={(checked) =>
                      setPostSaleConfig({ ...postSaleConfig, enabled: checked })
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Delay Option */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Definir quanto tempo após a conclusão da venda o pós-venda será realizado:
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: '1 dia após', days: 1 },
                      { label: '3 dias após (Recomendado)', days: 3 },
                      { label: '7 dias após', days: 7 },
                      { label: '15 dias após', days: 15 },
                    ].map((opt) => (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() =>
                          setPostSaleConfig({ ...postSaleConfig, delayDays: opt.days })
                        }
                        className={`p-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                          postSaleConfig.delayDays === opt.days
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 shadow-sm font-bold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Label className="text-xs text-slate-500">
                      Ou informe em dias personalizados:
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={postSaleConfig.delayDays}
                      onChange={(e) =>
                        setPostSaleConfig({
                          ...postSaleConfig,
                          delayDays: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-24 text-xs h-8"
                    />
                    <span className="text-xs text-slate-400">dia(s) após fechamento</span>
                  </div>
                </div>

                {/* Auto Task Switch */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Criar automaticamente uma tarefa no CRM
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      O sistema cria automaticamente uma tarefa de pós-venda para aquele cliente
                      após o tempo configurado, com o link exclusivo de avaliação.
                    </p>
                  </div>
                  <Switch
                    checked={postSaleConfig.autoTask}
                    onCheckedChange={(checked) =>
                      setPostSaleConfig({ ...postSaleConfig, autoTask: checked })
                    }
                  />
                </div>

                {/* WhatsApp Integration & Templates Info */}
                <div className="space-y-3 pt-2">
                  <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>Mensagem Padrão de Pós-Venda (WhatsApp)</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-300"
                    >
                      API Oficial WhatsApp Business (Janela de 24h)
                    </Badge>
                  </Label>
                  <Textarea
                    value={postSaleConfig.customMessage}
                    onChange={(e) =>
                      setPostSaleConfig({ ...postSaleConfig, customMessage: e.target.value })
                    }
                    rows={3}
                    className="text-xs font-mono resize-none bg-slate-50 dark:bg-slate-800"
                  />
                  <p className="text-[11px] text-slate-400">
                    💡 Variáveis dinâmicas:{' '}
                    <code className="text-emerald-600 font-bold">{'{{nome}}'}</code> e{' '}
                    <code className="text-emerald-600 font-bold">{'{{link_avaliacao}}'}</code>.
                    Quando fora da janela de 24h, o WhatsApp Business utiliza o template aprovado
                    pela Meta.
                  </p>
                </div>
              </CardContent>

              <CardFooter className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Gravando...' : 'Salvar Regras de Pós-Venda'}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        {/* TAB 1: KANBAN COLUMNS */}
        <TabsContent value="kanban" className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-5 w-5 text-emerald-600" />
                  Personalização das Colunas do Kanban
                </CardTitle>
                <CardDescription className="text-xs">
                  Adicione e edite o nome, cor, ordem e tipo de cada etapa. As automações e disparos
                  utilizam o identificador permanente seguro (ex: `needs_response`).
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setColumnToEdit(null)
                  setEditColumnModalOpen(true)
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Nova Coluna
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Nome Visível</th>
                      <th className="py-3 px-4">ID Interno Seguro</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Cor</th>
                      <th className="py-3 px-4">Visibilidade</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {columns.map((col) => (
                      <tr key={col.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white text-sm">
                            {col.name}
                          </div>
                          <div className="text-[11px] text-slate-500">{col.description || '-'}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border">
                            {col.internal_id}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              col.stage_type === 'final'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : col.stage_type === 'initial'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {col.stage_type === 'final'
                              ? '🏁 Final'
                              : col.stage_type === 'initial'
                                ? '🚀 Inicial'
                                : '⚡ Intermediária'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                            <span
                              className={`h-3 w-3 rounded-full ${
                                col.color === 'emerald'
                                  ? 'bg-emerald-500'
                                  : col.color === 'rose'
                                    ? 'bg-rose-500'
                                    : col.color === 'amber'
                                      ? 'bg-amber-500'
                                      : col.color === 'purple'
                                        ? 'bg-purple-500'
                                        : col.color === 'indigo'
                                          ? 'bg-indigo-500'
                                          : col.color === 'cyan'
                                            ? 'bg-cyan-500'
                                            : col.color === 'slate'
                                              ? 'bg-slate-500'
                                              : 'bg-blue-500'
                              }`}
                            />
                            {col.color || 'blue'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {col.is_visible !== false ? (
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5" />
                              Visível
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium flex items-center gap-1">
                              <EyeOff className="h-3.5 w-3.5" />
                              Oculta
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setColumnToEdit(col)
                              setEditColumnModalOpen(true)
                            }}
                            className="h-8 text-xs font-semibold text-slate-600 hover:text-emerald-700"
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: AUTO-ARCHIVE SETTINGS */}
        <TabsContent value="autoarchive" className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Archive className="h-5 w-5 text-emerald-600" />
                Regras de Arquivamento Automático
              </CardTitle>
              <CardDescription className="text-xs">
                Defina o tempo limite para que atendimentos finalizados sejam arquivados
                automaticamente, limpando o Kanban principal sem perder dados históricos do cliente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Venda Fechada */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                        Venda Fechada (Won)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Tempo de permanência no Kanban antes de arquivar
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Arquivar após (em Horas):</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="720"
                        value={autoArchive.wonHours}
                        onChange={(e) =>
                          setAutoArchive({
                            ...autoArchive,
                            wonHours: Number(e.target.value) || 24,
                          })
                        }
                        className="w-32 font-bold text-sm"
                      />
                      <span className="text-xs text-slate-500">horas (ex: 24h = 1 dia)</span>
                    </div>
                  </div>
                </div>

                {/* Venda Perdida */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
                      <Archive className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                        Não Fechou / Venda Perdida
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Tempo de permanência no Kanban antes de arquivar
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Arquivar após (em Horas):</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="720"
                        value={autoArchive.lostHours}
                        onChange={(e) =>
                          setAutoArchive({
                            ...autoArchive,
                            lostHours: Number(e.target.value) || 24,
                          })
                        }
                        className="w-32 font-bold text-sm"
                      />
                      <span className="text-xs text-slate-500">horas (ex: 24h = 1 dia)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    setSaving(true)
                    try {
                      await settingsService.saveAutoArchiveConfig(autoArchive)
                      toast({
                        title: 'Configuração salva!',
                        description: 'Regras de arquivamento automático atualizadas com sucesso.',
                      })
                    } catch (err: any) {
                      toast({
                        title: 'Erro ao salvar',
                        description: err?.message,
                        variant: 'destructive',
                      })
                    } finally {
                      setSaving(false)
                    }
                  }}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4 font-semibold"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Gravando...' : 'Salvar Regras de Arquivamento'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: WHATSAPP API */}
        <TabsContent value="whatsapp" className="space-y-6">
          <form onSubmit={handleSaveWhatsApp} className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-emerald-600" />
                  Credenciais Meta Cloud API
                </CardTitle>
                <CardDescription className="text-xs">
                  Insira as credenciais do seu aplicativo Meta for Developers para envio oficial do
                  WhatsApp Business.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneId" className="text-xs">
                      Phone Number ID *
                    </Label>
                    <Input
                      id="phoneId"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Ex: 109876543210987"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="wabaId" className="text-xs">
                      WhatsApp Business Account ID (WABA ID)
                    </Label>
                    <Input
                      id="wabaId"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      placeholder="Ex: 987654321098765"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accessToken" className="text-xs">
                    Access Token Permanente (System User Token) *
                  </Label>
                  <Input
                    id="accessToken"
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAA..."
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-slate-500">
                    Gere um token de longa duração no Meta Business Manager com permissões{' '}
                    <code>whatsapp_business_messaging</code> e{' '}
                    <code>whatsapp_business_management</code>.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Webhook Settings Box */}
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ExternalLink className="h-5 w-5 text-emerald-600" />
                  Configuração de Webhook (Recebimento de Mensagens)
                </CardTitle>
                <CardDescription className="text-xs">
                  Cadastre esta URL e Token no painel do Meta for Developers para receber mensagens
                  em tempo real.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">URL de Retorno (Callback URL)</Label>
                  <div className="flex gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-xs bg-slate-50" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(webhookUrl)}
                      className="shrink-0"
                    >
                      {copiedWebhook ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verifyToken" className="text-xs">
                    Token de Verificação (Verify Token)
                  </Label>
                  <Input
                    id="verifyToken"
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Salvando...' : 'Salvar Credenciais WhatsApp'}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* TAB 4: SLA RULES */}
        <TabsContent value="sla" className="space-y-6">
          <form onSubmit={handleSaveSla} className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-5 w-5 text-emerald-600" />
                  Prazos e Alertas de SLA para Atendimento
                </CardTitle>
                <CardDescription className="text-xs">
                  Controle os prazos máximos para a equipe responder aos clientes aguardando no
                  WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Notice (Amarelo) */}
                  <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 space-y-2">
                    <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Atenção (Amarelo)
                    </div>
                    <Label className="text-xs text-slate-600">Tempo de espera:</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="168"
                        value={slaNoticeHours}
                        onChange={(e) => setSlaNoticeHours(Number(e.target.value))}
                        className="font-bold text-sm bg-white"
                      />
                      <span className="text-xs text-slate-500">horas</span>
                    </div>
                  </div>

                  {/* Warning (Laranja) */}
                  <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 space-y-2">
                    <div className="flex items-center gap-2 text-orange-700 font-bold text-xs uppercase">
                      <span className="h-2 w-2 rounded-full bg-orange-500" />
                      Alerta (Laranja)
                    </div>
                    <Label className="text-xs text-slate-600">Tempo de espera:</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="168"
                        value={slaWarningHours}
                        onChange={(e) => setSlaWarningHours(Number(e.target.value))}
                        className="font-bold text-sm bg-white"
                      />
                      <span className="text-xs text-slate-500">horas</span>
                    </div>
                  </div>

                  {/* Urgent (Vermelho) */}
                  <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 space-y-2">
                    <div className="flex items-center gap-2 text-rose-700 font-bold text-xs uppercase">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Crítico (Vermelho)
                    </div>
                    <Label className="text-xs text-slate-600">Tempo de espera:</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="168"
                        value={slaUrgentHours}
                        onChange={(e) => setSlaUrgentHours(Number(e.target.value))}
                        className="font-bold text-sm bg-white"
                      />
                      <span className="text-xs text-slate-500">horas</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Salvando...' : 'Salvar Regras de SLA'}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* TAB 5: COMPANY INFO */}
        <TabsContent value="company" className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                Dados Cadastrais da Gráfica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-xs">
                    Nome da Empresa
                  </Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="displayPhone" className="text-xs">
                    Telefone WhatsApp Principal
                  </Label>
                  <Input
                    id="displayPhone"
                    value={displayPhone}
                    onChange={(e) => setDisplayPhone(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Column Modal */}
      <EditColumnModal
        isOpen={editColumnModalOpen}
        onClose={() => {
          setEditColumnModalOpen(false)
          setColumnToEdit(null)
        }}
        column={columnToEdit}
        allColumns={columns}
        onSaved={() => loadSettings()}
      />
    </div>
  )
}
