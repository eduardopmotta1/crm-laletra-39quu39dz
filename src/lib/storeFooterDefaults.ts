import type { StoreFooterSettings } from '@/types/store'

/**
 * Fallbacks reais do sistema para a configuração do rodapé da loja.
 * Mantém os dados comerciais oficiais da Laletra sem dados fictícios.
 */
export const DEFAULT_STORE_FOOTER_SETTINGS: StoreFooterSettings = {
  version: 1,
  logo_url: '',
  company_name: 'Gráfica LaLetra',
  description:
    'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
  phone: '+55 (21) 2391-9112',
  whatsapp: '+55 (21) 2391-9112',
  email: 'contato@laletragrafica.com.br',
  address: 'Av. Marechal Floriano, 19, Sala 301 - Centro, Rio de Janeiro - RJ, 20080-003',
  business_hours: 'Seg a Sex das 08h às 18h',
  columns: [
    {
      id: 'col-about',
      title: 'Sobre a Laletra',
      type: 'text',
      order_index: 10,
      is_visible: true,
      text_content:
        'Parque gráfico completo, tecnologia digital e offset, acabamentos especiais e atendimento humanizado para potencializar a marca da sua empresa.',
    },
    {
      id: 'col-categories',
      title: 'Categorias Populares',
      type: 'categories',
      order_index: 20,
      is_visible: true,
      links: [],
    },
    {
      id: 'col-differentials',
      title: 'Diferenciais',
      type: 'links',
      order_index: 30,
      is_visible: true,
      links: [
        {
          id: 'link-truck',
          label: 'Entrega rápida ou retirada balcão',
          href: '/loja',
          icon: 'truck',
        },
        {
          id: 'link-shield',
          label: 'Conferência técnica de arquivos gratuita',
          href: '/loja',
          icon: 'shield',
        },
        {
          id: 'link-card',
          label: 'Condições especiais para empresas',
          href: '/orcamentos/novo',
          icon: 'card',
        },
      ],
    },
    {
      id: 'col-contact',
      title: 'Atendimento Laletra',
      type: 'contact',
      order_index: 40,
      is_visible: true,
      links: [
        {
          id: 'link-admin',
          label: 'Gerenciar Loja (Admin)',
          href: '/loja-admin',
          icon: 'shield',
        },
        {
          id: 'link-account',
          label: 'Área do Comprador',
          href: '/loja/conta',
          icon: 'user',
        },
      ],
    },
  ],
  social_links: [
    {
      id: 'soc-instagram',
      platform: 'instagram',
      label: 'Instagram',
      url: 'https://instagram.com/laletragrafica',
      is_visible: true,
    },
    {
      id: 'soc-whatsapp',
      platform: 'whatsapp',
      label: 'WhatsApp',
      url: 'https://wa.me/552123919112',
      is_visible: true,
    },
  ],
  copyright: 'Gráfica LaLetra. Todos os direitos reservados.',
  terms_label: 'Termos de Uso',
  terms_url: '/loja',
  privacy_label: 'Política de Privacidade',
  privacy_url: '/loja',
  colors: {
    bg_color: '#0f172a',
    text_color: '#94a3b8',
    title_color: '#ffffff',
    link_color: '#94a3b8',
    link_hover_color: '#34d399',
    border_color: '#1e293b',
  },
  visibility: {
    show_logo: true,
    show_company_name: true,
    show_description: true,
    show_columns: true,
    show_social_links: true,
    show_copyright: true,
    show_legal_links: true,
  },
}

/**
 * Validação e higienização estrita de URLs para hrefs no rodapé.
 * Bloqueia protocolos perigosos como javascript:, data:, vbscript:, etc.
 * Permite apenas URLs relativas seguras (/path), mailto:, tel:, https: e http:.
 */
export function sanitizeFooterUrl(url: string | undefined | null): string {
  if (!url) return '#'
  const trimmed = url.trim()
  if (!trimmed) return '#'

  // Normalizar para checagem de esquema
  const lower = trimmed.toLowerCase()

  // Bloqueio rigoroso de javascript: e esquemas de dados ou scripts
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return '#'
  }

  // Permitir âncoras locais ou caminhos relativos
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed
  }

  // Permitir protocolos seguros
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  ) {
    return trimmed
  }

  // Se for algo sem esquema como "wa.me/..." ou "instagram.com/...", assumir https://
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)) {
    return `https://${trimmed}`
  }

  // Fallback seguro para strings arbitrárias que não sejam seguras
  return '#'
}

/**
 * Valida cor hexadecimal no formato #RGB ou #RRGGBB.
 */
export function isValidHexColor(color: string | undefined | null): boolean {
  if (!color) return false
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim())
}

/**
 * Normaliza e mescla configurações do rodapé recebidas do banco de dados
 * com os valores padrão seguros. Garante compatibilidade caso campos estejam ausentes.
 */
export function mergeFooterSettings(
  raw: Partial<StoreFooterSettings> | null | undefined,
): StoreFooterSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_STORE_FOOTER_SETTINGS }
  }

  const base = DEFAULT_STORE_FOOTER_SETTINGS

  const colors: StoreFooterSettings['colors'] = {
    bg_color: isValidHexColor(raw.colors?.bg_color)
      ? (raw.colors!.bg_color as string)
      : base.colors.bg_color,
    text_color: isValidHexColor(raw.colors?.text_color)
      ? (raw.colors!.text_color as string)
      : base.colors.text_color,
    title_color: isValidHexColor(raw.colors?.title_color)
      ? (raw.colors!.title_color as string)
      : base.colors.title_color,
    link_color: isValidHexColor(raw.colors?.link_color)
      ? (raw.colors!.link_color as string)
      : base.colors.link_color,
    link_hover_color: isValidHexColor(raw.colors?.link_hover_color)
      ? (raw.colors!.link_hover_color as string)
      : base.colors.link_hover_color,
    border_color: isValidHexColor(raw.colors?.border_color)
      ? (raw.colors!.border_color as string)
      : base.colors.border_color,
  }

  const visibility: StoreFooterSettings['visibility'] = {
    show_logo: raw.visibility?.show_logo ?? base.visibility.show_logo,
    show_company_name: raw.visibility?.show_company_name ?? base.visibility.show_company_name,
    show_description: raw.visibility?.show_description ?? base.visibility.show_description,
    show_columns: raw.visibility?.show_columns ?? base.visibility.show_columns,
    show_social_links: raw.visibility?.show_social_links ?? base.visibility.show_social_links,
    show_copyright: raw.visibility?.show_copyright ?? base.visibility.show_copyright,
    show_legal_links: raw.visibility?.show_legal_links ?? base.visibility.show_legal_links,
  }

  let columns = base.columns
  if (Array.isArray(raw.columns) && raw.columns.length > 0) {
    columns = raw.columns.map((c, idx) => ({
      id: c.id || `col-${idx}`,
      title: c.title || `Coluna ${idx + 1}`,
      type: c.type || 'links',
      order_index: typeof c.order_index === 'number' ? c.order_index : (idx + 1) * 10,
      is_visible: c.is_visible ?? true,
      text_content: c.text_content || '',
      links: Array.isArray(c.links)
        ? c.links.map((l, lIdx) => ({
            id: l.id || `link-${lIdx}`,
            label: l.label || 'Link',
            href: sanitizeFooterUrl(l.href),
            icon: l.icon || '',
            target_blank: Boolean(l.target_blank),
          }))
        : [],
    }))
  }

  let social_links = base.social_links
  if (Array.isArray(raw.social_links)) {
    social_links = raw.social_links.map((s, idx) => ({
      id: s.id || `soc-${idx}`,
      platform: s.platform || 'custom',
      label: s.label || 'Rede Social',
      url: sanitizeFooterUrl(s.url),
      is_visible: s.is_visible ?? true,
    }))
  }

  return {
    version: raw.version || base.version,
    logo_url: raw.logo_url || '',
    company_name: raw.company_name !== undefined ? raw.company_name : base.company_name,
    description: raw.description !== undefined ? raw.description : base.description,
    phone: raw.phone !== undefined ? raw.phone : base.phone,
    whatsapp: raw.whatsapp !== undefined ? raw.whatsapp : base.whatsapp,
    email: raw.email !== undefined ? raw.email : base.email,
    address: raw.address !== undefined ? raw.address : base.address,
    business_hours: raw.business_hours !== undefined ? raw.business_hours : base.business_hours,
    columns,
    social_links,
    copyright: raw.copyright !== undefined ? raw.copyright : base.copyright,
    terms_label: raw.terms_label !== undefined ? raw.terms_label : base.terms_label,
    terms_url: sanitizeFooterUrl(raw.terms_url || base.terms_url),
    privacy_label: raw.privacy_label !== undefined ? raw.privacy_label : base.privacy_label,
    privacy_url: sanitizeFooterUrl(raw.privacy_url || base.privacy_url),
    colors,
    visibility,
  }
}
