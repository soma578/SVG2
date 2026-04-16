import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'

export function buildSearchResultSelection(result: Record<string, any>): {
  feature: CurrentMapFeatureProperties | null
} {
  const normalizedLayerId: CurrentMapFeatureProperties['layerId'] =
    result.layerId === 'baseArea' ||
    result.layerId === 'evacuation' ||
    result.layerId === 'teamActivity'
      ? result.layerId
      : result.type === 'district'
        ? 'baseArea'
        : result.type === 'shelter'
          ? 'evacuation'
          : 'teamActivity'
  const normalizedCategory: CurrentMapFeatureProperties['category'] =
    result.category === 'baseArea' ||
    result.category === 'evacuation' ||
    result.category === 'teamActivity'
      ? result.category
      : normalizedLayerId

  if (!result.selectedFeatureId) {
    return { feature: null }
  }

  const baseFeature = {
    id: String(result.selectedFeatureId),
    title: String(result.name || ''),
    subtitle: result.subtitle ? String(result.subtitle) : undefined,
    summary: result.summary ? String(result.summary) : undefined,
    address: result.address ? String(result.address) : undefined,
    lat: Number(result.lat),
    lon: Number(result.lon),
    url: result.url ? String(result.url) : undefined,
    source: result.source ? String(result.source) : undefined,
    status: result.status ? String(result.status) : undefined,
    facilityType: result.facilityType ? String(result.facilityType) : undefined,
    capacity: typeof result.capacity === 'number' ? result.capacity : undefined,
    barrierFree: typeof result.barrierFree === 'boolean' ? result.barrierFree : undefined,
    pets: typeof result.pets === 'boolean' ? result.pets : undefined,
    note: result.note ? String(result.note) : undefined,
    teamId: result.teamId ? String(result.teamId) : undefined,
    teamName: result.teamName ? String(result.teamName) : undefined,
    activityType: result.activityType ? String(result.activityType) : undefined,
    operator: result.operator ? String(result.operator) : undefined,
    area: result.area ? String(result.area) : undefined,
    updatedAt: result.updatedAt ? String(result.updatedAt) : undefined,
  }

  if (normalizedLayerId === 'baseArea') {
    return {
      feature: {
        ...baseFeature,
        layerId: 'baseArea',
        category: 'baseArea',
      },
    }
  }

  if (normalizedLayerId === 'evacuation') {
    return {
      feature: {
        ...baseFeature,
        layerId: 'evacuation',
        kind: 'poi',
        category: 'evacuation',
      },
    }
  }

  return {
    feature: {
      ...baseFeature,
      layerId: 'teamActivity',
      kind: 'poi',
      category: 'teamActivity',
    },
  }
}
