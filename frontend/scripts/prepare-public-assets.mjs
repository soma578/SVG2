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

const realpathSafe = (targetPath) => {
  try {
    return fs.realpathSync(targetPath)
  } catch {
    return null
  }
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

  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(source, dest, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      const base = path.basename(src)
      const stat = fs.lstatSync(src)
      if (
        stat.isSymbolicLink() ||
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

const nestedSvgMapAppLayers = path.join(publicRoot, 'map', 'svgMapAppLayers')
fs.mkdirSync(nestedSvgMapAppLayers, { recursive: true })
fs.cpSync(path.join(projectRoot, 'svgMapAppLayers'), nestedSvgMapAppLayers, {
  recursive: true,
  dereference: false,
  filter: (src) => {
    const base = path.basename(src)
    const stat = fs.lstatSync(src)
    if (
      stat.isSymbolicLink() ||
      base === 'node_modules' ||
      base === '.git' ||
      base === '__pycache__' ||
      base.endsWith(':Zone.Identifier')
    ) return false
    return true
  },
})
console.log('[prepare-public-assets] copied svgMapAppLayers -> public/map/svgMapAppLayers')
