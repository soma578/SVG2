#!/usr/bin/env node
/**
 * 市区町村単位の district SVG ファイルを生成する。
 *
 * 既存の per-muni GeoJSON (/public/data/{region}/districts/{muni}.geojson) を読み込み、
 * SVGMap 互換形式の SVG ファイルを /public/data/{region}/districts-svg/{muni}.svg として出力する。
 * summary.json を生成し、featureCount が 800 超の市区町村は警告を出す。
 * manifest.json の districtSvgIndexByMunicipality + districtSvgSummaryPath を更新する。
 *
 * Usage:
 *   node scripts/split-districts-svg-by-muni.mjs --region okayama [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const HEAVY_THRESHOLD = 800

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
  console.error('Usage: node scripts/split-districts-svg-by-muni.mjs --region <regionId> [--dry-run]')
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function writeFile(filePath, content) {
  if (dryRun) {
    console.log(`  [dry-run] would write: ${filePath}`)
    return
  }
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
}

function writeJson(filePath, data) {
  writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

/** GeoJSON Polygon/MultiPolygon coordinates → SVG path d 文字列 */
function geomToPathD(geometry) {
  const P = 6
  const ring2d = (ring) => {
    const pts = ring.map(([lon, lat]) => `${lon.toFixed(P)} ${lat.toFixed(P)}`)
    return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`
  }

  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map(ring2d).join(' ')
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap(poly => poly.map(ring2d)).join(' ')
  }
  return ''
}

/** フィーチャー群の lon/lat バウンディングボックスを計算 */
function calcBbox(features) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const f of features) {
    const coords = []
    const collect = (arr) => {
      if (typeof arr[0] === 'number') { coords.push(arr); return }
      arr.forEach(collect)
    }
    collect(f.geometry.coordinates)
    for (const [lon, lat] of coords) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  return { minLon, maxLon, minLat, maxLat }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const geojsonDir  = join(ROOT, 'public', 'data', region, 'districts')
const svgDir      = join(ROOT, 'public', 'data', region, 'districts-svg')
const manifestPath = join(ROOT, 'public', 'regions', region, 'manifest.json')

if (!existsSync(geojsonDir)) {
  console.error(`districts dir not found: ${geojsonDir}`)
  process.exit(1)
}
if (!existsSync(manifestPath)) {
  console.error(`manifest not found: ${manifestPath}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
const geoJsonIndex = manifest.districtIndexByMunicipality ?? {}
const muniCodes = Object.keys(geoJsonIndex).sort()

if (muniCodes.length === 0) {
  console.error('districtIndexByMunicipality is empty. Run split-districts-by-muni.mjs first.')
  process.exit(1)
}

console.log(`Region: ${region}`)
console.log(`Municipalities: ${muniCodes.length}`)
if (dryRun) console.log('Mode: dry-run')
console.log()

const newIndex = {}
const summaryMunis = {}
const warnings = []

for (const muniCode of muniCodes) {
  const geojsonPath = join(ROOT, 'public', geoJsonIndex[muniCode].replace(/^\//, ''))
  if (!existsSync(geojsonPath)) {
    console.warn(`  [warn] GeoJSON not found: ${geojsonPath}, skipping ${muniCode}`)
    continue
  }

  const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8'))
  const features = Array.isArray(geojson.features) ? geojson.features : []
  const featureCount = features.length
  const cityName = String(features[0]?.properties?.city ?? muniCode)

  if (featureCount > HEAVY_THRESHOLD) {
    warnings.push({ muniCode, cityName, featureCount })
  }

  // Bounding box → viewBox (lon_min lat_min lon_span lat_span in geographic coords)
  const bbox = calcBbox(features)
  const pad = 0.01
  const vbMinLon = (bbox.minLon - pad).toFixed(4)
  const vbMinLat = (bbox.minLat - pad).toFixed(4)
  const vbW      = (bbox.maxLon - bbox.minLon + pad * 2).toFixed(4)
  const vbH      = (bbox.maxLat - bbox.minLat + pad * 2).toFixed(4)

  // Build SVG paths
  const paths = features.map(f => {
    const props = f.properties ?? {}
    const id    = props.key_code ? `k_${props.key_code}` : ''
    const title = props.name ?? [props.city, props.ward, props.district].filter(Boolean).join(' ')
    const d     = geomToPathD(f.geometry)
    if (!d) return ''
    return `  <path${id ? ` id="${id}"` : ''} class="district" d="${d}"><title>${title}</title></path>`
  }).filter(Boolean).join('\n')

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="${vbMinLon} ${vbMinLat} ${vbW} ${vbH}"
     xmlns:go="http://purl.org/svgmap/profile">
<globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />
<defs>
  <style>
    .district {
      fill: rgba(100, 150, 200, 0.05);
      stroke: rgba(50, 100, 150, 0.6);
      stroke-width: 0.001;
      pointer-events: none;
    }
  </style>
</defs>
<g id="districts">
${paths}
</g>
</svg>
`

  const relativePath = `/data/${region}/districts-svg/${muniCode}.svg`
  const outputPath   = join(svgDir, `${muniCode}.svg`)
  const marker       = featureCount > HEAVY_THRESHOLD ? ' ⚠' : ''
  console.log(`  ${muniCode} (${cityName}): ${featureCount} features${marker} → ${outputPath}`)
  writeFile(outputPath, svg)

  newIndex[muniCode] = relativePath
  summaryMunis[muniCode] = { name: cityName, featureCount }
}

// ── Warnings ─────────────────────────────────────────────────────────────────
if (warnings.length > 0) {
  console.log()
  console.log(`⚠ featureCount > ${HEAVY_THRESHOLD} — 要簡略化検討:`)
  for (const { muniCode, cityName, featureCount } of warnings) {
    console.log(`  ${muniCode} ${cityName}: ${featureCount} path`)
  }
}

// ── summary.json ─────────────────────────────────────────────────────────────
const summaryPath = join(svgDir, 'summary.json')
const summary = {
  generatedAt: new Date().toISOString(),
  heavyThreshold: HEAVY_THRESHOLD,
  municipalities: summaryMunis,
}
console.log(`\nWriting summary.json (${Object.keys(summaryMunis).length} entries)`)
writeJson(summaryPath, summary)

// ── manifest.json ─────────────────────────────────────────────────────────────
const sortedIndex = Object.fromEntries(Object.entries(newIndex).sort())
manifest.districtSvgIndexByMunicipality = sortedIndex
manifest.districtSvgSummaryPath = `/data/${region}/districts-svg/summary.json`

console.log(`Updating manifest: ${manifestPath}`)
console.log(`  districtSvgIndexByMunicipality: ${Object.keys(sortedIndex).length} entries`)
writeJson(manifestPath, manifest)

console.log('\nDone.')
if (dryRun) console.log('(dry-run: no files were written)')
