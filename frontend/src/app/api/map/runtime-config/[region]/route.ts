import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { getMapRegionMeta } from '@/lib/mapRegions'
import { isAllowedMapRegion } from '@/lib/allowedRegions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const runtimeConfigPath = (region: string) =>
  join(process.cwd(), '..', 'map', 'regions', region, 'runtime-config.json')

function loadStaticRuntimeConfig(region: string) {
  const text = readFileSync(runtimeConfigPath(region), 'utf8')
  return JSON.parse(text) as Record<string, unknown>
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
    const config = loadStaticRuntimeConfig(region)
    const meta = getMapRegionMeta(region)
    const prefCode = String(meta?.prefCode || config.prefCode || '').padStart(2, '0')
    const layers = {
      ...(config.layers as Record<string, Record<string, unknown>> | undefined),
    }

    if (layers.evacuation) {
      layers.evacuation = {
        ...layers.evacuation,
        dataUrl: `/api/map/data/evacuation/${region}`,
      }
    }
    if (layers.teamActivity) {
      layers.teamActivity = {
        ...layers.teamActivity,
        dataUrl: `/api/map/data/team-activity/${region}`,
      }
    }

    return NextResponse.json({
      ...config,
      regionId: region,
      label: meta?.label || config.label || region,
      prefCode,
      layers,
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/map/runtime-config] failed', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
