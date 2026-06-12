/**
 * Per-layer QTCT publish (Stage B).
 *
 * Each managed pin layer declares its publish behavior in its own
 * map/layers/managed/<id>/layer.config.json:
 *
 *   "publish": { "kind": "qtct-supabase", "table": "team_activities", "qtctLayer": "teamActivity" }
 *
 * republish discovers those declarations (layerPublishSpecs.ts) and dispatches here.
 * This file knows HOW to publish a qtct-supabase layer; it does NOT hardcode which
 * layers exist. Adding a Supabase-backed pin layer = add a layer.config.json with a
 * publish block + its representativePinsLayer animation. No pipeline code changes.
 *
 * Why not "rebuild every layer from Supabase": evacuation is a national CSV-derived
 * static dataset (129k); Supabase only holds the okayama subset, so it stays static and
 * declares no publish block. teamActivity is 100% Supabase → it declares qtct-supabase.
 *
 * Storage layout (Stage-1 path contract):
 *   map-qtct/qtct/{qtctLayer}/{region}/detail.json
 *   map-qtct/qtct/{qtctLayer}/summary.json
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
  type QtctLayer,
  type QtctRecord,
} from './buildQtct'

export const QTCT_BUCKET = 'map-qtct'

export type QtctPublishSpec = {
  kind: 'qtct-supabase'
  table: string
  qtctLayer: keyof typeof QTCT_LAYERS
}

export type QtctPublishResult = {
  qtctLayer: string
  table: string
  bucket: string
  regions: number
  records: number
  uploaded: number
}

type RawRow = Record<string, unknown>

// Per-table row normalizer. Most tables whose columns already match the QTCT field
// names (snake_case is read directly by toQtctRecord) need no entry → identity.
// teamActivity keeps its existing normalizer so output stays byte-identical to Stage 2.
const ROW_MAPPERS: Partial<Record<keyof typeof QTCT_LAYERS, (row: RawRow, i: number) => RawRow>> = {
  teamActivity: (row, i) => mapTeamActivityRow(row, i) as RawRow,
}

const createServiceClient = (): SupabaseClient | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function fetchAllEnabled(supabase: SupabaseClient, table: string): Promise<RawRow[]> {
  const PAGE = 1000
  const rows: RawRow[] = []
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
const resolveRegionId = (row: RawRow): string | null => {
  const explicit = str(row.regionId || row.region_id)
  if (explicit) return explicit
  const pref = str(row.prefCode || row.pref_code)
  if (pref) return regionIdForPrefCode(pref)
  const muni = str(row.municipalityCode || row.municipality_code)
  if (muni.length >= 2) return regionIdForPrefCode(muni.slice(0, 2))
  return null
}

async function ensureBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.createBucket(QTCT_BUCKET, { public: true })
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
 * Rebuild one layer's QTCT from its Supabase table and publish to Storage.
 * Uploads a detail doc for every known region (authoritative — a region that drops to
 * zero is overwritten, not left stale) plus one global summary.
 */
export async function publishQtctLayer(
  spec: QtctPublishSpec,
  client?: SupabaseClient,
): Promise<QtctPublishResult> {
  const supabase = client ?? createServiceClient()
  if (!supabase) throw new Error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です')

  const layer: QtctLayer = QTCT_LAYERS[spec.qtctLayer]
  if (!layer) throw new Error(`unknown qtctLayer: ${spec.qtctLayer}`)

  await ensureBucket(supabase)

  const mapRow = ROW_MAPPERS[spec.qtctLayer]
  const raw = await fetchAllEnabled(supabase, spec.table)
  const rows = mapRow ? raw.map((r, i) => mapRow(r, i)) : raw

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

  const allRecords: QtctRecord[] = []
  const tasks: Promise<void>[] = []
  let uploaded = 0
  for (const [regionId, records] of byRegion) {
    allRecords.push(...records)
    const objectPath = `qtct/${layer.id}/${regionId}/detail.json`
    tasks.push(uploadJson(supabase, objectPath, buildDetailDoc(layer, regionId, records)).then(() => {
      uploaded += 1
    }))
  }
  await Promise.all(tasks)

  await uploadJson(supabase, `qtct/${layer.id}/summary.json`, buildSummaryDoc(layer, allRecords))
  uploaded += 1

  return {
    qtctLayer: layer.id,
    table: spec.table,
    bucket: QTCT_BUCKET,
    regions: byRegion.size,
    records: allRecords.length,
    uploaded,
  }
}
