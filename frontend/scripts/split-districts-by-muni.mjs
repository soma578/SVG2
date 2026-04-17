#!/usr/bin/env node
/**
 * 地区 GeoJSON を市区町村単位に分割する。
 *
 * districts_metadata.json に記載された全 high_zoom ファイルを読み込み、
 * key_code の先頭 5 桁（市区町村コード）ごとに分割して書き出す。
 * summary.json と manifest.json の districtIndexByMunicipality を自動更新する。
 *
 * Usage:
 *   node scripts/split-districts-by-muni.mjs --region okayama [--dry-run]
 *
 * Options:
 *   --region   対象 regionId (required)
 *   --dry-run  ファイルへの書き込みをせず結果のみ表示
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const DISTRICTS_DIR = join(ROOT, 'public', 'districts')
const METADATA_PATH = join(DISTRICTS_DIR, 'districts_metadata.json')

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key.slice(2)] = argv[++i]
    } else {
      args[key.slice(2)] = true
    }
  }
  return args
}

const args = parseArgs(process.argv)
const region = args.region
const dryRun = Boolean(args['dry-run'])

if (!region) {
  console.error('Usage: node scripts/split-districts-by-muni.mjs --region <regionId> [--dry-run]')
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the 5-digit municipality code from a district key_code.
 * Returns null for codes shorter than 5 characters.
 */
function extractMunicipalityCode(keyCode) {
  const digits = String(keyCode ?? '').replace(/\D/g, '')
  if (digits.length < 5) return null
  return digits.slice(0, 5)
}

function writeJson(filePath, data) {
  if (dryRun) {
    console.log(`  [dry-run] would write: ${filePath}`)
    return
  }
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

// ── Load source files ─────────────────────────────────────────────────────────

if (!existsSync(METADATA_PATH)) {
  console.error(`districts_metadata.json not found: ${METADATA_PATH}`)
  process.exit(1)
}

const metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'))
const areas = metadata?.areas ?? {}
const areaKeys = Object.keys(areas)

if (areaKeys.length === 0) {
  console.error('districts_metadata.json contains no areas')
  process.exit(1)
}

console.log(`Region: ${region}`)
console.log(`Source areas: ${areaKeys.join(', ')}`)
if (dryRun) console.log('Mode: dry-run')
console.log()

// Load all high_zoom files and merge features.
/** @type {Array<{feature: any, sourceFile: string}>} */
const allFeatures = []
let skippedCount = 0

for (const areaKey of areaKeys) {
  const area = areas[areaKey]
  const highZoomFile = area?.high_zoom?.file
  if (!highZoomFile) {
    console.warn(`  [warn] no high_zoom.file for area "${areaKey}", skipping`)
    continue
  }

  const filePath = join(DISTRICTS_DIR, highZoomFile)
  if (!existsSync(filePath)) {
    console.warn(`  [warn] file not found: ${filePath}, skipping area "${areaKey}"`)
    continue
  }

  const geojson = JSON.parse(readFileSync(filePath, 'utf-8'))
  const features = Array.isArray(geojson?.features) ? geojson.features : []
  console.log(`Loaded: ${highZoomFile} (${features.length} features)`)
  allFeatures.push(...features.map(f => ({ feature: f, sourceFile: highZoomFile })))
}

console.log(`\nTotal loaded: ${allFeatures.length} features`)

// ── Split by municipality code ───────────────────────────────────────────────

/** @type {Map<string, {features: any[], cityName: string}>} */
const byMuni = new Map()

for (const { feature, sourceFile } of allFeatures) {
  const keyCode = feature?.properties?.key_code
  const muniCode = extractMunicipalityCode(keyCode)

  if (!muniCode) {
    // key_code is too short to extract a municipality code — likely a
    // placeholder feature without proper district-level data.
    const city = feature?.properties?.city ?? '(unknown)'
    console.warn(`  [warn] skipping feature with invalid key_code "${keyCode}" (city: ${city}, source: ${sourceFile})`)
    skippedCount++
    continue
  }

  if (!byMuni.has(muniCode)) {
    byMuni.set(muniCode, { features: [], cityName: '' })
  }
  const entry = byMuni.get(muniCode)
  entry.features.push(feature)

  // Derive municipality name from city property (last seen wins; all features
  // for the same muni should have the same city value).
  const city = String(feature?.properties?.city ?? '').trim()
  if (city) entry.cityName = city
}

console.log(`\nMunicipalities found: ${byMuni.size}`)
if (skippedCount > 0) {
  console.log(`Skipped features (invalid key_code): ${skippedCount}`)
}

// ── Write per-municipality GeoJSON files ─────────────────────────────────────

const outputDir = join(ROOT, 'public', 'data', region, 'districts')
const newIndex = {}

console.log()
for (const [muniCode, { features, cityName }] of [...byMuni.entries()].sort()) {
  const geojson = { type: 'FeatureCollection', features }
  const relativePath = `/data/${region}/districts/${muniCode}.geojson`
  const outputPath = join(outputDir, `${muniCode}.geojson`)

  console.log(`  ${muniCode} (${cityName || '?'}): ${features.length} features → ${outputPath}`)
  writeJson(outputPath, geojson)
  newIndex[muniCode] = relativePath
}

// ── Update summary.json ───────────────────────────────────────────────────────

const summaryPath = join(outputDir, 'summary.json')
const summary = {
  generatedAt: new Date().toISOString(),
  municipalities: Object.fromEntries(
    [...byMuni.entries()].sort().map(([code, { features, cityName }]) => [
      code,
      { name: cityName || code, featureCount: features.length },
    ])
  ),
}

console.log(`\nWriting summary.json (${byMuni.size} entries)`)
writeJson(summaryPath, summary)

// ── Update manifest.json ──────────────────────────────────────────────────────

const manifestPath = join(ROOT, 'public', 'regions', region, 'manifest.json')
if (!existsSync(manifestPath)) {
  console.warn(`\n[warn] manifest not found at ${manifestPath}, skipping manifest update`)
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

  const existingIndex = manifest.districtIndexByMunicipality ?? {}
  const mergedIndex = { ...existingIndex, ...newIndex }

  // Preserve alphabetical key order for diff readability.
  const sortedIndex = Object.fromEntries(Object.entries(mergedIndex).sort())
  manifest.districtIndexByMunicipality = sortedIndex

  // Keep districtSummaryPath in sync.
  manifest.districtSummaryPath = `/data/${region}/districts/summary.json`

  console.log(`Updating manifest: ${manifestPath}`)
  console.log(`  districtIndexByMunicipality: ${Object.keys(sortedIndex).length} entries`)
  writeJson(manifestPath, manifest)
}

// ── Done ─────────────────────────────────────────────────────────────────────

console.log('\nDone.')
if (dryRun) console.log('(dry-run: no files were written)')
