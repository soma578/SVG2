/**
 * レート制限（DoS対策）
 *
 * VercelKVを使ったシンプルなレート制限。
 * IPアドレスごとにリクエスト数をカウントし、制限を超えたら拒否。
 */

import { kv } from '@vercel/kv'

// メモリフォールバック（開発用）
const memoryStore = new Map<string, { count: number; resetAt: number }>()

// レート制限の設定
const RATE_LIMIT_WINDOW = 60 * 1000 // 1分間
const RATE_LIMIT_MAX_REQUESTS = 10 // 1分間に10リクエストまで

interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

/**
 * VercelKVが使えるかチェック
 */
const isKVAvailable = (): boolean => {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

/**
 * IPアドレスを取得
 */
export function getClientIP(request: Request): string {
  // Vercelの場合
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  // その他の環境
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // フォールバック
  return 'unknown'
}

/**
 * レート制限をチェック
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const now = Date.now()
  const key = `ratelimit:${identifier}`

  try {
    if (isKVAvailable()) {
      // VercelKV使用
      const current = await kv.get<number>(key)

      if (current === null) {
        // 初回リクエスト
        await kv.set(key, 1, { px: RATE_LIMIT_WINDOW })
        return {
          success: true,
          limit: RATE_LIMIT_MAX_REQUESTS,
          remaining: RATE_LIMIT_MAX_REQUESTS - 1,
          reset: now + RATE_LIMIT_WINDOW
        }
      }

      if (current >= RATE_LIMIT_MAX_REQUESTS) {
        // 制限超過
        const ttl = await kv.pttl(key)
        return {
          success: false,
          limit: RATE_LIMIT_MAX_REQUESTS,
          remaining: 0,
          reset: now + (ttl || RATE_LIMIT_WINDOW)
        }
      }

      // カウント増加
      await kv.incr(key)

      return {
        success: true,
        limit: RATE_LIMIT_MAX_REQUESTS,
        remaining: RATE_LIMIT_MAX_REQUESTS - current - 1,
        reset: now + RATE_LIMIT_WINDOW
      }
    } else {
      // メモリフォールバック（開発環境）
      console.warn('[RateLimit] Using memory store (development only)')

      const entry = memoryStore.get(key)

      if (!entry || now > entry.resetAt) {
        // 新しいウィンドウ
        memoryStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
        return {
          success: true,
          limit: RATE_LIMIT_MAX_REQUESTS,
          remaining: RATE_LIMIT_MAX_REQUESTS - 1,
          reset: now + RATE_LIMIT_WINDOW
        }
      }

      if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
        // 制限超過
        return {
          success: false,
          limit: RATE_LIMIT_MAX_REQUESTS,
          remaining: 0,
          reset: entry.resetAt
        }
      }

      // カウント増加
      entry.count++

      return {
        success: true,
        limit: RATE_LIMIT_MAX_REQUESTS,
        remaining: RATE_LIMIT_MAX_REQUESTS - entry.count,
        reset: entry.resetAt
      }
    }
  } catch (error) {
    console.error('[RateLimit] Error:', error)
    // エラー時は許可（フェイルオープン）
    return {
      success: true,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: RATE_LIMIT_MAX_REQUESTS,
      reset: now + RATE_LIMIT_WINDOW
    }
  }
}

/**
 * レート制限のレスポンスヘッダーを設定
 */
export function setRateLimitHeaders(headers: Headers, result: RateLimitResult): void {
  headers.set('X-RateLimit-Limit', result.limit.toString())
  headers.set('X-RateLimit-Remaining', result.remaining.toString())
  headers.set('X-RateLimit-Reset', result.reset.toString())
}
