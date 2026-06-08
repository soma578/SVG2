import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type MapRegionMeta = {
  id: string
  prefCode?: string
  label?: string
  prefecture?: string
  runtimeConfigUrl?: string
  municipalityIndexUrl?: string
  evacuationDataUrl?: string
  teamActivityDataUrl?: string
  summary?: { evacuationCount?: number; teamActivityCount?: number }
  dataStatus?: string
}

let cachedRegions: Map<string, MapRegionMeta> | null = null

const regionIndexPath = () => join(process.cwd(), '..', 'map', 'regions', 'index.json')

export const getMapRegionMeta = (regionId: string) => {
  if (!cachedRegions) {
    const text = readFileSync(regionIndexPath(), 'utf8')
    const parsed = JSON.parse(text) as { regions?: MapRegionMeta[] }
    cachedRegions = new Map((parsed.regions ?? []).map((region) => [region.id, region]))
  }
  return cachedRegions.get(regionId) ?? null
}

export const getAllMapRegions = (): MapRegionMeta[] => {
  if (!cachedRegions) getMapRegionMeta('')
  return Array.from(cachedRegions?.values() ?? [])
}

export const regionIdForPrefCode = (prefCode: string): string | null => {
  const padded = String(prefCode || '').padStart(2, '0')
  for (const region of getAllMapRegions()) {
    if (region.prefCode && String(region.prefCode).padStart(2, '0') === padded) return region.id
  }
  return null
}

export const clearMapRegionMetaCache = () => {
  cachedRegions = null
}
