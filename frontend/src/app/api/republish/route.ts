import { NextResponse } from 'next/server'
import { publishSupabase } from '@/lib/publishSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await publishSupabase()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/republish] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
