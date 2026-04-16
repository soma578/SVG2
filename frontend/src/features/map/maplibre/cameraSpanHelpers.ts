type ViewportSetter = (updater: (prev: any) => any) => void

type MapViewSpan = {
  lat: number
  lon: number
  zoom: number
  span?: number
  latSpan?: number
  lonSpan?: number
}

function resolveSpanBounds(view: MapViewSpan) {
  const latSpan = view.latSpan ?? view.span
  const lonSpan = view.lonSpan ?? view.span ?? latSpan
  if (!latSpan || !lonSpan || latSpan <= 0 || lonSpan <= 0) return null
  return {
    west: view.lon - lonSpan / 2,
    east: view.lon + lonSpan / 2,
    south: view.lat - latSpan / 2,
    north: view.lat + latSpan / 2,
  }
}

export function applyMapLibreViewState(params: {
  map?: any
  view: MapViewSpan
  setViewport: ViewportSetter
}) {
  const { map, view, setViewport } = params
  const bounds = resolveSpanBounds(view)

  if (map && bounds) {
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      {
        duration: 0,
        padding: 0,
        maxZoom: view.zoom,
      }
    )
  } else if (map) {
    map.easeTo({
      center: [view.lon, view.lat],
      zoom: view.zoom,
      duration: 0,
    })
  }

  setViewport((prev: any) => ({
    ...prev,
    longitude: view.lon,
    latitude: view.lat,
    zoom: view.zoom,
  }))
}
