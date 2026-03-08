import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfareFeature = {
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    P14_006?: string
  }
}

type MeshCell = {
  lat: number
  lon: number
  count: number
  facilityTypes: Record<string, number>
}

// メッシュキーを生成（500m単位）
// 日本の緯度1度 ≈ 111km、経度1度 ≈ 91km (緯度35度付近)
// 500m ≈ 0.0045度 (緯度), 0.0055度 (経度)
const MESH_SIZE_LAT = 0.0045
const MESH_SIZE_LON = 0.0055

function getMeshKey(lon: number, lat: number): string {
  const meshLon = Math.floor(lon / MESH_SIZE_LON) * MESH_SIZE_LON
  const meshLat = Math.floor(lat / MESH_SIZE_LAT) * MESH_SIZE_LAT
  return `${meshLat.toFixed(6)},${meshLon.toFixed(6)}`
}

function parseMeshKey(key: string): { lat: number; lon: number } {
  const [latStr, lonStr] = key.split(',')
  return { lat: parseFloat(latStr), lon: parseFloat(lonStr) }
}

let cachedMeshGeoJSON: any = null

function resolveWelfareGeoJsonPath(): string {
  const candidates = [
    path.join(process.cwd(), 'public', 'data', 'source', 'welfare_facilities_roujin.geojson'),
    path.join(process.cwd(), 'frontend', 'public', 'data', 'source', 'welfare_facilities_roujin.geojson'),
  ]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    throw new Error(`welfare_facilities_roujin.geojson not found. tried: ${candidates.join(', ')}`)
  }
  return found
}

function buildMeshGeoJSON() {
  if (cachedMeshGeoJSON) return cachedMeshGeoJSON

  const startTime = performance.now()
  const geojsonPath = resolveWelfareGeoJsonPath()
  const raw = fs.readFileSync(geojsonPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const features: WelfareFeature[] = Array.isArray(parsed?.features) ? parsed.features : []

  // メッシュごとに集計
  const meshMap = new Map<string, MeshCell>()

  for (const f of features) {
    if (f.geometry?.type !== 'Point' || !Array.isArray(f.geometry?.coordinates)) continue
    const [lon, lat] = f.geometry.coordinates
    const key = getMeshKey(lon, lat)

    if (!meshMap.has(key)) {
      const { lat: meshLat, lon: meshLon } = parseMeshKey(key)
      meshMap.set(key, {
        lat: meshLat,
        lon: meshLon,
        count: 0,
        facilityTypes: {},
      })
    }

    const cell = meshMap.get(key)!
    cell.count += 1

    // 施設種別のカウント
    const facilityType = f.properties?.P14_006 || 'unknown'
    cell.facilityTypes[facilityType] = (cell.facilityTypes[facilityType] || 0) + 1
  }

  // GeoJSONに変換
  const meshFeatures = Array.from(meshMap.values()).map(cell => {
    // メッシュをポリゴンとして表現
    const minLon = cell.lon
    const maxLon = cell.lon + MESH_SIZE_LON
    const minLat = cell.lat
    const maxLat = cell.lat + MESH_SIZE_LAT

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ]],
      },
      properties: {
        count: cell.count,
        facilityTypes: cell.facilityTypes,
        // 3D表示用の高さ（施設数に比例、誇張表現）
        height: cell.count * 100, // 100m/施設（視覚的に分かりやすく）
      },
    }
  })

  cachedMeshGeoJSON = {
    type: 'FeatureCollection',
    features: meshFeatures,
    meta: {
      totalMeshes: meshFeatures.length,
      totalFacilities: features.length,
      meshSizeLat: MESH_SIZE_LAT,
      meshSizeLon: MESH_SIZE_LON,
      approximateMeshSize: '500m',
    },
  }

  const elapsed = performance.now() - startTime
  console.log(`[API/welfare/mesh] Built ${meshFeatures.length} mesh cells from ${features.length} facilities in ${elapsed.toFixed(0)}ms`)

  return cachedMeshGeoJSON
}

export async function GET() {
  try {
    const meshGeoJSON = buildMeshGeoJSON()
    return NextResponse.json(meshGeoJSON)
  } catch (error) {
    console.error('[API/welfare/mesh] Failed:', error)
    return NextResponse.json({ error: 'Failed to build mesh data' }, { status: 500 })
  }
}
