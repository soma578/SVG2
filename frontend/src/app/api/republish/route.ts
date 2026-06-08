import { NextResponse } from 'next/server'
import { invalidatePublishedDataCache } from '@/lib/mapPublicData'
import { publishTeamActivityQtct } from '@/lib/publishQtct'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Rebuilding + uploading team-activity QTCT is an infrequent admin action; give it headroom.
export const maxDuration = 60

function isSameOriginRequest(request: Request) {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  if (origin && origin !== expectedOrigin) return false

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin
    } catch {
      return false
    }
  }

  return true
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const cleared = invalidatePublishedDataCache()
    const qtct = await publishTeamActivityQtct()
    return NextResponse.json({
      ok: true,
      mode: 'live-cache-invalidated+qtct-published',
      clearedCacheEntries: cleared,
      qtct,
      note: 'Team-activity QTCT rebuilt from Supabase and uploaded to Storage. Evacuation QTCT stays as the committed static artifact (national CSV dataset).',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/republish] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
