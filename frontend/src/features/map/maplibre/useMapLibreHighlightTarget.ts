import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { applyMapLibreViewState } from '@/features/map/maplibre/cameraSpanHelpers'

export type MapLibreHighlightTarget = {
  lat: number
  lon: number
  zoom: number
  latSpan?: number
  lonSpan?: number
  token: number
}

export function useMapLibreHighlightTarget(params: {
  highlightTarget?: MapLibreHighlightTarget
  getMap?: () => any
  setViewport: Dispatch<SetStateAction<any>>
}) {
  const { highlightTarget, getMap, setViewport } = params

  useEffect(() => {
    if (!highlightTarget) return
    console.log('[highlight] applying', highlightTarget.lat, highlightTarget.lon, highlightTarget.zoom)
    applyMapLibreViewState({
      map: getMap?.(),
      view: highlightTarget,
      setViewport,
    })
  }, [getMap, highlightTarget, setViewport])
}
