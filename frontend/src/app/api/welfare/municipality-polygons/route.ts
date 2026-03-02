import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfareFeature = {
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    P14_001?: string  // 都道府県名
    P14_002?: string  // 市区町村名
    P14_006?: string  // 施設種別
  }
}

type MunicipalityData = {
  key: string
  pref: string
  city: string
  count: number
  facilities: [number, number][]  // 座標リスト
}

let cachedMunicipalityGeoJSON: any = null

function buildMunicipalityPolygons() {
  if (cachedMunicipalityGeoJSON) return cachedMunicipalityGeoJSON

  const startTime = performance.now()
  const geojsonPath = path.join(process.cwd(), '..', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const raw = fs.readFileSync(geojsonPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const features: WelfareFeature[] = Array.isArray(parsed?.features) ? parsed.features : []

  // 市町村ごとに施設を集約
  const municipalityMap = new Map<string, MunicipalityData>()

  for (const f of features) {
    if (f.geometry?.type !== 'Point' || !Array.isArray(f.geometry?.coordinates)) continue

    const pref = (f.properties?.P14_001 || '').trim()
    const city = (f.properties?.P14_002 || '').trim()
    if (!pref || !city) continue

    const key = `${pref}_${city}`
    const [lon, lat] = f.geometry.coordinates

    if (!municipalityMap.has(key)) {
      municipalityMap.set(key, {
        key,
        pref,
        city,
        count: 0,
        facilities: [],
      })
    }

    const data = municipalityMap.get(key)!
    data.count += 1
    data.facilities.push([lon, lat])
  }

  // 各市町村の境界ボックスをポリゴンとして生成
  const polygonFeatures = Array.from(municipalityMap.values()).map(data => {
    // 最小・最大座標を計算
    const lons = data.facilities.map(c => c[0])
    const lats = data.facilities.map(c => c[1])
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    // わずかに拡大（視覚的に隙間を埋める）
    const padding = 0.02
    const minLonPadded = minLon - padding
    const maxLonPadded = maxLon + padding
    const minLatPadded = minLat - padding
    const maxLatPadded = maxLat + padding

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [minLonPadded, minLatPadded],
          [maxLonPadded, minLatPadded],
          [maxLonPadded, maxLatPadded],
          [minLonPadded, maxLatPadded],
          [minLonPadded, minLatPadded],
        ]],
      },
      properties: {
        key: data.key,
        pref: data.pref,
        city: data.city,
        count: data.count,
        // 3D表示用の高さ
        height: data.count * 50,  // 50m/施設
      },
    }
  })

  cachedMunicipalityGeoJSON = {
    type: 'FeatureCollection',
    features: polygonFeatures,
    meta: {
      totalMunicipalities: polygonFeatures.length,
      totalFacilities: features.length,
    },
  }

  const elapsed = performance.now() - startTime
  console.log(`[API/welfare/municipality-polygons] Built ${polygonFeatures.length} municipality polygons from ${features.length} facilities in ${elapsed.toFixed(0)}ms`)

  return cachedMunicipalityGeoJSON
}

export async function GET() {
  try {
    const polygonGeoJSON = buildMunicipalityPolygons()
    return NextResponse.json(polygonGeoJSON)
  } catch (error) {
    console.error('[API/welfare/municipality-polygons] Failed:', error)
    return NextResponse.json({ error: 'Failed to build municipality polygons' }, { status: 500 })
  }
}
