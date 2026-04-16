import type { Geometry } from 'geojson'

export type FeatureCategory =
  | 'baseArea'
  | 'evacuation'
  | 'teamActivity'
  | string

export type MapFeatureProperties = {
  id: string
  layerId: string
  title: string
  kind?: 'poi' | 'dynamic'
  importance?: number
  subtitle?: string
  category?: FeatureCategory
  summary?: string
  description?: string
  lat?: number
  lon?: number
  address?: string
  url?: string
  source?: string
  updatedBy?: string
  updatedAt?: string
  priority?: number
  icon?: string
  status?: string
  facilityType?: string
  capacity?: number
  barrierFree?: boolean
  pets?: boolean
  note?: string
  teamId?: string
  teamName?: string
  activityType?: string
  operator?: string
  area?: string
}

export type CurrentMapFeatureCategory =
  | 'baseArea'
  | 'evacuation'
  | 'teamActivity'

export type CurrentMapBaseAreaFeatureProperties = MapFeatureProperties & {
  layerId: 'baseArea'
  category: 'baseArea'
}

export type CurrentMapShelterFeatureProperties = MapFeatureProperties & {
  layerId: 'evacuation'
  category: 'evacuation'
  kind?: 'poi'
}

export type CurrentMapTeamActivityFeatureProperties = MapFeatureProperties & {
  layerId: 'teamActivity'
  category: 'teamActivity'
  kind?: 'poi'
}

export type CurrentMapFeatureProperties =
  | CurrentMapBaseAreaFeatureProperties
  | CurrentMapShelterFeatureProperties
  | CurrentMapTeamActivityFeatureProperties

export type MapFeature = {
  id: string
  layerId: string
  geometry: Geometry
  properties: MapFeatureProperties
}
