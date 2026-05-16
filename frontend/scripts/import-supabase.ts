/**
 * import-supabase.ts
 * 既存の静的 JSON → Supabase へ upsert する
 * 使い方: npm run import:supabase
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
})

const CHUNK = 200 // upsert のバッチサイズ

async function upsertChunked<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).upsert(chunk)
    if (error) throw new Error(`${table}[${i}]: ${error.message}`)
    process.stdout.write(`  ${table}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`)
  }
  console.log(`  ${table}: ${rows.length} 件 完了`)
}

// ── evacuation_facilities ──────────────────────────────────
async function importEvacuation() {
  const path = resolve('public/map/data/evacuation/okayama.json')
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  const items: Record<string, unknown>[] = raw.items ?? raw

  const rows = items.map((item) => ({
    id:                String(item.id),
    title:             String(item.title ?? ''),
    subtitle:          item.subtitle != null ? String(item.subtitle) : null,
    description:       item.description != null ? String(item.description) : null,
    address:           item.address != null ? String(item.address) : null,
    status:            String(item.status ?? 'unknown'),
    municipality_code: item.municipalityCode != null ? String(item.municipalityCode) : null,
    pref_code:         item.prefCode != null ? String(item.prefCode) : null,
    region_id:         item.regionId != null ? String(item.regionId) : null,
    lod_rank:          item.lodRank != null ? Number(item.lodRank) : null,
    lat:               Number(item.lat),
    lon:               Number(item.lon),
    capacity:          item.capacity != null ? Number(item.capacity) : null,
    enabled:           true,
  }))

  await upsertChunked('evacuation_facilities', rows)
}

// ── team_activities ───────────────────────────────────────
async function importTeamActivities() {
  const path = resolve('public/map/data/team-activity/okayama.json')
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  const items: Record<string, unknown>[] = raw.items ?? raw

  const rows = items.map((item) => ({
    id:                String(item.id),
    title:             String(item.title ?? item.teamName ?? ''),
    team_id:           item.teamId != null ? String(item.teamId) : null,
    activity_type:     item.activityType != null ? String(item.activityType) : null,
    status:            String(item.status ?? 'active'),
    lat:               Number(item.lat),
    lon:               Number(item.lon),
    municipality_code: item.municipalityCode != null ? String(item.municipalityCode) : null,
    area:              item.area != null ? String(item.area) : null,
    operator:          item.operator != null ? String(item.operator) : null,
    note:              item.note != null ? String(item.note) : null,
    enabled:           true,
  }))

  await upsertChunked('team_activities', rows)
}

;(async () => {
  console.log('=== import-supabase ===')
  await importEvacuation()
  await importTeamActivities()
  console.log('完了')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
