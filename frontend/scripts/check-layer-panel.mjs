#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(
  path.resolve(scriptDir, '..', '..', 'map', 'webapp', 'shared', 'layerPanel.js'),
  'utf8',
).replace(
  /import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/layerHealth\.js['"];/,
  'const createLayerHealthDetail=()=>null;const healthDescription=()=>"";const layerHealthStatus=()=>({status:"pending",label:""});',
)
const {
  layerAccent,
  layerGroup,
  layerKind,
  layerSymbol,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

assert.equal(layerKind({ kind: 'poi' }), 'poi')
assert.equal(layerKind({ imported: true }), 'external')
assert.equal(layerKind({ className: 'poi clickable' }), 'poi')
assert.equal(layerKind({ className: 'vectorEtcData' }), 'vector')
assert.equal(layerGroup({ imported: true }), 'インポート')
assert.equal(layerGroup({ kind: 'external' }), '外部データ')
assert.equal(layerSymbol({ kind: 'external' }), '外')
assert.equal(layerAccent({ kind: 'external' }), '#8A5B25')
assert.equal(layerAccent({ accent: '#123ABC' }), '#123ABC')

console.log('[check-layer-panel] OK: generic layer kind, group, symbol and accent rules enforced')
