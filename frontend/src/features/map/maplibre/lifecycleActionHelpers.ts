export function applyMapLoadReadyAction(params: {
  registerPMTilesProtocol: () => void
  setMapLoaded: (loaded: boolean) => void
  notifyRuntimeReady: () => void
}): void {
  const { registerPMTilesProtocol, setMapLoaded, notifyRuntimeReady } = params
  registerPMTilesProtocol()
  console.log('[Map] Map loaded, overzoom enabled')
  setMapLoaded(true)
  notifyRuntimeReady()
}

export function applyGeolocatePositionAction(params: {
  latitude: number
  longitude: number
  setGpsPosition: (position: [number, number]) => void
  setViewport: (viewport: { longitude: number; latitude: number; zoom: number }) => void
}): void {
  const { latitude, longitude, setGpsPosition, setViewport } = params
  console.log('[Geolocation] Button clicked - moving to:', { latitude, longitude })
  setGpsPosition([latitude, longitude])
  setViewport({
    longitude,
    latitude,
    zoom: 15,
  })
}

export function applyMapMoveViewportAction(params: {
  viewState: any
  hasWelfareSpider: boolean
  clearWelfareSpider: () => void
  setViewport: (viewState: any) => void
}): void {
  const { viewState, hasWelfareSpider, clearWelfareSpider, setViewport } = params
  if (hasWelfareSpider) {
    clearWelfareSpider()
  }
  setViewport((prev: any) => {
    const sameLongitude = Math.abs(Number(prev?.longitude) - Number(viewState?.longitude)) < 1e-6
    const sameLatitude = Math.abs(Number(prev?.latitude) - Number(viewState?.latitude)) < 1e-6
    const sameZoom = Math.abs(Number(prev?.zoom) - Number(viewState?.zoom)) < 1e-6
    return sameLongitude && sameLatitude && sameZoom ? prev : viewState
  })
}
