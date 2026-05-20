/**
 * Supabase (enabled=true) → 静的 JSON を再生成する共有ロジック
 * scripts/publish-supabase.ts と /api/republish の両方から呼ばれる
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { mapEvacuationRow, mapTeamActivityRow } from './mapPublicData'

export type PublishResult = {
  evacuation: number
  teamActivities: number
  outputs: string[]
}

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  filter: Record<string, unknown> = {},
): Promise<T[]> {
  const PAGE = 1000
  const rows: T[] = []
  let from = 0
  while (true) {
    let q = supabase.from(table).select('*').range(from, from + PAGE - 1)
    for (const [col, val] of Object.entries(filter)) q = q.eq(col, val)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

function writeJson(path: string, data: unknown, outputs: string[]) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  outputs.push(path)
}

export async function publishSupabase(cwd: string = process.cwd()): Promise<PublishResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です')
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const outputs: string[] = []

  const evacRows = await fetchAll<Record<string, unknown>>(supabase, 'evacuation_facilities', { enabled: true })
  const evacItems = evacRows.map(mapEvacuationRow)
  writeJson(
    resolve(cwd, 'public/map/data/evacuation/okayama.json'),
    { version: 1, regionId: 'okayama', prefCode: '33', layerId: 'evacuation', generatedFrom: 'supabase', items: evacItems },
    outputs,
  )

  const teamRows = await fetchAll<Record<string, unknown>>(supabase, 'team_activities', { enabled: true })
  const teamItems = teamRows.map(mapTeamActivityRow)
  writeJson(
    resolve(cwd, 'public/map/data/team-activity/okayama.json'),
    { version: 1, regionId: 'okayama', layerId: 'teamActivity', generatedFrom: 'supabase', items: teamItems },
    outputs,
  )

  return { evacuation: evacItems.length, teamActivities: teamItems.length, outputs }
}
