import type { GeoViewport } from './mapTypes'

export type OverviewPath = {
  code: string
  rings: Array<Array<[number, number]>>
}

export const clampViewportSpan = (value: number, min = 0.01, max = 8): number => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export const viewportContains = (viewport: GeoViewport | undefined, lat: number, lon: number): boolean => {
  if (!viewport) return false
  const latHalf = Math.abs(Number(viewport.latSpan) || 0) / 2
  const lonHalf = Math.abs(Number(viewport.lonSpan) || 0) / 2
  return (
    lat >= Number(viewport.lat) - latHalf &&
    lat <= Number(viewport.lat) + latHalf &&
    lon >= Number(viewport.lon) - lonHalf &&
    lon <= Number(viewport.lon) + lonHalf
  )
}

export const viewportScore = (viewport: GeoViewport | undefined, lat: number, lon: number): number => {
  if (!viewport) return Number.POSITIVE_INFINITY
  const dLat = Math.abs(lat - Number(viewport.lat))
  const dLon = Math.abs(lon - Number(viewport.lon))
  const area = Math.max(Number(viewport.latSpan) || 0.1, 0.01) * Math.max(Number(viewport.lonSpan) || 0.1, 0.01)
  return (dLat * 2) + dLon + (area * 0.01)
}

export const parsePathRings = (d: string): Array<Array<[number, number]>> => {
  const subPaths = d.match(/M[^M]+/g) || []
  return subPaths
    .map((subPath) => {
      const points: Array<[number, number]> = []
      for (const [, x, y] of subPath.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)) {
        points.push([Number(x), Number(y)])
      }
      return points
    })
    .filter((points) => points.length >= 3)
}

export const pointInRing = (lon: number, lat: number, ring: Array<[number, number]>): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export const pointInOverviewPath = (lon: number, lat: number, path: OverviewPath): boolean =>
  path.rings.some((ring) => pointInRing(lon, lat, ring))
