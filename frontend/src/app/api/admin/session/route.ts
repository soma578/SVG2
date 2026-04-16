import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/adminAuth'

export async function GET(request: NextRequest) {
  const session = getAdminSession(request)
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({
    authenticated: true,
    username: session.sub,
    expiresAt: session.exp,
  })
}
