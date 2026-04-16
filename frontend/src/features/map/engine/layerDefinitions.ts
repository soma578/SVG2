export type MapEngine = 'svgmap' | 'maplibre'

export type LayerKind = 'basemap' | 'overlay' | 'hazard' | 'poi' | 'dynamic'


export type LayerDefinition = {
  id: string
  label: string
  kind: LayerKind
  interactive: boolean
  defaultVisible: boolean
  opacitySupported: boolean
  engineSupport: MapEngine[]
}

export const currentMapLayerDefinitions: Record<CurrentMapLayerId, LayerDefinition> = {
  baseArea: {
    id: 'baseArea',
    label: 'L1 ベースエリア',
    kind: 'overlay',
    interactive: true,
    defaultVisible: true,
    opacitySupported: false,
    engineSupport: ['svgmap', 'maplibre'],
  },
  basemap: {
    id: 'basemap',
    label: 'ベースマップ',
    kind: 'basemap',
    interactive: false,
    defaultVisible: true,
    opacitySupported: false,
    engineSupport: ['svgmap', 'maplibre'],
  },
  evacuation: {
    id: 'evacuation',
    label: 'L2 避難所',
    kind: 'poi',
    interactive: true,
    defaultVisible: true,
    opacitySupported: false,
    engineSupport: ['svgmap', 'maplibre'],
  },
  teamActivity: {
    id: 'teamActivity',
    label: 'L3 チーム活動',
    kind: 'poi',
    interactive: true,
    defaultVisible: true,
    opacitySupported: false,
    engineSupport: ['svgmap', 'maplibre'],
  },
}

export const currentMapLayerIds = [
  'baseArea',
  'basemap',
  'evacuation',
  'teamActivity',
] as const

export type CurrentMapLayerId = (typeof currentMapLayerIds)[number]

export const currentMapDefaultLayers: Record<CurrentMapLayerId, boolean> = currentMapLayerIds.reduce(
  (acc, layerId) => {
    acc[layerId] = currentMapLayerDefinitions[layerId].defaultVisible
    return acc
  },
  {} as Record<CurrentMapLayerId, boolean>
)

const layerPanelLayerIdsByEngine: Record<MapEngine, CurrentMapLayerId[]> = {
  svgmap: ['baseArea', 'evacuation', 'teamActivity'],
  maplibre: ['baseArea', 'evacuation', 'teamActivity'],
}

export function getLayerPanelLayerIds(engine: MapEngine): CurrentMapLayerId[] {
  return [...layerPanelLayerIdsByEngine[engine]]
}

export function sanitizeCurrentMapLayers(
  layers?: Record<string, boolean>
): Record<CurrentMapLayerId, boolean> {
  return currentMapLayerIds.reduce<Record<CurrentMapLayerId, boolean>>((acc, layerId) => {
    acc[layerId] = layers?.[layerId] ?? currentMapDefaultLayers[layerId]
    return acc
  }, { ...currentMapDefaultLayers })
}

export function toCurrentMapLayerVisibilityMap(
  visibleLayerIds: string[]
): Record<CurrentMapLayerId, boolean> {
  const visible = new Set(visibleLayerIds)
  return currentMapLayerIds.reduce<Record<CurrentMapLayerId, boolean>>((acc, layerId) => {
    acc[layerId] = visible.has(layerId)
    return acc
  }, { ...currentMapDefaultLayers })
}

