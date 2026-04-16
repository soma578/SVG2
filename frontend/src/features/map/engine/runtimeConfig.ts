import { currentMapLayerIds } from './layerDefinitions'
import type { MapEngine } from './layerDefinitions'
import type { CurrentMapLayerId } from './layerDefinitions'
import {
  currentMapRegionConfig,
  loadCurrentMapRegionConfig,
  type CurrentMapRegionConfig,
} from '@/lib/currentMapRegion'

export type RuntimeDynamicSource = {
  type: 'generic-geojson'
  dataUrl: string
  refreshIntervalSec?: number
}

export type RuntimeLayerConfig = {
  runtimeVisible: boolean
  opacity?: number
  minZoom?: number
  dynamicSource?: RuntimeDynamicSource
}

export type RuntimeConfig = {
  version: string
  engine: MapEngine
  initialView: {
    center: { lat: number; lon: number }
    zoom: number
    span?: number
  }
  maxBounds?: [[number, number], [number, number]]
  layers: Record<CurrentMapLayerId, RuntimeLayerConfig>
  interaction?: {
    disableDefaultPopup?: boolean
    featureSelectEvent?: boolean
  }
}

export const runtimeConfigUrl = currentMapRegionConfig.runtimeConfigUrl

const assertRuntimeConfig = (value: unknown): RuntimeConfig => {
  const data = value as Partial<RuntimeConfig>
  if (!data?.version) throw new Error('runtime-config.version is required')
  if (!data?.engine || (data.engine !== 'svgmap' && data.engine !== 'maplibre')) {
    throw new Error('runtime-config.engine is invalid')
  }
  if (!data?.initialView?.center || typeof data.initialView.zoom !== 'number') {
    throw new Error('runtime-config.initialView is invalid')
  }
  if (
    typeof data.initialView.center.lat !== 'number' ||
    typeof data.initialView.center.lon !== 'number'
  ) {
    throw new Error('runtime-config.initialView.center is invalid')
  }
  if (!data.layers || typeof data.layers !== 'object') {
    throw new Error('runtime-config.layers is required')
  }

  const normalizedLayers = { ...(data.layers as Record<string, RuntimeLayerConfig | undefined>) }

  for (const layerId of currentMapLayerIds) {
    const rawLayer = normalizedLayers[layerId]
    const layer =
      rawLayer && typeof rawLayer === 'object'
        ? rawLayer
        : {
            runtimeVisible: false,
          }

    if (typeof layer.runtimeVisible !== 'boolean') {
      layer.runtimeVisible = false
    }
    if (layer.opacity != null && typeof layer.opacity !== 'number') {
      throw new Error(`runtime-config.layers.${layerId}.opacity must be a number`)
    }
    if (layer.minZoom != null && typeof layer.minZoom !== 'number') {
      throw new Error(`runtime-config.layers.${layerId}.minZoom must be a number`)
    }
    if (layer.dynamicSource) {
      const dynamicType = layer.dynamicSource.type
      if (!dynamicType) {
        throw new Error(`runtime-config.layers.${layerId}.dynamicSource.type is required`)
      }
      if (dynamicType !== 'generic-geojson') {
        throw new Error(`runtime-config.layers.${layerId}.dynamicSource.type is invalid`)
      }
      if (!layer.dynamicSource.dataUrl) {
        throw new Error(`runtime-config.layers.${layerId}.dynamicSource.dataUrl is required`)
      }
      if (
        layer.dynamicSource.refreshIntervalSec != null &&
        typeof layer.dynamicSource.refreshIntervalSec !== 'number'
      ) {
        throw new Error(
          `runtime-config.layers.${layerId}.dynamicSource.refreshIntervalSec must be a number`
        )
      }
    }

    normalizedLayers[layerId] = layer
  }

  return {
    ...data,
    layers: normalizedLayers as Record<CurrentMapLayerId, RuntimeLayerConfig>,
  } as RuntimeConfig
}

export function getRuntimeLayerMinZoom(
  runtimeConfig: RuntimeConfig | null | undefined,
  layerId: CurrentMapLayerId,
  fallback = 0
) {
  const minZoom = runtimeConfig?.layers?.[layerId]?.minZoom
  return typeof minZoom === 'number' && Number.isFinite(minZoom) ? minZoom : fallback
}

export async function loadRuntimeConfig(regionConfig?: CurrentMapRegionConfig): Promise<RuntimeConfig> {
  const resolvedRegionConfig = regionConfig ?? await loadCurrentMapRegionConfig()
  const response = await fetch(resolvedRegionConfig.runtimeConfigUrl, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`runtime-config fetch failed: HTTP ${response.status}`)
  }
  const json = await response.json()
  return assertRuntimeConfig(json)
}
