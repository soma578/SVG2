'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './page.module.css'
import PrefSelectMap from './PrefSelectMap'
import MuniSelectMap from './MuniSelectMap'

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

const serializeViewport = (viewport: GeoViewport | null) => {
  if (!viewport) return ''
  return [
    viewport.lat,
    viewport.lon,
    viewport.latSpan,
    viewport.lonSpan,
  ].map((value) => String(value)).join(',')
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
const MAP_RUNTIME_VERSION = 'native-v4'

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

const ShieldBrandIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
  </svg>
)

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
  const [muniSearch, setMuniSearch] = useState('')
  const [muniSuggestOpen, setMuniSuggestOpen] = useState(false)
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
  const [layerDetailHtml, setLayerDetailHtml] = useState<string | null>(null)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [resolvedViewport, setResolvedViewport] = useState<GeoViewport | null>(null)
  const [mapViewport, setMapViewport] = useState<GeoViewport | null>(null)
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
      .catch((err) => {
        console.error('[page] step2 fetch failed', err)
        setMunicipalities([])
      })
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
        const muni = data.municipalities?.find((m) => m.id === municipalityId)
        setPrefLabel(data.label ?? region)
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
      .catch((err) => {
        console.error('[page] step3 fetch failed', err)
      })
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
    const initialViewport = serializeViewport(resolvedViewport)
    if (initialViewport) urlParams.set('initialViewport', initialViewport)
    return `/map/webapp/current-map.html?${urlParams.toString()}`
  }, [step, region, municipalityId, resolvedMuniCodes, resolvedViewport])

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
        type === 'runtime:dataStatus' ||
        type === 'runtime:layerDetailHtml'
      if (!runtimeMessage) return
      if (!fromMapFrame && !sameOrigin && !nullOrigin) return

      if (type === 'runtime:ready') {
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

      if (type === 'runtime:layerDetailHtml') {
        const payload = objectValue(message.payload)
        const html = stringValue(payload.html)
        setLayerDetailHtml(html || null)
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
    const latSpan = clampViewportSpan(Math.min((base?.latSpan ?? 0.08) * 0.32, 0.045), 0.012, 0.08)
    const lonSpan = clampViewportSpan(Math.min((base?.lonSpan ?? 0.1) * 0.32, 0.06), 0.012, 0.1)
    setMapViewport({ lat, lon, latSpan, lonSpan })
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'map:focusLocation', location: { lat, lon, latSpan, lonSpan } },
      '*',
    )
    setLocationStatus('現在地へ移動しました')
  }, [resolvedViewport])

  useEffect(() => {
    if (!runtimeReady) return
    const pending = pendingCurrentLocationRef.current
    if (!pending) return
    if (pending.region !== region || pending.municipalityId !== municipalityId) return
    pendingCurrentLocationRef.current = null
    focusCurrentLocationOnce(pending.lat, pending.lon)
  }, [focusCurrentLocationOnce, iframeSrc, municipalityId, region, runtimeReady])

  const zoomViewport = useCallback((direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 0.72 : 1.3888889
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      { type: 'map:zoom', factor },
      '*',
    )
    setShareStatus('')
    setLocationStatus('')
  }, [])

  const resetViewport = useCallback(() => {
    const base = resolvedViewport
    if (!base) return
    postViewport(base)
    // Also tell the iframe to reset to its initial view
    iframeRef.current?.contentWindow?.postMessage({ type: 'map:resetView' }, '*')
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
          type: 'map:setLayerVisible',
          layerKey: layerId,
          visible: target.visible,
        }, window.location.origin)
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!runtimeReady || !iframeRef.current?.contentWindow) return
    layers.forEach((layer) => {
      if (layer.disabled) return
      iframeRef.current?.contentWindow?.postMessage({
        type: 'map:setLayerVisible',
        layerKey: layer.id,
        visible: layer.visible,
      }, window.location.origin)
    })
  }, [layers, runtimeReady])

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

  // Municipality autocomplete suggestions
  const muniSuggestions = useMemo(() => {
    const q = muniSearch.trim()
    if (!q) return []
    return municipalities
      .filter((m) => m.label.includes(q) && m.dataStatus !== 'empty')
      .slice(0, 8)
  }, [municipalities, muniSearch])

  // Top bar copy
  const topBarTitle = '全国防災マップ'

  const topBarSub =
    step === 'prefecture' ? '都道府県を選択' :
    step === 'municipality' ? `${prefLabel || region || ''}の市区町村を選択` :
    `${prefLabel || region || ''}　${muniLabel || municipalityId || ''}　避難所${muniShelterCount}件・活動情報${muniTeamCount}件`

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarBrand}>
          <div className={styles.topBarIcon} aria-hidden="true">
            <ShieldBrandIcon />
          </div>
          <div className={styles.topBarTitleGroup}>
            <div className={styles.topBarTitle}>{topBarTitle}</div>
            {step === 'map' ? (
              <>
                <div className={styles.topBarSubtitle}>
                  {`${prefLabel || region || ''}　${muniLabel || municipalityId || ''}`}
                </div>
                <div className={styles.topBarSubtitle2}>
                  {`避難所${muniShelterCount}件・活動情報${muniTeamCount}件`}
                </div>
              </>
            ) : (
              <div className={styles.topBarSubtitle}>{topBarSub}</div>
            )}
          </div>
        </div>

        <nav className={styles.topBarTrail} aria-label="現在の選択階層">
          <button type="button" className={styles.topBarCrumb} onClick={() => router.push('/map')}>
            <span aria-hidden="true">⌂</span>
            <span>全国</span>
          </button>
          {(step === 'municipality' || step === 'map') && (
            <>
              <span className={styles.topBarCrumbSep} aria-hidden="true">›</span>
              <button
                type="button"
                className={styles.topBarCrumb}
                onClick={() => router.push(`/map?region=${region}`)}
              >
                {prefLabel || region}
              </button>
            </>
          )}
          {step === 'map' && (
            <>
              <span className={styles.topBarCrumbSep} aria-hidden="true">›</span>
              <button type="button" className={styles.topBarCrumb} disabled>
                {muniLabel || municipalityId}
              </button>
            </>
          )}
        </nav>

        <div className={styles.topBarActions}>
          {step === 'map' && (
            <>
              <button type="button" className={styles.topBarBtn} onClick={locateCurrentPosition}>
                現在地
              </button>
              <button type="button" className={styles.topBarBtn} onClick={() => setShareOpen((prev) => !prev)}>
                共有
              </button>
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
              {/* Floating guide card */}
              <div className={styles.mapInfoFloat}>
                <div className={styles.mapInfoFloatIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div>
                  <div className={styles.mapInfoFloatTitle}>都道府県を選択してください</div>
                  <div className={styles.mapInfoFloatText}>地図上の都道府県をクリックすると、<br />その地域の市区町村マップが表示されます。</div>
                </div>
              </div>
              {/* Map compass */}
              <div className={styles.mapCompass} aria-hidden="true">N</div>
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
            <aside className={styles.selectInfoPanel}>
              <div className={styles.selectStepHeader}>
                <div className={styles.selectStepBadge}>STEP 1 / 2</div>
                <div className={styles.selectStepTitle}>都道府県を選択</div>
                <div className={styles.selectStepDesc}>マップ上の都道府県をクリックしてください</div>
              </div>

              {hoveredPrefLabel ? (
                <div className={styles.selectInfoCard}>
                  <div className={styles.selectInfoTitle}>{hoveredPrefLabel}</div>
                  <div className={styles.selectInfoMeta}>クリックして選択</div>
                  <div className={styles.selectInfoHint}>市区町村の選択に進みます</div>
                </div>
              ) : (
                <div className={styles.selectInfoEmpty}>
                  <p>県にカーソルを合わせてください</p>
                  <p className={styles.selectInfoEmptyHint}>色の付いた都道府県が選択可能です</p>
                </div>
              )}

              <div className={styles.selectLegend}>
                <div className={styles.selectLegendRow}>
                  <span className={styles.selectLegendSwatch} style={{ background: 'rgba(147,210,253,0.75)' }} />
                  <span>対応済み（クリック可能）</span>
                </div>
                <div className={styles.selectLegendRow}>
                  <span className={styles.selectLegendSwatch} style={{ background: 'rgba(226,232,240,0.55)' }} />
                  <span>未対応</span>
                </div>
              </div>

              <div className={styles.selectTip}>
                <span className={styles.selectTipIcon}>💡</span>
                <span>県を選択すると、市区町村マップに進みます</span>
              </div>
            </aside>
          </div>
        )}

        {step === 'municipality' && (() => {
          const prefCode = prefectures.find((p) => p.id === region)?.prefCode || ''
          const availableCount = municipalities.filter(m => m.dataStatus === 'available').length
          const partialCount  = municipalities.filter(m => m.dataStatus === 'partial').length
          const emptyCount    = municipalities.filter(m => m.dataStatus === 'empty').length
          const totalShelters = municipalities.reduce((acc, m) => acc + (m.shelterCount ?? 0), 0)
          return (
            <div className={styles.selectLayout}>
              <div className={styles.selectMapPanel}>
                {/* Compass */}
                <div className={styles.mapCompass} aria-hidden="true">N</div>
                {(!prefCode || loading) ? (
                  <div className={styles.loading}>読み込み中...</div>
                ) : (
                  <MuniSelectMap
                    prefCode={prefCode}
                    municipalities={municipalities}
                    hoveredCode={hoveredMuniCode}
                    onSelect={handleMuniSelect}
                    onHover={handleMuniHover}
                  />
                )}
              </div>
              <aside className={styles.selectInfoPanel}>
                <div className={styles.selectStepHeader}>
                  <div className={styles.selectStepBadge}>STEP 2 / 2</div>
                  <div className={styles.selectStepTitle}>{prefLabel || region || '市区町村を選択'}</div>
                  <div className={styles.selectStepDesc}>マップ上の市区町村をクリックしてください</div>
                </div>

                {/* Municipality name autocomplete */}
                <div className={styles.muniSearchWrap}>
                  <input
                    type="text"
                    className={styles.muniSearchInput}
                    placeholder="名前で検索..."
                    value={muniSearch}
                    onChange={(e) => { setMuniSearch(e.target.value); setMuniSuggestOpen(true) }}
                    onFocus={() => setMuniSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setMuniSuggestOpen(false), 150)}
                  />
                  {muniSearch && muniSuggestOpen && (
                    <ul className={styles.muniSuggestList} role="listbox">
                      {muniSuggestions.length > 0 ? muniSuggestions.map((m) => (
                        <li
                          key={m.id}
                          className={styles.muniSuggestItem}
                          role="option"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleMuniSelect(m.id, m.municipalityCodes || [m.id])
                            setMuniSearch('')
                            setMuniSuggestOpen(false)
                          }}
                        >
                          <span className={styles.muniSuggestLabel}>{m.label}</span>
                          {(m.shelterCount ?? 0) > 0 && (
                            <span className={styles.muniSuggestMeta}>避難所{m.shelterCount}件</span>
                          )}
                        </li>
                      )) : (
                        <li className={styles.muniSuggestNone}>一致する市区町村がありません</li>
                      )}
                    </ul>
                  )}
                </div>

                {hoveredMuniLabel ? (
                  <div className={styles.selectInfoCard}>
                    <div className={styles.selectInfoTitle}>{hoveredMuniLabel}</div>
                    <div className={styles.selectInfoMeta}>
                      避難所 {hoveredMuniShelters ?? 0}件
                      {(hoveredMuniTeams ?? 0) > 0 ? `・活動情報 ${hoveredMuniTeams}件` : ''}
                    </div>
                    <div className={styles.selectInfoHint}>クリックして地図を表示</div>
                  </div>
                ) : null}

                {/* Stats */}
                {municipalities.length > 0 && (
                  <div className={styles.muniStatsGrid}>
                    <div className={styles.muniStatCard}>
                      <div className={styles.muniStatIconWrap}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.muniStatSvg}>
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                      </div>
                      <div className={styles.muniStatValue}>{availableCount + partialCount}</div>
                      <div className={styles.muniStatLabel}>対応市区町村</div>
                    </div>
                    <div className={styles.muniStatCard}>
                      <div className={styles.muniStatIconWrap}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${styles.muniStatSvg} ${styles.muniStatSvgGreen}`}>
                          <circle cx="12" cy="5" r="2" />
                          <path d="M12 7l-3 8h2l1-3 2 3h2l-3-8z" />
                          <path d="M9 15l-1 4h8l-1-4" />
                        </svg>
                      </div>
                      <div className={`${styles.muniStatValue} ${styles.muniStatValueGreen}`}>{totalShelters}</div>
                      <div className={styles.muniStatLabel}>避難所総数</div>
                    </div>
                  </div>
                )}

                {/* Detailed legend with counts */}
                <div className={styles.muniDetailLegend}>
                  <div className={styles.muniDetailLegendTitle}>{prefLabel || region}の状況</div>
                  <div className={styles.muniDetailLegendItem}>
                    <div className={styles.muniDetailLegendMain}>
                      <span className={styles.selectLegendSwatch} style={{ background: 'rgba(147,210,253,0.65)' }} />
                      <span>対応済み（クリック可能）</span>
                      <span className={styles.muniDetailCount}>{availableCount}市町村</span>
                    </div>
                    <div className={styles.muniDetailDesc}>詳細地図が表示されます</div>
                  </div>
                  <div className={styles.muniDetailLegendItem}>
                    <div className={styles.muniDetailLegendMain}>
                      <span className={styles.selectLegendSwatch} style={{ background: 'rgba(253,230,138,0.65)' }} />
                      <span>一部対応</span>
                      <span className={styles.muniDetailCount}>{partialCount}市町村</span>
                    </div>
                    <div className={styles.muniDetailDesc}>一部のデータが利用可能な市町村</div>
                  </div>
                  <div className={styles.muniDetailLegendItem}>
                    <div className={styles.muniDetailLegendMain}>
                      <span className={styles.selectLegendSwatch} style={{ background: 'rgba(226,232,240,0.5)' }} />
                      <span>未対応</span>
                      <span className={styles.muniDetailCount}>{emptyCount}市町村</span>
                    </div>
                    <div className={styles.muniDetailDesc}>データ未整備の市町村</div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.selectBackBtn}
                  onClick={() => router.push('/map')}
                >
                  ← 県を変更する
                </button>
              </aside>
            </div>
          )
        })()}

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
              <div className={styles.mapControls} aria-label="地図操作">
                <button
                  type="button"
                  className={styles.mapControlButton}
                  onClick={() => zoomViewport('in')}
                  aria-label="拡大"
                  disabled={!mapViewport && !resolvedViewport}
                >
                  ＋
                </button>
                <button
                  type="button"
                  className={styles.mapControlButton}
                  onClick={() => zoomViewport('out')}
                  aria-label="縮小"
                  disabled={!mapViewport && !resolvedViewport}
                >
                  −
                </button>
                <button
                  type="button"
                  className={styles.mapControlButton}
                  onClick={resetViewport}
                  aria-label="初期表示に戻る"
                  disabled={!resolvedViewport}
                >
                  ⌂
                </button>
              </div>
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

              {layerDetailHtml ? (
                <div
                  className={styles.lawaDetailSlot}
                  onClick={(e) => {
                    if ((e.target as Element).closest('[data-lawa-close]')) setLayerDetailHtml(null)
                  }}
                  dangerouslySetInnerHTML={{ __html: layerDetailHtml }}
                />
              ) : (
                <div className={styles.emptyFeature}>
                  <div className={styles.emptyFeatureIcon} aria-hidden="true">
                    <img src="/map/icons/team-standby.svg" alt="" />
                  </div>
                  <h3>選択中の情報はありません</h3>
                  <p>地図上の避難所または活動アイコンをクリックすると、ここに詳細が表示されます。</p>
                </div>
              )}

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

              <a href="/admin/dashboard" className={styles.adminLink}>
                管理者画面へ
              </a>
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
