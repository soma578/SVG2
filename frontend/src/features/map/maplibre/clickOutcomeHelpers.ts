import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'
import { buildPoiSelectionFromClick } from '@/features/map/maplibre/clickSelectionHelpers'
import { resolveMapLibreClickTarget } from '@/features/map/maplibre/clickTargetHelpers'

export type MapLibreClickOutcome =
  | { kind: 'none' }
  | { kind: 'clearSelection' }
  | { kind: 'zoomToCluster'; sourceId: string; clusterId: number; coords: [number, number] }
  | { kind: 'selectFeature'; feature: CurrentMapFeatureProperties }

export function resolveMapLibreClickOutcome(params: {
  event: any
  map: any
}): MapLibreClickOutcome {
  const { event, map } = params
  const features = event?.features
  if (!features || features.length === 0) {
    return { kind: 'clearSelection' }
  }

  const clickTarget = resolveMapLibreClickTarget(features)
  if (!clickTarget) {
    return { kind: 'clearSelection' }
  }

  switch (clickTarget.type) {
    case 'baseArea':
    case 'shelter':
    case 'teamActivity': {
      const selection = buildPoiSelectionFromClick({
        type: clickTarget.type,
        props: clickTarget.props,
        coords: clickTarget.coords,
      })
      return {
        kind: 'selectFeature',
        feature: selection.feature,
      }
    }
    case 'shelterCluster': {
      const clusterId = Number(clickTarget.props.cluster_id)
      if (!Number.isFinite(clusterId)) {
        return { kind: 'none' }
      }
      return {
        kind: 'zoomToCluster',
        sourceId: 'shelters-source',
        clusterId,
        coords: clickTarget.coords,
      }
    }
    case 'outage': {
      return { kind: 'clearSelection' }
    }
  }

  return { kind: 'none' }
}
