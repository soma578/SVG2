import { NextRequest, NextResponse } from 'next/server'
import { searchTeamActivities } from '@/lib/datasets'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamActivities = await searchTeamActivities({
      q: searchParams.get('q'),
      status: searchParams.get('status'),
      activityType: searchParams.get('activityType'),
      bbox: searchParams.get('bbox'),
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      regionId: searchParams.get('region'),
    })
    return NextResponse.json(teamActivities)
  } catch (error) {
    console.error('[api/team-activity] failed:', error)
    return NextResponse.json({ error: 'チーム活動データの取得に失敗しました' }, { status: 500 })
  }
}
