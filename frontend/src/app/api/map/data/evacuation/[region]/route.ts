import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { getPublishedEvacuation } from '@/lib/mapPublicData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function readStaticFallback(region: string) {
  const filePath = join(process.cwd(), 'public', 'map', 'data', 'evacuation', `${region}.json`)
  const text = await readFile(filePath, 'utf-8')
  return JSON.parse(text) as unknown
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ region: string }> },
) {
  const { region } = await params
  try {
    const items = await getPublishedEvacuation(region)
    if (items) {
      return NextResponse.json({
        version: 1,
        regionId: region,
        prefCode: '33',
        layerId: 'evacuation',
        generatedFrom: 'supabase-live',
        items,
      })
    }
    return NextResponse.json(await readStaticFallback(region))
  } catch (err) {
    console.error('[api/map/data/evacuation] failed', err)
    try {
      return NextResponse.json(await readStaticFallback(region))
    } catch {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ ok: false, error: message, items: [] }, { status: 500 })
    }
  }
}
