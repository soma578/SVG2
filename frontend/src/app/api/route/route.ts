import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteResponse = {
  provider: 'osrm'
  profile: string
  distanceMeters: number
  durationSec: number
  points: [number, number][]
  cached?: boolean
}

type CacheEntry = { timestamp: number, data: RouteResponse }

// Simple in-memory cache (best-effort). Tauri/static export won't use this API anyway.
let cache = new Map<string, CacheEntry>()

const cacheMaxAgeSec = Number(process.env.ROUTE_CACHE_MAX_AGE ?? '86400')
const baseUrl = process.env.ROUTER_BASE_URL ?? 'https://router.project-osrm.org'

const normalizeProfile = (value: string | null) => {
  const profile = (value ?? 'auto').toLowerCase()
  if (profile === 'auto') return 'auto'
  if (profile === 'bike' || profile === 'bicycle') return 'cycling'
  if (profile === 'foot') return 'walking'
  return profile
}

const parseCoords = (raw: string | null) => {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parts = trimmed.split(';').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const coords: { lon: number, lat: number }[] = []
  for (const p of parts) {
    const [lonStr, latStr] = p.split(',').map((s) => s.trim())
    const lon = Number(lonStr)
    const lat = Number(latStr)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
    coords.push({ lon, lat })
  }
  return coords
}

const toSafeProfile = (profile: string) => {
  const cleaned = profile.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return cleaned || 'driving'
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const requestedProfile = normalizeProfile(url.searchParams.get('profile'))
    const coords = parseCoords(url.searchParams.get('coords'))
    if (!coords) {
      return NextResponse.json({ error: 'Invalid coords' }, { status: 400 })
    }

    const key = `${requestedProfile}:${coords.map((c) => `${c.lon},${c.lat}`).join(';')}`
    const now = Date.now()
    const cached = cache.get(key)
    if (cached && now - cached.timestamp < cacheMaxAgeSec * 1000) {
      return NextResponse.json({ ...cached.data, cached: true } satisfies RouteResponse)
    }

    const coordStr = coords.map((c) => `${c.lon},${c.lat}`).join(';')
    const candidates =
      requestedProfile === 'auto'
        ? ['cycling', 'driving', 'walking', 'foot', 'bicycle']
        : [requestedProfile]

    let best: RouteResponse | null = null

    for (const candidate of candidates) {
      const safeProfile = toSafeProfile(candidate)
      const endpoint = `${baseUrl}/route/v1/${encodeURIComponent(safeProfile)}/${coordStr}?overview=full&geometries=geojson&alternatives=true&steps=false`
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        if (requestedProfile !== 'auto') {
          return NextResponse.json({ error: `Upstream error: ${res.status}` }, { status: 502 })
        }
        continue
      }
      const payload = await res.json() as {
        code?: string
        routes?: Array<{
          distance: number
          duration: number
          geometry: { coordinates: [number, number][] }
        }>
      }
      const routes = Array.isArray(payload.routes) ? payload.routes : []
      const picked = routes.reduce<{
        distance: number
        duration: number
        geometry: { coordinates: [number, number][] }
      } | null>((acc, r) => {
        if (!Array.isArray(r.geometry?.coordinates) || r.geometry.coordinates.length < 2) return acc
        if (!acc) return r
        return r.distance < acc.distance ? r : acc
      }, null)
      if (!picked) continue

      const points: [number, number][] = picked.geometry.coordinates.map(([lon, lat]) => [lat, lon])
      const data: RouteResponse = {
        provider: 'osrm',
        profile: safeProfile,
        distanceMeters: Number(picked.distance) || 0,
        durationSec: Number(picked.duration) || 0,
        points,
      }

      if (!best || data.distanceMeters < best.distanceMeters) {
        best = data
      }
    }

    if (!best || best.points.length < 2) {
      return NextResponse.json({ error: 'No route' }, { status: 502 })
    }

    cache.set(key, { timestamp: now, data: best })
    // Prevent unbounded growth (cheap cap).
    if (cache.size > 200) {
      cache = new Map(Array.from(cache.entries()).slice(-100))
    }

    return NextResponse.json(best)
  } catch (error) {
    console.error('Failed to compute route:', error)
    return NextResponse.json({ error: 'Failed to compute route' }, { status: 500 })
  }
}
