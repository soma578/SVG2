import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(frontendRoot, '..')
const publicRoot = path.join(frontendRoot, 'public')

const copyTargets = [
  ['map', 'map'],
  ['svgMapAppLayers', 'svgMapAppLayers'],
]

fs.mkdirSync(publicRoot, { recursive: true })

for (const [sourceName, destName] of copyTargets) {
  const source = path.join(projectRoot, sourceName)
  const dest = path.join(publicRoot, destName)
  if (!fs.existsSync(source)) {
    console.warn(`[prepare-public-assets] missing source: ${source}`)
    continue
  }
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(source, dest, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      const base = path.basename(src)
      if (
        base === 'node_modules' ||
        base === '.git' ||
        base === '__pycache__' ||
        base.endsWith(':Zone.Identifier')
      ) return false
      return true
    },
  })
  console.log(`[prepare-public-assets] copied ${sourceName} -> public/${destName}`)
}
