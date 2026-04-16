import type { CurrentMapLayerId } from '@/lib/currentMapLayers'
import type { CurrentMapViewState } from '@/features/map/engine/runtimeProtocol'

type CurrentMapViewport = {
  lat: number
  lon: number
  zoom: number
  latSpan?: number
  lonSpan?: number
}

export function buildCurrentMapViewState(params: {
  engine: 'svgmap' | 'maplibre'
  viewport: CurrentMapViewport
  visibleLayerIds: CurrentMapLayerId[]
  layerOpacity?: Partial<Record<CurrentMapLayerId, number>>
  selectedFeatureId?: string
}): CurrentMapViewState {
  const { engine, viewport, visibleLayerIds, layerOpacity, selectedFeatureId } = params

  return {
    engine,
    center: {
      lat: viewport.lat,
      lon: viewport.lon,
    },
    zoom: viewport.zoom,
    span: viewport.lonSpan ?? viewport.latSpan,
    latSpan: viewport.latSpan,
    lonSpan: viewport.lonSpan,
    visibleLayerIds,
    layerOpacity,
    selectedFeatureId,
  }
}
