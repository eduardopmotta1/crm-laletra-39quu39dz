import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '@/context/StoreContext'
import { storeService } from '@/services/storeService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import {
  User,
  Lock,
  Mail,
  Phone,
  Building,
  CheckCircle,
  LogOut,
  MapPin,
  Package,
  Plus,
  Trash2,
  Clock,
  ArrowRight,
  KeyRound,
} from 'lucide-react'

export const StoreCustomerAuthPage: React.FC = () => {
  const { customer, customerToken, setCustomerSession, logoutCustomer, refreshCustomerProfile } =
    useStore()
  const navigate = useNavigate()

  // Tab Login
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Tab Cadastro
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPersonType, setRegPersonType] = useState<'pf' | 'pj'>('pf')
  const [regDocument, setRegDocument] = useState('')
  const [regTradeName, setRegTradeName] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)

  // Recuperação de senha
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetTokenInput, setResetTokenInput] = useState('')
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [resetStep, setResetStep] = useState<'request' | 'reset'>('request')
  const [isResetting, setIsResetting] = useState(false)

  // Histórico de pedidos do cliente logado
  const [customerOrders, setCustomerOrders] = useState<any[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Novo endereço modal/form
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [newAddrLabel, setNewAddrLabel] = useState('Principal')
  const [newAddrZip, setNewAddrZip] = useState('')
  const [newAddrStreet, setNewAddrStreet] = useState('')
  const [newAddrNumber, setNewAddrNumber] = useState('')
  const [newAddrComp, setNewAddrComp] = useState('')
  const [newAddrNeigh, setNewAddrNeigh] = useState('')
  const [newAddrCity, setNewAddrCity] = useState('São Paulo')
  const [newAddrState, setNewAddrState] = useState('SP')
  const [newAddrDefault, setNewAddrDefault] = useState(true)
  const [savingAddress, setSavingAddress] = useState(false)

  // Carregar histórico de pedidos quando o comprador estiver logado
  useEffect(() => {
    if (customerToken) {
      setLoadingOrders(true)
      storeService
        .getCustomerOrders(customerToken)
        .then((res) => {
          if (res?.orders) setCustomerOrders(res.orders)
        })
        .catch(() => {})
        .finally(() => setLoadingOrders(false))
    }
  }, [customerToken])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginEmail || !loginPassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe seu e-mail e senha de acesso.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsLoggingIn(true)
      const res = await storeService.loginCustomer(loginEmail, loginPassword)
      if (res.success && res.token) {
        setCustomerSession(res.customer, res.token)
        toast({
          title: 'Login realizado com sucesso!',
          description: `Bem-vindo(a) de volta, ${res.customer.name}!`,
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao fazer login',
        description: err?.message || 'E-mail ou senha incorretos.',
        variant: 'destructive',
      })
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regName || !regEmail || !regPhone || !regPassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha nome, e-mail, telefone e crie uma senha.',
        variant: 'destructive',
      })
      return
    }

    if (regPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve conter ao menos 6 caracteres.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsRegistering(true)
      const res = await storeService.registerCustomer({
        name: regName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
        person_type: regPersonType,
        document_cpf_cnpj: regDocument,
        trade_name: regTradeName,
      })

      if (res.success && res.token) {
        setCustomerSession(res.customer, res.token)
        toast({
          title: 'Cadastro concluído!',
          description: 'Sua conta de cliente na Laletra Store foi criada com sucesso.',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Falha no cadastro',
        description: err?.message || 'Não foi possível concluir o cadastro.',
        variant: 'destructive',
      })
    } finally {
      setIsRegistering(false)
    }
  }

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail) {
      toast({
        title: 'Atenção',
        description: 'Informe seu e-mail cadastrado.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsResetting(true)
      const res = await storeService.requestPasswordReset(forgotEmail)
      toast({
        title: 'Recuperação solicitada',
        description: res.message || 'Verifique o código de validação.',
      })
      if (res.reset_token) {
        setResetTokenInput(res.reset_token)
      }
      setResetStep('reset')
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Falha ao solicitar código.',
        variant: 'destructive',
      })
    } finally {
      setIsResetting(false)
    }
  }

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetTokenInput || !newPasswordInput) {
      toast({
        title: 'Atenção',
        description: 'Preencha o token e a nova senha.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsResetting(true)
      const res = await storeService.resetPasswordWithToken(resetTokenInput, newPasswordInput)
      toast({
        title: 'Senha alterada!',
        description: res.message,
      })
      setForgotMode(false)
      setResetStep('request')
      setLoginPassword(newPasswordInput)
      setLoginEmail(forgotEmail)
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Não foi possível redefinir a senha.',
        variant: 'destructive',
      })
    } finally {
      setIsResetting(false)
    }
  }

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerToken) return

    if (!newAddrZip || !newAddrStreet || !newAddrNumber || !newAddrNeigh) {
      toast({
        title: 'Atenção',
        description: 'Preencha todos os campos obrigatórios do endereço.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingAddress(true)
      await storeService.saveCustomerAddress(customerToken, {
        label: newAddrLabel,
        zip_code: newAddrZip,
        street: newAddrStreet,
        number: newAddrNumber,
        complement: newAddrComp,
        neighborhood: newAddrNeigh,
        city: newAddrCity,
        state: newAddrState,
        is_default: newAddrDefault,
      })
      toast({ title: 'Endereço salvo com sucesso!' })
      setShowAddressForm(false)
      await refreshCustomerProfile()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar endereço', description: err?.message, variant: 'destructive' })
    } finally {
      setSavingAddress(false)
    }
  }

  const handleDeleteAddress = async (addressId: string) => {
    if (!customerToken) return
    try {
      await storeService.deleteCustomerAddress(customerToken, addressId)
      toast({ title: 'Endereço removido.' })
      await refreshCustomerProfile()
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message, variant: 'destructive' })
    }
  }

  // Se o comprador já está logado: tela da Minha Conta com Perfil, Endereços e Pedidos
  if (customer && customerToken) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b mb-6 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Área do Cliente
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Olá, <strong>{customer.name}</strong>. Gerencie seus pedidos, dados e endereços
              cadastrados.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link to="/loja/carrinho">Ver Carrinho</Link>
            </Button>
            <Button variant="destructive" size="sm" onClick={logoutCustomer}>
              <LogOut className="w-4 h-4 mr-2" />
              Sair da Conta
            </Button>
          </div>
        </div>

        <Tabs defaultValue="orders" className="w-full space-y-6">
          <TabsList className="grid w-full sm:w-auto grid-cols-3">
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <Package className="w-4 h-4" /> Meus Pedidos
            </TabsTrigger>
            <TabsTrigger value="addresses" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Endereços
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="w-4 h-4" /> Dados Pessoais
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: MEUS PEDIDOS */}
          <TabsContent value="orders" className="space-y-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Histórico de Pedidos</CardTitle>
                <CardDescription>
                  Acompanhe em tempo real o status de pagamento, conferência de arte e produção.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingOrders ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    Carregando seus pedidos...
                  </p>
                ) : customerOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-600 font-medium">
                      Nenhum pedido realizado ainda.
                    </p>
                    <p className="text-xs text-slate-400 mt-1 mb-4">
                      Explore nosso catálogo e faça seu primeiro pedido de impressos gráficos.
                    </p>
                    <Button asChild size="sm">
                      <Link to="/loja">Ver catálogo da gráfica</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {customerOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 p-2 rounded-lg transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">
                              {ord.order_number}
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                ord.payment_status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }
                            >
                              {ord.payment_status === 'paid' ? 'Pago' : 'Aguardando Pagamento'}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            Realizado em {new Date(ord.created).toLocaleDateString('pt-BR')} •{' '}
                            {ord.delivery_method === 'delivery' ? 'Entrega' : 'Retirada no balcão'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">Total</span>
                            <span className="font-bold text-slate-900">
                              R$ {ord.total_amount?.toFixed(2)}
                            </span>
                          </div>
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/loja/pedido/${ord.order_number}`}>
                              Ver detalhes <ArrowRight className="w-3.5 h-3.5 ml-1" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: ENDEREÇOS */}
          <TabsContent value="addresses" className="space-y-4">
            <Card className="border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg">Endereços Cadastrados</CardTitle>
                  <CardDescription>
                    Gerencie seus endereços para agilizar suas compras na gráfica.
                  </CardDescription>
                </div>
                {!showAddressForm && (
                  <Button size="sm" onClick={() => setShowAddressForm(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Novo Endereço
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {showAddressForm && (
                  <form
                    onSubmit={handleAddAddress}
                    className="p-4 bg-slate-50 rounded-lg border space-y-3"
                  >
                    <h4 className="font-semibold text-sm text-slate-900">
                      Cadastrar Novo Endereço
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Identificador</Label>
                        <Input
                          placeholder="Ex: Matriz, Casa, Galpão"
                          value={newAddrLabel}
                          onChange={(e) => setNewAddrLabel(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">CEP *</Label>
                        <Input
                          required
                          placeholder="00000-000"
                          value={newAddrZip}
                          onChange={(e) => setNewAddrZip(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Rua / Av. *</Label>
                        <Input
                          required
                          placeholder="Logradouro"
                          value={newAddrStreet}
                          onChange={(e) => setNewAddrStreet(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Número *</Label>
                        <Input
                          required
                          placeholder="123"
                          value={newAddrNumber}
                          onChange={(e) => setNewAddrNumber(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Complemento</Label>
                        <Input
                          placeholder="Sala 10"
                          value={newAddrComp}
                          onChange={(e) => setNewAddrComp(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Bairro *</Label>
                        <Input
                          required
                          placeholder="Bairro"
                          value={newAddrNeigh}
                          onChange={(e) => setNewAddrNeigh(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Cidade/UF *</Label>
                        <Input
                          required
                          value={`${newAddrCity} / ${newAddrState}`}
                          onChange={(e) => {
                            const [c, s] = e.target.value.split('/')
                            if (c) setNewAddrCity(c.trim())
                            if (s) setNewAddrState(s.trim())
                          }}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddressForm(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" size="sm" disabled={savingAddress}>
                        {savingAddress ? 'Salvando...' : 'Salvar Endereço'}
                      </Button>
                    </div>
                  </form>
                )}

                {customer.addresses && customer.addresses.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {customer.addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="p-4 rounded-lg border border-slate-200 bg-white relative flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-sm text-slate-900">
                              {addr.label || 'Endereço'}
                            </span>
                            {addr.is_default && (
                              <Badge variant="secondary" className="text-[10px]">
                                Padrão
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-600">
                            {addr.street}, {addr.number} {addr.complement && `- ${addr.complement}`}
                          </p>
                          <p className="text-xs text-slate-500">
                            {addr.neighborhood} — {addr.city}/{addr.state}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">CEP: {addr.zip_code}</p>
                        </div>

                        <div className="pt-3 mt-3 border-t flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 text-xs h-7 px-2"
                            onClick={() => handleDeleteAddress(addr.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    Nenhum endereço salvo. Cadastre um endereço para entrega.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: DADOS PESSOAIS */}
          <TabsContent value="profile" className="space-y-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Dados Cadastrais</CardTitle>
                <CardDescription>
                  Seus dados cadastrais como comprador da Laletra Store.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-slate-50 rounded-md">
                    <span className="text-xs text-slate-400 block">Nome / Razão Social</span>
                    <span className="font-semibold text-slate-800">{customer.name}</span>
                  </div>
                  {customer.trade_name && (
                    <div className="p-3 bg-slate-50 rounded-md">
                      <span className="text-xs text-slate-400 block">Nome Fantasia</span>
                      <span className="font-semibold text-slate-800">{customer.trade_name}</span>
                    </div>
                  )}
                  <div className="p-3 bg-slate-50 rounded-md">
                    <span className="text-xs text-slate-400 block">E-mail</span>
                    <span className="font-semibold text-slate-800">{customer.email}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-md">
                    <span className="text-xs text-slate-400 block">Telefone / WhatsApp</span>
                    <span className="font-semibold text-slate-800">{customer.phone}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-md">
                    <span className="text-xs text-slate-400 block">Tipo</span>
                    <span className="font-semibold text-slate-800">
                      {customer.person_type === 'pj'
                        ? 'Pessoa Jurídica (PJ)'
                        : 'Pessoa Física (PF)'}
                    </span>
                  </div>
                  {customer.document_cpf_cnpj && (
                    <div className="p-3 bg-slate-50 rounded-md">
                      <span className="text-xs text-slate-400 block">CPF / CNPJ</span>
                      <span className="font-semibold text-slate-800">
                        {customer.document_cpf_cnpj}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  // Se NÃO estiver logado: tabs de Login / Cadastro / Recuperação de senha
  return (
    <div className="container mx-auto px-4 py-12 max-w-md">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Identificação na Loja
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Acesse para gerenciar seus pedidos, consultar histórico e agilizar suas compras.
        </p>
      </div>

      {forgotMode ? (
        <Card className="border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-blue-600" /> Recuperar Senha
            </CardTitle>
            <CardDescription>
              {resetStep === 'request'
                ? 'Informe seu e-mail cadastrado para gerar o código de recuperação.'
                : 'Insira o token recebido e defina sua nova senha.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetStep === 'request' ? (
              <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">E-mail</Label>
                  <Input
                    type="email"
                    required
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isResetting}>
                  {isResetting ? 'Solicitando...' : 'Enviar Código'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={() => setForgotMode(false)}
                >
                  Voltar ao Login
                </Button>
              </form>
            ) : (
              <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Código de Validação (Token)
                  </Label>
                  <Input
                    required
                    placeholder="Token"
                    value={resetTokenInput}
                    onChange={(e) => setResetTokenInput(e.target.value)}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Nova Senha</Label>
                  <Input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isResetting}>
                  {isResetting ? 'Redefinindo...' : 'Salvar Nova Senha'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={() => setResetStep('request')}
                >
                  Voltar
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="login">Já sou cliente</TabsTrigger>
            <TabsTrigger value="register">Criar nova conta</TabsTrigger>
          </TabsList>

          {/* TAB LOGIN */}
          <TabsContent value="login">
            <Card className="border-slate-200">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Entrar com e-mail e senha</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">E-mail</Label>
                    <div className="relative mt-1">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        className="pl-9"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-semibold text-slate-700">Senha</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotMode(true)
                          setForgotEmail(loginEmail)
                        }}
                        className="text-[11px] text-blue-600 hover:underline"
                      >
                        Esqueceu a senha?
                      </button>
                    </div>
                    <div className="relative mt-1">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <Input
                        type="password"
                        placeholder="••••••••"
                        className="pl-9"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full mt-2" disabled={isLoggingIn}>
                    {isLoggingIn ? 'Entrando...' : 'Entrar na Conta'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB CADASTRO */}
          <TabsContent value="register">
            <Card className="border-slate-200">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Cadastro de Novo Cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Tipo de pessoa */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-2">
                      Tipo de cadastro
                    </Label>
                    <RadioGroup
                      defaultValue="pf"
                      value={regPersonType}
                      onValueChange={(v) => setRegPersonType(v as 'pf' | 'pj')}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="pf" id="r_pf" />
                        <Label htmlFor="r_pf" className="text-sm font-normal cursor-pointer">
                          Pessoa Física (CPF)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="pj" id="r_pj" />
                        <Label htmlFor="r_pj" className="text-sm font-normal cursor-pointer">
                          Pessoa Jurídica (CNPJ)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      {regPersonType === 'pj' ? 'Razão Social / Nome do Contato' : 'Nome Completo'}
                    </Label>
                    <div className="relative mt-1">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <Input
                        type="text"
                        placeholder={regPersonType === 'pj' ? 'Nome da Empresa Ltda' : 'Seu Nome'}
                        className="pl-9"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {regPersonType === 'pj' && (
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Nome Fantasia</Label>
                      <div className="relative mt-1">
                        <Building className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <Input
                          type="text"
                          placeholder="Nome fantasia da empresa"
                          className="pl-9"
                          value={regTradeName}
                          onChange={(e) => setRegTradeName(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        {regPersonType === 'pj' ? 'CNPJ' : 'CPF'}
                      </Label>
                      <Input
                        type="text"
                        placeholder={
                          regPersonType === 'pj' ? '00.000.000/0001-00' : '000.000.000-00'
                        }
                        value={regDocument}
                        onChange={(e) => setRegDocument(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">WhatsApp / Tel</Label>
                      <div className="relative mt-1">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <Input
                          type="text"
                          placeholder="(11) 99999-9999"
                          className="pl-9"
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">E-mail</Label>
                    <div className="relative mt-1">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        className="pl-9"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Criar Senha</Label>
                    <div className="relative mt-1">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <Input
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        className="pl-9"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full mt-2" disabled={isRegistering}>
                    {isRegistering ? 'Cadastrando...' : 'Cadastrar e Entrar'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
export default StoreCustomerAuthPage
