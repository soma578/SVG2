#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { expandTokens } from './lib/scanLayers.mjs'

const projectRoot = path.resolve(process.cwd(), '..')
const districtRoot = path.join(projectRoot, 'map', 'data', 'districts')
const index = JSON.parse(fs.readFileSync(path.join(districtRoot, 'index.json'), 'utf8'))

assert.equal(index.schemaVersion, 1)
assert.equal(index.publicUrlTemplate, '/data/{regionId}/districts-svg/{code}.svg')
assert.equal(
  expandTokens('{districtBaseUrl}/districts-svg/{code}.svg', {
    regionId: 'okayama',
    prefCode: '33',
    districtBaseUrl: 'https://cdn.example.test/districts/okayama',
  }),
  'https://cdn.example.test/districts/okayama/districts-svg/{code}.svg',
)
let totalFiles = 0
let totalBytes = 0
for (const region of index.regions || []) {
  assert.match(region.id, /^[a-z][a-z0-9-]+$/)
  const manifestPath = path.join(districtRoot, region.id, 'assets.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.regionId, region.id)
  assert.equal(manifest.fileCount, manifest.files.length)
  let bytes = 0
  for (const file of manifest.files) {
    assert.match(file.path, /^districts-svg\/\d{5}\.svg$/)
    const assetPath = path.join(districtRoot, region.id, file.path)
    assert.ok(fs.existsSync(assetPath), `${region.id}: missing ${file.path}`)
    const stat = fs.statSync(assetPath)
    assert.equal(stat.size, file.bytes, `${region.id}: size mismatch ${file.path}`)
    bytes += stat.size
  }
  assert.equal(bytes, manifest.bytes)
  assert.equal(region.fileCount, manifest.fileCount)
  assert.equal(region.bytes, manifest.bytes)
  const municipalitiesPath = path.join(projectRoot, 'map', 'regions', region.id, 'municipalities.json')
  const municipalities = JSON.parse(fs.readFileSync(municipalitiesPath, 'utf8')).municipalities || []
  for (const municipality of municipalities) {
    for (const url of municipality.districtSvgUrls || []) {
      const match = String(url).match(new RegExp(`^/data/${region.id}/districts-svg/(\\d{5})\\.svg$`))
      assert.ok(match, `${region.id}/${municipality.id}: invalid legacy district URL ${url}`)
      assert.ok(
        fs.existsSync(path.join(districtRoot, region.id, 'districts-svg', `${match[1]}.svg`)),
        `${region.id}/${municipality.id}: legacy district URL has no source asset ${url}`,
      )
    }
  }
  totalFiles += manifest.fileCount
  totalBytes += manifest.bytes
}
assert.equal(index.totals.regions, index.regions.length)
assert.equal(index.totals.files, totalFiles)
assert.equal(index.totals.bytes, totalBytes)
console.log(`[districts:check] OK: ${index.totals.regions} regions, ${totalFiles} files, ${totalBytes} bytes`)
