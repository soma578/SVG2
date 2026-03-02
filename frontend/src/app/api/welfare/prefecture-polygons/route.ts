import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfareFeature = {
  properties: {
    P14_001?: string  // 都道府県名
  }
  geometry?: {
    type?: string
    coordinates?: [number, number]
  }
}

let cachedPrefecturePolygons: any = null

// 中心座標から四角形ポリゴンを生成（簡易版）
function createSquarePolygon(center: [number, number], size: number = 0.5) {
  const [lon, lat] = center
  return {
    type: 'Polygon',
    coordinates: [[
      [lon - size, lat - size],
      [lon + size, lat - size],
      [lon + size, lat + size],
      [lon - size, lat + size],
      [lon - size, lat - size]
    ]]
  }
}

function buildPrefecturePolygons() {
  if (cachedPrefecturePolygons) return cachedPrefecturePolygons

  const startTime = performance.now()

  // 福祉施設データを読み込んで都道府県ごとにカウント・中心計算
  const welfarePath = path.join(process.cwd(), '..', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const welfareRaw = fs.readFileSync(welfarePath, 'utf-8')
  const welfareParsed = JSON.parse(welfareRaw)
  const welfareFeatures: WelfareFeature[] = Array.isArray(welfareParsed?.features) ? welfareParsed.features : []

  // 都道府県ごとの集計
  const prefectureData = new Map<string, { count: number; lonSum: number; latSum: number }>()

  for (const f of welfareFeatures) {
    if (f.geometry?.type !== 'Point' || !Array.isArray(f.geometry?.coordinates)) continue
    const pref = (f.properties?.P14_001 || '').trim()
    if (!pref) continue

    const [lon, lat] = f.geometry.coordinates
    if (!prefectureData.has(pref)) {
      prefectureData.set(pref, { count: 0, lonSum: 0, latSum: 0 })
    }
    const data = prefectureData.get(pref)!
    data.count += 1
    data.lonSum += Number(lon)
    data.latSum += Number(lat)
  }

  console.log(`[Prefecture Polygons] Counted facilities for ${prefectureData.size} prefectures`)

  // 各都道府県の中心座標から四角形ポリゴンを生成
  const features = Array.from(prefectureData.entries()).map(([pref, data]) => {
    const center: [number, number] = [
      data.lonSum / data.count,
      data.latSum / data.count
    ]

    return {
      type: 'Feature',
      geometry: createSquarePolygon(center, 0.6),  // ±0.6度（約66km四方）
      properties: {
        prefecture: pref,
        count: data.count,
        height: data.count * 10,  // 3D用の高さ
        center
      }
    }
  })

  cachedPrefecturePolygons = {
    type: 'FeatureCollection',
    features,
    meta: {
      totalPrefectures: features.length,
      totalFacilities: welfareFeatures.length,
    }
  }

  const elapsed = performance.now() - startTime
  console.log(`[Prefecture Polygons] Built ${features.length} prefecture polygons in ${elapsed.toFixed(0)}ms`)

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
