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
  XCircle,
  Star,
  Sparkles,
  Activity,
  Loader2,
  RefreshCw,
  Server,
  Zap,
  Globe,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import pb from '@/lib/pocketbase/client'
import { settingsService } from '@/services/settings'
import { columnsService } from '@/services/columns'
import { whatsappService } from '@/services/whatsapp'
import type {
  SlaConfig,
  AutoArchiveConfig,
  KanbanColumn,
  PostSaleConfig,
  AutomationConfig,
} from '@/types/crm'
import EditColumnModal from '@/components/EditColumnModal'
import UsersPermissionsSettings from '@/components/UsersPermissionsSettings'
import AuditLogsTab from '@/components/AuditLogsTab'
import { useAuth } from '@/context/AuthContext'
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
  const [verifyToken, setVerifyToken] = useState('laletra_crm_webhook_2024')

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

  // Automation configuration
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig>({
    waitingResponseAltaMinutes: 15,
    waitingResponseUrgenteMinutes: 60,
    quoteNoReturnAltaDays: 1,
    quoteNoReturnUrgenteDays: 3,
    followupOverdueUrgenteDays: 2,
    proofWaitingAltaDays: 1,
    proofWaitingUrgenteDays: 2,
    orderOverdueUrgenteDays: 1,
    dissatisfiedUrgenteHours: 24,
    postSaleAltaDays: 1,
    postSaleUrgenteDays: 3,
    executionModes: {},
  })

  // Enabled switches for automation rules
  const [automationSwitches, setAutomationSwitches] = useState<Record<string, boolean>>({
    waiting_response: true,
    quote_no_return: true,
    followup_overdue: true,
    proof_waiting: true,
    order_overdue: true,
    dissatisfied: true,
    postsale: true,
  })

  // Kanban Columns Management
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [editColumnModalOpen, setEditColumnModalOpen] = useState(false)
  const [columnToEdit, setColumnToEdit] = useState<KanbanColumn | null>(null)

  const [saving, setSaving] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)

  // Webhook Testing State
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testResult, setTestResult] = useState<{
    testedUrl: string
    status: number | string
    responseBody: string
    expectedToken: string
    sentChallenge: string
    isSuccess: boolean
    errorMessage?: string
    testedAt?: string
  } | null>(null)

  // Processor Health State
  const [processorHealth, setProcessorHealth] = useState<{
    status: 'ok' | 'error' | 'pending'
    lastRun: string | null
    nextRun: string | null
    durationMs: number | null
    lastError: string | null
    pendingCount: number
    lastTotalItems: number | null
    loading: boolean
  }>({
    status: 'pending',
    lastRun: null,
    nextRun: null,
    durationMs: null,
    lastError: null,
    pendingCount: 0,
    lastTotalItems: null,
    loading: true,
  })

  // Webhook Diagnostics & Publication Status State
  const [publicationStatus, setPublicationStatus] = useState<{
    checked: boolean
    checking: boolean
    isPublished: boolean
    status: string
    service?: string
    timestamp?: string
    error?: string
    rawResponse?: string
    lastCheckedAt?: string
  }>({
    checked: false,
    checking: false,
    isPublished: false,
    status: 'idle',
  })

  const [diagnosticsData, setDiagnosticsData] = useState<{
    loading: boolean
    published: boolean
    webhook_url: string
    last_meta_event_at: string | null
    last_meta_event_type?: string
    total_inbound_messages?: number
    total_meta_messages?: number
    server_time: string
    lastFetchedAt?: string
  } | null>(null)

  const { isAdmin, hasPermission } = useAuth()
  const productionWebhookUrl =
    'https://crm-grafica-whatsapp-7b1a5.goskip.app/api/crm/whatsapp-webhook'
  const currentOriginWebhookUrl = `${window.location.origin}/api/crm/whatsapp-webhook`
  const [useProductionUrl, setUseProductionUrl] = useState(true)
  const webhookUrl = useProductionUrl ? productionWebhookUrl : currentOriginWebhookUrl

  const canManageUsers = isAdmin || hasPermission('settings_manage_users')
  const canManagePerms = isAdmin || hasPermission('settings_manage_permissions')
  const canViewAudit = isAdmin || hasPermission('settings_view_logs')
  const canEditKanban = isAdmin || hasPermission('settings_edit_kanban')
  const canConfigWA = isAdmin || hasPermission('settings_config_whatsapp')
  const canConfigSla = isAdmin || hasPermission('settings_edit_automations')
  const canConfigPS = isAdmin || hasPermission('settings_config_postsale')

  useEffect(() => {
    loadSettings()
    checkPublicationAndDiagnostics()
    loadProcessorHealth()
  }, [])

  const loadProcessorHealth = async () => {
    try {
      const map = await settingsService.getMap()
      let pendingCount = 0
      try {
        const pendingRes = await pb.collection('pending_resolutions').getList(1, 1, {
          filter: 'resolved_at = null || resolved_at = ""',
          requestKey: null,
        })
        pendingCount = pendingRes.totalItems
      } catch (pErr) {
        console.warn('Could not count pending resolutions:', pErr)
      }

      const lastRun = map['automation_processor_last_run'] || null
      const status =
        (map['automation_processor_status'] as 'ok' | 'error') || (lastRun ? 'ok' : 'pending')
      const durationMs = map['automation_processor_last_duration_ms']
        ? Number(map['automation_processor_last_duration_ms'])
        : null
      const lastError = map['automation_processor_last_error'] || null
      const lastTotalItems = map['automation_processor_last_total_items']
        ? Number(map['automation_processor_last_total_items'])
        : null

      let nextRun: string | null = null
      if (lastRun) {
        const lastDate = new Date(lastRun)
        const nextDate = new Date(lastDate.getTime() + 5 * 60 * 1000)
        nextRun = nextDate.toISOString()
      }

      setProcessorHealth({
        status,
        lastRun,
        nextRun,
        durationMs,
        lastError,
        pendingCount,
        lastTotalItems,
        loading: false,
      })
    } catch (err) {
      console.error('Error loading processor health:', err)
      setProcessorHealth((prev) => ({ ...prev, loading: false }))
    }
  }

  const checkPublicationAndDiagnostics = async () => {
    setPublicationStatus((prev) => ({ ...prev, checking: true }))
    try {
      const [pubRes, diagRes] = await Promise.all([
        whatsappService.checkPublicationStatus(productionWebhookUrl),
        whatsappService.getWebhookDiagnostics(),
      ])

      const nowIso = new Date().toISOString()
      setPublicationStatus({
        checked: true,
        checking: false,
        isPublished: pubRes.isPublished,
        status: pubRes.status,
        service: pubRes.service,
        timestamp: pubRes.timestamp,
        error: pubRes.error,
        rawResponse: pubRes.rawResponse,
        lastCheckedAt: nowIso,
      })

      setDiagnosticsData({
        loading: false,
        published: diagRes.published,
        webhook_url: diagRes.webhook_url,
        last_meta_event_at: diagRes.last_meta_event_at,
        last_meta_event_type: diagRes.last_meta_event_type,
        total_inbound_messages: diagRes.total_inbound_messages,
        total_meta_messages: diagRes.total_meta_messages,
        server_time: diagRes.server_time,
        lastFetchedAt: nowIso,
      })
    } catch (err: any) {
      setPublicationStatus((prev) => ({
        ...prev,
        checked: true,
        checking: false,
        isPublished: false,
        status: 'error',
        error: err?.message || 'Falha ao verificar status',
        lastCheckedAt: new Date().toISOString(),
      }))
    }
  }

  const loadSettings = async () => {
    try {
      const [map, sla, autoArch, psCfg, cols, autoCfg] = await Promise.all([
        settingsService.getMap(),
        settingsService.getSlaConfig(),
        settingsService.getAutoArchiveConfig(),
        settingsService.getPostSaleConfig(),
        columnsService.getAll(),
        settingsService.getAutomationConfig(),
      ])

      if (map['company_name']) setCompanyName(map['company_name'])
      if (map['whatsapp_display_phone']) setDisplayPhone(map['whatsapp_display_phone'])
      if (map['whatsapp_phone_number_id']) setPhoneNumberId(map['whatsapp_phone_number_id'])
      if (map['whatsapp_business_account_id']) setWabaId(map['whatsapp_business_account_id'])
      if (map['whatsapp_access_token']) setAccessToken(map['whatsapp_access_token'])
      if (map['whatsapp_verify_token']) {
        setVerifyToken(map['whatsapp_verify_token'])
      } else {
        setVerifyToken('laletra_crm_webhook_2024')
      }
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
      setAutomationConfig(autoCfg)

      setAutomationSwitches({
        waiting_response: map['automation_waiting_response_enabled'] !== 'false',
        quote_no_return: map['automation_quote_no_return_enabled'] !== 'false',
        followup_overdue: map['automation_followup_overdue_enabled'] !== 'false',
        proof_waiting: map['automation_proof_waiting_enabled'] !== 'false',
        order_overdue: map['automation_order_overdue_enabled'] !== 'false',
        dissatisfied: map['automation_dissatisfied_enabled'] !== 'false',
        postsale: map['automation_postsale_enabled'] !== 'false',
      })
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

  const handleSaveAutomations = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await settingsService.saveAutomationConfig(automationConfig, automationSwitches)
      toast({
        title: 'Regras de Automação salvas!',
        description:
          'Thresholds e regras de priorização da Central de Pendências atualizados com sucesso.',
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
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedWebhook(true)
    setTimeout(() => setCopiedWebhook(false), 2000)
    toast({
      title: 'Copiado para a área de transferência',
    })
  }

  const handleTestWebhook = async () => {
    setTestingWebhook(true)
    const tokenToTest = verifyToken || 'laletra_crm_webhook_2024'
    const challengeToTest = 'test_challenge_' + Math.floor(100000 + Math.random() * 900000)
    const targetUrl = new URL(productionWebhookUrl)
    targetUrl.searchParams.set('hub.mode', 'subscribe')
    targetUrl.searchParams.set('hub.verify_token', tokenToTest)
    targetUrl.searchParams.set('hub.challenge', challengeToTest)

    const fullTestedUrl = targetUrl.toString()

    try {
      const res = await fetch(fullTestedUrl, {
        method: 'GET',
      })
      const text = await res.text()
      const isSuccess = res.status === 200 && text.trim() === challengeToTest

      setTestResult({
        testedUrl: fullTestedUrl,
        status: res.status,
        responseBody: text,
        expectedToken: tokenToTest,
        sentChallenge: challengeToTest,
        isSuccess,
        testedAt: new Date().toISOString(),
      })
      setTestModalOpen(true)
    } catch (err: any) {
      setTestResult({
        testedUrl: fullTestedUrl,
        status: 'Erro de Conexão',
        responseBody: err?.message || 'Falha na requisição de rede',
        expectedToken: tokenToTest,
        sentChallenge: challengeToTest,
        isSuccess: false,
        errorMessage: err?.message,
        testedAt: new Date().toISOString(),
      })
      setTestModalOpen(true)
    } finally {
      setTestingWebhook(false)
    }
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

      <Tabs defaultValue={canManageUsers || canManagePerms ? 'users' : 'kanban'} className="w-full">
        <TabsList className="flex flex-wrap gap-1 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {(canManageUsers || canManagePerms) && (
            <TabsTrigger value="users" className="flex items-center gap-1.5 text-xs">
              <ShieldAlert className="h-4 w-4 text-emerald-600" />
              <span>Usuários & Permissões</span>
            </TabsTrigger>
          )}
          {canViewAudit && (
            <TabsTrigger value="audit" className="flex items-center gap-1.5 text-xs">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span>Logs de Auditoria</span>
            </TabsTrigger>
          )}
          {canEditKanban && (
            <TabsTrigger value="kanban" className="flex items-center gap-1.5 text-xs">
              <Layers className="h-4 w-4" />
              <span>Colunas Kanban</span>
            </TabsTrigger>
          )}
          {canConfigSla && (
            <TabsTrigger value="automations" className="flex items-center gap-1.5 text-xs">
              <Zap className="h-4 w-4 text-amber-500" />
              <span>Automações</span>
            </TabsTrigger>
          )}
          {canConfigSla && (
            <TabsTrigger value="sla" className="flex items-center gap-1.5 text-xs">
              <Clock className="h-4 w-4" />
              <span>SLA & Central</span>
            </TabsTrigger>
          )}
          {canConfigPS && (
            <TabsTrigger value="postsale" className="flex items-center gap-1.5 text-xs">
              <Star className="h-4 w-4 text-amber-500" />
              <span>Pós-Venda</span>
            </TabsTrigger>
          )}
          {canEditKanban && (
            <TabsTrigger value="autoarchive" className="flex items-center gap-1.5 text-xs">
              <Archive className="h-4 w-4" />
              <span>Arquivamento</span>
            </TabsTrigger>
          )}
          {canConfigWA && (
            <TabsTrigger value="whatsapp" className="flex items-center gap-1.5 text-xs">
              <MessageSquare className="h-4 w-4" />
              <span>WhatsApp API</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="company" className="flex items-center gap-1.5 text-xs">
            <Building2 className="h-4 w-4" />
            <span>Empresa</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB: USERS & PERMISSIONS */}
        {(canManageUsers || canManagePerms) && (
          <TabsContent value="users" className="space-y-6">
            <UsersPermissionsSettings />
          </TabsContent>
        )}

        {/* TAB: AUDIT LOGS */}
        {canViewAudit && (
          <TabsContent value="audit" className="space-y-6">
            <AuditLogsTab />
          </TabsContent>
        )}

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
                      Configure o agendamento automático de pós-venda disparado quando o pedido de
                      produção vinculado for movido para a etapa "Concluído".
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
                    Definir quanto tempo após a conclusão do pedido de produção o pós-venda será
                    realizado:
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
                    <span className="text-xs text-slate-400">dia(s) após conclusão do pedido</span>
                  </div>
                </div>

                {/* Auto Task Switch */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Criar automaticamente uma tarefa no CRM vinculada ao pedido
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      O sistema cria automaticamente uma tarefa de pós-venda para aquele cliente e
                      pedido após o tempo configurado, com o link exclusivo de avaliação.
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
          {/* Status Indicator Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border bg-white dark:bg-slate-900 shadow-sm border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  publicationStatus.checking
                    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    : publicationStatus.isPublished
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                }`}
              >
                {publicationStatus.checking ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : publicationStatus.isPublished ? (
                  <Globe className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-rose-600" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Status de Publicação do Webhook:
                  </span>
                  {publicationStatus.checking ? (
                    <Badge variant="outline" className="text-xs text-slate-600 animate-pulse">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Verificando publicação...
                    </Badge>
                  ) : publicationStatus.isPublished ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">
                      ✅ Publicado — URL de produção ativa
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs font-semibold">
                      ⚠️ Projeto não publicado — clique em Publicar no Builder do Skip
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {publicationStatus.isPublished
                    ? 'O endpoint público do WhatsApp está respondendo ativamente com JSON formatado e pronto para a Meta.'
                    : 'A URL de produção ainda não respondeu com o JSON ativo do webhook. Publique o projeto no Skip para ativar.'}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={checkPublicationAndDiagnostics}
              disabled={publicationStatus.checking}
              className="shrink-0 text-xs font-semibold h-8"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${
                  publicationStatus.checking ? 'animate-spin text-emerald-600' : ''
                }`}
              />
              {publicationStatus.checking ? 'Verificando...' : 'Verificar novamente'}
            </Button>
          </div>

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
                  Cadastre a <strong>URL de Retorno</strong> e o{' '}
                  <strong>Token de Verificação</strong> no painel do{' '}
                  <em>Meta for Developers (WhatsApp &gt; Configuração &gt; Webhook)</em> para
                  validar e receber mensagens em tempo real.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>URL Permanente de Produção:</strong> A Meta exige uma URL pública
                    estável. Utilize o endereço de produção abaixo para evitar falhas de validação.
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      URL de Retorno (Callback URL) para a Meta
                    </Label>
                    <button
                      type="button"
                      onClick={() => setUseProductionUrl(!useProductionUrl)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline"
                    >
                      {useProductionUrl
                        ? 'Alternar para URL do navegador atual'
                        : 'Alternar para URL de Produção'}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={webhookUrl}
                      readOnly
                      className="font-mono text-xs bg-slate-50 dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-200"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(webhookUrl)}
                      className="shrink-0"
                    >
                      {copiedWebhook ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Copie exatamente esta URL e cole no campo <strong>URL de retorno</strong> no
                    painel de Webhooks da Meta.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verifyToken" className="text-xs font-semibold">
                    Token de Verificação (Verify Token) *
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="verifyToken"
                      value={verifyToken}
                      onChange={(e) => setVerifyToken(e.target.value)}
                      placeholder="Ex: laletra_crm_webhook_2024"
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(verifyToken)}
                      className="shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Insira o mesmo valor no campo <strong>Token de verificação</strong> na Meta.
                    Padrão recomendado: <code>laletra_crm_webhook_2024</code>.
                  </p>
                </div>

                {/* Test Webhook Action Box */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-emerald-600" />
                      Validar Handshake da Meta
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Simula a requisição GET da Meta com seu token configurado e valida a resposta
                      de challenge.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestWebhook}
                    disabled={testingWebhook}
                    className="border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 shrink-0 text-xs font-semibold"
                  >
                    {testingWebhook ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Testando...
                      </>
                    ) : (
                      <>
                        <Activity className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                        Testar Webhook
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Diagnostics Panel Card */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                      <Server className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Diagnóstico do Webhook</CardTitle>
                      <CardDescription className="text-xs">
                        Monitoramento de integridade, status de publicação e telemetria de eventos
                        Meta.
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={checkPublicationAndDiagnostics}
                    disabled={publicationStatus.checking}
                    className="text-xs h-8 text-slate-600 hover:text-emerald-600"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-1.5 ${
                        publicationStatus.checking ? 'animate-spin' : ''
                      }`}
                    />
                    Atualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Item 1: Status de Publicação */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-slate-400" />
                        Status da Publicação
                      </span>
                      {publicationStatus.checking ? (
                        <Badge variant="outline" className="text-[10px] animate-pulse">
                          Verificando...
                        </Badge>
                      ) : publicationStatus.isPublished ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] font-semibold">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Online / Ativo
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] font-semibold">
                          <XCircle className="h-3 w-3 mr-1" />
                          Não publicado
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {publicationStatus.isPublished
                        ? 'URL de Produção respondendo com sucesso'
                        : 'Requer clique em Publicar no Builder'}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate">
                      {productionWebhookUrl}
                    </p>
                  </div>

                  {/* Item 2: Último teste realizado */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-slate-400" />
                        Último Teste Realizado
                      </span>
                      {testResult ? (
                        <Badge
                          className={`text-[10px] font-semibold ${
                            testResult.isSuccess
                              ? 'bg-emerald-600 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {testResult.isSuccess ? '✅ Sucesso' : '❌ Falhou'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-slate-400">
                          Nenhum teste nesta sessão
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {testResult
                        ? `${new Date(testResult.testedAt || Date.now()).toLocaleDateString('pt-BR')} às ${new Date(testResult.testedAt || Date.now()).toLocaleTimeString('pt-BR')}`
                        : 'Clique em "Testar Webhook" acima para executar'}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {testResult
                        ? `HTTP Status: ${testResult.status} | Token: ${testResult.expectedToken}`
                        : 'Simula handshake subscribe da Meta'}
                    </p>
                  </div>

                  {/* Item 3: Último evento recebido da Meta */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-slate-400" />
                        Último Evento Recebido da Meta
                      </span>
                      {diagnosticsData?.last_meta_event_at ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-emerald-600 border-emerald-300"
                        >
                          {diagnosticsData.last_meta_event_type || 'Mensagem'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-slate-400">
                          Sem eventos
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {diagnosticsData?.last_meta_event_at
                        ? `${new Date(diagnosticsData.last_meta_event_at).toLocaleDateString('pt-BR')} às ${new Date(diagnosticsData.last_meta_event_at).toLocaleTimeString('pt-BR')}`
                        : 'Nenhum evento registrado ainda'}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {diagnosticsData?.total_inbound_messages !== undefined
                        ? `Total de mensagens recebidas: ${diagnosticsData.total_inbound_messages}`
                        : 'Consultado na collection de mensagens do CRM'}
                    </p>
                  </div>

                  {/* Item 4: Timestamp da última verificação */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        Última Verificação do Diagnóstico
                      </span>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {publicationStatus.checked ? 'Atualizado' : 'Aguardando'}
                      </Badge>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {publicationStatus.lastCheckedAt
                        ? `${new Date(publicationStatus.lastCheckedAt).toLocaleDateString('pt-BR')} às ${new Date(publicationStatus.lastCheckedAt).toLocaleTimeString('pt-BR')}`
                        : 'Não verificado'}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Horário do servidor:{' '}
                      {diagnosticsData?.server_time
                        ? new Date(diagnosticsData.server_time).toLocaleTimeString('pt-BR')
                        : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
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
        {/* TAB: AUTOMAÇÕES */}
        <TabsContent value="automations" className="space-y-6">
          {/* BLOCO: SAÚDE DAS AUTOMAÇÕES & BACKGROUND CRON PROCESSOR */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-900/20">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <Activity className="h-4 w-4 text-emerald-600" />
                    Saúde do Motor de Automações (Background Cron)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Monitoramento em tempo real do processador de segundo plano (PocketBase Cron a
                    cada 5 min).
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadProcessorHealth}
                    className="h-7 text-xs px-2.5"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Atualizar
                  </Button>
                  <Badge
                    variant="outline"
                    className={`text-xs px-2.5 py-0.5 font-semibold ${
                      processorHealth.status === 'ok'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                        : processorHealth.status === 'error'
                          ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                          : 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full mr-1.5 ${
                        processorHealth.status === 'ok'
                          ? 'bg-emerald-500 animate-pulse'
                          : processorHealth.status === 'error'
                            ? 'bg-rose-500'
                            : 'bg-amber-500'
                      }`}
                    />
                    {processorHealth.status === 'ok'
                      ? '● Ativo e Saudável'
                      : processorHealth.status === 'error'
                        ? '🔴 Erro na Execução'
                        : '🟡 Aguardando Execução'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* 1. Status do Processador */}
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 block text-[11px]">Status</span>
                  <div className="mt-1 font-bold flex items-center gap-1.5">
                    {processorHealth.status === 'ok' ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Operacional
                      </span>
                    ) : processorHealth.status === 'error' ? (
                      <span className="text-rose-600 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" /> Com Falha
                      </span>
                    ) : (
                      <span className="text-slate-600">Registrado (Cron)</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Frequência: a cada 5 min
                  </span>
                </div>

                {/* 2. Última Execução */}
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 block text-[11px]">Última Execução</span>
                  <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {processorHealth.lastRun
                      ? new Date(processorHealth.lastRun).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                        })
                      : 'Aguardando 1º ciclo'}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {processorHealth.durationMs !== null
                      ? `Duração: ${processorHealth.durationMs}ms`
                      : 'Background automático'}
                  </span>
                </div>

                {/* 3. Próxima Execução */}
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 block text-[11px]">Próxima Execução</span>
                  <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {processorHealth.nextRun
                      ? new Date(processorHealth.nextRun).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : 'Em até 5 minutos'}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Automático no servidor
                  </span>
                </div>

                {/* 4. Pendências Ativas */}
                <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 block text-[11px]">Pendências Abertas</span>
                  <div className="mt-1 font-bold text-slate-900 dark:text-white text-base">
                    {processorHealth.pendingCount}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Na Central de Pendências
                  </span>
                </div>
              </div>

              {processorHealth.lastError && (
                <div className="mt-3 p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    <strong>Detalhe do último erro:</strong> {processorHealth.lastError}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <form onSubmit={handleSaveAutomations} className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Camada de Configuração de Automações & Gatilhos
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure os prazos, limites de priorização (Alta e Urgente) e monitore o modo de
                  execução de cada regra do CRM Laletra.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Info Alert */}
                <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Processamento Contínuo em Segundo Plano:</strong> As regras abaixo são
                    processadas tanto sob demanda na Central de Pendências quanto automaticamente a
                    cada 5 minutos pelo Background Cron Processor do PocketBase.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card 1: Cliente aguardando resposta WhatsApp */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                              Cliente aguardando resposta no WhatsApp
                            </CardTitle>
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[10px] font-mono border-0">
                              PAGE LOAD
                            </Badge>
                          </div>
                          <CardDescription className="text-[11px] mt-1">
                            Monitora mensagens recebidas do cliente sem retorno do atendente.
                          </CardDescription>
                        </div>
                        <Switch
                          checked={automationSwitches.waiting_response !== false}
                          onCheckedChange={(c) =>
                            setAutomationSwitches({ ...automationSwitches, waiting_response: c })
                          }
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                            Alta a partir de (minutos):
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            value={automationConfig.waitingResponseAltaMinutes}
                            onChange={(e) =>
                              setAutomationConfig({
                                ...automationConfig,
                                waitingResponseAltaMinutes: Math.max(
                                  1,
                                  Number(e.target.value) || 1,
                                ),
                              })
                            }
                            className="text-xs font-bold bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                            Urgente a partir de (minutos):
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            value={automationConfig.waitingResponseUrgenteMinutes}
                            onChange={(e) =>
                              setAutomationConfig({
                                ...automationConfig,
                                waitingResponseUrgenteMinutes: Math.max(
                                  1,
                                  Number(e.target.value) || 1,
                                ),
                              })
                            }
                            className="text-xs font-bold bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Orçamento sem retorno */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                              Orçamento sem retorno
                            </CardTitle>
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[10px] font-mono border-0">
                              PAGE LOAD
                            </Badge>
                          </div>
                          <CardDescription className="text-[11px] mt-1">
                            Orçamentos enviados ao cliente aguardando fechamento ou resposta.
                          </CardDescription>
                        </div>
                        <Switch
                          checked={automationSwitches.quote_no_return !== false}
                          onCheckedChange={(c) =>
                            setAutomationSwitches({ ...automationSwitches, quote_no_return: c })
                          }
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                            Alta a partir de (dias):
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={90}
                            value={automationConfig.quoteNoReturnAltaDays}
                            onChange={(e) =>
                              setAutomationConfig({
                                ...automationConfig,
                                quoteNoReturnAltaDays: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="text-xs font-bold bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                            Urgente a partir de (dias):
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={90}
                            value={automationConfig.quoteNoReturnUrgenteDays}
                            onChange={(e) =>
                              setAutomationConfig({
                                ...automationConfig,
                                quoteNoReturnUrgenteDays: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="text-xs font-bold bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: Follow-up vencido */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                              Follow-up vencido
                            </CardTitle>
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[10px] font-mono border-0">
                              PAGE LOAD
                            </Badge>
                          </div>
                          <CardDescription className="text-[11px] mt-1">
                            Tarefas e follow-ups com data limite ultrapassada.
                          </CardDescription>
                        </div>
                        <Switch
                          checked={automationSwitches.followup_overdue !== false}
                          onCheckedChange={(c) =>
                            setAutomationSwitches({ ...automationSwitches, followup_overdue: c })
                          }
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                          Urgente a partir de (dias de atraso):
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={automationConfig.followupOverdueUrgenteDays}
                          onChange={(e) =>
                            setAutomationConfig({
                              ...automationConfig,
                              followupOverdueUrgenteDays: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="text-xs font-bold bg-white dark:bg-slate-800"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 4: Arte aguardando aprovação */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                              Arte aguardando aprovação
                            </CardTitle>
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[10px] font-mono border-0">
                              PAGE LOAD
                            </Badge>
                          </div>
                          <CardDescription className="text-[11px] mt-1">
                            Layouts de impressão e provas digitais enviados para aprovação do
                            cliente.
                          </CardDescription>
                        </div>
                        <Switch
                          checked={automationSwitches.proof_waiting !== false}
                          onCheckedChange={(c) =>
                            setAutomationSwitches({ ...automationSwitches, proof_waiting: c })
                          }
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                            Alta a partir de (dias):
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={automationConfig.proofWaitingAltaDays}
                            onChange={(e) =>
                              setAutomationConfig({
                                ...automationConfig,
                                proofWaitingAltaDays: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="text-xs font-bold bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                            Urgente a partir de (dias):
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={automationConfig.proofWaitingUrgenteDays}
                            onChange={(e) =>
                              setAutomationConfig({
                                ...automationConfig,
                                proofWaitingUrgenteDays: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="text-xs font-bold bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 5: Pedido atrasado na produção */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                              Pedido atrasado na produção
                            </CardTitle>
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[10px] font-mono border-0">
                              PAGE LOAD
                            </Badge>
                          </div>
                          <CardDescription className="text-[11px] mt-1">
                            Ordens de serviço com prazo prometido vencido não finalizadas.
                          </CardDescription>
                        </div>
                        <Switch
                          checked={automationSwitches.order_overdue !== false}
                          onCheckedChange={(c) =>
                            setAutomationSwitches({ ...automationSwitches, order_overdue: c })
                          }
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                          Urgente a partir de (dias de atraso):
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={automationConfig.orderOverdueUrgenteDays}
                          onChange={(e) =>
                            setAutomationConfig({
                              ...automationConfig,
                              orderOverdueUrgenteDays: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="text-xs font-bold bg-white dark:bg-slate-800"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 6: Cliente insatisfeito */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                              Cliente insatisfeito / Reclamação
                            </CardTitle>
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[10px] font-mono border-0">
                              PAGE LOAD
                            </Badge>
                          </div>
                          <CardDescription className="text-[11px] mt-1">
                            Avaliações negativas (1 a 3 estrelas) pendentes de recuperação e
                            contato.
                          </CardDescription>
                        </div>
                        <Switch
                          checked={automationSwitches.dissatisfied !== false}
                          onCheckedChange={(c) =>
                            setAutomationSwitches({ ...automationSwitches, dissatisfied: c })
                          }
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                          Urgente após (horas sem resolução):
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={168}
                          value={automationConfig.dissatisfiedUrgenteHours}
                          onChange={(e) =>
                            setAutomationConfig({
                              ...automationConfig,
                              dissatisfiedUrgenteHours: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="text-xs font-bold bg-white dark:bg-slate-800"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 7: Pós-venda pendente */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                              Pós-venda pendente de envio
                            </CardTitle>
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 text-[10px] font-mono border-0">
                              EVENTO
                            </Badge>
                          </div>
                          <CardDescription className="text-[11px] mt-1">
                            Disparado automaticamente ao concluir uma ordem de produção vinculada.
                          </CardDescription>
                        </div>
                        <Switch
                          checked={automationSwitches.postsale !== false}
                          onCheckedChange={(c) =>
                            setAutomationSwitches({ ...automationSwitches, postsale: c })
                          }
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                            Alta a partir de (dias atrasados):
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={automationConfig.postSaleAltaDays}
                            onChange={(e) =>
                              setAutomationConfig({
                                ...automationConfig,
                                postSaleAltaDays: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="text-xs font-bold bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-600 dark:text-slate-400">
                            Urgente a partir de (dias atrasados):
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={automationConfig.postSaleUrgenteDays}
                            onChange={(e) =>
                              setAutomationConfig({
                                ...automationConfig,
                                postSaleUrgenteDays: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="text-xs font-bold bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 8: SLA Visual */}
                  <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                              SLA Visual do Kanban
                            </CardTitle>
                            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200 text-[10px] font-mono border-0">
                              VISUAL
                            </Badge>
                          </div>
                          <CardDescription className="text-[11px] mt-1">
                            Bordas e badges coloridos dinâmicos baseados no tempo sem contato ou na
                            etapa.
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] text-emerald-600 border-emerald-300"
                        >
                          Sempre ativo
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0 text-xs text-slate-500">
                      <p>
                        Para ajustar as horas de tolerância de SLA (Atenção, Alerta, Crítico),
                        utilize a aba <strong>SLA & Central</strong>.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>

              <CardFooter className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Gravando...' : 'Salvar Regras de Automação'}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        {/* TAB 4: SLA RULES & CENTRAL DE PENDÊNCIAS */}
        <TabsContent value="sla" className="space-y-6">
          <form onSubmit={handleSaveSla} className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-5 w-5 text-emerald-600" />
                  Prazos e Alertas de SLA para Atendimento & Central de Pendências
                </CardTitle>
                <CardDescription className="text-xs">
                  Controle os prazos máximos para a equipe responder aos clientes e como a Central
                  de Pendências calcula prioridades automáticas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border text-xs space-y-2">
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-emerald-600" />
                    Regras Automáticas da Central de Pendências:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300">
                    <li>
                      <strong>Clientes aguardando resposta:</strong> &lt;15 min (Normal), 15-60 min
                      (Alta), &gt;60 min (Urgente).
                    </li>
                    <li>
                      <strong>Pedidos em atraso:</strong> Atrasado hoje (Alta), &gt;1 dia de atraso
                      (Urgente).
                    </li>
                    <li>
                      <strong>Clientes insatisfeitos (1-3 estrelas):</strong> Sempre prioridade Alta
                      ou Urgente.
                    </li>
                    <li>
                      <strong>Orçamentos sem retorno:</strong> &gt;1 dia (Alta), &gt;3 dias
                      (Urgente).
                    </li>
                    <li>
                      <strong>Follow-ups e Pós-Vendas:</strong> Programados p/ hoje (Normal),
                      vencidos (Alta/Urgente).
                    </li>
                  </ul>
                </div>

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

      {/* Webhook Test Result Modal */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {testResult?.isSuccess ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-rose-600" />
              )}
              {testResult?.isSuccess
                ? '✅ Webhook funcionando!'
                : '❌ Falha na validação — verifique os logs'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Resultado do teste de validação de Webhook do WhatsApp Cloud API (Meta Handshake GET).
            </DialogDescription>
          </DialogHeader>

          {testResult && (
            <div className="space-y-3 py-2 text-xs">
              {/* Status banner */}
              <div
                className={`p-3 rounded-lg border flex items-center justify-between ${
                  testResult.isSuccess
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="font-semibold flex items-center gap-2">
                  <span>Status HTTP:</span>
                  <Badge
                    variant={testResult.status === 200 ? 'default' : 'destructive'}
                    className={
                      testResult.status === 200
                        ? 'bg-emerald-600 text-white font-mono'
                        : 'font-mono'
                    }
                  >
                    {testResult.status}
                  </Badge>
                </div>
                <div className="text-[11px] font-medium">
                  {testResult.isSuccess
                    ? 'Challenge verificado com sucesso'
                    : 'Resposta incompatível com o esperado pela Meta'}
                </div>
              </div>

              {/* Detail fields */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  URL Testada:
                </Label>
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[11px] break-all select-all text-slate-800 dark:text-slate-200">
                  {testResult.testedUrl}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    Token Esperado / Enviado:
                  </Label>
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    {testResult.expectedToken}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    Challenge Enviado:
                  </Label>
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    {testResult.sentChallenge}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  Corpo da Resposta Recebida:
                </Label>
                <div
                  className={`p-2 rounded font-mono text-[11px] whitespace-pre-wrap break-all ${
                    testResult.isSuccess
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {testResult.responseBody || '(vazio)'}
                </div>
              </div>

              {testResult.isSuccess ? (
                <p className="text-[11px] text-slate-500">
                  A Meta aceitará este endpoint instantaneamente ao clicar em "Verificar e salvar"
                  no painel da Meta for Developers.
                </p>
              ) : (
                <p className="text-[11px] text-rose-600 dark:text-rose-400">
                  Certifique-se de salvar o Token no CRM antes de testar ou verifique se o servidor
                  backend está online.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTestModalOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleTestWebhook}
              disabled={testingWebhook}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {testingWebhook ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Testando novamente...
                </>
              ) : (
                'Testar Novamente'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
