import React from 'react'
import { Link } from 'react-router-dom'
import {
  Phone,
  Clock,
  ShieldCheck,
  Truck,
  CreditCard,
  Mail,
  MapPin,
  ExternalLink,
  User,
  Layers,
  FileText,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  MessageCircle,
  Twitter,
} from 'lucide-react'
import type {
  StoreFooterSettings,
  StoreCategory,
  StoreFooterColumn,
  StoreFooterSocialLink,
} from '@/types/store'
import { sanitizeFooterUrl } from '@/lib/storeFooterDefaults'

interface StoreFooterProps {
  footer: StoreFooterSettings
  categories?: StoreCategory[]
  previewMode?: boolean
}

function renderColumnIcon(iconName?: string) {
  if (!iconName) return null
  const normalized = iconName.toLowerCase()
  switch (normalized) {
    case 'truck':
      return <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'shield':
    case 'shieldcheck':
      return <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'card':
    case 'creditcard':
      return <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'phone':
      return <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'mail':
      return <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'clock':
      return <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'map':
    case 'mappin':
      return <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'user':
      return <User className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'layers':
      return <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'file':
    case 'filetext':
      return <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'instagram':
      return <Instagram className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'facebook':
      return <Facebook className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'whatsapp':
      return <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
    default:
      return <ExternalLink className="w-3.5 h-3.5 opacity-70 shrink-0" />
  }
}

function renderSocialIcon(platform: StoreFooterSocialLink['platform']) {
  switch (platform) {
    case 'instagram':
      return <Instagram className="w-4 h-4" />
    case 'facebook':
      return <Facebook className="w-4 h-4" />
    case 'whatsapp':
      return <MessageCircle className="w-4 h-4" />
    case 'linkedin':
      return <Linkedin className="w-4 h-4" />
    case 'youtube':
      return <Youtube className="w-4 h-4" />
    case 'x':
      return <Twitter className="w-4 h-4" />
    default:
      return <ExternalLink className="w-4 h-4" />
  }
}

export default function StoreFooter({
  footer,
  categories = [],
  previewMode = false,
}: StoreFooterProps) {
  const { colors, visibility } = footer

  const visibleColumns = (footer.columns || [])
    .filter((col) => col.is_visible !== false)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  const visibleSocial = (footer.social_links || []).filter((s) => s.is_visible !== false)

  const rawWhatsapp = footer.whatsapp || '+55 (21) 2391-9112'
  const cleanWhatsapp = rawWhatsapp.replace(/\D/g, '')

  const renderSmartLink = (label: string, href: string, icon?: string, blank?: boolean) => {
    const safeHref = sanitizeFooterUrl(href)
    const isInternal = safeHref.startsWith('/') && !safeHref.startsWith('//')

    if (previewMode) {
      return (
        <span
          className="flex items-center gap-2 hover:underline cursor-pointer"
          style={{ color: colors.link_color }}
        >
          {renderColumnIcon(icon)}
          <span>{label}</span>
        </span>
      )
    }

    if (isInternal) {
      return (
        <Link
          to={safeHref}
          className="flex items-center gap-2 transition-colors hover:opacity-80"
          style={{ color: colors.link_color }}
        >
          {renderColumnIcon(icon)}
          <span>{label}</span>
        </Link>
      )
    }

    return (
      <a
        href={safeHref}
        target={blank !== false ? '_blank' : undefined}
        rel="noreferrer"
        className="flex items-center gap-2 transition-colors hover:opacity-80"
        style={{ color: colors.link_color }}
      >
        {renderColumnIcon(icon)}
        <span>{label}</span>
      </a>
    )
  }

  return (
    <footer
      className="text-sm transition-colors mt-16"
      style={{
        backgroundColor: colors.bg_color,
        color: colors.text_color,
        borderTopColor: colors.border_color,
        borderTopWidth: '1px',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {/* Bloco Superior: Identidade / Logo / Descrição se configurados fora das colunas */}
        {(visibility.show_logo || visibility.show_company_name || visibility.show_description) && (
          <div
            className="pb-10 mb-10 border-b flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
            style={{ borderColor: colors.border_color }}
          >
            <div className="flex items-center gap-4">
              {visibility.show_logo && footer.logo_url && (
                <img
                  src={footer.logo_url}
                  alt={footer.company_name || 'Logo'}
                  className="h-10 max-w-[200px] object-contain"
                />
              )}
              {visibility.show_logo && !footer.logo_url && (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center font-serif font-black text-2xl tracking-tighter border border-emerald-500/30">
                  <span className="italic">L</span>
                </div>
              )}
              <div>
                {visibility.show_company_name && (
                  <h3
                    className="font-serif font-extrabold text-lg leading-tight"
                    style={{ color: colors.title_color }}
                  >
                    {footer.company_name || 'Gráfica LaLetra'}
                  </h3>
                )}
                <p className="text-xs opacity-75">Excelência e precisão em impressão gráfica</p>
              </div>
            </div>

            {visibility.show_description && footer.description && (
              <p className="text-xs max-w-xl opacity-80 leading-relaxed">{footer.description}</p>
            )}
          </div>
        )}

        {/* Colunas do Rodapé Configuráveis */}
        {visibility.show_columns && visibleColumns.length > 0 && (
          <div
            className={`grid grid-cols-1 md:grid-cols-${Math.min(visibleColumns.length, 4)} gap-8`}
            style={{
              display: 'grid',
              gridTemplateColumns:
                visibleColumns.length === 1
                  ? 'repeat(1, minmax(0, 1fr))'
                  : visibleColumns.length === 2
                    ? 'repeat(auto-fit, minmax(280px, 1fr))'
                    : visibleColumns.length === 3
                      ? 'repeat(auto-fit, minmax(240px, 1fr))'
                      : 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {visibleColumns.map((col: StoreFooterColumn) => (
              <div key={col.id} className="space-y-3">
                <h4
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: colors.title_color }}
                >
                  {col.title}
                </h4>

                {/* Coluna tipo TEXTO LIVRE */}
                {col.type === 'text' && (
                  <p className="text-xs leading-relaxed opacity-80 whitespace-pre-line">
                    {col.text_content || footer.description}
                  </p>
                )}

                {/* Coluna tipo CATEGORIAS DINÂMICAS */}
                {col.type === 'categories' && (
                  <ul className="space-y-2 text-xs">
                    {(categories.length > 0
                      ? categories.slice(0, 6)
                      : [
                          { id: 'c1', name: 'Cartões de Visita', slug: 'cartoes' },
                          { id: 'c2', name: 'Banners & Lonas', slug: 'banners' },
                          { id: 'c3', name: 'Adesivos & Rótulos', slug: 'adesivos' },
                          { id: 'c4', name: 'Panfletos & Folders', slug: 'panfletos' },
                        ]
                    ).map((c) => (
                      <li key={c.id}>{renderSmartLink(c.name, `/loja/categoria/${c.slug}`)}</li>
                    ))}
                  </ul>
                )}

                {/* Coluna tipo LINKS */}
                {col.type === 'links' && (
                  <ul className="space-y-2.5 text-xs">
                    {(col.links || []).map((l) => (
                      <li key={l.id}>{renderSmartLink(l.label, l.href, l.icon, l.target_blank)}</li>
                    ))}
                  </ul>
                )}

                {/* Coluna tipo CONTATO COMERCIAL */}
                {col.type === 'contact' && (
                  <div className="space-y-2 text-xs">
                    {footer.whatsapp && (
                      <div>
                        <span className="block text-[11px] opacity-75 font-medium">
                          WhatsApp Comercial:
                        </span>
                        <a
                          href={`https://wa.me/${cleanWhatsapp}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-bold flex items-center gap-1.5 transition-colors"
                          style={{ color: colors.link_hover_color }}
                        >
                          <Phone className="w-4 h-4" />
                          {footer.whatsapp}
                        </a>
                      </div>
                    )}

                    {footer.phone && footer.phone !== footer.whatsapp && (
                      <p className="flex items-center gap-1.5 opacity-90">
                        <Phone className="w-3.5 h-3.5 opacity-70" />
                        <span>{footer.phone}</span>
                      </p>
                    )}

                    {footer.business_hours && (
                      <p className="flex items-center gap-1.5 opacity-80">
                        <Clock className="w-3.5 h-3.5 opacity-70" />
                        <span>{footer.business_hours}</span>
                      </p>
                    )}

                    {footer.email && (
                      <p className="flex items-center gap-1.5 opacity-80">
                        <Mail className="w-3.5 h-3.5 opacity-70" />
                        <span>{footer.email}</span>
                      </p>
                    )}

                    {footer.address && (
                      <p className="text-[11px] opacity-75 leading-snug flex items-start gap-1.5 pt-1">
                        <MapPin className="w-3.5 h-3.5 opacity-70 shrink-0 mt-0.5" />
                        <span>{footer.address}</span>
                      </p>
                    )}

                    {/* Links extras dentro da coluna de contato (ex: Admin, Conta) */}
                    {col.links && col.links.length > 0 && (
                      <div className="pt-2 flex flex-wrap gap-2">
                        {col.links.map((l) => (
                          <div key={l.id}>
                            {renderSmartLink(l.label, l.href, l.icon, l.target_blank)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Redes Sociais */}
        {visibility.show_social_links && visibleSocial.length > 0 && (
          <div
            className="mt-12 pt-6 border-t flex flex-wrap items-center justify-between gap-4"
            style={{ borderColor: colors.border_color }}
          >
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: colors.title_color }}
            >
              Conecte-se com a Laletra
            </span>
            <div className="flex items-center gap-3">
              {visibleSocial.map((s) => {
                const safeUrl = sanitizeFooterUrl(s.url)
                return (
                  <a
                    key={s.id}
                    href={safeUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={s.label}
                    className="p-2 rounded-lg border transition-all hover:scale-105"
                    style={{
                      borderColor: colors.border_color,
                      color: colors.link_color,
                    }}
                  >
                    {renderSocialIcon(s.platform)}
                    <span className="sr-only">{s.label}</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {/* Rodapé inferior: Direitos Autorais & Links Legais */}
        {(visibility.show_copyright || visibility.show_legal_links) && (
          <div
            className="mt-8 pt-6 border-t text-xs flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{ borderColor: colors.border_color, opacity: 0.85 }}
          >
            {visibility.show_copyright && (
              <p>
                © {new Date().getFullYear()}{' '}
                {footer.copyright || 'Gráfica LaLetra. Todos os direitos reservados.'}
              </p>
            )}

            {visibility.show_legal_links && (
              <div className="flex items-center gap-4">
                {footer.terms_label &&
                  renderSmartLink(footer.terms_label, footer.terms_url || '/loja')}
                <span>•</span>
                {footer.privacy_label &&
                  renderSmartLink(footer.privacy_label, footer.privacy_url || '/loja')}
              </div>
            )}
          </div>
        )}
      </div>
    </footer>
  )
}
