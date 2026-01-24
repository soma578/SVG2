/**
 * 停電情報のキャッシュ機構
 *
 * 中国電力のサーバーへの負荷を減らすため、取得したデータを一定時間キャッシュします。
 * これにより、同じデータを何度もスクレイピングすることを防ぎます。
 */

interface OutageData {
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

// メモリ内キャッシュ（サーバーサイドで共有される）
const cache = new Map<string, CacheEntry>()

// キャッシュの有効期間（ミリ秒）
// デフォルト: 5分（停電情報は頻繁に変わらないため）
const CACHE_DURATION = parseInt(process.env.OUTAGE_CACHE_DURATION || '300000', 10)

// 最大キャッシュエントリ数（メモリ節約）
const MAX_CACHE_ENTRIES = 50

/**
 * キャッシュキーを生成
 */
function getCacheKey(date: string, type: string): string {
  return `outage:${date}:${type}`
}

/**
 * キャッシュからデータを取得
 */
export function getFromCache(date: string, type: string = ''): OutageData[] | null {
  const key = getCacheKey(date, type)
  const entry = cache.get(key)

  if (!entry) {
    return null
  }

  const now = Date.now()

  // キャッシュが期限切れかチェック
  if (now > entry.expiresAt) {
    cache.delete(key)
    console.log(`[OutageCache] Cache expired for ${key}`)
    return null
  }

  console.log(`[OutageCache] Cache hit for ${key} (${Math.round((entry.expiresAt - now) / 1000)}s remaining)`)
  return entry.data
}

/**
 * キャッシュにデータを保存
 */
export function saveToCache(date: string, type: string = '', data: OutageData[]): void {
  const key = getCacheKey(date, type)
  const now = Date.now()

  const entry: CacheEntry = {
    data,
    timestamp: now,
    expiresAt: now + CACHE_DURATION
  }

  cache.set(key, entry)
  console.log(`[OutageCache] Cached ${data.length} outages for ${key} (expires in ${CACHE_DURATION / 1000}s)`)

  // 古いキャッシュエントリを削除（メモリリーク防止）
  if (cache.size > MAX_CACHE_ENTRIES) {
    cleanupOldEntries()
  }
}

/**
 * 古いキャッシュエントリを削除
 */
function cleanupOldEntries(): void {
  const now = Date.now()
  let deletedCount = 0

  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key)
      deletedCount++
    }
  }

  console.log(`[OutageCache] Cleaned up ${deletedCount} expired entries`)

  // まだ多すぎる場合は、最も古いものから削除
  if (cache.size > MAX_CACHE_ENTRIES) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)

    const toDelete = entries.slice(0, cache.size - MAX_CACHE_ENTRIES)
    for (const [key] of toDelete) {
      cache.delete(key)
      deletedCount++
    }

    console.log(`[OutageCache] Deleted ${toDelete.length} oldest entries`)
  }
}

/**
 * キャッシュをクリア（テスト用）
 */
export function clearCache(): void {
  cache.clear()
  console.log('[OutageCache] Cache cleared')
}

/**
 * キャッシュ統計情報を取得
 */
export function getCacheStats() {
  const now = Date.now()
  const entries = Array.from(cache.values())

  return {
    totalEntries: cache.size,
    validEntries: entries.filter(e => now <= e.expiresAt).length,
    expiredEntries: entries.filter(e => now > e.expiresAt).length,
    oldestTimestamp: entries.length > 0
      ? Math.min(...entries.map(e => e.timestamp))
      : null,
    cacheDurationSeconds: CACHE_DURATION / 1000
  }
}
