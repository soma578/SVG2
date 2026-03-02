import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfareFeature = {
  properties?: {
    P14_001?: string
    P14_002?: string
    P14_003?: string
  }
}

let cachedResult: { counts: Record<string, number>; totalOkayama: number } | null = null

function buildMunicipalityKey(city: string, addr: string): string {
  if (city.startsWith('岡山市')) {
    const wardInCity = city.replace('岡山市', '')
    if (wardInCity.endsWith('区')) return `岡山県 岡山市${wardInCity}`
    const wards = ['北区', '中区', '東区', '南区']
    const ward = wards.find((w) => addr.includes(w))
    if (ward) return `岡山県 岡山市${ward}`
  }
  // 郡付き表記（例: 和気郡和気町）を自治体名（和気町）へ正規化
  const normalized = city.replace(/^.*郡/, '')
  return `岡山県 ${normalized}`
}

function loadCounts() {
  if (cachedResult) return cachedResult

  const geojsonPath = path.join(process.cwd(), '..', 'data', 'source', 'welfare_facilities.geojson')
  const raw = fs.readFileSync(geojsonPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const features: WelfareFeature[] = Array.isArray(parsed?.features) ? parsed.features : []

  const counts: Record<string, number> = {}
  let totalOkayama = 0

  for (const f of features) {
    const pref = f.properties?.P14_001 || ''
    if (pref !== '岡山県') continue

    const city = f.properties?.P14_002 || ''
    if (!city) continue
    const addr = f.properties?.P14_003 || ''

    const key = buildMunicipalityKey(city, addr)
    counts[key] = (counts[key] || 0) + 1
    totalOkayama += 1
  }

  cachedResult = { counts, totalOkayama }
  return cachedResult
}

export async function GET() {
  try {
    const data = loadCounts()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[API/welfare/municipality-counts] Failed:', error)
    return NextResponse.json({ error: 'Failed to load counts' }, { status: 500 })
  }
}
