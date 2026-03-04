import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type Item = {
  properties?: {
    P14_001?: string
  }
  geometry?: {
    type?: string
    coordinates?: [number, number]
  }
}

let cached: Array<{ pref: string; count: number; center: [number, number] }> | null = null

function loadData() {
  if (cached) return cached

  const geojsonPath = path.join(process.cwd(), 'public', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const raw = fs.readFileSync(geojsonPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const features: Item[] = Array.isArray(parsed?.features) ? parsed.features : []

  const prefMap: Record<string, { count: number; lonSum: number; latSum: number }> = {}
  for (const f of features) {
    if (f.geometry?.type !== 'Point' || !Array.isArray(f.geometry?.coordinates)) continue
    const pref = (f.properties?.P14_001 || '').trim()
    if (!pref) continue
    const [lon, lat] = f.geometry.coordinates
    if (!prefMap[pref]) prefMap[pref] = { count: 0, lonSum: 0, latSum: 0 }
    prefMap[pref].count += 1
    prefMap[pref].lonSum += Number(lon)
    prefMap[pref].latSum += Number(lat)
  }

  cached = Object.entries(prefMap).map(([pref, v]) => ({
    pref,
    count: v.count,
    center: [v.lonSum / v.count, v.latSum / v.count] as [number, number],
  }))

  return cached
}

export async function GET() {
  try {
    return NextResponse.json({ prefectures: loadData() })
  } catch (error) {
    console.error('[API/welfare/prefecture-counts] Failed:', error)
    return NextResponse.json({ error: 'Failed to load prefecture counts' }, { status: 500 })
  }
}

