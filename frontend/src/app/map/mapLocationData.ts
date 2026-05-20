import { fetchJsonWithRuntimeCache, fetchTextWithRuntimeCache } from './mapData'
import type { GeoViewport, MunicipalityEntry, PrefectureEntry } from './mapTypes'
import { viewportContains, viewportScore, parsePathRings, pointInOverviewPath } from './mapGeo'
import type { OverviewPath } from './mapGeo'

export type RegionMunicipalityIndex = {
  id: string
  prefCode?: string
  label: string
  municipalityIndexUrl: string
  municipalities: MunicipalityEntry[]
}

export type LocationCandidate = {
  region: PrefectureEntry
  municipality: MunicipalityEntry
  score: number
  contains: boolean
}

const regionIndexPromiseCache = new Map<string, Promise<RegionMunicipalityIndex | null>>()
const overviewPathPromiseCache = new Map<string, Promise<OverviewPath[] | null>>()
let regionIndexListPromise: Promise<PrefectureEntry[] | null> | null = null

export const loadRegionIndexList = async (): Promise<PrefectureEntry[] | null> => {
  if (!regionIndexListPromise) {
    regionIndexListPromise = fetchJsonWithRuntimeCache<{ regions: PrefectureEntry[] }>('/map/regions/index.json')
      .then(({ data }) => data.regions ?? [])
      .catch(() => null)
  }
  return regionIndexListPromise
}

export const loadRegionMunicipalityIndex = async (region: PrefectureEntry): Promise<RegionMunicipalityIndex | null> => {
  const cacheKey = region.id
  if (!regionIndexPromiseCache.has(cacheKey)) {
    regionIndexPromiseCache.set(
      cacheKey,
      fetchJsonWithRuntimeCache<{ label: string; municipalities: MunicipalityEntry[] }>(
        region.municipalityIndexUrl || `/map/regions/${encodeURIComponent(region.id)}/municipalities.json`,
      ).then(({ data }) => ({
        id: region.id,
        prefCode: region.prefCode,
        label: data.label || region.label,
        municipalityIndexUrl: region.municipalityIndexUrl || `/map/regions/${encodeURIComponent(region.id)}/municipalities.json`,
        municipalities: data.municipalities ?? [],
      })).catch(() => null),
    )
  }
  return regionIndexPromiseCache.get(cacheKey) ?? null
}

export const loadPrefOverviewPaths = (region: PrefectureEntry): Promise<OverviewPath[] | null> | null => {
  const prefCode = String(region.prefCode || '').padStart(2, '0')
  if (!/^\d{2}$/.test(prefCode)) return null
  if (!overviewPathPromiseCache.has(prefCode)) {
    overviewPathPromiseCache.set(
      prefCode,
      fetchTextWithRuntimeCache(`/map/layers/overview/pref/${prefCode}.svg`)
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
          console.warn('[mapLocationData] pref overview polygon fallback', { prefCode, error })
          return null
        }),
    )
  }
  return overviewPathPromiseCache.get(prefCode) ?? null
}

const municipalityCodesFor = (municipality: MunicipalityEntry): Set<string> => {
  const codes = new Set<string>()
  if (municipality.id) codes.add(municipality.id)
  if (municipality.displayCode) codes.add(municipality.displayCode)
  municipality.municipalityCodes?.forEach((code) => { if (code) codes.add(code) })
  return codes
}

const refineLocationTargetByPolygon = async (
  lat: number,
  lon: number,
  candidates: LocationCandidate[],
): Promise<LocationCandidate | null> => {
  const primary = candidates.filter((c) => c.contains).slice(0, 80)
  const search = primary.length > 0 ? primary : candidates.slice(0, 24)
  const regions = Array.from(new Map(search.map((c) => [c.region.id, c.region])).values())

  for (const region of regions) {
    const paths = await loadPrefOverviewPaths(region)
    if (!paths) continue
    for (const candidate of search.filter((c) => c.region.id === region.id)) {
      const codes = municipalityCodesFor(candidate.municipality)
      if (paths.some((path) => codes.has(path.code) && pointInOverviewPath(lon, lat, path))) {
        return candidate
      }
    }
  }
  return null
}

export const findLocationTarget = async (lat: number, lon: number): Promise<LocationCandidate | null> => {
  const regions = await loadRegionIndexList()
  if (!regions || regions.length === 0) return null

  const loaded = await Promise.all(regions.map((region) => loadRegionMunicipalityIndex(region)))
  const candidates: LocationCandidate[] = []

  loaded.forEach((regionData, index) => {
    if (!regionData) return
    const region = regions[index]
    regionData.municipalities.forEach((municipality) => {
      const viewport = municipality.viewport as GeoViewport | undefined
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
  return (await refineLocationTargetByPolygon(lat, lon, candidates)) ?? candidates[0]
}
