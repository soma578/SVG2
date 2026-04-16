import type { CurrentMapViewState } from '../features/map/engine/runtimeProtocol'
import { FALLBACK_MAP_VIEW } from '../features/map/engine/defaultMapView'
import { sanitizeCurrentMapLayerOpacity } from '../features/map/engine/layerOpacity'
import { currentMapDefaultLayers, currentMapLayerIds, type CurrentMapLayerId } from './currentMapLayers'

/**
 * URL状態管理
 * 新仕様: CurrentMapViewState 準拠
 */
export interface MapState extends CurrentMapViewState {}

const REGION_QUERY_PARAM = 'region'

type LegacyMapState = {
  lat?: number
  lon?: number
  zoom?: number
  latSpan?: number
  lonSpan?: number
  layers?: Record<string, boolean>
}

const defaultVisibleLayerIds: CurrentMapLayerId[] = currentMapLayerIds.filter((layerId) => currentMapDefaultLayers[layerId])

function toBase64UrlUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64UrlUtf8(value: string): string {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function toVisibleLayerIds(layers: Record<string, boolean> | undefined): CurrentMapLayerId[] {
  if (!layers) return [...defaultVisibleLayerIds]
  return currentMapLayerIds.filter((layerId) => Boolean(layers[layerId]))
}

function normalizeVisibleLayerIds(visibleLayerIds: unknown): CurrentMapLayerId[] {
  if (!Array.isArray(visibleLayerIds)) return [...defaultVisibleLayerIds]
  const normalized = new Set<string>()
  for (const layerId of visibleLayerIds) {
    if (typeof layerId === 'string' && currentMapLayerIds.includes(layerId as typeof currentMapLayerIds[number])) {
      normalized.add(layerId)
    }
  }
  return currentMapLayerIds.filter((layerId) => normalized.has(layerId))
}

function normalizeDecodedState(raw: unknown): MapState | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Partial<MapState> & LegacyMapState

  if (
    candidate.center &&
    typeof candidate.center.lat === 'number' &&
    typeof candidate.center.lon === 'number' &&
    typeof candidate.zoom === 'number' &&
    Array.isArray(candidate.visibleLayerIds)
  ) {
    return {
      engine: candidate.engine === 'maplibre' ? 'maplibre' : 'svgmap',
      center: candidate.center,
      zoom: candidate.zoom,
      span: typeof candidate.span === 'number' ? candidate.span : undefined,
      latSpan: typeof candidate.latSpan === 'number'
        ? candidate.latSpan
        : typeof candidate.span === 'number'
          ? candidate.span
          : undefined,
      lonSpan: typeof candidate.lonSpan === 'number'
        ? candidate.lonSpan
        : typeof candidate.span === 'number'
          ? candidate.span
          : undefined,
      visibleLayerIds: normalizeVisibleLayerIds(candidate.visibleLayerIds),
      layerOpacity: sanitizeCurrentMapLayerOpacity(candidate.layerOpacity),
      selectedFeatureId: candidate.selectedFeatureId,
    }
  }

  if (
    typeof candidate.lat === 'number' &&
    typeof candidate.lon === 'number' &&
    typeof candidate.zoom === 'number'
  ) {
    const span = typeof candidate.latSpan === 'number'
      ? candidate.latSpan
      : typeof candidate.lonSpan === 'number'
        ? candidate.lonSpan
        : undefined
    const legacyLayerOpacity = candidate.layerOpacity && typeof candidate.layerOpacity === 'object'
      ? candidate.layerOpacity
      : {}
    return {
      engine: 'svgmap',
      center: { lat: candidate.lat, lon: candidate.lon },
      zoom: candidate.zoom,
      span,
      latSpan: typeof candidate.latSpan === 'number' ? candidate.latSpan : span,
      lonSpan: typeof candidate.lonSpan === 'number' ? candidate.lonSpan : span,
      visibleLayerIds: toVisibleLayerIds(candidate.layers),
      layerOpacity: sanitizeCurrentMapLayerOpacity(legacyLayerOpacity),
    }
  }

  return null
}

/**
 * MapStateをURL-safeな文字列にエンコード
 */
export function encodeMapState(state: MapState): string {
  try {
    const json = JSON.stringify(state)
    return toBase64UrlUtf8(json)
  } catch (error) {
    console.error('[URLState] Failed to encode:', error)
    return ''
  }
}

/**
 * URL文字列からMapStateをデコード
 */
export function decodeMapState(encoded: string): MapState | null {
  try {
    const json = fromBase64UrlUtf8(encoded)
    const parsed = JSON.parse(json) as unknown
    return normalizeDecodedState(parsed)
  } catch (error) {
    console.error('[URLState] Failed to decode:', error)
    return null
  }
}

/**
 * 現在のMapStateをURLに保存
 */
export function saveStateToURL(state: MapState): void {
  saveStateToURLWithRegion(state)
}

export function getCurrentMapRegionIdFromURL(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const regionId = url.searchParams.get(REGION_QUERY_PARAM)?.trim()
  return regionId || null
}

export function saveStateToURLWithRegion(state: MapState, regionId?: string | null): void {
  const encoded = encodeMapState(state)
  if (!encoded) return

  const url = new URL(window.location.href)
  url.searchParams.set('s', encoded)
  if (regionId?.trim()) {
    url.searchParams.set(REGION_QUERY_PARAM, regionId.trim())
  } else {
    url.searchParams.delete(REGION_QUERY_PARAM)
  }
  window.history.pushState({}, '', url.toString())
}

/**
 * URLから MapStateを読み込み
 */
export function loadStateFromURL(): MapState | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const encoded = url.searchParams.get('s')
  if (!encoded) return null
  return decodeMapState(encoded)
}

/**
 * 共有用のURLを生成
 */
export function generateShareURL(state: MapState): string {
  return generateShareURLWithRegion(state)
}

export function generateShareURLWithRegion(state: MapState, regionId?: string | null): string {
  if (typeof window === 'undefined') return ''
  const encoded = encodeMapState(state)
  if (!encoded) return window.location.origin

  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('s', encoded)
  if (regionId?.trim()) {
    url.searchParams.set(REGION_QUERY_PARAM, regionId.trim())
  }
  return url.toString()
}

/**
 * デフォルトのMapState
 */
export const defaultMapState: MapState = {
  engine: 'svgmap',
  center: { lat: FALLBACK_MAP_VIEW.center.lat, lon: FALLBACK_MAP_VIEW.center.lon },
  zoom: FALLBACK_MAP_VIEW.zoom,
  span: FALLBACK_MAP_VIEW.span,
  latSpan: FALLBACK_MAP_VIEW.latSpan,
  lonSpan: FALLBACK_MAP_VIEW.lonSpan,
  visibleLayerIds: [...defaultVisibleLayerIds],
  layerOpacity: sanitizeCurrentMapLayerOpacity(),
}
