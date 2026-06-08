import { NextResponse } from 'next/server'
import { QTCT_BUCKET } from '@/lib/publishQtct'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// QTCT read endpoint: Storage-first, committed-static fallback.
//   /api/map/qtct/teamActivity/summary        -> qtct/teamActivity/summary.json
//   /api/map/qtct/teamActivity/okayama/detail -> qtct/teamActivity/okayama/detail.json
// If the object exists in Supabase Storage (populated by republish) we redirect to its
// public CDN URL; otherwise we redirect to the committed Stage-1 static file under public/.
// Evacuation is NOT routed here — its container ref points straight at the static path,
// since evac is never published to Storage (national CSV dataset).

const ALLOWED_LAYERS = new Set(['evacuation', 'teamActivity'])
const SEGMENT = /^[A-Za-z0-9_-]+$/

const noStoreRedirect = (location: string) =>
  new NextResponse(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } })

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  if (!Array.isArray(slug) || slug.length < 2 || !ALLOWED_LAYERS.has(slug[0]) || !slug.every((s) => SEGMENT.test(s))) {
    return NextResponse.json({ ok: false, error: 'invalid qtct path' }, { status: 400 })
  }

  const objectPath = `qtct/${slug.join('/')}.json`
  const staticPath = `/map/data/${objectPath}`
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (baseUrl) {
    const publicUrl = `${baseUrl}/storage/v1/object/public/${QTCT_BUCKET}/${objectPath}`
    try {
      const head = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' })
      if (head.ok) return noStoreRedirect(publicUrl)
    } catch {
      // fall through to static
    }
  }

  return noStoreRedirect(staticPath)
}
