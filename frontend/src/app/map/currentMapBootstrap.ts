import { FALLBACK_MAP_VIEW } from '@/features/map/engine/defaultMapView'
import {
  currentMapDefaultLayerOpacity,
  mergeCurrentMapLayerOpacity,
} from '@/features/map/engine/layerOpacity'
import type { RuntimeConfig } from '@/features/map/engine/runtimeConfig'
import type { MapState } from '@/lib/urlState'
import { toCurrentMapLayerVisibilityMap } from '@/lib/currentMapLayers'

type MapViewport = {
  lat: number
  lon: number
  zoom: number
  latSpan: number
  lonSpan: number
}

export type CurrentMapBootstrapState = {
  mapEngine: 'svgmap' | 'maplibre'
  activeLayers: Record<string, boolean>
  mapViewport: MapViewport
  layerOpacity: Record<string, number>
}

export function buildCurrentMapBootstrapState(params: {
  runtimeConfig: RuntimeConfig
  savedState: MapState | null
}): CurrentMapBootstrapState {
  const { runtimeConfig, savedState } = params
  const runtimeVisibleLayerIds = Object.entries(runtimeConfig.layers || {})
    .filter(([, layer]) => Boolean(layer?.runtimeVisible))
    .map(([layerId]) => layerId)
  const runtimeViewSpan = runtimeConfig.initialView.span ?? FALLBACK_MAP_VIEW.span
  const runtimeLayerOpacity = mergeCurrentMapLayerOpacity(currentMapDefaultLayerOpacity, {})

  if (savedState) {
    const resolvedLatSpan = savedState.latSpan ?? savedState.span ?? runtimeViewSpan
    const resolvedLonSpan = savedState.lonSpan ?? savedState.span ?? runtimeViewSpan

    return {
      mapEngine: savedState.engine,
      activeLayers: toCurrentMapLayerVisibilityMap(savedState.visibleLayerIds),
      mapViewport: {
        lat: savedState.center.lat,
        lon: savedState.center.lon,
        zoom: savedState.zoom,
        latSpan: resolvedLatSpan,
        lonSpan: resolvedLonSpan,
      },
      layerOpacity: mergeCurrentMapLayerOpacity(runtimeLayerOpacity, savedState.layerOpacity),
    }
  }

  return {
    mapEngine: runtimeConfig.engine,
    activeLayers: toCurrentMapLayerVisibilityMap(runtimeVisibleLayerIds),
    mapViewport: {
      lat: runtimeConfig.initialView.center.lat,
      lon: runtimeConfig.initialView.center.lon,
      zoom: runtimeConfig.initialView.zoom,
      latSpan: runtimeViewSpan,
      lonSpan: runtimeViewSpan,
    },
    layerOpacity: runtimeLayerOpacity,
  }
}
