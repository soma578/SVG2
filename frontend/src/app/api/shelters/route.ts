import { NextRequest, NextResponse } from 'next/server'
import { searchShelters } from '@/lib/datasets'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const shelters = await searchShelters({
      q: searchParams.get('q'),
      status: searchParams.get('status'),
      facilityType: searchParams.get('facilityType'),
      bbox: searchParams.get('bbox'),
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      regionId: searchParams.get('region'),
      prefecture: searchParams.get('prefecture'),
      municipalityCode: searchParams.get('muni'),
    })
    return NextResponse.json(shelters)
  } catch (error) {
    console.error('[api/shelters] failed:', error)
    return NextResponse.json({ error: '避難所データの取得に失敗しました' }, { status: 500 })
  }
}
