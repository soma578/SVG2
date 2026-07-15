export const MAP_MESSAGES = {
  runtimeReady: 'runtime:ready',
  runtimeDataStatus: 'runtime:dataStatus',
  runtimeFeatureDetail: 'runtime:featureDetail',
  runtimeFeatureSelect: 'runtime:featureSelect',
  runtimePoiLayerRendered: 'runtime:poiLayerRendered',
  runtimeLayerReady: 'runtime:layerReady',

  mapSetViewport: 'map:setViewport',
  mapZoom: 'map:zoom',
  mapResetView: 'map:resetView',
  mapSetCurrentLocation: 'map:setCurrentLocation',
  mapFocusLocation: 'map:focusLocation',
  mapSetLayerVisible: 'map:setLayerVisible',
  mapImportLayers: 'map:importLayers',
  mapRemoveLayer: 'map:removeLayer',
  runtimeSetLayerVisibility: 'runtime:setLayerVisibility',
  mapLayerVisibilityChanged: 'map:layerVisibilityChanged',
  mapSetInteractionMode: 'map:setInteractionMode',
  mapInteractionModeChanged: 'map:interactionModeChanged',
  mapSetDataUrl: 'map:setDataUrl',
  mapSetLayerConfig: 'map:setLayerConfig',
  mapSetMunicipalityFilter: 'map:setMunicipalityFilter',
  mapShowEvacuationFeature: 'map:showEvacuationFeature',
  mapShowTeamActivityFeature: 'map:showTeamActivityFeature',

  teamActivityLayerReady: 'teamActivityLayer:ready',

  hazardLayerReady: 'hazardLayer:ready',
  hazardLayerDataReady: 'hazardLayer:dataReady',
} as const

export type MapMessageType = typeof MAP_MESSAGES[keyof typeof MAP_MESSAGES]

export type GeoViewportMessagePayload = {
  lat: number
  lon: number
  latSpan: number
  lonSpan: number
}

export type RuntimeFeatureMessagePayload = Record<string, unknown>

export type RuntimeDataStatusPayload = {
  key: string
  label?: string
  source?: 'network' | 'cache' | 'fallback'
  url?: string
  online?: boolean
  updatedAt?: string
  at?: string
  message?: string
}

export type MapMessage =
  | { type: typeof MAP_MESSAGES.runtimeReady; payload?: Record<string, unknown> }
  | { type: typeof MAP_MESSAGES.runtimeDataStatus; payload: RuntimeDataStatusPayload }
  | { type: typeof MAP_MESSAGES.runtimePoiLayerRendered; payload?: { layerId?: string; featureCount?: number; signature?: string; renderedAt?: number } }
  | { type: typeof MAP_MESSAGES.runtimeLayerReady; payload?: { layerId?: string; acceptsRuntimeDataUrl?: boolean }; layerId?: string }
  | { type: typeof MAP_MESSAGES.runtimeFeatureSelect; payload?: { feature?: RuntimeFeatureMessagePayload }; feature?: RuntimeFeatureMessagePayload }
  | {
      type: typeof MAP_MESSAGES.runtimeFeatureDetail
      payload: { layerId?: string; detail: Record<string, unknown> }
    }
  | { type: typeof MAP_MESSAGES.mapSetViewport; viewport: GeoViewportMessagePayload }
  | { type: typeof MAP_MESSAGES.mapZoom; factor: number }
  | { type: typeof MAP_MESSAGES.mapResetView }
  | { type: typeof MAP_MESSAGES.mapSetCurrentLocation; location: { lat: number; lon: number } }
  | { type: typeof MAP_MESSAGES.mapFocusLocation; location: GeoViewportMessagePayload }
  | { type: typeof MAP_MESSAGES.mapSetLayerVisible; layerKey: string; visible: boolean }
  | { type: typeof MAP_MESSAGES.mapImportLayers; layers: Array<{ attrs: Record<string, string> }> }
  | { type: typeof MAP_MESSAGES.mapRemoveLayer; layerId: string }
  | { type: typeof MAP_MESSAGES.runtimeSetLayerVisibility; layerKey: string; visible: boolean }
  | { type: typeof MAP_MESSAGES.mapLayerVisibilityChanged; layerKey: string; visible: boolean }
  | { type: typeof MAP_MESSAGES.mapSetInteractionMode; interactionMode: string }
  | { type: typeof MAP_MESSAGES.mapInteractionModeChanged; interactionMode: string }
  | { type: typeof MAP_MESSAGES.mapSetDataUrl; layerId: string; url: string }
  | { type: typeof MAP_MESSAGES.mapSetLayerConfig; layerId?: string; baseAreaLayerUrl?: string; districtSvgUrlTemplate?: string }
  | { type: typeof MAP_MESSAGES.mapSetMunicipalityFilter; municipalityCodes: string[] }
  | { type: typeof MAP_MESSAGES.mapShowEvacuationFeature; feature: RuntimeFeatureMessagePayload }
  | { type: typeof MAP_MESSAGES.mapShowTeamActivityFeature; feature: RuntimeFeatureMessagePayload }
  | { type: typeof MAP_MESSAGES.teamActivityLayerReady }
