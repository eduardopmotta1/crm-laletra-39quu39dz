import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { KeyRound, Lock, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Validar o token assim que a página carregar
  useEffect(() => {
    if (!token) {
      setLoading(false)
      setTokenValid(false)
      setTokenError('Nenhum token de redefinição foi fornecido.')
      return
    }

    const validate = async () => {
      try {
        const res = await pb.send('/backend/v1/auth/validate-reset-token', {
          method: 'POST',
          body: { token },
        })

        if (res && res.valid) {
          setTokenValid(true)
          setUserEmail(res.email || '')
          setUserName(res.user_name || '')
        } else {
          setTokenValid(false)
          setTokenError(res.error || 'Token inválido ou expirado.')
        }
      } catch (err: any) {
        setTokenValid(false)
        setTokenError(
          err?.data?.error ||
            err?.message ||
            'Token inválido ou expirado. Solicite um novo link de recuperação.',
        )
      } finally {
        setLoading(false)
      }
    }

    validate()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (password.length < 8) {
      setFormError('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setFormError('As senhas digitadas não coincidem.')
      return
    }

    setSubmitting(true)
    try {
      const res = await pb.send('/backend/v1/auth/reset-password', {
        method: 'POST',
        body: {
          token,
          password,
        },
      })

      if (res && res.success) {
        setSuccess(true)
        toast({
          title: 'Senha redefinida com sucesso!',
          description: 'Sua nova senha foi gravada. Redirecionando para o login...',
        })
        setTimeout(() => {
          navigate('/login')
        }, 2500)
      } else {
        setFormError(res.error || 'Não foi possível redefinir sua senha.')
      }
    } catch (err: any) {
      setFormError(
        err?.data?.error ||
          err?.message ||
          'Erro ao processar a redefinição de senha. Tente novamente.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <Card className="w-full max-w-md shadow-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10">
        <CardHeader className="space-y-3 text-center pb-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <KeyRound className="h-7 w-7" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Definir Nova Senha
            </CardTitle>
            <CardDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Redefina o seu acesso de forma segura e pessoal
            </CardDescription>
          </div>
        </CardHeader>

        {loading ? (
          <CardContent className="py-8 text-center text-slate-500">
            <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm">Validando link de segurança...</p>
          </CardContent>
        ) : !tokenValid ? (
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Link inválido ou expirado</p>
                <p className="text-xs mt-1 text-rose-600 dark:text-rose-400">
                  {tokenError ||
                    'Este link de uso único já foi utilizado ou ultrapassou a validade.'}
                </p>
              </div>
            </div>
            <div className="text-center pt-2">
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Voltar ao Login
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : success ? (
          <CardContent className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-sm flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <div>
                <p className="font-semibold">Senha alterada com sucesso!</p>
                <p className="text-xs mt-1 text-emerald-700 dark:text-emerald-400">
                  Sua conta já está atualizada com a nova credencial. Você será redirecionado para a
                  tela de login.
                </p>
              </div>
            </div>
            <div className="text-center pt-2">
              <Link to="/login">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                  Ir para Login agora <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  Redefinindo senha para <strong>{userName || userEmail}</strong> ({userEmail})
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Nova Senha (mínimo 8 caracteres)
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoFocus
                  minLength={8}
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Confirmar Nova Senha
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="h-10"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-3 pt-2">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-500/20"
              >
                {submitting ? 'Salvando nova senha...' : 'Salvar Nova Senha'}
                {!submitting && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>

              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                Lembrou sua senha?{' '}
                <Link to="/login" className="font-semibold text-emerald-600 hover:underline">
                  Voltar ao login
                </Link>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
