import { currentMapLayerDefinitions, type CurrentMapLayerId } from './layerDefinitions'

export const currentMapOpacityLayerIds = Object.entries(currentMapLayerDefinitions)
  .filter(([, definition]) => definition.opacitySupported)
  .map(([layerId]) => layerId as CurrentMapLayerId)

export const currentMapDefaultLayerOpacity: Partial<Record<CurrentMapLayerId, number>> = currentMapOpacityLayerIds.reduce<Partial<Record<CurrentMapLayerId, number>>>(
  (acc, layerId) => {
    acc[layerId] = 0.6
    return acc
  },
  {}
)

export function sanitizeCurrentMapLayerOpacity(
  input?: Partial<Record<string, number | undefined>> | null
): Partial<Record<CurrentMapLayerId, number>> {
  const next = { ...currentMapDefaultLayerOpacity }
  if (!input || typeof input !== 'object') return next

  for (const layerId of currentMapOpacityLayerIds) {
    const value = input[layerId]
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[layerId] = Math.max(0, Math.min(1, value))
    }
  }

  return next
}

export function mergeCurrentMapLayerOpacity(
  base?: Partial<Record<string, number | undefined>> | null,
  override?: Partial<Record<string, number | undefined>> | null
): Partial<Record<CurrentMapLayerId, number>> {
  return sanitizeCurrentMapLayerOpacity({
    ...sanitizeCurrentMapLayerOpacity(base),
    ...sanitizeCurrentMapLayerOpacity(override),
  })
}
