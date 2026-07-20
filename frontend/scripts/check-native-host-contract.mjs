#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..', '..')
const host = fs.readFileSync(path.join(projectRoot, 'map/webapp/current-map.html'), 'utf8')
const hazard = fs.readFileSync(path.join(projectRoot, 'map/webapp/layers/hazard/hazardLayer.html'), 'utf8')
const hazardConfig = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'map/layers/managed/hazard/layer.config.json'),
  'utf8',
))

for (const forbidden of [
  'broadcastHazardConfig',
  'hazardLayerReady',
  'hazardLayerDataReady',
  'evacuationDataUrl',
  "evacuation: { dataUrl:",
]) {
  assert.ok(!host.includes(forbidden), `host contains layer-specific contract: ${forbidden}`)
}
assert.ok(host.includes('broadcastRuntimeContext'))
assert.ok(host.includes('MAP_MESSAGES.runtimeLayerReady'))
assert.ok(host.includes('MAP_MESSAGES.mapSetMunicipalityFilter'))
assert.ok(hazardConfig.href.includes('layerKey=layer-hazard'))
assert.ok(hazard.includes('MAP_MESSAGES.runtimeLayerReady'))
assert.ok(hazard.includes('window.svgMap?.refreshScreen?.()'))
assert.ok(!hazard.includes('scheduleNativeReparse'))
assert.ok(!hazard.includes('MAP_MESSAGES.mapSetLayerConfig'))

console.log('[check-native-host-contract] OK: host runtime context is generic and hazard is self-configured')
