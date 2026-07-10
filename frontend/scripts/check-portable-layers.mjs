#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..', '..')
const portableRoot = path.join(projectRoot, 'map', 'layers', 'portable')
const regionsIndexPath = path.join(projectRoot, 'map', 'regions', 'index.json')

const errors = []

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

const findRelativeImports = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8')
  const imports = []
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    if (match[1].startsWith('.')) imports.push(match[1])
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1].startsWith('.')) imports.push(match[1])
  }
  return imports
}

const validateRelativeImports = (filePath, seen = new Set()) => {
  const key = path.resolve(filePath)
  if (seen.has(key) || !fs.existsSync(key)) return
  seen.add(key)
  for (const specifier of findRelativeImports(key)) {
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
  for (const field of ['id', 'title', 'entrypoint', 'type']) {
    if (!pkg[field]) fail(`${rel}: missing required field "${field}"`)
  }
  if (pkg.type && pkg.type !== 'svgmap-portable-layer') {
    fail(`${rel}: unsupported type "${pkg.type}"`)
  }

  const entrypoint = path.resolve(dir, pkg.entrypoint || '')
  if (exists(entrypoint, `${rel} entrypoint`)) {
    const controller = controllerFromSvg(entrypoint)
    if (!controller) {
      fail(`${rel}: entrypoint has no data-controller`)
    } else {
      const controllerPath = path.resolve(path.dirname(entrypoint), controller)
      if (exists(controllerPath, `${rel} controller`)) validateRelativeImports(controllerPath)
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
    if (exists(sharedPath, `${rel} shared "${shared}"`)) validateRelativeImports(sharedPath)
  }

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

console.log(`[check-portable-layers] OK: ${packages.length} portable layer package(s)`)
