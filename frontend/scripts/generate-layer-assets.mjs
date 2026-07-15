#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeQtctDocument } from '../../map/layers/portable/representative-pins/qtctBuilder.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(frontendRoot, '..')
const managedRoot = path.join(projectRoot, 'map', 'layers', 'managed')
const regionsIndexPath = path.join(projectRoot, 'map', 'regions', 'index.json')
const outRoot = path.join(projectRoot, 'map', 'data', 'qtct')
const publicOutRoot = path.join(frontendRoot, 'public', 'map', 'data', 'qtct')

const parseCsv = (text) => {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  const [headerRow, ...dataRows] = rows.filter((r) => r.some((c) => String(c).trim() !== ''))
  if (!headerRow) return []
  const headers = headerRow.map((h) => String(h).trim())
  return dataRows.map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ''])))
}

const firstValue = (row, names) => {
  for (const name of names.filter(Boolean)) {
    if (row[name] !== undefined && String(row[name]).trim() !== '') return row[name]
  }
  return ''
}

const asNumber = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

const asBoolean = (value) => {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return null
  if (['true', '1', 'yes', 'y', 'on', 'はい'].includes(text)) return true
  if (['false', '0', 'no', 'n', 'off', 'いいえ'].includes(text)) return false
  return null
}

const coercePropertyValue = (value, type = 'string') => {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (type === 'number') return asNumber(text)
  if (type === 'boolean') return asBoolean(text)
  if (type === 'json') {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  return text
}

const propertyColumnsForRow = (row, propertyColumns = {}) => {
  const properties = {}
  for (const [propertyName, spec] of Object.entries(propertyColumns || {})) {
    const column = typeof spec === 'string' ? spec : spec?.column
    if (!column) continue
    const value = coercePropertyValue(row[column], typeof spec === 'object' ? spec.type : 'string')
    if (value !== null) properties[propertyName] = value
  }
  return properties
}

const loadManagedConfigs = () => {
  if (!fs.existsSync(managedRoot)) return []
  const configs = []
  for (const entry of fs.readdirSync(managedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const configPath = path.join(managedRoot, entry.name, 'layer.config.json')
    if (!fs.existsSync(configPath)) continue
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    configs.push({ dirName: entry.name, dir: path.dirname(configPath), configPath, config })
  }
  return configs
}

const loadRegions = () => {
  const index = JSON.parse(fs.readFileSync(regionsIndexPath, 'utf8'))
  const regions = index.regions ?? []
  const byPrefCode = new Map(regions.map((region) => [String(Number(region.prefCode)).padStart(2, '0'), region.id]))
  return { regions, byPrefCode }
}

const normalizeCsvRecord = (row, config, build, regionId, index) => {
  const lat = asNumber(firstValue(row, [build.latitudeColumn, 'lat', 'latitude', '緯度']))
  const lon = asNumber(firstValue(row, [build.longitudeColumn, 'lon', 'lng', 'longitude', '経度']))
  if (lat == null || lon == null) return null
  const qtctLayer = build.qtctLayer || config.layer || config.id.replace(/^layer-/, '')
  const id = String(firstValue(row, [build.idColumn, 'id', 'ID']) || `${qtctLayer}:${regionId}:${index}`)
  const title = String(firstValue(row, [build.titleColumn, 'title', 'name', '名称', '名前']) || id)
  const description = String(firstValue(row, [build.descriptionColumn, 'description', 'summary', '説明', '備考']) || '')
  return {
    id,
    title,
    layerId: qtctLayer,
    kind: build.kindName || 'csv-poi',
    status: String(firstValue(row, [build.statusColumn, 'status', '状態']) || build.defaultStatus || 'unknown'),
    municipalityCode: String(firstValue(row, [build.municipalityCodeColumn, 'municipalityCode', 'municipality_code', '自治体コード']) || ''),
    regionId,
    lat,
    lon,
    summary: String(firstValue(row, [build.summaryColumn, 'summary', '概要']) || description),
    description,
    address: String(firstValue(row, [build.addressColumn, 'address', '住所']) || ''),
    capacity: firstValue(row, [build.capacityColumn, 'capacity', '収容人数']) || null,
    area: String(firstValue(row, [build.areaColumn, 'area', '地区']) || ''),
    operator: String(firstValue(row, [build.operatorColumn, 'operator', '運営者']) || ''),
    properties: propertyColumnsForRow(row, build.propertyColumns),
  }
}

const regionIdForRow = (row, build, byPrefCode) => {
  const regionId = String(firstValue(row, [build.regionColumn, 'regionId', 'region_id']) || '').trim()
  if (regionId) return regionId
  const rawPrefCode = String(firstValue(row, [build.prefCodeColumn, 'prefCode', 'pref_code', '都道府県コード']) || '').trim()
  if (!rawPrefCode) return ''
  return byPrefCode.get(String(Number(rawPrefCode)).padStart(2, '0')) || ''
}

const writeJson = (root, relativePath, value) => {
  const outPath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(value)}\n`, 'utf8')
}

const generateCsvQtctLayer = ({ dir, configPath, config }, regionsContext) => {
  const build = config.build || {}
  const sourcePath = path.resolve(dir, build.source || build.csv || 'data.csv')
  if (!fs.existsSync(sourcePath)) throw new Error(`${configPath}: CSV source not found: ${sourcePath}`)
  const qtctLayer = build.qtctLayer || config.layer || config.id.replace(/^layer-/, '')
  const label = config.title || qtctLayer
  const rows = parseCsv(fs.readFileSync(sourcePath, 'utf8'))
  const byRegion = new Map(regionsContext.regions.map((region) => [region.id, []]))
  const allRecords = []
  rows.forEach((row, index) => {
    const explicitRegionId = regionIdForRow(row, build, regionsContext.byPrefCode)
    const targetRegionIds = explicitRegionId ? [explicitRegionId] : regionsContext.regions.map((region) => region.id)
    for (const regionId of targetRegionIds) {
      const record = normalizeCsvRecord(row, config, build, regionId, index)
      if (!record) continue
      if (!byRegion.has(regionId)) byRegion.set(regionId, [])
      byRegion.get(regionId).push(record)
      if (explicitRegionId || targetRegionIds[0] === regionId) allRecords.push(record)
    }
  })

  for (const root of [outRoot, publicOutRoot]) {
    fs.rmSync(path.join(root, qtctLayer), { recursive: true, force: true })
  }
  for (const [regionId, records] of byRegion) {
    const detail = makeQtctDocument({ layerId: qtctLayer, regionId, label, records })
    for (const root of [outRoot, publicOutRoot]) {
      writeJson(root, path.join(qtctLayer, regionId, 'detail.json'), detail)
    }
  }
  const summary = makeQtctDocument({ layerId: qtctLayer, regionId: 'all', label, records: allRecords, summary: true })
  for (const root of [outRoot, publicOutRoot]) {
    writeJson(root, path.join(qtctLayer, 'summary.json'), summary)
  }
  console.log(`[layer-assets] ${qtctLayer}: ${allRecords.length.toLocaleString()} CSV records -> QTCT (${byRegion.size} regions)`)
}

const loadRegionRuntimeContexts = (regions) => regions.map((region) => {
  const runtimePath = path.join(projectRoot, 'map', 'regions', region.id, 'runtime-config.json')
  const runtime = fs.existsSync(runtimePath)
    ? JSON.parse(fs.readFileSync(runtimePath, 'utf8'))
    : {}
  return {
    ...region,
    initialViewport: runtime.initialViewport || null,
  }
})

const nearestRegionId = (record, regionContexts) => {
  let best = regionContexts[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const region of regionContexts) {
    const view = region.initialViewport
    if (!view) continue
    const dLat = Number(record.lat) - Number(view.lat)
    const dLon = Number(record.lon) - Number(view.lon)
    const score = dLat * dLat + dLon * dLon
    if (score < bestScore) {
      best = region
      bestScore = score
    }
  }
  return best?.id || ''
}

const regionIdForText = (record, regionContexts) => {
  const haystack = [
    record.location,
    record.title,
    record.river,
    record.provider,
    record.pageUrl,
  ].map((value) => String(value || '')).join(' ')
  const matched = regionContexts.find((region) =>
    region.prefecture && haystack.includes(region.prefecture)
  )
  return matched?.id || nearestRegionId(record, regionContexts)
}

const normalizeWebcamRecord = (camera, qtctLayer, regionId) => ({
  id: String(camera.id || `${qtctLayer}:${camera.cameraId || camera.lat + ',' + camera.lon}`),
  title: String(camera.title || '河川監視カメラ'),
  layerId: qtctLayer,
  kind: 'webcam',
  status: 'available',
  municipalityCode: '',
  regionId,
  lat: Number(camera.lat),
  lon: Number(camera.lon),
  summary: String(camera.river || camera.location || ''),
  description: String(camera.location || ''),
  address: String(camera.location || ''),
  capacity: null,
  area: String(camera.river || ''),
  operator: String(camera.provider || ''),
  cameraId: String(camera.cameraId || ''),
  river: String(camera.river || ''),
  location: String(camera.location || ''),
  imageUrl: String(camera.imageUrl || ''),
  normalImageUrl: String(camera.normalImageUrl || ''),
  liveUrl: String(camera.liveUrl || ''),
  pageUrl: String(camera.pageUrl || ''),
  provider: String(camera.provider || ''),
})

const generateWebcamQtctLayer = ({ dir, configPath, config }, regionsContext) => {
  const build = config.build || {}
  const sourcePath = path.resolve(dir, build.source || build.json || '../../portable/japan-river-webcams/data/cameras.json')
  if (!fs.existsSync(sourcePath)) throw new Error(`${configPath}: webcam source not found: ${sourcePath}`)
  const qtctLayer = build.qtctLayer || config.layer || config.id.replace(/^layer-/, '')
  const label = config.title || qtctLayer
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  const cameras = Array.isArray(source.cameras) ? source.cameras : []
  const regionContexts = loadRegionRuntimeContexts(regionsContext.regions)
  const byRegion = new Map(regionsContext.regions.map((region) => [region.id, []]))
  const allRecords = []

  for (const camera of cameras) {
    const lat = asNumber(camera.lat)
    const lon = asNumber(camera.lon)
    if (lat == null || lon == null) continue
    const regionId = regionIdForText({ ...camera, lat, lon }, regionContexts)
    const record = normalizeWebcamRecord({ ...camera, lat, lon }, qtctLayer, regionId)
    if (!byRegion.has(regionId)) byRegion.set(regionId, [])
    byRegion.get(regionId).push(record)
    allRecords.push(record)
  }

  for (const root of [outRoot, publicOutRoot]) {
    fs.rmSync(path.join(root, qtctLayer), { recursive: true, force: true })
  }
  for (const [regionId, records] of byRegion) {
    const detail = makeQtctDocument({ layerId: qtctLayer, regionId, label, records })
    for (const root of [outRoot, publicOutRoot]) {
      writeJson(root, path.join(qtctLayer, regionId, 'detail.json'), detail)
    }
  }
  const summary = makeQtctDocument({ layerId: qtctLayer, regionId: 'all', label, records: allRecords, summary: true })
  for (const root of [outRoot, publicOutRoot]) {
    writeJson(root, path.join(qtctLayer, 'summary.json'), summary)
  }
  console.log(`[layer-assets] ${qtctLayer}: ${allRecords.length.toLocaleString()} webcam records -> QTCT (${byRegion.size} regions)`)
}

const regionsContext = loadRegions()
const csvQtctLayers = loadManagedConfigs().filter(({ config }) => config.build?.kind === 'csv-qtct')
const webcamQtctLayers = loadManagedConfigs().filter(({ config }) => config.build?.kind === 'webcam-qtct')

if (csvQtctLayers.length === 0) {
  console.log('[layer-assets] no managed build.kind=csv-qtct layers')
} else {
  for (const layer of csvQtctLayers) generateCsvQtctLayer(layer, regionsContext)
}

for (const layer of webcamQtctLayers) generateWebcamQtctLayer(layer, regionsContext)
