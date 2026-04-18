export const MAPLIBRE_INTERACTIVE_LAYER_IDS = [
  'base-area-fill',
  'base-area-label',
  'districts-selection-fill',
  'shelters-cluster-layer',
  'shelters-cluster-count-layer',
  'shelters-layer',
  'team-activity-layer',
] as const

export function hasClickableMapFeature(features: any[]): boolean {
  return features.some((feature: any) => {
    const layerId = feature?.layer?.id
    return (
      layerId === 'base-area-fill' ||
      layerId === 'base-area-label' ||
      layerId === 'districts-selection-fill' ||
      layerId === 'shelters-cluster-layer' ||
      layerId === 'shelters-cluster-count-layer' ||
      layerId === 'shelters-layer' ||
      layerId === 'team-activity-layer'
    )
  })
}

export function applyMapCursorForFeatures(params: {
  map: any
  features: any[] | undefined | null
}): void {
  const { map, features } = params
  if (!map?.getCanvas) return

  if (Array.isArray(features) && features.length > 0) {
    map.getCanvas().style.cursor = hasClickableMapFeature(features) ? 'pointer' : ''
    return
  }
  map.getCanvas().style.cursor = ''
}
