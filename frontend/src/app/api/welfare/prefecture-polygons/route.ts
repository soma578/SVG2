import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfareFeature = {
  properties: {
    P14_001?: string  // 都道府県名
  }
}

type N03Feature = {
  type: 'Feature'
  geometry: any
  properties: {
    N03_001?: string  // 都道府県名
    N03_007?: string  // 行政区域コード
  }
}

let cachedPrefecturePolygons: any = null

function buildPrefecturePolygons() {
  if (cachedPrefecturePolygons) return cachedPrefecturePolygons

  const startTime = performance.now()

  // 福祉施設データを読み込んで都道府県ごとにカウント
  const welfarePath = path.join(process.cwd(), '..', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const welfareRaw = fs.readFileSync(welfarePath, 'utf-8')
  const welfareParsed = JSON.parse(welfareRaw)
  const welfareFeatures: WelfareFeature[] = Array.isArray(welfareParsed?.features) ? welfareParsed.features : []

  // 都道府県ごとの施設数をカウント
  const prefectureCount = new Map<string, number>()

  for (const f of welfareFeatures) {
    const pref = (f.properties?.P14_001 || '').trim()
    if (!pref) continue
    prefectureCount.set(pref, (prefectureCount.get(pref) || 0) + 1)
  }

  console.log(`[Prefecture Polygons] Counted facilities for ${prefectureCount.size} prefectures`)

  // N03データを読み込み
  const n03Path = path.join(process.cwd(), '..', 'N03-180101_GML', 'N03-18_180101.geojson')

  if (!fs.existsSync(n03Path)) {
    throw new Error(`N03 data not found at ${n03Path}`)
  }

  const n03Raw = fs.readFileSync(n03Path, 'utf-8')
  const n03Parsed = JSON.parse(n03Raw)
  const n03Features: N03Feature[] = Array.isArray(n03Parsed?.features) ? n03Parsed.features : []

  console.log(`[Prefecture Polygons] Loaded ${n03Features.length} N03 polygons`)

  // 都道府県ごとにポリゴンをグループ化（最初の市町村ポリゴンを代表として使用）
  const prefectureMap = new Map<string, N03Feature>()

  for (const f of n03Features) {
    const pref = (f.properties?.N03_001 || '').trim()
    if (!pref) continue

    // 各都道府県の最初のポリゴンのみを使用（簡易実装）
    // より正確にはUnion/Dissolve処理が必要だが、3D表示では境界の正確性はあまり重要でない
    if (!prefectureMap.has(pref)) {
      prefectureMap.set(pref, f)
    }
  }

  // ポリゴンに施設数を付与
  const enrichedFeatures = Array.from(prefectureMap.entries()).map(([pref, f]) => {
    const count = prefectureCount.get(pref) || 0

    return {
      ...f,
      properties: {
        ...f.properties,
        prefecture: pref,
        count,
        height: count * 10,  // 3D用の高さ（都道府県レベルなので市町村より低めに）
      }
    }
  })

  cachedPrefecturePolygons = {
    type: 'FeatureCollection',
    features: enrichedFeatures,
    meta: {
      totalPrefectures: enrichedFeatures.length,
      totalFacilities: welfareFeatures.length,
    }
  }

  const elapsed = performance.now() - startTime
  console.log(`[Prefecture Polygons] Built prefecture polygons in ${elapsed.toFixed(0)}ms`)

  return cachedPrefecturePolygons
}

export async function GET() {
  try {
    const polygons = buildPrefecturePolygons()
    return NextResponse.json(polygons)
  } catch (error) {
    console.error('[API/welfare/prefecture-polygons] Failed:', error)
    return NextResponse.json({
      error: 'Failed to build prefecture polygons',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
