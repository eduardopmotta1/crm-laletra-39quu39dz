/**
 * Página do Módulo de PROSPECÇÃO Comercial Laletra
 * Interface rica com:
 * - Topo: Localização + Raio + Segmento (termo livre) + Botão "Buscar empresas"
 * - Mapa à esquerda com ponto central, círculo de raio e marcadores interativos
 * - Painel de resultados à direita com contadores, filtros avançados, seleção em lote e ações
 * - Anti-duplicação transparente
 * - Adicionar ao CRM sem attendance vazio
 * - Iniciar WhatsApp pelo fluxo existente de revisão do atendente
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Compass,
  Search,
  MapPin,
  Filter,
  CheckSquare,
  Square,
  UserPlus,
  Phone,
  Globe,
  Mail,
  ExternalLink,
  MessageSquare,
  Building2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowUpDown,
  Navigation,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { placesService, type GeocodingResult } from '@/services/placesService'
import { prospectingService } from '@/services/prospectingService'
import { clientsService } from '@/services/clients'
import type { ProspectingPlace, Client } from '@/types/crm'
import ProspectingMap from '@/components/ProspectingMap'
import ProspectingDetailsModal from '@/components/ProspectingDetailsModal'
import StartWhatsAppConversationModal from '@/components/StartWhatsAppConversationModal'
import ClientFormModal from '@/components/ClientFormModal'
import { useAuth } from '@/context/AuthContext'

const RADIUS_OPTIONS = [
  { label: '1 km', value: 1 },
  { label: '2 km', value: 2 },
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: '20 km', value: 20 },
  { label: '30 km', value: 30 },
  { label: '50 km', value: 50 },
]

export default function ProspectingPage() {
  const { user } = useAuth()

  // Parâmetros de pesquisa
  const [locationQuery, setLocationQuery] = useState('Cachoeiras de Macacu - RJ')
  const [selectedRadius, setSelectedRadius] = useState<number>(20)
  const [segmentQuery, setSegmentQuery] = useState('Escolas')

  // Coordenadas ativas (Default: Cachoeiras de Macacu - RJ: -22.4633, -42.6536)
  const [activeCenter, setActiveCenter] = useState<{ lat: number; lng: number }>({
    lat: -22.4633,
    lng: -42.6536,
  })

  // Sugestões de geocodificação
  const [geoSuggestions, setGeoSuggestions] = useState<GeocodingResult[]>([])
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Resultados & Provedores
  const [places, setPlaces] = useState<ProspectingPlace[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [activeProvider, setActiveProvider] = useState<'google_places' | 'openstreetmap'>(
    'google_places',
  )
  const [searchSource, setSearchSource] = useState<'google_api' | 'cache' | 'osm_fallback'>(
    'google_api',
  )
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [osmFallbackAvailable, setOsmFallbackAvailable] = useState(false)

  // Filtros locais
  const [onlyWithPhone, setOnlyWithPhone] = useState(false)
  const [onlyWithWebsite, setOnlyWithWebsite] = useState(false)
  const [onlyWithEmail, setOnlyWithEmail] = useState(false)
  const [onlyNotRegistered, setOnlyNotRegistered] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'todos' | 'nao_cadastrado' | 'cadastrado'>(
    'todos',
  )
  const [searchTermInResults, setSearchTermInResults] = useState('')

  // Seleção em lote
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set())
  const [isBatchAdding, setIsBatchAdding] = useState(false)

  // Detalhes & Modais
  const [selectedPlaceForDetails, setSelectedPlaceForDetails] = useState<ProspectingPlace | null>(
    null,
  )
  const [focusedPlaceIdOnMap, setFocusedPlaceIdOnMap] = useState<string | null>(null)
  const [isAddingSingle, setIsAddingSingle] = useState(false)

  // Integração com WhatsApp Modal
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false)
  const [clientForWhatsApp, setClientForWhatsApp] = useState<Client | null>(null)

  // Visualização de Cliente Existente
  const [clientFormModalOpen, setClientFormModalOpen] = useState(false)
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null)

  // 1. Executar busca inicial
  useEffect(() => {
    handleSearch(false, false)
  }, [])

  // Geocodificação sob demanda ao digitar localização com debounce
  useEffect(() => {
    if (!locationQuery || locationQuery.trim().length < 3) {
      setGeoSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      setIsGeocoding(true)
      try {
        const res = await placesService.geocodeAddress(locationQuery)
        setGeoSuggestions(res)
      } catch (err) {
        console.warn('Geocoding suggestions error:', err)
      } finally {
        setIsGeocoding(false)
      }
    }, 450)

    return () => clearTimeout(timer)
  }, [locationQuery])

  // Ação principal: Buscar Empresas (somente ao clicar explicitamente)
  const handleSearch = async (forceRefresh = false, useOsmFallback = false) => {
    if (!segmentQuery.trim()) {
      toast({
        title: 'Informe o segmento',
        description:
          'Digite o tipo de empresa que deseja prospectar (ex: escolas, academias, gráficas).',
        variant: 'destructive',
      })
      return
    }

    setIsSearching(true)
    setSelectedPlaceIds(new Set())
    setShowSuggestions(false)
    setOsmFallbackAvailable(false)

    try {
      // 1. Resolver coordenadas do local caso tenham mudado
      let centerLat = activeCenter.lat
      let centerLng = activeCenter.lng

      if (locationQuery.trim()) {
        const geoResults = await placesService.geocodeAddress(locationQuery)
        if (geoResults.length > 0) {
          centerLat = geoResults[0].lat
          centerLng = geoResults[0].lng
          setActiveCenter({ lat: centerLat, lng: centerLng })
        } else {
          toast({
            title: 'Endereço não localizado',
            description:
              'Não foi possível encontrar a cidade/endereço informado. Verifique o nome digitado.',
            variant: 'destructive',
          })
        }
      }

      // 2. Buscar empresas via placesService (Google Places New como principal)
      const searchRes = await placesService.searchPlacesWithDetails({
        lat: centerLat,
        lng: centerLng,
        radiusKm: selectedRadius,
        segment: segmentQuery,
        location: locationQuery,
        refresh: forceRefresh,
        forceOsm: useOsmFallback,
      })

      setActiveProvider(searchRes.provider)
      setSearchSource(searchRes.source)
      setNextPageToken(searchRes.nextPageToken || null)

      if (searchRes.errorMessage) {
        setOsmFallbackAvailable(Boolean(searchRes.canFallbackOsm))
        toast({
          title: 'Aviso na busca do Google Places',
          description: searchRes.errorMessage,
          variant: 'destructive',
        })
      }

      // 3. Cruzar com base do CRM para anti-duplicação em tempo real
      const enrichedPlaces = await prospectingService.enrichPlacesWithCrmStatus(searchRes.places)

      setPlaces(enrichedPlaces)
      setHasSearched(true)

      if (enrichedPlaces.length === 0) {
        if (!searchRes.errorMessage) {
          toast({
            title: 'Nenhuma empresa encontrada neste raio.',
            description: `Tente aumentar o raio para ${selectedRadius < 50 ? selectedRadius * 2 : 50} km ou refinar o termo.`,
          })
        }
      } else {
        const novosCount = enrichedPlaces.filter((p) => p.crmStatus === 'nao_cadastrado').length
        const sourceLabel = searchRes.source === 'cache' ? ' (em cache 24h)' : ''
        toast({
          title: `🔍 ${enrichedPlaces.length} empresas encontradas${sourceLabel}`,
          description: `${novosCount} novas oportunidades e ${enrichedPlaces.length - novosCount} já cadastradas no CRM.`,
        })
      }
    } catch (err: any) {
      console.error('Error during prospecting search:', err)
      setOsmFallbackAvailable(true)
      toast({
        title: 'Não foi possível consultar o Google Places neste momento.',
        description:
          'Você pode tentar novamente ou buscar usando a fonte alternativa OpenStreetMap.',
        variant: 'destructive',
      })
    } finally {
      setIsSearching(false)
    }
  }

  // Carregar mais resultados (paginação explícita)
  const handleLoadMore = async () => {
    if (!nextPageToken || isLoadingMore) return
    setIsLoadingMore(true)

    try {
      const moreRes = await placesService.searchPlacesWithDetails({
        lat: activeCenter.lat,
        lng: activeCenter.lng,
        radiusKm: selectedRadius,
        segment: segmentQuery,
        location: locationQuery,
        pageToken: nextPageToken,
      })

      const enrichedMore = await prospectingService.enrichPlacesWithCrmStatus(moreRes.places)

      // Evita duplicatas locais
      const existingIds = new Set(places.map((p) => p.id))
      const uniqueNew = enrichedMore.filter((p) => !existingIds.has(p.id))

      setPlaces((prev) => [...prev, ...uniqueNew])
      setNextPageToken(moreRes.nextPageToken || null)

      toast({
        title: 'Mais resultados carregados',
        description: `${uniqueNew.length} estabelecimentos adicionados à lista.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao carregar mais',
        description: 'Não foi possível carregar a próxima página de resultados.',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Enriquecer detalhes sob demanda ao abrir modal de detalhes
  const handleOpenDetails = async (place: ProspectingPlace) => {
    setSelectedPlaceForDetails(place)
    setFocusedPlaceIdOnMap(place.id)

    // Se é do Google Places e ainda não tem detalhes completos carregados, busca sob demanda
    if (place.provider === 'google_places' && !place.detailsLoaded) {
      const details = await placesService.fetchPlaceDetails(place.id)
      if (details) {
        const updatedPlace = {
          ...place,
          ...details,
          detailsLoaded: true,
        }
        setPlaces((prev) => prev.map((p) => (p.id === place.id ? updatedPlace : p)))
        setSelectedPlaceForDetails(updatedPlace)
      }
    }
  }

  const handleSelectGeoSuggestion = (sug: GeocodingResult) => {
    setLocationQuery(sug.displayName)
    setActiveCenter({ lat: sug.lat, lng: sug.lng })
    setShowSuggestions(false)
  }

  // Filtragem dos resultados em memória
  const filteredPlaces = useMemo(() => {
    return places.filter((p) => {
      // Filtro de telefone
      if (onlyWithPhone && (!p.phone || !p.phone.trim())) return false

      // Filtro de website
      if (onlyWithWebsite && (!p.website || !p.website.trim())) return false

      // Filtro de e-mail
      if (onlyWithEmail && (!p.email || !p.email.trim())) return false

      // Filtro de não cadastrados
      if (onlyNotRegistered && p.crmStatus === 'cadastrado') return false

      // Filtro de status CRM
      if (statusFilter === 'nao_cadastrado' && p.crmStatus !== 'nao_cadastrado') return false
      if (statusFilter === 'cadastrado' && p.crmStatus !== 'cadastrado') return false

      // Filtro de busca textual na lista
      if (searchTermInResults.trim()) {
        const term = searchTermInResults.toLowerCase()
        const matchName = p.name.toLowerCase().includes(term)
        const matchAddr = p.address.toLowerCase().includes(term)
        const matchCategory = p.category.toLowerCase().includes(term)
        const matchPhone = p.phone ? p.phone.includes(term) : false
        if (!matchName && !matchAddr && !matchCategory && !matchPhone) return false
      }

      return true
    })
  }, [
    places,
    onlyWithPhone,
    onlyWithWebsite,
    onlyWithEmail,
    onlyNotRegistered,
    statusFilter,
    searchTermInResults,
  ])

  // Contadores
  const stats = useMemo(() => {
    const total = places.length
    const naoCadastrados = places.filter((p) => p.crmStatus === 'nao_cadastrado').length
    const jaCadastrados = total - naoCadastrados
    const comTelefone = places.filter((p) => p.phone && p.phone.trim()).length
    const comWebsite = places.filter((p) => p.website && p.website.trim()).length
    return { total, naoCadastrados, jaCadastrados, comTelefone, comWebsite }
  }, [places])

  // Ações de Seleção em lote
  const handleToggleSelectPlace = (id: string) => {
    const next = new Set(selectedPlaceIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedPlaceIds(next)
  }

  const handleSelectAllFiltered = () => {
    // Seleciona todos os elegíveis (prioriza não cadastrados)
    const next = new Set(selectedPlaceIds)
    const eligible = filteredPlaces.filter((p) => p.crmStatus === 'nao_cadastrado')
    if (eligible.length === 0) {
      filteredPlaces.forEach((p) => next.add(p.id))
    } else {
      eligible.forEach((p) => next.add(p.id))
    }
    setSelectedPlaceIds(next)
  }

  const handleClearSelection = () => {
    setSelectedPlaceIds(new Set())
  }

  // Ação: Adicionar ao CRM (Individual) - Busca detalhes antes se for do Google e não estiver carregado
  const handleAddSingleToCrm = async (place: ProspectingPlace) => {
    setIsAddingSingle(true)
    try {
      let placeToSave = place

      // Se é Google e ainda não tem telefone/site carregado, busca Place Details primeiro
      if (place.provider === 'google_places' && !place.detailsLoaded) {
        const details = await placesService.fetchPlaceDetails(place.id)
        if (details) {
          placeToSave = {
            ...place,
            ...details,
            detailsLoaded: true,
          }
        }
      }

      const res = await prospectingService.addPlaceToCrm({
        place: placeToSave,
        assignedTo: user?.id,
        initialProspectingStatus: 'Nao contatado',
      })

      if (res.wasDuplicate) {
        toast({
          title: 'Empresa já existe no CRM',
          description: `Vinculada ao cliente existente "${res.client.name}".`,
        })
      } else {
        toast({
          title: '✅ Lead Adicionado ao CRM!',
          description: `"${res.client.name}" salvo como oportunidade de prospecção.`,
        })
      }

      // Atualiza estado local
      setPlaces((prev) =>
        prev.map((p) =>
          p.id === place.id ? { ...p, crmStatus: 'cadastrado', existingClient: res.client } : p,
        ),
      )

      if (selectedPlaceForDetails?.id === place.id) {
        setSelectedPlaceForDetails({
          ...selectedPlaceForDetails,
          crmStatus: 'cadastrado',
          existingClient: res.client,
        })
      }
    } catch (err) {
      toast({
        title: 'Erro ao cadastrar',
        description: 'Não foi possível adicionar a empresa ao CRM.',
        variant: 'destructive',
      })
    } finally {
      setIsAddingSingle(false)
    }
  }

  // Ação: Adicionar Selecionados em Lote
  const handleBatchAddToCrm = async () => {
    if (selectedPlaceIds.size === 0) return

    setIsBatchAdding(true)
    const selectedPlacesList = places.filter((p) => selectedPlaceIds.has(p.id))

    try {
      const result = await prospectingService.addBatchPlacesToCrm(selectedPlacesList, user?.id)

      toast({
        title: '🎉 Importação em Lote Concluída!',
        description: `${result.addedCount} novas empresas adicionadas ao CRM (${result.alreadyExistedCount} já constavam na base).`,
      })

      // Re-enriquece os places para refletir os novos clientes
      const updatedPlaces = await prospectingService.enrichPlacesWithCrmStatus(places)
      setPlaces(updatedPlaces)
      setSelectedPlaceIds(new Set())
    } catch (err) {
      toast({
        title: 'Erro na importação em lote',
        description: 'Ocorreu uma falha ao adicionar os selecionados.',
        variant: 'destructive',
      })
    } finally {
      setIsBatchAdding(false)
    }
  }

  // Ação: Iniciar WhatsApp (Requisito 7: busca detalhes se não houver telefone, avisa se não disponível)
  const handleStartWhatsApp = async (place: ProspectingPlace, existingClient?: Client | null) => {
    let currentPlace = place

    // Se não tiver telefone carregado, busca Place Details primeiro
    if (
      !currentPlace.phone &&
      currentPlace.provider === 'google_places' &&
      !currentPlace.detailsLoaded
    ) {
      toast({
        title: 'Buscando contato...',
        description: 'Verificando telefone cadastrado no Google Places...',
      })
      const details = await placesService.fetchPlaceDetails(currentPlace.id)
      if (details) {
        currentPlace = {
          ...currentPlace,
          ...details,
          detailsLoaded: true,
        }
        setPlaces((prev) => prev.map((p) => (p.id === place.id ? currentPlace : p)))
      }
    }

    const effectivePhone = currentPlace.phone || currentPlace.normalizedPhone
    if (!effectivePhone || !effectivePhone.trim()) {
      toast({
        title: 'Telefone não disponível',
        description: 'Telefone não disponibilizado pelo estabelecimento.',
        variant: 'destructive',
      })
      return
    }

    // Se o cliente ainda não existe no CRM, cria primeiro sem attendance vazio para garantir vínculo idôneo
    let targetClient: Client | null = existingClient || null

    if (!targetClient) {
      try {
        const res = await prospectingService.addPlaceToCrm({
          place: currentPlace,
          assignedTo: user?.id,
          initialProspectingStatus: 'Contato iniciado',
        })
        targetClient = res.client
        // Atualiza estado local
        setPlaces((prev) =>
          prev.map((p) =>
            p.id === currentPlace.id
              ? { ...p, crmStatus: 'cadastrado', existingClient: res.client }
              : p,
          ),
        )
      } catch (err) {
        toast({
          title: 'Erro ao preparar contato',
          description: 'Não foi possível registrar o cliente para envio de WhatsApp.',
          variant: 'destructive',
        })
        return
      }
    }

    if (targetClient) {
      setClientForWhatsApp(targetClient)
      setWhatsAppModalOpen(true)
    }
  }

  // Visualizar cliente cadastrado no modal de formulário
  const handleViewClient = async (clientId: string) => {
    try {
      const c = await clientsService.getById(clientId)
      if (c) {
        setClientToEdit(c)
        setClientFormModalOpen(true)
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados do cliente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex flex-col h-full space-y-3 p-3 sm:p-5 max-w-[1600px] mx-auto overflow-hidden">
      {/* Barra Superior de Busca Comercial */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Localização com Auto-Sugestão */}
          <div className="relative flex-1 min-w-[220px]">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-emerald-600" />
              Localização (Endereço, Bairro ou Cidade)
            </label>
            <div className="relative">
              <Input
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Ex: Cachoeiras de Macacu - RJ"
                className="h-9 text-xs pl-8 pr-7"
              />
              <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              {isGeocoding && (
                <RefreshCw className="absolute right-2.5 top-2.5 h-4 w-4 text-emerald-600 animate-spin" />
              )}
            </div>

            {/* Dropdown de sugestões geográficas */}
            {showSuggestions && geoSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {geoSuggestions.map((sug, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectGeoSuggestion(sug)}
                    className="p-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-800/50 last:border-none flex items-start gap-1.5"
                  >
                    <Navigation className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    <span className="text-slate-800 dark:text-slate-200 line-clamp-1">
                      {sug.displayName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seleção de Raio */}
          <div className="w-32 shrink-0">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Compass className="h-3 w-3 text-emerald-600" />
              Raio de Busca
            </label>
            <Select
              value={selectedRadius.toString()}
              onValueChange={(val) => setSelectedRadius(parseInt(val, 10))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Raio" />
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value.toString()} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Segmento / Tipo de Empresa (Livre) */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Building2 className="h-3 w-3 text-emerald-600" />
              Segmento de Empresa (Livre)
            </label>
            <div className="relative">
              <Input
                value={segmentQuery}
                onChange={(e) => setSegmentQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Ex: Escolas, Academias, Restaurantes, Clínicas"
                className="h-9 text-xs pl-8"
              />
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            </div>
          </div>

          {/* Botão de Busca & Ações de Atualização */}
          <div className="self-end flex items-center gap-2">
            <Button
              onClick={() => handleSearch(false, false)}
              disabled={isSearching}
              className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
            >
              {isSearching ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Buscar Empresas
                </>
              )}
            </Button>

            {hasSearched && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSearch(true, false)}
                disabled={isSearching}
                title="Ignora o cache de 24h e consulta novos dados no Google Places"
                className="h-9 px-2.5 text-xs text-slate-600 dark:text-slate-300"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isSearching ? 'animate-spin' : ''}`} />
                Atualizar resultados
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo Principal Dividido: Mapa à Esquerda/Centro, Resultados à Direita */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Lado Esquerdo: Mapa Interativo */}
        <div className="lg:col-span-7 flex flex-col h-[400px] lg:h-full">
          <ProspectingMap
            center={activeCenter}
            radiusKm={selectedRadius}
            places={filteredPlaces}
            selectedPlaceId={focusedPlaceIdOnMap}
            onSelectPlace={(p) => {
              setFocusedPlaceIdOnMap(p.id)
              handleOpenDetails(p)
            }}
            className="w-full h-full flex-1"
          />
        </div>

        {/* Lado Direito: Painel de Resultados, Filtros e Ações */}
        <div className="lg:col-span-5 flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          {/* Header dos Resultados com Contadores */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 shrink-0 space-y-2.5 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  Resultados da Região
                </h2>
                <p className="text-[11px] text-slate-500">
                  {filteredPlaces.length} exibidos de {places.length} encontrados
                </p>
              </div>

              {/* Botão de Adicionar Selecionados em Lote */}
              {selectedPlaceIds.size > 0 && (
                <Button
                  size="sm"
                  disabled={isBatchAdding}
                  onClick={handleBatchAddToCrm}
                  className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Adicionar ({selectedPlaceIds.size}) ao CRM
                </Button>
              )}
            </div>

            {/* Badges de Resumo & Provedor */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <Badge variant="outline" className="text-slate-700 dark:text-slate-300 font-medium">
                Total: <strong>{stats.total}</strong>
              </Badge>
              <Badge className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200">
                Novos: <strong>{stats.naoCadastrados}</strong>
              </Badge>
              <Badge className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200">
                No CRM: <strong>{stats.jaCadastrados}</strong>
              </Badge>
              <Badge variant="secondary">
                Com Tel: <strong>{stats.comTelefone}</strong>
              </Badge>

              <Badge
                variant="outline"
                className={`ml-auto text-[10px] font-medium ${
                  activeProvider === 'google_places'
                    ? 'border-blue-300 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30'
                }`}
              >
                {activeProvider === 'google_places'
                  ? `Google Places${searchSource === 'cache' ? ' (Cache 24h)' : ''}`
                  : 'OpenStreetMap (Fallback)'}
              </Badge>
            </div>

            {/* Alerta de Fallback para OpenStreetMap quando Google falhar ou o usuário desejar */}
            {osmFallbackAvailable && (
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
                <span>Deseja consultar a fonte alternativa OpenStreetMap?</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-100"
                  onClick={() => handleSearch(false, true)}
                >
                  Buscar usando fonte alternativa
                </Button>
              </div>
            )}

            {/* Filtros de Lista */}
            <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
              {/* Busca de texto no resultado */}
              <div className="relative flex-1 min-w-[130px]">
                <Input
                  value={searchTermInResults}
                  onChange={(e) => setSearchTermInResults(e.target.value)}
                  placeholder="Filtrar nesta lista..."
                  className="h-7 text-[11px] pl-6 pr-2"
                />
                <Search className="absolute left-1.5 top-2 h-3 w-3 text-slate-400" />
              </div>

              {/* Filtro por Status CRM */}
              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="h-7 text-[11px] w-[130px]">
                  <SelectValue placeholder="Status CRM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">
                    Todos os status
                  </SelectItem>
                  <SelectItem value="nao_cadastrado" className="text-xs">
                    Não prospectado
                  </SelectItem>
                  <SelectItem value="cadastrado" className="text-xs">
                    Já no CRM
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Checkboxes de Filtros Adicionais */}
            <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900">
                <Checkbox
                  checked={onlyWithPhone}
                  onCheckedChange={(c) => setOnlyWithPhone(Boolean(c))}
                />
                <span>Com telefone</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900">
                <Checkbox
                  checked={onlyWithWebsite}
                  onCheckedChange={(c) => setOnlyWithWebsite(Boolean(c))}
                />
                <span>Com site</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900">
                <Checkbox
                  checked={onlyNotRegistered}
                  onCheckedChange={(c) => setOnlyNotRegistered(Boolean(c))}
                />
                <span>Apenas não cadastrados</span>
              </label>
            </div>

            {/* Ações de Seleção Rápida */}
            <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="text-emerald-600 hover:underline font-medium"
                >
                  Selecionar todos
                </button>
                <span>•</span>
                <button type="button" onClick={handleClearSelection} className="hover:underline">
                  Limpar seleção
                </button>
              </div>

              {selectedPlaceIds.size > 0 && (
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedPlaceIds.size} selecionada(s)
                </span>
              )}
            </div>
          </div>

          {/* Lista Scrollável de Resultados */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {isSearching ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                <RefreshCw className="h-7 w-7 text-emerald-600 animate-spin mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Localizando empresas no raio de {selectedRadius} km...
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Consultando dados públicos de {segmentQuery}
                </p>
              </div>
            ) : filteredPlaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-4 text-slate-400">
                <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {hasSearched
                    ? 'Nenhum resultado corresponde aos filtros aplicados.'
                    : 'Clique em "Buscar Empresas" para iniciar a prospecção na região.'}
                </p>
              </div>
            ) : (
              filteredPlaces.map((place) => {
                const isSelected = selectedPlaceIds.has(place.id)
                const isCadastrado = place.crmStatus === 'cadastrado'
                const isFocused = focusedPlaceIdOnMap === place.id

                return (
                  <div
                    key={place.id}
                    onClick={() => {
                      setFocusedPlaceIdOnMap(place.id)
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isFocused
                        ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs'
                        : isCadastrado
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Checkbox de seleção */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleSelectPlace(place.id)
                        }}
                        className="pt-0.5"
                      >
                        <Checkbox checked={isSelected} />
                      </div>

                      {/* Informações da Empresa */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenDetails(place)
                            }}
                            className="text-xs font-bold text-slate-900 dark:text-white truncate hover:underline hover:text-emerald-600"
                          >
                            {place.name}
                          </h3>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                            📏 {place.distanceKm} km
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="capitalize">{place.category}</span>
                        </div>

                        {/* Endereço */}
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          {place.address}
                        </p>

                        {/* Dados de Contato com Validação Real */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px]">
                          {/* Telefone */}
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-emerald-600" />
                            {place.phone ? (
                              <span className="text-slate-800 dark:text-slate-200 font-medium">
                                {place.phone}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Telefone não encontrado</span>
                            )}
                          </span>

                          {/* Website */}
                          {place.website && (
                            <span className="flex items-center gap-1 text-indigo-600 truncate max-w-[150px]">
                              <Globe className="h-3 w-3" />
                              <a
                                href={place.website}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="hover:underline truncate"
                              >
                                {place.website.replace(/^https?:\/\//, '').replace(/^www\./, '')}
                              </a>
                            </span>
                          )}

                          {/* Email */}
                          {place.email && (
                            <span className="flex items-center gap-1 text-sky-600 truncate max-w-[150px]">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{place.email}</span>
                            </span>
                          )}
                        </div>

                        {/* Barra de Ações do Item */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-1">
                          <div>
                            {isCadastrado ? (
                              <Badge className="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 text-[10px] py-0">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Já no CRM
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 text-slate-500">
                                Não prospectado
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* Botão Ver Detalhes */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenDetails(place)
                              }}
                            >
                              Detalhes
                            </Button>

                            {/* Botão WhatsApp (pode disparar busca de detalhes sob demanda) */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-emerald-700 dark:text-emerald-300 border-emerald-300 hover:bg-emerald-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStartWhatsApp(place, place.existingClient)
                              }}
                            >
                              <MessageSquare className="h-3 w-3 mr-1" />
                              WhatsApp
                            </Button>

                            {/* Botão Adicionar ou Ver Cliente */}
                            {isCadastrado && place.existingClient ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewClient(place.existingClient!.id)
                                }}
                              >
                                Ver Cliente
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 px-2.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleAddSingleToCrm(place)
                                }}
                              >
                                <UserPlus className="h-3 w-3 mr-1" />
                                Adicionar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}

            {/* Botão "Carregar Mais" quando nextPageToken presente */}
            {nextPageToken && !isSearching && (
              <div className="pt-2 pb-1 text-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoadingMore}
                  onClick={handleLoadMore}
                  className="w-full text-xs text-slate-700 dark:text-slate-300 border-dashed"
                >
                  {isLoadingMore ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Carregando mais...
                    </>
                  ) : (
                    <>
                      <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                      Carregar mais empresas
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalhes do Estabelecimento */}
      <ProspectingDetailsModal
        isOpen={Boolean(selectedPlaceForDetails)}
        onClose={() => setSelectedPlaceForDetails(null)}
        place={selectedPlaceForDetails}
        onAddToCrm={handleAddSingleToCrm}
        onStartWhatsApp={handleStartWhatsApp}
        onFocusOnMap={(p) => {
          setFocusedPlaceIdOnMap(p.id)
          setSelectedPlaceForDetails(null)
        }}
        onViewClient={(clientId) => {
          setSelectedPlaceForDetails(null)
          handleViewClient(clientId)
        }}
        isAddingToCrm={isAddingSingle}
      />

      {/* Modal de Início de Conversa do WhatsApp com Template Aprovado Meta e Revisão Prévia */}
      {clientForWhatsApp && (
        <StartWhatsAppConversationModal
          isOpen={whatsAppModalOpen}
          onClose={() => {
            setWhatsAppModalOpen(false)
            setClientForWhatsApp(null)
          }}
          client={clientForWhatsApp}
          onSuccess={(updated) => {
            setPlaces((prev) =>
              prev.map((p) =>
                p.existingClient?.id === updated.id ? { ...p, existingClient: updated } : p,
              ),
            )
          }}
        />
      )}

      {/* Modal de Edição/Visualização do Cliente */}
      {clientToEdit && (
        <ClientFormModal
          isOpen={clientFormModalOpen}
          onClose={() => {
            setClientFormModalOpen(false)
            setClientToEdit(null)
          }}
          clientToEdit={clientToEdit}
          onSaved={() => {
            setClientFormModalOpen(false)
            setClientToEdit(null)
          }}
        />
      )}
    </div>
  )
}
