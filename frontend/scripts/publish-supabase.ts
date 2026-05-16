/**
 * publish-supabase.ts
 * Supabase (enabled=true) → 静的 JSON を再生成する
 * 使い方: npm run publish:supabase
 */
import { publishSupabase } from '../src/lib/publishSupabase'

;(async () => {
  console.log('=== publish-supabase ===')
  const result = await publishSupabase()
  console.log(`  evacuation_facilities: ${result.evacuation} 件`)
  console.log(`  team_activities: ${result.teamActivities} 件`)
  for (const out of result.outputs) console.log(`  書き出し: ${out}`)
  console.log('完了')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
