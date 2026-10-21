/**
 * Utilitário central para resolução de URL base pública oficial da aplicação.
 * Garante que links enviados a clientes (WhatsApp, e-mails, links de cadastro, orçamentos, aprovações, pós-venda)
 * sejam SEMPRE links absolutos e válidos.
 *
 * Prioridade:
 * 1. Variável de ambiente Vite (VITE_APP_PUBLIC_URL / VITE_PUBLIC_URL)
 * 2. window.location.origin (se em browser e não for localhost)
 * 3. Domínio oficial de produção: https://crm-grafica-whatsapp-7b1a5.goskip.app
 */
export function getAppPublicUrl(): string {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as Record<string, unknown>)
      : undefined

  const rawEnvUrl = env ? env.VITE_APP_PUBLIC_URL || env.VITE_PUBLIC_URL : undefined
  const envUrl = typeof rawEnvUrl === 'string' ? rawEnvUrl : undefined

  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '')
  }

  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.origin &&
    !window.location.origin.includes('localhost') &&
    !window.location.origin.includes('127.0.0.1')
  ) {
    return window.location.origin.replace(/\/+$/, '')
  }

  return 'https://crm-grafica-whatsapp-7b1a5.goskip.app'
}
