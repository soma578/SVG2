#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(frontendRoot, '..')
const sourceDataRoot = path.join(frontendRoot, 'public', 'map', 'data')
const outRoot = path.join(projectRoot, 'map', 'data', 'representative-qtct')
const publicOutRoot = path.join(frontendRoot, 'public', 'map', 'data', 'representative-qtct')

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

const stripLeafRecords = (node) => {
  if (!node) return null
  const { records, children, ...rest } = node
  if (!children) return rest
  return {
    ...rest,
    children: children.map(stripLeafRecords).filter(Boolean),
  }
}

const writeJson = (root, relativePath, value) => {
  const outPath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(value)}\n`, 'utf8')
}

for (const root of [outRoot, publicOutRoot]) {
  fs.mkdirSync(root, { recursive: true })
}

for (const layer of layers) {
  for (const root of [outRoot, publicOutRoot]) {
    const layerOut = path.join(root, layer.id)
    fs.rmSync(layerOut, { recursive: true, force: true })
    fs.mkdirSync(layerOut, { recursive: true })
  }
  const byRegion = collectLayerRecordsByRegion(layer)
  const allRecords = []
  let total = 0
  for (const [regionId, records] of byRegion) {
    nextNodeId = 0
    total += records.length
    allRecords.push(...records)
    const tree = records.length > 0 ? buildNode(records, JAPAN_BOUNDS, 0) : null
    const out = {
      version: 1,
      type: 'representative-qtct',
      layerId: layer.id,
      label: layer.label,
      regionId,
      bounds: JAPAN_BOUNDS,
      total: records.length,
      maxDepth: MAX_DEPTH,
      leafSize: LEAF_SIZE,
      tree,
    }
    for (const root of [outRoot, publicOutRoot]) {
      writeJson(root, path.join(layer.id, `${regionId}.json`), out)
    }
  }
  nextNodeId = 0
  const summaryTree = allRecords.length > 0 ? stripLeafRecords(buildNode(allRecords, JAPAN_BOUNDS, 0)) : null
  const summary = {
    version: 1,
    type: 'representative-qtct-summary',
    layerId: layer.id,
    label: layer.label,
    regionId: 'all',
    bounds: JAPAN_BOUNDS,
    total,
    maxDepth: MAX_DEPTH,
    leafSize: LEAF_SIZE,
    tree: summaryTree,
  }
  for (const root of [outRoot, publicOutRoot]) {
    writeJson(root, path.join(layer.id, 'all.json'), summary)
  }
  console.log(`[representative-qtct] ${layer.id}: ${total.toLocaleString()} records in ${byRegion.size} regions -> ${outRoot}, ${publicOutRoot}`)
}
