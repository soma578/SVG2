import { NextRequest, NextResponse } from 'next/server'

/**
 * グローバルレートリミッター（インメモリ・スライディングウィンドウ）
 *
 * - /api/* への全リクエストを対象にする
 * - IP 単位でウィンドウ内のリクエスト数を計測
 * - 静的ファイルやページは対象外
 */

type RateLimitEntry = {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// 設定
const API_WINDOW_MS = 60 * 1000       // 1分
const API_MAX_REQUESTS = 120           // /api/* 全体: 1分120リクエスト
const SEARCH_WINDOW_MS = 60 * 1000
const SEARCH_MAX_REQUESTS = 60         // 検索・データ取得: 1分60リクエスト
const USER_SEARCH_WINDOW_MS = 60 * 1000
const USER_SEARCH_MAX_REQUESTS = 40    // ユーザー検索: 1分40リクエスト
const UPLOAD_WINDOW_MS = 60 * 1000
const UPLOAD_MAX_REQUESTS = 5          // アップロード: 1分5リクエスト

// 古いエントリの掃除（5分ごと）
let lastCleanup = Date.now()
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key)
    }
  }
}

function checkLimit(key: string, windowMs: number, maxRequests: number): {
  allowed: boolean
  remaining: number
  resetAt: number
} {
  cleanup()
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs
    rateLimitStore.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: maxRequests - 1, resetAt }
  }

  entry.count++
  const remaining = Math.max(0, maxRequests - entry.count)
  return { allowed: entry.count <= maxRequests, remaining, resetAt: entry.resetAt }
}

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)
  return NextResponse.json(
    { error: 'リクエスト回数の上限に達しました。しばらくしてから再試行してください。' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, retryAfter)),
      },
    }
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /api/* 以外はスキップ
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const ip = getClientIp(request)

  // アップロード（最も厳しい制限）
  if (pathname.startsWith('/api/admin/datasets/upload')) {
    const result = checkLimit(`upload:${ip}`, UPLOAD_WINDOW_MS, UPLOAD_MAX_REQUESTS)
    if (!result.allowed) return rateLimitResponse(result.resetAt)
  }

  // ユーザー検索（専用バケット）
  if (pathname === '/api/search') {
    const result = checkLimit(`user-search:${ip}`, USER_SEARCH_WINDOW_MS, USER_SEARCH_MAX_REQUESTS)
    if (!result.allowed) return rateLimitResponse(result.resetAt)
  }

  // データ取得系
  if (pathname === '/api/shelters' || pathname === '/api/team-activity') {
    const result = checkLimit(`search:${ip}`, SEARCH_WINDOW_MS, SEARCH_MAX_REQUESTS)
    if (!result.allowed) return rateLimitResponse(result.resetAt)
  }

  // /api/* 全体（緩い制限）
  const globalResult = checkLimit(`api:${ip}`, API_WINDOW_MS, API_MAX_REQUESTS)
  if (!globalResult.allowed) return rateLimitResponse(globalResult.resetAt)

  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Remaining', String(globalResult.remaining))
  return response
}

export const config = {
  matcher: '/api/:path*',
}
