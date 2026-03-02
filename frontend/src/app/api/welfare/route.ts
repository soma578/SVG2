import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfarePoint = {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    P14_001?: string
    P14_002?: string
    P14_003?: string
    P14_004?: number | string
    P14_006?: string
    P14_007?: string
    P14_008?: string
    P14_009?: number | string
  }
}

// グリッドインデックス（1度単位）
type GridIndex = Map<string, WelfarePoint[]>

let cachedPoints: WelfarePoint[] | null = null
let gridIndex: GridIndex | null = null

function getGridKey(lon: number, lat: number): string {
  return `${Math.floor(lon)},${Math.floor(lat)}`
}

function buildGridIndex(points: WelfarePoint[]): GridIndex {
  const index = new Map<string, WelfarePoint[]>()
  for (const point of points) {
    const [lon, lat] = point.geometry.coordinates
    const key = getGridKey(lon, lat)
    if (!index.has(key)) {
      index.set(key, [])
    }
    index.get(key)!.push(point)
  }
  console.log(`[GridIndex] Built index with ${index.size} cells for ${points.length} points`)
  return index
}

function loadWelfarePoints(): WelfarePoint[] {
  // キャッシュとグリッドインデックス両方が揃っている場合のみ早期リターン
  if (cachedPoints && gridIndex) return cachedPoints

  const geojsonPath = path.join(process.cwd(), '..', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const raw = fs.readFileSync(geojsonPath, 'utf-8')
  const parsed = JSON.parse(raw)

  const features = Array.isArray(parsed?.features) ? parsed.features : []
  const points: WelfarePoint[] = features
    .filter((f: any) => f?.geometry?.type === 'Point' && Array.isArray(f?.geometry?.coordinates))
    .map((f: any) => {
      const [lon, lat] = f.geometry.coordinates
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [Number(lon), Number(lat)],
        },
        properties: {
          P14_001: f?.properties?.P14_001 ?? '',
          P14_002: f?.properties?.P14_002 ?? '',
          P14_003: f?.properties?.P14_003 ?? '',
          P14_004: f?.properties?.P14_004 ?? '',
          P14_006: f?.properties?.P14_006 ?? '',
          P14_007: f?.properties?.P14_007 ?? '',
          P14_008: f?.properties?.P14_008 ?? '',
          P14_009: f?.properties?.P14_009 ?? '',
        },
      }
    })

  cachedPoints = points

  // グリッドインデックスを構築
  gridIndex = buildGridIndex(points)

  return points
}

export async function GET(req: NextRequest) {
  try {
    const startTime = performance.now()
    const params = req.nextUrl.searchParams
    const west = Number(params.get('west'))
    const south = Number(params.get('south'))
    const east = Number(params.get('east'))
    const north = Number(params.get('north'))
    const limit = Math.min(Number(params.get('limit') || '30000'), 50000)

    if ([west, south, east, north].some((v) => Number.isNaN(v))) {
      return NextResponse.json({ error: 'Invalid bbox' }, { status: 400 })
    }

    loadWelfarePoints() // グリッドインデックス初期化

    if (!gridIndex) {
      return NextResponse.json({ error: 'Grid index not initialized' }, { status: 500 })
    }

    // グリッドインデックスを使った高速検索
    const candidates: WelfarePoint[] = []
    const westFloor = Math.floor(west)
    const eastFloor = Math.floor(east)
    const southFloor = Math.floor(south)
    const northFloor = Math.floor(north)

    // 対象グリッドセルのポイントを収集
    for (let lon = westFloor; lon <= eastFloor; lon++) {
      for (let lat = southFloor; lat <= northFloor; lat++) {
        const key = `${lon},${lat}`
        const cellPoints = gridIndex.get(key)
        if (cellPoints) {
          candidates.push(...cellPoints)
        }
      }
    }

    // bbox内のポイントのみフィルタリング
    const filtered = candidates.filter((f) => {
      const [lon, lat] = f.geometry.coordinates
      return lon >= west && lon <= east && lat >= south && lat <= north
    })

    const sliced = filtered.slice(0, limit)
    const elapsed = performance.now() - startTime

    console.log(`[API/welfare] Searched ${candidates.length} candidates → ${filtered.length} results in ${elapsed.toFixed(0)}ms`)

    return NextResponse.json({
      type: 'FeatureCollection',
      features: sliced,
      meta: {
        total: filtered.length,
        returned: sliced.length,
        limited: filtered.length > sliced.length,
        searchTimeMs: Math.round(elapsed),
        candidatesSearched: candidates.length,
      },
    })
  } catch (error) {
    console.error('[API/welfare] Failed:', error)
    return NextResponse.json({ error: 'Failed to load welfare facilities' }, { status: 500 })
  }
}

