/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="text-center max-w-md">
        <h1 className="text-5xl font-black text-slate-800 dark:text-slate-100 mb-2 font-serif">
          404
        </h1>
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Página não encontrada
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/"
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            Ir para a Loja Virtual
          </a>
          <a
            href="/login"
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
          >
            Acesso Equipe (CRM)
          </a>
        </div>
      </div>
    </div>
  )
}

export default NotFound
