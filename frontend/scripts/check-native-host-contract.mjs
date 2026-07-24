#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..', '..')
const frontendRoot = path.join(projectRoot, 'frontend')
const host = fs.readFileSync(path.join(projectRoot, 'map/webapp/current-map.html'), 'utf8')
const nativeShellHtml = fs.readFileSync(path.join(projectRoot, 'map/webapp/native-map.html'), 'utf8')
const nativeShellScript = fs.readFileSync(path.join(projectRoot, 'map/webapp/native-map.js'), 'utf8')
const nativeShell = `${nativeShellHtml}\n${nativeShellScript}`
const regionPicker = fs.readFileSync(path.join(projectRoot, 'map/webapp/region-picker.html'), 'utf8')
const regionPickerScript = fs.readFileSync(path.join(projectRoot, 'map/webapp/region-picker.js'), 'utf8')
const artifactBrowser = fs.readFileSync(path.join(projectRoot, 'map/webapp/shared/artifactBrowser.js'), 'utf8')
const layerCatalogModule = fs.readFileSync(path.join(projectRoot, 'map/webapp/shared/layerCatalog.js'), 'utf8')
const layerAlertPoller = fs.readFileSync(path.join(projectRoot, 'map/webapp/shared/layerAlertPoller.js'), 'utf8')
const layerHealth = fs.readFileSync(path.join(projectRoot, 'map/webapp/shared/layerHealth.js'), 'utf8')
const layerSearch = fs.readFileSync(path.join(projectRoot, 'map/webapp/shared/layerSearch.js'), 'utf8')
const layerPanel = fs.readFileSync(path.join(projectRoot, 'map/webapp/shared/layerPanel.js'), 'utf8')
const regionSelector = fs.readFileSync(
  path.join(projectRoot, 'map/webapp/shared/regionSelector.js'),
  'utf8',
)
const teamActivityPublisher = fs.readFileSync(
  path.join(projectRoot, 'map/publishers/team-activity-csv/admin.html'),
  'utf8',
)
const hazard = fs.readFileSync(path.join(projectRoot, 'map/layers/portable/hazard/hazardLayer.html'), 'utf8')
const layerUi = fs.readFileSync(
  path.join(projectRoot, 'map/vendor/svgmapjs/SVGMapLv0.1_LayerUI_r6module.js'),
  'utf8',
)
const hazardConfig = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'map/layers/managed/hazard/layer.config.json'),
  'utf8',
))
const managedRoot = path.join(projectRoot, 'map/layers/managed')
const retiredDetailPaths = [
  'map/layers/managed/evacuation-detail/layer.config.json',
  'map/layers/managed/team-activity-detail/layer.config.json',
  'map/webapp/layers/evacuation-detail/evacuationDetailLayer.html',
  'map/webapp/layers/evacuation-detail/evacuationDetailLayer.svg',
  'map/webapp/layers/team-activity-detail/teamActivityDetailLayer.html',
  'map/webapp/layers/team-activity-detail/teamActivityDetailLayer.svg',
]
for (const retiredPath of retiredDetailPaths) {
  assert.ok(
    !fs.existsSync(path.join(projectRoot, retiredPath)),
    `retired host-mediated detail layer must not return: ${retiredPath}`,
  )
}
const managedLayerIds = fs.readdirSync(managedRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(managedRoot, entry.name, 'layer.config.json'))
  .filter((configPath) => fs.existsSync(configPath))
  .map((configPath) => JSON.parse(fs.readFileSync(configPath, 'utf8')))
  .filter((config) => config.ui?.catalog)
  .map((config) => config.id)
const urlStateModulePath = path.join(projectRoot, 'map/webapp/shared/mapUrlState.js')
const layerMessagePolicyPath = path.join(projectRoot, 'map/webapp/shared/layerMessagePolicy.js')
const layerControllerBusPath = path.join(projectRoot, 'map/webapp/shared/layerControllerBus.js')
const layerControllerBus = fs.readFileSync(layerControllerBusPath, 'utf8')
const urlStateModuleSource = fs.readFileSync(urlStateModulePath, 'utf8')
const { parseMapUrlState, serializeMapUrlState } = await import(
  `data:text/javascript;base64,${Buffer.from(urlStateModuleSource).toString('base64')}`
)

for (const forbidden of [
  'broadcastHazardConfig',
  'hazardLayerReady',
  'hazardLayerDataReady',
  'evacuationDataUrl',
  "evacuation: { dataUrl:",
]) {
  assert.ok(!host.includes(forbidden), `host contains layer-specific contract: ${forbidden}`)
}
for (const layerId of managedLayerIds) {
  assert.ok(!host.includes(layerId), `map host contains managed layer id: ${layerId}`)
  assert.ok(!nativeShell.includes(layerId), `native shell contains managed layer id: ${layerId}`)
}
assert.ok(
  !host.includes('svg3-layer-specific-ui-text-style'),
  'map host must not inject presentation into layer-owned controller UI',
)
assert.ok(host.includes("from './shared/layerMessagePolicy.js'"))
assert.ok(host.includes("from './shared/layerControllerBus.js'"))
assert.ok(!host.includes("document.querySelectorAll('iframe')"), 'host must not broadcast messages to every iframe')
assert.ok(host.includes('layerBus.allowsFromLayer(event.source, msg)'))
assert.ok(fs.existsSync(layerMessagePolicyPath), 'layer message capability policy is missing')
assert.ok(layerControllerBus.includes("layerAllowsMessage(binding.layer, 'toHost', message?.type)"))
assert.ok(layerControllerBus.includes("layerAllowsMessage(layer, 'fromHost', message?.type)"))
assert.ok(host.includes('svgMap.setLayerVisibility'), 'native host must use the SVGMap visibility API')
assert.ok(!host.includes('findLayerChildDocument'), 'native host must not reach into child SVG documents for visibility')
assert.ok(
  !/setAttribute\(['"](?:visibility|display|opacity)['"]/.test(host),
  'native host must not mutate layer visibility attributes directly',
)
assert.ok(!host.includes('falling back to DOM attrs'), 'native host must not use a DOM visibility fallback')
assert.ok(!host.includes('current-location-pin'), 'native host must not draw the current-location feature')
assert.ok(host.includes('relayCurrentLocation'), 'native host must relay location to a capable layer')
assert.ok(host.includes('broadcastRuntimeContext'))
assert.ok(host.includes('MAP_MESSAGES.runtimeViewportChanged'))
assert.ok(host.includes('MAP_MESSAGES.runtimeLayerStateChanged'))
assert.ok(host.includes('MAP_MESSAGES.runtimeStartupMetrics'))
assert.ok(nativeShell.includes("from './shared/mapUrlState.js'"))
assert.ok(
  nativeShell.includes('mapSession: state.mapSession'),
  'native shell must pass a map session to the runtime host',
)
assert.ok(
  nativeShell.includes("mapParams.set('initialViewport'"),
  'native shell must pass the selected municipality viewport during runtime startup',
)
assert.ok(
  host.includes('runtimeState.requestedViewport'),
  'runtime host must use the requested municipality viewport as its initial view',
)
assert.ok(
  nativeShell.includes('state.acceptViewportUpdates'),
  'native shell must ignore viewport updates until the active runtime is ready',
)
assert.ok(
  host.includes('mapSession: runtimeState.mapSession'),
  'runtime host messages must identify their map session',
)
assert.ok(
  layerPanel.includes('createLayerHealthDetail'),
  'native layer health badges must expose their source and freshness details',
)
const serializedMapState = serializeMapUrlState({
  viewport: { lat: 34.65, lon: 133.92, latSpan: 0.2, lonSpan: 0.4 },
  visibleLayerIds: ['layer-b', 'layer-a'],
  layerStates: { 'layer-a': 'filter=open' },
})
const parsedMapState = parseMapUrlState(serializedMapState)
assert.deepEqual(parsedMapState.visibleLayerIds, ['layer-a', 'layer-b'])
assert.equal(parsedMapState.layerStates['layer-a'], 'filter=open')
assert.ok(Math.abs(parsedMapState.viewport.lat - 34.65) < 0.000001)
assert.ok(Math.abs(parsedMapState.viewport.lon - 133.92) < 0.000001)
assert.ok(host.includes('MAP_MESSAGES.runtimeLayerReady'))
assert.ok(host.includes('MAP_MESSAGES.mapSetMunicipalityFilter'))
assert.ok(hazardConfig.href.includes('layerKey=layer-hazard'))
assert.ok(hazard.includes('MAP_MESSAGES.runtimeLayerReady'))
assert.ok(hazard.includes('MAP_MESSAGES.runtimeLayerStateChanged'))
assert.ok(hazard.includes('MAP_MESSAGES.mapSetLayerState'))
assert.ok(hazard.includes('data-hazard-type="flood"'))
assert.ok(hazard.includes('window.svgMap?.refreshScreen?.()'))
assert.ok(!hazard.includes('scheduleNativeReparse'))
assert.ok(!hazard.includes('MAP_MESSAGES.mapSetLayerConfig'))
assert.ok(layerUi.includes('showLayerSpecificUI(layerReference)'))
assert.ok(layerUi.includes('getElementById?.(layerReference)'))
assert.ok(layerUi.includes('layer?.svgImageProps?.controller'))
assert.ok(nativeShell.includes('MAP_MESSAGES.mapOpenLayerUi'))
assert.ok(nativeShell.includes('MAP_MESSAGES.mapSetUiInsets'))
assert.ok(host.includes("--shell-right-inset"))
for (const navigationId of [
  'app-menu-button',
  'menu-import-layer',
  'menu-import-artifact',
  'team-activity-publisher-link',
]) {
  assert.ok(nativeShellHtml.includes(`id="${navigationId}"`), `native navigation is missing ${navigationId}`)
}
assert.ok(nativeShellHtml.includes('href="./native-map.css"'), 'native shell must load its external stylesheet')
assert.ok(nativeShellHtml.includes('src="./native-map.js"'), 'native shell must load its external module')
assert.ok(!nativeShellHtml.includes('<style>'), 'native shell must not embed its stylesheet')
assert.ok(!nativeShellHtml.includes('<script type="module">'), 'native shell must not embed its application module')
assert.ok(nativeShell.includes('/map/publishers/team-activity-csv/admin.html'))
assert.ok(nativeShellHtml.includes('./region-picker.html'), 'native map must link back to nationwide selection')
assert.ok(regionPicker.includes('id="japan-map"'), 'nationwide selection must expose the Japan SVG map')
assert.ok(regionPickerScript.includes("fetchJson('/map/regions/index.json')"))
assert.ok(regionPickerScript.includes("fetchText('/map/layers/overview/japan.svg')"))
assert.ok(regionPickerScript.includes("next.searchParams.set('regionId', item.id)"))
assert.ok(regionPickerScript.includes("url.searchParams.set('municipalityId', municipalityId)"))
assert.ok(regionPickerScript.includes('/municipalities.json'))
assert.ok(regionPickerScript.includes('/map/layers/overview/pref/'))
assert.ok(nativeShell.includes("from './shared/artifactBrowser.js'"))
assert.ok(nativeShell.includes("from './shared/layerCatalog.js'"))
assert.ok(nativeShell.includes("from './shared/layerAlertPoller.js'"))
assert.ok(nativeShell.includes("from './shared/layerHealth.js'"))
assert.ok(nativeShell.includes("from './shared/layerSearch.js'"))
assert.ok(nativeShell.includes("from './shared/layerPanel.js'"))
assert.ok(nativeShell.includes("from './shared/regionSelector.js'"))
assert.ok(layerCatalogModule.includes('export const loadLayerCatalog'))
assert.ok(layerAlertPoller.includes("documentRef.addEventListener('visibilitychange'"))
assert.ok(layerAlertPoller.includes('consecutiveFailures'))
assert.ok(!nativeShell.includes('const pollAlertFeeds'), 'alert polling must stay outside native-map.html')
assert.ok(layerHealth.includes('export const loadLayerHealthData'))
assert.ok(!nativeShell.includes('const loadLayerHealth'), 'health loading must stay outside native-map.html')
assert.ok(layerSearch.includes('export const createLayerSearchLoader'))
assert.ok(!nativeShell.includes('const normalizeSearchRecord'), 'search normalization must stay outside native-map.html')
assert.ok(layerPanel.includes('export const createLayerPanel'))
assert.ok(!nativeShell.includes('const layerGroup'), 'layer presentation rules must stay outside native-map.html')
assert.ok(regionSelector.includes('export const createRegionSelector'))
assert.ok(regionSelector.includes("fetchJson('/map/regions/index.json')"))
assert.ok(regionSelector.includes('/municipalities.json'))
assert.ok(!nativeShellScript.includes('const renderRegions'), 'region GUI must stay outside native-map.js')
assert.ok(artifactBrowser.includes('export const createArtifactBrowser'))
assert.ok(!nativeShell.includes('const formatArtifactBytes'), 'artifact presentation must stay outside native-map.html')
assert.ok(!nativeShell.includes('verifyArtifactIndexSignature'), 'artifact signature handling must stay in artifactBrowser.js')
assert.ok(teamActivityPublisher.includes('id="backLink"'))
assert.ok(teamActivityPublisher.includes('/map/webapp/native-map.html'))

const appRoot = path.join(frontendRoot, 'src', 'app')
const appFiles = fs.readdirSync(appRoot, { withFileTypes: true })
const appFileNames = appFiles.map((entry) => entry.name).sort()
assert.deepEqual(appFileNames, ['layout.tsx', 'page.tsx'], 'Next adapter must only contain layout.tsx and page.tsx')
assert.ok(appFiles.every((entry) => entry.isFile()), 'Next adapter must not contain route directories')
assert.ok(!fs.existsSync(path.join(frontendRoot, 'src', 'lib')), 'Next adapter must not contain application services')
assert.ok(!fs.existsSync(path.join(frontendRoot, 'src', 'middleware.ts')), 'Next adapter must not contain middleware')
const nextPage = fs.readFileSync(path.join(appRoot, 'page.tsx'), 'utf8')
assert.ok(
  nextPage.includes("redirect('/map/webapp/region-picker.html')"),
  'Next root must redirect to the native nationwide selector',
)
assert.ok(!nextPage.includes('/api/'), 'Next root must not depend on an application API')

console.log('[check-native-host-contract] OK: native host is generic and Next remains a two-file delivery adapter')
