import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfareFeature = {
  properties: {
    P14_001?: string  // 都道府県名
    P14_002?: string  // 市区町村名
    P14_003?: string  // 行政区域コード（5桁）
  }
}

let cachedCounts: Record<string, number> | null = null

function buildMunicipalityCounts() {
  if (cachedCounts) return cachedCounts

  const startTime = performance.now()

  // 福祉施設データを読み込んで市町村ごとにカウント
  const welfarePath = path.join(process.cwd(), 'public', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const welfareRaw = fs.readFileSync(welfarePath, 'utf-8')
  const welfareParsed = JSON.parse(welfareRaw)
  const welfareFeatures: WelfareFeature[] = Array.isArray(welfareParsed?.features) ? welfareParsed.features : []

  // 市町村コードごとの施設数をカウント
  const counts: Record<string, number> = {}

  for (const f of welfareFeatures) {
    const code = (f.properties?.P14_003 || '').trim()
    if (!code) continue

    // 5桁の行政区域コード（先頭5桁を使用）
    const municipalityCode = code.substring(0, 5)
    counts[municipalityCode] = (counts[municipalityCode] || 0) + 1
  }

  cachedCounts = counts

  const elapsed = performance.now() - startTime
  console.log(`[API/welfare/municipality-counts-n03] Built counts for ${Object.keys(counts).length} municipalities in ${elapsed.toFixed(0)}ms`)

  return cachedCounts
}

export async function GET() {
  try {
    const counts = buildMunicipalityCounts()
    return NextResponse.json({
      counts,
      meta: {
        totalMunicipalities: Object.keys(counts).length,
        totalFacilities: Object.values(counts).reduce((a, b) => a + b, 0),
      }
    })
  } catch (error) {
    console.error('[API/welfare/municipality-counts-n03] Failed:', error)
    return NextResponse.json({
      error: 'Failed to build municipality counts',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
