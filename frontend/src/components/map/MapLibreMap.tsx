'use client'

import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import Map, { ScaleControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type {
  CurrentMapFeatureProperties,
  MapFeatureProperties,
} from '@/features/map/engine/featureTypes'
import type { CurrentMapRuntimeCommand } from '@/features/map/engine/runtimeProtocol'
import type { CurrentMapDebugStats } from '@/features/map/maplibre/currentMapInfoOverlayHelpers'
import {
  currentMapDefaultLayerOpacity,
  mergeCurrentMapLayerOpacity,
} from '@/features/map/engine/layerOpacity'
import { FALLBACK_MAP_CENTER, FALLBACK_MAP_ZOOM } from '@/features/map/engine/defaultMapView'
import { getRuntimeLayerMinZoom, type RuntimeConfig } from '@/features/map/engine/runtimeConfig'
import { currentMapLayerIds, type CurrentMapLayerId } from '@/lib/currentMapLayers'
import {
  useMapLibreRuntimeCommandBridge,
  useMapLibreRuntimeEventBridge,
} from '@/features/map/engine/useMapLibreRuntimeBridge'
import { MAPLIBRE_INTERACTIVE_LAYER_IDS } from '@/features/map/maplibre/mapInteractionHelpers'
import { useCurrentMapLayerData, type DataSourceType } from '@/features/map/maplibre/useCurrentMapLayerData'

export type DataSourceStatus = {
  shelter: { source: DataSourceType; fetchedAt: string | null }
  teamActivity: { source: DataSourceType; fetchedAt: string | null }
}
import { useMapLibreInteractions } from '@/features/map/maplibre/useMapLibreInteractions'
import { applyMapLoadReadyAction, applyMapMoveViewportAction } from '@/features/map/maplibre/lifecycleActionHelpers'
import { applyMapLibreRuntimeCommand } from '@/features/map/maplibre/runtimeCommandHandlers'
import {
  notifyRuntimeErrorFromMapError,
  notifyRuntimeViewChangeFromMove,
} from '@/features/map/maplibre/runtimeEventHelpers'
import {
  useMapLibreHighlightTarget,
  type MapLibreHighlightTarget,
} from '@/features/map/maplibre/useMapLibreHighlightTarget'
import { useMapLibreUiState } from '@/features/map/maplibre/useMapLibreUiState'
import MapLibreOverlayLayers from './MapLibreOverlayLayers'
import MapLibreInfoOverlays from './MapLibreInfoOverlays'
import { useDistrictLayers } from '@/hooks/useDistrictLayers'
import { registerPMTilesProtocol } from '@/lib/pmtilesLoader'
import { buildMapLibreBaseStyle } from '@/lib/mapLibreBaseStyle'
import { currentMapRegionConfig, type CurrentMapRegionConfig } from '@/lib/currentMapRegion'

interface MapLibreMapProps {
  activeLayers: Record<string, boolean>
  showSidebar: boolean
  layerOpacity?: Record<string, number>
  runtimeBridgeId?: string
  boundaryOpacity?: number
  initialViewport?: { lat: number; lon: number; zoom: number; latSpan?: number; lonSpan?: number }
  highlightTarget?: MapLibreHighlightTarget
  selectedFeatureId?: string
  selectedBaseAreaName?: string | null
  selectedBaseAreaCode?: string | null
  showDistrictBoundaries?: boolean
  onMapMove?: (viewport: {
    lat: number
    lon: number
    zoom: number
    latSpan?: number
    lonSpan?: number
  }) => void
  onSelectedFeatureChange?: (feature: CurrentMapFeatureProperties | null) => void
  onRuntimeReady?: () => void
  onRuntimeError?: (message: string) => void
  onDataSourceChange?: (status: DataSourceStatus) => void
  runtimeConfig?: RuntimeConfig | null
  regionConfig?: CurrentMapRegionConfig
  selectedPrefecture?: string | null
  viewportConstraint?: {
    minZoom?: number
    maxBounds?: [[number, number], [number, number]]
  }
  basemapBounds?: [number, number, number, number]
}

export default function MapLibreMap({
  activeLayers: activeLayersProp,
  showSidebar,
  layerOpacity: layerOpacityProp = currentMapDefaultLayerOpacity,
  runtimeBridgeId,
  boundaryOpacity = 0.7,
  initialViewport,
  highlightTarget,
  selectedFeatureId,
  selectedBaseAreaName,
  selectedBaseAreaCode,
  showDistrictBoundaries,
  onMapMove,
  onSelectedFeatureChange,
  onRuntimeReady,
  onRuntimeError,
  onDataSourceChange,
  runtimeConfig,
  regionConfig = currentMapRegionConfig,
  selectedPrefecture,
  viewportConstraint,
  basemapBounds,
}: MapLibreMapProps) {
  const [runtimeLayerState, setRuntimeLayerState] = useState<Record<string, boolean> | null>(null)
  const [runtimeLayerOpacityState, setRuntimeLayerOpacityState] = useState<Record<string, number> | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const activeLayers = runtimeLayerState ?? activeLayersProp
  const layerOpacity = useMemo(
    () => mergeCurrentMapLayerOpacity(layerOpacityProp, runtimeLayerOpacityState),
    [layerOpacityProp, runtimeLayerOpacityState]
  )
  const mapRef = useRef<any>(null)
  const getMapInstance = useCallback(() => mapRef.current?.getMap?.(), [])
  const lastProcessedCommandIdRef = useRef(0)
  const [viewport, setViewport] = useState({
    longitude: initialViewport?.lon ?? FALLBACK_MAP_CENTER.lon,
    latitude: initialViewport?.lat ?? FALLBACK_MAP_CENTER.lat,
    zoom: initialViewport?.zoom ?? FALLBACK_MAP_ZOOM,
  })
  const {
    popupInfo,
    setPopupInfo,
    closePopup,
  } = useMapLibreUiState()
  const evacuationLayerVisible = Boolean(activeLayers.evacuation)
  const effectiveMapStyle = useMemo(() => {
    const useBoundedBasemap = regionConfig.regionId === 'japan' && selectedPrefecture && basemapBounds
    return buildMapLibreBaseStyle({
      basemapBounds: useBoundedBasemap ? basemapBounds : undefined,
    })
  }, [basemapBounds, regionConfig.regionId, selectedPrefecture])
  const layerMinZooms = useMemo(
    () => ({
      municipality: getRuntimeLayerMinZoom(runtimeConfig, 'baseArea', 6),
      districtDetail: regionConfig.regionId === 'japan' ? 8.5 : 11,
      evacuation: getRuntimeLayerMinZoom(runtimeConfig, 'evacuation', 9),
      teamActivity: getRuntimeLayerMinZoom(runtimeConfig, 'teamActivity', 0),
    }),
    [regionConfig.regionId, runtimeConfig]
  )
  const getVisibleLayerIds = useCallback(
    (): CurrentMapLayerId[] => currentMapLayerIds.filter((layerId) => Boolean(activeLayers[layerId])),
    [activeLayers]
  )

  const { notifyRuntimeReady, notifyRuntimeError, notifyViewChange, notifySelectedFeatureChange } =
    useMapLibreRuntimeEventBridge({
      runtimeBridgeId,
      onRuntimeReady,
      onRuntimeError,
      onMapMove,
      onSelectedFeatureChange: onSelectedFeatureChange
        ? (feature: MapFeatureProperties | null) =>
            onSelectedFeatureChange(feature as CurrentMapFeatureProperties | null)
        : undefined,
    })

  const { geojson: districtsGeoJSON } = useDistrictLayers(
    viewport.zoom,
    Boolean(activeLayers.baseArea) && viewport.zoom >= layerMinZooms.districtDetail,
    regionConfig.regionId
  )
  const currentViewportForLayers = useMemo(
    () => ({ lat: viewport.latitude, lon: viewport.longitude }),
    [viewport.latitude, viewport.longitude]
  )
  const {
    sheltersGeoJSON,
    teamActivityGeoJSON,
    baseAreaCentroidGeoJSON,
    dataSourceStatus,
  } = useCurrentMapLayerData({
    evacuationEnabled: Boolean(activeLayers.evacuation),
    teamActivityEnabled: Boolean(activeLayers.teamActivity),
    baseAreaEnabled: Boolean(activeLayers.baseArea),
    currentZoom: viewport.zoom,
    currentViewport: currentViewportForLayers,
    evacuationMinZoom: layerMinZooms.evacuation,
    teamActivityMinZoom: layerMinZooms.teamActivity,
    baseAreaMinZoom: layerMinZooms.districtDetail,
    regionConfig,
    selectedPrefecture,
  })

  useEffect(() => {
    onDataSourceChange?.(dataSourceStatus)
  }, [dataSourceStatus, onDataSourceChange])

  const {
    handleMapClick,
    handleMouseMove,
  } = useMapLibreInteractions({
    mapRef,
    notifySelectedFeatureChange,
    setPopupInfo,
  })

  const applyRuntimeCommand = useCallback(
    (command: CurrentMapRuntimeCommand) => {
      applyMapLibreRuntimeCommand({
        command,
        mapRef,
        mapLoaded,
        viewport,
        getVisibleLayerIds,
        layerOpacity,
        layerOpacityFallback: layerOpacityProp,
        notifyRuntimeReady,
        notifyRuntimeError,
        notifyViewChange,
        setRuntimeLayerState,
        setRuntimeLayerOpacityState,
        setViewport,
        setGpsPosition: () => {},
      })
    },
    [
      getVisibleLayerIds,
      layerOpacity,
      layerOpacityProp,
      mapLoaded,
      notifyRuntimeError,
      notifyRuntimeReady,
      notifyViewChange,
      viewport,
    ]
  )

  useMapLibreRuntimeCommandBridge({
    runtimeBridgeId,
    lastProcessedCommandIdRef,
    applyRuntimeCommand,
  })

  useMapLibreHighlightTarget({
    highlightTarget,
    getMap: getMapInstance,
    setViewport,
  })

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return

    map.on?.('styleimagemissing', (event: { id?: string }) => {
      const imageId = String(event?.id || '')
      if (!imageId || map.hasImage?.(imageId)) return
      try {
        map.addImage?.(
          imageId,
          {
            width: 1,
            height: 1,
            data: new Uint8Array([0, 0, 0, 0]),
          },
          { pixelRatio: 1 }
        )
      } catch (error) {
        console.warn('[MapLibre] Failed to register placeholder image:', imageId, error)
      }
    })

    applyMapLoadReadyAction({
      registerPMTilesProtocol,
      setMapLoaded,
      notifyRuntimeReady,
    })
  }, [notifyRuntimeReady])

  const handleMapMoveRuntime = useCallback((evt: any) => {
    const map = mapRef.current?.getMap?.()
    applyMapMoveViewportAction({
      viewState: evt.viewState,
      hasWelfareSpider: false,
      clearWelfareSpider: () => {},
      setViewport,
    })
    notifyRuntimeViewChangeFromMove({
      viewState: evt.viewState,
      map,
      layerOpacity,
      getVisibleLayerIds,
      notifyViewChange,
    })
  }, [getVisibleLayerIds, layerOpacity, notifyViewChange])

  const handleMapError = useCallback((event: any) => {
    notifyRuntimeErrorFromMapError({
      event,
      notifyRuntimeError,
    })
  }, [notifyRuntimeError])

  const filteredSheltersFeatures = useMemo(() => {
    if (!selectedBaseAreaName || regionConfig.regionId === 'japan') return sheltersGeoJSON.features
    return sheltersGeoJSON.features.filter((f: any) => {
      const address = String(f?.properties?.address || '')
      return address.includes(selectedBaseAreaName)
    })
  }, [sheltersGeoJSON.features, selectedBaseAreaName, regionConfig.regionId])

  const filteredTeamActivityGeoJSON = useMemo(() => {
    if (!selectedBaseAreaName || regionConfig.regionId === 'japan') return teamActivityGeoJSON
    const filtered = teamActivityGeoJSON.features.filter((f: any) => {
      const area = String(f?.properties?.area || '')
      const address = String(f?.properties?.address || '')
      return area.includes(selectedBaseAreaName) || address.includes(selectedBaseAreaName)
    })
    return { type: 'FeatureCollection' as const, features: filtered }
  }, [teamActivityGeoJSON, selectedBaseAreaName, regionConfig.regionId])

  const debugLayerStats = useMemo<CurrentMapDebugStats>(() => {
    const counts: Record<string, number> = {}
    let total = 0

    if (activeLayers.evacuation && filteredSheltersFeatures.length > 0) {
      counts['避難所'] = filteredSheltersFeatures.length
      total += filteredSheltersFeatures.length
    }
    if (activeLayers.baseArea && districtsGeoJSON?.features) {
      counts['地区境界'] = districtsGeoJSON.features.length
      total += districtsGeoJSON.features.length
    }
    if (activeLayers.teamActivity && filteredTeamActivityGeoJSON?.features) {
      counts['チーム活動'] = filteredTeamActivityGeoJSON.features.length
      total += filteredTeamActivityGeoJSON.features.length
    }

    return {
      layerCounts: counts,
      totalFeatures: total,
    }
  }, [activeLayers, districtsGeoJSON, filteredSheltersFeatures, filteredTeamActivityGeoJSON])

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        {...viewport}
        onMove={handleMapMoveRuntime}
        onLoad={handleMapLoad}
        onError={handleMapError}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        interactiveLayerIds={[...MAPLIBRE_INTERACTIVE_LAYER_IDS]}
        minZoom={viewportConstraint?.minZoom ?? 4}
        maxZoom={17.5}
        maxBounds={viewportConstraint?.maxBounds}
        style={{ width: '100%', height: '100%' }}
        mapStyle={effectiveMapStyle}
      >
        <MapLibreOverlayLayers
          activeLayers={activeLayers}
          evacuationLayerVisible={evacuationLayerVisible}
          teamActivityGeoJSON={filteredTeamActivityGeoJSON}
          boundaryOpacity={boundaryOpacity}
          shelters={filteredSheltersFeatures}
          districtsGeoJSON={districtsGeoJSON}
          selectedFeatureId={selectedFeatureId}
          selectedBaseAreaName={selectedBaseAreaName}
          selectedBaseAreaCode={selectedBaseAreaCode}
          showDistrictBoundaries={showDistrictBoundaries}
          layerMinZooms={layerMinZooms}
          viewportZoom={viewport.zoom}
          regionConfig={regionConfig}
          selectedPrefecture={selectedPrefecture}
        />
        <ScaleControl position="bottom-right" />
      </Map>

      <MapLibreInfoOverlays
        activeLayers={activeLayers}
        showSidebar={showSidebar}
        popupInfo={popupInfo}
        onClosePopup={closePopup}
        zoom={viewport.zoom}
        debugStats={debugLayerStats}
      />
    </div>
  )
}
