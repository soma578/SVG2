export type RuntimeDataSource = 'network' | 'cache' | 'fallback'

export type DataStatusEntry = {
  key: string
  label: string
  source: RuntimeDataSource
  url?: string
  online?: boolean
  updatedAt?: string
  message?: string
}

export type LayerState = {
  id: string
  label: string
  title?: string
  visible: boolean
  disabled?: boolean
  note?: string
  source?: string
  group?: string
  requiresController?: boolean
  experimental?: boolean
  imported?: boolean
  sourceUrl?: string
  attrs?: Record<string, string>
}

export type PrefectureEntry = {
  id: string
  prefCode?: string
  label: string
  prefecture?: string
  municipality?: string
  dataStatus?: string
  runtimeConfigUrl?: string
  municipalityIndexUrl?: string
}

export type MunicipalityEntry = {
  id: string
  type?: 'city' | 'town' | 'village'
  label: string
  displayCode?: string
  municipalityCodes?: string[]
  shelterCount?: number
  teamActivityCount?: number
  dataStatus?: string
  runtimeConfigUrl?: string
  hasDistrictPolygons?: boolean
  districtSvgUrls?: string[]
  viewport?: { lat: number; lon: number; latSpan: number; lonSpan: number }
}

export type GeoViewport = {
  lat: number
  lon: number
  latSpan: number
  lonSpan: number
}

export type FeatureDetailTone = 'blue' | 'green' | 'amber' | 'red' | 'gray'

export type FeatureDetailRow = {
  label: string
  value: string
}

export type FeatureDetailBadge = {
  label: string
  tone?: FeatureDetailTone
}

export type FeatureDetailIcon = {
  src: string
  alt?: string
}

export type FeatureDetailSection = {
  title: string
  rows: FeatureDetailRow[]
}

export type FeatureDetailAction = {
  label: string
  href: string
}

export type FeatureDetailModel = {
  id: string
  title: string
  subtitle?: string
  accent?: FeatureDetailTone
  badge?: FeatureDetailBadge
  icon?: FeatureDetailIcon
  rows?: FeatureDetailRow[]
  sections?: FeatureDetailSection[]
  actions?: FeatureDetailAction[]
}
