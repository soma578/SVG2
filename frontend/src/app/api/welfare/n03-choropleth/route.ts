import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfareFeature = {
  properties: {
    P14_001?: string  // 都道府県名
    P14_002?: string  // 市区町村名
  }
}

type N03Feature = {
  type: 'Feature'
  geometry: any
  properties: {
    N03_001?: string  // 都道府県名
    N03_002?: string  // 支庁名
    N03_003?: string  // 郡・政令市名
    N03_004?: string  // 市区町村名
    N03_007?: string  // 行政区域コード
  }
}

let cachedChoropleth: any = null

function buildChoropleth() {
  if (cachedChoropleth) return cachedChoropleth

  const startTime = performance.now()

  // 福祉施設データを読み込んで市町村ごとにカウント
  const welfarePath = path.join(process.cwd(), '..', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const welfareRaw = fs.readFileSync(welfarePath, 'utf-8')
  const welfareParsed = JSON.parse(welfareRaw)
  const welfareFeatures: WelfareFeature[] = Array.isArray(welfareParsed?.features) ? welfareParsed.features : []

  // 市町村ごとの施設数をカウント
  const municipalityCount = new Map<string, number>()

  for (const f of welfareFeatures) {
    const pref = (f.properties?.P14_001 || '').trim()
    const city = (f.properties?.P14_002 || '').trim()
    if (!pref || !city) continue

    // 市区町村名を正規化（郡名を削除）
    const normalizedCity = city.replace(/^.*郡/, '').replace(/^.*支庁/, '')
    const key = `${pref}_${normalizedCity}`
    municipalityCount.set(key, (municipalityCount.get(key) || 0) + 1)
  }

  console.log(`[N03 Choropleth] Counted facilities for ${municipalityCount.size} municipalities`)

  // N03データを読み込み
  const n03Path = path.join(process.cwd(), '..', 'N03-180101_GML', 'N03-18_180101.geojson')

  if (!fs.existsSync(n03Path)) {
    throw new Error(`N03 data not found at ${n03Path}`)
  }

  const n03Raw = fs.readFileSync(n03Path, 'utf-8')
  const n03Parsed = JSON.parse(n03Raw)
  const n03Features: N03Feature[] = Array.isArray(n03Parsed?.features) ? n03Parsed.features : []

  console.log(`[N03 Choropleth] Loaded ${n03Features.length} N03 polygons`)

  // N03ポリゴンに施設数を付与
  const enrichedFeatures = n03Features.map(f => {
    const pref = (f.properties?.N03_001 || '').trim()
    const city = (f.properties?.N03_004 || '').trim()

    if (!pref || !city) {
      return {
        ...f,
        properties: {
          ...f.properties,
          count: 0,
          height: 0,
        }
      }
    }

    // 市町村名を正規化
    const normalizedCity = city.replace(/^.*郡/, '').replace(/^.*支庁/, '')
    const key = `${pref}_${normalizedCity}`
    const count = municipalityCount.get(key) || 0

    return {
      ...f,
      properties: {
        ...f.properties,
        count,
        height: count * 50,  // 3D用の高さ
      }
    }
  })

  cachedChoropleth = {
    type: 'FeatureCollection',
    features: enrichedFeatures,
    meta: {
      totalPolygons: enrichedFeatures.length,
      totalMunicipalities: municipalityCount.size,
      totalFacilities: welfareFeatures.length,
    }
  }

  const elapsed = performance.now() - startTime
  console.log(`[N03 Choropleth] Built choropleth in ${elapsed.toFixed(0)}ms`)

  return cachedChoropleth
}

export async function GET() {
  try {
    const choropleth = buildChoropleth()
    return NextResponse.json(choropleth)
  } catch (error) {
    console.error('[API/welfare/n03-choropleth] Failed:', error)
    return NextResponse.json({
      error: 'Failed to build N03 choropleth',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
