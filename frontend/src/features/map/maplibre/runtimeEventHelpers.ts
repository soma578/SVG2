import type { CurrentMapLayerId } from '@/features/map/engine/layerDefinitions'

type ViewStateLike = {
  latitude?: number
  longitude?: number
  zoom?: number
}

type BoundsLike = {
  getSouthWest?: () => { lat: number; lng: number }
  getNorthEast?: () => { lat: number; lng: number }
}

export type CurrentMapRuntimeViewMeta = {
  visibleLayerIds: CurrentMapLayerId[]
  layerOpacity: Partial<Record<CurrentMapLayerId, number>>
  span?: number
  latSpan?: number
  lonSpan?: number
}

type CurrentMapRuntimeViewNotifier = (
  view: { lat: number; lon: number; zoom: number },
  meta: CurrentMapRuntimeViewMeta
) => void

export function notifyRuntimeViewChangeFromMove(params: {
  viewState: ViewStateLike
  map?: { getBounds?: () => BoundsLike | undefined } | null
  layerOpacity: Partial<Record<CurrentMapLayerId, number>>
  getVisibleLayerIds: () => CurrentMapLayerId[]
  notifyViewChange: CurrentMapRuntimeViewNotifier
}) {
  const { viewState, map, layerOpacity, getVisibleLayerIds, notifyViewChange } = params
  const bounds = map?.getBounds?.()
  const southWest = bounds?.getSouthWest?.()
  const northEast = bounds?.getNorthEast?.()
  const latSpan =
    southWest && northEast ? Math.abs(Number(northEast.lat) - Number(southWest.lat)) : undefined
  const lonSpan =
    southWest && northEast ? Math.abs(Number(northEast.lng) - Number(southWest.lng)) : undefined
  notifyViewChange(
    {
      lat: Number(viewState.latitude),
      lon: Number(viewState.longitude),
      zoom: Number(viewState.zoom),
    },
    {
      latSpan,
      lonSpan,
      span: lonSpan ?? latSpan,
      visibleLayerIds: getVisibleLayerIds(),
      layerOpacity,
    }
  )
}

export function resolveMapLibreRuntimeErrorMessage(event: any): string {
  return event?.error?.message || 'MapLibre runtime error'
}

export function notifyRuntimeErrorFromMapError(params: {
  event: any
  notifyRuntimeError: (message: string) => void
}): void {
  const { event, notifyRuntimeError } = params
  notifyRuntimeError(resolveMapLibreRuntimeErrorMessage(event))
}
