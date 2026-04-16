import fs from 'node:fs'
import path from 'node:path'

const frontendRoot = path.resolve(import.meta.dirname, '..')
const projectRoot = path.resolve(frontendRoot, '..')
const nationalMunicipalitiesSourcePath = path.join(frontendRoot, 'public', 'data', 'source', 'n03_national_light.geojson')
const nationalPrefecturesSourcePath = path.join(frontendRoot, 'public', 'data', 'source', 'national', 'prefectures-low.geojson')
const nationalMunicipalityIndexPath = path.join(frontendRoot, 'public', 'search-index', 'japan-municipalities.json')
const nationalBaseAreaSvgPath = path.join(frontendRoot, 'public', 'map', 'layers', 'base_area_japan.svg')
const hierarchicalOverviewIndexPath = path.join(frontendRoot, 'public', 'search-index', 'japan-hierarchical-overview.json')
const regionsIndexPath = path.join(frontendRoot, 'public', 'regions', 'index.json')

const copies = [
  {
    source: path.join(projectRoot, 'map'),
    destination: path.join(frontendRoot, 'public', 'map'),
  },
  {
    source: path.join(projectRoot, 'svgMapAppLayers'),
    destination: path.join(frontendRoot, 'public', 'svgMapAppLayers'),
  },
  {
    source: path.join(projectRoot, 'data', 'source', 'national', 'shelters-light.geojson'),
    destination: path.join(frontendRoot, 'public', 'data', 'source', 'national', 'shelters-light.geojson'),
  },
]

for (const { source, destination } of copies) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing source directory: ${source}`)
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    dereference: true,
  })
}

const collectLngLatPairs = (value, pairs) => {
  if (!Array.isArray(value) || value.length === 0) return
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    const lon = Number(value[0])
    const lat = Number(value[1])
    if (Number.isFinite(lon) && Number.isFinite(lat)) pairs.push([lon, lat])
    return
  }
  value.forEach((item) => collectLngLatPairs(item, pairs))
}

const escapeXml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const computeGeometryStats = (geometry) => {
  const pairs = []
  collectLngLatPairs(geometry?.coordinates, pairs)
  if (pairs.length === 0) return null

  let minLon = pairs[0][0]
  let maxLon = pairs[0][0]
  let minLat = pairs[0][1]
  let maxLat = pairs[0][1]

  for (const [lon, lat] of pairs) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  const lonSpan = Math.max((maxLon - minLon) * 1.25, 0.08)
  const latSpan = Math.max((maxLat - minLat) * 1.25, 0.06)
  const span = Math.max(lonSpan, latSpan)

  return {
    lon: (minLon + maxLon) / 2,
    lat: (minLat + maxLat) / 2,
    lonSpan,
    latSpan,
    zoom: Math.min(11, Math.max(6, Math.log2(360 / span))),
  }
}

const pointInRing = (lon, lat, ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = Number(ring[i]?.[0])
    const yi = Number(ring[i]?.[1])
    const xj = Number(ring[j]?.[0])
    const yj = Number(ring[j]?.[1])
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

const pointInPolygonGeometry = (lon, lat, geometry) => {
  if (!geometry || !Array.isArray(geometry.coordinates)) return false
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : []

  return polygons.some((polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) return false
    const [outerRing, ...holes] = polygon
    if (!Array.isArray(outerRing) || outerRing.length < 3) return false
    if (!pointInRing(lon, lat, outerRing)) return false
    return !holes.some((hole) => Array.isArray(hole) && hole.length >= 3 && pointInRing(lon, lat, hole))
  })
}

const collectGeometryPathSegments = (geometry, pathSegments) => {
  if (!geometry || !Array.isArray(geometry.coordinates)) return
  const appendRing = (ring) => {
    if (!Array.isArray(ring) || ring.length === 0) return
    const points = ring.filter(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
    )
    if (points.length === 0) return
    const [firstLon, firstLat] = points[0]
    pathSegments.push(`M ${Number(firstLon).toFixed(6)} ${Number(firstLat).toFixed(6)}`)
    for (let index = 1; index < points.length; index += 1) {
      const [lon, lat] = points[index]
      pathSegments.push(`L ${Number(lon).toFixed(6)} ${Number(lat).toFixed(6)}`)
    }
    pathSegments.push('Z')
  }

  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach((ring) => appendRing(ring))
    return
  }
  if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((polygon) => {
      if (!Array.isArray(polygon)) return
      polygon.forEach((ring) => appendRing(ring))
    })
  }
}

const buildNationalBaseAreaSvg = () => {
  if (!fs.existsSync(nationalPrefecturesSourcePath)) return 0

  const geojson = JSON.parse(fs.readFileSync(nationalPrefecturesSourcePath, 'utf8'))
  const features = Array.isArray(geojson?.features) ? geojson.features : []
  if (features.length === 0) return 0

  const boundsPairs = []
  const pathMarkup = features.flatMap((feature, index) => {
    const props = feature?.properties ?? {}
    const label = String(props.pref || props.name || '').trim()
    if (!label) return []

    collectLngLatPairs(feature?.geometry?.coordinates, boundsPairs)
    const pathSegments = []
    collectGeometryPathSegments(feature?.geometry, pathSegments)
    if (pathSegments.length === 0) return []

    return [
      `  <path id="k_pref_${index + 1}" class="district" d="${pathSegments.join(' ')}"><title>${escapeXml(label)}</title></path>`,
    ]
  })

  if (boundsPairs.length === 0 || pathMarkup.length === 0) return 0

  let minLon = boundsPairs[0][0]
  let maxLon = boundsPairs[0][0]
  let minLat = boundsPairs[0][1]
  let maxLat = boundsPairs[0][1]
  for (const [lon, lat] of boundsPairs) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  const paddingLon = Math.max((maxLon - minLon) * 0.04, 0.6)
  const paddingLat = Math.max((maxLat - minLat) * 0.04, 0.4)
  const viewBoxMinLon = minLon - paddingLon
  const viewBoxMinLat = minLat - paddingLat
  const viewBoxWidth = maxLon - minLon + paddingLon * 2
  const viewBoxHeight = maxLat - minLat + paddingLat * 2

  const svgMarkup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="${viewBoxMinLon.toFixed(6)} ${viewBoxMinLat.toFixed(6)} ${viewBoxWidth.toFixed(6)} ${viewBoxHeight.toFixed(6)}"
     xmlns:go="http://purl.org/svgmap/profile">
<title>全国ベースエリア</title>
<globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />

<defs>
  <style>
    .district {
      fill: rgba(147, 197, 253, 0.12);
      stroke: rgba(37, 99, 235, 0.78);
      stroke-width: 0.02;
    }
    .district:hover {
      fill: rgba(147, 197, 253, 0.26);
    }
  </style>
</defs>

<g id="districts">
${pathMarkup.join('\n')}
</g>
</svg>
`

  fs.mkdirSync(path.dirname(nationalBaseAreaSvgPath), { recursive: true })
  fs.writeFileSync(nationalBaseAreaSvgPath, svgMarkup, 'utf8')
  return pathMarkup.length
}

const buildNationalMunicipalitySearchIndex = () => {
  if (!fs.existsSync(nationalMunicipalitiesSourcePath)) return 0

  const geojson = JSON.parse(fs.readFileSync(nationalMunicipalitiesSourcePath, 'utf8'))
  const features = Array.isArray(geojson?.features) ? geojson.features : []
  const items = features.flatMap((feature) => {
    const props = feature?.properties ?? {}
    const pref = String(props.pref || '').trim()
    const name = String(props.name || '').trim()
    const n03Code = String(props.n03_code || '').trim()
    if (!pref || !name) return []

    const stats = computeGeometryStats(feature?.geometry)
    if (!stats) return []

    const fullName = `${pref}${name}`.trim()
    return [{
      id: `municipality-${n03Code || fullName}`,
      name: fullName,
      lat: stats.lat,
      lon: stats.lon,
      latSpan: stats.latSpan,
      lonSpan: stats.lonSpan,
      zoom: stats.zoom,
      address: fullName,
      subtitle: pref,
      summary: `自治体: ${name}`,
      source: '/data/source/n03_national_light.geojson',
      searchTokens: [fullName, pref, name, n03Code].filter(Boolean).join(' ').toLowerCase(),
    }]
  })

  fs.mkdirSync(path.dirname(nationalMunicipalityIndexPath), { recursive: true })
  fs.writeFileSync(nationalMunicipalityIndexPath, JSON.stringify(items), 'utf8')
  return items.length
}

const loadJsonIfExists = (filePath) => {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const loadOverviewTeamActivityRecords = () => {
  const regionsIndex = loadJsonIfExists(regionsIndexPath)
  const regions = Array.isArray(regionsIndex?.regions) ? regionsIndex.regions : []
  const records = []
  const seenIds = new Set()

  for (const regionEntry of regions) {
    const regionId = String(regionEntry?.regionId || '').trim()
    if (!regionId || regionId === 'japan' || regionId.endsWith('-demo')) continue

    const publishedPath = path.join(frontendRoot, 'public', 'data', regionId, 'team-activity.json')
    const fallbackPath = path.join(frontendRoot, 'public', 'regions', regionId, 'team-activity-fallback.json')
    const dataset = loadJsonIfExists(publishedPath) ?? loadJsonIfExists(fallbackPath) ?? []
    if (!Array.isArray(dataset)) continue

    for (const entry of dataset) {
      const uniqueId = `${regionId}:${String(entry?.id || '')}`
      if (seenIds.has(uniqueId)) continue
      seenIds.add(uniqueId)
      records.push({
        ...entry,
        regionId,
      })
    }
  }

  return records
}

const buildHierarchicalOverviewIndex = () => {
  if (!fs.existsSync(nationalMunicipalitiesSourcePath)) return { prefectures: [], municipalities: [] }

  const municipalityGeoJson = JSON.parse(fs.readFileSync(nationalMunicipalitiesSourcePath, 'utf8'))
  const municipalityFeatures = Array.isArray(municipalityGeoJson?.features) ? municipalityGeoJson.features : []
  const prefectureGeoJson = loadJsonIfExists(nationalPrefecturesSourcePath)
  const prefectureFeatures = Array.isArray(prefectureGeoJson?.features) ? prefectureGeoJson.features : []
  const municipalitySearchIndex = loadJsonIfExists(nationalMunicipalityIndexPath) ?? []
  const municipalityIndexByCode = new Map(
    municipalitySearchIndex.map((entry) => [
      String(entry?.id || '').replace(/^municipality-/, ''),
      entry,
    ])
  )

  const prefectureCounts = new Map()
  const municipalityCounts = new Map()
  const activityRecords = loadOverviewTeamActivityRecords()

  for (const record of activityRecords) {
    const lon = Number(record?.lon)
    const lat = Number(record?.lat)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue

    const match = municipalityFeatures.find((feature) => pointInPolygonGeometry(lon, lat, feature?.geometry))
    if (!match) continue
    const props = match.properties ?? {}
    const pref = String(props.pref || '').trim()
    const n03Code = String(props.n03_code || '').trim()
    const municipalityName = String(props.name || '').trim()
    if (!pref || !n03Code) continue

    prefectureCounts.set(pref, (prefectureCounts.get(pref) ?? 0) + 1)
    municipalityCounts.set(n03Code, (municipalityCounts.get(n03Code) ?? 0) + 1)
  }

  const prefectures = prefectureFeatures.flatMap((feature) => {
    const props = feature?.properties ?? {}
    const pref = String(props.pref || props.name || '').trim()
    if (!pref) return []

    const stats = computeGeometryStats(feature?.geometry)
    return [{
      pref,
      teamActivityCount: prefectureCounts.get(pref) ?? 0,
      lat: Number(stats?.lat ?? NaN),
      lon: Number(stats?.lon ?? NaN),
      latSpan: Number(stats?.latSpan ?? NaN),
      lonSpan: Number(stats?.lonSpan ?? NaN),
      zoom: Number(stats?.zoom ?? NaN),
    }]
  })

  const municipalities = municipalityFeatures.map((feature) => {
    const props = feature.properties ?? {}
    const n03Code = String(props.n03_code || '').trim()
    const pref = String(props.pref || '').trim()
    const name = String(props.name || '').trim()
    const searchEntry = municipalityIndexByCode.get(n03Code)
    return {
      n03Code,
      pref,
      name,
      teamActivityCount: municipalityCounts.get(n03Code) ?? 0,
      lat: Number(searchEntry?.lat ?? NaN),
      lon: Number(searchEntry?.lon ?? NaN),
      latSpan: Number(searchEntry?.latSpan ?? NaN),
      lonSpan: Number(searchEntry?.lonSpan ?? NaN),
      zoom: Number(searchEntry?.zoom ?? NaN),
    }
  })

  const payload = {
    generatedAt: new Date().toISOString(),
    prefectures,
    municipalities,
  }
  fs.mkdirSync(path.dirname(hierarchicalOverviewIndexPath), { recursive: true })
  fs.writeFileSync(hierarchicalOverviewIndexPath, JSON.stringify(payload), 'utf8')
  return payload
}

const municipalityIndexCount = buildNationalMunicipalitySearchIndex()
const nationalBaseAreaFeatureCount = buildNationalBaseAreaSvg()
const hierarchicalOverview = buildHierarchicalOverviewIndex()

console.log('[prepare-public-assets] copied map assets into frontend/public')
console.log(`[prepare-public-assets] japan municipality search index: ${municipalityIndexCount}`)
console.log(`[prepare-public-assets] japan base-area svg features: ${nationalBaseAreaFeatureCount}`)
console.log(`[prepare-public-assets] japan overview prefectures: ${hierarchicalOverview.prefectures.length}`)
