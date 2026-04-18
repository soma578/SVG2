const OUTAGE_LAYER_IDS = new Set([
  'outages-district-fill',
  'outages-municipality-fill',
  'outages-district-label',
])

const isPointCoords = (coords: unknown): coords is [number, number] =>
  Array.isArray(coords) &&
  coords.length >= 2 &&
  typeof coords[0] === 'number' &&
  typeof coords[1] === 'number'

const collectLngLatPairs = (value: unknown, pairs: Array<[number, number]>) => {
  if (!Array.isArray(value) || value.length === 0) return
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    const lon = Number(value[0])
    const lat = Number(value[1])
    if (Number.isFinite(lon) && Number.isFinite(lat)) pairs.push([lon, lat])
    return
  }
  value.forEach((item) => collectLngLatPairs(item, pairs))
}

const toPointCoords = (feature: any): [number, number] | null => {
  const coords = feature?.geometry?.coordinates
  return isPointCoords(coords) ? [coords[0], coords[1]] : null
}

const toFeatureCenter = (feature: any): [number, number] | null => {
  const pointCoords = toPointCoords(feature)
  if (pointCoords) return pointCoords

  const pairs: Array<[number, number]> = []
  collectLngLatPairs(feature?.geometry?.coordinates, pairs)
  if (pairs.length === 0) return null

  let minLon = pairs[0][0]
  let maxLon = pairs[0][0]
  let minLat = pairs[0][1]
  let maxLat = pairs[0][1]
  for (const [lon, lat] of pairs) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2]
}

const toProps = (feature: any): Record<string, any> => {
  const props = feature?.properties
  return props && typeof props === 'object' ? props : {}
}

type PoiTargetType = 'baseArea' | 'shelter' | 'teamActivity'

export type MapLibreClickTarget =
  | { type: 'outage'; feature: any }
  | { type: 'shelterCluster'; feature: any; props: Record<string, any>; coords: [number, number] }
  | { type: PoiTargetType; feature: any; props: Record<string, any>; coords: [number, number] }

const pickPointFeature = (features: any[], layerId: string) => {
  const feature = features.find((item: any) => item?.layer?.id === layerId)
  if (!feature) return null
  const coords = toFeatureCenter(feature)
  if (!coords) return null
  return {
    feature,
    props: toProps(feature),
    coords,
  }
}

export function resolveMapLibreClickTarget(features: any[]): MapLibreClickTarget | null {
  const outageFeature = features.find((feature: any) => OUTAGE_LAYER_IDS.has(feature?.layer?.id))
  if (outageFeature) {
    return { type: 'outage', feature: outageFeature }
  }

  const shelterCluster =
    pickPointFeature(features, 'shelters-cluster-layer') ||
    pickPointFeature(features, 'shelters-cluster-count-layer')
  if (shelterCluster) return { type: 'shelterCluster', ...shelterCluster }

  const shelter = pickPointFeature(features, 'shelters-layer')
  if (shelter) return { type: 'shelter', ...shelter }

  const teamActivity = pickPointFeature(features, 'team-activity-layer')
  if (teamActivity) return { type: 'teamActivity', ...teamActivity }

  const baseArea =
    pickPointFeature(features, 'base-area-label') ||
    pickPointFeature(features, 'base-area-fill')
  if (baseArea) return { type: 'baseArea', ...baseArea }

  const district = pickPointFeature(features, 'districts-selection-fill')
  if (district) return { type: 'baseArea', ...district }

  return null
}
