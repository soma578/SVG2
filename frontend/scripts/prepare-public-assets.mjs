import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(frontendRoot, '..')
const publicRoot = path.join(frontendRoot, 'public')
const mapRoot = path.join(projectRoot, 'map')
const publicMapRoot = path.join(publicRoot, 'map')
const manifestPath = path.join(mapRoot, 'data', 'layer-build-manifest.json')

const copyTargets = [
  ['map', 'map'],
  ['svgMapAppLayers', 'svgMapAppLayers'],
]

fs.mkdirSync(publicRoot, { recursive: true })

const parseArgs = (argv) => {
  const options = { layers: [], paths: [], ifMissing: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--layer') options.layers.push(argv[index + 1] || '')
    else if (arg.startsWith('--layer=')) options.layers.push(arg.slice('--layer='.length))
    else if (arg === '--path') options.paths.push(argv[index + 1] || '')
    else if (arg.startsWith('--path=')) options.paths.push(arg.slice('--path='.length))
    else if (arg === '--if-missing') options.ifMissing = true
  }
  options.layers = options.layers.map((value) => String(value).trim()).filter(Boolean)
  options.paths = options.paths.map((value) => String(value).trim()).filter(Boolean)
  return options
}

const realpathSafe = (targetPath) => {
  try {
    return fs.realpathSync(targetPath)
  } catch {
    return null
  }
}

const isIgnoredPath = (targetPath) => {
  const base = path.basename(targetPath)
  const stat = fs.lstatSync(targetPath)
  return (
    stat.isSymbolicLink() ||
    base === 'node_modules' ||
    base === '.git' ||
    base === '__pycache__' ||
    base.endsWith(':Zone.Identifier')
  )
}

const assertInside = (root, targetPath, label) => {
  const rootResolved = path.resolve(root)
  const targetResolved = path.resolve(targetPath)
  if (targetResolved !== rootResolved && !targetResolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(`[prepare-public-assets] ${label} escapes root: ${targetPath}`)
  }
}

const normalizeMapPath = (value) => {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '')
  return normalized.startsWith('map/') ? normalized.slice('map/'.length) : normalized
}

const copyMapPath = (mapRelativePath, { log = true } = {}) => {
  const normalized = normalizeMapPath(mapRelativePath)
  if (!normalized) return false
  const source = path.join(mapRoot, normalized)
  const dest = path.join(publicMapRoot, normalized)
  assertInside(mapRoot, source, 'source')
  assertInside(publicMapRoot, dest, 'dest')
  if (!fs.existsSync(source)) {
    console.warn(`[prepare-public-assets] missing map path: ${normalized}`)
    return false
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const stat = fs.lstatSync(source)
  if (stat.isDirectory()) {
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(source, dest, {
      recursive: true,
      dereference: false,
      filter: (src) => !isIgnoredPath(src),
    })
  } else if (!isIgnoredPath(source)) {
    fs.rmSync(dest, { recursive: true, force: true })
    fs.copyFileSync(source, dest)
  }
  if (log) console.log(`[prepare-public-assets] copied map/${normalized} -> public/map/${normalized}`)
  return true
}

const readManifest = () => {
  if (!fs.existsSync(manifestPath)) throw new Error(`[prepare-public-assets] manifest not found: ${manifestPath}`)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  return manifest.layers && typeof manifest.layers === 'object' ? manifest.layers : {}
}

const copyLayerOutputs = (layers) => {
  const manifestLayers = readManifest()
  const knownLayerIds = new Map()
  for (const [qtctLayer, spec] of Object.entries(manifestLayers)) {
    knownLayerIds.set(qtctLayer, spec)
    if (spec.layerId) knownLayerIds.set(spec.layerId, spec)
    if (spec.layerId) knownLayerIds.set(String(spec.layerId).replace(/^layer-/, ''), spec)
  }
  let copied = 0
  for (const layer of layers) {
    const spec = knownLayerIds.get(layer)
    if (!spec) {
      throw new Error(`[prepare-public-assets] unknown --layer "${layer}". Available: ${[...manifestLayers.keys()].sort().join(', ')}`)
    }
    const mapOutputs = (spec.outputs || [])
      .filter((output) => String(output).startsWith('map/'))
      .map((output) => output.slice('map/'.length))
    for (const output of mapOutputs) {
      if (copyMapPath(output, { log: false })) copied += 1
    }
  }
  copyMapPath('data/layer-build-manifest.json', { log: false })
  console.log(`[prepare-public-assets] copied ${copied} layer output file(s)`)
}

const options = parseArgs(process.argv.slice(2))

if (options.ifMissing) {
  const required = [
    path.join(publicMapRoot, 'webapp', 'current-map.html'),
    path.join(publicMapRoot, 'containers', 'Containers_webapp_denshi_33.svg'),
    path.join(publicMapRoot, 'data', 'qtct', 'evacuation', 'summary.json'),
    path.join(publicMapRoot, 'layers', 'catalog.json'),
  ]
  if (required.every((targetPath) => fs.existsSync(targetPath))) {
    console.log('[prepare-public-assets] required dev assets already exist; skipped full sync')
    process.exit(0)
  }
}

if (options.layers.length > 0 || options.paths.length > 0) {
  fs.mkdirSync(publicMapRoot, { recursive: true })
  if (options.layers.length > 0) copyLayerOutputs(options.layers)
  for (const targetPath of options.paths) copyMapPath(targetPath)
  process.exit(0)
}

for (const [sourceName, destName] of copyTargets) {
  const source = path.join(projectRoot, sourceName)
  const dest = path.join(publicRoot, destName)
  if (!fs.existsSync(source)) {
    console.warn(`[prepare-public-assets] missing source: ${source}`)
    continue
  }

  const sourceReal = realpathSafe(source)
  const destReal = realpathSafe(dest)
  if (sourceReal && destReal) {
    const destInsideSource =
      destReal === sourceReal ||
      destReal.startsWith(`${sourceReal}${path.sep}`)
    const sourceInsideDest =
      sourceReal === destReal ||
      sourceReal.startsWith(`${destReal}${path.sep}`)
    if (destInsideSource || sourceInsideDest) {
      console.warn(
        `[prepare-public-assets] skip ${sourceName}: source/dest would recurse (${sourceReal} -> ${destReal})`,
      )
      continue
    }
  }

  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(source, dest, {
    recursive: true,
    dereference: false,
    filter: (src) => !isIgnoredPath(src),
  })
  console.log(`[prepare-public-assets] copied ${sourceName} -> public/${destName}`)
}

const nestedSvgMapAppLayers = path.join(publicRoot, 'map', 'svgMapAppLayers')
fs.rmSync(nestedSvgMapAppLayers, { recursive: true, force: true })
fs.mkdirSync(nestedSvgMapAppLayers, { recursive: true })
fs.cpSync(path.join(projectRoot, 'svgMapAppLayers'), nestedSvgMapAppLayers, {
  recursive: true,
  dereference: false,
  filter: (src) => !isIgnoredPath(src),
})
console.log('[prepare-public-assets] copied svgMapAppLayers -> public/map/svgMapAppLayers')

const directAssetPairs = [
  [
    path.join(publicRoot, 'svgMapAppLayers', 'basemaps', 'dynamicDenshiKokudo2016.svg'),
    path.join(publicRoot, 'map', 'svgMapAppLayers', 'basemaps', 'dynamicDenshiKokudo2016.svg'),
  ],
]

for (const [sourceFile, destFile] of directAssetPairs) {
  if (!fs.existsSync(sourceFile)) continue
  fs.mkdirSync(path.dirname(destFile), { recursive: true })
  fs.copyFileSync(sourceFile, destFile)
  console.log(`[prepare-public-assets] copied asset ${path.relative(publicRoot, sourceFile)} -> public/${path.relative(publicRoot, destFile)}`)
}
