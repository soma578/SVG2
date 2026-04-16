export const FALLBACK_MAP_CENTER = {
  lat: 34.66,
  lon: 133.93,
} as const

export const FALLBACK_MAP_ZOOM = 11
export const FALLBACK_MAP_SPAN = 0.12

export const FALLBACK_MAP_VIEW = {
  center: FALLBACK_MAP_CENTER,
  zoom: FALLBACK_MAP_ZOOM,
  span: FALLBACK_MAP_SPAN,
  latSpan: FALLBACK_MAP_SPAN,
  lonSpan: FALLBACK_MAP_SPAN,
} as const
