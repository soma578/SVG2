/**
 * Service Worker - PMTilesタイルキャッシュ
 * 福祉施設PMTilesをキャッシュしてオフライン対応
 */

const CACHE_VERSION = 'v1'
const CACHE_NAME = `svgmap-disaster-${CACHE_VERSION}`

// キャッシュ対象ファイル
const STATIC_CACHE = [
  '/tiles/welfare_optimized.pmtiles',
  // 他の静的ファイルも追加可能
  // '/tiles/shelters.geojson',
  // '/tiles/landslide.geojson',
]

// インストール時: 静的ファイルをキャッシュ
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static files')
      return cache.addAll(STATIC_CACHE)
    })
  )
  self.skipWaiting() // 即座にアクティブ化
})

// アクティベーション時: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim() // 即座に制御を開始
})

// フェッチ時: キャッシュファーストストラテジー
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // PMTilesファイルはキャッシュファースト
  if (url.pathname.includes('/tiles/welfare_optimized.pmtiles')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          console.log('[SW] Cache hit:', url.pathname)
          return response
        }
        console.log('[SW] Fetching and caching:', url.pathname)
        return fetch(event.request).then((response) => {
          // レスポンスをキャッシュに保存
          if (response && response.status === 200) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone)
            })
          }
          return response
        })
      })
    )
    return
  }

  // その他のリクエスト: ネットワークファースト
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request)
    })
  )
})

// バックグラウンド同期（将来の拡張用）
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-welfare-data') {
    event.waitUntil(
      // データ同期処理
      console.log('[SW] Background sync: welfare-data')
    )
  }
})
