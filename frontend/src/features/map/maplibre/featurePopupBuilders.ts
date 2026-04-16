import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'
import { buildSearchResultSelection as buildSharedSearchResultSelection } from '@/features/map/ui/searchResultSelection'
import { currentMapRegionConfig } from '@/lib/currentMapRegion'

export type MapLibrePopupInfo = {
  longitude: number
  latitude: number
  name: string
  description?: string
  url?: string
  type?: string
  outageInfo?: {
    cause: string
    households: number
    timestamp: string
    status: string
    recovered_at?: string
  }
}

type SelectionPayload = {
  feature: CurrentMapFeatureProperties
  popup: MapLibrePopupInfo
}

export function buildShelterSelection(
  props: Record<string, any>,
  coords: [number, number]
): SelectionPayload {
  const title = String(props.title || props.name || '避難所')
  const address = props.address ? String(props.address) : undefined
  const facilityType = props.facilityType ? String(props.facilityType) : undefined
  const capacity =
    typeof props.capacity === 'number'
      ? props.capacity
      : undefined
  const status = props.status ? String(props.status) : 'unknown'
  const note = props.note ? String(props.note) : undefined
  return {
    feature: {
      id: String(props.id || `evacuation:${props.title || props.name || 'unknown'}`),
      layerId: 'evacuation',
      kind: 'poi',
      title,
      category: 'evacuation',
      subtitle: facilityType,
      summary: note || facilityType,
      address,
      lat: Number(coords?.[1]),
      lon: Number(coords?.[0]),
      source: String(props.source || currentMapRegionConfig.sheltersSourceLabel),
      status,
      facilityType,
      capacity,
      barrierFree: typeof props.barrierFree === 'boolean' ? props.barrierFree : undefined,
      pets: typeof props.pets === 'boolean' ? props.pets : undefined,
      updatedAt: props.updatedAt ? String(props.updatedAt) : undefined,
      note,
    },
    popup: {
      longitude: coords[0],
      latitude: coords[1],
      name: title,
      description: [facilityType, address, status ? `状態: ${status}` : null].filter(Boolean).join(' / '),
      type: 'shelter',
    },
  }
}

export function buildBaseAreaSelection(
  props: Record<string, any>,
  coords: [number, number]
): SelectionPayload {
  const pref = props.pref ? String(props.pref) : ''
  const city = props.city ? String(props.city) : ''
  const ward = props.ward ? String(props.ward) : ''
  const district = props.district ? String(props.district) : ''
  const title =
    String(props.name || [city, ward, district].filter(Boolean).join(' ') || 'ベースエリア')
  const address = [pref, city, ward, district].filter(Boolean).join('')
  const subtitle = [city, ward].filter(Boolean).join(' ') || undefined

  return {
    feature: {
      id: String(props.key_code ? `district-${props.key_code}` : `baseArea:${title}`),
      layerId: 'baseArea',
      title,
      category: 'baseArea',
      subtitle,
      summary: district ? `地区: ${district}` : undefined,
      description: address || undefined,
      address: address || undefined,
      lat: Number(coords?.[1]),
      lon: Number(coords?.[0]),
      source: currentMapRegionConfig.districtDictionaryUrl,
    },
    popup: {
      longitude: coords[0],
      latitude: coords[1],
      name: title,
      description: address || undefined,
      type: 'baseArea',
    },
  }
}

export function buildTeamActivitySelection(
  props: Record<string, any>,
  coords: [number, number]
): SelectionPayload {
  const title = String(props.title || props.teamName || 'チーム活動')
  const operator = props.operator ? String(props.operator) : undefined
  const area = props.area ? String(props.area) : undefined
  const status = props.status ? String(props.status) : undefined
  const note = props.note ? String(props.note) : undefined
  return {
    feature: {
      id: String(props.id || `team:${title}`),
      layerId: 'teamActivity',
      kind: 'poi',
      title,
      category: 'teamActivity',
      subtitle: operator,
      summary: note || (status ? `状態: ${status}` : undefined),
      description: [status ? `状態: ${status}` : null, area ? `担当: ${area}` : null].filter(Boolean).join(' / ') || undefined,
      address: area,
      lat: Number(coords?.[1]),
      lon: Number(coords?.[0]),
      source: currentMapRegionConfig.teamActivitySourceLabel,
      updatedAt: props.updatedAt ? String(props.updatedAt) : undefined,
      status,
      note,
      teamId: props.teamId ? String(props.teamId) : undefined,
      teamName: props.teamName ? String(props.teamName) : title,
      activityType: props.activityType ? String(props.activityType) : undefined,
      operator,
      area,
    },
    popup: {
      longitude: coords[0],
      latitude: coords[1],
      name: title,
      description: [operator, area, status ? `状態: ${status}` : null].filter(Boolean).join(' / ') || note || undefined,
      type: 'team',
    },
  }
}

export function buildSearchResultSelection(result: Record<string, any>): {
  feature: CurrentMapFeatureProperties | null
  popup: MapLibrePopupInfo
} {
  const popup: MapLibrePopupInfo = {
    longitude: Number(result.lon),
    latitude: Number(result.lat),
    name: String(result.name || ''),
    description: result.address ? String(result.address) : '',
    type: result.type ? String(result.type) : undefined,
  }

  if (!result.selectedFeatureId) {
    return { feature: null, popup }
  }
  return { popup, feature: buildSharedSearchResultSelection(result).feature }
}
