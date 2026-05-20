import { createClient } from '@supabase/supabase-js'

type JsonRow = Record<string, unknown>

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

  return rows
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
  if (regionId !== 'okayama' || !hasSupabaseEnv()) return null
  const rows = await fetchAllEnabled('team_activities')
  return rows?.map(mapTeamActivityRow) ?? null
}

export async function getPublishedEvacuation(regionId: string) {
  if (regionId !== 'okayama' || !hasSupabaseEnv()) return null
  const rows = await fetchAllEnabled('evacuation_facilities')
  return rows?.map(mapEvacuationRow) ?? null
}
