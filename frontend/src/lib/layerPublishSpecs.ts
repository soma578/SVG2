/**
 * Reads per-layer publish declarations from managed layer configs
 * (map/layers/managed/<dir>/layer.config.json -> optional "publish" block).
 *
 * This is the runtime counterpart to scripts/lib/scanLayers.mjs (build-time container
 * scan). Both read the SAME self-describing layer.config.json files, so the publish
 * contract is declared once, next to the layer. republish dispatches on these.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { QtctPublishSpec } from './publishQtct'

export type LayerPublishEntry = {
  layerId: string
  publish: QtctPublishSpec
}

const managedDir = () => join(process.cwd(), '..', 'map', 'layers', 'managed')

const isQtctSupabaseSpec = (p: unknown): p is QtctPublishSpec =>
  !!p &&
  typeof p === 'object' &&
  (p as { kind?: unknown }).kind === 'qtct-supabase' &&
  typeof (p as { table?: unknown }).table === 'string' &&
  typeof (p as { qtctLayer?: unknown }).qtctLayer === 'string'

export const loadLayerPublishSpecs = (): LayerPublishEntry[] => {
  const dir = managedDir()
  if (!existsSync(dir)) return []
  const entries: LayerPublishEntry[] = []
  for (const name of readdirSync(dir)) {
    const configPath = join(dir, name, 'layer.config.json')
    if (!existsSync(configPath)) continue
    let config: { id?: string; publish?: unknown }
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'))
    } catch {
      continue
    }
    if (config.id && isQtctSupabaseSpec(config.publish)) {
      entries.push({ layerId: config.id, publish: config.publish })
    }
  }
  return entries.sort((a, b) => a.layerId.localeCompare(b.layerId))
}
