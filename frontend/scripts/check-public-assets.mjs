import fs from 'node:fs'
import path from 'node:path'

const files = [
  'public/svgMapAppLayers/basemaps/dynamicDenshiKokudo2016.svg',
  'public/map/svgMapAppLayers/basemaps/dynamicDenshiKokudo2016.svg',
  'public/map/webapp/current-map.html',
  'public/map/containers/Containers_webapp_denshi_33.svg',
]

for (const rel of files) {
  const abs = path.join(process.cwd(), rel)
  const exists = fs.existsSync(abs)
  console.log('[check-public-assets]', rel, exists)
  if (!exists) {
    throw new Error(`missing required asset: ${rel}`)
  }
}
