import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Kanban,
  Users,
  CheckSquare,
  Settings,
  LogOut,
  MessageSquare,
  Clock,
  Menu,
  X,
  Printer,
  AlertTriangle,
  Send,
  Plus,
  Search,
  Bell,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { clientsService } from '@/services/clients'
import { settingsService } from '@/services/settings'
import { calculateSlaInfo } from '@/lib/sla'
import type { Client, SlaConfig } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { whatsappService } from '@/services/whatsapp'
import { toast } from '@/hooks/use-toast'
import ClientFormModal from './ClientFormModal'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [urgentCount, setUrgentCount] = useState(0)
  const [warningCount, setWarningCount] = useState(0)
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({
    urgentMinutes: 1440,
    warningMinutes: 720,
    noticeMinutes: 360,
  })

  // Quick Simulate Inbound WhatsApp Dialog
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [simPhone, setSimPhone] = useState('+55 11 99881-9988')
  const [simName, setSimName] = useState('Novo Cliente WhatsApp')
  const [simMessage, setSimMessage] = useState(
    'Olá! Gostaria de fazer um orçamento de 500 cartões de visita e 100 pastas.',
  )
  const [simLoading, setSimLoading] = useState(false)

  // New Client Modal
  const [newClientOpen, setNewClientOpen] = useState(false)

  const loadSlaAlerts = async () => {
    try {
      const [cfg, clients] = await Promise.all([
        settingsService.getSlaConfig(),
        clientsService.getAll(),
      ])
      setSlaConfig(cfg)

      let urgent = 0
      let warning = 0
      for (const c of clients) {
        if (c.stage === 'Venda fechada' || c.stage === 'Não fechou') continue
        const sla = calculateSlaInfo(c.last_message_at, c.last_message_direction, c.stage, cfg)
        if (sla.status === 'urgent') urgent++
        else if (sla.status === 'warning') warning++
      }
      setUrgentCount(urgent)
      setWarningCount(warning)
    } catch (err) {
      console.error('Error updating SLA counts:', err)
    }
  }

  useEffect(() => {
    loadSlaAlerts()
    const interval = setInterval(loadSlaAlerts, 30000) // refresh SLA counts periodically
    return () => clearInterval(interval)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleSimulateInbound = async (e: React.FormEvent) => {
    e.preventDefault()
    setSimLoading(true)
    try {
      const res = await whatsappService.simulateInboundMessage(simPhone, simMessage, simName)
      if (res.success) {
        toast({
          title: '💬 Mensagem de WhatsApp Recebida!',
          description: `Novo contato "${simName}" entrou na etapa "Precisa responder" com SLA ativo.`,
          variant: 'default',
        })
        setSimulateOpen(false)
        setSimMessage('')
        loadSlaAlerts()
        // Dispatch custom event so current page can refresh
        window.dispatchEvent(new CustomEvent('crm-client-updated'))
      } else {
        toast({
          title: 'Erro ao simular',
          description: res.error || 'Não foi possível registrar mensagem simulada.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })
    } finally {
      setSimLoading(false)
    }
  }

  const navItems = [
    {
      to: '/dashboard',
      label: 'Painel & Métricas',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      to: '/kanban',
      label: 'Funil Kanban',
      icon: Kanban,
      badge: urgentCount > 0 ? `${urgentCount} SLA` : null,
      badgeVariant: 'destructive',
    },
    {
      to: '/clientes',
      label: 'Clientes & Atendimentos',
      icon: Users,
      badge: null,
    },
    {
      to: '/tarefas',
      label: 'Tarefas de Follow-up',
      icon: CheckSquare,
      badge: null,
    },
    {
      to: '/configuracoes',
      label: 'Configurações & API',
      icon: Settings,
      badge: null,
    },
  ]

  const getInitials = (name?: string) => {
    if (!name) return 'AT'
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 antialiased overflow-hidden">
      {/* Mobile Top Bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-sm">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white leading-none block">
                CRM Gráfica
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">WhatsApp Sync</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {urgentCount > 0 && (
            <Badge
              variant="destructive"
              className="animate-pulse flex items-center gap-1 text-xs px-2 py-0.5"
            >
              <AlertTriangle className="h-3 w-3" />
              {urgentCount} SLA
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => setNewClientOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5"
          >
            <Plus className="h-4 w-4 mr-1" />
            Novo
          </Button>
        </div>
      </header>

      {/* Sidebar Desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div>
          <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                  CRM Gráfica
                </h1>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                  WhatsApp Cloud Ativo
                </p>
              </div>
            </div>
          </div>

          {/* SLA Alert Banner if urgent clients */}
          {urgentCount > 0 && (
            <div className="mx-4 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 animate-pulse">
              <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-rose-900 dark:text-rose-200 block">
                  {urgentCount}{' '}
                  {urgentCount === 1 ? 'cliente sem resposta' : 'clientes sem resposta'}!
                </span>
                <p className="text-rose-700 dark:text-rose-300 text-[11px] mt-0.5">
                  SLA estourado ({slaConfig.urgentMinutes ?? 1440}min). Priorize respostas agora.
                </p>
              </div>
            </div>
          )}

          {/* Quick Action Button */}
          <div className="px-4 pt-4 pb-2 space-y-2">
            <Button
              onClick={() => setNewClientOpen(true)}
              className="w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all h-10"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Atendimento
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSimulateOpen(true)}
              className="w-full text-xs text-slate-600 dark:text-slate-300 border-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
              Simular msg WhatsApp
            </Button>
          </div>

          {/* Navigation Links */}
          <nav className="px-3 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-slate-800 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                    }`
                  }
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <Badge
                      variant={(item.badgeVariant as any) || 'secondary'}
                      className="text-[10px] px-1.5 py-0 font-bold uppercase tracking-wider"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              )
            })}
          </nav>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-2.5 min-w-0">
              <Avatar className="h-9 w-9 border border-slate-200 dark:border-slate-700 bg-emerald-100 text-emerald-800">
                <AvatarFallback className="font-semibold text-xs">
                  {getInitials(user?.name || user?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {user?.name || 'Atendente Gráfica'}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {user?.email || 'admin@grafica.com'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sair do sistema"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pt-16 lg:pt-0">
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Simulate Incoming WhatsApp Webhook Modal */}
      <Dialog open={simulateOpen} onOpenChange={setSimulateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              Simular Mensagem de Cliente (WhatsApp API)
            </DialogTitle>
            <DialogDescription>
              Testa o fluxo real do webhook recebendo uma nova mensagem de cliente no WhatsApp e
              acionando os alertas de SLA e funil Kanban.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSimulateInbound} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-slate-700">Nome do Contato</label>
              <Input
                value={simName}
                onChange={(e) => setSimName(e.target.value)}
                placeholder="Ex: Carlos - Padaria Central"
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">WhatsApp / Telefone</label>
              <Input
                value={simPhone}
                onChange={(e) => setSimPhone(e.target.value)}
                placeholder="+55 11 98888-7777"
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">
                Mensagem Enviada pelo Cliente
              </label>
              <Textarea
                value={simMessage}
                onChange={(e) => setSimMessage(e.target.value)}
                placeholder="Ex: Olá, vocês imprimem faixas de lona em alta definição?"
                rows={3}
                required
                className="mt-1 resize-none"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setSimulateOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={simLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {simLoading ? 'Processando Webhook...' : 'Simular Recebimento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal for Creating New Client */}
      <ClientFormModal
        isOpen={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onSaved={() => {
          setNewClientOpen(false)
          loadSlaAlerts()
          window.dispatchEvent(new CustomEvent('crm-client-updated'))
        }}
      />
    </div>
  )
}
