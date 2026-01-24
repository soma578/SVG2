import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type Bike = {
  id: string
  lat: number
  lon: number
  status?: string
  floodRank?: number
  address?: string
  distanceToHazard?: number
}

type CacheEntry = {
  timestamp: number
  data: Bike[]
}

// モジュールスコープで簡易キャッシュ。商用では Redis/Upstash 等に差し替え可。
let cache: CacheEntry | null = null

// 静的CSVを想定し、デフォルトは1日キャッシュ。
const pollIntervalSec = Number(process.env.MOMOCHARI_POLLING_SECONDS ?? '86400')
const endpoint = process.env.MOMOCHARI_API_URL
const apiKey = process.env.MOMOCHARI_API_KEY
const maxAgeSec = Number(process.env.MOMOCHARI_CACHE_MAX_AGE ?? process.env.MOMOCHARI_POLLING_SECONDS ?? '86400')
const resolvePath = (p: string) => (path.isAbsolute(p) ? p : path.join(process.cwd(), p))
const localCsvEnv = process.env.MOMOCHARI_LOCAL_CSV
const localCsvCandidates = [
  localCsvEnv ? resolvePath(localCsvEnv) : null,
  path.join(process.cwd(), 'opendata_1539.csv'),
  path.join(process.cwd(), '..', 'opendata_1539.csv'),
].filter(Boolean) as string[]
const dataDir = path.join(process.cwd(), 'public', 'data')
const dataFile = path.join(dataDir, 'momochari_ports.json')
const credit = process.env.MOMOCHARI_CREDIT || '岡山市オープンデータ「岡山市公共施設マップ_コミュニティサイクル（ももちゃり）」'

const sampleData: Bike[] = [
  { id: 'demo-001', lat: 34.6655, lon: 133.919 },
  { id: 'demo-002', lat: 34.6642, lon: 133.9265 },
  { id: 'demo-003', lat: 34.6671, lon: 133.9323 },
]

const parseCsv = (csv: string): Bike[] => {
  const cleaned = csv.replace(/^\uFEFF/, '') // BOM除去
  const lines = cleaned.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
  const findIndex = (keys: string[]) =>
    headers.findIndex((h) => keys.some((k) => h.includes(k)))
  const latIdx = findIndex(['lat', 'latitude', '緯度'])
  const lonIdx = findIndex(['lon', 'lng', 'longitude', '経度'])
  const nameIdx = findIndex(['name', 'port', 'station', '名称'])
  const statusIdx = findIndex(['status', '状態'])
  const bikes: Bike[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',').map(c =>
      c
        .replace(/^"|"$/g, '')
        .replace(/<br\s*\/?>/gi, ' ')
        .trim()
    )
    const lat = latIdx >= 0 ? Number(cols[latIdx]) : NaN
    const lon = lonIdx >= 0 ? Number(cols[lonIdx]) : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const id = cols[nameIdx >= 0 ? nameIdx : 0] || `port-${i}`
    const status = statusIdx >= 0 ? cols[statusIdx] : undefined
    bikes.push({ id, lat, lon, status })
  }
  return bikes
}

async function fetchExternal(): Promise<Bike[]> {
  if (!endpoint) {
    // まずランク付きJSONを試す
    const publicDir = path.join(process.cwd(), 'public')
    const rankedJsonCandidates = [
      path.join(publicDir, 'momochari_with_rank_demo.json'),
      path.join(publicDir, 'momochari_with_rank.json'),
    ]

    for (const jsonPath of rankedJsonCandidates) {
      try {
        if (fs.existsSync(jsonPath)) {
          const content = fs.readFileSync(jsonPath, 'utf-8')
          const parsed = JSON.parse(content)
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`Loaded momochari JSON with ranks: ${jsonPath} (${parsed.length} records)`)
            return parsed as Bike[]
          }
        }
      } catch (err) {
        console.warn(`Failed to read ranked JSON at ${jsonPath}:`, err)
      }
    }

    // エンドポイント未設定時はローカルCSVを優先（候補を順に探す）
    for (const candidate of localCsvCandidates) {
      try {
        if (fs.existsSync(candidate)) {
          const csv = fs.readFileSync(candidate, 'utf-8')
          const parsed = parseCsv(csv)
          if (parsed.length) {
            console.log(`Loaded momochari CSV: ${candidate} (${parsed.length} records)`)
            return parsed
          }
        }
      } catch (err) {
        console.warn(`Failed to read momochari CSV at ${candidate}:`, err)
      }
    }
    // それでもなければデモデータ
    return sampleData
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const res = await fetch(endpoint, { headers, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Upstream error: ${res.status} ${res.statusText}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = await res.json()

    // 期待する形にマッピング。実際のAPIに合わせてここを調整する。
    if (Array.isArray(data)) {
      return data.map((item, idx) => ({
        id: String(item.id ?? idx),
        lat: Number(item.lat ?? item.latitude ?? item.Latitude),
        lon: Number(item.lon ?? item.lng ?? item.longitude ?? item.Longitude),
        status: typeof item.status === 'string' ? item.status : undefined,
      })).filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lon))
    }
  } else {
    const text = await res.text()
    const parsed = parseCsv(text)
    if (parsed.length) return parsed
  }

  return sampleData
}

function ensureDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readLocalFile(): Bike[] | null {
  try {
    if (!fs.existsSync(dataFile)) return null
    const stat = fs.statSync(dataFile)
    const ageMs = Date.now() - stat.mtimeMs
    if (ageMs > maxAgeSec * 1000) return null
    const buf = fs.readFileSync(dataFile, 'utf-8')
    const parsed = JSON.parse(buf)
    if (Array.isArray(parsed.bikes)) {
      const bikes = parsed.bikes as Bike[]
      const isDemo = bikes.length <= 3 && bikes.every((b: Bike) => typeof b.id === 'string' && b.id.startsWith('demo-'))
      if (isDemo) return null
      return bikes
    }
    return null
  } catch (error) {
    console.warn('Failed to read momochari cache:', error)
    return null
  }
}

function writeLocalFile(bikes: Bike[]) {
  try {
    ensureDirExists(dataDir)
    fs.writeFileSync(
      dataFile,
      JSON.stringify({ bikes, fetchedAt: new Date().toISOString(), credit }, null, 2),
      'utf-8'
    )
  } catch (error) {
    console.warn('Failed to write momochari cache:', error)
  }
}

export async function GET() {
  try {
    const now = Date.now()
    if (cache && now - cache.timestamp < pollIntervalSec * 1000) {
      return NextResponse.json({ bikes: cache.data, cached: true, intervalSec: pollIntervalSec, source: 'memory' })
    }

    const local = readLocalFile()
    if (local) {
      // キャッシュが少数の場合は新規取得を試みる
      if (local.length < 10) {
        try {
          const fresh = await fetchExternal()
          if (fresh.length) {
            writeLocalFile(fresh)
            cache = { timestamp: now, data: fresh }
            return NextResponse.json({ bikes: fresh, cached: false, intervalSec: pollIntervalSec, source: endpoint ? 'remote' : 'local-csv', credit })
          }
        } catch (err) {
          console.warn('Refresh momochari fetch failed, fallback to local file:', err)
        }
      }
      cache = { timestamp: now, data: local }
      return NextResponse.json({ bikes: local, cached: true, intervalSec: pollIntervalSec, source: 'file', credit })
    }

    const bikes = await fetchExternal()
    writeLocalFile(bikes)
    cache = { timestamp: now, data: bikes }
    return NextResponse.json({
      bikes,
      cached: false,
      intervalSec: pollIntervalSec,
      source: endpoint ? 'remote' : (localCsvCandidates.some(p => fs.existsSync(p)) ? 'local-csv' : 'demo'),
      credit,
    })
  } catch (error) {
    console.error('Failed to load momochari data:', error)
    // キャッシュがあればそれを返す
    if (cache) {
      return NextResponse.json({ bikes: cache.data, cached: true, intervalSec: pollIntervalSec, source: 'memory', credit })
    }
    const local = readLocalFile()
    if (local) {
      return NextResponse.json({ bikes: local, cached: true, intervalSec: pollIntervalSec, source: 'file', credit })
    }
    return NextResponse.json({ bikes: sampleData, cached: true, intervalSec: pollIntervalSec, source: 'demo', credit }, { status: 200 })
  }
}
