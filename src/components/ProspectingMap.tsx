/**
 * Componente de Mapa de Prospecção utilizando Leaflet via CDN dinâmico
 * Não necessita de chave de API (OpenStreetMap padrão), sem erros de tiles ou "API KEY REQUIRED".
 * Suporta:
 * - Ponto central da pesquisa (marcador azul/verde pulsante)
 * - Círculo do raio em km (atualiza dinamicamente ao alterar o raio)
 * - Marcadores das empresas (com badges de status CRM)
 * - Seleção e destaque de marcadores
 * - Auto-fit aos limites da pesquisa
 */

import React, { useEffect, useRef } from 'react'
import type { ProspectingPlace } from '@/types/crm'

interface ProspectingMapProps {
  center: { lat: number; lng: number }
  radiusKm: number
  places: ProspectingPlace[]
  selectedPlaceId?: string | null
  onSelectPlace?: (place: ProspectingPlace) => void
  className?: string
}

declare global {
  interface Window {
    L: any
  }
}

let leafletScriptPromise: Promise<any> | null = null

function loadLeafletLibrary(): Promise<any> {
  if (typeof window !== 'undefined' && window.L) {
    return Promise.resolve(window.L)
  }

  if (leafletScriptPromise) {
    return leafletScriptPromise
  }

  leafletScriptPromise = new Promise((resolve, reject) => {
    // 1. Injetar CSS do Leaflet se não existir
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
      link.crossOrigin = ''
      document.head.appendChild(link)
    }

    // 2. Injetar Script do Leaflet
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
    script.crossOrigin = ''
    script.async = true

    script.onload = () => {
      resolve(window.L)
    }
    script.onerror = (err) => {
      console.error('Failed to load Leaflet script from CDN', err)
      reject(err)
    }

    document.head.appendChild(script)
  })

  return leafletScriptPromise
}

export default function ProspectingMap({
  center,
  radiusKm,
  places,
  selectedPlaceId,
  onSelectPlace,
  className = 'w-full h-full min-h-[380px]',
}: ProspectingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const centerMarkerRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const markersMapRef = useRef<Map<string, any>>(new Map())

  // 1. Inicialização do Mapa
  useEffect(() => {
    let isCancelled = false

    loadLeafletLibrary()
      .then((L) => {
        if (isCancelled || !containerRef.current) return

        // Se o mapa já foi criado neste container, não recriar do zero
        if (!mapInstanceRef.current) {
          const map = L.map(containerRef.current, {
            center: [center.lat, center.lng],
            zoom: 13,
            zoomControl: false,
          })

          // Adiciona controle de zoom no topo à direita
          L.control.zoom({ position: 'topright' }).addTo(map)

          // Camada OpenStreetMap padrão rápida e livre de chaves
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          }).addTo(map)

          // Grupo de marcadores
          const markersGroup = L.layerGroup().addTo(map)
          markersLayerRef.current = markersGroup

          mapInstanceRef.current = map
        }

        updateMapElements(L)
      })
      .catch((err) => {
        console.error('Error initializing map:', err)
      })

    return () => {
      isCancelled = true
    }
  }, [])

  // 2. Atualizar centro, raio e marcadores quando mudarem
  useEffect(() => {
    if (window.L && mapInstanceRef.current) {
      updateMapElements(window.L)
    }
  }, [center.lat, center.lng, radiusKm, places, selectedPlaceId])

  const updateMapElements = (L: any) => {
    const map = mapInstanceRef.current
    if (!map) return

    // 1. Atualizar ou criar marcador de centro
    if (centerMarkerRef.current) {
      centerMarkerRef.current.setLatLng([center.lat, center.lng])
    } else {
      const centerHtml = `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 rounded-full bg-emerald-500 opacity-40 animate-ping"></div>
          <div class="w-5 h-5 rounded-full bg-emerald-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-[9px] font-bold">
            ★
          </div>
        </div>
      `
      const centerIcon = L.divIcon({
        className: 'custom-center-marker',
        html: centerHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })

      const centerMarker = L.marker([center.lat, center.lng], {
        icon: centerIcon,
        zIndexOffset: 1000,
      }).addTo(map)

      centerMarker.bindTooltip('<b>Centro da Busca</b><br>Raio: ' + radiusKm + ' km', {
        direction: 'top',
        offset: [0, -10],
      })

      centerMarkerRef.current = centerMarker
    }

    // 2. Atualizar ou criar Círculo de Raio
    const radiusMeters = radiusKm * 1000
    if (circleRef.current) {
      circleRef.current.setLatLng([center.lat, center.lng])
      circleRef.current.setRadius(radiusMeters)
    } else {
      const circle = L.circle([center.lat, center.lng], {
        radius: radiusMeters,
        color: '#059669', // Emerald 600
        fillColor: '#10b981', // Emerald 500
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '4, 6',
      }).addTo(map)
      circleRef.current = circle
    }

    // 3. Atualizar marcadores dos estabelecimentos
    const markersGroup = markersLayerRef.current
    if (markersGroup) {
      markersGroup.clearLayers()
      markersMapRef.current.clear()

      places.forEach((place) => {
        const isSelected = selectedPlaceId === place.id
        const isCadastrado = place.crmStatus === 'cadastrado'

        // Cores e estilo do marcador:
        // Cadastrado = Violeta / Indigo
        // Não cadastrado = Emerald
        // Selecionado = Borda âmbar espessa / escala maior
        const bgColor = isCadastrado ? 'bg-indigo-600' : 'bg-emerald-600'
        const ringClass = isSelected
          ? 'ring-4 ring-amber-400 scale-125 z-50'
          : 'ring-2 ring-white hover:scale-110'

        const markerHtml = `
          <div class="cursor-pointer transition-transform duration-150 flex flex-col items-center group">
            <div class="w-7 h-7 rounded-full ${bgColor} ${ringClass} shadow-md flex items-center justify-center text-white text-xs font-bold">
              ${isCadastrado ? '✓' : '📍'}
            </div>
            <div class="hidden group-hover:block absolute -top-7 bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none z-50">
              ${place.name}
            </div>
          </div>
        `

        const icon = L.divIcon({
          className: 'custom-place-marker',
          html: markerHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        const marker = L.marker([place.lat, place.lng], { icon })
        marker.on('click', () => {
          if (onSelectPlace) {
            onSelectPlace(place)
          }
        })

        // Popup com informações rápidas
        const popupContent = `
          <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 180px;">
            <div style="font-weight: bold; color: #0f172a; margin-bottom: 2px;">${place.name}</div>
            <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">${place.category || 'Comércio'} • ${place.distanceKm} km</div>
            <div style="color: #334155; font-size: 11px; margin-bottom: 4px;">📍 ${place.address}</div>
            ${place.phone ? `<div style="color: #059669; font-size: 11px;">📞 ${place.phone}</div>` : '<div style="color: #94a3b8; font-size: 10px;">Telefone não encontrado</div>'}
            <div style="margin-top: 6px;">
              ${isCadastrado ? '<span style="background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">Já no CRM</span>' : '<span style="background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">Não prospectado</span>'}
            </div>
          </div>
        `
        marker.bindPopup(popupContent)

        markersGroup.addLayer(marker)
        markersMapRef.current.set(place.id, marker)

        if (isSelected) {
          marker.openPopup()
        }
      })
    }

    // 4. Ajustar zoom para enquadrar o círculo de raio se necessário
    if (circleRef.current) {
      const bounds = circleRef.current.getBounds()
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 })
    }
  }

  // Focar no local selecionado quando ele mudar externamente
  useEffect(() => {
    if (!selectedPlaceId || !mapInstanceRef.current) return
    const marker = markersMapRef.current.get(selectedPlaceId)
    if (marker) {
      const latLng = marker.getLatLng()
      mapInstanceRef.current.panTo(latLng, { animate: true, duration: 0.5 })
      marker.openPopup()
    }
  }, [selectedPlaceId])

  return (
    <div
      className={`relative z-0 isolate overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 ${className}`}
    >
      <div ref={containerRef} className="w-full h-full min-h-[380px]" />
      {/* Legenda do Mapa */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs p-2.5 rounded-lg shadow-md border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5 pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block"></span>
          <span className="text-slate-700 dark:text-slate-300">Nova Oportunidade</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block"></span>
          <span className="text-slate-700 dark:text-slate-300">Já cadastrado no CRM</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border border-dashed border-emerald-600 bg-emerald-100 dark:bg-emerald-950 inline-block"></span>
          <span className="text-slate-700 dark:text-slate-300">Raio de {radiusKm} km</span>
        </div>
        <div className="pt-1 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
          Provedores: Google Places API / OpenStreetMap
        </div>
      </div>
    </div>
  )
}
