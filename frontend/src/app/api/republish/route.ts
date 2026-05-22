import { NextResponse } from 'next/server'
import { publishSupabase } from '@/lib/publishSupabase'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const result = await publishSupabase()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/republish] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
