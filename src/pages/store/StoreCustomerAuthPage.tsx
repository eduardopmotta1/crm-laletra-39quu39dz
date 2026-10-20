import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/context/StoreContext'
import { storeService } from '@/services/storeService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { User, Lock, Mail, Phone, Building, CheckCircle, LogOut } from 'lucide-react'

export const StoreCustomerAuthPage: React.FC = () => {
  const { customer, customerToken, setCustomerSession, logoutCustomer } = useStore()
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

  if (customer && customerToken) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card className="border-slate-200">
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <User className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">Minha Conta</CardTitle>
            <CardDescription>
              Você está autenticado como <strong>{customer.name}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm text-slate-700">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Nome:</span>
                <span className="font-semibold">{customer.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">E-mail:</span>
                <span className="font-semibold">{customer.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Telefone:</span>
                <span className="font-semibold">{customer.phone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Tipo de Pessoa:</span>
                <span className="font-semibold">
                  {customer.person_type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                </span>
              </div>
              {customer.document_cpf_cnpj && (
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Documento:</span>
                  <span className="font-semibold">{customer.document_cpf_cnpj}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/loja/carrinho')}
              >
                Ir para o Carrinho
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={logoutCustomer}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair da Conta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

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
                  <Label className="text-xs font-semibold text-slate-700">Senha</Label>
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
                      placeholder={regPersonType === 'pj' ? '00.000.000/0001-00' : '000.000.000-00'}
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
    </div>
  )
}
export default StoreCustomerAuthPage
