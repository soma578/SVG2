'use client'

import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import MapLibreMap from '@/components/map/MapLibreMap'
import { buildCurrentMapViewState } from '@/app/map/currentMapRuntimeView'
import type { RuntimeConfig } from '@/features/map/engine/runtimeConfig'
import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'
import type {
  CurrentMapRuntimeCommand,
  CurrentMapMapLibreRuntimeCommandMessage,
} from '@/features/map/engine/runtimeProtocol'
import { currentMapDefaultLayerOpacity } from '@/features/map/engine/layerOpacity'
import type { CurrentMapRegionConfig } from '@/lib/currentMapRegion'
import type { MapState } from '@/lib/urlState'
import type { DataSourceStatus } from '@/components/map/MapLibreMap'

type MapViewport = {
  lat: number
  lon: number
  zoom: number
  latSpan?: number
  lonSpan?: number
}

type HighlightTarget = MapViewport & { token: number }

interface MapLibreHostProps {
  activeLayers: Record<string, boolean>
  showSidebar: boolean
  layerOpacity: Record<string, number>
  regionConfig: CurrentMapRegionConfig
  selectedPrefecture?: string | null
  runtimeConfig: RuntimeConfig | null
  initialViewport: MapViewport
  viewportConstraint?: {
    minZoom?: number
    maxBounds?: [[number, number], [number, number]]
  }
  basemapBounds?: [number, number, number, number]
  currentMapState: MapState
  highlightTarget?: HighlightTarget
  selectedFeatureId?: string
  selectedBaseAreaName?: string | null
  selectedBaseAreaCode?: string | null
  showDistrictBoundaries?: boolean
  controlCommand?: { token: number; command: CurrentMapRuntimeCommand } | null
  reloadToken?: number
  onMapMove?: (viewport: MapViewport) => void
  onSelectedFeatureChange?: (feature: CurrentMapFeatureProperties | null) => void
  onRuntimeReady?: () => void
  onRuntimeError?: (message: string) => void
  onDataSourceChange?: (status: DataSourceStatus) => void
}

export default memo(function MapLibreHost({
  activeLayers,
  showSidebar,
  layerOpacity,
  regionConfig,
  selectedPrefecture,
  runtimeConfig,
  initialViewport,
  viewportConstraint,
  basemapBounds,
  currentMapState,
  highlightTarget,
  selectedFeatureId,
  selectedBaseAreaName,
  selectedBaseAreaCode,
  showDistrictBoundaries,
  controlCommand,
  reloadToken = 0,
  onMapMove,
  onSelectedFeatureChange,
  onRuntimeReady,
  onRuntimeError,
  onDataSourceChange,
}: MapLibreHostProps) {
  const commandSeqRef = useRef(0)
  const bootstrapSentRef = useRef(false)
  const lastLayerSignatureRef = useRef('')
  const lastOpacitySignatureRef = useRef('')
  const lastHighlightTokenRef = useRef<number | null>(null)
  const lastControlTokenRef = useRef<number | null>(null)
  const runtimeBridgeId = useMemo(() => `maplibre-${reloadToken}`, [reloadToken])

  const enqueueRuntimeCommand = useCallback((command: CurrentMapRuntimeCommand) => {
    const nextId = commandSeqRef.current + 1
    commandSeqRef.current = nextId
    if (typeof window === 'undefined') return

    const message: CurrentMapMapLibreRuntimeCommandMessage = {
      type: 'maplibre-runtime:command',
      bridgeId: runtimeBridgeId,
      envelope: {
        id: nextId,
        command,
      },
    }
    window.postMessage(message, window.location.origin)
  }, [runtimeBridgeId])

  useEffect(() => {
    bootstrapSentRef.current = false
    commandSeqRef.current = 0
    lastLayerSignatureRef.current = ''
    lastOpacitySignatureRef.current = ''
    lastHighlightTokenRef.current = null
    lastControlTokenRef.current = null
  }, [reloadToken, runtimeBridgeId])

  useEffect(() => {
    const signature = JSON.stringify(currentMapState.visibleLayerIds)
    if (lastLayerSignatureRef.current === signature) return
    lastLayerSignatureRef.current = signature
    enqueueRuntimeCommand({
      type: 'runtime:setLayers',
      payload: currentMapState.visibleLayerIds,
    })
  }, [currentMapState.visibleLayerIds, enqueueRuntimeCommand])

  useEffect(() => {
    const signature = JSON.stringify(currentMapState.layerOpacity ?? currentMapDefaultLayerOpacity)
    if (lastOpacitySignatureRef.current === signature) return
    lastOpacitySignatureRef.current = signature
    enqueueRuntimeCommand({
      type: 'runtime:setOpacity',
      payload: currentMapState.layerOpacity ?? currentMapDefaultLayerOpacity,
    })
  }, [currentMapState.layerOpacity, enqueueRuntimeCommand])

  useEffect(() => {
    if (bootstrapSentRef.current) return
    bootstrapSentRef.current = true

    enqueueRuntimeCommand({ type: 'runtime:statusRequest' })
    enqueueRuntimeCommand({
      type: 'runtime:setView',
      payload: buildCurrentMapViewState({
        engine: 'maplibre',
        viewport: initialViewport,
        visibleLayerIds: currentMapState.visibleLayerIds,
        layerOpacity: currentMapState.layerOpacity,
        selectedFeatureId,
      }),
    })
  }, [
    currentMapState.layerOpacity,
    currentMapState.visibleLayerIds,
    enqueueRuntimeCommand,
    initialViewport,
    selectedFeatureId,
  ])

  useEffect(() => {
    if (!highlightTarget) return
    if (lastHighlightTokenRef.current === highlightTarget.token) return
    lastHighlightTokenRef.current = highlightTarget.token
    enqueueRuntimeCommand({
      type: 'runtime:setView',
      payload: buildCurrentMapViewState({
        engine: 'maplibre',
        viewport: highlightTarget,
        visibleLayerIds: currentMapState.visibleLayerIds,
        layerOpacity: currentMapState.layerOpacity,
        selectedFeatureId,
      }),
    })
  }, [
    currentMapState.layerOpacity,
    currentMapState.visibleLayerIds,
    enqueueRuntimeCommand,
    highlightTarget,
    selectedFeatureId,
  ])

  useEffect(() => {
    if (!controlCommand) return
    if (lastControlTokenRef.current === controlCommand.token) return
    lastControlTokenRef.current = controlCommand.token
    enqueueRuntimeCommand(controlCommand.command)
  }, [controlCommand, enqueueRuntimeCommand])

  return (
    <MapLibreMap
      key={runtimeBridgeId}
      activeLayers={activeLayers}
      showSidebar={showSidebar}
      layerOpacity={layerOpacity}
      regionConfig={regionConfig}
      selectedPrefecture={selectedPrefecture}
      runtimeBridgeId={runtimeBridgeId}
      runtimeConfig={runtimeConfig}
      viewportConstraint={viewportConstraint}
      basemapBounds={basemapBounds}
      highlightTarget={highlightTarget}
      selectedFeatureId={selectedFeatureId}
      selectedBaseAreaName={selectedBaseAreaName}
      selectedBaseAreaCode={selectedBaseAreaCode}
      showDistrictBoundaries={showDistrictBoundaries}
      initialViewport={initialViewport}
      onMapMove={onMapMove}
      onSelectedFeatureChange={onSelectedFeatureChange}
      onRuntimeReady={onRuntimeReady}
      onRuntimeError={onRuntimeError}
      onDataSourceChange={onDataSourceChange}
    />
  )
})
