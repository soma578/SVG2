import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'
import type { MapLibrePopupInfo } from '@/features/map/maplibre/featurePopupBuilders'
import type { MapLibreClickOutcome } from '@/features/map/maplibre/clickOutcomeHelpers'

export function applyMapLibreClickOutcome(params: {
  outcome: MapLibreClickOutcome
  map: any
  setSelectedFeature: (feature: CurrentMapFeatureProperties | null) => void
  setPopupInfo: (popup: MapLibrePopupInfo | null) => void
}): void {
  const { outcome, map, setSelectedFeature, setPopupInfo } = params

  switch (outcome.kind) {
    case 'clearSelection': {
      setPopupInfo(null)
      setSelectedFeature(null)
      return
    }
    case 'selectFeature': {
      setSelectedFeature(outcome.feature)
      setPopupInfo(null)
      return
    }
    case 'zoomToCluster': {
      setPopupInfo(null)
      setSelectedFeature(null)
      const source = map?.getSource?.(outcome.sourceId)
      if (!source?.getClusterExpansionZoom) return
      source.getClusterExpansionZoom(outcome.clusterId, (error: unknown, zoom: number) => {
        if (error) return
        map?.easeTo?.({
          center: outcome.coords,
          zoom,
          duration: 400,
        })
      })
      return
    }
    case 'none': {
      return
    }
    default: {
      return
    }
  }
}
