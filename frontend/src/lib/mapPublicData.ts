import { createClient } from '@supabase/supabase-js'
import { getMapRegionMeta } from '@/lib/mapRegions'
type JsonRow = Record<string, unknown>

const LIVE_DATA_TTL_MS = 15_000
const liveDataCache = new Map<string, { expiresAt: number; rows: JsonRow[] | null }>()

export const invalidatePublishedDataCache = () => {
  const cleared = liveDataCache.size
  liveDataCache.clear()
  return cleared
}

const toStringOrUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  const text = String(value)
  return text.length > 0 ? text : undefined
}

const toNumberOrUndefined = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

const createServiceClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function fetchAllEnabled(table: string) {
  const cached = liveDataCache.get(table)
  if (cached && cached.expiresAt > Date.now()) return cached.rows

  const supabase = createServiceClient()
  if (!supabase) return null

  const pageSize = 1000
  const rows: JsonRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('enabled', true)
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  liveDataCache.set(table, { expiresAt: Date.now() + LIVE_DATA_TTL_MS, rows })
  return rows
}

const matchesRegion = (row: JsonRow, regionId: string) => {
  const meta = getMapRegionMeta(regionId)
  const rowRegionId = toStringOrUndefined(row.regionId) || toStringOrUndefined(row.region_id)
  const rowPrefCode = toStringOrUndefined(row.prefCode) || toStringOrUndefined(row.pref_code)
  const rowMunicipalityCode =
    toStringOrUndefined(row.municipalityCode) || toStringOrUndefined(row.municipality_code)
  const expectedPrefCode = meta?.prefCode ? String(meta.prefCode).padStart(2, '0') : undefined

  if (rowRegionId && rowRegionId === regionId) return true
  if (expectedPrefCode && rowPrefCode && rowPrefCode.padStart(2, '0') === expectedPrefCode) return true
  if (expectedPrefCode && rowMunicipalityCode?.startsWith(expectedPrefCode)) return true
  return false
}

export function mapTeamActivityRow(row: JsonRow, index = 0) {
  const id = toStringOrUndefined(row.id) || toStringOrUndefined(row.team_id) || `team-${index + 1}`
  const title = toStringOrUndefined(row.title) || toStringOrUndefined(row.team_name) || `チーム ${index + 1}`
  return {
    ...row,
    id,
    title,
    kind: toStringOrUndefined(row.kind) || 'team',
    teamId: toStringOrUndefined(row.teamId) || toStringOrUndefined(row.team_id) || id,
    teamName: toStringOrUndefined(row.teamName) || toStringOrUndefined(row.team_name) || title,
    activityType: toStringOrUndefined(row.activityType) || toStringOrUndefined(row.activity_type) || '',
    status: toStringOrUndefined(row.status) || 'active',
    lat: toNumberOrUndefined(row.lat) ?? 0,
    lon: toNumberOrUndefined(row.lon) ?? 0,
    municipalityCode: toStringOrUndefined(row.municipalityCode) || toStringOrUndefined(row.municipality_code) || '',
    districtCode: toStringOrUndefined(row.districtCode) || toStringOrUndefined(row.district_code) || '',
    updatedAt: toStringOrUndefined(row.updatedAt) || toStringOrUndefined(row.updated_at) || '',
    note: toStringOrUndefined(row.note) || '',
    operator: toStringOrUndefined(row.operator) || '',
    area: toStringOrUndefined(row.area) || '',
  }
}

export function mapEvacuationRow(row: JsonRow, index = 0) {
  const id = toStringOrUndefined(row.id) || `evacuation-${index + 1}`
  return {
    ...row,
    id,
    layerId: toStringOrUndefined(row.layerId) || 'evacuation',
    kind: toStringOrUndefined(row.kind) || 'poi',
    title: toStringOrUndefined(row.title) || `避難所 ${index + 1}`,
    subtitle: toStringOrUndefined(row.subtitle) || '',
    category: toStringOrUndefined(row.category) || 'evacuation',
    summary: toStringOrUndefined(row.summary) || '',
    description: toStringOrUndefined(row.description) || '',
    address: toStringOrUndefined(row.address) || '',
    status: toStringOrUndefined(row.status) || 'unknown',
    municipalityCode: toStringOrUndefined(row.municipalityCode) || toStringOrUndefined(row.municipality_code) || '',
    prefCode: toStringOrUndefined(row.prefCode) || toStringOrUndefined(row.pref_code) || '',
    regionId: toStringOrUndefined(row.regionId) || toStringOrUndefined(row.region_id) || '',
    lodRank: toNumberOrUndefined(row.lodRank) ?? toNumberOrUndefined(row.lod_rank) ?? 5,
    lat: toNumberOrUndefined(row.lat) ?? 0,
    lon: toNumberOrUndefined(row.lon) ?? 0,
    capacity: toNumberOrUndefined(row.capacity) ?? null,
  }
}

export async function getPublishedTeamActivities(regionId: string) {
  if (!hasSupabaseEnv()) return null
  const rows = await fetchAllEnabled('team_activities')
  return rows
    ?.filter((row) => matchesRegion(row, regionId))
    .map(mapTeamActivityRow) ?? null
}

export async function getPublishedEvacuation(regionId: string) {
  if (!hasSupabaseEnv()) return null
  const rows = await fetchAllEnabled('evacuation_facilities')
  return rows
    ?.filter((row) => matchesRegion(row, regionId))
    .map(mapEvacuationRow) ?? null
}

/**
 * Live evacuation status overlay for a region: { [qtctRecordId]: status }.
 *
 * Keyed to match the id baked into the static evac QTCT (`evacuation:<facilityCode>`),
 * so the pins layer can patch leaf-record status at detail zoom without rebuilding the
 * 129k-point tree. Returns {} when Supabase env or the (optional) `evacuation_status`
 * table is absent — i.e. pre-table the map simply renders CSV-default status.
 *
 * Expected table: evacuation_status(facility_id text, pref_code text, status text,
 *                                    enabled bool default true, updated_at timestamptz)
 * `facility_id` may be the bare code (`E33...`) or the full id (`evacuation:E33...`).
 */
export async function getEvacuationStatusOverlay(regionId: string): Promise<Record<string, string>> {
  if (!hasSupabaseEnv()) return {}
  const supabase = createServiceClient()
  if (!supabase) return {}
  const meta = getMapRegionMeta(regionId)
  const prefCode = meta?.prefCode ? String(meta.prefCode).padStart(2, '0') : undefined
  try {
    let query = supabase.from('evacuation_status').select('facility_id,status').eq('enabled', true)
    if (prefCode) query = query.eq('pref_code', prefCode)
    const { data, error } = await query
    if (error || !data) return {}
    const overlay: Record<string, string> = {}
    for (const row of data) {
      const rawId = toStringOrUndefined(row.facility_id)
      const status = toStringOrUndefined(row.status)
      if (!rawId || !status) continue
      const id = rawId.startsWith('evacuation:') ? rawId : `evacuation:${rawId}`
      overlay[id] = status
    }
    return overlay
  } catch {
    return {}
  }
}
