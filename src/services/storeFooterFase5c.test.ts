import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STORE_FOOTER_SETTINGS,
  sanitizeFooterUrl,
  isValidHexColor,
  mergeFooterSettings,
} from '@/lib/storeFooterDefaults'
import type { StoreFooterSettings } from '@/types/store'

describe('Store Fase 5C — Etapa 1: Editor Completo do Rodapé', () => {
  describe('Sanitização e Normalização Estrita de URLs', () => {
    it('deve bloquear injeções com javascript: e retornar #', () => {
      expect(sanitizeFooterUrl('javascript:alert(1)')).toBe('#')
      expect(sanitizeFooterUrl('javascript:void(0)')).toBe('#')
      expect(sanitizeFooterUrl('JAVASCRIPT:alert("xss")')).toBe('#')
      expect(sanitizeFooterUrl('  javascript: maliciousCode()')).toBe('#')
    })

    it('deve bloquear esquemas data:, vbscript: e file:', () => {
      expect(sanitizeFooterUrl('data:text/html,<script>alert(1)</script>')).toBe('#')
      expect(sanitizeFooterUrl('vbscript:msgbox("hello")')).toBe('#')
      expect(sanitizeFooterUrl('file:///etc/passwd')).toBe('#')
    })

    it('deve permitir rotas internas da aplicação que começam com / ou #', () => {
      expect(sanitizeFooterUrl('/loja')).toBe('/loja')
      expect(sanitizeFooterUrl('/loja/categoria/cartoes')).toBe('/loja/categoria/cartoes')
      expect(sanitizeFooterUrl('/orcamentos/novo')).toBe('/orcamentos/novo')
      expect(sanitizeFooterUrl('#topo')).toBe('#topo')
    })

    it('deve permitir URLs completas com http:// e https://', () => {
      expect(sanitizeFooterUrl('https://instagram.com/laletragrafica')).toBe(
        'https://instagram.com/laletragrafica',
      )
      expect(sanitizeFooterUrl('https://wa.me/552123919112')).toBe('https://wa.me/552123919112')
      expect(sanitizeFooterUrl('http://meusite.com.br/contato')).toBe(
        'http://meusite.com.br/contato',
      )
    })

    it('deve permitir mailto: e tel:', () => {
      expect(sanitizeFooterUrl('mailto:contato@laletragrafica.com.br')).toBe(
        'mailto:contato@laletragrafica.com.br',
      )
      expect(sanitizeFooterUrl('tel:+552123919112')).toBe('tel:+552123919112')
    })

    it('deve prefixar domínios sem protocolo com https://', () => {
      expect(sanitizeFooterUrl('instagram.com/laletra')).toBe('https://instagram.com/laletra')
      expect(sanitizeFooterUrl('wa.me/552123919112')).toBe('https://wa.me/552123919112')
    })

    it('deve retornar # para valores vazios, nulos ou indefinidos', () => {
      expect(sanitizeFooterUrl('')).toBe('#')
      expect(sanitizeFooterUrl(null)).toBe('#')
      expect(sanitizeFooterUrl(undefined)).toBe('#')
      expect(sanitizeFooterUrl('   ')).toBe('#')
    })
  })

  describe('Validação de Cores Hexadecimais', () => {
    it('deve validar formatos hexadecimais corretos (#RGB e #RRGGBB)', () => {
      expect(isValidHexColor('#0f172a')).toBe(true)
      expect(isValidHexColor('#fff')).toBe(true)
      expect(isValidHexColor('#34d399')).toBe(true)
      expect(isValidHexColor('#FFFFFF')).toBe(true)
    })

    it('deve rejeitar cores inválidas, scripts ou strings arbitrárias', () => {
      expect(isValidHexColor('rgb(0,0,0)')).toBe(false)
      expect(isValidHexColor('red')).toBe(false)
      expect(isValidHexColor('#12')).toBe(false)
      expect(isValidHexColor('#12345')).toBe(false)
      expect(isValidHexColor('javascript:alert(1)')).toBe(false)
      expect(isValidHexColor('')).toBe(false)
      expect(isValidHexColor(null)).toBe(false)
    })
  })

  describe('Estrutura e Fallbacks Seguros (mergeFooterSettings)', () => {
    it('deve retornar todos os valores reais padrão quando a entrada for nula ou vazia', () => {
      const merged = mergeFooterSettings(null)

      expect(merged.version).toBe(1)
      expect(merged.company_name).toBe('Gráfica LaLetra')
      expect(merged.whatsapp).toBe('+55 (21) 2391-9112')
      expect(merged.phone).toBe('+55 (21) 2391-9112')
      expect(merged.email).toBe('contato@laletragrafica.com.br')
      expect(merged.business_hours).toBe('Seg a Sex das 08h às 18h')
      expect(merged.address).toContain('Av. Marechal Floriano, 19')
      expect(merged.copyright).toContain('Gráfica LaLetra. Todos os direitos reservados.')

      expect(merged.columns.length).toBeGreaterThanOrEqual(4)
      expect(merged.social_links.length).toBeGreaterThanOrEqual(2)
      expect(merged.colors.bg_color).toBe('#0f172a')
      expect(merged.visibility.show_columns).toBe(true)
      expect(merged.visibility.show_logo).toBe(true)
    })

    it('deve manter dados customizados pelo usuário sem sobrescrever com defaults indevidos', () => {
      const customInput: Partial<StoreFooterSettings> = {
        company_name: 'LaLetra Comunicação & Gráfica Digital',
        whatsapp: '+55 (21) 99999-8888',
        colors: {
          bg_color: '#111827',
          text_color: '#e2e8f0',
          title_color: '#f8fafc',
          link_color: '#93c5fd',
          link_hover_color: '#60a5fa',
          border_color: '#1f2937',
        },
        visibility: {
          show_logo: false,
          show_company_name: true,
          show_description: false,
          show_columns: true,
          show_social_links: false,
          show_copyright: true,
          show_legal_links: false,
        },
      }

      const merged = mergeFooterSettings(customInput)

      expect(merged.company_name).toBe('LaLetra Comunicação & Gráfica Digital')
      expect(merged.whatsapp).toBe('+55 (21) 99999-8888')
      expect(merged.colors.bg_color).toBe('#111827')
      expect(merged.visibility.show_logo).toBe(false)
      expect(merged.visibility.show_social_links).toBe(false)
      expect(merged.visibility.show_description).toBe(false)
      // Mantém fallback seguro para campos omitidos (ex: telefone fixo oficial)
      expect(merged.phone).toBe('+55 (21) 2391-9112')
    })

    it('deve sanitizar URLs maliciosas dentro de colunas e redes sociais durante o merge', () => {
      const untrustedInput: Partial<StoreFooterSettings> = {
        columns: [
          {
            id: 'col-xss',
            title: 'Links Teste',
            type: 'links',
            order_index: 10,
            is_visible: true,
            links: [
              {
                id: 'l-bad',
                label: 'Ataque',
                href: 'javascript:alert(document.cookie)',
              },
              {
                id: 'l-good',
                label: 'Bom',
                href: '/loja/promocoes',
              },
            ],
          },
        ],
        social_links: [
          {
            id: 'soc-bad',
            platform: 'custom',
            label: 'Malicioso',
            url: 'javascript:console.log(1)',
            is_visible: true,
          },
        ],
      }

      const merged = mergeFooterSettings(untrustedInput)

      expect(merged.columns[0].links?.[0].href).toBe('#')
      expect(merged.columns[0].links?.[1].href).toBe('/loja/promocoes')
      expect(merged.social_links[0].url).toBe('#')
    })

    it('deve rejeitar cores inválidas e aplicar fallback para a cor padrão', () => {
      const invalidColorsInput: Partial<StoreFooterSettings> = {
        colors: {
          bg_color: 'invalid-red',
          text_color: '#333333',
          title_color: 'expression(alert(1))',
          link_color: '#444444',
          link_hover_color: '#555555',
          border_color: '#666666',
        },
      }

      const merged = mergeFooterSettings(invalidColorsInput)

      // Inválidos caem para os defaults seguros
      expect(merged.colors.bg_color).toBe(DEFAULT_STORE_FOOTER_SETTINGS.colors.bg_color)
      expect(merged.colors.title_color).toBe(DEFAULT_STORE_FOOTER_SETTINGS.colors.title_color)
      // Válidos são mantidos
      expect(merged.colors.text_color).toBe('#333333')
      expect(merged.colors.link_color).toBe('#444444')
    })

    it('deve suportar ordenação sequencial de colunas', () => {
      const columnsInput: Partial<StoreFooterSettings> = {
        columns: [
          {
            id: 'col-3',
            title: 'Terceira',
            type: 'text',
            order_index: 30,
            is_visible: true,
          },
          {
            id: 'col-1',
            title: 'Primeira',
            type: 'text',
            order_index: 10,
            is_visible: true,
          },
          {
            id: 'col-2',
            title: 'Segunda',
            type: 'text',
            order_index: 20,
            is_visible: true,
          },
        ],
      }

      const merged = mergeFooterSettings(columnsInput)
      const sorted = [...merged.columns].sort((a, b) => a.order_index - b.order_index)

      expect(sorted[0].id).toBe('col-1')
      expect(sorted[1].id).toBe('col-2')
      expect(sorted[2].id).toBe('col-3')
    })
  })
})
