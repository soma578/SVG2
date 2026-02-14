/**
 * URL状態管理
 * 仕様書7に基づいた実装
 */

export interface MapState {
  lat: number
  lon: number
  zoom: number
  layers: Record<string, boolean>
  hazardOpacity?: number
  boundaryOpacity?: number
  scenario?: 'max' | 'plan'
}

/**
 * MapStateをURL-safeな文字列にエンコード
 */
export function encodeMapState(state: MapState): string {
  try {
    const json = JSON.stringify(state)
    // Base64エンコード（URL-safe）
    return btoa(json)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
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
    // URL-safe Base64を通常のBase64に戻す
    const base64 = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    // パディングを追加
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)

    const json = atob(padded)
    return JSON.parse(json) as MapState
  } catch (error) {
    console.error('[URLState] Failed to decode:', error)
    return null
  }
}

/**
 * 現在のMapStateをURLに保存
 */
export function saveStateToURL(state: MapState): void {
  const encoded = encodeMapState(state)
  if (!encoded) return

  const url = new URL(window.location.href)
  url.searchParams.set('s', encoded)

  // historyに追加（戻るボタンで戻れるように）
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
  const encoded = encodeMapState(state)
  if (!encoded) return window.location.origin

  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('s', encoded)

  return url.toString()
}

/**
 * デフォルトのMapState
 */
export const defaultMapState: MapState = {
  lat: 34.66,
  lon: 133.93,
  zoom: 11,
  layers: {
    basemap: true,
    spots: true,
    momochari: false,
    slope: false,
    landslide: false,
    realShelters: false,
    rivers: false,
    districts: false,
    outages: false,
  },
  hazardOpacity: 0.6,
  boundaryOpacity: 0.7,
  scenario: 'max',
}
