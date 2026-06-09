/**
 * Quad-tree clustering (QTCT) builder — TypeScript port of
 * scripts/generate-representative-qtct.mjs, callable at runtime (republish API).
 *
 * Output documents match the Stage-1 unified schema:
 *   { schemaVersion, layerId, regionId, label, bounds, total, maxDepth, leafSize, tree }
 * and the layer-first path contract:
 *   qtct/{layer}/{region}/detail.json   (per-region full tree)
 *   qtct/{layer}/summary.json           (global cross-region summary tree)
 */

export const JAPAN_BOUNDS = { minLon: 122.434, minLat: 23.546, maxLon: 154.487, maxLat: 46.056 }
export const MAX_DEPTH = 12
export const LEAF_SIZE = 2
export const QTCT_SCHEMA_VERSION = 1

export type QtctLayer = { id: string; label: string; kind: string }

export const QTCT_LAYERS: Record<'evacuation' | 'teamActivity', QtctLayer> = {
  evacuation: { id: 'evacuation', label: '避難所', kind: 'shelter' },
  teamActivity: { id: 'teamActivity', label: '活動情報', kind: 'team' },
}

type Bounds = { minLon: number; minLat: number; maxLon: number; maxLat: number }

export type QtctRecord = {
  id: string
  title: string
  layerId: string
  kind: string
  status: string
  municipalityCode: string
  districtCode: string
  regionId: string
  lat: number
  lon: number
  summary: string
  description: string
  address: string
  capacity: number | null
  area: string
  operator: string
}

type QtctNode = {
  id: number
  depth: number
  bounds: Bounds
  count: number
  representative: QtctRecord & { representative: boolean; count: number }
  records?: QtctRecord[]
  children?: QtctNode[]
}

export type QtctDoc = {
  schemaVersion: number
  layerId: string
  regionId: string
  label: string
  bounds: Bounds
  total: number
  maxDepth: number
  leafSize: number
  tree: QtctNode | null
}

const asNumber = (value: unknown): number | null => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

type RawRecord = Record<string, unknown>

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** Mirror of normalizeRecord() in the .mjs script. Returns null when out of bounds. */
export const toQtctRecord = (
  raw: RawRecord,
  layer: QtctLayer,
  regionId: string,
  index: number,
): QtctRecord | null => {
  const lat = asNumber(raw.lat ?? raw.latitude)
  const lon = asNumber(raw.lon ?? raw.lng ?? raw.longitude)
  if (lat == null || lon == null) return null
  if (lon < JAPAN_BOUNDS.minLon || lon > JAPAN_BOUNDS.maxLon || lat < JAPAN_BOUNDS.minLat || lat > JAPAN_BOUNDS.maxLat) {
    return null
  }
  const id = str(raw.id || raw.teamId || `${layer.id}:${regionId}:${index}`)
  const title = str(raw.title || raw.name || raw.teamName || id)
  return {
    id,
    title,
    layerId: layer.id,
    kind: layer.kind,
    status: str(raw.status || 'unknown'),
    municipalityCode: str(raw.municipalityCode || raw.municipality_code || ''),
    districtCode: str(raw.districtCode || raw.district_code || ''),
    regionId: str(raw.regionId || raw.region_id || regionId),
    lat,
    lon,
    summary: str(raw.summary || raw.subtitle || raw.activityType || ''),
    description: str(raw.description || raw.note || raw.summary || ''),
    address: str(raw.address || ''),
    capacity: raw.capacity == null ? null : (asNumber(raw.capacity) ?? null),
    area: str(raw.area || ''),
    operator: str(raw.operator || ''),
  }
}

const centroidRepresentative = (records: QtctRecord[]): QtctRecord => {
  let lat = 0
  let lon = 0
  for (const r of records) {
    lat += r.lat
    lon += r.lon
  }
  lat /= records.length
  lon /= records.length
  let best = records[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const r of records) {
    const score = (r.lat - lat) ** 2 + (r.lon - lon) ** 2
    if (score < bestScore) {
      best = r
      bestScore = score
    }
  }
  return best
}

const childBounds = (b: Bounds): Bounds[] => {
  const midLon = (b.minLon + b.maxLon) / 2
  const midLat = (b.minLat + b.maxLat) / 2
  return [
    { minLon: b.minLon, minLat: b.minLat, maxLon: midLon, maxLat: midLat },
    { minLon: midLon, minLat: b.minLat, maxLon: b.maxLon, maxLat: midLat },
    { minLon: b.minLon, minLat: midLat, maxLon: midLon, maxLat: b.maxLat },
    { minLon: midLon, minLat: midLat, maxLon: b.maxLon, maxLat: b.maxLat },
  ]
}

const pickRecordFields = (r: QtctRecord): QtctRecord => ({
  id: r.id,
  title: r.title,
  layerId: r.layerId,
  kind: r.kind,
  status: r.status,
  municipalityCode: r.municipalityCode,
  districtCode: r.districtCode,
  regionId: r.regionId,
  lat: r.lat,
  lon: r.lon,
  summary: r.summary,
  description: r.description,
  address: r.address,
  capacity: r.capacity,
  area: r.area,
  operator: r.operator,
})

const buildNode = (
  records: QtctRecord[],
  bounds: Bounds,
  depth: number,
  counter: { n: number },
): QtctNode => {
  const rep = centroidRepresentative(records)
  const node: QtctNode = {
    id: counter.n++,
    depth,
    bounds,
    count: records.length,
    representative: {
      ...pickRecordFields(rep),
      representative: records.length > 1,
      count: records.length,
    },
  }

  if (records.length <= LEAF_SIZE || depth >= MAX_DEPTH) {
    node.records = records.map(pickRecordFields)
    return node
  }

  const children = childBounds(bounds)
  const midLon = (bounds.minLon + bounds.maxLon) / 2
  const midLat = (bounds.minLat + bounds.maxLat) / 2
  const groups: QtctRecord[][] = [[], [], [], []]
  for (const r of records) {
    const east = r.lon >= midLon ? 1 : 0
    const north = r.lat >= midLat ? 2 : 0
    groups[east + north].push(r)
  }
  node.children = children
    .map((child, i) => (groups[i].length > 0 ? buildNode(groups[i], child, depth + 1, counter) : null))
    .filter((c): c is QtctNode => c !== null)
  return node
}

const stripLeafRecords = (node: QtctNode | null): QtctNode | null => {
  if (!node) return null
  const { records: _records, children, ...rest } = node
  void _records
  if (!children) return rest as QtctNode
  return { ...rest, children: children.map(stripLeafRecords).filter((c): c is QtctNode => c !== null) } as QtctNode
}

/** Build one per-region detail document. */
export const buildDetailDoc = (layer: QtctLayer, regionId: string, records: QtctRecord[]): QtctDoc => {
  const counter = { n: 0 }
  const tree = records.length > 0 ? buildNode(records, JAPAN_BOUNDS, 0, counter) : null
  return {
    schemaVersion: QTCT_SCHEMA_VERSION,
    layerId: layer.id,
    regionId,
    label: layer.label,
    bounds: JAPAN_BOUNDS,
    total: records.length,
    maxDepth: MAX_DEPTH,
    leafSize: LEAF_SIZE,
    tree,
  }
}

/** Build the global cross-region summary document (leaf records stripped). */
export const buildSummaryDoc = (layer: QtctLayer, allRecords: QtctRecord[]): QtctDoc => {
  const counter = { n: 0 }
  const tree = allRecords.length > 0 ? stripLeafRecords(buildNode(allRecords, JAPAN_BOUNDS, 0, counter)) : null
  return {
    schemaVersion: QTCT_SCHEMA_VERSION,
    layerId: layer.id,
    regionId: 'all',
    label: layer.label,
    bounds: JAPAN_BOUNDS,
    total: allRecords.length,
    maxDepth: MAX_DEPTH,
    leafSize: LEAF_SIZE,
    tree,
  }
}
