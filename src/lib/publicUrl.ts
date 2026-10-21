/**
 * Utilitário central para resolução de URL base pública oficial da aplicação.
 * Garante que links enviados a clientes (WhatsApp, e-mails, links de cadastro, orçamentos, aprovações, pós-venda)
 * sejam SEMPRE links absolutos e válidos.
 *
 * Prioridade:
 * 1. Variável de ambiente (APP_PUBLIC_URL / PUBLIC_BASE_URL / VITE_APP_PUBLIC_URL / VITE_PUBLIC_URL)
 * 2. window.location.origin (se em browser e não for localhost)
 * 3. Domínio oficial de produção: https://crm-grafica-whatsapp-7b1a5.goskip.app
 */
export function getAppPublicUrl(): string {
  const envUrl =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      (import.meta.env.VITE_APP_PUBLIC_URL ||
        import.meta.env.APP_PUBLIC_URL ||
        import.meta.env.PUBLIC_BASE_URL ||
        import.meta.env.VITE_PUBLIC_URL)) ||
    (typeof process !== 'undefined' &&
      process.env &&
      (process.env.VITE_APP_PUBLIC_URL ||
        process.env.APP_PUBLIC_URL ||
        process.env.PUBLIC_BASE_URL ||
        process.env.VITE_PUBLIC_URL))

  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
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
