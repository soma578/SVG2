/**
 * 停電情報のキャッシュ機構（VercelKV版）
 *
 * サーバーレス環境でも機能する永続キャッシュ。
 * VercelKVがない場合はメモリキャッシュにフォールバック（開発用）。
 */

import { kv } from '@vercel/kv'

export interface OutageData {
  prefecture: string
  city: string
  ward?: string
  district: string
  households: number
  timestamp: string
  cause: string
  status: 'ongoing' | 'recovered'
  recovered_at?: string
}

interface CacheEntry {
  data: OutageData[]
  timestamp: number
  expiresAt: number
}

// フォールバック用メモリキャッシュ（ローカル開発のみ）
const memoryCache = new Map<string, CacheEntry>()

// キャッシュの有効期間（ミリ秒）
const CACHE_DURATION = parseInt(process.env.OUTAGE_CACHE_DURATION || '300000', 10) // 5分

// VercelKVが使えるかチェック
const isKVAvailable = (): boolean => {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

/**
 * キャッシュキーを生成
 */
function getCacheKey(date: string, type: string): string {
  return `outage:${date}:${type}`
}

/**
 * キャッシュからデータを取得（VercelKV版）
 */
export async function getFromCache(date: string, type: string = ''): Promise<OutageData[] | null> {
  const key = getCacheKey(date, type)
  const now = Date.now()

  try {
    if (isKVAvailable()) {
      // VercelKV使用
      const entry = await kv.get<CacheEntry>(key)

      if (!entry) {
        console.log(`[OutageCacheKV] Cache miss for ${key}`)
        return null
      }

      // キャッシュが期限切れかチェック
      if (now > entry.expiresAt) {
        await kv.del(key)
        console.log(`[OutageCacheKV] Cache expired for ${key}`)
        return null
      }

      console.log(`[OutageCacheKV] Cache hit for ${key} (${Math.round((entry.expiresAt - now) / 1000)}s remaining)`)
      return entry.data
    } else {
      // フォールバック: メモリキャッシュ（開発環境用）
      console.warn('[OutageCacheKV] VercelKV not available, using memory cache (will not work in serverless)')
      const entry = memoryCache.get(key)

      if (!entry) {
        return null
      }

      if (now > entry.expiresAt) {
        memoryCache.delete(key)
        return null
      }

      console.log(`[OutageCacheKV] Memory cache hit for ${key}`)
      return entry.data
    }
  } catch (error) {
    console.error('[OutageCacheKV] Error reading cache:', error)
    return null
  }
}

/**
 * キャッシュにデータを保存（VercelKV版）
 */
export async function saveToCache(date: string, type: string = '', data: OutageData[]): Promise<void> {
  const key = getCacheKey(date, type)
  const now = Date.now()

  const entry: CacheEntry = {
    data,
    timestamp: now,
    expiresAt: now + CACHE_DURATION
  }

  try {
    if (isKVAvailable()) {
      // VercelKVに保存（TTL付き）
      const ttlSeconds = Math.ceil(CACHE_DURATION / 1000)
      await kv.set(key, entry, { ex: ttlSeconds })
      console.log(`[OutageCacheKV] Cached ${data.length} outages for ${key} in VercelKV (expires in ${ttlSeconds}s)`)
    } else {
      // フォールバック: メモリキャッシュ
      memoryCache.set(key, entry)
      console.log(`[OutageCacheKV] Cached ${data.length} outages for ${key} in memory (development only)`)
    }
  } catch (error) {
    console.error('[OutageCacheKV] Error saving cache:', error)
  }
}

/**
 * キャッシュをクリア（テスト用）
 */
export async function clearCache(): Promise<void> {
  try {
    if (isKVAvailable()) {
      // VercelKVのoutage:*をすべて削除
      // 注: scan/deleteはコストがかかるので本番では使わない
      console.log('[OutageCacheKV] Manual cache clear requested')
    } else {
      memoryCache.clear()
      console.log('[OutageCacheKV] Memory cache cleared')
    }
  } catch (error) {
    console.error('[OutageCacheKV] Error clearing cache:', error)
  }
}

/**
 * キャッシュ統計情報を取得
 */
export async function getCacheStats() {
  if (isKVAvailable()) {
    return {
      backend: 'VercelKV',
      available: true,
      cacheDurationSeconds: CACHE_DURATION / 1000
    }
  } else {
    return {
      backend: 'Memory (development)',
      available: false,
      totalEntries: memoryCache.size,
      cacheDurationSeconds: CACHE_DURATION / 1000,
      warning: 'Memory cache will not work in serverless environments'
    }
  }
}
