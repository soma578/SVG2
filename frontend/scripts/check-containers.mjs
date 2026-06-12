#!/usr/bin/env node
/**
 * check-containers.mjs
 *
 * Validates the generated prefecture container SVGs against the layer declarations.
 * The expected layer set is NOT hardcoded — it comes from the same scan
 * (map/layers/managed/<dir>/layer.config.json + map/layers/dropins/) that
 * generate-denshi-containers.mjs uses, so generation and contract cannot drift.
 *
 * Checks, per container:
 *   1. every scanned layer id exists exactly once
 *   2. every xlink:href target file exists under public/
 *      (skips /api/ routes and {code}-style URL templates)
 *   3. hash-param data refs (summary= / data= / prefSvgUrl= / statusOverlay=) checked too
 *
 * Runs after prepare-public-assets in the prebuild chain, so it validates what is
 * actually served. A managed layer config that points at a missing file fails the build.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanAllLayers } from './lib/scanLayers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const publicRoot = path.join(ROOT, 'frontend', 'public')
const containersDir = path.join(publicRoot, 'map', 'containers')

const EXPECTED_CONTAINER_COUNT = 47

const layers = scanAllLayers(ROOT)
const requiredIds = layers.map((l) => l.id)

const isCheckablePath = (p) =>
  p.startsWith('/') && !p.startsWith('/api/') && !p.includes('{')

const fileExists = (urlPath) => fs.existsSync(path.join(publicRoot, urlPath))

const collectRefs = (href) => {
  const [base, hash] = href.split('#')
  const refs = []
  if (base) refs.push(base)
  if (hash) {
    const params = new URLSearchParams(hash)
    for (const key of ['summary', 'data', 'prefSvgUrl', 'svgUrlTemplate', 'statusOverlay']) {
      const value = params.get(key)
      if (value) refs.push(value)
    }
  }
  return refs.filter(isCheckablePath)
}

const containerFiles = fs.existsSync(containersDir)
  ? fs.readdirSync(containersDir).filter((f) => /^Containers_webapp_denshi_\d{2}\.svg$/.test(f)).sort()
  : []

const errors = []

if (requiredIds.length === 0) {
  errors.push('no layer declarations found (map/layers/managed, map/layers/dropins)')
}

if (containerFiles.length !== EXPECTED_CONTAINER_COUNT) {
  errors.push(`expected ${EXPECTED_CONTAINER_COUNT} containers, found ${containerFiles.length} in ${containersDir}`)
}

const refCache = new Map() // ref -> exists (dedupe fs checks across 47 files)

for (const file of containerFiles) {
  const svg = fs.readFileSync(path.join(containersDir, file), 'utf8')

  // 1. every declared layer present exactly once
  for (const id of requiredIds) {
    const count = svg.split(`<animation id="${id}"`).length - 1
    if (count !== 1) {
      errors.push(`${file}: animation id "${id}" appears ${count} times (expected 1)`)
    }
  }

  // 2./3. referenced files exist
  for (const [, href] of svg.matchAll(/xlink:href="([^"]+)"/g)) {
    const decoded = href.replaceAll('&amp;', '&')
    for (const ref of collectRefs(decoded)) {
      if (!refCache.has(ref)) refCache.set(ref, fileExists(ref))
      if (!refCache.get(ref)) {
        errors.push(`${file}: missing referenced asset: ${ref}`)
      }
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error('[check-containers] FAIL', e)
  throw new Error(`container validation failed (${errors.length} error(s))`)
}

console.log(`[check-containers] OK: ${containerFiles.length} containers, ${requiredIds.length} declared layers each (${layers.filter((l) => l.source.startsWith('managed')).length} managed + ${layers.filter((l) => l.source.startsWith('dropins')).length} dropin), ${refCache.size} referenced assets all present`)
