import { useEffect, useMemo, useState } from 'react'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
import { currentMapRegionConfig, type CurrentMapRegionConfig } from '@/lib/currentMapRegion'

export type DataSourceType = 'network' | 'cache' | 'fallback' | 'loading' | 'none'

type FeatureCollection = {
  type: 'FeatureCollection'
  features: any[]
}

const EMPTY_FEATURE_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] }

function emptyFeatureCollection(): FeatureCollection {
  return EMPTY_FEATURE_COLLECTION
}

type CacheResult = { entries: any[]; cachedAt: string } | null

function readLayerCache(prefix: string, query: string): any[] | null {
  return readLayerCacheWithMeta(prefix, query)?.entries ?? null
}

function readLayerCacheWithMeta(prefix: string, query: string): CacheResult {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${prefix}${query}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.entries)) return null
    return { entries: parsed.entries, cachedAt: parsed.cachedAt ?? '' }
  } catch {
    return null
  }
}

function writeLayerCache(prefix: string, query: string, entries: any[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `${prefix}${query}`,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        entries,
      })
    )
  } catch {
    // ignore storage quota / private mode failures
  }
}

const SHELTER_CACHE_PREFIX = 'current-map:shelters:'
const TEAM_ACTIVITY_CACHE_PREFIX = 'current-map:team-activity:'

function readShelterCache(query: string) { return readLayerCache(SHELTER_CACHE_PREFIX, query) }
function writeShelterCache(query: string, entries: any[]) { writeLayerCache(SHELTER_CACHE_PREFIX, query, entries) }
function readTeamActivityCache(query: string) { return readLayerCache(TEAM_ACTIVITY_CACHE_PREFIX, query) }
function writeTeamActivityCache(query: string, entries: any[]) { writeLayerCache(TEAM_ACTIVITY_CACHE_PREFIX, query, entries) }

function buildViewportBBox(params: {
  lat: number
  lon: number
  latSpan?: number
  lonSpan?: number
  zoom?: number
}) {
  const fallbackLonSpan =
    typeof params.zoom === 'number' && Number.isFinite(params.zoom)
      ? 360 / (2 ** params.zoom)
      : NaN
  const fallbackLatSpan = Number.isFinite(fallbackLonSpan)
    ? fallbackLonSpan * 0.6
    : NaN
  const latSpan = Number(params.latSpan ?? fallbackLatSpan)
  const lonSpan = Number(params.lonSpan ?? fallbackLonSpan)
  if (!Number.isFinite(latSpan) || !Number.isFinite(lonSpan) || latSpan <= 0 || lonSpan <= 0) {
    return null
  }

  const padLat = latSpan * 0.2
  const padLon = lonSpan * 0.2
  const minLon = params.lon - lonSpan / 2 - padLon
  const maxLon = params.lon + lonSpan / 2 + padLon
  const minLat = params.lat - latSpan / 2 - padLat
  const maxLat = params.lat + latSpan / 2 + padLat
  return [minLon, minLat, maxLon, maxLat].join(',')
}

function resolveViewportLimit(currentZoom: number) {
  if (currentZoom >= 13) return 500
  if (currentZoom >= 11) return 300
  return 150
}

function buildShelterFeatureCollection(
  entries: any[],
  regionConfig: CurrentMapRegionConfig
): FeatureCollection {
  const features = Array.isArray(entries)
    ? entries.flatMap((entry: any) => {
        if (typeof entry?.lon !== 'number' || typeof entry?.lat !== 'number') return []
        return [{
          type: 'Feature',
          properties: {
            id: entry.id,
            title: entry.title,
            address: entry.address,
            capacity: entry.capacity,
            facilityType: entry.facilityType,
            barrierFree: entry.barrierFree,
            pets: entry.pets,
            updatedAt: entry.updatedAt,
            note: entry.note,
            status: entry.status,
            kind: entry.kind,
            source: regionConfig.sheltersSourceLabel,
          },
          geometry: {
            type: 'Point',
            coordinates: [entry.lon, entry.lat],
          },
        }]
      })
    : []

  return { type: 'FeatureCollection', features }
}

function parseShelterEntriesFromFallbackGeoJson(payload: any): any[] {
  const features = Array.isArray(payload?.features) ? payload.features : []
  return features.flatMap((feature: any, index: number) => {
    const props = feature?.properties ?? {}
    const coords = feature?.geometry?.coordinates
    const lon = Number(coords?.[0] ?? props.lon)
    const lat = Number(coords?.[1] ?? props.lat)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []

    const title = String(props.title ?? '').trim()
    const address = props.address ?? null
    const facilityType = props.facilityType ?? null
    const capacityRaw = props.capacity
    const capacity = Number.isFinite(Number(capacityRaw)) && Number(capacityRaw) >= 0 ? Number(capacityRaw) : null
    const note = props.note ?? null
    const id = String(props.id ?? '').trim() || `fallback-shelter-${index + 1}`

    return [{
      id,
      title: title || `避難所 ${index + 1}`,
      kind: 'shelter',
      lat,
      lon,
      status: 'unknown',
      address: address ? String(address) : null,
      capacity,
      facilityType: facilityType ? String(facilityType) : null,
      barrierFree: null,
      pets: null,
      updatedAt: null,
      note: note ? String(note) : null,
    }]
  })
}

async function loadShelterFallbackEntries(regionConfig: CurrentMapRegionConfig): Promise<any[]> {
  const response = await fetch(regionConfig.sheltersFallbackGeoJsonUrl, { cache: 'force-cache' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const payload = await response.json()
  return parseShelterEntriesFromFallbackGeoJson(payload)
}

async function loadTeamActivityFallbackEntries(regionConfig: CurrentMapRegionConfig): Promise<any[]> {
  const response = await fetch(regionConfig.teamActivityFallbackJsonUrl, { cache: 'force-cache' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const payload = await response.json()
  return Array.isArray(payload) ? payload : []
}

function matchesPrefecture(value: unknown, selectedPrefecture?: string | null) {
  const pref = String(selectedPrefecture || '').trim()
  if (!pref) return true
  const text = String(value || '').trim()
  return text.startsWith(pref) || text.includes(pref)
}

function buildTeamActivityFeatureCollection(entries: any[]): FeatureCollection {
  const features = Array.isArray(entries)
    ? entries.flatMap((entry: any) => {
        if (typeof entry?.lon !== 'number' || typeof entry?.lat !== 'number') return []
        return [{
          type: 'Feature',
          properties: {
            id: entry.id,
            title: entry.title,
            teamId: entry.teamId,
            teamName: entry.teamName,
            activityType: entry.activityType,
            status: entry.status,
            operator: entry.operator,
            area: entry.area,
            note: entry.note,
            updatedAt: entry.updatedAt,
          },
          geometry: {
            type: 'Point',
            coordinates: [entry.lon, entry.lat],
          },
        }]
      })
    : []

  return { type: 'FeatureCollection', features }
}

function buildDistrictCentroidFeatureCollection(districtDict: Record<string, any>): FeatureCollection {
  const features = Object.values(districtDict || {}).flatMap((entry: any) => {
    const lon = Number(entry?.centroid_lon)
    const lat = Number(entry?.centroid_lat)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return []
    return [{
      type: 'Feature',
      properties: {
        key_code: entry?.key_code,
        pref: entry?.pref,
        city: entry?.city,
        ward: entry?.ward,
        district: entry?.district,
        district_norm: entry?.district_norm,
        name: [entry?.city, entry?.ward, entry?.district_norm || entry?.district].filter(Boolean).join(' '),
      },
      geometry: {
        type: 'Point',
        coordinates: [lon, lat],
      },
    }]
  })

  return { type: 'FeatureCollection', features }
}

export function useCurrentMapLayerData(params: {
  evacuationEnabled: boolean
  teamActivityEnabled: boolean
  baseAreaEnabled: boolean
  currentZoom: number
  currentViewport?: {
    lat: number
    lon: number
    latSpan?: number
    lonSpan?: number
  } | null
  evacuationMinZoom?: number
  teamActivityMinZoom?: number
  baseAreaMinZoom?: number
  regionConfig?: CurrentMapRegionConfig
  selectedPrefecture?: string | null
  selectedMunicipalityCode?: string | null
}) {
  const {
    evacuationEnabled,
    teamActivityEnabled,
    baseAreaEnabled,
    currentZoom,
    currentViewport,
    evacuationMinZoom = 0,
    teamActivityMinZoom = 0,
    baseAreaMinZoom = 0,
    regionConfig = currentMapRegionConfig,
    selectedPrefecture,
    selectedMunicipalityCode,
  } = params
  const debouncedZoom = useDebouncedValue(currentZoom, 350)
  const viewportKey = currentViewport
    ? `${currentViewport.lat},${currentViewport.lon},${currentViewport.latSpan ?? ''},${currentViewport.lonSpan ?? ''}`
    : ''
  const debouncedViewportKey = useDebouncedValue(viewportKey, 350)
  const debouncedViewport = useMemo(
    () => (debouncedViewportKey ? currentViewport ?? null : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debouncedViewportKey]
  )

  const [sheltersGeoJSON, setSheltersGeoJSON] = useState<FeatureCollection>(emptyFeatureCollection)
  const [teamActivityGeoJSON, setTeamActivityGeoJSON] = useState<FeatureCollection>(emptyFeatureCollection)
  const [baseAreaCentroidGeoJSON, setBaseAreaCentroidGeoJSON] = useState<FeatureCollection>(emptyFeatureCollection)
  const [shelterSource, setShelterSource] = useState<DataSourceType>('none')
  const [teamActivitySource, setTeamActivitySource] = useState<DataSourceType>('none')
  const [shelterFetchedAt, setShelterFetchedAt] = useState<string | null>(null)
  const [teamActivityFetchedAt, setTeamActivityFetchedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!evacuationEnabled || debouncedZoom < evacuationMinZoom) {
      setSheltersGeoJSON(emptyFeatureCollection())
      setShelterSource('none')
      setShelterFetchedAt(null)
      return
    }

    let cancelled = false
    setShelterSource((prev) => prev === 'none' ? 'loading' : prev)
    const resolvedViewportBBox = debouncedViewport
      ? buildViewportBBox({ ...debouncedViewport, zoom: debouncedZoom })
      : null
    const limit = resolveViewportLimit(debouncedZoom)
    const params = new URLSearchParams({
      limit: String(limit),
      region: regionConfig.regionId,
    })
    if (resolvedViewportBBox) params.set('bbox', resolvedViewportBBox)
    if (regionConfig.regionId === 'japan' && selectedPrefecture) params.set('prefecture', selectedPrefecture)
    if (regionConfig.regionId !== 'japan' && selectedMunicipalityCode && /^\d{5}$/.test(selectedMunicipalityCode)) {
      params.set('muni', selectedMunicipalityCode)
    }

    const shelterQuery = params.toString()
    const applyEntries = (entries: any[]) => {
      const filteredEntries =
        regionConfig.regionId === 'japan' && selectedPrefecture
          ? (Array.isArray(entries) ? entries.filter((entry: any) => matchesPrefecture(entry?.address, selectedPrefecture)) : [])
          : entries
      setSheltersGeoJSON(buildShelterFeatureCollection(filteredEntries, regionConfig))
    }

    fetch(`/api/shelters?${shelterQuery}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((entries) => {
        if (cancelled) return
        const safeEntries = Array.isArray(entries) ? entries : []
        const now = new Date().toISOString()
        writeShelterCache(shelterQuery, safeEntries)
        applyEntries(safeEntries)
        setShelterSource('network')
        setShelterFetchedAt(now)
      })
      .catch((error) => {
        if (cancelled) return
        const cached = readLayerCacheWithMeta(SHELTER_CACHE_PREFIX, shelterQuery)
        if (cached) {
          console.warn('[Evacuation] using cached shelters:', error?.message || error)
          applyEntries(cached.entries)
          setShelterSource('cache')
          setShelterFetchedAt(cached.cachedAt || null)
          return
        }
        loadShelterFallbackEntries(regionConfig)
          .then((fallbackEntries) => {
            if (cancelled) return
            console.warn('[Evacuation] using fallback shelters:', error?.message || error)
            applyEntries(fallbackEntries)
            setShelterSource('fallback')
            setShelterFetchedAt(null)
          })
          .catch((fallbackError) => {
            if (cancelled) return
            console.warn(
              '[Evacuation] shelters fetch skipped:',
              error?.message || error,
              fallbackError?.message || fallbackError
            )
            setSheltersGeoJSON(emptyFeatureCollection())
            setShelterSource('none')
            setShelterFetchedAt(null)
          })
      })

    return () => {
      cancelled = true
    }
  }, [debouncedViewport, debouncedZoom, evacuationEnabled, evacuationMinZoom, regionConfig, selectedPrefecture, selectedMunicipalityCode])

  useEffect(() => {
    if (!teamActivityEnabled || debouncedZoom < teamActivityMinZoom) {
      setTeamActivityGeoJSON(emptyFeatureCollection())
      setTeamActivitySource('none')
      setTeamActivityFetchedAt(null)
      return
    }

    let cancelled = false
    setTeamActivitySource((prev) => prev === 'none' ? 'loading' : prev)
    const viewportBBox = debouncedViewport
      ? buildViewportBBox({ ...debouncedViewport, zoom: debouncedZoom })
      : null
    const limit = resolveViewportLimit(debouncedZoom)
    const params = new URLSearchParams({
      limit: String(limit),
      region: regionConfig.regionId,
    })
    if (viewportBBox) params.set('bbox', viewportBBox)

    const teamQuery = params.toString()
    fetch(`/api/team-activity?${teamQuery}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((entries) => {
        if (cancelled) return
        const safeEntries = Array.isArray(entries) ? entries : []
        const now = new Date().toISOString()
        writeTeamActivityCache(teamQuery, safeEntries)
        setTeamActivityGeoJSON(buildTeamActivityFeatureCollection(safeEntries))
        setTeamActivitySource('network')
        setTeamActivityFetchedAt(now)
      })
      .catch((error) => {
        if (cancelled) return
        const cached = readLayerCacheWithMeta(TEAM_ACTIVITY_CACHE_PREFIX, teamQuery)
        if (cached) {
          console.warn('[TeamActivity] using cached data:', error?.message || error)
          setTeamActivityGeoJSON(buildTeamActivityFeatureCollection(cached.entries))
          setTeamActivitySource('cache')
          setTeamActivityFetchedAt(cached.cachedAt || null)
          return
        }
        loadTeamActivityFallbackEntries(regionConfig)
          .then((fallbackEntries) => {
            if (cancelled) return
            console.warn('[TeamActivity] using fallback data:', error?.message || error)
            setTeamActivityGeoJSON(buildTeamActivityFeatureCollection(fallbackEntries))
            setTeamActivitySource('fallback')
            setTeamActivityFetchedAt(null)
          })
          .catch((fallbackError) => {
            if (cancelled) return
            console.warn(
              '[TeamActivity] fetch failed:',
              error?.message || error,
              fallbackError?.message || fallbackError
            )
            setTeamActivityGeoJSON(emptyFeatureCollection())
            setTeamActivitySource('none')
            setTeamActivityFetchedAt(null)
          })
      })

    return () => {
      cancelled = true
    }
  }, [debouncedViewport, debouncedZoom, regionConfig, teamActivityEnabled, teamActivityMinZoom])

  useEffect(() => {
    if (!baseAreaEnabled || currentZoom < baseAreaMinZoom || regionConfig.regionId === 'japan') {
      setBaseAreaCentroidGeoJSON(emptyFeatureCollection())
      return
    }

    let cancelled = false
    fetch(regionConfig.districtDictionaryUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((payload) => {
        if (cancelled) return
        setBaseAreaCentroidGeoJSON(buildDistrictCentroidFeatureCollection(payload))
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('[BaseArea] district centroids fetch skipped:', error?.message || error)
        setBaseAreaCentroidGeoJSON(emptyFeatureCollection())
      })

    return () => {
      cancelled = true
    }
  }, [baseAreaEnabled, baseAreaMinZoom, currentZoom, regionConfig])

  const dataSourceStatus = useMemo(() => ({
    shelter: { source: shelterSource, fetchedAt: shelterFetchedAt },
    teamActivity: { source: teamActivitySource, fetchedAt: teamActivityFetchedAt },
  }), [shelterSource, shelterFetchedAt, teamActivitySource, teamActivityFetchedAt])

  return {
    sheltersGeoJSON,
    teamActivityGeoJSON,
    baseAreaCentroidGeoJSON,
    dataSourceStatus,
  }
}
