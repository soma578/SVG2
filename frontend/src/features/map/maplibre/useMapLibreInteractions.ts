import { useCallback, type MutableRefObject } from 'react'
import { applyMapCursorForFeatures } from '@/features/map/maplibre/mapInteractionHelpers'
import { resolveMapLibreClickOutcome } from '@/features/map/maplibre/clickOutcomeHelpers'
import { applyMapLibreClickOutcome } from '@/features/map/maplibre/clickOutcomeActionHelpers'
import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'
import type { MapLibrePopupInfo } from '@/features/map/maplibre/featurePopupBuilders'

export function useMapLibreInteractions(params: {
  mapRef: MutableRefObject<any>
  notifySelectedFeatureChange: (feature: CurrentMapFeatureProperties | null) => void
  setPopupInfo: (popup: MapLibrePopupInfo | null) => void
}) {
  const { mapRef, notifySelectedFeatureChange, setPopupInfo } = params

  const handleMapClick = useCallback((event: any) => {
    const map = mapRef.current?.getMap()
    const outcome = resolveMapLibreClickOutcome({
      event,
      map,
    })

    applyMapLibreClickOutcome({
      outcome,
      map,
      setSelectedFeature: notifySelectedFeatureChange,
      setPopupInfo,
    })
  }, [mapRef, notifySelectedFeatureChange, setPopupInfo])

  const handleMouseMove = useCallback((event: any) => {
    const map = mapRef.current?.getMap()
    if (!map) return

    applyMapCursorForFeatures({
      map,
      features: event?.features,
    })
  }, [mapRef])

  return {
    handleMapClick,
    handleMouseMove,
  }
}
