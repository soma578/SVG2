import { NextResponse } from 'next/server'
import { invalidatePublishedDataCache } from '@/lib/mapPublicData'
import { loadLayerPublishSpecs } from '@/lib/layerPublishSpecs'
import { publishQtctLayer } from '@/lib/publishQtct'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Rebuilding + uploading QTCT layers is an infrequent admin action; give it headroom.
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

    // Per-layer dispatch: each managed layer that declares a qtct-supabase publish block
    // gets rebuilt from its Supabase table → Storage. Layers without a publish block
    // (e.g. evacuation: national static CSV) are intentionally skipped.
    const specs = loadLayerPublishSpecs()
    const qtct = []
    for (const { publish } of specs) {
      qtct.push(await publishQtctLayer(publish))
    }

    return NextResponse.json({
      ok: true,
      mode: 'live-cache-invalidated+qtct-published',
      clearedCacheEntries: cleared,
      publishedLayers: qtct.map((r) => r.qtctLayer),
      qtct,
      note: 'QTCT layers declaring publish:qtct-supabase rebuilt from Supabase → Storage. Static layers (e.g. evacuation national CSV) are skipped by design.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/republish] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
