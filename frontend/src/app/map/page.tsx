'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './page.module.css'
import PrefSelectMap from './PrefSelectMap'
import MuniSelectMap from './MuniSelectMap'

type TeamEntry = {
  id?: string
  title?: string
  status?: string
  note?: string
  activityType?: string
  operator?: string
  updatedAt?: string
}

type RuntimeFeature = {
  id?: string
  title?: string
  type?: string
  layerId?: string
  category?: string
  kind?: string
  status?: string
  summary?: string
  description?: string
  address?: string
  resolvedArea?: string
  municipalityCode?: string
  n03Code?: string
  lat?: number
  lon?: number
  activityType?: string
  operator?: string
  note?: string
  memo?: string
  area?: string
  updatedAt?: string
  capacity?: number | string
  shelterType?: string
  feature?: Record<string, unknown>
  teams?: TeamEntry[]
}

type RuntimeDataSource = 'network' | 'cache' | 'fallback'

type DataStatusEntry = {
  key: string
  label: string
  source: RuntimeDataSource
  url?: string
  online?: boolean
  updatedAt?: string
  message?: string
}

type LayerState = {
  id: string
  label: string
  visible: boolean
  disabled?: boolean
  note?: string
}

type InteractionMode =
  | 'select-prefecture'
  | 'select-municipality'
  | 'select-area'
  | 'inspect-area'

type PrefectureEntry = {
  id: string
  prefCode?: string
  label: string
  prefecture?: string
  municipality?: string
  dataStatus?: string
  runtimeConfigUrl?: string
  municipalityIndexUrl?: string
}

type MunicipalityEntry = {
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

type GeoViewport = {
  lat: number
  lon: number
  latSpan: number
  lonSpan: number
}

type RegionMunicipalityIndex = {
  id: string
  prefCode?: string
  label: string
  municipalityIndexUrl: string
  municipalities: MunicipalityEntry[]
}

type LocationCandidate = {
  region: PrefectureEntry
  municipality: MunicipalityEntry
  score: number
  contains: boolean
}

type OverviewPath = {
  code: string
  rings: Array<Array<[number, number]>>
}

const INITIAL_LAYERS: LayerState[] = [
  { id: 'baseArea', label: '地域境界', visible: true },
  { id: 'evacuation', label: '避難所', visible: true },
  { id: 'teamActivity', label: '活動情報', visible: true },
  { id: 'hazard', label: 'ハザード', visible: false, disabled: true, note: '準備中' },
]

const DATA_STATUS_LABELS: Record<string, string> = {
  runtimeConfig: '地域設定',
  evacuation: '避難所',
  evacuationHitRecords: '避難所検索',
  teamActivity: '活動情報',
  baseArea: '地域境界',
  districtSvg: '地区境界',
}

const DATA_CACHE_NAME = 'svgmap-runtime-data-v1'
const MAP_RUNTIME_VERSION = 'unified-feature-select-debug-v4'

const EVACUATION_LEGEND = [
  { key: 'open', label: '開設中', icon: '/map/icons/shelter-open.svg' },
  { key: 'limited', label: '定員間近', icon: '/map/icons/shelter-limited.svg' },
  { key: 'full', label: '満員', icon: '/map/icons/shelter-full.svg' },
  { key: 'closed', label: '閉鎖', icon: '/map/icons/shelter-closed.svg' },
] as const

const TEAM_LEGEND = [
  { key: 'active', label: '活動中', icon: '/map/icons/team-active.svg' },
  { key: 'planned', label: '計画中', icon: '/map/icons/team-planned.svg' },
  { key: 'standby', label: '待機中', icon: '/map/icons/team-standby.svg' },
  { key: 'completed', label: '完了', icon: '/map/icons/team-completed.svg' },
  { key: 'attention', label: '要確認', icon: '/map/icons/team-attention.svg' },
] as const

const objectValue = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

const stringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const normalizeLayerId = (value: unknown): string | undefined => {
  const raw = stringValue(value)
  if (!raw) return undefined
  const normalized = raw.toLowerCase()
  if (normalized.includes('team') || normalized.includes('activity') || raw.includes('活動')) return 'teamActivity'
  if (normalized.includes('evac') || normalized.includes('shelter') || raw.includes('避難')) return 'evacuation'
  if (normalized.includes('district') || normalized.includes('area') || normalized.includes('n03') || raw.includes('区域')) return 'area'
  if (normalized.includes('municipality') || normalized.includes('city') || raw.includes('市区町村')) return 'municipality'
  if (normalized === 'basearea' || normalized === 'base-area') return 'baseArea'
  return raw
}

const isAreaFeature = (feature: RuntimeFeature | null): boolean => {
  if (!feature) return false
  const layerId = normalizeLayerId(feature.layerId ?? feature.category ?? feature.type ?? feature.kind)
  return layerId === 'area' || layerId === 'municipality' || layerId === 'baseArea'
}

const isTeamActivityFeature = (feature: RuntimeFeature | null): boolean => {
  if (!feature) return false
  return feature.layerId === 'teamActivity' || feature.kind === 'teamActivity' || feature.type === 'teamActivity' || !!feature.teams?.length
}

const isEvacuationFeature = (feature: RuntimeFeature | null): boolean => {
  if (!feature) return false
  const layerId = normalizeLayerId(feature.layerId ?? feature.category ?? feature.type ?? feature.kind)
  return layerId === 'evacuation' || String(feature.type || '').includes('避難')
}

const sourceLabel = (source?: RuntimeDataSource) => {
  if (source === 'network') return 'オンライン更新'
  if (source === 'cache') return 'キャッシュ表示'
  if (source === 'fallback') return 'フォールバック'
  return '未読込'
}

const fetchJsonWithRuntimeCache = async <T,>(url: string): Promise<{ data: T; source: RuntimeDataSource }> => {
  const absoluteUrl = new URL(url, window.location.href).href
  const request = new Request(absoluteUrl, { method: 'GET' })
  try {
    const response = await fetch(absoluteUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return { data: await response.json() as T, source: 'network' }
  } catch (error) {
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) {
        console.warn('[page] using cached runtime data', { url, error })
        return { data: await cached.json() as T, source: 'cache' }
      }
    }
    throw error
  }
}

const fetchTextWithRuntimeCache = async (url: string): Promise<{ data: string; source: RuntimeDataSource }> => {
  const absoluteUrl = new URL(url, window.location.href).href
  const request = new Request(absoluteUrl, { method: 'GET' })
  try {
    const response = await fetch(absoluteUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return { data: await response.text(), source: 'network' }
  } catch (error) {
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) {
        console.warn('[page] using cached runtime text', { url, error })
        return { data: await cached.text(), source: 'cache' }
      }
    }
    throw error
  }
}

const formatActivityType = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'water') return '給水支援'
  if (normalized === 'supply') return '物資搬送'
  if (normalized === 'safety') return '安全確認'
  return value || '不明'
}

const formatActivityStatus = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'active') return '活動中'
  if (normalized === 'planned') return '計画中'
  if (normalized === 'completed') return '完了'
  if (normalized === 'needs_attention') return '要確認'
  if (normalized === 'standby') return '待機中'
  return value || '情報なし'
}

const formatShelterStatus = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'open') return '開設中'
  if (normalized === 'limited') return '定員間近'
  if (normalized === 'full') return '満員'
  if (normalized === 'closed') return '閉鎖'
  return value || '情報なし'
}

const getTeamIconSrc = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'active') return '/map/icons/team-active.svg'
  if (normalized === 'planned') return '/map/icons/team-planned.svg'
  if (normalized === 'completed') return '/map/icons/team-completed.svg'
  if (normalized === 'needs_attention') return '/map/icons/team-attention.svg'
  if (normalized === 'standby') return '/map/icons/team-standby.svg'
  return '/map/icons/team-standby.svg'
}

const getShelterIconSrc = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'open') return '/map/icons/shelter-open.svg'
  if (normalized === 'limited') return '/map/icons/shelter-limited.svg'
  if (normalized === 'full') return '/map/icons/shelter-full.svg'
  if (normalized === 'closed') return '/map/icons/shelter-closed.svg'
  return '/map/icons/shelter-default.svg'
}

const clampViewportSpan = (value: number, min = 0.01, max = 8) => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

const regionIndexPromiseCache = new Map<string, Promise<RegionMunicipalityIndex | null>>()
const overviewPathPromiseCache = new Map<string, Promise<OverviewPath[] | null>>()
let regionIndexListPromise: Promise<PrefectureEntry[] | null> | null = null

const loadRegionIndexList = async (): Promise<PrefectureEntry[] | null> => {
  if (!regionIndexListPromise) {
    regionIndexListPromise = fetchJsonWithRuntimeCache<{ regions: PrefectureEntry[] }>('/map/regions/index.json')
      .then(({ data }) => data.regions ?? [])
      .catch(() => null)
  }
  return regionIndexListPromise
}

const loadRegionMunicipalityIndex = async (region: PrefectureEntry): Promise<RegionMunicipalityIndex | null> => {
  const cacheKey = region.id
  if (!regionIndexPromiseCache.has(cacheKey)) {
    regionIndexPromiseCache.set(cacheKey, fetchJsonWithRuntimeCache<{ label: string; municipalities: MunicipalityEntry[] }>(
      region.municipalityIndexUrl || `/map/regions/${encodeURIComponent(region.id)}/municipalities.json`,
    ).then(({ data }) => ({
      id: region.id,
      prefCode: region.prefCode,
      label: data.label || region.label,
      municipalityIndexUrl: region.municipalityIndexUrl || `/map/regions/${encodeURIComponent(region.id)}/municipalities.json`,
      municipalities: data.municipalities ?? [],
    })).catch(() => null))
  }
  return regionIndexPromiseCache.get(cacheKey) || null
}

const viewportContains = (viewport: GeoViewport | undefined, lat: number, lon: number) => {
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

const viewportScore = (viewport: GeoViewport | undefined, lat: number, lon: number) => {
  if (!viewport) return Number.POSITIVE_INFINITY
  const dLat = Math.abs(lat - Number(viewport.lat))
  const dLon = Math.abs(lon - Number(viewport.lon))
  const area = Math.max(Number(viewport.latSpan) || 0.1, 0.01) * Math.max(Number(viewport.lonSpan) || 0.1, 0.01)
  return (dLat * 2) + dLon + (area * 0.01)
}

const parsePathRings = (d: string): Array<Array<[number, number]>> => {
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

const pointInRing = (lon: number, lat: number, ring: Array<[number, number]>) => {
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

const pointInOverviewPath = (lon: number, lat: number, path: OverviewPath) =>
  path.rings.some((ring) => pointInRing(lon, lat, ring))

const loadPrefOverviewPaths = (region: PrefectureEntry) => {
  const prefCode = String(region.prefCode || '').padStart(2, '0')
  if (!/^\d{2}$/.test(prefCode)) return null
  const cacheKey = prefCode
  if (!overviewPathPromiseCache.has(cacheKey)) {
    overviewPathPromiseCache.set(cacheKey, fetchTextWithRuntimeCache(`/map/layers/overview/pref/${prefCode}.svg`)
      .then(({ data }) => {
        const doc = new DOMParser().parseFromString(data, 'image/svg+xml')
        return Array.from(doc.querySelectorAll('path[data-n03-code]'))
          .map((el) => ({
            code: el.getAttribute('data-n03-code') || '',
            rings: parsePathRings(el.getAttribute('d') || ''),
          }))
          .filter((path) => path.code && path.rings.length > 0)
      })
      .catch((error) => {
        console.warn('[page] pref overview polygon fallback', { prefCode, error })
        return null
      }))
  }
  return overviewPathPromiseCache.get(cacheKey) || null
}

const municipalityCodesFor = (municipality: MunicipalityEntry) => {
  const codes = new Set<string>()
  if (municipality.id) codes.add(municipality.id)
  if (municipality.displayCode) codes.add(municipality.displayCode)
  municipality.municipalityCodes?.forEach((code) => {
    if (code) codes.add(code)
  })
  return codes
}

const refineLocationTargetByPolygon = async (lat: number, lon: number, candidates: LocationCandidate[]) => {
  const primaryCandidates = candidates.filter((candidate) => candidate.contains).slice(0, 80)
  const searchCandidates = primaryCandidates.length > 0 ? primaryCandidates : candidates.slice(0, 24)
  const regions = Array.from(new Map(searchCandidates.map((candidate) => [candidate.region.id, candidate.region])).values())

  for (const region of regions) {
    const paths = await loadPrefOverviewPaths(region)
    if (!paths) continue
    const regionCandidates = searchCandidates.filter((candidate) => candidate.region.id === region.id)
    for (const candidate of regionCandidates) {
      const codes = municipalityCodesFor(candidate.municipality)
      const matched = paths.some((path) => codes.has(path.code) && pointInOverviewPath(lon, lat, path))
      if (matched) return candidate
    }
  }
  return null
}

const findLocationTarget = async (lat: number, lon: number) => {
  const regions = await loadRegionIndexList()
  if (!regions || regions.length === 0) return null

  const loaded = await Promise.all(regions.map((region) => loadRegionMunicipalityIndex(region)))
  const candidates: LocationCandidate[] = []

  loaded.forEach((regionData, index) => {
    if (!regionData) return
    const region = regions[index]
    regionData.municipalities.forEach((municipality) => {
      const viewport = municipality.viewport
      if (!viewport) return
      const contains = viewportContains(viewport, lat, lon)
      const score = viewportScore(viewport, lat, lon)
      if (contains || Number.isFinite(score)) {
        candidates.push({ region, municipality, score, contains })
      }
    })
  })

  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (a.contains !== b.contains) return a.contains ? -1 : 1
    return a.score - b.score
  })
  return await refineLocationTargetByPolygon(lat, lon, candidates) || candidates[0]
}

const normalizeRuntimeFeature = (messageLike: unknown): RuntimeFeature | null => {
  const message = objectValue(messageLike)
  const payload = objectValue(message.payload ?? message.feature ?? message)
  if (Object.keys(payload).length === 0) return null

  const nestedFeature = objectValue(payload.feature)
  const properties = objectValue(payload.properties)
  const layerId = normalizeLayerId(
    payload.layerId ??
    payload.category ??
    payload.type ??
    payload.kind ??
    nestedFeature.layerId ??
    nestedFeature.category ??
    nestedFeature.type
  )
  const id = stringValue(payload.id ?? payload.featureId ?? nestedFeature.id ?? nestedFeature.featureId)
  const title = stringValue(
    payload.title ??
    payload.name ??
    properties.title ??
    properties.name ??
    nestedFeature.title ??
    nestedFeature.name ??
    id
  )
  const status = stringValue(payload.status ?? properties.status ?? nestedFeature.status) ?? 'unknown'
  const teamsSource =
    Array.isArray(payload.teams) ? payload.teams :
    Array.isArray(properties.teams) ? properties.teams :
    Array.isArray(nestedFeature.teams) ? nestedFeature.teams :
    []
  const { feature: _feature, teams: _teams, properties: _properties, ...flatPayload } = payload

  return {
    ...flatPayload,
    id: id ?? title ?? 'feature',
    title: title ?? '名称未設定',
    layerId,
    category: layerId,
    kind: stringValue(payload.kind ?? nestedFeature.kind) ?? layerId,
    status,
    summary: stringValue(payload.summary ?? properties.summary ?? nestedFeature.summary),
    description: stringValue(payload.description ?? properties.description ?? nestedFeature.description),
    address: stringValue(payload.address ?? properties.address ?? nestedFeature.address),
    resolvedArea: stringValue(payload.resolvedArea ?? properties.resolvedArea ?? nestedFeature.resolvedArea),
    municipalityCode: stringValue(
      payload.municipalityCode ??
      properties.municipalityCode ??
      nestedFeature.municipalityCode ??
      payload.n03Code ??
      properties.n03Code
    ),
    n03Code: stringValue(
      payload.n03Code ??
      properties.n03Code ??
      nestedFeature.n03Code ??
      payload.municipalityCode ??
      properties.municipalityCode
    ),
    lat: numberValue(payload.lat ?? properties.lat ?? nestedFeature.lat),
    lon: numberValue(payload.lon ?? properties.lon ?? nestedFeature.lon),
    activityType: stringValue(payload.activityType ?? properties.activityType ?? nestedFeature.activityType),
    operator: stringValue(payload.operator ?? properties.operator ?? nestedFeature.operator),
    note: stringValue(payload.note ?? payload.memo ?? properties.note ?? properties.memo ?? nestedFeature.note ?? nestedFeature.memo),
    memo: stringValue(payload.memo ?? properties.memo ?? nestedFeature.memo),
    area: stringValue(payload.area ?? properties.area ?? nestedFeature.area),
    updatedAt: stringValue(payload.updatedAt ?? payload.updatedAtText ?? properties.updatedAt ?? nestedFeature.updatedAt ?? nestedFeature.updatedAtText),
    capacity: numberValue(payload.capacity ?? properties.capacity ?? nestedFeature.capacity) ?? stringValue(payload.capacity ?? properties.capacity ?? nestedFeature.capacity),
    shelterType: stringValue(payload.shelterType ?? properties.shelterType ?? nestedFeature.shelterType),
    feature: { ...nestedFeature, ...properties, ...flatPayload },
    teams: teamsSource as TeamEntry[],
  }
}

function ShieldBrandIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5ba6ff" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="27" height="27" rx="8" fill="#ffffff" fillOpacity="0.96" />
      <path d="M16 6.8l7 2.3v5.9c0 4.4-2.9 8.2-7 10.2-4.1-2-7-5.8-7-10.2V9.1L16 6.8z" fill="url(#shieldGrad)" />
      <path d="M11.4 15.4l3.2-3.3 1.9 1.9 4.2-4.2 1.1 1.1-5.3 5.3-1.9-1.9-2.1 2.1-1.1-1z" fill="#ffffff" />
    </svg>
  )
}

function MiniFieldIcon({ kind }: { kind: 'place' | 'type' | 'memo' | 'time' | 'people' }) {
  const common = { width: '1em', height: '1em', viewBox: '0 0 24 24', 'aria-hidden': true, focusable: 'false' as const }

  if (kind === 'place') {
    return (
      <svg {...common}>
        <path d="M12 3.5a6.5 6.5 0 0 0-6.5 6.5c0 5.2 6.5 10.5 6.5 10.5S18.5 15.2 18.5 10A6.5 6.5 0 0 0 12 3.5Zm0 9.2A2.7 2.7 0 1 1 12 7.3a2.7 2.7 0 0 1 0 5.4Z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'type') {
    return (
      <svg {...common}>
        <path d="M5 6.5h14v2H5v-2Zm0 5h14v2H5v-2Zm0 5h9v2H5v-2Z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'memo') {
    return (
      <svg {...common}>
        <path d="M7 4.8h7.2l3.8 3.8V19a1.7 1.7 0 0 1-1.7 1.7H7A1.7 1.7 0 0 1 5.3 19V6.5A1.7 1.7 0 0 1 7 4.8Zm6.4 1.7V8.7h2.2l-2.2-2.2Zm-4.4 5h8v1.8H9v-1.8Zm0 3.8h8v1.8H9v-1.8Z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'time') {
    return (
      <svg {...common}>
        <path d="M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6Zm0 1.8a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm.8 2.2h-1.7v4.2l3.6 2.2.9-1.4-2.8-1.7V8.2Z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm8 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM4.8 18.2c.4-2.2 2.3-3.8 4.6-3.8s4.2 1.6 4.6 3.8v1H4.8v-1Zm10.6 0c.4-2 2.1-3.4 4.1-3.4s3.7 1.4 4.1 3.4v1h-8.2v-1Z" fill="currentColor" />
    </svg>
  )
}

function MapPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const region = params.get('region')
  const municipalityId = params.get('municipalityId') || ''
  const municipalityCodesParam = params.get('municipalityCodes') || ''

  const step: 'prefecture' | 'municipality' | 'map' =
    !region ? 'prefecture' : !municipalityId ? 'municipality' : 'map'

  // Selection screen state
  const [prefectures, setPrefectures] = useState<PrefectureEntry[]>([])
  const [municipalities, setMunicipalities] = useState<MunicipalityEntry[]>([])
  const [prefLabel, setPrefLabel] = useState<string>('')
  const [muniLabel, setMuniLabel] = useState<string>('')
  const [muniShelterCount, setMuniShelterCount] = useState(0)
  const [muniTeamCount, setMuniTeamCount] = useState(0)
  const [prefSearch, setPrefSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // Map selection hover state
  const [hoveredPrefCode, setHoveredPrefCode] = useState<string | null>(null)
  const [hoveredPrefLabel, setHoveredPrefLabel] = useState<string | null>(null)
  const [hoveredMuniCode, setHoveredMuniCode] = useState<string | null>(null)
  const [hoveredMuniLabel, setHoveredMuniLabel] = useState<string | null>(null)
  const [hoveredMuniShelters, setHoveredMuniShelters] = useState<number | undefined>(undefined)
  const [hoveredMuniTeams, setHoveredMuniTeams] = useState<number | undefined>(undefined)

  // Map state
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pendingCurrentLocationRef = useRef<{
    lat: number
    lon: number
    region: string
    municipalityId: string
  } | null>(null)
  const [layers, setLayers] = useState<LayerState[]>(INITIAL_LAYERS)
  const [selectedFeature, setSelectedFeature] = useState<RuntimeFeature | null>(null)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [resolvedViewport, setResolvedViewport] = useState<GeoViewport | null>(null)
  const [mapViewport, setMapViewport] = useState<GeoViewport | null>(null)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select-area')
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [dataStatuses, setDataStatuses] = useState<Record<string, DataStatusEntry>>({})
  const [shareOpen, setShareOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [locationStatus, setLocationStatus] = useState('')

  // Fetch prefectures index (needed for map components in both step 1 and step 2)
  useEffect(() => {
    if (step === 'map') return
    setLoading(true)
    fetchJsonWithRuntimeCache<{ regions: PrefectureEntry[] }>('/map/regions/index.json')
      .then(({ data }) => setPrefectures(data.regions ?? []))
      .catch(() => setPrefectures([]))
      .finally(() => setLoading(false))
  }, [step])

  // Fetch municipalities (step 2)
  useEffect(() => {
    if (step !== 'municipality' || !region) return
    setLoading(true)
    fetchJsonWithRuntimeCache<{ label: string; municipalities: MunicipalityEntry[] }>(
      `/map/regions/${region}/municipalities.json`
    )
      .then(({ data }) => {
        setPrefLabel(data.label ?? region)
        setMunicipalities(data.municipalities ?? [])
      })
      .catch(() => setMunicipalities([]))
      .finally(() => setLoading(false))
  }, [step, region])

  // Resolved municipality codes for iframe — from URL param (immediate) or fetched from data (bookmark fallback)
  const [resolvedMuniCodes, setResolvedMuniCodes] = useState('')

  // Fetch municipality metadata for step 3 topbar + resolve codes for iframe
  useEffect(() => {
    if (step !== 'map' || !region || !municipalityId) return
    if (municipalityCodesParam) setResolvedMuniCodes(municipalityCodesParam)
    fetchJsonWithRuntimeCache<{ label: string; municipalities: MunicipalityEntry[] }>(
      `/map/regions/${region}/municipalities.json`
    )
      .then(({ data }) => {
        setPrefLabel(data.label ?? region)
        const muni = data.municipalities?.find((m) => m.id === municipalityId)
        if (muni) {
          setMuniLabel(muni.label)
          setMuniShelterCount(muni.shelterCount ?? 0)
          setMuniTeamCount(muni.teamActivityCount ?? 0)
          if (!municipalityCodesParam && muni.municipalityCodes?.length) {
            setResolvedMuniCodes(muni.municipalityCodes.join(','))
          }
          if (muni.viewport) setResolvedViewport(muni.viewport)
        }
      })
      .catch(() => {})
  }, [step, region, municipalityId, municipalityCodesParam])

  useEffect(() => {
    if (resolvedViewport) {
      setMapViewport(resolvedViewport)
    }
  }, [resolvedViewport])

  // iframe src — only renders once municipality codes are resolved
  const iframeSrc = useMemo(() => {
    if (step !== 'map' || !region || !municipalityId || !resolvedMuniCodes) return ''
    const urlParams = new URLSearchParams({
      embed: '1',
      regionId: region,
      runtimeConfigUrl: `/map/regions/${region}/runtime-config.json`,
      v: MAP_RUNTIME_VERSION,
    })
    urlParams.set('municipalityCodes', resolvedMuniCodes)
    return `/map/webapp/current-map.html?${urlParams.toString()}`
  }, [step, region, municipalityId, resolvedMuniCodes])

  useEffect(() => {
    setRuntimeReady(false)
  }, [iframeSrc])

  // Online status
  useEffect(() => {
    const syncOnline = () => setIsOnline(navigator.onLine)
    syncOnline()
    window.addEventListener('online', syncOnline)
    window.addEventListener('offline', syncOnline)
    return () => {
      window.removeEventListener('online', syncOnline)
      window.removeEventListener('offline', syncOnline)
    }
  }, [])

  const updateDataStatus = useCallback((entry: Partial<DataStatusEntry> & { key: string }) => {
    setDataStatuses((prev) => {
      const label = entry.label || DATA_STATUS_LABELS[entry.key] || entry.key
      return {
        ...prev,
        [entry.key]: {
          key: entry.key,
          label,
          source: entry.source || prev[entry.key]?.source || 'fallback',
          url: entry.url ?? prev[entry.key]?.url,
          online: entry.online ?? (typeof navigator !== 'undefined' ? navigator.onLine : undefined),
          updatedAt: entry.updatedAt || new Date().toISOString(),
          message: entry.message,
        },
      }
    })
  }, [])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const fromMapFrame = event.source === iframeRef.current?.contentWindow
      const sameOrigin = event.origin === window.location.origin
      const nullOrigin = event.origin === 'null'
      const message = objectValue(event.data)
      const type = stringValue(message.type)
      if (!type) return
      const runtimeMessage =
        type === 'runtime:ready' ||
        type === 'runtime:featureSelect' ||
        type === 'runtime:dataStatus'
      if (!runtimeMessage) return
      if (!fromMapFrame && !sameOrigin && !nullOrigin) return

      if (type === 'runtime:ready') {
        console.log('[page] runtime:ready', message.payload)
        setRuntimeReady(true)
        const payload = objectValue(message.payload)
        const runtimeConfigUrl = stringValue(payload.runtimeConfigUrl)
        if (runtimeConfigUrl) {
          updateDataStatus({
            key: 'runtimeConfig',
            source: 'network',
            url: runtimeConfigUrl,
            online: navigator.onLine,
          })
        }
        return
      }

      if (type === 'runtime:featureSelect') {
        console.log('[tap-debug][page] runtime:featureSelect received', {
          origin: event.origin,
          fromMapFrame,
          sameOrigin,
          nullOrigin,
          raw: message,
        })
        const feature = normalizeRuntimeFeature(message)
        console.log('[page] runtime:featureSelect', feature)
        if (isAreaFeature(feature)) {
          setInteractionMode('inspect-area')
        }
        setSelectedFeature(feature)
        return
      }

      if (type === 'runtime:dataStatus') {
        const payload = objectValue(message.payload)
        const key = stringValue(payload.key)
        if (!key) return
        updateDataStatus({
          key,
          label: stringValue(payload.label),
          source: (stringValue(payload.source) as RuntimeDataSource | undefined) || 'fallback',
          url: stringValue(payload.url),
          online: typeof payload.online === 'boolean' ? payload.online : undefined,
          updatedAt: stringValue(payload.updatedAt) || stringValue(payload.at) || new Date().toISOString(),
          message: stringValue(payload.message),
        })
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [updateDataStatus])

  // Send municipality viewport to iframe once runtime is ready and viewport is resolved
  useEffect(() => {
    if (!runtimeReady || !resolvedViewport || !iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: 'map:setViewport',
      viewport: resolvedViewport,
    }, window.location.origin)
  }, [runtimeReady, resolvedViewport])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setShareLink(window.location.href)
  }, [step, region, municipalityId, municipalityCodesParam, resolvedMuniCodes])

  const postViewport = useCallback((viewport: GeoViewport) => {
    setMapViewport(viewport)
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: 'map:setViewport',
      viewport,
    }, window.location.origin)
  }, [])

  const postCurrentLocation = useCallback((lat: number, lon: number) => {
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: 'map:setCurrentLocation',
      location: { lat, lon },
    }, window.location.origin)
  }, [])

  const focusCurrentLocationOnce = useCallback((lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    const base = resolvedViewport
    const focusViewport: GeoViewport = {
      lat,
      lon,
      latSpan: clampViewportSpan(Math.min((base?.latSpan ?? 0.08) * 0.32, 0.045), 0.012, 0.08),
      lonSpan: clampViewportSpan(Math.min((base?.lonSpan ?? 0.1) * 0.32, 0.06), 0.012, 0.1),
    }
    window.setTimeout(() => {
      postViewport(focusViewport)
      setLocationStatus('現在地へ移動しました')
    }, 250)
    window.setTimeout(() => {
      postCurrentLocation(lat, lon)
    }, 700)
  }, [postCurrentLocation, postViewport, resolvedViewport])

  useEffect(() => {
    if (!runtimeReady) return
    const pending = pendingCurrentLocationRef.current
    if (!pending) return
    if (pending.region !== region || pending.municipalityId !== municipalityId) return
    pendingCurrentLocationRef.current = null
    focusCurrentLocationOnce(pending.lat, pending.lon)
  }, [focusCurrentLocationOnce, iframeSrc, municipalityId, region, runtimeReady])

  const zoomViewport = useCallback((direction: 'in' | 'out') => {
    const base = mapViewport || resolvedViewport
    if (!base) return
    const factor = direction === 'in' ? 0.72 : 1.3888889
    postViewport({
      lat: base.lat,
      lon: base.lon,
      latSpan: clampViewportSpan(base.latSpan * factor),
      lonSpan: clampViewportSpan(base.lonSpan * factor),
    })
    setShareStatus('')
    setLocationStatus('')
  }, [mapViewport, postViewport, resolvedViewport])

  const resetViewport = useCallback(() => {
    const base = resolvedViewport
    if (!base) return
    postViewport(base)
    setShareStatus('')
    setLocationStatus('')
  }, [postViewport, resolvedViewport])

  const locateCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('このブラウザでは現在地取得が使えません')
      return
    }
    setLocationStatus('現在地を取得中...')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        const target = await findLocationTarget(lat, lon)

        if (target) {
          const codes = (target.municipality.municipalityCodes || [target.municipality.id]).filter(Boolean)
          const codesParam = codes.length > 0 ? `&municipalityCodes=${encodeURIComponent(codes.join(','))}` : ''
          const nextUrl = `/map?region=${encodeURIComponent(target.region.id)}&municipalityId=${encodeURIComponent(target.municipality.id)}${codesParam}`
          setLocationStatus(`現在地に近い地域へ移動: ${target.municipality.label}`)
          setShareStatus('')
          pendingCurrentLocationRef.current = {
            lat,
            lon,
            region: target.region.id,
            municipalityId: target.municipality.id,
          }
          if (region === target.region.id && municipalityId === target.municipality.id) {
            pendingCurrentLocationRef.current = null
            focusCurrentLocationOnce(lat, lon)
          } else {
            router.push(nextUrl)
          }
          return
        }

        const base = mapViewport || resolvedViewport
        const nextViewport: GeoViewport = {
          lat,
          lon,
          latSpan: clampViewportSpan((base?.latSpan ?? 0.12) * 0.82, 0.02, 4),
          lonSpan: clampViewportSpan((base?.lonSpan ?? 0.16) * 0.82, 0.02, 4),
        }
        postViewport(nextViewport)
        window.setTimeout(() => {
          postCurrentLocation(lat, lon)
        }, 450)
        setLocationStatus('現在地へ移動しました')
        setShareStatus('')
      },
      (error) => {
        console.warn('[page] geolocation failed', error)
        setLocationStatus('現在地を取得できませんでした')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  }, [focusCurrentLocationOnce, mapViewport, municipalityId, postCurrentLocation, postViewport, region, resolvedViewport, router])

  const copyShareLink = useCallback(async () => {
    const url = window.location.href
    setShareLink(url)
    setShareOpen(true)
    setShareStatus('リンクを作成しました')
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('リンクをコピーしました')
    } catch (error) {
      console.warn('[page] clipboard write failed', error)
      setShareStatus('リンクを表示しています。手動でコピーできます')
    }
  }, [])

  const toggleLayer = useCallback((layerId: string) => {
    setLayers((prev) => {
      const next = prev.map((layer) => {
        if (layer.id !== layerId || layer.disabled) return layer
        return { ...layer, visible: !layer.visible }
      })
      const target = next.find((layer) => layer.id === layerId)
      if (target && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: 'runtime:setLayerVisibility',
          layerId,
          visible: target.visible,
        }, window.location.origin)
      }
      return next
    })
  }, [])

  const featureLayerLabel = isTeamActivityFeature(selectedFeature)
    ? '活動情報'
    : isEvacuationFeature(selectedFeature)
      ? '避難所'
      : '選択中'

  const featureIconSrc = isTeamActivityFeature(selectedFeature)
    ? getTeamIconSrc(selectedFeature?.status)
    : isEvacuationFeature(selectedFeature)
      ? getShelterIconSrc(selectedFeature?.status)
      : '/map/icons/team-standby.svg'

  const featureTitle = selectedFeature?.title || selectedFeature?.id || '名称未設定'
  const featureStatusLabel = isTeamActivityFeature(selectedFeature)
    ? formatActivityStatus(selectedFeature?.status)
    : isEvacuationFeature(selectedFeature)
      ? formatShelterStatus(selectedFeature?.status)
      : selectedFeature?.status || '情報なし'
  const featureSubtitle = isTeamActivityFeature(selectedFeature)
    ? (selectedFeature?.area || selectedFeature?.resolvedArea || selectedFeature?.address || '活動エリア未設定')
    : (selectedFeature?.address || selectedFeature?.resolvedArea || selectedFeature?.summary || '施設情報未設定')

  const featureRows = useMemo(() => {
    if (!selectedFeature) return []
    if (isTeamActivityFeature(selectedFeature)) {
      return [
        { label: '活動種別', value: formatActivityType(selectedFeature.activityType || selectedFeature.type) },
        { label: '担当', value: selectedFeature.operator || '不明' },
        { label: '活動エリア', value: selectedFeature.area || selectedFeature.resolvedArea || selectedFeature.address || '不明' },
        { label: 'メモ', value: selectedFeature.note || selectedFeature.memo || selectedFeature.summary || '不明' },
        { label: '最終更新', value: selectedFeature.updatedAt || '不明' },
      ]
    }
    if (isEvacuationFeature(selectedFeature)) {
      return [
        { label: '住所', value: selectedFeature.address || selectedFeature.resolvedArea || '不明' },
        { label: '状態', value: formatShelterStatus(selectedFeature.status) },
        { label: '収容人数', value: stringValue(selectedFeature.capacity) || '不明' },
        { label: '種別', value: selectedFeature.shelterType || selectedFeature.type || '不明' },
        { label: '備考', value: selectedFeature.note || selectedFeature.memo || selectedFeature.summary || '不明' },
        { label: '最終更新', value: selectedFeature.updatedAt || '不明' },
      ]
    }
    return [
      { label: '住所', value: selectedFeature.address || selectedFeature.resolvedArea || '不明' },
      { label: '状態', value: selectedFeature.status || '情報なし' },
      { label: '備考', value: selectedFeature.summary || selectedFeature.description || '不明' },
    ]
  }, [selectedFeature])

  const handleFeatureAction = useCallback(() => {
    if (!selectedFeature) return
    iframeRef.current?.focus()
    console.log('[page] feature locate requested', {
      id: selectedFeature.id,
      layerId: selectedFeature.layerId,
    })
  }, [selectedFeature])

  useEffect(() => {
    console.log('[page] selectedFeature changed', selectedFeature)
  }, [selectedFeature])

  useEffect(() => {
    console.log('[page] interactionMode changed', interactionMode)
  }, [interactionMode])

  const handlePrefSelect = useCallback((regionId: string, _prefCode: string, _label: string) => {
    setHoveredPrefCode(null)
    setHoveredPrefLabel(null)
    router.push(`/map?region=${regionId}`)
  }, [router])

  const handlePrefHover = useCallback((prefCode: string | null, label: string | null) => {
    setHoveredPrefCode(prefCode)
    setHoveredPrefLabel(label)
  }, [])

  const handleMuniSelect = useCallback((id: string, codes: string[]) => {
    setHoveredMuniCode(null)
    setHoveredMuniLabel(null)
    const codesStr = codes.length > 0 ? codes.join(',') : ''
    const codesParam = codesStr ? `&municipalityCodes=${codesStr}` : ''
    router.push(`/map?region=${region}&municipalityId=${id}${codesParam}`)
  }, [router, region])

  const handleMuniHover = useCallback((
    code: string | null,
    label: string | null,
    shelterCount?: number,
    teamCount?: number,
  ) => {
    setHoveredMuniCode(code)
    setHoveredMuniLabel(label)
    setHoveredMuniShelters(shelterCount)
    setHoveredMuniTeams(teamCount)
  }, [])

  // Filtered prefectures (for text search fallback, kept but not shown in map mode)
  const filteredPrefectures = useMemo(() => {
    const q = prefSearch.trim()
    if (!q) return prefectures
    return prefectures.filter((p) => p.label.includes(q))
  }, [prefectures, prefSearch])

  // Top bar copy
  const topBarTitle =
    step === 'prefecture' ? '全国防災マップ' :
    step === 'municipality' ? (prefLabel || region || '') :
    `${prefLabel || region || ''} > ${muniLabel || municipalityId || ''}`

  const topBarSub =
    step === 'prefecture' ? '都道府県を選択' :
    step === 'municipality' ? '市区町村を選択' :
    `避難所${muniShelterCount}件・活動情報${muniTeamCount}件`

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarBrand}>
          <div className={styles.topBarIcon} aria-hidden="true">
            <ShieldBrandIcon />
          </div>
          <div className={styles.topBarTitleGroup}>
            <div className={styles.topBarTitle}>{topBarTitle}</div>
            <div className={styles.topBarSubtitle}>{topBarSub}</div>
          </div>
        </div>

        <div className={styles.topBarActions}>
          {step === 'map' && (
            <>
              <button
                type="button"
                className={styles.topBarBtn}
                onClick={() => zoomViewport('out')}
                aria-label="縮小"
                disabled={!mapViewport && !resolvedViewport}
              >
                −
              </button>
              <button
                type="button"
                className={styles.topBarBtn}
                onClick={() => zoomViewport('in')}
                aria-label="拡大"
                disabled={!mapViewport && !resolvedViewport}
              >
                ＋
              </button>
              <button type="button" className={styles.topBarBtn} onClick={locateCurrentPosition}>
                現在地
              </button>
              <button type="button" className={styles.topBarBtn} onClick={() => setShareOpen((prev) => !prev)}>
                共有
              </button>
              <button type="button" className={styles.topBarBtn} onClick={resetViewport} disabled={!resolvedViewport}>
                初期表示
              </button>
            </>
          )}
          {step === 'municipality' && (
            <button type="button" className={styles.topBarBtn} onClick={() => router.push('/map')}>
              県を変更
            </button>
          )}
          {step === 'map' && (
            <>
              <button
                type="button"
                className={styles.topBarBtn}
                onClick={() => router.push(`/map?region=${region}`)}
              >
                市区町村を変更
              </button>
              <button type="button" className={styles.topBarBtn} onClick={() => router.push('/map')}>
                県を変更
              </button>
            </>
          )}
        </div>
      </header>

      {step === 'map' && locationStatus ? (
        <div className={styles.mapToast} role="status" aria-live="polite">
          {locationStatus}
        </div>
      ) : null}

      <div className={styles.body}>
        {step === 'prefecture' && (
          <div className={styles.selectLayout}>
            <div className={styles.selectMapPanel}>
              <div className={styles.mapSvgWrap}>
                {loading ? (
                  <div className={styles.loading}>読み込み中...</div>
                ) : (
                  <PrefSelectMap
                    regions={prefectures}
                    hoveredCode={hoveredPrefCode}
                    onSelect={handlePrefSelect}
                    onHover={handlePrefHover}
                  />
                )}
              </div>
            </div>
            <div className={styles.selectInfoPanel}>
              {hoveredPrefLabel ? (
                <div className={styles.selectInfoCard}>
                  <div className={styles.selectInfoTitle}>{hoveredPrefLabel}</div>
                  <div className={styles.selectInfoMeta}>クリックして選択</div>
                </div>
              ) : (
                <div className={styles.selectInfoEmpty}>
                  <p>都道府県を選択してください</p>
                  <p className={styles.selectInfoHint}>マップ上の都道府県をクリックすると、市区町村の選択に進みます。</p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'municipality' && (
          <div className={styles.selectLayout}>
            <div className={styles.selectMapPanel}>
              <div className={styles.mapSvgWrap}>
                {(() => {
                const prefCode = prefectures.find((p) => p.id === region)?.prefCode || ''
                if (!prefCode || loading) return <div className={styles.loading}>読み込み中...</div>
                return (
                  <MuniSelectMap
                    prefCode={prefCode}
                    municipalities={municipalities}
                    hoveredCode={hoveredMuniCode}
                    onSelect={handleMuniSelect}
                    onHover={handleMuniHover}
                  />
                )
              })()}
              </div>
            </div>
            <div className={styles.selectInfoPanel}>
              {hoveredMuniLabel ? (
                <div className={styles.selectInfoCard}>
                  <div className={styles.selectInfoTitle}>{hoveredMuniLabel}</div>
                  <div className={styles.selectInfoMeta}>
                    避難所 {hoveredMuniShelters ?? 0}件
                    {(hoveredMuniTeams ?? 0) > 0 ? `・活動情報 ${hoveredMuniTeams}件` : ''}
                  </div>
                  <div className={styles.selectInfoHint}>クリックして選択</div>
                </div>
              ) : (
                <div className={styles.selectInfoEmpty}>
                  <p>市区町村を選択してください</p>
                  <p className={styles.selectInfoHint}>マップ上の市区町村をクリックすると、その地域の地図が表示されます。</p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className={styles.mapGrid}>
            <section className={styles.mapFrame}>
              <iframe
                key={municipalityId}
                ref={iframeRef}
                src={iframeSrc || undefined}
                title="SVGMap"
                className={styles.iframe}
              />
            </section>

            <aside className={styles.sidebar}>
              {shareOpen ? (
                <section className={styles.card}>
                  <div className={styles.sharePanelHeader}>
                    <strong>共有リンク</strong>
                    <button type="button" className={styles.sharePanelClose} onClick={() => setShareOpen(false)} aria-label="閉じる">
                      ×
                    </button>
                  </div>
                  <input
                    className={styles.sharePanelInput}
                    value={shareLink}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <div className={styles.sharePanelActions}>
                    <button type="button" className={styles.sharePanelCopy} onClick={copyShareLink}>
                      コピー
                    </button>
                    <span className={styles.sharePanelStatus}>{shareStatus || 'URL をコピーして共有できます'}</span>
                  </div>
                </section>
              ) : null}

              <section className={`${styles.featureCard} ${isEvacuationFeature(selectedFeature) ? styles.featureCardEvacuation : styles.featureCardActivity}`}>
                <div className={styles.featureCardHeader}>
                  <span className={styles.featureLayerBadge}>{featureLayerLabel}</span>
                  {selectedFeature ? (
                    <button
                      type="button"
                      className={styles.featureCardClose}
                      onClick={() => setSelectedFeature(null)}
                      aria-label="詳細を閉じる"
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                {selectedFeature ? (
                  <>
                    <div className={styles.featureHero}>
                      <div className={styles.featureIcon} aria-hidden="true">
                        <img src={featureIconSrc} alt="" />
                      </div>
                      <div className={styles.featureHeroText}>
                        <h3 className={styles.featureCardTitle}>{featureTitle}</h3>
                        <p className={styles.featureSubtitle}>{featureSubtitle}</p>
                        <span
                          className={styles.statusBadge}
                          style={{
                            backgroundColor: isTeamActivityFeature(selectedFeature)
                              ? '#2563eb'
                              : isEvacuationFeature(selectedFeature)
                                ? '#1d4ed8'
                                : '#64748b',
                          }}
                        >
                          {featureStatusLabel}
                        </span>
                      </div>
                    </div>

                    <dl className={styles.featureDetail}>
                      {featureRows.map((row) => (
                        <div key={row.label} className={styles.featureDetailRow}>
                          <dt>
                            <MiniFieldIcon kind={
                              row.label === '活動種別' ? 'type' :
                              row.label === '住所' || row.label === '活動エリア' ? 'place' :
                              row.label === 'メモ' || row.label === '備考' ? 'memo' :
                              row.label === '最終更新' ? 'time' : 'people'
                            } />
                            <span>{row.label}</span>
                          </dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>

                    {selectedFeature.teams?.length ? (
                      <section className={styles.teamsSection}>
                        <h4 className={styles.teamsSectionTitle}>地区内チーム一覧</h4>
                        <ul className={styles.teamsList}>
                          {selectedFeature.teams.map((team, index) => (
                            <li key={team.id || `${team.title || 'team'}-${index}`} className={styles.teamItem}>
                              <span
                                className={styles.teamStatusDot}
                                style={{
                                  backgroundColor: team.status === 'active' ? '#2563eb' :
                                    team.status === 'planned' ? '#d97706' :
                                    team.status === 'completed' ? '#16a34a' :
                                    team.status === 'needs_attention' ? '#dc2626' : '#94a3b8',
                                }}
                                aria-hidden="true"
                              />
                              <span className={styles.teamItemTitle}>{team.title || team.id || '活動'}</span>
                              <span className={styles.teamItemStatus}>{team.status || 'unknown'}</span>
                              {team.note ? <p className={styles.teamItemNote}>{team.note}</p> : null}
                              {team.activityType || team.operator ? (
                                <p className={styles.teamItemMeta}>
                                  {[team.activityType, team.operator].filter(Boolean).join(' / ')}
                                </p>
                              ) : null}
                              {team.updatedAt ? <p className={styles.teamItemTime}>{team.updatedAt}</p> : null}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    <button type="button" className={styles.primaryButton} onClick={handleFeatureAction}>
                      <span aria-hidden="true">⌖</span>
                      <span>{isTeamActivityFeature(selectedFeature) ? '活動エリアを地図で確認' : '避難所を地図で確認'}</span>
                    </button>
                  </>
                ) : (
                  <div className={styles.emptyFeature}>
                    <div className={styles.emptyFeatureIcon} aria-hidden="true">
                      <img src="/map/icons/team-standby.svg" alt="" />
                    </div>
                    <h3>選択中の情報はありません</h3>
                    <p>地図上の避難所または活動アイコンをクリックすると、ここに詳細が表示されます。</p>
                  </div>
                )}
              </section>

              <section className={styles.card}>
                <h2>レイヤー</h2>
                <div className={styles.layerToggleList}>
                  {layers.map((layer) => (
                    <div key={layer.id} className={styles.layerToggleItem} aria-disabled={layer.disabled || undefined}>
                      <div>
                        <div>{layer.label}</div>
                        {layer.note ? <small>{layer.note}</small> : null}
                      </div>
                      <button
                        type="button"
                        className={`${styles.toggle} ${layer.visible ? styles.toggleOn : ''}`}
                        disabled={layer.disabled}
                        onClick={() => toggleLayer(layer.id)}
                        aria-label={`${layer.label} を切り替え`}
                      >
                        <span className={styles.toggleThumb} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.card}>
                <h2>凡例</h2>
                <div className={styles.legendSection}>
                  <p className={styles.legendTitle}>避難所</p>
                  <ul className={styles.legendList}>
                    {EVACUATION_LEGEND.map((item) => (
                      <li key={item.key} className={styles.legendItem}>
                        <span className={styles.legendIcon} aria-hidden="true">
                          <img src={item.icon} alt="" />
                        </span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={styles.legendSection}>
                  <p className={styles.legendTitle}>チーム活動</p>
                  <ul className={styles.legendList}>
                    {TEAM_LEGEND.map((item) => (
                      <li key={item.key} className={styles.legendItem}>
                        <span className={styles.legendIcon} aria-hidden="true">
                          <img src={item.icon} alt="" />
                        </span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className={styles.card}>
                <h2>データ状態</h2>
                <dl className={styles.dataStatus}>
                  <dt>Runtime</dt>
                  <dd>{runtimeReady ? 'ready' : 'loading'}</dd>
                  <dt>接続</dt>
                  <dd>{isOnline === null ? '確認中' : isOnline ? 'オンライン' : 'オフライン'}</dd>
                  <dt>地域</dt>
                  <dd>{prefLabel || region || '—'}</dd>
                </dl>

                <div className={styles.dataStatusList}>
                  {Object.values(dataStatuses).length ? (
                    Object.values(dataStatuses).map((entry) => (
                      <div key={entry.key} className={styles.dataStatusEntry}>
                        <strong>{entry.label}</strong>
                        <span
                          className={[
                            styles.dataSourceBadge,
                            entry.source === 'network'
                              ? styles.dataSource_network
                              : entry.source === 'cache'
                                ? styles.dataSource_cache
                                : styles.dataSource_fallback,
                          ].join(' ')}
                        >
                          {sourceLabel(entry.source)}
                          {entry.online === false ? ' / オフライン' : ''}
                        </span>
                        {entry.message ? <small className={styles.dataStatusMessage}>{entry.message}</small> : null}
                      </div>
                    ))
                  ) : (
                    <p className={styles.featureMuted}>まだデータ状態は受信していません。</p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>読み込み中...</div>}>
      <MapPageInner />
    </Suspense>
  )
}
