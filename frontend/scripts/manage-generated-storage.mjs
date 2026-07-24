#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(frontendRoot, '..')

const targets = {
  'gis-workspace': {
    path: path.join(projectRoot, 'map/layers/_build'),
    role: 'manual-cache',
    cleanable: true,
    requiresManualAck: true,
    rebuild: 'Not rebuilt by map:build; rerun the source GIS/GDAL workflow.',
  },
  'public-map': {
    path: path.join(frontendRoot, 'public/map'),
    role: 'deployment-mirror',
    cleanable: true,
    rebuild: 'npm run map:sync',
  },
  'portable-releases': {
    path: path.join(projectRoot, 'map/distribution/portable'),
    role: 'tracked-release',
    cleanable: false,
    rebuild: 'npm run map:release',
  },
  'map-data': {
    path: path.join(projectRoot, 'map/data'),
    role: 'mixed-source-and-generated',
    cleanable: false,
    rebuild: 'No single rebuild command; contains authoritative snapshots.',
  },
  'public-districts': {
    path: path.join(frontendRoot, 'public/data'),
    role: 'legacy-tracked-deployment-mirror',
    cleanable: false,
    rebuild: 'npm run assets:prepare -- --all-districts',
  },
}

const args = process.argv.slice(2)
const has = (name) => args.includes(name)
const values = (name) => {
  const result = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) result.push(args[index + 1])
    else if (args[index].startsWith(`${name}=`)) result.push(args[index].slice(name.length + 1))
  }
  return result
}

const selectedNames = values('--target')
const apply = has('--apply')
const check = has('--check')
const json = has('--json')
const manualAck = has('--accept-manual-rebuild')

const assertInsideProject = (targetPath) => {
  const relative = path.relative(projectRoot, path.resolve(targetPath))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`storage target escapes or equals project root: ${targetPath}`)
  }
}

const measure = (targetPath) => {
  if (!fs.existsSync(targetPath)) return { bytes: 0, files: 0, directories: 0 }
  const stack = [targetPath]
  let bytes = 0
  let files = 0
  let directories = 0
  while (stack.length > 0) {
    const current = stack.pop()
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) {
      directories += 1
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry))
    } else {
      files += 1
      bytes += stat.size
    }
  }
  return { bytes, files, directories }
}

const trackedCount = (targetPath) => {
  const relative = path.relative(projectRoot, targetPath).split(path.sep).join('/')
  const result = spawnSync('git', ['ls-files', '--', relative], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ls-files failed for ${relative}`)
  return result.stdout.split(/\r?\n/).filter(Boolean).length
}

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = -1
  do {
    value /= 1024
    unit += 1
  } while (value >= 1024 && unit < units.length - 1)
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`
}

for (const spec of Object.values(targets)) assertInsideProject(spec.path)

const names = selectedNames.length > 0 ? [...new Set(selectedNames)] : Object.keys(targets)
for (const name of names) {
  if (!targets[name]) {
    throw new Error(`unknown --target "${name}". Available: ${Object.keys(targets).join(', ')}`)
  }
}
if (apply && selectedNames.length === 0) {
  throw new Error('--apply requires at least one explicit --target')
}

const report = names.map((name) => {
  const spec = targets[name]
  const tracked = trackedCount(spec.path)
  return {
    name,
    path: path.relative(projectRoot, spec.path).split(path.sep).join('/'),
    role: spec.role,
    ...measure(spec.path),
    tracked,
    cleanable: spec.cleanable,
    requiresManualAck: spec.requiresManualAck === true,
    rebuild: spec.rebuild,
  }
})

if (check) {
  for (const item of report) {
    const spec = targets[item.name]
    if (spec.cleanable && item.tracked > 0) {
      throw new Error(`${item.name}: cleanable target contains ${item.tracked} tracked file(s)`)
    }
  }
}

if (json) {
  console.log(JSON.stringify({ schemaVersion: 1, targets: report }, null, 2))
} else {
  for (const item of report) {
    const disposition = item.cleanable ? 'explicit-clean' : 'protected'
    console.log(
      `[storage] ${item.name}: ${formatBytes(item.bytes)}, ${item.files} file(s), `
      + `${item.tracked} tracked, ${item.role}, ${disposition}`,
    )
    console.log(`[storage]   ${item.path}; rebuild: ${item.rebuild}`)
  }
}

if (apply) {
  for (const item of report) {
    const spec = targets[item.name]
    if (!spec.cleanable) throw new Error(`${item.name}: protected storage target`)
    if (item.tracked > 0) throw new Error(`${item.name}: refuses to delete tracked files`)
    if (spec.requiresManualAck && !manualAck) {
      throw new Error(`${item.name}: add --accept-manual-rebuild because map:build cannot recreate it`)
    }
  }
  for (const item of report) {
    fs.rmSync(targets[item.name].path, { recursive: true, force: true })
    console.log(`[storage] removed ${item.path} (${formatBytes(item.bytes)})`)
  }
}
