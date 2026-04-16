import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { setAdminSessionCookie, verifyCsrfOrigin, warnIfDefaultCredentials } from '@/lib/adminAuth'

// モジュール読み込み時に一度だけ警告を出す
warnIfDefaultCredentials()

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    // 長さが異なっても一定時間かける
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length))
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

/** 直近のログイン試行を記録するシンプルなレートリミッター */
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000 // 15分

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= MAX_ATTEMPTS
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json({ ok: false, error: '不正なリクエスト元です' }, { status: 403 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { ok: false, error: 'ログイン試行回数が上限を超えました。しばらくしてから再試行してください。' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const username = String(body?.username || '')
    const password = String(body?.password || '')

    const expectedUsername = process.env.ADMIN_USERNAME || 'admin'
    const expectedPassword = process.env.ADMIN_PASSWORD || 'admin'

    const usernameMatch = constantTimeEqual(username, expectedUsername)
    const passwordMatch = constantTimeEqual(password, expectedPassword)

    if (usernameMatch && passwordMatch) {
      const response = NextResponse.json({ ok: true })
      setAdminSessionCookie(response, username)
      return response
    }

    return NextResponse.json(
      { ok: false, error: 'ユーザー名またはパスワードが正しくありません' },
      { status: 401 }
    )
  } catch (error) {
    console.error('[api/admin/login] failed:', error)
    return NextResponse.json({ ok: false, error: 'ログインに失敗しました' }, { status: 500 })
  }
}
