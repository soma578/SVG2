#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(frontendRoot, '..')
const sourceDataRoot = path.join(projectRoot, 'map', 'data')
// Stage 1: unified QTCT contract. Output path convention is layer-first:
//   qtct/{layer}/{region}/detail.json  (per-region full tree)
//   qtct/{layer}/summary.json          (global cross-region summary tree)
// (Deviates from the region-first spec because the summary is national/shared,
//  not per-prefecture — keeping it global avoids 47x duplication.)
const outRoot = path.join(projectRoot, 'map', 'data', 'qtct')

const JAPAN_BOUNDS = { minLon: 122.434, minLat: 23.546, maxLon: 154.487, maxLat: 46.056 }
const MAX_DEPTH = 12
const LEAF_SIZE = 2

const layers = [
  { id: 'evacuation', label: '避難所', dir: 'evacuation', kind: 'shelter' },
  { id: 'teamActivity', label: '活動情報', dir: 'team-activity', kind: 'team' },
]

const readItems = (filePath) => {
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const items = Array.isArray(json) ? json : json.items || json.records || []
  return Array.isArray(items) ? items : []
}

const asNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const normalizeRecord = (raw, layer, regionId, index) => {
  const lat = asNumber(raw.lat ?? raw.latitude)
  const lon = asNumber(raw.lon ?? raw.lng ?? raw.longitude)
  if (lat == null || lon == null) return null
  if (lon < JAPAN_BOUNDS.minLon || lon > JAPAN_BOUNDS.maxLon || lat < JAPAN_BOUNDS.minLat || lat > JAPAN_BOUNDS.maxLat) return null
  const id = String(raw.id || raw.teamId || `${layer.id}:${regionId}:${index}`)
  const title = String(raw.title || raw.name || raw.teamName || id)
  return {
    id,
    title,
    layerId: layer.id,
    kind: layer.kind,
    status: String(raw.status || 'unknown'),
    municipalityCode: String(raw.municipalityCode || raw.municipality_code || ''),
    regionId: String(raw.regionId || raw.region_id || regionId),
    lat,
    lon,
    summary: String(raw.summary || raw.subtitle || raw.activityType || ''),
    description: String(raw.description || raw.note || raw.summary || ''),
    address: String(raw.address || ''),
    capacity: raw.capacity ?? null,
    area: String(raw.area || ''),
    operator: String(raw.operator || ''),
  }
}

const centroidRepresentative = (records) => {
  let lat = 0
  let lon = 0
  for (const record of records) {
    lat += record.lat
    lon += record.lon
  }
  lat /= records.length
  lon /= records.length
  let best = records[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const record of records) {
    const score = (record.lat - lat) ** 2 + (record.lon - lon) ** 2
    if (score < bestScore) {
      best = record
      bestScore = score
    }
  }
  return best
}

const childBounds = (bounds) => {
  const midLon = (bounds.minLon + bounds.maxLon) / 2
  const midLat = (bounds.minLat + bounds.maxLat) / 2
  return [
    { minLon: bounds.minLon, minLat: bounds.minLat, maxLon: midLon, maxLat: midLat },
    { minLon: midLon, minLat: bounds.minLat, maxLon: bounds.maxLon, maxLat: midLat },
    { minLon: bounds.minLon, minLat: midLat, maxLon: midLon, maxLat: bounds.maxLat },
    { minLon: midLon, minLat: midLat, maxLon: bounds.maxLon, maxLat: bounds.maxLat },
  ]
}

let nextNodeId = 0
const buildNode = (records, bounds, depth) => {
  const rep = centroidRepresentative(records)
  const node = {
    id: nextNodeId++,
    depth,
    bounds,
    count: records.length,
    representative: {
      id: rep.id,
      title: rep.title,
      layerId: rep.layerId,
      kind: rep.kind,
      status: rep.status,
      municipalityCode: rep.municipalityCode,
      regionId: rep.regionId,
      lat: rep.lat,
      lon: rep.lon,
      representative: records.length > 1,
      count: records.length,
      summary: rep.summary,
      description: rep.description,
      address: rep.address,
      capacity: rep.capacity,
      area: rep.area,
      operator: rep.operator,
    },
  }

  if (records.length <= LEAF_SIZE || depth >= MAX_DEPTH) {
    node.records = records.map((record) => ({
      id: record.id,
      title: record.title,
      layerId: record.layerId,
      kind: record.kind,
      status: record.status,
      municipalityCode: record.municipalityCode,
      regionId: record.regionId,
      lat: record.lat,
      lon: record.lon,
      summary: record.summary,
      description: record.description,
      address: record.address,
      capacity: record.capacity,
      area: record.area,
      operator: record.operator,
    }))
    return node
  }

  const children = childBounds(bounds)
  const midLon = (bounds.minLon + bounds.maxLon) / 2
  const midLat = (bounds.minLat + bounds.maxLat) / 2
  const groups = [[], [], [], []]
  for (const record of records) {
    const east = record.lon >= midLon ? 1 : 0
    const north = record.lat >= midLat ? 2 : 0
    groups[east + north].push(record)
  }
  node.children = children
    .map((child, index) => groups[index].length > 0 ? buildNode(groups[index], child, depth + 1) : null)
    .filter(Boolean)
  return node
}

const collectLayerRecordsByRegion = (layer) => {
  const dir = path.join(sourceDataRoot, layer.dir)
  const byRegion = new Map()
  if (!fs.existsSync(dir)) {
    console.warn(`[representative-qtct] source dir missing, skipping layer "${layer.id}": ${dir}`)
    return byRegion
  }
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
    const regionId = path.basename(file, '.json')
    const records = []
    readItems(path.join(dir, file)).forEach((item, index) => {
      const record = normalizeRecord(item, layer, regionId, index)
      if (record) records.push(record)
    })
    byRegion.set(regionId, records)
  }
  return byRegion
}

// === summary スリム化 =====================================================
// 全国 summary は (evac で) 129k 点 → 素直に吐くと 66MB。エンジン (collectVisible/draw/
// featurePayload) が summary で実際に消費するフィールドだけ残し、小さなサブツリーを
// クラスタに畳む。
//  - node.id / node.count / records は未消費 → 出力しない
//  - representative は id/title/status/municipalityCode/regionId/lat/lon/representative/count のみ
//    (summary/description/address 等はクラスタピンの詳細カードでは出さない)
//  - bounds は外側丸め4桁 (~11m, intersects カリングには十分)、lat/lon は5桁 (~1.1m)
//  - count<=SUMMARY_PRUNE_COUNT のサブツリーは1ノードに畳む (最深ズーム帯で ≤8件が
//    1つの代表ピンになる。zoom>=11.5 は detail ツリーに切り替わるため影響は低ズーム帯のみ)
const SUMMARY_PRUNE_COUNT = 8
const roundFloor4 = (v) => Math.floor(v * 1e4) / 1e4
const roundCeil4 = (v) => Math.ceil(v * 1e4) / 1e4
const round5 = (v) => Math.round(v * 1e5) / 1e5

const slimSummaryNode = (node) => {
  if (!node) return null
  const rep = node.representative
  const out = {
    depth: node.depth,
    bounds: {
      minLon: roundFloor4(node.bounds.minLon),
      minLat: roundFloor4(node.bounds.minLat),
      maxLon: roundCeil4(node.bounds.maxLon),
      maxLat: roundCeil4(node.bounds.maxLat),
    },
    representative: {
      id: rep.id,
      title: rep.title,
      status: rep.status,
      municipalityCode: rep.municipalityCode,
      regionId: rep.regionId,
      lat: round5(rep.lat),
      lon: round5(rep.lon),
      representative: rep.representative,
      count: rep.count,
    },
  }
  if (node.count > SUMMARY_PRUNE_COUNT && node.children) {
    out.children = node.children.map(slimSummaryNode).filter(Boolean)
  }
  return out
}

const writeJson = (root, relativePath, value) => {
  const outPath = path.join(root, relativePath)
  const body = `${JSON.stringify(value)}\n`
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  if (!fs.existsSync(outPath) || fs.readFileSync(outPath, 'utf8') !== body) {
    fs.writeFileSync(outPath, body, 'utf8')
  }
}

fs.mkdirSync(outRoot, { recursive: true })

for (const layer of layers) {
  const sourceDir = path.join(sourceDataRoot, layer.dir)
  if (!fs.existsSync(sourceDir)) {
    // No source data in this checkout (e.g. CI/Vercel where public/map/data/* is gitignored).
    // Skip regeneration entirely so the committed map/data/qtct/ artifact is
    // preserved and later copied to public/ by prepare-public-assets. Do NOT rmSync here.
    console.warn(`[representative-qtct] source dir missing, keeping committed output for "${layer.id}": ${sourceDir}`)
    continue
  }
  fs.mkdirSync(path.join(outRoot, layer.id), { recursive: true })
  const byRegion = collectLayerRecordsByRegion(layer)
  const allRecords = []
  let total = 0
  for (const [regionId, records] of byRegion) {
    nextNodeId = 0
    total += records.length
    allRecords.push(...records)
    const tree = records.length > 0 ? buildNode(records, JAPAN_BOUNDS, 0) : null
    const out = {
      schemaVersion: 1,
      layerId: layer.id,
      regionId,
      label: layer.label,
      bounds: JAPAN_BOUNDS,
      total: records.length,
      maxDepth: MAX_DEPTH,
      leafSize: LEAF_SIZE,
      tree,
    }
    writeJson(outRoot, path.join(layer.id, regionId, 'detail.json'), out)
  }
  nextNodeId = 0
  const summaryTree = allRecords.length > 0 ? slimSummaryNode(buildNode(allRecords, JAPAN_BOUNDS, 0)) : null
  const summary = {
    schemaVersion: 1,
    layerId: layer.id,
    regionId: 'all',
    label: layer.label,
    bounds: JAPAN_BOUNDS,
    total,
    maxDepth: MAX_DEPTH,
    leafSize: LEAF_SIZE,
    tree: summaryTree,
  }
  writeJson(outRoot, path.join(layer.id, 'summary.json'), summary)
  console.log(`[representative-qtct] ${layer.id}: ${total.toLocaleString()} records in ${byRegion.size} regions -> ${outRoot}`)
}
