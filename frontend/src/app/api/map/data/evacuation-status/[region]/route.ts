import { NextResponse } from 'next/server'
import { isAllowedMapRegion } from '@/lib/allowedRegions'
import { getEvacuationStatusOverlay } from '@/lib/mapPublicData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Evacuation live-status overlay: { [qtctRecordId]: status } for one region.
// Small, live, and decoupled from the static QTCT tree (see getEvacuationStatusOverlay).
// Always returns 200 with an object — {} pre-table so the map degrades to CSV-default status.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ region: string }> },
) {
  const { region } = await params
  if (!isAllowedMapRegion(region)) {
    return NextResponse.json({ ok: false, error: 'invalid region' }, { status: 400 })
  }
  try {
    const overlay = await getEvacuationStatusOverlay(region)
    return NextResponse.json(overlay, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } })
  }
}
