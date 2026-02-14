/**
 * リスク分析ユーティリティ
 * 仕様書5に基づいた実装
 */

// 地球の半径（メートル）
const EARTH_RADIUS = 6371000

/**
 * Haversine公式を使用した2点間の距離計算（メートル）
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS * c
}

/**
 * 徒歩時間の概算計算（分）
 * 仕様書4.3に基づき、80m/minで計算
 */
export function calculateWalkingTime(distanceMeters: number): number {
  const walkingSpeedMeterPerMin = 80
  return Math.ceil(distanceMeters / walkingSpeedMeterPerMin)
}

/**
 * BBoxの計算
 */
export interface BBox {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export function calculateBBox(geometry: any): BBox | null {
  if (!geometry || !geometry.coordinates) return null

  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity

  const processCoordinates = (coords: any) => {
    if (typeof coords[0] === 'number') {
      // Point
      const [lon, lat] = coords
      minLon = Math.min(minLon, lon)
      minLat = Math.min(minLat, lat)
      maxLon = Math.max(maxLon, lon)
      maxLat = Math.max(maxLat, lat)
    } else if (Array.isArray(coords[0])) {
      coords.forEach(processCoordinates)
    }
  }

  processCoordinates(geometry.coordinates)

  if (!isFinite(minLon)) return null

  return { minLon, minLat, maxLon, maxLat }
}

/**
 * 点がBBox内にあるかチェック
 */
export function isPointInBBox(lon: number, lat: number, bbox: BBox): boolean {
  return (
    lon >= bbox.minLon &&
    lon <= bbox.maxLon &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  )
}

/**
 * Ray casting algorithmによるpoint-in-polygon判定
 */
export function isPointInPolygon(
  lon: number,
  lat: number,
  polygon: number[][]
): boolean {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)

    if (intersect) inside = !inside
  }

  return inside
}

/**
 * GeoJSON geometryのpoint-in-polygon判定
 */
export function isPointInGeometry(
  lon: number,
  lat: number,
  geometry: any
): boolean {
  if (!geometry || !geometry.type || !geometry.coordinates) return false

  if (geometry.type === 'Polygon') {
    // 外側のリングのみチェック（穴は考慮しない簡易版）
    return isPointInPolygon(lon, lat, geometry.coordinates[0])
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon: number[][][]) =>
      isPointInPolygon(lon, lat, polygon[0])
    )
  }

  return false
}

/**
 * グリッドセルIDの計算（z=12相当）
 * 仕様書5.2に基づく
 */
export function getGridCellId(lon: number, lat: number, zoom: number = 12): string {
  const gridSize = Math.pow(2, zoom)
  const x = Math.floor((lon + 180) / 360 * gridSize)
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * gridSize)
  return `${zoom}/${x}/${y}`
}

/**
 * グリッドインデックスの構築
 */
export interface GridIndex {
  [cellId: string]: number[] // feature indices
}

export function buildGridIndex(features: any[], zoom: number = 12): GridIndex {
  const index: GridIndex = {}

  features.forEach((feature, idx) => {
    const bbox = calculateBBox(feature.geometry)
    if (!bbox) return

    // BBoxをカバーするグリッドセルを列挙
    const cellIds = new Set<string>()
    const gridSize = Math.pow(2, zoom)

    // 簡易版: BBoxの4隅のセルIDのみ
    const corners = [
      [bbox.minLon, bbox.minLat],
      [bbox.minLon, bbox.maxLat],
      [bbox.maxLon, bbox.minLat],
      [bbox.maxLon, bbox.maxLat],
    ]

    corners.forEach(([lon, lat]) => {
      const cellId = getGridCellId(lon, lat, zoom)
      cellIds.add(cellId)
    })

    cellIds.forEach(cellId => {
      if (!index[cellId]) index[cellId] = []
      index[cellId].push(idx)
    })
  })

  return index
}

/**
 * 最適化されたpoint-in-polygon検索
 * 仕様書5.2に基づき、bbox + グリッドで候補絞り込み
 */
export function findContainingFeature(
  lon: number,
  lat: number,
  features: any[],
  gridIndex?: GridIndex
): any | null {
  let candidates: number[]

  if (gridIndex) {
    // グリッドインデックスで候補絞り込み
    const cellId = getGridCellId(lon, lat)
    candidates = gridIndex[cellId] || []
  } else {
    // インデックスなしの場合は全件
    candidates = features.map((_, idx) => idx)
  }

  // BBoxフィルタ + PIP判定
  for (const idx of candidates) {
    const feature = features[idx]
    const bbox = calculateBBox(feature.geometry)

    // BBoxチェック
    if (bbox && !isPointInBBox(lon, lat, bbox)) continue

    // PIP判定
    if (isPointInGeometry(lon, lat, feature.geometry)) {
      return feature
    }
  }

  return null
}

/**
 * 近傍施設検索（避難所など）
 * 仕様書5.3に基づく
 */
export interface NearbyFacility {
  feature: any
  distance: number
  walkingTime: number
}

export function findNearbyFacilities(
  lon: number,
  lat: number,
  facilities: any[],
  maxResults: number = 3,
  maxDistance: number = 10000 // 10km
): NearbyFacility[] {
  const results: NearbyFacility[] = []

  facilities.forEach(facility => {
    const coords = facility.geometry?.coordinates
    if (!coords || coords.length < 2) return

    const [facLon, facLat] = coords
    const distance = calculateDistance(lat, lon, facLat, facLon)

    if (distance <= maxDistance) {
      results.push({
        feature: facility,
        distance,
        walkingTime: calculateWalkingTime(distance)
      })
    }
  })

  // 距離でソート
  results.sort((a, b) => a.distance - b.distance)

  return results.slice(0, maxResults)
}
