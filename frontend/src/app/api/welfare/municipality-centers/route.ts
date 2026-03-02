import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type Item = {
  properties?: {
    P14_001?: string
    P14_002?: string
  }
  geometry?: {
    type?: string
    coordinates?: [number, number]
  }
}

let cached: Array<{ key: string; count: number; center: [number, number] }> | null = null

function normalizeMunicipality(pref: string, cityRaw: string): string {
  const city = (cityRaw || '').trim()
  if (!city) return `${pref} 不明`
  // 郡表記を町村名へ正規化
  const normalizedCity = city.replace(/^.*郡/, '')
  return `${pref} ${normalizedCity}`
}

function loadData() {
  if (cached) return cached

  const geojsonPath = path.join(process.cwd(), '..', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const raw = fs.readFileSync(geojsonPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const features: Item[] = Array.isArray(parsed?.features) ? parsed.features : []

  const map: Record<string, { count: number; lonSum: number; latSum: number }> = {}
  for (const f of features) {
    if (f.geometry?.type !== 'Point' || !Array.isArray(f.geometry?.coordinates)) continue
    const pref = (f.properties?.P14_001 || '').trim()
    const city = (f.properties?.P14_002 || '').trim()
    if (!pref || !city) continue
    const key = normalizeMunicipality(pref, city)
    const [lon, lat] = f.geometry.coordinates
    if (!map[key]) map[key] = { count: 0, lonSum: 0, latSum: 0 }
    map[key].count += 1
    map[key].lonSum += Number(lon)
    map[key].latSum += Number(lat)
  }

  cached = Object.entries(map).map(([key, v]) => ({
    key,
    count: v.count,
    center: [v.lonSum / v.count, v.latSum / v.count] as [number, number],
  }))

  return cached
}

export async function GET() {
  try {
    return NextResponse.json({ municipalities: loadData() })
  } catch (error) {
    console.error('[API/welfare/municipality-centers] Failed:', error)
    return NextResponse.json({ error: 'Failed to load municipality centers' }, { status: 500 })
  }
}

