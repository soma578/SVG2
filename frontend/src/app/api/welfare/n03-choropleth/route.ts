import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type WelfareFeature = {
  properties: {
    P14_001?: string  // 都道府県名
    P14_002?: string  // 市区町村名
    P14_003?: string  // 行政区域コード
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
    pref?: string     // 軽量データ互換
    name?: string     // 軽量データ互換
    n03_code?: string // 軽量データ互換
  }
}

let cachedChoropleth: any = null
const MUNICIPALITY_CODE_ALIASES: Record<string, string> = {
  // 2018年の市制移行: 那珂川市(40231) -> 旧コードの那珂川町(40305)
  '40231': '40305',
}

function normalizeMunicipalityCode(codeRaw: string): string {
  const code = codeRaw.trim()
  if (!code) return ''
  if (MUNICIPALITY_CODE_ALIASES[code]) return MUNICIPALITY_CODE_ALIASES[code]
  // 県コード(14000, 40000 など)は市町村ポリゴンと結びつかないため除外
  if (/^\d{2}000$/.test(code)) return ''
  return code
}

function buildChoropleth() {
  if (cachedChoropleth) return cachedChoropleth

  const startTime = performance.now()

  // 福祉施設データを読み込んで市町村ごとにカウント
  const welfarePath = path.join(process.cwd(), 'public', 'data', 'source', 'welfare_facilities_roujin.geojson')
  const welfareRaw = fs.readFileSync(welfarePath, 'utf-8')
  const welfareParsed = JSON.parse(welfareRaw)
  const welfareFeatures: WelfareFeature[] = Array.isArray(welfareParsed?.features) ? welfareParsed.features : []

  // 市町村ごとの施設数をカウント（コード優先）
  const municipalityCountByCode = new Map<string, number>()
  const municipalityCount = new Map<string, number>()

  for (const f of welfareFeatures) {
    const code = normalizeMunicipalityCode(String(f.properties?.P14_003 || ''))
    const pref = (f.properties?.P14_001 || '').trim()
    const city = (f.properties?.P14_002 || '').trim()
    if (code) {
      municipalityCountByCode.set(code, (municipalityCountByCode.get(code) || 0) + 1)
    }
    if (!pref || !city) continue

    // 市区町村名を正規化（郡名を削除）
    const normalizedCity = city.replace(/^.*郡/, '').replace(/^.*支庁/, '')
    const key = `${pref}_${normalizedCity}`
    municipalityCount.set(key, (municipalityCount.get(key) || 0) + 1)
  }

  console.log(`[N03 Choropleth] Counted facilities for ${municipalityCount.size} municipalities`)

  // N03データを読み込み（軽量版を優先）
  const n03Candidates = [
    path.join(process.cwd(), 'public', 'data', 'source', 'n03_national_light.geojson'),
    path.join(process.cwd(), 'public', 'data', 'source', 'n03_okayama_light.geojson'),
    path.join(process.cwd(), 'public', 'okayama_municipalities_simple.geojson'),
  ]
  const n03Path = n03Candidates.find((p) => fs.existsSync(p))

  if (!n03Path) {
    // N03データが無い場合（Vercel環境など）は施設カウントのみ返す
    console.warn('[N03 Choropleth] N03 data not found, returning counts only')
    cachedChoropleth = {
      type: 'FeatureCollection',
      features: [],
      meta: {
        totalPolygons: 0,
        totalMunicipalities: municipalityCount.size,
        totalFacilities: welfareFeatures.length,
        note: 'N03 polygon data not available in this environment',
      }
    }
    return cachedChoropleth
  }

  const n03Raw = fs.readFileSync(n03Path, 'utf-8')
  const n03Parsed = JSON.parse(n03Raw)
  const n03Features: N03Feature[] = Array.isArray(n03Parsed?.features) ? n03Parsed.features : []

  console.log(`[N03 Choropleth] Loaded ${n03Features.length} polygons from ${n03Path}`)

  // N03ポリゴンに施設数を付与
  const enrichedFeatures = n03Features.map(f => {
    const pref = (f.properties?.N03_001 || f.properties?.pref || '').trim()
    const city = (f.properties?.N03_004 || f.properties?.name || '').trim()
    const code = (f.properties?.N03_007 || f.properties?.n03_code || '').trim()

    if (!code && (!pref || !city)) {
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
    const count = municipalityCountByCode.get(code) ?? municipalityCount.get(key) ?? 0

    return {
      ...f,
      properties: {
        ...f.properties,
        N03_001: pref,
        N03_004: city,
        N03_007: code,
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
