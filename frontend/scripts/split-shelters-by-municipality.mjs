#!/usr/bin/env node
/**
 * shelters-fallback.geojson を市区町村単位に分割する。
 *
 * Usage:
 *   node scripts/split-shelters-by-municipality.mjs \
 *     --region okayama \
 *     --muni 33101 \
 *     --match "岡山市北区"
 *
 * 出力:
 *   public/data/<region>/shelters/<muni>.json (ShelterRecord[])
 *   public/data/<region>/shelters/summary.json (集計件数)
 *
 * manifest.json への shelterIndexByMunicipality 追加は別途 patch-manifest で行う。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const value = argv[i + 1]
    args[key.slice(2)] = value
    i += 1
  }
  return args
}

const args = parseArgs(process.argv)
const region = args.region
const muni = args.muni
const match = args.match

if (!region || !muni || !match) {
  console.error('Usage: --region <id> --muni <code> --match <address-substring>')
  process.exit(1)
}

const fallbackPath = join(ROOT, 'public', 'regions', region, 'shelters-fallback.geojson')
if (!existsSync(fallbackPath)) {
  console.error(`fallback geojson not found: ${fallbackPath}`)
  process.exit(1)
}

const geojson = JSON.parse(readFileSync(fallbackPath, 'utf-8'))
const features = Array.isArray(geojson?.features) ? geojson.features : []

function toShelterRecord(feature, index) {
  const coords = feature?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const lon = Number(coords[0])
  const lat = Number(coords[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const props = feature?.properties ?? {}
  const rawId = String(props.id ?? `shelter-${index + 1}`).trim() || `shelter-${index + 1}`
  const title = String(props.title ?? props.name ?? '').trim()
  if (!title) return null

  const capacity = Number.isFinite(Number(props.capacity)) ? Number(props.capacity) : null
  const allowedStatus = new Set(['open', 'closed', 'full', 'unknown'])
  const rawStatus = String(props.status ?? '').trim()
  const status = allowedStatus.has(rawStatus) ? rawStatus : 'unknown'

  return {
    id: `shelter-${rawId}`,
    title,
    kind: 'shelter',
    lat,
    lon,
    status,
    address: props.address ? String(props.address) : null,
    capacity: capacity != null && capacity >= 0 ? capacity : null,
    facilityType: props.facilityType ? String(props.facilityType) : null,
    barrierFree: null,
    pets: null,
    updatedAt: null,
    note: props.note ? String(props.note) : null,
  }
}

const matched = []
for (let i = 0; i < features.length; i += 1) {
  const feature = features[i]
  const address = String(feature?.properties?.address ?? '')
  if (!address.includes(match)) continue
  const record = toShelterRecord(feature, i)
  if (record) matched.push(record)
}

const outputPath = join(ROOT, 'public', 'data', region, 'shelters', `${muni}.json`)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(matched, null, 2)}\n`, 'utf-8')

const summaryPath = join(ROOT, 'public', 'data', region, 'shelters', 'summary.json')
let summary = {}
if (existsSync(summaryPath)) {
  summary = JSON.parse(readFileSync(summaryPath, 'utf-8'))
}
summary[muni] = matched.length
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')

console.log(`wrote ${matched.length} shelters to ${outputPath}`)
console.log(`updated summary: ${muni} = ${matched.length}`)
