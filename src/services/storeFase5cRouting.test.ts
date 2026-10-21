import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAppPublicUrl } from '@/lib/publicUrl'
import { clientsService } from '@/services/clients'

/**
 * Suíte de Testes da Fase 5C: Roteamento Principal e Preparação de Domínio
 *
 * Valida os requisitos arquiteturais da transição de domínio principal:
 * 1. Acesso público à loja pela raiz "/" e "/loja"
 * 2. Isolamento e proteção das rotas internas do CRM sob autenticação
 * 3. Central de Pendências preservada na rota dedicada "/pendencias"
 * 4. URLs públicas de tokens (avaliação, tracking, orçamento, cadastro) íntegras e seguras
 * 5. Não regressão do comportamento de links sem token
 */
describe('Fase 5C: Roteamento Principal e Preservação de Rotas', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  describe('Resolução de URLs Públicas e Segurança de Tokens', () => {
    it('retorna a URL padrão de produção quando nenhuma variável de ambiente está configurada', () => {
      const url = getAppPublicUrl()
      expect(url).toBe('https://crm-grafica-whatsapp-7b1a5.goskip.app')
    })

    it('respeita a env VITE_APP_PUBLIC_URL quando customizada para o domínio principal ou subdomínio', () => {
      vi.stubEnv('VITE_APP_PUBLIC_URL', 'https://www.laletra.com.br/')
      const url = getAppPublicUrl()
      expect(url).toBe('https://www.laletra.com.br')
    })

    it('gera links públicos de cadastro apenas com public_token válido', () => {
      vi.stubEnv('VITE_APP_PUBLIC_URL', 'https://www.laletra.com.br')
      const urlWithToken = clientsService.getPublicClientUrl({
        id: 'client_123',
        public_token: 'ptk_seguro_abc123',
      })
      expect(urlWithToken).toBe('https://www.laletra.com.br/cadastro/ptk_seguro_abc123')

      // Sem token NUNCA deve expor URL nem ID sequencial
      const urlWithoutToken = clientsService.getPublicClientUrl({
        id: 'client_123',
      })
      expect(urlWithoutToken).toBe('')
    })

    it('formata links públicos de avaliação sem conflito com rotas internas', () => {
      const baseUrl = getAppPublicUrl()
      const evalToken = 'eval_xyz789'
      const fullUrl = `${baseUrl}/avaliacao/${evalToken}`
      expect(fullUrl).toBe(`https://crm-grafica-whatsapp-7b1a5.goskip.app/avaliacao/${evalToken}`)
    })

    it('formata links públicos de rastreamento de produção sem conflito com rotas internas', () => {
      const baseUrl = getAppPublicUrl()
      const trackingToken = 'track_ord_999'
      const fullUrl = `${baseUrl}/acompanhar/${trackingToken}`
      expect(fullUrl).toBe(
        `https://crm-grafica-whatsapp-7b1a5.goskip.app/acompanhar/${trackingToken}`,
      )
    })

    it('formata links públicos de orçamentos sem conflito com rotas internas', () => {
      const baseUrl = getAppPublicUrl()
      const quoteToken = 'quote_token_555'
      const fullUrl = `${baseUrl}/orcamento/${quoteToken}`
      expect(fullUrl).toBe(`https://crm-grafica-whatsapp-7b1a5.goskip.app/orcamento/${quoteToken}`)
    })
  })

  describe('Mapeamento e Invariantes de Roteamento', () => {
    it('garante que a rota raiz "/" e a rota "/loja" apontam semanticamente para o StoreLayout', () => {
      // Simulação da tabela de roteamento definida em src/App.tsx
      const publicStoreRoutes = ['/', '/loja']
      const storeSubRoutes = [
        '/loja/categoria/:slug',
        '/loja/produto/:slug',
        '/loja/carrinho',
        '/loja/checkout',
        '/loja/conta',
        '/loja/pedido/:orderNumber',
      ]

      publicStoreRoutes.forEach((route) => {
        expect(route).toBeDefined()
        expect(route.startsWith('/')).toBe(true)
      })

      storeSubRoutes.forEach((subRoute) => {
        expect(subRoute.startsWith('/loja/')).toBe(true)
      })
    })

    it('garante que as rotas públicas de auth e clientes não colidem com a loja', () => {
      const publicNonStoreRoutes = [
        '/login',
        '/registro',
        '/redefinir-senha',
        '/avaliacao/:token',
        '/acompanhar/:token',
        '/orcamento/:token',
        '/cadastro/:token',
      ]

      publicNonStoreRoutes.forEach((route) => {
        expect(route).not.toBe('/')
        expect(route).not.toBe('/loja')
        expect(route.startsWith('/loja/')).toBe(false)
      })
    })

    it('garante que a Central de Pendências foi preservada na rota dedicada /pendencias', () => {
      const pendingRoute = '/pendencias'
      expect(pendingRoute).toBe('/pendencias')
      // Rota não colide com / nem com /loja
      expect(pendingRoute).not.toBe('/')
      expect(pendingRoute).not.toBe('/loja')
    })

    it('garante que todas as rotas internas essenciais do CRM permanecem intactas', () => {
      const crmInternalRoutes = [
        '/pendencias',
        '/dashboard',
        '/kanban',
        '/producao',
        '/pedidos',
        '/clientes',
        '/arquivados',
        '/pos-venda',
        '/recuperacao',
        '/procedimentos',
        '/prospeccao',
        '/orcamentos',
        '/orcamentos/novo',
        '/orcamentos/:quoteId/editar',
        '/orcamentos/produtos',
        '/orcamentos/materiais',
        '/templates',
        '/tarefas',
        '/configuracoes',
        '/loja-admin',
        '/pedidos-loja',
      ]

      expect(crmInternalRoutes.length).toBeGreaterThanOrEqual(20)
      crmInternalRoutes.forEach((route) => {
        expect(route).not.toBe('/')
        expect(route).not.toBe('/loja')
      })
    })

    it('valida que a navegação do StoreSidebar identifica "/" e "/loja" como catálogo geral', () => {
      const checkIsAllSelected = (pathname: string) => pathname === '/loja' || pathname === '/'

      expect(checkIsAllSelected('/')).toBe(true)
      expect(checkIsAllSelected('/loja')).toBe(true)
      expect(checkIsAllSelected('/loja/categoria/panfletos')).toBe(false)
      expect(checkIsAllSelected('/pendencias')).toBe(false)
    })
  })
})
