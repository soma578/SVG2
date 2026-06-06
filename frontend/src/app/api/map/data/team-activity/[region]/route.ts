import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { isAllowedMapRegion } from '@/lib/allowedRegions'
import { getPublishedTeamActivities } from '@/lib/mapPublicData'
import { getMapRegionMeta } from '@/lib/mapRegions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const liveJson = (body: unknown) =>
  NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })

const fallbackJson = (body: unknown) =>
  NextResponse.json(body, {
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    },
  })

async function readStaticFallback(region: string) {
  const filePath = join(process.cwd(), 'public', 'map', 'data', 'team-activity', `${region}.json`)
  const text = await readFile(filePath, 'utf-8')
  return JSON.parse(text) as unknown
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ region: string }> },
) {
  const { region } = await params
  if (!isAllowedMapRegion(region)) {
    return NextResponse.json({ ok: false, error: 'invalid region' }, { status: 400 })
  }

  try {
    const items = await getPublishedTeamActivities(region)
    if (Array.isArray(items) && items.length > 0) {
      return liveJson({
        version: 1,
        regionId: region,
        prefCode: String(getMapRegionMeta(region)?.prefCode || '').padStart(2, '0'),
        layerId: 'teamActivity',
        generatedFrom: 'supabase-live',
        items,
      })
    }
    return fallbackJson(await readStaticFallback(region))
  } catch (err) {
    console.error('[api/map/data/team-activity] failed', err)
    try {
      return fallbackJson(await readStaticFallback(region))
    } catch {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ ok: false, error: message, items: [] }, { status: 500 })
    }
  }
}
