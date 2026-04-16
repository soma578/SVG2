#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const publicDir = resolve(__dirname, '../public')
const projectRoot = resolve(__dirname, '../..')
const legacyOutputPath = resolve(publicDir, 'data/search-index.json')
const splitOutputDir = resolve(publicDir, 'search-index')

const toNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const buildDistrictEntries = (districtDict) =>
  Object.entries(districtDict).flatMap(([key, value]) => {
    const lon = toNumber(value?.centroid_lon)
    const lat = toNumber(value?.centroid_lat)
    if (lon == null || lat == null) return []

    const district = value?.district || value?.district_norm || ''
    const city = value?.city || ''
    const ward = value?.ward || ''
    const pref = value?.pref || ''
    const fullName = `${city}${ward}${district}`.trim() || key.replace(/\|/g, '')
    const address = `${pref}${city}${ward}${district}`.trim() || undefined
    const keyCode = value?.key_code || key
    const searchableText = [fullName, address, district, value?.district_norm, key.replace(/\|/g, ''), key]
      .filter(Boolean)
      .join(' ')

    return [{
      id: `district-${keyCode}`,
      name: fullName,
      type: 'district',
      lat,
      lon,
      zoom: 14,
      address,
      searchableText,
    }]
  })

const buildShelterEntries = (shelterGeoJson) =>
  (shelterGeoJson?.features || []).flatMap((feature, idx) => {
    const coordinates = feature?.geometry?.coordinates
    if (!Array.isArray(coordinates) || coordinates.length < 2) return []

    const lon = toNumber(coordinates[0])
    const lat = toNumber(coordinates[1])
    if (lon == null || lat == null) return []

    const props = feature?.properties || {}
    const name = String(props?.P20_002 || props?.name || '').trim()
    if (!name) return []
    const address = String(props?.P20_003 || props?.address || '').trim() || undefined
    const selectedFeatureId = `shelter-${props?.NO ?? idx}`
    const searchableText = [name, address, props?.P20_001, props?.備考].filter(Boolean).join(' ')

    return [{
      id: selectedFeatureId,
      selectedFeatureId,
      layerId: 'evacuation',
      name,
      type: 'shelter',
      lat,
      lon,
      zoom: 16,
      address,
      category: 'evacuation',
      subtitle: props?.P20_001 || undefined,
      summary: props?.備考 || props?.P20_004 || undefined,
      source: 'okayama_shelters.geojson',
      searchableText,
    }]
  })

const buildTeamActivityEntries = (teamActivities) =>
  teamActivities.flatMap((entry, idx) => {
    const lon = toNumber(entry?.lon)
    const lat = toNumber(entry?.lat)
    if (lon == null || lat == null) return []

    const name = String(entry?.title || entry?.teamName || '').trim()
    if (!name) return []
    const operator = String(entry?.operator || '').trim()
    const area = String(entry?.area || '').trim()
    const note = String(entry?.note || '').trim()
    const status = String(entry?.status || '').trim()
    const activityType = String(entry?.activityType || '').trim()
    const id = String(entry?.id || `team-${idx}`)
    const searchableText = [name, entry?.teamName, operator, area, note, status, activityType]
      .filter(Boolean)
      .join(' ')

    return [{
      id,
      selectedFeatureId: id,
      layerId: 'teamActivity',
      name,
      type: 'team',
      lat,
      lon,
      zoom: 15,
      address: area || undefined,
      category: activityType || 'teamActivity',
      subtitle: operator || undefined,
      summary: note || (status ? `状態: ${status}` : undefined),
      source: 'team_activity_okayama.json',
      searchableText,
      updatedAt: entry?.updatedAt || undefined,
    }]
  })

const writeJsonFile = async (path, data) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

const main = async () => {
  const districtDict = JSON.parse(await readFile(resolve(publicDir, 'okayama_district_dict.json'), 'utf8'))
  const shelterGeoJson = JSON.parse(await readFile(resolve(publicDir, 'okayama_shelters.geojson'), 'utf8'))
  const teamActivityJson = JSON.parse(await readFile(resolve(projectRoot, 'map/data/team_activity_okayama.json'), 'utf8'))

  const districtEntries = buildDistrictEntries(districtDict)
  const evacuationEntries = buildShelterEntries(shelterGeoJson)
  const teamActivityEntries = buildTeamActivityEntries(teamActivityJson)

  const initialEntries = [
    ...districtEntries,
    ...evacuationEntries,
    ...teamActivityEntries,
  ]

  await writeJsonFile(resolve(splitOutputDir, 'base-area.json'), districtEntries)
  await writeJsonFile(resolve(splitOutputDir, 'evacuation.json'), evacuationEntries)
  await writeJsonFile(resolve(splitOutputDir, 'team-activity.json'), teamActivityEntries)

  // Backward compatibility for older consumers.
  await writeJsonFile(legacyOutputPath, initialEntries)

  console.log(`[search-index] base-area=${districtEntries.length}`)
  console.log(`[search-index] evacuation=${evacuationEntries.length}`)
  console.log(`[search-index] team-activity=${teamActivityEntries.length}`)
  console.log(`[search-index] total=${initialEntries.length}`)
  console.log(`[search-index] wrote split files to ${splitOutputDir}`)
  console.log(`[search-index] wrote legacy index to ${legacyOutputPath}`)
}

main().catch((error) => {
  console.error('[build-search-index] failed:', error)
  process.exit(1)
})
