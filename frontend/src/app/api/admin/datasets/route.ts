import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/adminAuth'
import { getDatasetMetadata } from '@/lib/datasets'

export async function GET(request: NextRequest) {
  try {
    if (!getAdminSession(request)) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }
    const regionId = request.nextUrl.searchParams.get('region')
    const [shelters, teamActivity] = await Promise.all([
      getDatasetMetadata('shelters', regionId),
      getDatasetMetadata('team-activity', regionId),
    ])
    return NextResponse.json({ datasets: [shelters, teamActivity] })
  } catch (error) {
    console.error('[api/admin/datasets] failed:', error)
    return NextResponse.json({ error: 'データセット情報の取得に失敗しました' }, { status: 500 })
  }
}
