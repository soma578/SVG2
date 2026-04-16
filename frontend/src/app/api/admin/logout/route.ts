import { NextRequest, NextResponse } from 'next/server'
import { clearAdminSessionCookie, verifyCsrfOrigin } from '@/lib/adminAuth'

export async function POST(request: NextRequest) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: '不正なリクエスト元です' }, { status: 403 })
  }
  const response = NextResponse.json({ ok: true })
  clearAdminSessionCookie(response)
  return response
}
