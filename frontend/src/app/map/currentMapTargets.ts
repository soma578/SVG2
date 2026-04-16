export type CurrentMapViewportTarget = {
  lat: number
  lon: number
  zoom: number
  latSpan?: number
  lonSpan?: number
  token: number
}

export function createCurrentMapViewportTarget(params: {
  lat: number
  lon: number
  zoom: number
  latSpan?: number
  lonSpan?: number
  token?: number
}): CurrentMapViewportTarget {
  const { lat, lon, zoom, latSpan, lonSpan, token } = params
  return {
    lat,
    lon,
    zoom,
    latSpan,
    lonSpan,
    token: token ?? Date.now(),
  }
}
