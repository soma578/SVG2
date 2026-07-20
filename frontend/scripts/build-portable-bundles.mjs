#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(frontendRoot, '..')
const mapRoot = path.join(projectRoot, 'map')
const portableRoot = path.join(mapRoot, 'layers', 'portable')
const managedRoot = path.join(mapRoot, 'layers', 'managed')
const outputRoot = path.join(mapRoot, 'distribution', 'portable')
const ISOLATED_ADAPTER_KIND = 'svg3-postmessage-adapter'
const ISOLATED_PROTOCOL = 'svgmap-isolated-layer@1'

const parseArgs = (argv) => {
  const options = { region: 'okayama', layers: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--region') options.region = argv[index + 1] || options.region
    else if (arg.startsWith('--region=')) options.region = arg.slice('--region='.length)
    else if (arg === '--layer') options.layers.push(argv[index + 1] || '')
    else if (arg.startsWith('--layer=')) options.layers.push(arg.slice('--layer='.length))
  }
  options.region = String(options.region).trim()
  options.layers = options.layers.map((value) => String(value).trim()).filter(Boolean)
  if (!/^[a-z0-9-]+$/i.test(options.region)) throw new Error(`invalid --region: ${options.region}`)
  return options
}

const options = parseArgs(process.argv.slice(2))

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'))
const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
const runtimePackageIntegrity = (manifestPath, runtimePackage) => {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(manifestPath))
  for (const exported of [...(runtimePackage.exports || [])].sort()) {
    const filePath = path.resolve(path.dirname(manifestPath), exported)
    hash.update(`\0${exported}\0`)
    hash.update(fs.readFileSync(filePath))
  }
  return `sha256-${hash.digest('hex')}`
}
const toPosix = (value) => value.split(path.sep).join('/')

const assertInside = (root, targetPath, label) => {
  const relative = path.relative(root, path.resolve(targetPath))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes ${root}: ${targetPath}`)
  }
}

const writeText = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, text, 'utf8')
}

const copyFile = (source, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

const findRelativeReferences = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8')
  const references = new Set()
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    if (match[1].startsWith('.')) references.add(match[1])
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1].startsWith('.')) references.add(match[1])
  }
  if (/\.html$/i.test(filePath)) {
    for (const match of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      if (match[1].startsWith('.')) references.add(match[1])
    }
  }
  return [...references]
}

const controllerFromSvg = (filePath) => {
  if (!/\.svg$/i.test(filePath)) return ''
  const match = fs.readFileSync(filePath, 'utf8').match(/\bdata-controller\s*=\s*["']([^"']+)["']/)
  return match ? match[1].split('#')[0] : ''
}

const collectRuntimeFiles = (packageDir, pkg) => {
  const files = new Set()
  const dependencyLock = new Map()
  const visit = (filePath) => {
    const resolved = path.resolve(filePath)
    assertInside(portableRoot, resolved, 'portable runtime dependency')
    if (files.has(resolved)) return
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`${pkg.id}: runtime dependency not found: ${resolved}`)
    }
    files.add(resolved)
    const controller = controllerFromSvg(resolved)
    if (controller) visit(path.resolve(path.dirname(resolved), controller))
    if (/\.(?:m?js|html)$/i.test(resolved)) {
      for (const specifier of findRelativeReferences(resolved)) {
        visit(path.resolve(path.dirname(resolved), specifier))
      }
    }
  }

  const visitDependency = (ownerDir, dependency) => {
    const manifestPath = path.resolve(ownerDir, dependency.manifest || '')
    assertInside(portableRoot, manifestPath, `${pkg.id} runtime dependency manifest`)
    if (!fs.existsSync(manifestPath)) throw new Error(`${pkg.id}: runtime dependency manifest not found: ${manifestPath}`)
    const runtimePackage = readJson(manifestPath)
    if (runtimePackage.type !== 'svgmap-runtime-package') throw new Error(`${manifestPath}: invalid runtime package type`)
    if (runtimePackage.id !== dependency.id || runtimePackage.version !== dependency.version) {
      throw new Error(`${pkg.id}: runtime dependency mismatch for ${dependency.id}@${dependency.version}`)
    }
    const previous = dependencyLock.get(runtimePackage.id)
    if (previous && previous.version !== runtimePackage.version) {
      throw new Error(`${pkg.id}: conflicting runtime dependency ${runtimePackage.id}`)
    }
    dependencyLock.set(runtimePackage.id, {
      id: runtimePackage.id,
      version: runtimePackage.version,
      manifest: toPosix(path.relative(portableRoot, manifestPath)),
      integrity: runtimePackageIntegrity(manifestPath, runtimePackage),
    })
    visit(manifestPath)
    for (const exported of runtimePackage.exports || []) visit(path.resolve(path.dirname(manifestPath), exported))
    for (const child of runtimePackage.dependencies || []) visitDependency(path.dirname(manifestPath), child)
  }

  visit(path.resolve(packageDir, pkg.entrypoint))
  for (const shared of pkg.shared || []) visit(path.resolve(packageDir, shared))
  for (const dependency of pkg.runtimeDependencies || []) visitDependency(packageDir, dependency)
  for (const reference of [
    pkg.isolated?.layerEntrypoint,
    pkg.isolated?.controllerEntrypoint,
    pkg.isolated?.hostBridge,
  ].filter(Boolean)) visit(path.resolve(packageDir, reference))
  visit(path.join(packageDir, 'layer.package.json'))
  return { files, dependencyLock: [...dependencyLock.values()].sort((a, b) => a.id.localeCompare(b.id)) }
}

const bundledPortablePath = (packageDir, reference, label) => {
  const source = path.resolve(packageDir, reference)
  assertInside(portableRoot, source, label)
  return toPosix(path.join('map', 'layers', 'portable', path.relative(portableRoot, source)))
}

const loadMounts = () => {
  const mounts = []
  for (const entry of fs.readdirSync(managedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const configPath = path.join(managedRoot, entry.name, 'layer.config.json')
    if (!fs.existsSync(configPath)) continue
    const config = readJson(configPath)
    if (!config.portable?.shareable || !config.portable?.entrypoint) continue
    const entrypoint = config.portable.entrypoint.replace(/^\/map\/layers\/portable\//, '')
    const packageDir = path.join(portableRoot, path.dirname(entrypoint))
    const packagePath = path.join(packageDir, 'layer.package.json')
    if (!fs.existsSync(packagePath)) throw new Error(`${configPath}: portable package not found`)
    const pkg = readJson(packagePath)
    const qtctLayer = config.build?.qtctLayer || config.data?.qtctLayer || pkg.id
    mounts.push({ config, configPath, packageDir, pkg, qtctLayer })
  }
  const unique = new Map()
  for (const mount of mounts) {
    if (!unique.has(mount.pkg.id)) unique.set(mount.pkg.id, mount)
  }
  return [...unique.values()].sort((a, b) => a.pkg.id.localeCompare(b.pkg.id))
}

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const compactRepresentative = (feature) => feature ? {
  id: feature.id,
  title: feature.title,
  layerId: feature.layerId,
  status: feature.status,
  lat: feature.lat,
  lon: feature.lon,
  representative: true,
  count: feature.count,
} : null

const compactQtctNode = (node, maxDepth) => ({
  id: node.id,
  depth: node.depth,
  bounds: node.bounds,
  count: node.count,
  representative: compactRepresentative(node.representative),
  ...(node.children?.length && node.depth < maxDepth
    ? { children: node.children.map((child) => compactQtctNode(child, maxDepth)) }
    : {}),
})

const viewerHtml = (title, layerId) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - SVGMap portable fixture</title>
<style>
html,body,#mapcanvas{width:100%;height:100%;margin:0;overflow:hidden}body{background:#e8eef5}
#controller,#layerlist,#layerList,#initLayerSpecificUI,#centerSight,.layerUI,.essentialUI{display:none!important}
#layerSpecificUI{position:absolute;top:12px;right:12px;z-index:80;max-width:min(400px,calc(100vw - 24px))}
#fixture-controls{position:absolute;top:12px;left:12px;z-index:90;padding:8px 10px;background:#fff;border:1px solid #ccd5df;border-radius:6px;font:14px sans-serif}
</style>
<script>window.svgMapOptions={enableEssentialUI:false,enableGIS:false,enableAuthoringTool:false,enableCustomLayersManager:false,enableLayerUI:false}</script>
</head>
<body>
<img id="centerSight" alt="" width="1" height="1" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
<div id="mapcanvas" data-src="./Container.svg"></div>
<div id="controller"></div><div id="layerlist"></div><div id="layerList"></div>
<div id="layerSpecificUI"></div><div id="initLayerSpecificUI"></div>
<label id="fixture-controls"><input id="layer-visible" type="checkbox" checked> ${title}</label>
<script type="module">
const {svgMap}=await import('./map/vendor/svgmapjs/SVGMapLv0.1_r18module.js');
window.svgMap=svgMap;svgMap.initLoad();
window.setTimeout(()=>{svgMap.setGeoViewPort?.(34.25,133.25,1.3,1.3,false);svgMap.refreshScreen?.()},500);
document.querySelector('#layer-visible').addEventListener('change',(event)=>{
  const mounted=svgMap.getRootLayersProps?.()?.[0];
  if(mounted)svgMap.setLayerVisibility?.(mounted.id,event.target.checked,{
    exec:event.target.checked?'appearOnLayerLoad':'hiddenOnLayerLoad'
  });
});
</script>
</body>
</html>
`

const isolatedViewerHtml = (title, qtctLayer, regionId, packageRelative, adapter, policy) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - isolated protocol fixture</title>
<style>
html,body,#mapcanvas{width:100%;height:100%;margin:0;overflow:hidden}body{background:#e8eef5}
#controller,#layerlist,#layerList,#initLayerSpecificUI,#centerSight,.layerUI,.essentialUI{display:none!important}
#isolated-controller{position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none}
</style>
<script>window.svgMapOptions={enableEssentialUI:false,enableGIS:false,enableAuthoringTool:false,enableCustomLayersManager:false,enableLayerUI:false}</script>
</head>
<body>
<img id="centerSight" alt="" width="1" height="1" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
<div id="mapcanvas" data-src="./Container.isolated.svg"></div>
<div id="controller"></div><div id="layerlist"></div><div id="layerList"></div>
<div id="layerSpecificUI"></div><div id="initLayerSpecificUI"></div>
<script type="module">
import {attachIsolatedLayerHost} from './${adapter.hostBridge}';
const {svgMap}=await import('./map/vendor/svgmapjs/SVGMapLv0.1_r18module.js');
window.svgMap=svgMap;svgMap.initLoad();
const waitForLayer=()=>new Promise((resolve)=>{const check=()=>{try{if(svgMap.getRootLayersProps?.()?.[0])return resolve()}catch{}setTimeout(check,20)};check()});
await waitForLayer();
const workerOrigin=new URLSearchParams(location.search).get('workerOrigin')||location.protocol+'//'+location.hostname+':4174';
const bundlePath=location.pathname.slice(0,location.pathname.lastIndexOf('/'));
const workerBase=new URL(bundlePath.replace(/\\/?$/,'/') ,workerOrigin);
const controllerUrl=new URL('${adapter.controllerEntrypoint}',workerBase);
const dataUrl=new URL('map/data/qtct/${qtctLayer}/${regionId}/detail.json',workerBase);
const summaryUrl=new URL('map/data/qtct/${qtctLayer}/${regionId}/summary.json',workerBase);
const packageUrl=new URL('map/layers/portable/${packageRelative}/layer.package.json',workerBase);
controllerUrl.searchParams.set('parentOrigin',location.origin);controllerUrl.searchParams.set('data',dataUrl.href);
controllerUrl.searchParams.set('summary',summaryUrl.href);
controllerUrl.searchParams.set('layer','${qtctLayer}');
controllerUrl.searchParams.set('package',packageUrl.href);
const iframe=document.createElement('iframe');iframe.id='isolated-controller';iframe.sandbox='allow-scripts allow-same-origin';iframe.src=controllerUrl.href;
document.body.appendChild(iframe);attachIsolatedLayerHost({svgMap,iframe,policy:${JSON.stringify(policy).replaceAll('<', '\\u003c')}});
window.setTimeout(()=>{svgMap.setGeoViewPort?.(34.25,133.25,1.3,1.3,false);svgMap.refreshScreen?.()},500);
</script>
</body>
</html>
`

const buildBundle = (mount) => {
  const { config, packageDir, pkg, qtctLayer } = mount
  const bundleRoot = path.join(outputRoot, pkg.id, options.region)
  fs.rmSync(bundleRoot, { recursive: true, force: true })
  fs.mkdirSync(bundleRoot, { recursive: true })

  const { files: runtimeFiles, dependencyLock } = collectRuntimeFiles(packageDir, pkg)
  for (const source of runtimeFiles) {
    const relative = path.relative(portableRoot, source)
    const destination = path.join(bundleRoot, 'map', 'layers', 'portable', relative)
    copyFile(source, destination)
  }

  const bundledProfiles = path.join(bundleRoot, 'map', 'layers', 'portable', 'representative-pins', 'pinLayerProfiles.js')
  if (fs.existsSync(bundledProfiles)) {
    const source = fs.readFileSync(bundledProfiles, 'utf8')
    writeText(bundledProfiles, source.replaceAll("'/map/icons/", "'../../../icons/"))
  }
  const bundledDependencyLock = dependencyLock.map((dependency) => {
    const manifestPath = path.join(bundleRoot, 'map', 'layers', 'portable', dependency.manifest)
    const runtimePackage = readJson(manifestPath)
    return {
      ...dependency,
      integrity: runtimePackageIntegrity(manifestPath, runtimePackage),
    }
  })

  const iconSource = path.join(mapRoot, 'icons')
  fs.cpSync(iconSource, path.join(bundleRoot, 'map', 'icons'), { recursive: true })
  fs.cpSync(path.join(mapRoot, 'vendor', 'svgmapjs'), path.join(bundleRoot, 'map', 'vendor', 'svgmapjs'), {
    recursive: true,
    filter: (source) => !source.endsWith(':Zone.Identifier') && path.basename(source) !== '.git',
  })
  const detailSource = path.join(mapRoot, 'data', 'qtct', qtctLayer, options.region, 'detail.json')
  if (!fs.existsSync(detailSource)) throw new Error(`${pkg.id}: regional QTCT not found: ${detailSource}`)
  const detailRelative = path.join('map', 'data', 'qtct', qtctLayer, options.region, 'detail.json')
  copyFile(detailSource, path.join(bundleRoot, detailRelative))
  const detailData = readJson(detailSource)
  const summaryMaxDepth = Number(config.portable?.summaryMaxDepth || 11)
  const summaryRelative = path.join('map', 'data', 'qtct', qtctLayer, options.region, 'summary.json')
  writeText(path.join(bundleRoot, summaryRelative), `${JSON.stringify({
    ...detailData,
    tree: compactQtctNode(detailData.tree, summaryMaxDepth),
    summaryOnly: true,
    summaryMaxDepth,
  })}\n`)

  const packageRelative = path.relative(portableRoot, packageDir)
  const isolated = pkg.isolated
  if (isolated?.kind !== ISOLATED_ADAPTER_KIND || isolated?.protocol !== ISOLATED_PROTOCOL) {
    throw new Error(`${pkg.id}: unsupported isolated adapter declaration`)
  }
  const isolatedEntrypoints = {
    layer: bundledPortablePath(packageDir, isolated.layerEntrypoint, `${pkg.id} isolated layerEntrypoint`),
    controller: bundledPortablePath(packageDir, isolated.controllerEntrypoint, `${pkg.id} isolated controllerEntrypoint`),
    hostBridge: bundledPortablePath(packageDir, isolated.hostBridge, `${pkg.id} isolated hostBridge`),
    protocol: isolated.protocol,
  }
  const renderIcons = Object.fromEntries(Object.entries(pkg.isolated?.render?.icons || {}).map(([status, reference]) => {
    const source = path.resolve(packageDir, reference)
    assertInside(path.join(mapRoot, 'icons'), source, `${pkg.id} isolated render icon`)
    return [status, `./map/${toPosix(path.relative(mapRoot, source))}`]
  }))
  const bundledPackagePath = path.join(bundleRoot, 'map', 'layers', 'portable', packageRelative, 'layer.package.json')
  const dataFromLayer = `../../../data/qtct/${qtctLayer}/${options.region}/detail.json`
  const summaryFromLayer = `../../../data/qtct/${qtctLayer}/${options.region}/summary.json`
  const bundledPackage = {
    ...pkg,
    portability: {
      level: 'distribution-portable',
      dataInjection: 'hash-params',
      limitations: ['Stock SVGMap does not auto-launch svg3-postmessage-adapter; use the declared hostBridge.'],
    },
    runtime: { ...pkg.runtime, lawaModes: ['tight'] },
    runtimeDependencyLock: bundledDependencyLock,
    data: {
      ...pkg.data,
      kind: 'qtct',
      summary: summaryFromLayer,
      detail: dataFromLayer,
      regionId: options.region,
    },
  }
  delete bundledPackage.adminEntrypoint
  writeText(bundledPackagePath, `${JSON.stringify(bundledPackage, null, 2)}\n`)

  const layerRelative = toPosix(path.join('map', 'layers', 'portable', packageRelative, pkg.entrypoint))
  const hash = new URLSearchParams({ summary: summaryFromLayer, data: dataFromLayer, layer: qtctLayer }).toString()
  const animation = {
    id: config.id,
    href: `${layerRelative}#${hash}`,
    title: config.title || pkg.title,
    className: config.class || 'poi clickable',
    visibility: 'visible',
    opacity: config.opacity || '1',
  }
  writeText(path.join(bundleRoot, 'Container.svg'), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="12243.4 -4605.6 3205.3 2251.0">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />
  <animation id="${escapeXml(animation.id)}" xlink:href="${escapeXml(animation.href)}" title="${escapeXml(animation.title)}" class="${escapeXml(animation.className)}" visibility="${animation.visibility}" opacity="${animation.opacity}" x="12243.4" y="-4605.6" width="3205.3" height="2251.0" />
</svg>
`)
  writeText(path.join(bundleRoot, 'viewer.html'), viewerHtml(escapeXml(animation.title), animation.id))
  writeText(path.join(bundleRoot, 'Container.isolated.svg'), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="12243.4 -4605.6 3205.3 2251.0">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />
  <animation id="isolated-${escapeXml(animation.id)}" xlink:href="${escapeXml(isolatedEntrypoints.layer)}" title="${escapeXml(animation.title)} isolated" class="poi clickable" visibility="visible" opacity="1" x="12243.4" y="-4605.6" width="3205.3" height="2251.0" />
</svg>
`)
  writeText(path.join(bundleRoot, 'viewer-isolated.html'), isolatedViewerHtml(
    escapeXml(animation.title), qtctLayer, options.region, toPosix(packageRelative), {
      controllerEntrypoint: isolatedEntrypoints.controller,
      hostBridge: isolatedEntrypoints.hostBridge,
    }, {
      allowedImageHosts: pkg.isolated?.security?.imageHosts || [],
      allowedLinkHosts: pkg.isolated?.security?.linkHosts || [],
      render: {
        defaultStatus: pkg.isolated?.render?.defaultStatus || '',
        icons: renderIcons,
      },
    },
  ))

  const files = []
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(target)
      else if (entry.name !== 'bundle.manifest.json') files.push(target)
    }
  }
  walk(bundleRoot)
  const manifest = {
    schemaVersion: 1,
    packageId: pkg.id,
    regionId: options.region,
    entrypoint: animation.href,
    fixture: 'viewer.html',
    isolatedProtocolFixture: 'viewer-isolated.html',
    portability: {
      pathIndependent: true,
      crossOrigin: false,
      lawaModes: { tight: 'supported', isolated: 'adapter-supported' },
      protocolFixtures: { isolated: pkg.isolated?.detail ? 'verified-adapter' : 'prototype' },
      isolatedEntrypoints,
      runtimeDependencies: bundledDependencyLock,
      limitations: ['Stock SVGMap does not auto-launch the declared isolated adapter. The included fixture uses its hostBridge.'],
    },
    files: files.sort().map((filePath) => ({
      path: toPosix(path.relative(bundleRoot, filePath)),
      bytes: fs.statSync(filePath).size,
      sha256: sha256(filePath),
    })),
  }
  writeText(path.join(bundleRoot, 'bundle.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const bytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0)
  console.log(`[portable-bundle] ${pkg.id}/${options.region}: ${manifest.files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB`)
}

fs.mkdirSync(outputRoot, { recursive: true })
const mounts = loadMounts().filter((mount) => (
  options.layers.length === 0 || options.layers.some((id) => [mount.pkg.id, mount.qtctLayer, mount.config.id].includes(id))
))
if (mounts.length === 0) throw new Error('no matching shareable portable mounts')
for (const mount of mounts) buildBundle(mount)
console.log(`[portable-bundle] built ${mounts.length} regional bundle(s) in ${outputRoot}`)
