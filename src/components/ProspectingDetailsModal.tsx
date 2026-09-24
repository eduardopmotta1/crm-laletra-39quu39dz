/**
 * Drawer / Modal de Detalhes do Estabelecimento Prospectado
 * Exibe dados públicos completos e ações:
 * - Adicionar ao CRM (sem attendance vazio)
 * - Iniciar WhatsApp (usando StartWhatsAppConversationModal com revisão pelo atendente)
 * - E-mail (mailto / copiar)
 * - Ver no Mapa (centralizar)
 * - Ver Cliente no CRM (quando já cadastrado)
 */

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  MessageSquare,
  UserPlus,
  CheckCircle2,
  Copy,
  Layers,
  Compass,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { ProspectingPlace, Client } from '@/types/crm'

interface ProspectingDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  place: ProspectingPlace | null
  onAddToCrm: (place: ProspectingPlace) => Promise<void>
  onStartWhatsApp: (place: ProspectingPlace, existingClient?: Client | null) => void
  onFocusOnMap: (place: ProspectingPlace) => void
  onViewClient?: (clientId: string) => void
  isAddingToCrm?: boolean
}

export default function ProspectingDetailsModal({
  isOpen,
  onClose,
  place,
  onAddToCrm,
  onStartWhatsApp,
  onFocusOnMap,
  onViewClient,
  isAddingToCrm = false,
}: ProspectingDetailsModalProps) {
  if (!place) return null

  const isCadastrado = place.crmStatus === 'cadastrado'
  const hasPhone = Boolean(place.phone && place.phone.trim())
  const hasEmail = Boolean(place.email && place.email.trim())
  const hasWebsite = Boolean(place.website && place.website.trim())

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência.`,
    })
  }

  const handleOpenEmail = () => {
    if (place.email) {
      window.open(`mailto:${place.email}`, '_blank')
    }
  }

  const handleOpenWebsite = () => {
    if (place.website) {
      let url = place.website.trim()
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  {place.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  {place.category} • a {place.distanceKm} km do ponto pesquisado
                  {typeof place.rating === 'number' && (
                    <span className="ml-2 text-amber-500 font-semibold">
                      ★ {place.rating.toFixed(1)}
                      {typeof place.userRatingCount === 'number'
                        ? ` (${place.userRatingCount})`
                        : ''}
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>

            {isCadastrado ? (
              <Badge className="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 shrink-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Já no CRM
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-emerald-700 dark:text-emerald-400 border-emerald-300 shrink-0"
              >
                Não prospectado
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Informações de Localização */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-emerald-600" />
              Endereço e Coordenadas
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {place.address}
            </p>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
              <span>Lat: {place.lat.toFixed(5)}</span>
              <span>•</span>
              <span>Lng: {place.lng.toFixed(5)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-emerald-600 hover:text-emerald-700 ml-auto"
                onClick={() => onFocusOnMap(place)}
              >
                <Compass className="h-3 w-3 mr-1" />
                Ver no mapa
              </Button>
            </div>
          </div>

          {/* Dados de Contato e Web */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Telefone */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                  <Phone className="h-3 w-3 text-emerald-600" />
                  Telefone
                </span>
                {hasPhone && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-slate-400 hover:text-slate-600"
                    onClick={() => copyToClipboard(place.phone!, 'Telefone')}
                    title="Copiar telefone"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                {hasPhone ? (
                  place.phone
                ) : (
                  <span className="text-slate-400 italic">Telefone não encontrado</span>
                )}
              </p>
            </div>

            {/* E-mail */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                  <Mail className="h-3 w-3 text-sky-600" />
                  E-mail
                </span>
                {hasEmail && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-slate-400 hover:text-slate-600"
                    onClick={() => copyToClipboard(place.email!, 'E-mail')}
                    title="Copiar e-mail"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                {hasEmail ? (
                  place.email
                ) : (
                  <span className="text-slate-400 italic">E-mail não disponível</span>
                )}
              </p>
            </div>

            {/* Website */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                  <Globe className="h-3 w-3 text-indigo-600" />
                  Website / Página Pública
                </span>
                {hasWebsite && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-indigo-600 hover:text-indigo-700"
                    onClick={handleOpenWebsite}
                  >
                    Abrir link
                    <ExternalLink className="h-2.5 w-2.5 ml-1" />
                  </Button>
                )}
              </div>
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                {hasWebsite ? (
                  <a
                    href={place.website!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    {place.website}
                  </a>
                ) : (
                  <span className="text-slate-400 italic">Site não informado</span>
                )}
              </p>
            </div>
          </div>

          {/* Metadados do Provedor e CRM */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1 text-slate-600 dark:text-slate-400">
            <div className="flex items-center justify-between">
              <span>Provedor dos dados:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {place.provider === 'google_places'
                  ? 'Google Places Platform'
                  : 'OpenStreetMap (Livre)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Identificador do local (Place ID):</span>
              <span className="font-mono text-[10px] text-slate-500 truncate max-w-[220px]">
                {place.id}
              </span>
            </div>
            {isCadastrado && place.existingClient && (
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-indigo-700 dark:text-indigo-300 font-medium">
                <span>Cliente já registrado:</span>
                <span>{place.existingClient.name}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          {/* Ações Rápidas */}
          {hasEmail && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenEmail}
              className="text-xs text-slate-700 dark:text-slate-300"
            >
              <Mail className="h-3.5 w-3.5 mr-1 text-sky-600" />
              Enviar E-mail
            </Button>
          )}

          {hasPhone && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStartWhatsApp(place, place.existingClient)}
              className="text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 hover:bg-emerald-50"
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              WhatsApp
            </Button>
          )}

          {isCadastrado && place.existingClient && onViewClient && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onViewClient(place.existingClient!.id)}
              className="text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Ver Cliente
            </Button>
          )}

          {!isCadastrado && (
            <Button
              type="button"
              size="sm"
              disabled={isAddingToCrm}
              onClick={() => onAddToCrm(place)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              {isAddingToCrm ? 'Adicionando...' : 'Adicionar ao CRM'}
            </Button>
          )}

          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
