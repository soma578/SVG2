/**
 * Stage 2: republish team-activity QTCT from Supabase live data to Supabase Storage.
 *
 * Scope is intentionally team-activity ONLY:
 *  - team_activities is 100% Supabase-sourced and changes live → it goes stale as static QTCT.
 *  - evacuation is a national CSV-derived static dataset (129k across 47 prefs); Supabase only
 *    holds the okayama-managed subset, so rebuilding evac from Supabase would drop 46 prefectures.
 *    Evac therefore stays as the committed Stage-1 static artifact and is never written here.
 *
 * Storage layout mirrors the Stage-1 path contract:
 *   map-qtct/qtct/teamActivity/{region}/detail.json
 *   map-qtct/qtct/teamActivity/summary.json
 * Reads go through /api/map/qtct (Storage-first, committed-static fallback).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mapTeamActivityRow } from './mapPublicData'
import { getAllMapRegions, regionIdForPrefCode } from './mapRegions'
import {
  QTCT_LAYERS,
  buildDetailDoc,
  buildSummaryDoc,
  toQtctRecord,
  type QtctRecord,
} from './buildQtct'

export const QTCT_BUCKET = 'map-qtct'

export type QtctPublishResult = {
  layer: 'teamActivity'
  bucket: string
  regions: number
  records: number
  uploaded: string[]
}

const createServiceClient = (): SupabaseClient | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function fetchAllEnabled(supabase: SupabaseClient, table: string) {
  const PAGE = 1000
  const rows: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select('*').eq('enabled', true).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** Resolve a row to a region id via explicit regionId, prefCode, or municipalityCode prefix. */
const resolveRegionId = (row: Record<string, unknown>): string | null => {
  const explicit = str(row.regionId || row.region_id)
  if (explicit) return explicit
  const pref = str(row.prefCode || row.pref_code)
  if (pref) return regionIdForPrefCode(pref)
  const muni = str(row.municipalityCode || row.municipality_code)
  if (muni.length >= 2) return regionIdForPrefCode(muni.slice(0, 2))
  return null
}

async function ensureBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.createBucket(QTCT_BUCKET, {
    public: true,
  })
  // Ignore "already exists" — createBucket is idempotent for our purposes.
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`createBucket(${QTCT_BUCKET}): ${error.message}`)
  }
}

async function uploadJson(supabase: SupabaseClient, objectPath: string, doc: unknown) {
  const body = Buffer.from(`${JSON.stringify(doc)}\n`, 'utf-8')
  const { error } = await supabase.storage.from(QTCT_BUCKET).upload(objectPath, body, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '30',
  })
  if (error) throw new Error(`upload(${objectPath}): ${error.message}`)
}

/**
 * Rebuild the team-activity QTCT from Supabase and publish it to Storage.
 * Uploads a detail doc for every known region (authoritative, so a region that
 * drops to zero is overwritten, not left stale) plus one global summary.
 */
export async function publishTeamActivityQtct(): Promise<QtctPublishResult> {
  const supabase = createServiceClient()
  if (!supabase) throw new Error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です')

  await ensureBucket(supabase)

  const layer = QTCT_LAYERS.teamActivity
  const rows = (await fetchAllEnabled(supabase, 'team_activities')).map((r, i) => mapTeamActivityRow(r, i))

  // Group records by region.
  const byRegion = new Map<string, QtctRecord[]>()
  for (const region of getAllMapRegions()) byRegion.set(region.id, [])
  let index = 0
  for (const row of rows) {
    const regionId = resolveRegionId(row)
    if (!regionId) continue
    if (!byRegion.has(regionId)) byRegion.set(regionId, [])
    const rec = toQtctRecord(row, layer, regionId, index++)
    if (rec) byRegion.get(regionId)!.push(rec)
  }

  const uploaded: string[] = []
  const allRecords: QtctRecord[] = []
  const tasks: Promise<void>[] = []

  for (const [regionId, records] of byRegion) {
    allRecords.push(...records)
    const objectPath = `qtct/${layer.id}/${regionId}/detail.json`
    tasks.push(uploadJson(supabase, objectPath, buildDetailDoc(layer, regionId, records)).then(() => {
      uploaded.push(objectPath)
    }))
  }

  await Promise.all(tasks)

  const summaryPath = `qtct/${layer.id}/summary.json`
  await uploadJson(supabase, summaryPath, buildSummaryDoc(layer, allRecords))
  uploaded.push(summaryPath)

  return {
    layer: 'teamActivity',
    bucket: QTCT_BUCKET,
    regions: byRegion.size,
    records: allRecords.length,
    uploaded,
  }
}
