import type { CurrentMapFeatureProperties, MapFeatureProperties } from './featureTypes'
import type { CurrentMapLayerId, MapEngine } from './layerDefinitions'

export type MapViewState = {
  engine: MapEngine
  center: { lat: number; lon: number }
  zoom: number
  span?: number
  latSpan?: number
  lonSpan?: number
  visibleLayerIds: CurrentMapLayerId[]
  layerOpacity?: Partial<Record<CurrentMapLayerId, number>>
  selectedFeatureId?: string
}

export type CurrentMapViewState = MapViewState

export type RuntimeCommand =
  | { type: 'runtime:setView'; payload: MapViewState }
  | { type: 'runtime:setLayers'; payload: CurrentMapLayerId[] }
  | { type: 'runtime:setOpacity'; payload: Partial<Record<CurrentMapLayerId, number>> }
  | { type: 'runtime:setBaseAreaLayer'; payload: { href: string } }
  | { type: 'runtime:setEvacuationLayer'; payload: { href: string } }
  | { type: 'runtime:zoomIn' }
  | { type: 'runtime:zoomOut' }
  | { type: 'runtime:locate' }
  | { type: 'runtime:showLocation'; payload: { lat: number; lon: number; accuracy?: number } }
  | { type: 'runtime:statusRequest' }

export type CurrentMapRuntimeCommand =
  | { type: 'runtime:setView'; payload: CurrentMapViewState }
  | { type: 'runtime:setLayers'; payload: CurrentMapLayerId[] }
  | { type: 'runtime:setOpacity'; payload: Partial<Record<CurrentMapLayerId, number>> }
  | { type: 'runtime:setBaseAreaLayer'; payload: { href: string } }
  | { type: 'runtime:setEvacuationLayer'; payload: { href: string } }
  | { type: 'runtime:zoomIn' }
  | { type: 'runtime:zoomOut' }
  | { type: 'runtime:locate' }
  | { type: 'runtime:showLocation'; payload: { lat: number; lon: number; accuracy?: number } }
  | { type: 'runtime:statusRequest' }

export type RuntimeCommandEnvelope = {
  id: number
  command: RuntimeCommand
}

export type MapLibreRuntimeCommandMessage = {
  type: 'maplibre-runtime:command'
  bridgeId: string
  envelope: RuntimeCommandEnvelope
}

export type CurrentMapRuntimeCommandEnvelope = {
  id: number
  command: CurrentMapRuntimeCommand
}

export type CurrentMapMapLibreRuntimeCommandMessage = {
  type: 'maplibre-runtime:command'
  bridgeId: string
  envelope: CurrentMapRuntimeCommandEnvelope
}

export type MapLibreRuntimeEventMessage = {
  type: 'maplibre-runtime:event'
  bridgeId: string
  event: RuntimeEvent
}

export type RuntimeEvent =
  | { type: 'runtime:ready' }
  | { type: 'runtime:error'; payload: { message: string } }
  | { type: 'runtime:viewChange'; payload: MapViewState }
  | {
      type: 'runtime:featureSelect'
      payload: {
        engine: MapEngine
        feature: MapFeatureProperties
      }
    }

export type CurrentMapRuntimeEvent =
  | { type: 'runtime:ready' }
  | { type: 'runtime:error'; payload: { message: string } }
  | { type: 'runtime:viewChange'; payload: CurrentMapViewState }
  | {
      type: 'runtime:featureSelect'
      payload: {
        engine: MapEngine
        feature: CurrentMapFeatureProperties
      }
    }

export type CurrentMapMapLibreRuntimeEventMessage = {
  type: 'maplibre-runtime:event'
  bridgeId: string
  event: CurrentMapRuntimeEvent
}
