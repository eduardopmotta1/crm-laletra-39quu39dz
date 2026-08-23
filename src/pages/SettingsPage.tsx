import React, { useState, useEffect } from 'react'
import {
  Settings,
  MessageSquare,
  Clock,
  ShieldCheck,
  Key,
  Building,
  Save,
  Check,
  Copy,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'
import { settingsService } from '@/services/settings'
import type { SlaConfig } from '@/types/crm'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/context/AuthContext'

export default function SettingsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Settings State
  const [companyName, setCompanyName] = useState('Gráfica & Print Express')
  const [displayPhone, setDisplayPhone] = useState('+55 (11) 98765-4321')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({
    urgentMinutes: 1440,
    warningMinutes: 720,
    noticeMinutes: 360,
  })

  const webhookUrl = `${window.location.origin}/api/crm/whatsapp-webhook`

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const map = await settingsService.getMap()
      if (map['company_name']) setCompanyName(map['company_name'])
      if (map['whatsapp_display_phone']) setDisplayPhone(map['whatsapp_display_phone'])
      if (map['whatsapp_phone_number_id']) setPhoneNumberId(map['whatsapp_phone_number_id'])
      if (map['whatsapp_business_account_id']) setWabaId(map['whatsapp_business_account_id'])
      if (map['whatsapp_access_token']) setAccessToken(map['whatsapp_access_token'])

      const sla = await settingsService.getSlaConfig()
      setSlaConfig(sla)
    } catch (err) {
      console.error('Error loading settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await Promise.all([
        settingsService.setKey(
          'whatsapp_phone_number_id',
          phoneNumberId.trim(),
          'Phone Number ID da Meta API',
        ),
        settingsService.setKey(
          'whatsapp_business_account_id',
          wabaId.trim(),
          'WhatsApp Business Account ID',
        ),
        settingsService.setKey(
          'whatsapp_access_token',
          accessToken.trim(),
          'Token Permanente Meta Graph API',
        ),
        settingsService.setKey('whatsapp_display_phone', displayPhone.trim(), 'Número exibido'),
        settingsService.setKey('company_name', companyName.trim(), 'Nome da Gráfica'),
      ])
      toast({
        title: 'Configurações Salvas!',
        description: 'Parâmetros da Meta Cloud API e Gráfica atualizados com sucesso.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Falha ao gravar configurações.',
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
      await settingsService.saveSlaConfig(slaConfig)
      toast({
        title: 'SLAs de Atendimento Salvos!',
        description: 'Os novos limites de tempo já estão ativos no funil Kanban e Dashboard.',
      })
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar SLA',
        description: err?.message || 'Falha ao gravar tempos de SLA.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({
      title: 'Copiado!',
      description: 'URL do Webhook copiada para a área de transferência.',
    })
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="h-6 w-6 text-emerald-600" />
          Configurações do Sistema & Integrações
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Conecte sua conta do WhatsApp Business Cloud API, ajuste limites de SLA e perfil.
        </p>
      </div>

      <Tabs defaultValue="whatsapp" className="space-y-6">
        <TabsList className="bg-slate-200/70 dark:bg-slate-800 p-1">
          <TabsTrigger value="whatsapp" className="flex items-center gap-2 text-xs">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            WhatsApp Cloud API
          </TabsTrigger>
          <TabsTrigger value="sla" className="flex items-center gap-2 text-xs">
            <Clock className="h-4 w-4 text-amber-600" />
            Alertas de SLA
          </TabsTrigger>
          <TabsTrigger value="company" className="flex items-center gap-2 text-xs">
            <Building className="h-4 w-4 text-blue-600" />
            Dados da Gráfica & Equipe
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: WhatsApp Cloud API */}
        <TabsContent value="whatsapp" className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Meta WhatsApp Business Cloud API (Oficial)
              </CardTitle>
              <CardDescription>
                Integre diretamente com a Graph API da Meta para envio e recebimento de mensagens
                instantâneas sem risco de bloqueio.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSaveWhatsApp}>
              <CardContent className="space-y-4">
                {/* Webhook Endpoint display */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      URL de Webhook (Cole no Painel Meta Developers):
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyWebhook}
                      className="h-7 text-xs"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" />
                      )}
                      {copied ? 'Copiado!' : 'Copiar URL'}
                    </Button>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-emerald-700 dark:text-emerald-400 break-all">
                    {webhookUrl}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Inscreva-se no campo <span className="font-semibold">messages</span> para
                    receber contatos em tempo real.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Phone Number ID *
                    </label>
                    <Input
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Ex: 109283746592019"
                      className="mt-1 font-mono text-xs"
                    />
                    <span className="text-[10px] text-slate-400">
                      Encontrado no painel da Meta Cloud API
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      WhatsApp Business Account ID (WABA)
                    </label>
                    <Input
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      placeholder="Ex: 982736154820931"
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Token de Acesso Permanente (System User Token) *
                  </label>
                  <Input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAAX..."
                    className="mt-1 font-mono text-xs"
                  />
                  <span className="text-[10px] text-slate-400">
                    Token de sistema com permissões{' '}
                    <code className="font-mono">whatsapp_business_messaging</code> e{' '}
                    <code className="font-mono">whatsapp_business_management</code>.
                  </span>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  {saving ? 'Gravando...' : 'Salvar Credenciais WhatsApp'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* TAB 2: Alertas de SLA */}
        <TabsContent value="sla" className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                Tempos de Resposta & Alertas de SLA
              </CardTitle>
              <CardDescription>
                Configure quanto tempo um cliente da gráfica pode ficar sem resposta antes de mudar
                de cor no Kanban e gerar alertas no painel.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSaveSla}>
              <CardContent className="space-y-5">
                {/* Red - Urgent SLA */}
                <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-rose-500 animate-pulse" />
                      <h4 className="font-bold text-xs text-rose-900 dark:text-rose-200 uppercase tracking-wide">
                        Nível Crítico (Vermelho) - Estourado
                      </h4>
                    </div>
                    <p className="text-xs text-rose-700 dark:text-rose-300">
                      Destaca o card em vermelho vibrante e adiciona badge de alerta na barra de
                      navegação.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min="1"
                      value={slaConfig.urgentMinutes ?? 1440}
                      onChange={(e) =>
                        setSlaConfig({ ...slaConfig, urgentMinutes: Number(e.target.value) })
                      }
                      placeholder="1440"
                      className="w-28 bg-white text-xs font-bold"
                      required
                    />
                    <span className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                      minutos
                    </span>
                  </div>
                </div>

                {/* Orange - Warning SLA */}
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-amber-500" />
                      <h4 className="font-bold text-xs text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                        Nível Alerta (Laranja)
                      </h4>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Sinaliza que o cliente está aguardando retorno e o tempo limite está próximo.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min="1"
                      value={slaConfig.warningMinutes ?? 720}
                      onChange={(e) =>
                        setSlaConfig({ ...slaConfig, warningMinutes: Number(e.target.value) })
                      }
                      placeholder="720"
                      className="w-28 bg-white text-xs font-bold"
                      required
                    />
                    <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                      minutos
                    </span>
                  </div>
                </div>

                {/* Yellow - Notice SLA */}
                <div className="p-4 rounded-xl border border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-yellow-400" />
                      <h4 className="font-bold text-xs text-yellow-900 dark:text-yellow-200 uppercase tracking-wide">
                        Nível Atenção (Amarelo)
                      </h4>
                    </div>
                    <p className="text-xs text-yellow-800 dark:text-yellow-300">
                      Início da fila de prioridade para a equipe responder.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min="1"
                      value={slaConfig.noticeMinutes ?? 360}
                      onChange={(e) =>
                        setSlaConfig({ ...slaConfig, noticeMinutes: Number(e.target.value) })
                      }
                      placeholder="360"
                      className="w-28 bg-white text-xs font-bold"
                      required
                    />
                    <span className="text-xs font-semibold text-yellow-900 dark:text-yellow-200">
                      minutos
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  {saving ? 'Gravando...' : 'Salvar Prazos de SLA'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* TAB 3: Dados da Gráfica */}
        <TabsContent value="company" className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Building className="h-5 w-5 text-blue-600" />
                Dados da Gráfica & Atendimento
              </CardTitle>
              <CardDescription>
                Informações exibidas no cabeçalho e nos links de compartilhamento.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSaveWhatsApp}>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nome Fantasia da Gráfica
                    </label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ex: Gráfica & Print Express"
                      className="mt-1 text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      WhatsApp Comercial de Atendimento
                    </label>
                    <Input
                      value={displayPhone}
                      onChange={(e) => setDisplayPhone(e.target.value)}
                      placeholder="+55 (11) 98765-4321"
                      className="mt-1 text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Seu Usuário Logado:
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {user?.name}
                    </span>{' '}
                    ({user?.email})
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  {saving ? 'Gravando...' : 'Salvar Dados'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
