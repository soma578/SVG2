#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const sharedDir = path.resolve(scriptDir, '..', '..', 'map', 'webapp', 'shared')
const portableMessagesPath = path.resolve(
  sharedDir,
  '..',
  '..',
  'layers',
  'portable',
  'representative-pins',
  'mapMessages.js',
)
const importSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const importerSource = fs.readFileSync(path.join(sharedDir, 'nativeLayerImporter.js'), 'utf8')
const messagesSource = fs.readFileSync(portableMessagesPath, 'utf8')
const messagesReExport = fs.readFileSync(path.join(sharedDir, 'mapMessages.js'), 'utf8')
const policySource = fs.readFileSync(path.join(sharedDir, 'messagePolicy.js'), 'utf8')

const { MAP_MESSAGES } = await importSource(messagesSource)
assert.ok(messagesReExport.includes('../../layers/portable/representative-pins/mapMessages.js'))
const { sanitizeRuntimeAnimation, importSingleLayer } = await importSource(importerSource)
const { isAuthorizedHostCommand } = await importSource(policySource.replace(
  "import { MAP_MESSAGES } from './mapMessages.js';",
  `const MAP_MESSAGES = ${JSON.stringify(MAP_MESSAGES)};`,
))
globalThis.location = { href: 'https://portal.example/map/webapp/native-map.html' }

const animation = {
  attributes: [
    { name: 'id', value: 'upstream-layer' },
    { name: 'title', value: 'Upstream layer' },
    { name: 'class', value: 'poi' },
    { name: 'data-controller', value: './controller.html#exec=hiddenOnLayerLoad' },
    { name: 'data-cross-origin-proxy-required', value: 'true' },
    { name: 'data-controller-src', value: 'alert(1)' },
    { name: 'data-script', value: 'alert(2)' },
    { name: 'data-arbitrary-host-contract', value: 'unsafe' },
    { name: 'data-lawa-mode', value: 'tight' },
  ],
  getAttribute(name) {
    if (name === 'xlink:href') return './layer.svg#mode=test'
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null
  },
}

const imported = sanitizeRuntimeAnimation(
  animation,
  'https://layers.example/container/Container.svg',
  0,
)
assert.ok(imported)
assert.equal(imported.attrs['xlink:href'], 'https://layers.example/container/layer.svg#mode=test')
assert.equal(
  imported.attrs['data-controller'],
  'https://layers.example/container/controller.html#exec=hiddenOnLayerLoad',
)
assert.equal(imported.attrs['data-lawa-mode'], 'isolated')
assert.equal(imported.attrs['data-external-source'], 'runtime')
assert.equal(imported.attrs['data-cross-origin-proxy-required'], 'true')
assert.equal(imported.attrs['data-controller-src'], undefined)
assert.equal(imported.attrs['data-script'], undefined)
assert.equal(imported.attrs['data-arbitrary-host-contract'], undefined)

const verifiedLocal = sanitizeRuntimeAnimation(animation, 'https://portal.example/releases/Container.svg', 0, {
  lawaMode: 'tight',
  sourceType: 'verified-artifact',
})
assert.equal(verifiedLocal.attrs['data-lawa-mode'], 'tight')
const signedExternal = sanitizeRuntimeAnimation(animation, 'https://layers.example/releases/Container.svg', 0, {
  lawaMode: 'tight',
  sourceType: 'signed-artifact',
})
assert.equal(signedExternal.attrs['data-lawa-mode'], 'isolated')

const direct = importSingleLayer({
  url: 'https://layers.example/direct.svg',
  title: 'Direct layer',
})
assert.equal(direct.attrs['data-lawa-mode'], 'isolated')
assert.equal(direct.attrs['data-external-source'], 'runtime')

const parentWindow = {}
const isolatedLayerWindow = {}
const selfOrigin = 'https://portal.example'
assert.equal(isAuthorizedHostCommand({
  type: MAP_MESSAGES.mapSetViewport,
  source: parentWindow,
  parentWindow,
  origin: selfOrigin,
  selfOrigin,
}), true)
assert.equal(isAuthorizedHostCommand({
  type: MAP_MESSAGES.mapSetViewport,
  source: isolatedLayerWindow,
  parentWindow,
  origin: 'null',
  selfOrigin,
}), false)
assert.equal(isAuthorizedHostCommand({
  type: MAP_MESSAGES.runtimeDataStatus,
  source: isolatedLayerWindow,
  parentWindow,
  origin: 'null',
  selfOrigin,
}), false)
assert.equal(isAuthorizedHostCommand({
  type: MAP_MESSAGES.runtimeDataStatus,
  source: isolatedLayerWindow,
  parentWindow,
  origin: 'null',
  selfOrigin,
  layerMessageAllowed: true,
}), true)

console.log('[check-runtime-layer-importer] OK: runtime imports are isolated and host commands are parent-only')
