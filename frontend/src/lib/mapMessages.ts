export const MAP_MESSAGES = {
  runtimeReady: 'runtime:ready',
  runtimeDataStatus: 'runtime:dataStatus',
  runtimeFeatureDetail: 'runtime:featureDetail',

  mapSetViewport: 'map:setViewport',
  mapZoom: 'map:zoom',
  mapResetView: 'map:resetView',
  mapSetCurrentLocation: 'map:setCurrentLocation',
  mapFocusLocation: 'map:focusLocation',
  mapSetLayerVisible: 'map:setLayerVisible',
  runtimeSetLayerVisibility: 'runtime:setLayerVisibility',
  mapLayerVisibilityChanged: 'map:layerVisibilityChanged',
  mapSetInteractionMode: 'map:setInteractionMode',
  mapInteractionModeChanged: 'map:interactionModeChanged',
  mapSetDataUrl: 'map:setDataUrl',
  mapSetLayerConfig: 'map:setLayerConfig',
  mapSetMunicipalityFilter: 'map:setMunicipalityFilter',
  mapShowEvacuationFeature: 'map:showEvacuationFeature',
  mapShowTeamActivityFeature: 'map:showTeamActivityFeature',

  evacuationLayerReady: 'evacuationLayer:ready',
  evacuationLayerDataReady: 'evacuationLayer:dataReady',
  evacuationLayerVisibilityChanged: 'evacuationLayer:visibilityChanged',

  teamActivityLayerReady: 'teamActivityLayer:ready',
  teamActivityHitTargets: 'teamActivity:hitTargets',

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

export type HitTargetMessagePayload = {
  targets?: unknown[]
  zoom?: number
  source?: string
  emittedAt?: string
}

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
  | { type: typeof MAP_MESSAGES.runtimeSetLayerVisibility; layerKey: string; visible: boolean }
  | { type: typeof MAP_MESSAGES.mapLayerVisibilityChanged; layerKey: string; visible: boolean }
  | { type: typeof MAP_MESSAGES.mapSetInteractionMode; interactionMode: string }
  | { type: typeof MAP_MESSAGES.mapInteractionModeChanged; interactionMode: string }
  | { type: typeof MAP_MESSAGES.mapSetDataUrl; layerId: string; url: string }
  | { type: typeof MAP_MESSAGES.mapSetLayerConfig; layerId?: string; baseAreaLayerUrl?: string; districtSvgUrlTemplate?: string }
  | { type: typeof MAP_MESSAGES.mapSetMunicipalityFilter; municipalityCodes: string[] }
  | { type: typeof MAP_MESSAGES.mapShowEvacuationFeature; feature: RuntimeFeatureMessagePayload }
  | { type: typeof MAP_MESSAGES.mapShowTeamActivityFeature; feature: RuntimeFeatureMessagePayload }
  | { type: typeof MAP_MESSAGES.evacuationLayerReady }
  | { type: typeof MAP_MESSAGES.evacuationLayerDataReady }
  | { type: typeof MAP_MESSAGES.evacuationLayerVisibilityChanged; visible: boolean }
  | { type: typeof MAP_MESSAGES.teamActivityLayerReady }
