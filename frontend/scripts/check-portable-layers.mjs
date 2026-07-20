#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..', '..')
const portableRoot = path.join(projectRoot, 'map', 'layers', 'portable')
const regionsIndexPath = path.join(projectRoot, 'map', 'regions', 'index.json')

const errors = []
const reports = []
const VALID_PORTABILITY_LEVELS = new Set(['workspace-portable', 'distribution-portable'])
const VALID_LAWA_MODES = new Set(['tight', 'isolated'])
const ISOLATED_ADAPTER_KIND = 'svg3-postmessage-adapter'
const ISOLATED_PROTOCOL = 'svgmap-isolated-layer@1'
const RUNTIME_PACKAGE_TYPE = 'svgmap-runtime-package'
const VALID_DATA_PARAMS = new Set([
  'data', 'layer', 'summary', 'statusOverlay', 'profile', 'municipalityCodes', 'districtSvgUrlTemplate',
])
const VALID_ISOLATED_DETAIL_FIELDS = new Set([
  'id', 'title', 'status', 'summary', 'description', 'address', 'area', 'operator',
  'municipalityCode', 'regionId', 'capacity', 'count',
  'cameraId', 'river', 'location', 'imageUrl', 'normalImageUrl', 'liveUrl', 'pageUrl', 'provider',
])
const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

const fail = (message) => {
  errors.push(message)
}

const exists = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found: ${filePath}`)
    return false
  }
  return true
}

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(`${filePath}: invalid JSON: ${error.message}`)
    return null
  }
}

const findPackageFiles = (dir) => {
  if (!fs.existsSync(dir)) return []
  const out = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else if (entry.name === 'layer.package.json') out.push(fullPath)
    }
  }
  walk(dir)
  return out.sort()
}

const resolveMapUrl = (urlPath) => {
  if (typeof urlPath !== 'string' || !urlPath.startsWith('/map/')) return null
  return path.join(projectRoot, 'map', urlPath.slice('/map/'.length))
}

const controllerFromSvg = (svgPath) => {
  const svg = fs.readFileSync(svgPath, 'utf8')
  const match = svg.match(/\bdata-controller\s*=\s*["']([^"']+)["']/)
  if (!match) return ''
  return match[1].split('#')[0]
}

const findRelativeReferences = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8')
  const references = []
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    if (match[1].startsWith('.')) references.push(match[1])
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1].startsWith('.')) references.push(match[1])
  }
  if (/\.html$/i.test(filePath)) {
    for (const match of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      if (match[1].startsWith('.')) references.push(match[1])
    }
  }
  return references
}

const validateRelativeImports = (filePath, seen = new Set()) => {
  const key = path.resolve(filePath)
  if (seen.has(key) || !fs.existsSync(key)) return
  seen.add(key)
  for (const specifier of findRelativeReferences(key)) {
    const resolved = path.resolve(path.dirname(key), specifier)
    if (!exists(resolved, `${filePath} import "${specifier}"`)) continue
    if (/\.(m?js|html)$/i.test(resolved)) validateRelativeImports(resolved, seen)
  }
}

const regions = (() => {
  if (!fs.existsSync(regionsIndexPath)) return []
  const index = readJson(regionsIndexPath)
  return index?.regions || []
})()

const packages = findPackageFiles(portableRoot)
if (packages.length === 0) {
  console.log('[check-portable-layers] no layer.package.json files found')
  process.exit(0)
}

for (const packagePath of packages) {
  const dir = path.dirname(packagePath)
  const rel = path.relative(projectRoot, packagePath)
  const pkg = readJson(packagePath)
  if (!pkg) continue
  const runtimeFiles = new Set()
  const dependencyPackages = new Map()
  const visitDependency = (ownerDir, dependency, stack = new Set()) => {
    if (!dependency || typeof dependency !== 'object') {
      fail(`${rel}: runtime dependency must be an object`)
      return
    }
    if (!dependency.id || !dependency.version || !dependency.manifest) {
      fail(`${rel}: runtime dependency requires id, version and manifest`)
      return
    }
    const manifestPath = path.resolve(ownerDir, dependency.manifest)
    const relativeToPortable = path.relative(portableRoot, manifestPath)
    if (relativeToPortable.startsWith('..') || path.isAbsolute(relativeToPortable)) {
      fail(`${rel}: runtime dependency manifest must resolve inside map/layers/portable`)
      return
    }
    if (!exists(manifestPath, `${rel} runtime dependency ${dependency.id}`)) return
    if (stack.has(manifestPath)) {
      fail(`${rel}: circular runtime dependency at ${manifestPath}`)
      return
    }
    const runtimePackage = readJson(manifestPath)
    if (!runtimePackage) return
    if (runtimePackage.type !== RUNTIME_PACKAGE_TYPE) fail(`${manifestPath}: type must be "${RUNTIME_PACKAGE_TYPE}"`)
    if (runtimePackage.id !== dependency.id || runtimePackage.version !== dependency.version) {
      fail(`${rel}: runtime dependency lock mismatch for ${dependency.id}@${dependency.version}`)
    }
    const previous = dependencyPackages.get(runtimePackage.id)
    if (previous && previous.version !== runtimePackage.version) {
      fail(`${rel}: conflicting runtime dependency versions for ${runtimePackage.id}`)
    }
    const runtimeDir = path.dirname(manifestPath)
    const exportedFiles = new Set()
    if (!Array.isArray(runtimePackage.exports) || runtimePackage.exports.length === 0) {
      fail(`${manifestPath}: exports must be a non-empty array`)
    }
    for (const exported of runtimePackage.exports || []) {
      const target = path.resolve(runtimeDir, exported)
      const relativeToRuntime = path.relative(runtimeDir, target)
      if (typeof exported !== 'string' || relativeToRuntime.startsWith('..') || path.isAbsolute(relativeToRuntime)) {
        fail(`${manifestPath}: export must stay inside runtime package: ${exported}`)
        continue
      }
      if (exists(target, `${manifestPath} export "${exported}"`)) {
        exportedFiles.add(target)
        validateRelativeImports(target, runtimeFiles)
      }
    }
    dependencyPackages.set(runtimePackage.id, {
      id: runtimePackage.id,
      version: runtimePackage.version,
      root: runtimeDir,
      exportedFiles,
    })
    const nextStack = new Set(stack).add(manifestPath)
    for (const child of runtimePackage.dependencies || []) visitDependency(runtimeDir, child, nextStack)
  }
  for (const dependency of pkg.runtimeDependencies || []) visitDependency(dir, dependency)
  for (const field of ['id', 'title', 'entrypoint', 'type']) {
    if (!pkg[field]) fail(`${rel}: missing required field "${field}"`)
  }
  if (pkg.type && pkg.type !== 'svgmap-portable-layer') {
    fail(`${rel}: unsupported type "${pkg.type}"`)
  }
  const portabilityLevel = pkg.portability?.level
  if (!VALID_PORTABILITY_LEVELS.has(portabilityLevel)) {
    fail(`${rel}: portability.level must be workspace-portable/distribution-portable`)
  }
  const lawaModes = pkg.runtime?.lawaModes
  if (!Array.isArray(lawaModes) || lawaModes.length === 0) {
    fail(`${rel}: runtime.lawaModes must be a non-empty array`)
  } else {
    for (const mode of lawaModes) {
      if (!VALID_LAWA_MODES.has(mode)) fail(`${rel}: unsupported LaWA mode "${mode}"`)
    }
  }
  if (pkg.runtime?.readyEvent !== 'layerWebAppReady') {
    fail(`${rel}: runtime.readyEvent must be "layerWebAppReady"`)
  }
  if (!Array.isArray(pkg.runtime?.requiredApis) || pkg.runtime.requiredApis.length === 0) {
    fail(`${rel}: runtime.requiredApis must be a non-empty array`)
  }
  const dataInjection = pkg.data?.injection
  if (pkg.portability?.dataInjection === 'hash-params') {
    if (pkg.data?.kind !== 'qtct') fail(`${rel}: hash-param data injection requires data.kind="qtct"`)
    if (dataInjection?.transport !== 'svg-fragment-query') {
      fail(`${rel}: data.injection.transport must be "svg-fragment-query"`)
    }
    const required = dataInjection?.required
    const optional = dataInjection?.optional
    if (!Array.isArray(required) || !required.includes('data') || !required.includes('layer')) {
      fail(`${rel}: data.injection.required must include "data" and "layer"`)
    }
    if (!Array.isArray(optional)) fail(`${rel}: data.injection.optional must be an array`)
    const params = [...(Array.isArray(required) ? required : []), ...(Array.isArray(optional) ? optional : [])]
    for (const param of params) {
      if (!VALID_DATA_PARAMS.has(param)) fail(`${rel}: unsupported data injection parameter "${param}"`)
    }
    if (new Set(params).size !== params.length) fail(`${rel}: duplicate data injection parameter`)
  }
  const isolated = pkg.isolated
  if (isolated) {
    if (isolated.kind !== ISOLATED_ADAPTER_KIND) fail(`${rel}: isolated.kind must be "${ISOLATED_ADAPTER_KIND}"`)
    if (isolated.protocol !== ISOLATED_PROTOCOL) fail(`${rel}: isolated.protocol must be "${ISOLATED_PROTOCOL}"`)
    for (const [field, extension] of Object.entries({
      layerEntrypoint: '.svg',
      controllerEntrypoint: '.html',
      hostBridge: '.js',
    })) {
      const reference = isolated[field]
      if (typeof reference !== 'string' || !reference.startsWith('.') || path.extname(reference) !== extension) {
        fail(`${rel}: isolated.${field} must be a relative ${extension} path`)
        continue
      }
      const target = path.resolve(dir, reference)
      const relativeToPortable = path.relative(portableRoot, target)
      if (relativeToPortable.startsWith('..') || path.isAbsolute(relativeToPortable)) {
        fail(`${rel}: isolated.${field} must resolve inside map/layers/portable`)
      } else if (exists(target, `${rel} isolated.${field}`)) {
        validateRelativeImports(target, runtimeFiles)
      }
    }
  }
  const isolatedRows = pkg.isolated?.detail?.rows
  if (pkg.isolated?.detail && !Array.isArray(isolatedRows)) {
    fail(`${rel}: isolated.detail.rows must be an array`)
  } else if (Array.isArray(isolatedRows)) {
    if (isolatedRows.length === 0 || isolatedRows.length > 24) {
      fail(`${rel}: isolated.detail.rows must contain 1-24 rows`)
    }
    const sources = new Set()
    for (const [index, row] of isolatedRows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        fail(`${rel}: isolated.detail.rows[${index}] must be an object`)
        continue
      }
      const hasProperty = typeof row.property === 'string' && Boolean(row.property.trim())
      const hasField = typeof row.field === 'string' && Boolean(row.field.trim())
      if (hasProperty === hasField) {
        fail(`${rel}: isolated.detail.rows[${index}] requires exactly one property or field`)
      } else if (hasField && !VALID_ISOLATED_DETAIL_FIELDS.has(row.field)) {
        fail(`${rel}: isolated.detail.rows[${index}].field "${row.field}" is unsupported`)
      } else {
        const sourceKey = hasField ? `field:${row.field}` : `property:${row.property}`
        if (sources.has(sourceKey)) fail(`${rel}: duplicate isolated detail source "${sourceKey}"`)
        sources.add(sourceKey)
      }
      if (typeof row.label !== 'string' || !row.label.trim()) {
        fail(`${rel}: isolated.detail.rows[${index}].label is required`)
      }
      if (row.unitProperty != null && (typeof row.unitProperty !== 'string' || !row.unitProperty.trim())) {
        fail(`${rel}: isolated.detail.rows[${index}].unitProperty must be a non-empty string`)
      }
    }
  }
  const isolatedMedia = pkg.isolated?.detail?.media
  if (isolatedMedia != null && !Array.isArray(isolatedMedia)) {
    fail(`${rel}: isolated.detail.media must be an array`)
  } else if (Array.isArray(isolatedMedia)) {
    if (isolatedMedia.length > 2) fail(`${rel}: isolated.detail.media must contain at most 2 items`)
    for (const [index, item] of isolatedMedia.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        fail(`${rel}: isolated.detail.media[${index}] must be an object`)
        continue
      }
      if (!VALID_ISOLATED_DETAIL_FIELDS.has(item.field)) fail(`${rel}: isolated.detail.media[${index}].field is unsupported`)
      if (item.type !== 'image') fail(`${rel}: isolated.detail.media[${index}].type must be "image"`)
      if (typeof item.label !== 'string' || !item.label.trim()) fail(`${rel}: isolated.detail.media[${index}].label is required`)
      if (item.refreshCooldownMs != null && (!Number.isFinite(item.refreshCooldownMs) || item.refreshCooldownMs < 10000 || item.refreshCooldownMs > 60000)) {
        fail(`${rel}: isolated.detail.media[${index}].refreshCooldownMs must be 10000-60000`)
      }
    }
  }
  const isolatedLinks = pkg.isolated?.detail?.links
  if (isolatedLinks != null && !Array.isArray(isolatedLinks)) {
    fail(`${rel}: isolated.detail.links must be an array`)
  } else if (Array.isArray(isolatedLinks)) {
    if (isolatedLinks.length > 4) fail(`${rel}: isolated.detail.links must contain at most 4 items`)
    for (const [index, item] of isolatedLinks.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        fail(`${rel}: isolated.detail.links[${index}] must be an object`)
        continue
      }
      if (!VALID_ISOLATED_DETAIL_FIELDS.has(item.field)) fail(`${rel}: isolated.detail.links[${index}].field is unsupported`)
      if (typeof item.label !== 'string' || !item.label.trim()) fail(`${rel}: isolated.detail.links[${index}].label is required`)
    }
  }
  for (const [key, values] of Object.entries({
    imageHosts: pkg.isolated?.security?.imageHosts,
    linkHosts: pkg.isolated?.security?.linkHosts,
  })) {
    if (values == null) continue
    if (!Array.isArray(values) || values.length === 0 || values.some((host) => typeof host !== 'string' || !HOSTNAME_PATTERN.test(host))) {
      fail(`${rel}: isolated.security.${key} must be a non-empty hostname array`)
    }
  }
  if (Array.isArray(isolatedMedia) && isolatedMedia.length > 0 && !pkg.isolated?.security?.imageHosts?.length) {
    fail(`${rel}: isolated media requires isolated.security.imageHosts`)
  }
  if (Array.isArray(isolatedLinks) && isolatedLinks.length > 0 && !pkg.isolated?.security?.linkHosts?.length) {
    fail(`${rel}: isolated links require isolated.security.linkHosts`)
  }
  const isolatedRender = pkg.isolated?.render
  if (isolatedRender) {
    const icons = isolatedRender.icons
    if (!icons || typeof icons !== 'object' || Array.isArray(icons) || Object.keys(icons).length === 0) {
      fail(`${rel}: isolated.render.icons must be a non-empty object`)
    } else {
      for (const [status, reference] of Object.entries(icons)) {
        if (!/^[a-z0-9_-]+$/i.test(status)) fail(`${rel}: invalid isolated render status "${status}"`)
        if (typeof reference !== 'string' || !reference.startsWith('.') || path.isAbsolute(reference)) {
          fail(`${rel}: isolated.render.icons.${status} must be a relative package path`)
          continue
        }
        const target = path.resolve(dir, reference)
        const iconRoot = path.join(projectRoot, 'map', 'icons')
        if (target !== iconRoot && !target.startsWith(`${iconRoot}${path.sep}`)) {
          fail(`${rel}: isolated.render.icons.${status} must resolve inside map/icons`)
        } else {
          exists(target, `${rel} isolated.render.icons.${status}`)
        }
      }
      if (!isolatedRender.defaultStatus || !Object.hasOwn(icons, isolatedRender.defaultStatus)) {
        fail(`${rel}: isolated.render.defaultStatus must reference a declared icon`)
      }
    }
  }

  const packageExternalDependencies = []
  const absoluteDataUrls = []
  const entrypoint = path.resolve(dir, pkg.entrypoint || '')
  if (exists(entrypoint, `${rel} entrypoint`)) {
    const controller = controllerFromSvg(entrypoint)
    if (!controller) {
      fail(`${rel}: entrypoint has no data-controller`)
    } else {
      const controllerPath = path.resolve(path.dirname(entrypoint), controller)
      if (exists(controllerPath, `${rel} controller`)) validateRelativeImports(controllerPath, runtimeFiles)
    }
  }
  if (pkg.adminEntrypoint) {
    const adminEntrypoint = path.resolve(dir, pkg.adminEntrypoint)
    if (exists(adminEntrypoint, `${rel} adminEntrypoint`)) {
      validateRelativeImports(adminEntrypoint)
    }
  }

  for (const shared of pkg.shared || []) {
    const sharedPath = path.resolve(dir, shared)
    const relativeToPackage = path.relative(dir, sharedPath)
    if (relativeToPackage.startsWith('..') || path.isAbsolute(relativeToPackage)) {
      packageExternalDependencies.push(shared)
    }
    if (exists(sharedPath, `${rel} shared "${shared}"`)) validateRelativeImports(sharedPath, runtimeFiles)
  }

  for (const runtimeFile of runtimeFiles) {
    const relativeToPackage = path.relative(dir, runtimeFile)
    if (!relativeToPackage.startsWith('..') && !path.isAbsolute(relativeToPackage)) continue
    const dependency = [...dependencyPackages.values()].find(({ root }) => (
      runtimeFile === root || runtimeFile.startsWith(`${root}${path.sep}`)
    ))
    if (!dependency) {
      fail(`${rel}: undeclared package-external runtime import: ${runtimeFile}`)
    } else if (!dependency.exportedFiles.has(runtimeFile)) {
      fail(`${rel}: runtime import is not exported by ${dependency.id}@${dependency.version}: ${runtimeFile}`)
    }
  }

  const implementsReadyEvent = [...runtimeFiles].some((filePath) => (
    /\.(?:js|html)$/i.test(filePath)
    && fs.readFileSync(filePath, 'utf8').includes('layerWebAppReady')
  ))
  if (pkg.runtime?.readyEvent === 'layerWebAppReady' && !implementsReadyEvent) {
    fail(`${rel}: entrypoint controller dependency graph does not handle layerWebAppReady`)
  }

  for (const [key, value] of Object.entries(pkg.data || {})) {
    if (typeof value === 'string' && value.startsWith('/map/')) absoluteDataUrls.push(`data.${key}`)
  }
  if (portabilityLevel === 'distribution-portable') {
    if (packageExternalDependencies.length > 0) {
      fail(`${rel}: distribution-portable package has dependencies outside its directory: ${packageExternalDependencies.join(', ')}`)
    }
    if (absoluteDataUrls.length > 0) {
      fail(`${rel}: distribution-portable package has absolute data URLs: ${absoluteDataUrls.join(', ')}`)
    }
  }
  reports.push({
    id: pkg.id || path.basename(dir),
    level: portabilityLevel || 'undeclared',
    lawaModes: Array.isArray(lawaModes) ? lawaModes : [],
    packageExternalDependencies,
    absoluteDataUrls,
    dataContract: dataInjection?.transport || '',
    runtimeDependencies: [...dependencyPackages.values()].map(({ id, version }) => `${id}@${version}`).sort(),
  })

  const summaryPath = resolveMapUrl(pkg.data?.summary)
  if (summaryPath) exists(summaryPath, `${rel} data.summary`)
  const detailTemplate = pkg.data?.detailTemplate
  if (typeof detailTemplate === 'string' && detailTemplate.includes('{regionId}')) {
    for (const region of regions) {
      const detailPath = resolveMapUrl(detailTemplate.replaceAll('{regionId}', region.id))
      if (detailPath) exists(detailPath, `${rel} data.detailTemplate(${region.id})`)
    }
  } else {
    const detailPath = resolveMapUrl(detailTemplate)
    if (detailPath) exists(detailPath, `${rel} data.detailTemplate`)
  }
}

if (errors.length > 0) {
  console.error(`[check-portable-layers] FAILED: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

for (const report of reports) {
  const limits = [
    report.packageExternalDependencies.length > 0
      ? `${report.packageExternalDependencies.length} package-external dependency(s)`
      : '',
    report.absoluteDataUrls.length > 0
      ? `${report.absoluteDataUrls.length} absolute data URL(s)`
      : '',
    report.runtimeDependencies.length > 0
      ? `${report.runtimeDependencies.length} declared runtime package(s)`
      : '',
  ].filter(Boolean).join(', ') || 'no external runtime dependency'
  console.log(`[check-portable-layers] ${report.id}: ${report.level}, LaWA=${report.lawaModes.join('+')}, data=${report.dataContract || 'undeclared'}, runtime=${report.runtimeDependencies.join('+') || 'none'}, ${limits}`)
}
console.log(`[check-portable-layers] OK: ${packages.length} portable layer package(s)`)
