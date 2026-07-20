#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..', '..')
const root = path.join(projectRoot, 'map', 'distribution', 'portable')
const errors = []
const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
const runtimePackageIntegrity = (manifestPath, runtimePackage) => {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(manifestPath))
  for (const exported of [...(runtimePackage.exports || [])].sort()) {
    const filePath = path.resolve(path.dirname(manifestPath), exported)
    if (!fs.existsSync(filePath)) return ''
    hash.update(`\0${exported}\0`)
    hash.update(fs.readFileSync(filePath))
  }
  return `sha256-${hash.digest('hex')}`
}
const fail = (message) => errors.push(message)
const ISOLATED_ADAPTER_KIND = 'svg3-postmessage-adapter'
const ISOLATED_PROTOCOL = 'svgmap-isolated-layer@1'
const SUMMARY_FORBIDDEN_FIELDS = new Set([
  'records', 'address', 'summary', 'description', 'area', 'operator', 'properties',
  'imageUrl', 'normalImageUrl', 'liveUrl', 'pageUrl', 'provider',
])

const validateCompactSummaryNode = (node, label, maxDepth) => {
  if (!node || typeof node !== 'object') return fail(`${label}: invalid compact summary node`)
  for (const field of SUMMARY_FORBIDDEN_FIELDS) {
    if (Object.hasOwn(node, field) || Object.hasOwn(node.representative || {}, field)) {
      fail(`${label}: compact summary contains "${field}"`)
    }
  }
  if (Number(node.depth) > maxDepth) fail(`${label}: summary node exceeds summaryMaxDepth`)
  if (Number(node.depth) >= maxDepth && node.children?.length) fail(`${label}: summary retains children beyond summaryMaxDepth`)
  for (const child of node.children || []) validateCompactSummaryNode(child, label, maxDepth)
}

const relativeImports = (text) => {
  const imports = new Set()
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    if (match[1].startsWith('.')) imports.add(match[1])
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1].startsWith('.')) imports.add(match[1])
  }
  return [...imports]
}

const assertBundleReference = (bundleRoot, fromFile, reference, label) => {
  const target = path.resolve(path.dirname(fromFile), reference.split('#')[0].split('?')[0])
  if (target !== bundleRoot && !target.startsWith(`${bundleRoot}${path.sep}`)) {
    fail(`${label}: reference escapes bundle: ${reference}`)
  } else if (!fs.existsSync(target)) {
    fail(`${label}: reference not found: ${reference}`)
  }
}

const manifests = []
const walk = (directory) => {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(target)
    else if (entry.name === 'bundle.manifest.json') manifests.push(target)
  }
}
walk(root)
if (manifests.length === 0) fail(`no bundle manifests found in ${root}`)

for (const manifestPath of manifests.sort()) {
  const bundleRoot = path.dirname(manifestPath)
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail(`${manifestPath}: invalid JSON: ${error.message}`)
    continue
  }
  const label = `${manifest.packageId}/${manifest.regionId}`
  if (manifest.portability?.pathIndependent !== true) fail(`${label}: pathIndependent must be true`)
  if (manifest.portability?.lawaModes?.tight !== 'supported') fail(`${label}: tight fixture is not supported`)
  if (manifest.portability?.lawaModes?.isolated !== 'adapter-supported') fail(`${label}: isolated adapter status is missing`)
  if (!['prototype', 'verified-adapter'].includes(manifest.portability?.protocolFixtures?.isolated)) {
    fail(`${label}: isolated protocol fixture status is missing`)
  }
  for (const required of ['Container.svg', 'viewer.html', 'Container.isolated.svg', 'viewer-isolated.html']) {
    if (!fs.existsSync(path.join(bundleRoot, required))) fail(`${label}: missing ${required}`)
  }
  for (const file of manifest.files || []) {
    const target = path.resolve(bundleRoot, file.path)
    if (target !== bundleRoot && !target.startsWith(`${bundleRoot}${path.sep}`)) {
      fail(`${label}: manifest path escapes bundle: ${file.path}`)
      continue
    }
    if (!fs.existsSync(target)) {
      fail(`${label}: missing file: ${file.path}`)
      continue
    }
    if (sha256(target) !== file.sha256) fail(`${label}: hash mismatch: ${file.path}`)
    if (/\.(?:html|js|mjs|svg|json)$/i.test(target)) {
      const text = fs.readFileSync(target, 'utf8')
      if (/(?:["'(=]|&quot;)\/map\//.test(text)) fail(`${label}: root-absolute /map URL: ${file.path}`)
      const isBundledVendor = file.path.startsWith('map/vendor/svgmapjs/')
      if (!isBundledVendor && /\.(?:html|js|mjs)$/i.test(target)) {
        for (const reference of relativeImports(text)) {
          assertBundleReference(bundleRoot, target, reference, `${label}: ${file.path}`)
        }
      }
      if (/\.svg$/i.test(target)) {
        const controller = text.match(/\bdata-controller\s*=\s*["']([^"']+)["']/)?.[1]
        if (controller) assertBundleReference(bundleRoot, target, controller, `${label}: ${file.path}`)
      }
      if (path.basename(target) === 'layer.package.json') {
        const pkg = JSON.parse(text)
        assertBundleReference(bundleRoot, target, pkg.entrypoint, `${label}: layer.package.json entrypoint`)
        for (const shared of pkg.shared || []) {
          assertBundleReference(bundleRoot, target, shared, `${label}: layer.package.json shared`)
        }
        if (pkg.id === manifest.packageId) {
          if (pkg.data?.injection?.transport !== 'svg-fragment-query') fail(`${label}: bundled package data injection contract is missing`)
          if (!pkg.data?.injection?.required?.includes('data') || !pkg.data?.injection?.required?.includes('layer')) {
            fail(`${label}: bundled package required data parameters are invalid`)
          }
          for (const field of ['summary', 'detail']) {
            assertBundleReference(bundleRoot, target, pkg.data?.[field] || '', `${label}: layer.package.json data.${field}`)
          }
          if (JSON.stringify(pkg.runtimeDependencyLock || []) !== JSON.stringify(manifest.portability?.runtimeDependencies || [])) {
            fail(`${label}: bundled package runtime dependency lock differs from manifest`)
          }
          if (pkg.isolated?.kind !== ISOLATED_ADAPTER_KIND) fail(`${label}: bundled package isolated.kind is invalid`)
          if (pkg.isolated?.protocol !== ISOLATED_PROTOCOL) fail(`${label}: bundled package isolated.protocol is invalid`)
          for (const field of ['layerEntrypoint', 'controllerEntrypoint', 'hostBridge']) {
            assertBundleReference(bundleRoot, target, pkg.isolated?.[field] || '', `${label}: layer.package.json isolated.${field}`)
          }
        }
      }
    }
  }
  const summaryFiles = (manifest.files || []).filter((file) => /\/summary\.json$/.test(file.path))
  if (summaryFiles.length !== 1) {
    fail(`${label}: bundle must contain exactly one regional summary.json`)
  } else {
    const summary = JSON.parse(fs.readFileSync(path.join(bundleRoot, summaryFiles[0].path), 'utf8'))
    if (summary.summaryOnly !== true) fail(`${label}: regional summary must declare summaryOnly=true`)
    if (!Number.isInteger(summary.summaryMaxDepth) || summary.summaryMaxDepth < 1 || summary.summaryMaxDepth > 12) {
      fail(`${label}: invalid summaryMaxDepth`)
    } else {
      validateCompactSummaryNode(summary.tree, label, summary.summaryMaxDepth)
    }
  }
  const container = fs.readFileSync(path.join(bundleRoot, 'Container.svg'), 'utf8')
  const href = container.match(/xlink:href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&') || ''
  const entrypoint = href.split('#')[0]
  if (!entrypoint || !fs.existsSync(path.join(bundleRoot, entrypoint))) fail(`${label}: Container entrypoint missing: ${entrypoint}`)
  const isolatedEntrypoints = manifest.portability?.isolatedEntrypoints
  if (isolatedEntrypoints?.protocol !== ISOLATED_PROTOCOL) fail(`${label}: manifest isolated protocol is invalid`)
  for (const field of ['layer', 'controller', 'hostBridge']) {
    const reference = isolatedEntrypoints?.[field]
    const target = typeof reference === 'string' ? path.resolve(bundleRoot, reference) : ''
    if (!reference || !target.startsWith(`${bundleRoot}${path.sep}`) || !fs.existsSync(target)) {
      fail(`${label}: manifest isolatedEntrypoints.${field} is invalid`)
    }
  }
  const isolatedContainer = fs.readFileSync(path.join(bundleRoot, 'Container.isolated.svg'), 'utf8')
  const isolatedHref = isolatedContainer.match(/xlink:href="([^"]+)"/)?.[1] || ''
  if (isolatedHref !== isolatedEntrypoints?.layer) fail(`${label}: isolated Container does not use declared layer entrypoint`)
  const dependencyIds = new Set()
  for (const dependency of manifest.portability?.runtimeDependencies || []) {
    if (!dependency.id || !dependency.version || !dependency.manifest || !dependency.integrity) {
      fail(`${label}: invalid runtime dependency lock entry`)
      continue
    }
    if (dependencyIds.has(dependency.id)) fail(`${label}: duplicate runtime dependency ${dependency.id}`)
    dependencyIds.add(dependency.id)
    const dependencyManifest = path.join(bundleRoot, 'map', 'layers', 'portable', dependency.manifest)
    if (!fs.existsSync(dependencyManifest)) {
      fail(`${label}: runtime dependency manifest missing: ${dependency.manifest}`)
      continue
    }
    const runtimePackage = JSON.parse(fs.readFileSync(dependencyManifest, 'utf8'))
    if (runtimePackage.id !== dependency.id || runtimePackage.version !== dependency.version) {
      fail(`${label}: runtime dependency lock mismatch: ${dependency.id}@${dependency.version}`)
    }
    if (runtimePackageIntegrity(dependencyManifest, runtimePackage) !== dependency.integrity) {
      fail(`${label}: runtime dependency integrity mismatch: ${dependency.id}@${dependency.version}`)
    }
  }
  console.log(`[portable-bundle-check] ${label}: tight=PASS, isolated-package=ADAPTER-SUPPORTED, isolated-protocol=${manifest.portability.protocolFixtures.isolated.toUpperCase()}, path-independent=PASS`)
}

if (errors.length > 0) {
  console.error(`[portable-bundle-check] FAILED: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`[portable-bundle-check] OK: ${manifests.length} bundle(s)`)
