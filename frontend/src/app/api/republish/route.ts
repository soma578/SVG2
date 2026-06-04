import { NextResponse } from 'next/server'
import { invalidatePublishedDataCache } from '@/lib/mapPublicData'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    return NextResponse.json({
      ok: true,
      mode: 'live-cache-invalidated',
      clearedCacheEntries: cleared,
      note: 'Public map data is served from Supabase live APIs. Runtime writes to public/ are intentionally not used.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/republish] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
