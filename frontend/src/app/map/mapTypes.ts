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
  visible: boolean
  disabled?: boolean
  note?: string
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
