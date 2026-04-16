import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { searchShelters, searchTeamActivities } from '@/lib/datasets'

type MunicipalitySearchEntry = {
  id: string
  name: string
  lat: number
  lon: number
  latSpan?: number
  lonSpan?: number
  zoom?: number
  address?: string
  subtitle?: string
  summary?: string
  source?: string
  searchTokens?: string
}

const resolveProjectPath = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url))

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

let japanMunicipalitySearchIndexPromise: Promise<MunicipalitySearchEntry[]> | null = null

function collectLngLatPairs(value: unknown, pairs: Array<[number, number]>) {
  if (!Array.isArray(value) || value.length === 0) return
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    const lon = Number(value[0])
    const lat = Number(value[1])
    if (Number.isFinite(lon) && Number.isFinite(lat)) pairs.push([lon, lat])
    return
  }
  value.forEach((item) => collectLngLatPairs(item, pairs))
}

function getGeometryCenter(geometry: any) {
  const pairs: Array<[number, number]> = []
  collectLngLatPairs(geometry?.coordinates, pairs)
  if (pairs.length === 0) return null

  let minLon = pairs[0][0]
  let maxLon = pairs[0][0]
  let minLat = pairs[0][1]
  let maxLat = pairs[0][1]
  for (const [lon, lat] of pairs) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  return {
    lon: (minLon + maxLon) / 2,
    lat: (minLat + maxLat) / 2,
  }
}

function getGeometrySpan(geometry: any) {
  const pairs: Array<[number, number]> = []
  collectLngLatPairs(geometry?.coordinates, pairs)
  if (pairs.length === 0) return null

  let minLon = pairs[0][0]
  let maxLon = pairs[0][0]
  let minLat = pairs[0][1]
  let maxLat = pairs[0][1]
  for (const [lon, lat] of pairs) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  const rawLonSpan = maxLon - minLon
  const rawLatSpan = maxLat - minLat
  const lonSpan = Math.max(rawLonSpan * 1.25, 0.08)
  const latSpan = Math.max(rawLatSpan * 1.25, 0.06)
  const span = Math.max(lonSpan, latSpan)
  const zoom = Math.min(11, Math.max(6, Math.log2(360 / span)))

  return {
    lonSpan,
    latSpan,
    zoom,
  }
}

async function loadJapanMunicipalitySearchIndex(): Promise<MunicipalitySearchEntry[]> {
  if (!japanMunicipalitySearchIndexPromise) {
    const indexPath = resolveProjectPath('../../../../../frontend/public/search-index/japan-municipalities.json')
    japanMunicipalitySearchIndexPromise = readJsonFile<MunicipalitySearchEntry[]>(indexPath).then((entries) =>
      Array.isArray(entries) ? entries : []
    )
  }
  return japanMunicipalitySearchIndexPromise
}

async function searchMunicipalities(regionId: string | null, q: string, limit: number) {
  if (regionId !== 'japan') return []

  const entries = await loadJapanMunicipalitySearchIndex()
  const query = q.trim().toLowerCase()
  const startsWithMatches: MunicipalitySearchEntry[] = []
  const includesMatches: MunicipalitySearchEntry[] = []

  for (const entry of entries) {
    const searchable = String(entry.searchTokens || [entry.name, entry.address, entry.subtitle, entry.id].filter(Boolean).join(' ')).toLowerCase()
    if (!searchable.includes(query)) continue

    if (
      entry.name?.toLowerCase().startsWith(query) ||
      entry.address?.toLowerCase().startsWith(query) ||
      entry.subtitle?.toLowerCase().startsWith(query)
    ) {
      startsWithMatches.push(entry)
    } else {
      includesMatches.push(entry)
    }

    if (startsWithMatches.length + includesMatches.length >= limit * 3) break
  }

  return [...startsWithMatches, ...includesMatches].slice(0, limit).map(({ searchTokens: _searchTokens, ...entry }) => entry)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const regionId = searchParams.get('region')
    const limitParam = Number(searchParams.get('limit') || '10')
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10

    if (!q || q.trim().length < 2) {
      return NextResponse.json({
        municipalities: [],
        shelters: [],
        teamActivities: [],
      })
    }

    const [municipalities, shelters, teamActivities] = await Promise.all([
      searchMunicipalities(regionId, q, limit),
      searchShelters({ q, limit, regionId }),
      searchTeamActivities({ q, limit, regionId }),
    ])

    return NextResponse.json({
      municipalities,
      shelters,
      teamActivities,
    })
  } catch (error) {
    console.error('[api/search] failed:', error)
    return NextResponse.json({ error: '検索に失敗しました' }, { status: 500 })
  }
}
